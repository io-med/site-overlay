/**
 * Detects a half-finished update of an unpacked install.
 *
 * Chrome reads this page from disk every time it opens, but keeps the manifest, and with it
 * the content script, from the moment the extension was last reloaded. When the files are
 * replaced by a newer version and the extension is not reloaded, the page is new while the
 * site frames get the old content script or none, and the two never connect.
 * An install from the Chrome Web Store updates both at once.
 */
import { $ } from './dom.js';
import { saveNow } from './state.js';

/** Returns true when the install is consistent. Otherwise shows the reload notice. */
export async function checkInstall() {
  const running = chrome.runtime.getManifest().version;
  const response = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
  const onDisk = (await response.json()).version;
  if (onDisk === running) return true;

  // The loaded locales are as old as the loaded manifest, so this message may not be in them yet.
  $('reloadText').textContent =
    chrome.i18n.getMessage('reloadText', [onDisk, running]) ||
    `The files on disk are version ${onDisk}, but Chrome is still running version ${running}, so the sites ` +
      'cannot connect to this page. Reloading closes this tab; click the extension icon to open your comparison again.';
  $('reloadExtension').addEventListener('click', () => {
    // Reloading closes this tab. The comparison is saved first, so the next tab opens with it.
    saveNow();
    chrome.runtime.reload();
  });
  $('welcome').hidden = true;
  $('reloadNotice').hidden = false;
  return false;
}
