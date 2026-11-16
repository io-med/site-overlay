// A made-up landing page in two versions with a few small differences, for store screenshots.
module.exports = (v2) => `<!doctype html><html><head><meta charset="utf-8"><title>Lumen</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1d2433; background: #f7f8fb; }
  header { display: flex; align-items: center; gap: 32px; padding: 20px 56px; background: #fff; border-bottom: 1px solid #e6e9f0; }
  .logo { font-weight: 800; font-size: 22px; letter-spacing: -.5px; color: #3d4ed8; }
  nav { display: flex; gap: 24px; color: #5b6478; }
  .cta-top { margin-left: auto; padding: 9px 18px; border-radius: 8px; background: #3d4ed8; color: #fff; font-weight: 600; }
  .hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; padding: 72px 56px 56px; align-items: center; }
  h1 { font-size: 48px; line-height: 1.1; margin: 0 0 18px; letter-spacing: -1.5px; }
  .lead { font-size: 19px; color: #5b6478; margin: 0 0 28px; max-width: 520px; }
  .btns { display: flex; gap: 14px; }
  .btn { padding: 14px 26px; border-radius: 10px; font-weight: 600; }
  .primary { background: #3d4ed8; color: #fff; }
  .ghost { border: 1px solid #cfd5e3; background: #fff; }
  .card { background: #fff; border-radius: 18px; box-shadow: 0 10px 40px rgba(29, 36, 51, .08); padding: 28px; }
  .bars { display: flex; align-items: flex-end; gap: 14px; height: 180px; margin-top: 18px; }
  .bars div { flex: 1; border-radius: 8px 8px 0 0; background: linear-gradient(#7d8bf0, #3d4ed8); }
  .stat { font-size: 34px; font-weight: 800; }
  .muted { color: #8a93a6; font-size: 14px; }
  .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 0 56px 72px; }
  .features h3 { margin: 12px 0 6px; font-size: 18px; }
  .dot { width: 40px; height: 40px; border-radius: 12px; background: #e7eafe; }
</style></head><body>
<header>
  <div class="logo">Lumen</div>
  <nav><span>Product</span><span>Pricing</span><span>Customers</span><span>Docs</span></nav>
  <span class="cta-top">${v2 ? 'Get started' : 'Start free trial'}</span>
</header>
<section class="hero">
  <div>
    <h1>Analytics your whole team understands</h1>
    <p class="lead">Turn raw events into clear dashboards in minutes. No SQL, no waiting for the data team.</p>
    <div class="btns" style="${v2 ? 'margin-top:6px' : ''}"><span class="btn primary">Try it free</span><span class="btn ghost">Book a demo</span></div>
  </div>
  <div class="card">
    <div class="muted">Weekly active users</div>
    <div class="stat">${v2 ? '48,210' : '48,120'}</div>
    <div class="bars">${[55, 70, 62, 84, 76, 92, v2 ? 88 : 100].map((h) => `<div style="height:${h}%"></div>`).join('')}</div>
  </div>
</section>
<section class="features">
  ${[
    ['Live dashboards', 'Every chart updates as events arrive.'],
    ['Shared metrics', 'One definition of “active user” for everyone.'],
    ['Alerts', v2 ? 'Get notified when a metric moves.' : 'Get notified the moment a metric moves.'],
  ]
    .map(
      ([h, p], i) =>
        `<div class="card"><div class="dot" style="${v2 && i === 1 ? 'background:#ffe7d6' : ''}"></div><h3>${h}</h3><div class="muted">${p}</div></div>`,
    )
    .join('')}
</section>
</body></html>`;
