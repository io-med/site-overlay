// Address captions sit under their own screen; the width slider lines up with the breakpoint buttons.
const { sleep, openCompare, suite, setup } = require('./harness');

suite(async ({ check, defer }) => {
  const { browser, urlA, urlB } = await setup(defer, {
    pageA: '<!doctype html><body>A',
    pageB: '<!doctype html><body>B',
    size: '1280,887',
  });
  const compare = await openCompare(browser, urlA, urlB, { mode: 'side', w: '1024' }, 2500);
  const measure = async () =>
    JSON.parse(
      await compare.ui(`(() => {
        const span = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
        const slider = document.getElementById('widthSlider');
        const rect = slider.getBoundingClientRect();
        const thumb = parseFloat(getComputedStyle(slider).getPropertyValue('--thumb'));
        return JSON.stringify({
          captionA: span('capA'), captionB: span('capB'), frameA: span('frameA'), stage: span('stage'),
          thumbX: rect.left + thumb / 2 + (slider.value / slider.max) * (rect.width - thumb),
          width: Number(document.getElementById('width').value),
        });
      })()`),
    );
  const near = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;

  let m = await measure();
  check(
    'side: A caption under frame A',
    near(m.captionA[0], m.frameA[0]) && near(m.captionA[1], m.frameA[1]),
    JSON.stringify(m),
  );
  check('side: B caption to the right of A', m.captionB[0] > m.captionA[1], JSON.stringify(m));
  check('side: both sites fit the window', m.stage[1] <= 1280, JSON.stringify(m));
  await compare.click('#modeSeg [data-v=overlay]');
  await sleep(300);
  m = await measure();
  const middle = (m.stage[0] + m.stage[1]) / 2;
  check(
    'overlay: A left of the middle, B right of it',
    near(m.captionA[1], middle) && near(m.captionB[0], middle),
    JSON.stringify(m),
  );

  const buttons = JSON.parse(
    await compare.ui(`JSON.stringify([...document.querySelectorAll('#presets button')].map((button) => {
      const r = button.getBoundingClientRect();
      return [Number(button.dataset.w), r.left + r.width / 2];
    }))`),
  );
  let misplaced = 0;
  for (const [width, centre] of buttons) {
    await compare.click(`#presets [data-w="${width}"]`);
    if (!near((await measure()).thumbX, centre, 1)) misplaced++;
  }
  check(
    'slider thumb sits under every breakpoint button',
    misplaced === 0,
    `${misplaced} of ${buttons.length} off`,
  );

  // Drag from the 1024 button halfway to 1280: the width lands in between, and snaps at a button.
  const centreOf = Object.fromEntries(buttons);
  await compare.click('#presets [data-w="1024"]');
  const y = await compare.ui(
    `(() => { const r = document.getElementById('widthSlider').getBoundingClientRect(); return r.top + r.height / 2; })()`,
  );
  const drag = (type, x) => compare.mouse(type, x, y, { button: 'left', clickCount: 1 });
  await drag('mousePressed', centreOf[1024]);
  for (let x = centreOf[1024]; x <= (centreOf[1024] + centreOf[1280]) / 2; x += 4)
    await drag('mouseMoved', x);
  const between = (await measure()).width;
  check(
    'dragging between buttons gives an in-between width',
    between > 1100 && between < 1210,
    String(between),
  );
  await drag('mouseMoved', centreOf[1280] + 2);
  check('slider snaps to a button', (await measure()).width === 1280);
  await drag('mouseReleased', centreOf[1280] + 2);
});
