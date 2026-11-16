// The start screen, the More menu, the mirroring reminder and hiding the toolbar.
const { sleep, openCompare, suite, setup } = require('./harness');

const page = '<!doctype html><body style="margin:0;height:2000px">site';

suite(async ({ check, defer }) => {
  const { browser, urlA, urlB } = await setup(defer, { pageA: page, pageB: page, size: '1280,887' });

  // A tab opened from the extension icon has nothing to compare yet.
  const fresh = await browser.open(browser.extensionUrl('compare.html'));
  await sleep(1000);
  const shown = (session, id) =>
    browser.evaluate(session, `document.getElementById('${id}').checkVisibility()`);
  check(
    'empty tab shows the start screen',
    (await shown(fresh.session, 'welcome')) && !(await shown(fresh.session, 'stage')),
  );
  await browser.evaluate(
    fresh.session,
    `document.getElementById('urlA').value = ${JSON.stringify(urlA)}; document.getElementById('load').click()`,
  );
  await sleep(500);
  check(
    'loading replaces it with the sites',
    !(await shown(fresh.session, 'welcome')) && (await shown(fresh.session, 'stage')),
  );

  const compare = await openCompare(browser, urlA, urlB, {}, 2500);
  const menuOpen = () => compare.ui(`document.getElementById('more').matches(':popover-open')`);
  const barHeight = () => compare.ui(`document.getElementById('bar').offsetHeight`);
  check('toolbar fits two rows at 1280 px', (await barHeight()) <= 110, String(await barHeight()));

  // The More menu opens under its button and closes when the user goes back to the sites.
  await compare.click('#moreButton');
  await sleep(300);
  const placed = JSON.parse(
    await compare.ui(`(() => {
      const menu = document.getElementById('more').getBoundingClientRect();
      const button = document.getElementById('moreButton').getBoundingClientRect();
      return JSON.stringify({ open: document.getElementById('more').matches(':popover-open'),
        below: menu.top >= button.bottom, aligned: Math.abs(menu.right - button.right) < 2,
        inside: menu.left >= 0 && menu.bottom <= innerHeight });
    })()`),
  );
  check(
    'More menu opens under its button, inside the window',
    Object.values(placed).every(Boolean),
    JSON.stringify(placed),
  );
  await compare.clickInFrame('B', 300, 300);
  await sleep(300);
  check('a click in a site closes the menu', !(await menuOpen()));

  // Mirroring repeats real clicks, so the toolbar says so while it is on.
  const pillShown = () => compare.ui(`document.getElementById('mirrorPill').checkVisibility()`);
  check('no reminder while mirroring is off', !(await pillShown()));
  await compare.turnMirroringOn();
  check('reminder shown while mirroring is on', await pillShown());
  await compare.click('#mirrorPill');
  const mirroring = await compare.ui(`document.getElementById('mirror').checked`);
  check('clicking the reminder turns mirroring off', !mirroring && !(await pillShown()));

  // Hiding the toolbar gives its height to the sites; Alt+T works from inside a site too.
  const viewportHeight = () => compare.ui(`document.getElementById('viewport').clientHeight`);
  const before = await viewportHeight();
  const bar = await barHeight();
  await compare.click('#toggleBar');
  await sleep(300);
  check(
    'hiding the toolbar gives its height to the sites',
    (await viewportHeight()) === before + bar,
    `${before} + ${bar} → ${await viewportHeight()}`,
  );
  await compare.clickInFrame('B', 300, 300); // focus the site frame
  const altT = { key: 't', code: 'KeyT', modifiers: 1, windowsVirtualKeyCode: 84 };
  await browser.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...altT }, compare.frames.B);
  await sleep(400);
  check('Alt+T pressed inside a site brings the toolbar back', (await viewportHeight()) === before);
});
