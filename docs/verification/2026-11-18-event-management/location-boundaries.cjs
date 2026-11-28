// Actual task page with synthetic GPS; all API writes intercepted.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert');
const results = [];
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const order = () => ({ status: 'in_service', canShareLocation: true, detail: {}, pricing: {}, slot: {} });
function fixture() {
  let read = async () => order();
  const env = runtime(async (name, action) => action === 'detail' ? read() : {}, { media: {} });
  env.app.globalData.user = { _id: 'synthetic-provider-a', roles: ['provider'] };
  const locations = [];
  env.wx.getLocation = options => locations.push(options);
  const page = env.instance('miniprogram/provider/task/task.js');
  page.onLoad({ id: 'synthetic-order-a' });
  return { env, page, locations, reads(fn) { read = fn; }, writes: () => env.requests.filter(x => x[1] === 'updateLocation') };
}
async function test(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
(async () => {
  for (const boundary of ['same-page', 'hide', 'unload', 'completed', 'sharing-disabled', 'order-changed', 'user-changed', 'location-denied', 'refresh', 'hide-return']) {
    await test(boundary, async () => {
      const f = fixture(); await f.page.onShow(); assert.equal(f.locations.length, 1);
      if (boundary === 'hide') f.page.onHide();
      if (boundary === 'unload') f.page.onUnload();
      if (boundary === 'completed') f.page.data.order.status = 'done';
      if (boundary === 'sharing-disabled') f.page.data.order.canShareLocation = false;
      if (boundary === 'order-changed') f.page.orderId = 'synthetic-order-b';
      if (boundary === 'user-changed') f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
      if (boundary === 'refresh') await f.page.load();
      if (boundary === 'hide-return') { f.page.onHide(); await f.page.onShow(); }
      if (boundary === 'location-denied') f.locations[0].fail({ errMsg: 'getLocation:fail synthetic denial' });
      else f.locations[0].success({ latitude: 0, longitude: 0 });
      await flush();
      assert.equal(f.writes().length, boundary === 'same-page' ? 1 : 0);
      if (f.locations.length > 1) {
        assert.equal(f.page.locationBusy, true, 'old finally must not release newer request');
        f.locations[1].success({ latitude: 0, longitude: 0 }); await flush();
        assert.equal(f.writes().length, 1);
      }
      assert.equal(f.page.locationBusy, false);
      assert(f.writes().every(x => x[2].orderId === 'synthetic-order-a'));
    });
  }
  for (const guard of ['no-read', 'hidden', 'completed', 'sharing-disabled', 'user-changed', 'busy']) {
    await test('start-guard-' + guard, async () => {
      const f = fixture();
      if (guard !== 'no-read') {
        await f.page.onShow();
        if (guard !== 'busy') { f.locations[0].fail({}); await flush(); }
      }
      if (guard === 'hidden') f.page.onHide();
      if (guard === 'completed') f.page.data.order.status = 'done';
      if (guard === 'sharing-disabled') f.page.data.order.canShareLocation = false;
      if (guard === 'user-changed') f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
      const before = f.locations.length; await f.page.uploadLocation();
      assert.equal(f.locations.length, before); assert.equal(f.writes().length, 0);
    });
  }
  await test('refresh-rejected-invalidates-old-and-retry-resumes', async () => {
    const f = fixture(); await f.page.onShow();
    f.reads(async () => { throw Error('synthetic denied'); }); await f.page.load();
    f.locations[0].success({ latitude: 0, longitude: 0 }); await flush();
    await f.page.uploadLocation(); assert.equal(f.locations.length, 1); assert.equal(f.writes().length, 0);
    f.reads(async () => order()); await f.page.load();
    f.locations[1].success({ latitude: 0, longitude: 0 }); await flush(); assert.equal(f.writes().length, 1);
  });
  for (const boundary of ['user', 'order', 'hide']) await test('detail-pending-' + boundary, async () => {
    const f = fixture(); let resolve; f.reads(() => new Promise(r => { resolve = r; }));
    const op = f.page.onShow(); await flush();
    if (boundary === 'user') f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
    if (boundary === 'order') f.page.orderId = 'synthetic-order-b';
    if (boundary === 'hide') f.page.onHide();
    resolve(order()); await op; assert.equal(f.locations.length, 0); assert.equal(f.writes().length, 0);
  });
  await test('same-context-sequential-ticks-and-accepted-status', async () => {
    const f = fixture(); f.reads(async () => ({ ...order(), status: 'accepted' })); await f.page.onShow();
    f.locations[0].success({ latitude: 0, longitude: 0 }); await flush();
    const op = f.page.uploadLocation(); assert.equal(f.locations.length, 2);
    f.locations[1].success({ latitude: 0, longitude: 0 }); await op; assert.equal(f.writes().length, 2);
  });
  console.log(JSON.stringify({ scope: 'actual page and synthetic GPS; no real location or cloud writes', pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
