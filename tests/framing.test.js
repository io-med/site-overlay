// Sites that forbid framing still load, and the header rule does not outlive the comparison.
const { sleep, openCompare, suite, setup } = require('./harness');

const page = '<!doctype html><body>framed';
const headers = { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" };

suite(async ({ check, defer }) => {
  const { browser, urlA, urlB } = await setup(defer, { pageA: page, pageB: page, headers });
  const { session: options } = await browser.open(browser.extensionUrl('options.html'));
  const ruleCount = () =>
    browser.evaluate(options, 'chrome.declarativeNetRequest.getSessionRules().then((rules) => rules.length)');

  const compare = await openCompare(browser, urlA, urlB, {}, 2500);
  check(
    'a site with X-Frame-Options and frame-ancestors loads',
    (await compare.inFrame('A', 'document.body.textContent')) === 'framed',
  );
  check(
    'both layers report their address',
    (await compare.ui(`document.getElementById('curB').textContent`)) === urlB,
  );
  check('one header rule while the comparison is open', (await ruleCount()) === 1, String(await ruleCount()));

  // The same tab goes on to an ordinary page: its frames must get their headers back.
  await browser.cdp('Page.navigate', { url: urlA }, compare.page);
  await sleep(1000);
  check(
    'the rule is removed when the tab leaves the comparison',
    (await ruleCount()) === 0,
    String(await ruleCount()),
  );
});
