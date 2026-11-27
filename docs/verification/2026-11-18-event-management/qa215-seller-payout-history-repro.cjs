// Actual P47 page and payout.list; synthetic history only, no CloudBase writes.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const now = Date.now();
const payouts = Array.from({ length: 21 }, (_, index) => ({
  _id: 'payout-' + String(index + 1).padStart(2, '0'), payeeOpenid: 'actor',
  payeeType: index === 20 ? 'seller' : 'provider', amount: 1000,
  state: 'success', createdAt: new Date(now - index * 1000)
}));
const backend = fixture({ global: true, local: true, orderedQueries: true,
  records: { payouts, ledger: [] } });
const ui = runtime(async (name, action, input) => {
  const response = await backend.call(name, action, input);
  if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
  return response.data;
});
ui.app.globalData.user = backend.data.users[0];

(async () => {
  const page = ui.instance('miniprogram/idle/income/income.js');
  await page.onShow();
  const first = await backend.call('payout', 'list', { offset: 0 });
  const second = await backend.call('payout', 'list', { offset: 20 });
  assert.equal(first.ok, true);
  assert.equal(first.data.list.length, 20);
  assert.equal(first.data.hasMore, true);
  assert.equal(first.data.list.every(item => item.payeeType === 'provider'), true);
  assert.equal(second.ok, true);
  assert.equal(second.data.list.length, 1);
  assert.equal(second.data.list[0].payeeType, 'seller');
  assert.equal(page.data.ready, true);
  assert.equal(page.data.payouts.length, 0);
  const requests = ui.requests.filter(request => request[0] === 'payout' && request[1] === 'list');
  assert.equal(requests.length, 1);
  assert.equal(requests[0][2].offset, undefined);
  assert.equal(typeof page.more, 'undefined');
  assert.equal(backend.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P47 page and payout.list; synthetic payouts',
    firstPageTypes: [...new Set(first.data.list.map(item => item.payeeType))],
    firstHasMore: first.data.hasMore, displayedSellerPayouts: page.data.payouts.length,
    unreachableSellerPayout: second.data.list[0].payoutId, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
