/** Alt shortcuts. They also work while a site frame has the focus: its content script forwards them. */
import { settings, state, update } from './state.js';

function toggleDifference() {
  if (!settings.modes.includes('difference')) return;
  const back = settings.modes.find((mode) => mode !== 'difference') ?? 'difference';
  update({ mode: state.mode === 'difference' ? back : 'difference' });
}

const HOTKEYS = {
  Digit1: () => update({ active: 'A' }),
  Digit2: () => update({ active: 'B' }),
  KeyH: () => update({ hideB: !state.hideB }),
  KeyD: toggleDifference,
  KeyT: () => update({ barHidden: !state.barHidden }),
};

/** The key codes site frames should forward; none when shortcuts are switched off. */
export const forwardedHotkeys = () => (settings.hotkeys ? Object.keys(HOTKEYS) : []);

export function runHotkey(code) {
  if (settings.hotkeys) HOTKEYS[code]?.();
}

export function listenForHotkeys() {
  document.addEventListener('keydown', (event) => {
    if (!settings.hotkeys || !event.altKey || !HOTKEYS[event.code]) return;
    event.preventDefault();
    runHotkey(event.code);
  });
}
