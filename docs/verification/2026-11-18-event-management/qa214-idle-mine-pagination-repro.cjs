// Actual P44 page and idle.mine with 21 synthetic items; no CloudBase writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const now = Date.now();
const idleItems = Array.from({ length: 21 }, (_, index) => ({
  _id: 'mine-' + String(index + 1).padStart(2, '0'),
  sellerOpenid: 'actor', communityId: 'c', scope: 'community',
  tradeMode: 'escrow', title: '合成商品' + (index + 1), desc: '仅用于分页检查',
  category: 'other', condition: 'used', price: 500, images: [],
  status: index === 20 ? 'on_sale' : 'sold', createdAt: new Date(now - index * 1000)
}));
const backend = fixture({ global: true, local: true, orderedQueries: true,
  records: { idleItems } });
let failNextPage = false;
const ui = runtime(async (name, action, input) => {
  if (failNextPage && action === 'mine' && input.offset === 20) {
    failNextPage = false; throw Error('合成续页断网');
  }
  const response = await backend.call(name, action, input);
  if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
  return response.data;
});
ui.app.globalData.user = backend.data.users[0];

(async () => {
  const page = ui.instance('miniprogram/idle/mine/mine.js');
  await page.onShow();
  const first = await backend.call('idle', 'mine', { offset: 0 });
  const second = await backend.call('idle', 'mine', { offset: 20 });
  assert.equal(first.ok, true);
  assert.equal(first.data.list.length, 20);
  assert.equal(first.data.hasMore, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.list.length, 1);
  assert.equal(second.data.list[0]._id, 'mine-21');
  assert.equal(second.data.list[0].status, 'on_sale');
  assert.equal(page.data.list.length, 20);
  assert.equal(page.data.hasMore, true);
  failNextPage = true;
  await page.more();
  assert.equal(page.data.list.length, 20);
  assert.match(page.data.moreError, /断网/);
  await page.more();
  assert.equal(page.data.list.length, 21);
  assert.equal(page.data.list.some(item => item._id === 'mine-21'), true);
  assert.equal(page.data.hasMore, false);
  assert.equal(typeof page.more, 'function');
  const requests = ui.requests.filter(request => request[0] === 'idle' && request[1] === 'mine');
  assert.equal(requests.length, 3);
  assert.equal(requests[0][2].offset, 0);
  assert.equal(requests[1][2].offset, 20);
  assert.equal(requests[2][2].offset, 20);
  const template = fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/idle/mine/mine.wxml'), 'utf8');
  assert.match(template, /加载更多/);
  assert.equal(backend.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P44 page and idle.mine; synthetic items',
    displayed: page.data.list.length, firstHasMore: first.data.hasMore,
    unreachableItem: { id: second.data.list[0]._id, status: second.data.list[0].status },
    pageHasMoreAction: typeof page.more !== 'undefined', realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
