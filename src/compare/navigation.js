/** Loading the two sites and keeping them on the same route. */
import { t } from '../shared/i18n.js';
import { $, frames, showStatus } from './dom.js';
import { alive, post } from './frames.js';
import { showStage } from './layout.js';
import { joinUrl, normalizeUrl, syncAddressSoon } from './link.js';
import { LAYERS, enabled, otherLayer, saveSoon, state, update } from './state.js';

// A site's own redirects right after it loads are not the user navigating.
const QUIET_AFTER_LOAD_MS = 1500;
// Neither is the navigation that a mirrored click causes in the other layer.
const QUIET_AFTER_MIRRORED_CLICK_MS = 3000;
// With mirroring on, the mirrored click may take the other layer to the route by itself.
const FOLLOW_DELAY_WHEN_MIRRORING_MS = 1000;
const LOAD_TIMEOUT_MS = 8000;

const currentUrl = { A: '', B: '' };
const liveBase = { A: '', B: '' }; // the base address after the site's redirects (http → https, www)
const quietUntil = { A: 0, B: 0 };

const baseOf = (layer) => state[`url${layer}`];

function setCaption(layer, text, tooltip = '') {
  const caption = $(`cur${layer}`);
  caption.textContent = text;
  caption.title = tooltip;
}

function expectLoad(layer) {
  alive[layer] = false;
  setCaption(layer, t('loading'));
}

let loadTimer;

function warnIfSilent() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    const silent = LAYERS.filter((layer) => baseOf(layer) && !alive[layer]);
    if (silent.length) showStatus(t('notResponding', silent.join(' & ')), { warn: true });
  }, LOAD_TIMEOUT_MS);
}

export function loadComparison(urlA, urlB, route) {
  update({ urlA: normalizeUrl(urlA), urlB: normalizeUrl(urlB), route: route.trim() });
  // A comparison opened from a link is in the state already, but neither saved nor final in the address.
  saveSoon();
  syncAddressSoon();
  for (const layer of LAYERS) {
    if (!baseOf(layer)) continue;
    expectLoad(layer);
    frames[layer].src = joinUrl(baseOf(layer), state.route);
    showStage();
  }
  warnIfSilent();
}

/** Reloads what each frame shows now, which may differ from the address fields. */
export function reloadComparison() {
  for (const layer of LAYERS) {
    if (!baseOf(layer)) continue;
    if (alive[layer]) post(layer, { type: 'reload' });
    else frames[layer].src = joinUrl(baseOf(layer), state.route);
    expectLoad(layer);
  }
  warnIfSilent();
}

function learnBase(layer, href) {
  const url = new URL(href);
  const basePath = URL.parse(baseOf(layer))?.pathname.replace(/\/+$/, '') ?? '';
  liveBase[layer] = url.origin + (url.pathname.startsWith(basePath) ? basePath : '');
}

/** The path of `href` relative to the layer's base, or null when it is outside the base. */
function routeOf(layer, href) {
  const base = liveBase[layer];
  if (!base || !href.startsWith(base)) return null;
  const rest = href.slice(base.length);
  if (rest && !/^[/?#]/.test(rest)) return null;
  return rest.startsWith('/') ? rest : `/${rest}`;
}

let followTimer;

function follow(from, href) {
  const other = otherLayer(from);
  const route = routeOf(from, href);
  if (route === null) {
    showStatus(t('leftBase', from, other), { warn: true });
    return;
  }
  clearTimeout(followTimer);
  followTimer = setTimeout(
    () => {
      update({ route });
      if (!baseOf(other) || routeOf(other, currentUrl[other]) === route) return;
      expectLoad(other);
      frames[other].src = joinUrl(baseOf(other), route);
      warnIfSilent();
    },
    enabled.mirrorClicks() ? FOLLOW_DELAY_WHEN_MIRRORING_MS : 0,
  );
}

/** A frame reports its address when it loads and on every navigation after that, SPA ones included. */
export function handleLocation(layer, href) {
  const justLoaded = !alive[layer];
  alive[layer] = true;
  currentUrl[layer] = href;
  setCaption(layer, href, href);
  if (justLoaded) {
    learnBase(layer, href);
    quietUntil[layer] = performance.now() + QUIET_AFTER_LOAD_MS;
  } else if (enabled.followRoute() && performance.now() >= quietUntil[layer]) {
    follow(layer, href);
  }
}

export function expectMirroredNavigation(layer) {
  quietUntil[layer] = performance.now() + QUIET_AFTER_MIRRORED_CLICK_MS;
}
