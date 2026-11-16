// Options page: edits are stored, and the comparison tab hides and turns off what was switched off.
const { sleep, openCompare, suite, setup } = require('./harness');

const page = `<!doctype html><body style="margin:0;height:2000px">
<button id=x style="position:absolute;left:50px;top:50px;width:100px;height:40px" onclick="clicks++">Go</button>
<script>window.clicks = 0; window.hovers = 0; x.addEventListener('mouseover', () => hovers++);</script>`;

suite(async ({ check, defer }) => {
  const { browser, urlA, urlB } = await setup(defer, { pageA: page, pageB: page });
  const { session: options } = await browser.open(browser.extensionUrl('options.html'));
  await sleep(800);
  const inOptions = (expression) => browser.evaluate(options, expression);
  const toggle = (selector) => inOptions(`document.querySelector('${selector}').click()`);
  const stored = () =>
    inOptions(`chrome.storage.sync.get('ovlSettings').then((items) => items.ovlSettings ?? null)`);

  // Add a width through the form, remove one by clicking it, switch things off.
  await inOptions(
    `document.getElementById('newPreset').value = '1600'; document.querySelector('#addPreset [type=submit]').click()`,
  );
  await sleep(100);
  await toggle('.preset[data-w="320"]');
  for (const selector of [
    '[data-mode=side]',
    '[data-key=mirrorHover]',
    '[data-key=hotkeys]',
    '[data-key=links]',
    '[data-key=offset]',
  ]) {
    await toggle(selector);
  }
  await inOptions(
    `document.getElementById('diffColor').value = '#00ff00'; document.getElementById('diffColor').dispatchEvent(new Event('input'))`,
  );
  await sleep(600);
  const saved = await stored();
  let json = JSON.stringify(saved);
  check('width added and removed', saved?.presets.includes(1600) && !saved.presets.includes(320), json);
  check('mode switched off', saved?.modes.length === 3 && !saved.modes.includes('side'), json);
  check(
    'features switched off',
    saved && !saved.mirrorHover && !saved.hotkeys && !saved.links && !saved.offset && saved.mirrorClicks,
    json,
  );
  check('colour stored', saved?.diffColor === '#00ff00', json);
  check('saved badge shown', await inOptions(`!document.getElementById('saved').hidden`));

  // The last mode can't be switched off.
  await toggle('[data-mode=overlay]');
  await toggle('[data-mode=highlight]');
  check('last mode stays on', await inOptions(`document.querySelector('[data-mode=difference]').disabled`));
  await toggle('[data-mode=overlay]');
  await toggle('[data-mode=highlight]');
  await sleep(600);

  // A link that asks for the switched-off mode falls back to the first allowed one.
  const compare = await openCompare(browser, urlA, urlB, { mode: 'side' }, 2500);
  const currentMode = () => compare.ui(`document.querySelector('#modeSeg .on')?.dataset.v`);
  json = await compare.ui(`JSON.stringify({
    presets: [...document.querySelectorAll('#presets button')].map((button) => Number(button.textContent)),
    sideHidden: document.querySelector('#modeSeg [data-v=side]').hidden,
    copyHidden: document.getElementById('copyLink').hidden,
    hintHidden: document.getElementById('hint').hidden,
    offsetHidden: document.getElementById('offsetTools').hidden,
    mirrorHidden: document.getElementById('mirrorChip').hidden,
    colour: document.getElementById('diffColor').getAttribute('values'),
  })`);
  const ui = JSON.parse(json);
  check('compare shows the edited widths', ui.presets.includes(1600) && !ui.presets.includes(320), json);
  check(
    'switched-off mode is hidden and not used',
    ui.sideHidden && (await currentMode()) === 'overlay',
    json,
  );
  check(
    'switched-off features are hidden',
    ui.copyHidden && ui.hintHidden && ui.offsetHidden && !ui.mirrorHidden,
    json,
  );
  check(
    'difference colour applied',
    /^0 0 0 0 0\.000 {2}0 0 0 0 1\.000 {2}0 0 0 0 0\.000 /.test(ui.colour),
    ui.colour,
  );

  // Mirroring on, hover mirroring off in the options: a click reaches B, the mouse-over does not.
  await compare.turnMirroringOn();
  await compare.activate('A');
  const origin = await compare.frameOrigin('A');
  await compare.mouse('mouseMoved', origin.x + 100, origin.y + 70);
  await sleep(300);
  await compare.clickInFrame('A', 100, 70);
  await sleep(400);
  const seenByB = JSON.parse(await compare.inFrame('B', 'JSON.stringify({ clicks, hovers })'));
  check(
    'clicks are mirrored, hover is not',
    seenByB.clicks === 1 && seenByB.hovers === 0,
    JSON.stringify(seenByB),
  );

  // Alt+D does nothing with shortcuts off.
  await browser.cdp(
    'Input.dispatchKeyEvent',
    { type: 'rawKeyDown', key: 'd', code: 'KeyD', modifiers: 1, windowsVirtualKeyCode: 68 },
    compare.page,
  );
  await sleep(200);
  check('shortcuts off: Alt+D ignored', (await currentMode()) === 'overlay');

  // Live update: turning a feature back on shows it in the open tab.
  await toggle('[data-key=offset]');
  let shown = false;
  for (let i = 0; i < 20 && !shown; i++) {
    await sleep(150);
    shown = !(await compare.ui(`document.getElementById('offsetTools').hidden`));
  }
  check('open tab follows settings changes', shown);

  // Comparison links switched off: the address is no longer opened as a comparison.
  const link = await browser.open(`https://site-overlay.invalid/?a=${urlA}&b=${urlB}`);
  await sleep(1500);
  const { targetInfos } = await browser.cdp('Target.getTargets');
  const { url } = targetInfos.find((info) => info.targetId === link.targetId);
  check('links off: not intercepted', !url.startsWith('chrome-extension://'), url);
});
