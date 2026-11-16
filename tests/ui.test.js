// Localized UI, mode buttons, link parameters and the overlay + difference layer.
const { sleep, openCompare, suite, setup } = require('./harness');

const page = (
  blockColour,
) => `<!doctype html><body style="margin:0;height:3000px;font:16px sans-serif;background:#fff">
<h1 style="margin:20px">Same heading</h1>
<div style="position:absolute;left:20px;top:200px;width:200px;height:100px;background:${blockColour}"></div>`;

const EXPECTED = {
  en: { load: 'Load', highlight: 'Highlight', tolerance: 'up to 2 px' },
  uk: { load: 'Завантажити', highlight: 'Підсвітка', tolerance: 'до 2 px' },
};

async function checkLanguage(lang, check, defer) {
  const { browser, urlA, urlB } = await setup(defer, {
    pageA: page('#3366cc'),
    pageB: page('#cc3333'),
    lang,
  });
  const compare = await openCompare(browser, urlA, urlB, { mode: 'highlight', tol: '1', w: '800' });
  const json = await compare.ui(`JSON.stringify({
    lang: document.documentElement.lang,
    load: document.getElementById('load').textContent,
    highlight: document.querySelector('#modeSeg [data-v=highlight]').textContent.trim(),
    tolerance: document.getElementById('toleranceVal').textContent,
    untranslated: [...document.querySelectorAll('[data-i18n]')].filter((el) => el.textContent === el.dataset.i18n).length,
    mode: document.querySelector('#modeSeg .on')?.dataset.v,
    width: document.getElementById('width').value,
    search: location.search,
  })`);
  const ui = JSON.parse(json);
  const want = EXPECTED[lang];
  check(`[${lang}] UI language`, ui.lang.startsWith(lang), json);
  check(`[${lang}] Load button`, ui.load === want.load, json);
  check(`[${lang}] Highlight mode button`, ui.highlight === want.highlight, json);
  check(`[${lang}] tolerance value`, ui.tolerance === want.tolerance, json);
  check(`[${lang}] every data-i18n key resolved`, ui.untranslated === 0, json);
  check(`[${lang}] link params applied`, ui.mode === 'highlight' && ui.width === '800', json);
  check(
    `[${lang}] address carries the link`,
    /mode=highlight/.test(ui.search) && /tol=1/.test(ui.search),
    json,
  );

  await sleep(2500);
  const marked = await compare.ui(`(() => {
    const canvas = document.getElementById('diffLayer');
    if (canvas.hidden) return 0;
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
    return opaque;
  })()`);
  check(`[${lang}] difference layer marks the changed block`, marked > 10000, String(marked));
  await compare.click('#modeSeg [data-v=overlay]');
  await sleep(300);
  check(
    `[${lang}] overlay hides the difference layer`,
    await compare.ui(`document.getElementById('diffLayer').hidden`),
  );
}

suite(async ({ check, defer }) => {
  for (const lang of Object.keys(EXPECTED)) await checkLanguage(lang, check, defer);
});
