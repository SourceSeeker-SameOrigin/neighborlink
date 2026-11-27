// Actual chat.list cloud entry and P34 page with synthetic conversations.
// No CloudBase read/write or real message.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(hiddenPrefix) {
  const count = hiddenPrefix ? 100 : 101;
  const conversations = Array.from({ length: count }, (_, index) => ({
    _id: `conversation-${index}`, type: 'order', members: ['actor'],
    refId: hiddenPrefix ? `missing-${index}` : `order-${index}`,
    lastAt: new Date(2026, 10, 26, 12, 0, count - index),
    lastMessage: '合成消息', unread: { actor: 1 }
  }));
  if (hiddenPrefix) conversations.push({ _id: 'conversation-visible', type: 'order', members: ['actor'],
    refId: 'order-visible', lastAt: new Date(2026, 10, 25), lastMessage: '合成可见消息',
    unread: { actor: 7 } });
  const orders = (hiddenPrefix ? ['visible'] : Array.from({ length: 101 }, (_, i) => i))
    .map(value => ({ _id: `order-${value}`, userOpenid: 'actor', communityId: 'c', serviceCode: 'trash', status: 'paid' }));
  const cloud = fixture({ local: true, global: true, records: { conversations, orders } });
  const response = await cloud.call('chat', 'list');
  assert.equal(response.ok, true, JSON.stringify(response));
  const env = runtime(async (name, action) => {
    assert.equal(name, 'chat'); assert.equal(action, 'list'); return response.data;
  });
  env.app.globalData.user = { _id: 'u', openid: 'actor', communityId: 'c', roles: ['resident'] };
  const page = env.instance('miniprogram/chat/list/list.js');
  await page.onShow();
  assert.equal(typeof page.loadMore, 'undefined');
  const expected = hiddenPrefix ? 1 : 101;
  const observed = page.data.list.length;
  assert.equal(observed, hiddenPrefix ? 0 : 100);
  return { case: hiddenPrefix ? '100-inaccessible-before-one-visible' : '101-visible',
    expectedVisible: expected, displayed: observed, expectedUnread: hiddenPrefix ? 7 : 101,
    displayedUnread: page.data.unreadTotal, paginationEntry: false, realCloudWrites: cloud.writes.length };
}

(async () => {
  console.log(JSON.stringify({ scope: 'actual chat.list entry and P34 page; synthetic database only',
    cases: [await scenario(false), await scenario(true)] }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
