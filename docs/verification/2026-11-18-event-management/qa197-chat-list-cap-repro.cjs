// Actual chat.list cloud entry and P34 page with synthetic conversations.
// No CloudBase read/write or real message.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(hiddenPrefix, tied = false) {
  const count = hiddenPrefix ? 100 : 101;
  const conversations = Array.from({ length: count }, (_, index) => ({
    _id: `conversation-${index}`, type: 'order', members: ['actor'],
    refId: hiddenPrefix ? `missing-${index}` : `order-${index}`,
    lastAt: tied ? new Date(2026, 10, 26, 12) : new Date(2026, 10, 26, 12, 0, count - index),
    lastMessage: '合成消息', unread: { actor: 1 }
  }));
  if (hiddenPrefix) conversations.push({ _id: 'conversation-visible', type: 'order', members: ['actor'],
    refId: 'order-visible', lastAt: new Date(2026, 10, 25), lastMessage: '合成可见消息',
    unread: { actor: 7 } });
  const orders = (hiddenPrefix ? ['visible'] : Array.from({ length: 101 }, (_, i) => i))
    .map(value => ({ _id: `order-${value}`, userOpenid: 'actor', communityId: 'c', serviceCode: 'trash', status: 'paid' }));
  const cloud = fixture({ local: true, global: true, orderedQueries: true,
    records: { conversations, orders } });
  let conversationReads = 0;
  const collection = cloud.db.collection.bind(cloud.db);
  cloud.db.collection = table => {
    const query = collection(table);
    if (table === 'conversations') {
      const get = query.get.bind(query);
      query.get = async () => { conversationReads++; return get(); };
    }
    return query;
  };
  const env = runtime(async (name, action, input) => {
    assert.equal(name, 'chat'); assert.equal(action, 'list');
    const response = await cloud.call('chat', action, input);
    assert.equal(response.ok, true, JSON.stringify(response));
    return response.data;
  });
  env.app.globalData.user = { _id: 'u', openid: 'actor', communityId: 'c', roles: ['resident'] };
  const page = env.instance('miniprogram/chat/list/list.js');
  await page.onShow();
  const initialReads = conversationReads;
  assert.equal(initialReads, 2);
  assert.equal(typeof page.loadMore, 'function');
  assert.equal(page.data.unreadTotal, hiddenPrefix ? 7 : 101);
  if (!hiddenPrefix) {
    assert.equal(page.data.list.length, 20);
    while (page.data.hasMore) await page.loadMore();
  }
  const expected = hiddenPrefix ? 1 : 101;
  const observed = page.data.list.length;
  assert.equal(observed, expected);
  if (!hiddenPrefix) assert.equal(conversationReads, 7);
  return { case: hiddenPrefix ? '100-inaccessible-before-one-visible' : tied ? '101-equal-time' : '101-visible',
    expectedVisible: expected, displayed: observed, expectedUnread: hiddenPrefix ? 7 : 101,
    displayedUnread: page.data.unreadTotal, paginationEntry: true,
    initialConversationReads: initialReads, totalConversationReads: conversationReads,
    realCloudWrites: cloud.writes.length };
}

(async () => {
  console.log(JSON.stringify({ scope: 'actual chat.list entry and P34 page; synthetic database only',
    cases: [await scenario(false), await scenario(true), await scenario(false, true)] }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
