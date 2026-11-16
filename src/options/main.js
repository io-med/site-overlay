import { localizePage, t } from '../shared/i18n.js';
import {
  DEFAULTS,
  MAX_PRESETS,
  WIDTH_MAX,
  WIDTH_MIN,
  applyTheme,
  loadSettings,
  normalizeSettings,
  onSettingsChanged,
  saveSettings,
} from '../shared/settings.js';

// chrome.storage.sync accepts about two writes a second, and the colour picker fires on every move.
const SAVE_DELAY_MS = 250;
const SAVED_BADGE_MS = 1500;

const $ = (id) => document.getElementById(id);

let settings = normalizeSettings();
let saveTimer = 0;
let badgeTimer;

function change(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  render();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = 0;
    await saveSettings(settings);
    $('saved').hidden = false;
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => ($('saved').hidden = true), SAVED_BADGE_MS);
  }, SAVE_DELAY_MS);
}

function presetChip(width) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'preset';
  chip.dataset.w = width;
  chip.title = t('optRemoveWidth', width);
  const cross = document.createElement('span');
  cross.className = 'x';
  cross.textContent = '×';
  chip.append(String(width), cross);
  return chip;
}

function render() {
  applyTheme(settings.theme);

  const list = $('presetList');
  list.replaceChildren(...settings.presets.map(presetChip));
  if (!settings.presets.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = t('optNoWidths');
    list.append(empty);
  }
  $('newPreset').disabled = settings.presets.length >= MAX_PRESETS;

  for (const toggle of document.querySelectorAll('[data-mode]')) {
    toggle.checked = settings.modes.includes(toggle.dataset.mode);
    toggle.disabled = toggle.checked && settings.modes.length === 1; // the last mode stays on
  }
  for (const toggle of document.querySelectorAll('[data-key]')) toggle.checked = settings[toggle.dataset.key];
  for (const button of $('themeSeg').children)
    button.classList.toggle('on', button.dataset.v === settings.theme);
  $('diffColor').value = settings.diffColor;
}

function addPreset(event) {
  event.preventDefault();
  const width = Math.round(Number($('newPreset').value));
  if (!(width >= WIDTH_MIN && width <= WIDTH_MAX)) {
    $('presetError').textContent = t('optWidthRange', WIDTH_MIN, WIDTH_MAX);
    return;
  }
  $('newPreset').value = '';
  if (settings.presets.includes(width)) {
    $('presetError').textContent = t('optWidthExists', width);
    return;
  }
  $('presetError').textContent = '';
  change({ presets: [...settings.presets, width] });
}

function bind() {
  $('addPreset').addEventListener('submit', addPreset);
  $('newPreset').addEventListener('input', () => ($('presetError').textContent = ''));
  $('presetList').addEventListener('click', (event) => {
    const chip = event.target.closest('.preset');
    if (chip) change({ presets: settings.presets.filter((width) => width !== Number(chip.dataset.w)) });
  });
  $('resetPresets').addEventListener('click', () => change({ presets: DEFAULTS.presets }));

  for (const toggle of document.querySelectorAll('[data-mode]')) {
    toggle.addEventListener('change', () => {
      const { mode } = toggle.dataset;
      change({
        modes: toggle.checked ? [...settings.modes, mode] : settings.modes.filter((other) => other !== mode),
      });
    });
  }
  for (const toggle of document.querySelectorAll('[data-key]')) {
    toggle.addEventListener('change', () => change({ [toggle.dataset.key]: toggle.checked }));
  }
  $('themeSeg').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) change({ theme: button.dataset.v });
  });
  $('diffColor').addEventListener('input', (event) => change({ diffColor: event.target.value }));
  $('resetColor').addEventListener('click', () => change({ diffColor: DEFAULTS.diffColor }));
  $('resetAll').addEventListener('click', () => {
    if (confirm(t('optResetConfirm'))) change({ ...DEFAULTS });
  });
}

async function init() {
  localizePage();
  $('version').textContent = `Site Overlay Compare ${chrome.runtime.getManifest().version}`;
  settings = await loadSettings();
  bind();
  render();
  // Another options tab changed something; an edit of our own that is still unsaved wins.
  onSettingsChanged((next) => {
    if (saveTimer) return;
    settings = next;
    render();
  });
}

init();
