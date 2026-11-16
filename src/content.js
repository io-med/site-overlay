/**
 * Runs in every frame, but does something only in a site frame placed directly inside this
 * extension's comparison page. There it reports what the user does and repeats what the user
 * did in the other site.
 *
 * It talks to the comparison page over a chrome.runtime port.
 *
 * To the page:
 *   location  { href }                       on load and on every navigation, SPA ones included
 *   activity                                 something may have changed on screen
 *   scroll    { selector, x, y, ratio }      selector is null for the page's main scroller
 *   hover     { x, y } / hoverEnd            the mouse moved / left the frame
 *   click     { target }                     target describes the clicked element
 *   input     { field, value }               field describes the edited form field
 *   hotkey    { code }                       one of the Alt shortcuts the page asked for
 *   mirrored  { matchedBy }                  result of a click or input command; no matchedBy = not found
 *
 * From the page:
 *   identify  { token }                      echo the token through window.postMessage
 *   config    { config }                     which actions to report; the first one opens the channel
 *   scrollTo, hover, hoverEnd, click, input  repeat the other site's action
 *   reload
 */
(() => {
  if (window.top === window || window.parent !== window.top) return;
  const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;
  if (location.ancestorOrigins?.[0] !== EXTENSION_ORIGIN) return;

  const PORT_NAME = 'site-overlay-frame';
  const HOVER_ATTRIBUTE = 'data-ovl-hover';
  const CLICKABLE =
    'a,button,[role=button],[role=tab],[role=menuitem],input[type=submit],input[type=button],label,summary,[onclick]';
  const MAX_TEXT_LENGTH = 80; // longer text is content, not a control's name
  const LABEL_SCOPE_DEPTH = 3; // how many ancestors up a label may be from its buttons
  const MAX_LABEL_GROUP = 30;
  const SELECTOR_MATCH_RADIUS = 150; // px
  const SCROLL_ECHO_MS = 150;
  const CACHE_MS = 1000;

  const config = { mirrorClicks: false, mirrorHover: false, mirrorInput: false, hotkeys: [] };

  let port = chrome.runtime.connect({ name: PORT_NAME });
  port.onDisconnect.addListener(() => (port = null)); // the tab was closed or the extension reloaded
  const send = (type, data) => port?.postMessage({ type, ...data });

  // ---------- Elements ----------

  const collapseSpaces = (text) => (text ?? '').replace(/\s+/g, ' ').trim();
  const FIELD_TYPES = [HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement];
  const isField = (el) => FIELD_TYPES.some((type) => el instanceof type);
  const isVisible = (el) =>
    el.getClientRects().length > 0 && el.checkVisibility({ visibilityProperty: true });
  const centreOf = (el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const distanceTo = (el, x, y) => {
    const centre = centreOf(el);
    return Math.hypot(centre.x - x, centre.y - y);
  };
  // A selector built on the other site may not even parse here (namespaced tags, for one).
  const queryOrNull = (selector) => {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  };

  function cssPath(el) {
    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      if (node.id) {
        const byId = `#${CSS.escape(node.id)}`;
        if (document.querySelectorAll(byId).length === 1) {
          parts.unshift(byId);
          break;
        }
      }
      const twins = node.parentElement
        ? [...node.parentElement.children].filter((child) => child.localName === node.localName)
        : [];
      parts.unshift(
        twins.length > 1 ? `${node.localName}:nth-of-type(${twins.indexOf(node) + 1})` : node.localName,
      );
    }
    return parts.join(' > ');
  }

  /** The visible candidate nearest to the point; hidden ones only when none is visible. */
  function nearest(candidates, x, y) {
    const visible = candidates.filter(isVisible);
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of visible.length ? visible : candidates) {
      const distance = distanceTo(candidate, x, y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  // ---------- Finding the same control on the other site ----------

  const controlText = (el) => collapseSpaces(el.innerText || el.value || el.getAttribute('aria-label'));

  /** A link inside the site is compared by path (A and B have different domains), an outside one by full URL. */
  function linkKey(href) {
    const url = URL.parse(href, location.href);
    if (!url) return null;
    return url.origin === location.origin ? url.pathname + url.search + url.hash : url.href;
  }

  // Matching by label. In "Font size: A A A" one site has <button aria-label>, the other a bare
  // div[role=button] with no text of its own. What they share is the label before the buttons
  // and the order of the buttons after it.

  const trimPunctuation = (text) => collapseSpaces(text).replace(/^[\s:;,.—–-]+|[\s:;,.—–-]+$/g, '');
  const ownText = (control) => {
    const text = trimPunctuation(control.textContent);
    return text.length <= MAX_TEXT_LENGTH ? text : null;
  };
  const NON_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  /** Text nodes and controls in document order, hidden ones too: a menu is often closed. */
  function textAndControls() {
    const items = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(CLICKABLE)) items.push({ control: node });
      } else if (!NON_TEXT_PARENTS.has(node.parentElement?.tagName)) {
        const text = trimPunctuation(node.data);
        if (text) items.push({ node, text });
      }
    }
    return items;
  }

  /** Controls with the given own text that follow the label at `labelAt`, up to the next free text. */
  function controlsAfterLabel(items, labelAt, text) {
    const label = items[labelAt].node;
    const group = [];
    for (let i = labelAt + 1; i < items.length && group.length < MAX_LABEL_GROUP; i++) {
      const { control, node } = items[i];
      if (control) {
        if (ownText(control) === text && !group.some((member) => member.contains(control)))
          group.push(control);
        continue;
      }
      const owner = node.parentElement.closest(CLICKABLE);
      if (!owner || owner.contains(label)) break; // text outside any control ends the group
    }
    return group;
  }

  function describeByLabel(el) {
    if (!el.matches(CLICKABLE)) return null;
    const text = ownText(el);
    const items = textAndControls();
    const at = items.findIndex((item) => item.control === el);
    if (at < 0 || text === null) return null;

    // The label has to be next to the control, not somewhere further up the page.
    let scope = el;
    for (
      let i = 0;
      i < LABEL_SCOPE_DEPTH && scope.parentElement && scope.parentElement !== document.body;
      i++
    ) {
      scope = scope.parentElement;
    }

    for (let i = at - 1; i >= 0; i--) {
      const item = items[i];
      if (!scope.contains(item.node ?? item.control)) return null;
      if (!item.text || item.text === text) continue;
      const owner = item.node.parentElement.closest(CLICKABLE);
      if (owner && !owner.contains(el)) continue; // the text of a neighbouring control
      if (item.text.length > MAX_TEXT_LENGTH) return null;

      const sameLabels = items.filter((other) => other.text === item.text);
      const group = controlsAfterLabel(items, i, text);
      return {
        label: item.text,
        labelIndex: sameLabels.indexOf(item),
        labelCount: sameLabels.length,
        ownText: text,
        index: group.indexOf(el),
        count: group.length,
      };
    }
    return null;
  }

  function findByLabel(target) {
    if (!target.label) return null;
    const items = textAndControls();
    const labelsAt = [];
    items.forEach((item, i) => item.text === target.label && labelsAt.push(i));
    // With the same number of such labels on both sites, try the one in the same place first.
    const order =
      labelsAt.length === target.labelCount ? [labelsAt[target.labelIndex], ...labelsAt] : labelsAt;
    for (const at of order) {
      const group = controlsAfterLabel(items, at, target.ownText);
      if (!group.length) continue;
      const sameShape = group.length === target.count && target.index >= 0;
      return sameShape ? group[target.index] : nearest(group, target.x, target.y);
    }
    return null;
  }

  function describeTarget(event) {
    const el = event.target.closest(CLICKABLE) ?? event.target;
    const text = controlText(el);
    const href = el.getAttribute('href');
    return {
      selector: cssPath(el),
      tag: el.localName,
      clickable: el.matches(CLICKABLE),
      text: text.length <= MAX_TEXT_LENGTH ? text : '',
      href: href && linkKey(href),
      x: event.clientX,
      y: event.clientY,
      ...describeByLabel(el),
    };
  }

  /** Returns { el, matchedBy } for a target described on the other site, or null. */
  function findTarget(target) {
    const { x, y } = target;

    // 1. The same text. Among controls the tag is ignored: a <button> on one platform is
    //    often a div[role=button] on the other.
    let ambiguous = null;
    if (target.text) {
      const pool = document.querySelectorAll(target.clickable ? CLICKABLE : target.tag);
      const matches = [...pool].filter((el) => controlText(el) === target.text);
      if (matches.length === 1 || matches.filter(isVisible).length === 1) {
        return { el: nearest(matches, x, y), matchedBy: 'text' };
      }
      if (matches.length) ambiguous = nearest(matches, x, y);
    }

    // 2. The label next to it and the position after the label: for different markup
    //    and for several controls with the same text.
    const labelled = findByLabel(target);
    if (labelled) return { el: labelled, matchedBy: 'label' };
    if (ambiguous) return { el: ambiguous, matchedBy: 'text' };

    // 3. The same link address.
    if (target.tag === 'a' && target.href) {
      const links = [...document.querySelectorAll('a[href]')].filter(
        (link) => linkKey(link.getAttribute('href')) === target.href,
      );
      if (links.length) return { el: nearest(links, x, y), matchedBy: 'href' };
    }

    // 4. The same CSS path. Across platforms a path often leads to an unrelated block,
    //    so a visible element far from the click is not accepted.
    const bySelector = queryOrNull(target.selector);
    if (bySelector && (!isVisible(bySelector) || distanceTo(bySelector, x, y) < SELECTOR_MATCH_RADIUS)) {
      return { el: bySelector, matchedBy: 'selector' };
    }

    // 5. Whatever is at the same point.
    const atPoint = document.elementFromPoint(x, y);
    return atPoint && { el: atPoint, matchedBy: 'point' };
  }

  /** name and placeholder survive a platform change better than a CSS path does. */
  function findField(field) {
    for (const attribute of ['name', 'placeholder']) {
      if (!field[attribute]) continue;
      const selector = `[${attribute}="${CSS.escape(field[attribute])}"]`;
      const matches = [...document.querySelectorAll(selector)].filter(isField);
      if (matches.length) return nearest(matches, field.x, field.y);
    }
    const bySelector = queryOrNull(field.selector);
    return isField(bySelector) ? bySelector : null;
  }

  // ---------- Repeating an action ----------

  const mouseEventInit = (x, y) => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
  });

  function click(el, fallbackX, fallbackY) {
    const rect = el.getBoundingClientRect();
    const init = {
      ...mouseEventInit(
        rect.width ? rect.left + rect.width / 2 : fallbackX,
        rect.height ? rect.top + rect.height / 2 : fallbackY,
      ),
      button: 0,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    el.dispatchEvent(new PointerEvent('pointerup', init));
    el.dispatchEvent(new MouseEvent('mouseup', init));
    el.click();
  }

  /** Sets the value with the native setter, past the one React puts on the element, then tells the page. */
  function setValue(field, value) {
    const { prototype } = FIELD_TYPES.find((type) => field instanceof type);
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- Hover ----------
  // A script cannot switch on the real :hover. Instead, every rule with :hover is copied with
  // [data-ovl-hover] in its place, and the attribute is set on the element under the point
  // and on its ancestors. Mouse events are dispatched too, for menus opened by JavaScript.

  let hoverSheet = null; // the <style> with the copied rules
  let hoverSheetSignature = '';
  let hoverSheetCheckedAt = 0;
  let hovered = null;
  let hoveredChain = new Set(); // hovered and its ancestors

  /** Splits a selector list on top-level commas, not the ones inside :is(a, b). */
  function splitSelectorList(selectorText) {
    const selectors = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selectorText.length; i++) {
      const char = selectorText[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        selectors.push(selectorText.slice(start, i));
        start = i + 1;
      }
    }
    selectors.push(selectorText.slice(start));
    return selectors;
  }

  function copyHoverRules(rules, out) {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        if (!rule.selectorText.includes(':hover')) continue;
        const selectors = splitSelectorList(rule.selectorText)
          .filter((selector) => selector.includes(':hover'))
          .map((selector) => selector.replace(/:hover\b/g, `[${HOVER_ATTRIBUTE}]`));
        out.push(`${selectors.join(',')}{${rule.style.cssText}}`);
      } else if (rule.cssRules) {
        // @media, @supports, @layer, @container: keep the condition around the copies
        const inner = [];
        copyHoverRules(rule.cssRules, inner);
        if (inner.length) out.push(`${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${inner.join('')}}`);
      }
    }
  }

  /**
   * Sites add styles as they go (SPAs, CSS-in-JS), so the copy is rebuilt when the number of
   * rules changes; checked at most once a second. Style sheets from other origins cannot be read.
   */
  function refreshHoverSheet() {
    const now = performance.now();
    if (now - hoverSheetCheckedAt < CACHE_MS) return;
    hoverSheetCheckedAt = now;

    const readable = [];
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode === hoverSheet) continue;
      try {
        readable.push(sheet.cssRules);
      } catch {
        // cross-origin style sheet
      }
    }
    const signature = readable.map((rules) => rules.length).join();
    if (signature === hoverSheetSignature && hoverSheet?.isConnected) return;
    hoverSheetSignature = signature;

    const copies = [];
    for (const rules of readable) copyHoverRules(rules, copies);
    if (!hoverSheet?.isConnected) {
      hoverSheet = document.createElement('style');
      document.documentElement.append(hoverSheet);
    }
    hoverSheet.textContent = copies.join('\n');
  }

  function moveHover(x, y) {
    setHovered(document.elementFromPoint(x, y), x, y);
  }

  function endHover() {
    if (hovered) setHovered(null, 0, 0);
  }

  function setHovered(el, x, y) {
    const init = { ...mouseEventInit(x, y), pointerType: 'mouse', isPrimary: true };
    const fire = (target, kind, relatedTarget, bubbles = true) => {
      target.dispatchEvent(new PointerEvent(`pointer${kind}`, { ...init, bubbles, relatedTarget }));
      target.dispatchEvent(new MouseEvent(`mouse${kind}`, { ...init, bubbles, relatedTarget }));
    };

    if (el !== hovered) {
      const previous = hovered;
      const chain = new Set();
      for (let node = el; node; node = node.parentElement) chain.add(node);

      if (previous?.isConnected) fire(previous, 'out', el);
      for (const node of hoveredChain) {
        if (chain.has(node)) continue;
        node.removeAttribute(HOVER_ATTRIBUTE);
        if (node.isConnected) fire(node, 'leave', el, false);
      }
      if (el) {
        refreshHoverSheet();
        fire(el, 'over', previous);
        // enter events go from the outermost element in, like the real ones
        for (const node of [...chain].reverse()) {
          if (hoveredChain.has(node)) continue;
          node.setAttribute(HOVER_ATTRIBUTE, '');
          fire(node, 'enter', previous, false);
        }
      }
      hovered = el;
      hoveredChain = chain;
      send('activity');
    }
    if (el) fire(el, 'move', null);
  }

  // ---------- Scrolling: the page, or a container inside it ----------

  const pageScroller = () => document.scrollingElement ?? document.documentElement;

  function isScrollable(el) {
    if (el.scrollHeight - el.clientHeight < 2) return false;
    return ['auto', 'scroll', 'overlay'].includes(getComputedStyle(el).overflowY);
  }

  /** The page itself when it scrolls, otherwise the largest scrollable block (app shells). */
  function findMainScroller() {
    const page = pageScroller();
    const locked = [document.body, document.documentElement].some(
      (el) => getComputedStyle(el).overflowY === 'hidden',
    );
    if (page.scrollHeight - window.innerHeight > 2 && !locked) return page;

    let largest = null;
    let largestArea = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.clientHeight < window.innerHeight * 0.4 || !isScrollable(el)) continue;
      const area = el.clientWidth * el.clientHeight;
      if (area > largestArea) {
        largestArea = area;
        largest = el;
      }
    }
    return largest ?? page;
  }

  // Both lookups walk the DOM, and scroll events arrive every frame.
  function cached(compute) {
    let key;
    let value;
    let at = -Infinity;
    return (arg) => {
      const now = performance.now();
      if (arg !== key || now - at > CACHE_MS || value?.isConnected === false) {
        key = arg;
        value = compute(arg);
        at = now;
      }
      return value;
    };
  }
  const mainScroller = cached(findMainScroller);
  const scrollerPath = cached(cssPath);

  function scrollPosition(el) {
    const range = Math.max(1, el.scrollHeight - el.clientHeight);
    return { x: el.scrollLeft, y: el.scrollTop, ratio: el.scrollTop / range };
  }

  let ignoreScrollUntil = 0; // our own scrollTo comes back as a scroll event
  let scrollFrame = 0;
  let scrolledElement = null;

  document.addEventListener(
    'scroll',
    (event) => {
      if (performance.now() < ignoreScrollUntil) return;
      const target = event.target;
      const isPage = target === document || target === document.documentElement || target === document.body;
      scrolledElement = isPage ? pageScroller() : target;
      scrollFrame ||= requestAnimationFrame(() => {
        scrollFrame = 0;
        const el = scrolledElement;
        const isMain = el === pageScroller() || el === mainScroller();
        send('scroll', { selector: isMain ? null : scrollerPath(el), ...scrollPosition(el) });
      });
    },
    { capture: true, passive: true },
  );

  function scrollTo({ selector, x, y, ratio, byRatio }) {
    const el = selector ? queryOrNull(selector) : mainScroller();
    if (!el) return; // this site has no such container; leave the page alone
    ignoreScrollUntil = performance.now() + SCROLL_ECHO_MS;
    const top = byRatio ? ratio * Math.max(0, el.scrollHeight - el.clientHeight) : y;
    // In quirks mode only the window scrolls the page reliably.
    const scroller = el === pageScroller() ? window : el;
    scroller.scrollTo({ left: x, top, behavior: 'instant' });
  }

  // ---------- Reporting what the user does ----------

  // The browser repeats a click on a <label> on its control. Only the first goes to the mirror,
  // or a checkbox on the other site would toggle twice.
  let labelControl = null;

  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted) return;
      send('activity');
      if (!config.mirrorClicks) return;
      if (event.target === labelControl) {
        labelControl = null;
        return;
      }
      const control = event.target.closest('label')?.control;
      if (control && control !== event.target) {
        labelControl = control;
        setTimeout(() => (labelControl = null));
      }
      send('click', { target: describeTarget(event) });
    },
    true,
  );

  let hoverFrame = 0;
  let pointer = null;

  document.addEventListener(
    'pointermove',
    (event) => {
      if (!event.isTrusted || !config.mirrorHover || event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      hoverFrame ||= requestAnimationFrame(() => {
        hoverFrame = 0;
        send('hover', pointer);
      });
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'mouseout',
    (event) => {
      // no relatedTarget: the mouse left the frame, not just an element
      if (!event.isTrusted || !config.mirrorHover || event.relatedTarget) return;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      send('hoverEnd');
    },
    true,
  );

  document.addEventListener(
    'input',
    (event) => {
      const el = event.target;
      if (!event.isTrusted || !config.mirrorInput || !isField(el)) return;
      if (el.type === 'checkbox' || el.type === 'radio') return; // mirrored as clicks
      if (el.type === 'password' || el.type === 'file') return; // never passed to another site
      const field = { selector: cssPath(el), name: el.name, placeholder: el.placeholder, ...centreOf(el) };
      send('input', { field, value: el.value });
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (!event.altKey || !config.hotkeys.includes(event.code)) return;
      event.preventDefault();
      send('hotkey', { code: event.code });
    },
    true,
  );

  window.addEventListener('load', () => send('activity'));

  // ---------- The address, also when a single-page app changes it ----------

  let reportedHref = '';

  function reportLocation() {
    if (location.href === reportedHref) return;
    reportedHref = location.href;
    send('location', { href: reportedHref });
  }

  // ---------- Commands from the comparison page ----------

  let channelOpen = false;

  const commands = {
    identify({ token }) {
      // Only the extension page can read this; its source window tells the page which iframe we are.
      window.parent.postMessage({ siteOverlayToken: token }, EXTENSION_ORIGIN);
    },
    config({ config: next }) {
      Object.assign(config, next);
      if (!config.mirrorHover) endHover();
      if (channelOpen) return;
      channelOpen = true;
      reportLocation();
      window.navigation.addEventListener('currententrychange', reportLocation);
    },
    scrollTo,
    hover: ({ x, y }) => moveHover(x, y),
    hoverEnd: endHover,
    click({ target }) {
      const found = findTarget(target);
      if (found) click(found.el, target.x, target.y);
      send('mirrored', { matchedBy: found?.matchedBy });
    },
    input({ field, value }) {
      const el = findField(field);
      if (el) setValue(el, value);
      send('mirrored', { matchedBy: el ? 'input' : undefined });
    },
    reload: () => location.reload(),
  };

  port.onMessage.addListener((message) => commands[message.type]?.(message));
})();
