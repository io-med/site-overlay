/** Addresses: what the user typed, the shareable comparison link and this page's own URL. */
import { MODES } from '../shared/settings.js';
import { clampWidth, state } from './state.js';

const LINK_BASE = 'https://site-overlay.invalid/';
const LOCAL_HOST = /^((?:[\w-]+\.)*localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])(:\d+)?([/?#]|$)/i;
const TOLERANCE_MAX = 5;
const ADDRESS_DELAY_MS = 300;

/** Adds the protocol the user left out: http for local hosts, https for the rest. */
export function normalizeUrl(input) {
  const url = input.trim();
  if (!url || /^[a-z]+:\/\//i.test(url)) return url;
  return (LOCAL_HOST.test(url) ? 'http://' : 'https://') + url;
}

/** Appends the route to a base address. A full URL pasted as the route gives only its path. */
export function joinUrl(base, route) {
  let path = route.trim();
  if (!base || !path) return base;
  if (/^https?:\/\//i.test(path) && URL.canParse(path)) {
    const url = new URL(path);
    path = url.pathname + url.search + url.hash;
  }
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Reads the comparison from this page's address.
 * `hold` means the link was opened from a website: show it, but wait for Load.
 */
export function readLink() {
  const params = new URLSearchParams(location.search);
  const patch = {};
  if (params.has('a') || params.has('b')) {
    patch.urlA = normalizeUrl(params.get('a') ?? '');
    patch.urlB = normalizeUrl(params.get('b') ?? '');
    patch.route = (params.get('route') ?? '').trim();
  }
  if (params.has('w')) patch.width = clampWidth(params.get('w'));
  if (MODES.includes(params.get('mode'))) patch.mode = params.get('mode');
  if (params.has('tol')) {
    const tolerance = Math.round(Number(params.get('tol'))) || 0;
    patch.tolerance = Math.min(TOLERANCE_MAX, Math.max(0, tolerance));
  }
  return { patch, hold: params.has('hold') };
}

function linkQuery() {
  // Colons and slashes are safe in a query value; keeping them makes the link readable.
  const encode = (value) => encodeURIComponent(value).replace(/%3A/g, ':').replace(/%2F/g, '/');
  const params = {
    a: state.urlA,
    b: state.urlB,
    route: state.route,
    w: state.width,
    mode: state.mode,
    tol: state.tolerance,
  };
  return Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join('&');
}

export const comparisonLink = () => `${LINK_BASE}?${linkQuery()}`;

let addressTimer;

/**
 * Keeps this page's address equal to the comparison, so reloading the tab restores it.
 * Delayed because Chrome throttles history.replaceState and sliders would flood it.
 */
export function syncAddressSoon() {
  clearTimeout(addressTimer);
  addressTimer = setTimeout(() => {
    const search = `?${linkQuery()}`;
    if (search !== location.search) history.replaceState(null, '', search);
  }, ADDRESS_DELAY_MS);
}
