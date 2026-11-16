/**
 * Preferences from the options page. They live in chrome.storage.sync, so they
 * follow the user's Chrome profile, and are read by the comparison tab, the
 * options page and the background worker.
 */
const STORAGE_KEY = 'ovlSettings';

export const MODES = ['overlay', 'highlight', 'difference', 'side'];
export const FEATURES = [
  'syncScroll',
  'followRoute',
  'mirrorClicks',
  'mirrorHover',
  'mirrorInput',
  'offset',
  'hotkeys',
  'links',
];
export const WIDTH_MIN = 200;
export const WIDTH_MAX = 3840;
export const MAX_PRESETS = 16;

export const DEFAULTS = Object.freeze({
  presets: Object.freeze([320, 360, 375, 390, 414, 768, 1024, 1280, 1366, 1440, 1920]),
  modes: Object.freeze([...MODES]),
  ...Object.fromEntries(FEATURES.map((feature) => [feature, true])),
  diffColor: '#ff1ad9',
  pulse: true,
  theme: 'system',
});

const THEMES = ['system', 'light', 'dark'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Returns a complete, valid settings object whatever was stored. */
export function normalizeSettings(raw) {
  const settings = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };

  const widths = Array.isArray(settings.presets)
    ? settings.presets.map((width) => Math.round(Number(width)))
    : [];
  const valid = widths.filter((width) => width >= WIDTH_MIN && width <= WIDTH_MAX);
  settings.presets = [...new Set(valid)].sort((a, b) => a - b).slice(0, MAX_PRESETS);

  const modes = Array.isArray(settings.modes) ? MODES.filter((mode) => settings.modes.includes(mode)) : [];
  settings.modes = modes.length ? modes : [...MODES];

  for (const flag of [...FEATURES, 'pulse']) settings[flag] = settings[flag] !== false;
  if (!HEX_COLOR.test(settings.diffColor)) settings.diffColor = DEFAULTS.diffColor;
  if (!THEMES.includes(settings.theme)) settings.theme = DEFAULTS.theme;
  return settings;
}

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

export function saveSettings(settings) {
  return chrome.storage.sync.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[STORAGE_KEY]) callback(normalizeSettings(changes[STORAGE_KEY].newValue));
  });
}

/** "system" leaves the choice to prefers-color-scheme; see styles/theme.css. */
export function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
