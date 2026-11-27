// Actual P45 page and idle.sales with 21 synthetic orders; no CloudBase writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const now = Date.now();
const orders = Array.from({ length: 21 }, (_, index) => ({
  _id: 'sale-' + String(index + 1).padStart(2, '0'), kind: 'idle_purchase',
  sellerOpenid: 'actor', idleItemId: 'item-' + index,
  detail: { title: '合成商品' + (index + 1) }, pricing: { payAmount: 500 },
  // The only order requiring seller action sits just outside the first page.
  status: index === 20 ? 'paid' : 'completed', createdAt: new Date(now - index * 1000)
}));
const backend = fixture({ orderedQueries: true, records: { orders } });
const ui = runtime(async (name, action, input) => {
  const response = await backend.call(name, action, input);
  if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
  return response.data;
});
ui.app.globalData.user = backend.data.users[0];

(async () => {
  const page = ui.instance('miniprogram/idle/sales/sales.js');
  await page.onShow();
  const first = await backend.call('idle', 'sales', { offset: 0 });
  const second = await backend.call('idle', 'sales', { offset: 20 });
  assert.equal(first.ok, true);
  assert.equal(first.data.list.length, 20);
  assert.equal(first.data.hasMore, true);
  assert.equal(second.ok, true);
  assert.deepEqual(second.data.list.map(item => item._id), ['sale-21']);
  assert.equal(second.data.list[0].status, 'paid');
  assert.equal(page.data.list.length, 20);
  assert.equal(page.data.list.some(item => item._id === 'sale-21'), false);
  const pageRequests = ui.requests.filter(request => request[0] === 'idle');
  assert.equal(pageRequests.length, 1);
  assert.equal(pageRequests[0][2].offset, undefined);
  assert.equal(typeof page.more, 'undefined');
  const template = fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/idle/sales/sales.wxml'), 'utf8');
  assert.doesNotMatch(template, /加载更多/);
  assert.equal(backend.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P45 page and idle.sales; synthetic orders',
    firstPageCount: page.data.list.length, firstHasMore: first.data.hasMore,
    hiddenActionableOrder: second.data.list.map(item => ({ id: item._id, status: item.status })),
    pageHasMoreAction: typeof page.more !== 'undefined', cloudWrites: backend.writes.length }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
