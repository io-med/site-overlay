import { localizePage, t } from '../shared/i18n.js';
import { loadSettings, onSettingsChanged } from '../shared/settings.js';
import { applySettings, bindControls, renderAddresses, renderControls } from './controls.js';
import { redrawMask, scheduleDiff } from './diff.js';
import { $, showStatus } from './dom.js';
import { allowFraming, connectFrames, post, postBoth, pushConfig } from './frames.js';
import { listenForHotkeys, runHotkey } from './hotkeys.js';
import { checkInstall } from './install.js';
import { layoutStage, placeCaptions } from './layout.js';
import { readLink, syncAddressSoon } from './link.js';
import { expectMirroredNavigation, handleLocation, loadComparison } from './navigation.js';
import { enabled, loadState, onStateChange, otherLayer, setSettings, state } from './state.js';

// How long the page must stay quiet before the difference is recomputed.
const DIFF_DELAY_MS = { load: 1200, activity: 800, scroll: 500, change: 300 };
// State keys that change what the screenshots would show.
const DIFF_KEYS = ['mode', 'width', 'fit', 'offX', 'offY', 'hideB'];
const LINK_HOLD_NOTE_MS = 30000;

// How the content script found the element for a mirrored action → message key.
const MATCHED_BY = {
  text: 'howText',
  label: 'howLabel',
  href: 'howHref',
  selector: 'howSelector',
  point: 'howPoint',
  input: 'howInput',
};

/** Messages from the content script of a site frame; see the protocol at the top of src/content.js. */
const fromFrame = {
  location(layer, { href }) {
    handleLocation(layer, href);
    scheduleDiff(DIFF_DELAY_MS.load);
  },
  activity() {
    scheduleDiff(DIFF_DELAY_MS.activity);
  },
  scroll(layer, message) {
    scheduleDiff(DIFF_DELAY_MS.scroll, { hide: true });
    if (!enabled.syncScroll()) return;
    post(otherLayer(layer), { ...message, type: 'scrollTo', byRatio: state.scrollMode === 'ratio' });
  },
  hover(layer, message) {
    if (enabled.mirrorHover()) post(otherLayer(layer), message);
  },
  hoverEnd(layer, message) {
    if (enabled.mirrorHover()) post(otherLayer(layer), message);
  },
  click(layer, message) {
    if (!enabled.mirrorClicks()) return;
    expectMirroredNavigation(otherLayer(layer));
    post(otherLayer(layer), message);
  },
  input(layer, message) {
    if (enabled.mirrorInput()) post(otherLayer(layer), message);
  },
  mirrored(layer, { matchedBy }) {
    if (matchedBy) showStatus(t('mirrored', layer, t(MATCHED_BY[matchedBy])));
    else showStatus(t('mirrorMissed', layer), { warn: true });
  },
  hotkey(layer, { code }) {
    runHotkey(code);
  },
};

function onStateChanged(changed) {
  renderControls(changed);
  layoutStage();
  syncAddressSoon();
  if (changed.has('mirror')) pushConfig();
  if (DIFF_KEYS.some((key) => changed.has(key))) scheduleDiff(DIFF_DELAY_MS.change, { hide: true });
  if (changed.has('tolerance')) redrawMask();
  // A layer that stops receiving the mouse can no longer end the hover it mirrored to the other one.
  if (changed.has('active') || changed.has('mode')) postBoth({ type: 'hoverEnd' });
}

function onSettingsUpdated(next) {
  setSettings(next);
  applySettings();
  renderControls();
  layoutStage();
  pushConfig();
  scheduleDiff(DIFF_DELAY_MS.change, { hide: true });
}

function watchViewport() {
  const viewport = $('viewport');
  viewport.addEventListener(
    'scroll',
    () => {
      placeCaptions();
      scheduleDiff(DIFF_DELAY_MS.scroll, { hide: true });
    },
    { passive: true },
  );
  new ResizeObserver(() => {
    layoutStage();
    scheduleDiff(DIFF_DELAY_MS.scroll, { hide: true });
  }).observe(viewport);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleDiff(DIFF_DELAY_MS.change);
  });
}

async function init() {
  localizePage();
  const [tab, settings] = await Promise.all([chrome.tabs.getCurrent(), loadSettings(), loadState()]);
  // The link is applied without saving: a comparison that was only opened, not loaded,
  // must not replace the saved one.
  const { patch, hold } = readLink();
  Object.assign(state, patch);
  setSettings(settings);

  bindControls();
  applySettings();
  renderAddresses();
  renderControls();
  layoutStage();

  onStateChange(onStateChanged);
  onSettingsChanged(onSettingsUpdated);
  watchViewport();
  listenForHotkeys();
  connectFrames(tab.id, (layer, message) => fromFrame[message.type]?.(layer, message));

  try {
    await allowFraming(tab.id);
  } catch (error) {
    showStatus(t('rulesFailed', error.message), { warn: true });
  }
  if (!(await checkInstall())) return; // the frames could not connect; the notice says what to do
  if (hold) showStatus(t('linkHold'), { warn: true, ms: LINK_HOLD_NOTE_MS });
  else if (state.urlA || state.urlB) loadComparison(state.urlA, state.urlB, state.route);
}

init();
