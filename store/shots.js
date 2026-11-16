// Renders the Chrome Web Store screenshots (1280×800) and the small promo tile (440×280)
// into store/images. Usage: npm run screenshots
const fs = require('fs');
const path = require('path');
const { sleep, serve, launch, openCompare } = require('../tests/harness');
const demoPage = require('./demo/page');

const OUT = path.join(__dirname, 'images');
const SHOT = { width: 1280, height: 800 };
const TILE = { width: 440, height: 280 };
// Headless Chrome keeps about 87 px of the window for a toolbar it does not draw.
const WINDOW = `${SHOT.width},${SHOT.height + 87}`;

const MODES = [
  { file: '1-overlay-difference.png', mode: 'highlight' },
  { file: '2-difference.png', mode: 'difference' },
  { file: '3-overlay.png', mode: 'overlay' },
  { file: '4-side-by-side.png', mode: 'side' },
];

const tile = (
  iconBase64,
) => `<!doctype html><body style="margin:0;width:${TILE.width}px;height:${TILE.height}px;
  background:#1e1f22;color:#e6e6e6;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  display:flex;align-items:center;gap:22px;padding:0 34px;box-sizing:border-box">
  <img src="data:image/png;base64,${iconBase64}" width="112" height="112">
  <div><div style="font-size:30px;font-weight:800;line-height:1.1;letter-spacing:-.5px">Site Overlay<br>Compare</div>
  <div style="margin-top:12px;font-size:16px;color:#a0a3aa;line-height:1.35">Pixel-perfect diff of<br>two live websites</div></div></body>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const siteA = await serve('127.0.0.1', demoPage(false));
  const siteB = await serve('127.0.0.2', demoPage(true));
  const browser = await launch({ size: WINDOW });

  const shoot = async (session, file, { width, height } = SHOT) => {
    const clip = { x: 0, y: 0, width, height, scale: 1 };
    const { data } = await browser.cdp('Page.captureScreenshot', { format: 'png', clip }, session);
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
    console.log('wrote', file);
  };

  try {
    for (const { file, mode } of MODES) {
      const compare = await openCompare(browser, siteA.url, siteB.url, { mode, w: '1240' }, 3000);
      await compare.ui(`(() => {
        const fit = document.getElementById('fit');
        if (!fit.checked && !fit.disabled) fit.click();
        document.activeElement.blur();
      })()`);
      await sleep(mode === 'highlight' ? 5700 : 1200); // the difference needs two screenshots of its own
      // Freeze the pulse at its brightest.
      await compare.ui(
        `Object.assign(document.getElementById('diffLayer').style, { animation: 'none', opacity: 0.95 })`,
      );
      await shoot(compare.page, file);
      await browser.cdp('Target.closeTarget', { targetId: compare.targetId });
    }

    const options = await browser.open(browser.extensionUrl('options.html'));
    await sleep(1000);
    await shoot(options.session, '5-settings.png');

    const icon = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon128.png')).toString('base64');
    const promo = await browser.open(`data:text/html,${encodeURIComponent(tile(icon))}`);
    await sleep(800);
    await shoot(promo.session, 'promo-tile-440x280.png', TILE);
  } finally {
    browser.close();
    siteA.close();
    siteB.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
