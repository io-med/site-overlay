// Hover mirroring: a CSS :hover menu on one side, a JavaScript mouseenter menu on the other.
const { sleep, openCompare, suite, setup } = require('./harness');

const style = `<style>
.wrap{position:absolute;left:300px;top:100px;width:120px;height:40px;background:#eee}
.wrap .menu{display:none;position:absolute;top:40px;left:0;width:200px;height:100px;background:#fc0}
@media (hover: hover) { .wrap:hover .menu, .never { display:block } }
.btn{position:absolute;left:300px;top:400px;width:100px;height:30px;background:#ccc}
.btn:hover{background:rgb(255, 0, 0)}
</style>`;
const pageA = `<!doctype html><body style="margin:0;height:2000px">${style}
<div class=wrap id=trig>CSS menu<div class=menu id=menu><button id=item onclick="hits.push('item')">Item</button></div></div>
<div class=btn id=btn>btn</div><script>window.hits=[];</script>`;
const pageB = `<!doctype html><body style="margin:0;height:2000px">${style.replace(/@media[^}]+}\s*}/, '')}
<div class=wrap id=trig style="background:#ddd">JS menu<div id=menu style="display:none;position:absolute;top:40px;left:0;width:200px;height:100px;background:#fc0"><div role=button id=item onclick="hits.push('item')">Item</div></div></div>
<div class=btn id=btn>btn</div>
<script>window.hits=[];
trig.addEventListener('mouseenter',()=>{menu.style.display='block'});
trig.addEventListener('mouseleave',()=>{menu.style.display='none'});</script>`;

suite(async ({ check, defer }) => {
  const { browser, urlA, urlB } = await setup(defer, { pageA, pageB });
  const compare = await openCompare(browser, urlA, urlB);
  await compare.turnMirroringOn();

  /** Moves the real mouse to a point of one layer, given in the frame's coordinates. */
  const moveTo = async (layer, x, y) => {
    await compare.activate(layer);
    const origin = await compare.frameOrigin(layer);
    await compare.mouse('mouseMoved', origin.x + x, origin.y + y);
    await sleep(300);
  };
  const menuShown = async (layer) =>
    (await compare.inFrame(layer, `getComputedStyle(document.getElementById('menu')).display`)) === 'block';
  const buttonRed = async (layer) =>
    (await compare.inFrame(layer, 'getComputedStyle(btn).backgroundColor')) === 'rgb(255, 0, 0)';

  await moveTo('A', 350, 120);
  check('A: own CSS menu open', await menuShown('A'));
  check('B: JS menu opened by mirrored hover', await menuShown('B'));
  await moveTo('A', 350, 160);
  check('B: menu stays open while moving into it', await menuShown('B'));
  await moveTo('A', 350, 410);
  check('B: menu closed on leave', !(await menuShown('B')));
  check('B: CSS :hover emulated on a button', await buttonRed('B'));
  await moveTo('A', 700, 700);
  check('B: emulated :hover cleared', !(await buttonRed('B')));

  await moveTo('B', 350, 120);
  check('A: CSS menu inside @media (hover: hover) opened by mirrored hover', await menuShown('A'));
  check('A: unrelated button not hovered', !(await buttonRed('A')));
  await moveTo('B', 350, 150);
  await compare.clickInFrame('B', 350, 150);
  await sleep(400);
  const hits = { A: await compare.inFrame('A', 'hits.join()'), B: await compare.inFrame('B', 'hits.join()') };
  check('click inside the hover menu mirrored', hits.A === 'item' && hits.B === 'item', JSON.stringify(hits));

  await compare.click('#mirror');
  await sleep(300);
  const marked = await compare.inFrame('A', 'document.querySelectorAll("[data-ovl-hover]").length');
  check('turning mirroring off clears emulated hover', !(await menuShown('A')) && marked === 0);
});
