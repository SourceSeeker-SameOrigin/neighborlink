// Actual station.providerHall and P64 page against synthetic batches only.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function run(visibleIndexes, turns) {
  const backend = fixture({ local: true, roles: ['provider'], orderedQueries: true });
  backend.data.providers = [{ _id: 'provider-1', openid: 'actor', status: 'approved', level: 1,
    onDuty: true, communityId: 'c', insuranceUntil: new Date(Date.now() + 86400000) }];
  backend.data.deliveryBatches = Array.from({ length: 21 }, (_, index) => ({
    _id: `batch-${String(index + 1).padStart(2, '0')}`, communityId: 'c', stationCode: 'A',
    status: 'open', createdAt: new Date(Date.now() + index * 1000),
    priceSnapshot: { perPiece: 50, perPiecePayout: 40 },
    items: [{ _id: 'item-' + index, consented: visibleIndexes.includes(index), status: 'pending' }]
  }));
  const ui = runtime(async (name, action, input) => {
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = { _id: 'provider-1', roles: ['provider'], communityId: 'c' };
  const page = ui.instance('miniprogram/station/worker/worker.js');
  await page.onShow();
  for (let index = 1; index < turns; index++) await page.load();
  return { offsets: Array.from(ui.requests.filter(item => item[1] === 'providerHall'), item => item[2].offset),
    batchIds: Array.from(page.data.list, item => item._id), hasMore: page.data.hasMore,
    pageError: page.data.pageError, error: page.data.error };
}

(async () => {
  const all = Array.from({ length: 21 }, (_, index) => index);
  const normal = await run(all, 2);
  const hiddenFirstPage = await run([20], 2);
  const partlyVisible = await run([0, 20], 3);
  assert.deepEqual(normal.offsets, [0, 20]);
  assert.equal(normal.batchIds.length, 21);
  assert.deepEqual(hiddenFirstPage.offsets, [0]);
  assert.deepEqual(hiddenFirstPage.batchIds, []);
  assert.equal(hiddenFirstPage.hasMore, false);
  assert.match(hiddenFirstPage.error, /分页结果异常/);
  assert.deepEqual(partlyVisible.offsets, [0, 1, 2]);
  assert.deepEqual(partlyVisible.batchIds, ['batch-01', 'batch-21']);
  console.log(JSON.stringify({ scope: 'actual station function and P64 page; synthetic batches, zero cloud writes',
    normal, hiddenFirstPage, partlyVisible }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
