import { loadSettings } from './shared/settings.js';

const COMPARE_PAGE = chrome.runtime.getURL('compare.html');

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: COMPARE_PAGE });
});

// A comparison link is an ordinary https URL, so editors and chat apps make it
// clickable. The .invalid domain never resolves; the tab is sent to the
// comparison page instead. A declarativeNetRequest redirect would need
// compare.html to be web accessible, which would let any website embed it.
chrome.webRequest.onBeforeRequest.addListener(
  async ({ url, tabId, initiator }) => {
    const settings = await loadSettings();
    if (!settings.links) return;
    const params = new URL(url).searchParams;
    // A link clicked on a website fills in the fields but does not load anything
    // until the user presses Load, so websites cannot start comparisons.
    params.delete('hold');
    if (initiator) params.set('hold', '1');
    chrome.tabs.update(tabId, { url: `${COMPARE_PAGE}?${params}` });
  },
  { urls: ['*://site-overlay.invalid/*'], types: ['main_frame'] },
);
