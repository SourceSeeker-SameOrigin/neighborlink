// Actual cloud entry + page; entirely synthetic database, network and writes forbidden.
const assert = require('assert');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const fs = require('fs');
const results = [];
function setup() {
  return fixture({ roles: ['resident', 'merchant'], global: true, local: true, records: {
    merchants: [{ _id: 'merchant-a', status: 'approved', staffOpenids: ['actor'], communityIds: ['c'] }],
    orders: Array.from({ length: 21 }, (_, i) => ({ _id: 'order-' + i, orderNo: 'SYNTHETIC-' + i,
      kind: 'merchant', merchantId: 'merchant-a', communityId: 'c', status: i === 20 ? 'pending_quote' : 'completed',
      detail: { serviceTitle: '合成服务', category: 'repair', priceType: 'quote' }, pricing: { payAmount: 0 },
      createdAt: new Date(Date.UTC(2026, 10, 19, 0, 0, 21 - i)), address: { buildingName: '合成楼栋' } }))
  } });
}
async function test(name, fn) {
  let evidence;
  try { await fn(v => { evidence = v; }); results.push({ name, pass: true, evidence }); }
  catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
}
(async () => {
  await test('cloud-two-pages-read-21-own-orders', async record => {
    const db = setup();
    const first = await db.call('merchant', 'merchantOrders', { offset: 0 });
    const second = await db.call('merchant', 'merchantOrders', { offset: 20 });
    assert.equal(first.ok, true); assert.equal(second.ok, true);
    record({ counts: [first.data.list.length, second.data.list.length], hasMore: [first.data.hasMore, second.data.hasMore], last: second.data.list[0]._id, writes: db.writes.length });
    assert.equal(first.data.list.length, 20); assert.equal(first.data.hasMore, true);
    assert.equal(second.data.list.length, 1); assert.equal(second.data.list[0]._id, 'order-20');
    assert.equal(second.data.hasMore, false); assert.equal(db.writes.length, 0);
  });
  await test('page-can-reach-pending-21st-order', async record => {
    const db = setup(), env = runtime(async (n, a, d) => {
      const result = await db.call(n, a, d); if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
      return result.data;
    });
    env.app.globalData.user = db.data.users[0];
    const page = env.instance('miniprogram/merchant/orders/orders.js'); await page.onShow();
    const template = fs.readFileSync('miniprogram/merchant/orders/orders.wxml', 'utf8');
    // Only invoke a bound pagination handler when one exists; never fabricate a UI action.
    const handler = /bindtap="([^"]+)"[^>]*>\s*加载更多/.exec(template)?.[1];
    if (handler && typeof page[handler] === 'function') await page[handler]();
    record({ visible: page.data.list.length, paginationButton: !!handler, offsets: env.requests.map(r => r[2].offset || 0),
      pendingVisible: page.data.list.some(o => o._id === 'order-20'), writes: db.writes.length });
    assert.ok(page.data.list.some(o => o._id === 'order-20'), '第21笔待报价订单无法从页面读取');
  });
  for (const name of ['other-merchant', 'suspended', 'invalid-offset', 'feature-off-history']) {
    await test('cloud-' + name, async record => {
      const db = setup();
      if (name === 'other-merchant') db.data.merchants[0].staffOpenids = ['other'];
      if (name === 'suspended') db.data.merchants[0].status = 'suspended';
      if (name === 'feature-off-history') { db.data.config[0].features.merchants = false; db.data.communities[0].features.merchants = false; }
      const result = await db.call('merchant', 'merchantOrders', { offset: name === 'invalid-offset' ? -1 : 0 });
      record({ ok: result.ok, code: result.code, count: result.data?.list.length, enabled: result.data?.list.filter(o => o.featureEnabled).length, writes: db.writes.length });
      if (name === 'feature-off-history') { assert.equal(result.ok, true); assert.ok(result.data.list.every(o => !o.featureEnabled)); }
      else assert.equal(result.ok, false);
      assert.equal(db.writes.length, 0);
    });
  }
  console.log(JSON.stringify({ scope: 'synthetic database; query order prearranged descending, not a real cloud index test', pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length, results }, null, 2));
  if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
