/** The toolbar: user input goes into the state, the state and settings come back out to the controls. */
import { t } from '../shared/i18n.js';
import { applyTheme } from '../shared/settings.js';
import { scheduleDiff, styleMask } from './diff.js';
import { $, showStatus } from './dom.js';
import { comparisonLink } from './link.js';
import { loadComparison, reloadComparison } from './navigation.js';
import { settings, state, update } from './state.js';
import { bindWidthControls, renderPresets, renderWidth } from './width.js';

// For these controls the element id is the state key.
const SWITCHES = ['fit', 'syncScroll', 'mirror', 'followRoute'];
const SLIDERS = ['opacity', 'tolerance'];
const OFFSETS = ['offX', 'offY'];
const SEGMENTS = { activeSeg: 'active', modeSeg: 'mode' };

export function renderAddresses() {
  $('urlA').value = state.urlA;
  $('urlB').value = state.urlB;
  $('route').value = state.route;
}

function load() {
  showStatus(''); // the "press Load" note has done its job
  loadComparison($('urlA').value, $('urlB').value, $('route').value);
  renderAddresses(); // show the addresses as they were normalized
}

function swap() {
  [$('urlA').value, $('urlB').value] = [$('urlB').value, $('urlA').value];
  load();
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(comparisonLink());
    showStatus(t('linkCopied'));
  } catch {
    showStatus(t('linkCopyFailed'), { warn: true });
  }
}

export function bindControls() {
  $('load').addEventListener('click', load);
  for (const id of ['urlA', 'urlB', 'route']) {
    $(id).addEventListener('keydown', (event) => event.key === 'Enter' && load());
  }
  $('swap').addEventListener('click', swap);
  $('reload').addEventListener('click', reloadComparison);
  $('copyLink').addEventListener('click', copyLink);
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  bindWidthControls();
  for (const key of SWITCHES) {
    $(key).addEventListener('change', (event) => update({ [key]: event.target.checked }));
  }
  for (const key of SLIDERS) {
    $(key).addEventListener('input', (event) => update({ [key]: Number(event.target.value) }));
  }
  for (const key of OFFSETS) {
    $(key).addEventListener('change', (event) => update({ [key]: Number(event.target.value) || 0 }));
  }
  for (const [id, key] of Object.entries(SEGMENTS)) {
    $(id).addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button) update({ [key]: button.dataset.v });
    });
  }
  $('scrollMode').addEventListener('change', (event) => update({ scrollMode: event.target.value }));
  $('toggleB').addEventListener('click', () => update({ hideB: !state.hideB }));
  $('diffNow').addEventListener('click', () => scheduleDiff(0));
  $('toggleBar').addEventListener('click', () => update({ barHidden: !state.barHidden }));
  $('mirrorPill').addEventListener('click', () => update({ mirror: false }));
  bindMoreMenu();
}

/** The menu is a popover, which the browser centres by default; put it under its button instead. */
function bindMoreMenu() {
  const menu = $('more');
  menu.addEventListener('toggle', (event) => {
    if (event.newState !== 'open') return;
    const button = $('moreButton').getBoundingClientRect();
    menu.style.top = `${button.bottom + 6}px`;
    menu.style.right = `${document.documentElement.clientWidth - button.right}px`;
  });
  // A click inside a site frame never reaches this document, so it cannot dismiss the menu.
  // It does take the focus away from the window, though.
  window.addEventListener('blur', () => menu.hidePopover());
}

/** `changed` is the set of state keys that changed, when the call follows a state change. */
export function renderControls(changed) {
  const side = state.mode === 'side';
  renderWidth();
  $('fit').checked = state.fit || side;
  $('fit').disabled = side;
  $('fitChip').title = side ? t('fitSideTitle') : '';

  for (const [id, key] of Object.entries(SEGMENTS)) {
    for (const button of $(id).children) button.classList.toggle('on', button.dataset.v === state[key]);
  }
  $('toggleB').setAttribute('aria-pressed', state.hideB);
  $('offX').value = state.offX;
  $('offY').value = state.offY;

  $('opacityTools').hidden = state.mode !== 'overlay' && state.mode !== 'highlight';
  $('opacity').value = state.opacity;
  $('opacityVal').textContent = `${state.opacity}%`;
  $('diffTools').hidden = state.mode !== 'highlight';
  $('tolerance').value = state.tolerance;
  $('toleranceVal').textContent = state.tolerance
    ? t('toleranceUpTo', state.tolerance * 2)
    : t('toleranceOff');

  $('syncScroll').checked = state.syncScroll;
  $('scrollMode').value = state.scrollMode;
  $('mirror').checked = state.mirror;
  $('mirrorPill').hidden = !state.mirror || $('mirrorChip').hidden;
  $('followRoute').checked = state.followRoute;

  document.body.classList.toggle('barHidden', state.barHidden);
  $('toggleBar').title = `${t(state.barHidden ? 'showToolbar' : 'hideToolbar')} (Alt+T)`;

  // The route follows navigation inside the sites, but never overwrites what is being typed.
  if (changed?.has('route') && document.activeElement !== $('route')) $('route').value = state.route;
}

/** Shows only what the options allow. A toolbar group left without controls hides itself in CSS. */
export function applySettings() {
  applyTheme(settings.theme);
  renderPresets();
  for (const button of $('modeSeg').children) button.hidden = !settings.modes.includes(button.dataset.v);
  $('modeSeg').hidden = settings.modes.length < 2;
  $('scrollTools').hidden = !settings.syncScroll;
  $('followChip').hidden = !settings.followRoute;
  $('mirrorChip').hidden = !(settings.mirrorClicks || settings.mirrorHover || settings.mirrorInput);
  $('offsetTools').hidden = !settings.offset;
  $('copyLink').hidden = !settings.links;
  $('hint').hidden = !settings.hotkeys;
  // Nothing left in the menu: no button either.
  $('moreButton').hidden = [...$('more').children].every((item) => item.hidden);
  styleMask();
}
