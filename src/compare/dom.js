/** Element lookup and the status note of the comparison page. */
export const $ = (id) => document.getElementById(id);

export const frames = { A: $('frameA'), B: $('frameB') };

const STATUS_MS = 4000;
let statusTimer;

export function showStatus(text, { warn = false, ms = STATUS_MS } = {}) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('warn', warn);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.textContent = ''), ms);
}
