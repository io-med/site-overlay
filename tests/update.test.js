// An unpacked install whose files were replaced but which was not reloaded says so instead of hanging.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EXT_DIR, sleep, serve, launch, suite } = require('./harness');

const EXTENSION_FILES = [
  'manifest.json',
  'compare.html',
  'options.html',
  'src',
  'styles',
  '_locales',
  'icons',
];

suite(async ({ check, defer }) => {
  // A private copy of the extension, so its manifest can be changed under a running Chrome.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'site-overlay-copy-'));
  for (const name of EXTENSION_FILES)
    fs.cpSync(path.join(EXT_DIR, name), path.join(copy, name), { recursive: true });
  const siteA = await serve('127.0.0.1', '<!doctype html><body>A');
  const siteB = await serve('127.0.0.2', '<!doctype html><body>B');
  const browser = await launch({ extensionDir: copy });
  defer(() => {
    browser.close();
    siteA.close();
    siteB.close();
    fs.rmSync(copy, { recursive: true, force: true });
  });

  const compareUrl = browser.extensionUrl(`compare.html?a=${siteA.url}&b=${siteB.url}`);
  const read = (session) =>
    browser
      .evaluate(
        session,
        `JSON.stringify({
          notice: document.getElementById('reloadNotice').checkVisibility(),
          text: document.getElementById('reloadText').textContent,
          frame: document.getElementById('frameA').src,
          captionB: document.getElementById('curB').textContent,
          running: chrome.runtime.getManifest().version,
        })`,
      )
      .then(JSON.parse);

  const first = await browser.open(compareUrl);
  await sleep(2500);
  let page = await read(first.session);
  check(
    'a consistent install loads the sites',
    !page.notice && page.captionB === siteB.url,
    JSON.stringify(page),
  );

  // "Replace the files with a new version" without reloading the extension.
  const manifestPath = path.join(copy, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const loaded = manifest.version;
  manifest.version = '99.0.0';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const stale = await browser.open(compareUrl);
  await sleep(1500);
  page = await read(stale.session);
  check('files newer than the running extension: the notice is shown', page.notice, JSON.stringify(page));
  check(
    'the notice names both versions',
    page.text.includes('99.0.0') && page.text.includes(loaded),
    page.text,
  );
  check('nothing is loaded into the frames meanwhile', !page.frame, JSON.stringify(page));
  // The button itself is not pressed here: this Chrome drops an extension loaded over DevTools
  // when the extension reloads itself.
});
