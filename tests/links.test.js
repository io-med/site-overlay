// https://site-overlay.invalid/ links: opened directly they load, opened from a website they only fill the fields.
const { sleep, serve, launch, suite } = require('./harness');

suite(async ({ check, defer }) => {
  const siteB = await serve('127.0.0.2', '<!doctype html><body>B');
  // Site A's page links to the comparison; the link is passed in the hash, as it contains A's own port.
  const siteA = await serve(
    '127.0.0.1',
    '<!doctype html><body>A <a id=go>compare</a><script>go.href = decodeURIComponent(location.hash.slice(1))</script>',
  );
  const link = `https://site-overlay.invalid/?a=${siteA.url}&b=${siteB.url}&route=/pricing&w=1280&mode=side`;
  const browser = await launch();
  defer(() => {
    browser.close();
    siteA.close();
    siteB.close();
  });

  const compareUrl = browser.extensionUrl('compare.html');
  const read = (session) =>
    browser
      .evaluate(
        session,
        `JSON.stringify({
          url: location.href,
          a: document.getElementById('urlA')?.value,
          b: document.getElementById('urlB')?.value,
          route: document.getElementById('route')?.value,
          frame: document.getElementById('frameA')?.src,
          status: document.getElementById('status')?.textContent })`,
      )
      .then(JSON.parse);
  const loadsA = (state) => state.frame === `${siteA.url}pricing`;

  const direct = await browser.open(link);
  await sleep(2500);
  // The tab was redirected, so its page is a new target for the session.
  let state = await read(
    (await browser.cdp('Target.attachToTarget', { targetId: direct.targetId, flatten: true })).sessionId,
  );
  check('direct link opens the compare page', state.url.startsWith(compareUrl), JSON.stringify(state));
  check(
    'direct link fills the fields',
    state.a === siteA.url && state.b === siteB.url && state.route === '/pricing',
    JSON.stringify(state),
  );
  check('direct link loads the frames', loadsA(state), JSON.stringify(state));

  const site = await browser.open(`${siteA.url}#${encodeURIComponent(link)}`);
  await sleep(1000);
  await browser.evaluate(site.session, 'document.getElementById("go").click()');
  await sleep(2500);
  const redirected = (await browser.cdp('Target.attachToTarget', { targetId: site.targetId, flatten: true }))
    .sessionId;
  state = await read(redirected);
  check(
    'link from a website opens the compare page',
    state.url.startsWith(compareUrl),
    JSON.stringify(state),
  );
  check(
    'link from a website fills the fields',
    state.a === siteA.url && state.route === '/pricing',
    JSON.stringify(state),
  );
  check('link from a website does not load by itself', !state.frame, JSON.stringify(state));
  check('link from a website explains why', Boolean(state.status), JSON.stringify(state));

  await browser.evaluate(redirected, 'document.getElementById("load").click()');
  await sleep(1500);
  state = await read(redirected);
  check('Load then opens the pages', loadsA(state), JSON.stringify(state));
  check('hold is dropped from the address after Load', !/hold/.test(state.url), JSON.stringify(state));
  check('the note goes away after Load', !state.status, JSON.stringify(state));
});
