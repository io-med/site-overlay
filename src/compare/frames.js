/**
 * The channel to the content script in each site frame, and the header rule that lets sites be framed.
 *
 * Messages travel over chrome.runtime ports, which page scripts can neither read nor forge.
 * A port does not say which iframe it belongs to, so the page sends a one-time token down the
 * port and the content script echoes it through window.postMessage: the message's source window
 * is the iframe.
 */
import { frames } from './dom.js';
import { forwardedHotkeys } from './hotkeys.js';
import { LAYERS, enabled } from './state.js';

const PORT_NAME = 'site-overlay-frame';
const STRIPPED_HEADERS = ['x-frame-options', 'content-security-policy'];

const ports = { A: null, B: null };
const unclaimed = new Map(); // token → port whose iframe is not known yet

/** True once the frame's content script has reported its address after the last load. */
export const alive = { A: false, B: false };

export function post(layer, message) {
  ports[layer]?.postMessage(message);
}

export function postBoth(message) {
  for (const layer of LAYERS) post(layer, message);
}

const frameConfig = () => ({
  mirrorClicks: enabled.mirrorClicks(),
  mirrorHover: enabled.mirrorHover(),
  mirrorInput: enabled.mirrorInput(),
  hotkeys: forwardedHotkeys(),
});

export function pushConfig() {
  postBoth({ type: 'config', config: frameConfig() });
}

/** Calls onMessage(layer, message) for everything the content scripts of this tab send. */
export function connectFrames(tabId, onMessage) {
  chrome.runtime.onConnect.addListener((port) => {
    // Every open comparison tab hears every content script; take only this tab's frames.
    if (port.name !== PORT_NAME || port.sender.tab?.id !== tabId) return;
    const token = crypto.randomUUID();
    unclaimed.set(token, port);
    port.onDisconnect.addListener(() => unclaimed.delete(token));
    port.postMessage({ type: 'identify', token });
  });

  window.addEventListener('message', (event) => {
    const token = event.data?.siteOverlayToken;
    const port = unclaimed.get(token);
    const layer = LAYERS.find((key) => event.source === frames[key].contentWindow);
    if (!port || !layer) return;
    unclaimed.delete(token);
    ports[layer] = port;
    port.onMessage.addListener((message) => onMessage(layer, message));
    port.onDisconnect.addListener(() => {
      if (ports[layer] === port) ports[layer] = null;
    });
    port.postMessage({ type: 'config', config: frameConfig() });
  });
}

/**
 * Many sites forbid framing with X-Frame-Options or CSP. A session rule removes those headers
 * for frames of this tab only. It is taken down when the tab leaves the page: otherwise it
 * would keep stripping the headers from whatever the tab shows next.
 */
export async function allowFraming(tabId) {
  const dnr = chrome.declarativeNetRequest;
  const rule = {
    id: tabId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: STRIPPED_HEADERS.map((header) => ({ header, operation: 'remove' })),
    },
    condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
  };

  const install = async () => {
    // Rules of comparison tabs that crashed never got removed; sweep them up here.
    const thisPage = location.origin + location.pathname;
    const [rules, tabs] = await Promise.all([dnr.getSessionRules(), chrome.tabs.query({})]);
    const comparing = new Set(tabs.filter((tab) => tab.url?.startsWith(thisPage)).map((tab) => tab.id));
    const stale = rules.map((existing) => existing.id).filter((id) => !comparing.has(id));
    await dnr.updateSessionRules({ removeRuleIds: [...stale, tabId], addRules: [rule] });
  };

  window.addEventListener('pagehide', () => dnr.updateSessionRules({ removeRuleIds: [tabId] }));
  window.addEventListener('pageshow', (event) => event.persisted && install());
  await install();
}
