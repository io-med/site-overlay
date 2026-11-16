// Typing, scrolling and navigation stay in sync; a page script cannot pose as the content script.
const { sleep, openCompare, suite, setup } = require('./harness');

const page = `<!doctype html><body style="margin:0;height:4000px">
<input name=q style="position:absolute;left:50px;top:50px;width:200px">
<button id=x style="position:absolute;left:50px;top:120px" onclick="clicks++">Go</button>
<script>window.clicks = 0;</script>`;

suite(async ({ check, defer }) => {
  const { browser, urlA, urlB } = await setup(defer, { pageA: page, pageB: page });
  const compare = await openCompare(browser, urlA, urlB);
  const caption = (layer) => compare.ui(`document.getElementById('cur${layer}').textContent`);
  await compare.turnMirroringOn();
  await compare.activate('A');

  // Typing goes to the field with the same name.
  await compare.clickInFrame('A', 100, 60);
  await browser.cdp('Input.insertText', { text: 'hello' }, compare.frames.A);
  await sleep(500);
  const typed = await compare.inFrame('B', `document.querySelector('[name=q]').value`);
  check('typing in A appears in B', typed === 'hello', typed);

  // A page script sends what looks like our messages. Nothing may reach B.
  await compare.inFrame(
    'A',
    `for (const data of [
      { __ovl: true, type: 'click', d: { text: 'Go', clickable: true, tag: 'button', x: 60, y: 130 } },
      { type: 'click', target: { text: 'Go', clickable: true, tag: 'button', x: 60, y: 130 } },
      { siteOverlayToken: 'guess' },
    ]) parent.postMessage(data, '*')`,
  );
  await sleep(500);
  check('messages forged by a page script are ignored', (await compare.inFrame('B', 'clicks')) === 0);

  // Scroll with the real mouse wheel over A.
  const origin = await compare.frameOrigin('A');
  await compare.mouse('mouseWheel', origin.x + 400, origin.y + 300, { deltaX: 0, deltaY: 600 });
  await sleep(600);
  const scrolled = { A: await compare.inFrame('A', 'scrollY'), B: await compare.inFrame('B', 'scrollY') };
  check(
    'scrolling A scrolls B to the same position',
    scrolled.A > 0 && scrolled.B === scrolled.A,
    JSON.stringify(scrolled),
  );

  // A single-page app changes the address without loading a page.
  await compare.inFrame('A', `history.pushState({}, '', '/spa?tab=2')`);
  await sleep(2500);
  check(
    'SPA navigation in A is followed by B',
    (await caption('B')) === `${urlB}spa?tab=2`,
    await caption('B'),
  );
  const route = await compare.ui(`document.getElementById('route').value`);
  check('the route field shows the new route', route === '/spa?tab=2', route);

  // A full page load inside A.
  await compare.inFrame('A', `location.href = '/next'`);
  await sleep(3000);
  check('a page load in A is followed by B', (await caption('B')) === `${urlB}next`, await caption('B'));
  check('A stays where the user went', (await caption('A')) === `${urlA}next`, await caption('A'));
});
