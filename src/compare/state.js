/**
 * The comparison as the toolbar shows it, plus the user's settings.
 * Everything that reacts to a change subscribes with onStateChange().
 */
import { WIDTH_MAX, WIDTH_MIN, normalizeSettings } from '../shared/settings.js';

const STORAGE_KEY = 'ovl';
const SAVE_DELAY_MS = 300;

export const LAYERS = ['A', 'B'];
export const otherLayer = (layer) => (layer === 'A' ? 'B' : 'A');

/** Saved in chrome.storage.local, so the tab reopens the way it was left. */
export const state = {
  urlA: '',
  urlB: '',
  route: '',
  width: 1440,
  fit: false,
  mode: 'overlay',
  opacity: 50,
  tolerance: 0,
  active: 'B',
  hideB: false,
  offX: 0,
  offY: 0,
  syncScroll: true,
  scrollMode: 'px',
  mirror: false,
  followRoute: true,
  barHidden: false,
};

export let settings = normalizeSettings();

/** A feature runs only if the options allow it and its toolbar switch is on. */
export const enabled = {
  syncScroll: () => settings.syncScroll && state.syncScroll,
  followRoute: () => settings.followRoute && state.followRoute,
  mirrorClicks: () => settings.mirrorClicks && state.mirror,
  mirrorHover: () => settings.mirrorHover && state.mirror,
  mirrorInput: () => settings.mirrorInput && state.mirror,
};

export function clampWidth(value) {
  const width = Math.round(Number(value)) || state.width;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, width));
}

const listeners = [];

/** The listener receives the Set of keys whose values changed. */
export function onStateChange(listener) {
  listeners.push(listener);
}

export function update(patch) {
  const changed = new Set(Object.keys(patch).filter((key) => patch[key] !== state[key]));
  if (!changed.size) return;
  Object.assign(state, patch);
  saveSoon();
  for (const listener of listeners) listener(changed);
}

/** A mode that was switched off in the options gives way to the first allowed one. */
export function setSettings(next) {
  settings = next;
  if (!settings.modes.includes(state.mode)) update({ mode: settings.modes[0] });
}

export async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  Object.assign(state, stored[STORAGE_KEY]);
}

// Sliders change the state many times a second; one write after they settle is enough.
let saveTimer = 0;

export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

window.addEventListener('pagehide', () => {
  if (saveTimer) saveNow();
});
