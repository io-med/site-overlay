// Click mirroring between two pages that mark up the same controls differently.
const { sleep, openCompare, suite, setup } = require('./harness');

const common = `<script>window.hits=[];function hit(x){hits.push(x)}</script>
<a href="#h" style="display:none" onclick="hit('hidden')">Contact</a>
<a href="#v" onclick="hit('contact');return false" style="position:absolute;left:20px;top:20px">Contact</a>
<p style="position:absolute;left:20px;top:300px;margin:0">Plain paragraph text</p>
<label style="position:absolute;left:20px;top:200px"><input type=checkbox id=cb> Remember</label>`;
// A: semantic buttons, one named only by aria-label
const pageA = `<!doctype html><body style="margin:0;height:2000px;font:16px sans-serif">${common}
<div style="position:absolute;left:20px;top:80px">Font size<!-- -->: <button onclick="hit('s1')">A</button><button onclick="hit('s2')">A</button><button onclick="hit('s3')">A</button></div>
<div style="position:absolute;left:20px;top:120px">Grayscale: <button aria-label="Grayscale" onclick="hit('gray')" style="width:20px;height:20px"></button></div>
<button onclick="hit('icon')" style="position:absolute;left:600px;top:300px;width:30px;height:30px"></button>
<div style="position:absolute;left:400px;top:400px">Menu<div style="display:none"><button onclick="hit('m1')">One</button><button onclick="hit('m2')">Two</button></div></div>
<button onclick="hit('m2-out')" style="position:absolute;left:400px;top:500px">Two</button>`;
// B: div[role=button] everywhere, and the grayscale control has no text at all
const pageB = `<!doctype html><body style="margin:0;height:2000px;font:16px sans-serif">${common}
<div style="position:absolute;left:20px;top:80px;display:flex"><div><span>Font size:</span></div><div role=button onclick="hit('s1')"><div><span>A</span></div></div><div role=button onclick="hit('s2')"><div><span>A</span></div></div><div role=button onclick="hit('s3')"><div><span>A</span></div></div></div>
<div style="position:absolute;left:20px;top:120px;display:flex"><div><span>Grayscale:</span></div><div role=button onclick="hit('gray')" style="width:20px;height:20px"><div><img alt="" width=20 height=20></div></div></div>
<div role=button onclick="hit('icon')" style="position:absolute;left:600px;top:300px;width:30px;height:30px"></div>
<div style="position:absolute;left:400px;top:400px">Menu<div style="visibility:hidden"><div role=button onclick="hit('m1')">One</div><div role=button onclick="hit('m2')">Two</div></div></div>
<div role=button onclick="hit('m2-out')" style="position:absolute;left:400px;top:500px">Two</div>`;

suite(async ({ check, defer }) => {
  const { browser, urlA, urlB } = await setup(defer, { pageA, pageB });
  const compare = await openCompare(browser, urlA, urlB);
  await compare.turnMirroringOn();
  const other = { A: 'B', B: 'A' };

  /** Clicks the nth element matching the selector in one layer; returns what each site registered. */
  const click = async (layer, selector, nth = 0) => {
    await compare.inFrame('A', 'hits.length = 0');
    await compare.inFrame('B', 'hits.length = 0');
    await compare.activate(layer);
    const centre = await compare.inFrame(
      layer,
      `(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${nth}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await compare.clickInFrame(layer, centre.x, centre.y);
    await sleep(400);
    return {
      own: await compare.inFrame(layer, 'hits.join()'),
      mirror: await compare.inFrame(other[layer], 'hits.join()'),
    };
  };
  const expectBoth = async (name, layer, selector, nth, want) => {
    const hits = await click(layer, selector, nth);
    check(name, hits.own === want && hits.mirror === want, JSON.stringify(hits));
  };

  await expectBoth('text link A→B, hidden twin skipped', 'A', 'a[href="#v"]', 0, 'contact');
  await expectBoth('font 2 A→B (button → div)', 'A', 'button', 1, 's2');
  await expectBoth('font 3 B→A (div → button)', 'B', '[role=button]', 2, 's3');
  await expectBoth('font 1 B→A', 'B', '[role=button]', 0, 's1');
  await expectBoth('grayscale A→B (aria-label → no text)', 'A', '[aria-label="Grayscale"]', 0, 'gray');
  await expectBoth('grayscale B→A', 'B', '[role=button]', 3, 'gray');
  await expectBoth('icon without label B→A falls back to position', 'B', '[role=button]', 4, 'icon');
  await expectBoth('icon without label A→B falls back to position', 'A', 'button', 4, 'icon');
  await expectBoth('visible "Two" A→B, not the one in a closed menu', 'A', 'button', 7, 'm2-out');

  const before = { A: await compare.inFrame('A', 'cb.checked'), B: await compare.inFrame('B', 'cb.checked') };
  await click('A', 'label');
  const after = { A: await compare.inFrame('A', 'cb.checked'), B: await compare.inFrame('B', 'cb.checked') };
  check('label toggles its checkbox once in both', after.A !== before.A && after.B !== before.B);
});
