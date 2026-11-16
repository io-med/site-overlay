/** The chrome.i18n message for `key`, or the key itself if there is none. */
export function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions.map(String)) || key;
}

/**
 * Fills elements marked with data-i18n (text) and data-i18n-title (tooltip).
 * The HTML already holds the English text, so a missing message leaves it as is.
 */
export function localizePage() {
  document.documentElement.lang = chrome.i18n.getMessage('lang') || 'en';
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n) || el.textContent;
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = chrome.i18n.getMessage(el.dataset.i18nTitle) || el.title;
  }
}
