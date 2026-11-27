// Actual provider.hall and P15 page against synthetic orders. No network or cloud writes.
const assert = require('assert');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function run(visibleIndexes, turns) {
  const provider = { _id: 'provider-1', openid: 'actor', status: 'approved', level: 1,
    onDuty: true, communityId: 'c', insuranceUntil: new Date(Date.now() + 86400000), certs: [] };
  const orders = Array.from({ length: 21 }, (_, index) => ({
    _id: `order-${String(index + 1).padStart(2, '0')}`, kind: 'service', communityId: 'c',
    status: 'paid', minLevel: 1, releasedProviderIds: [], createdAt: new Date(Date.now() + index * 1000),
    serviceCode: 'trash', requiredCert: visibleIndexes.includes(index) ? null : 'special',
    pricing: { listPrice: 500, payAmount: 500 }, rateSnapshot: { platform: 0.1, property: 0.1 },
    address: { buildingName: '测试楼' }
  }));
  const backend = fixture({ roles: ['resident'], records: { providers: [provider], orders }, orderedQueries: true });
  const ui = runtime(async (name, action, input) => {
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = { _id: 'u', roles: ['resident', 'provider'] };
  const page = ui.instance('miniprogram/provider/hall/hall.js');
  await page.onShow();
  for (let index = 1; index < turns; index++) await page.load();
  return { offsets: Array.from(ui.requests, request => request[2].offset),
    taskIds: Array.from(page.data.tasks, task => task._id), hasMore: page.data.hasMore, error: page.data.error };
}

(async () => {
  const normal = await run(Array.from({ length: 21 }, (_, index) => index), 2);
  const hiddenFirstPage = await run([20], 2);
  const partlyVisible = await run([0, 20], 3);
  assert.deepStrictEqual(normal.offsets, [0, 20]);
  assert.strictEqual(normal.taskIds.length, 21);
  assert.deepStrictEqual(hiddenFirstPage.offsets, [0, 20]);
  assert.deepStrictEqual(hiddenFirstPage.taskIds, ['order-21']);
  assert.strictEqual(hiddenFirstPage.hasMore, false);
  assert.deepStrictEqual(partlyVisible.offsets, [0, 20]);
  assert.deepStrictEqual(partlyVisible.taskIds, ['order-01', 'order-21']);
  console.log(JSON.stringify({ scope: 'actual provider.hall and P15 page, synthetic orders, zero cloud writes',
    normal, hiddenFirstPage, partlyVisible }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
