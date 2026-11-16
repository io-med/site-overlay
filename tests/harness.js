// Headless Chrome with the unpacked extension, driven over the DevTools pipe.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// EXT_DIR=… tests an unpacked build instead of the repository.
const EXT_DIR = process.env.EXT_DIR || path.resolve(__dirname, '..');
// Two loopback hosts, so A and B are cross-origin like real sites.
const HOSTS = { A: '127.0.0.1', B: '127.0.0.2' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Serves the same HTML on every path. Returns { url, close }. */
function serve(host, html, headers = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
      response.end(html);
    });
    server.listen(0, host, () => {
      resolve({ url: `http://${host}:${server.address().port}/`, close: () => server.close() });
    });
  });
}

async function launch({ lang = 'en', size = '1400,1000', extensionDir = EXT_DIR } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'site-overlay-test-'));
  const chrome = spawn(
    process.env.CHROME || 'google-chrome',
    [
      '--headless=new',
      '--no-first-run',
      '--no-sandbox',
      '--disable-gpu',
      `--window-size=${size}`,
      `--lang=${lang}`,
      // headless reports no hover-capable pointer, so (hover: hover) media queries would never match
      '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
      `--user-data-dir=${profile}`,
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );

  let lastId = 0;
  let buffer = '';
  const pending = new Map();
  chrome.stdio[4].on('data', (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });

  /** Sends a DevTools protocol command, to a target session when one is given. */
  const cdp = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++lastId;
      pending.set(id, ({ error, result }) =>
        error ? reject(new Error(`${method}: ${error.message}`)) : resolve(result),
      );
      chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });

  /** Evaluates an expression in a target and returns its value. */
  const evaluate = async (sessionId, expression) => {
    const { result, exceptionDetails } = await cdp(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails)
      throw new Error(`${exceptionDetails.exception?.description ?? exceptionDetails.text}\n${expression}`);
    return result.value;
  };

  /** Opens a URL in a new tab and returns { targetId, session }. */
  const open = async (url) => {
    const { targetId } = await cdp('Target.createTarget', { url });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    return { targetId, session: sessionId };
  };

  const { id: extensionId } = await cdp('Extensions.loadUnpacked', { path: extensionDir });
  const close = () => {
    chrome.kill();
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
  };
  return {
    cdp,
    evaluate,
    open,
    close,
    extensionUrl: (page) => `chrome-extension://${extensionId}/${page}`,
  };
}

/**
 * Opens the comparison page on two URLs. Returns the sessions of the page and of both site
 * frames, plus helpers that act on the page the way a user would.
 */
async function openCompare(browser, urlA, urlB, params = {}, settleMs = 4000) {
  const query = new URLSearchParams({ a: urlA, b: urlB, w: '1024', mode: 'overlay', ...params });
  const { targetId, session: page } = await browser.open(browser.extensionUrl(`compare.html?${query}`));
  await sleep(settleMs);

  const { targetInfos } = await browser.cdp('Target.getTargets');
  const frames = {};
  for (const [layer, url] of Object.entries({ A: urlA, B: urlB })) {
    const target = targetInfos.find(
      (info) => info.type === 'iframe' && new URL(info.url).host === new URL(url).host,
    );
    if (!target) throw new Error(`frame ${layer} not found`);
    const attached = await browser.cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    frames[layer] = attached.sessionId;
  }

  const ui = (expression) => browser.evaluate(page, expression);
  const inFrame = (layer, expression) => browser.evaluate(frames[layer], expression);
  const click = (selector) => ui(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const mouse = (type, x, y, extra = {}) =>
    browser.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra }, page);

  return {
    targetId,
    page,
    frames,
    ui,
    inFrame,
    click,
    mouse,
    /** Makes a layer receive the mouse. */
    async activate(layer) {
      await click(`#activeSeg [data-v=${layer}]`);
      await sleep(200);
    },
    async turnMirroringOn() {
      if (!(await ui(`document.getElementById('mirror').checked`))) await click('#mirror');
    },
    /** Where the frame's top-left corner is on the page. */
    frameOrigin: (layer) =>
      ui(
        `(() => { const r = document.getElementById('frame${layer}').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`,
      ),
    /** A real mouse click at a point given in the frame's own coordinates. */
    async clickInFrame(layer, x, y) {
      const origin = await this.frameOrigin(layer);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await mouse(type, origin.x + x, origin.y + y, { button: 'left', clickCount: 1 });
      }
    },
  };
}

/**
 * Runs one test file: body({ check, defer }) collects named checks and cleanup callbacks.
 * Prints a line per check and exits with 1 when any failed.
 */
async function suite(body) {
  let failed = 0;
  const cleanups = [];
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` ${detail}`}`);
    if (!ok) failed++;
  };
  try {
    await body({ check, defer: (cleanup) => cleanups.push(cleanup) });
  } catch (error) {
    console.error(error);
    failed++;
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
}

/** The usual setup: two pages served on two hosts, Chrome launched, both cleaned up afterwards. */
async function setup(defer, { pageA, pageB, headers, ...launchOptions }) {
  const siteA = await serve(HOSTS.A, pageA, headers);
  const siteB = await serve(HOSTS.B, pageB, headers);
  const browser = await launch(launchOptions);
  defer(() => {
    browser.close();
    siteA.close();
    siteB.close();
  });
  return { browser, urlA: siteA.url, urlB: siteB.url };
}

module.exports = { EXT_DIR, sleep, serve, launch, openCompare, suite, setup };
