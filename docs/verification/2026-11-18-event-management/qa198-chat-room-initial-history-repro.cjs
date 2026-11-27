// Actual chat.pull, chat.markRead and P35 room with synthetic messages only.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

(async () => {
  const conversationId = 'conversation-101';
  const messages = Array.from({ length: 101 }, (_, index) => ({
    _id: `${conversationId}_${String(index + 1).padStart(12, '0')}`,
    convId: conversationId, from: 'provider', type: 'text', status: 'ok',
    content: `message-${index + 1}`, createdAt: new Date(2026, 10, 26, 12, index)
  }));
  const cloud = fixture({ local: true, global: true, allowWrites: true, records: {
    orders: [{ _id: 'order-101', kind: 'service', userOpenid: 'actor', providerOpenid: 'provider',
      communityId: 'c', serviceCode: 'trash', status: 'accepted' }],
    conversations: [{ _id: conversationId, type: 'order', refId: 'order-101',
      communityId: 'c', members: ['actor', 'provider'], unread: { actor: 1 }, closedAt: null }],
    messages
  } });
  const actions = [];
  const env = runtime(async (name, action, input) => {
    assert.equal(name, 'chat');
    actions.push(action);
    const response = await cloud.call('chat', action, input);
    assert.equal(response.ok, true, JSON.stringify(response));
    return response.data;
  });
  env.app.globalData.user = { _id: 'u', openid: 'actor', communityId: 'c', roles: ['resident'] };
  const page = env.instance('miniprogram/chat/room/room.js');
  page.onLoad({ conversationId });
  await page.onShow();
  const initial = { messagesShown: page.data.messages.length,
    lastShown: page.data.messages.at(-1)?.content,
    newestMessage: messages.at(-1).content,
    pulls: actions.filter(action => action === 'pull').length,
    markReads: actions.filter(action => action === 'markRead').length };
  assert.equal(initial.messagesShown, 50);
  assert.equal(initial.lastShown, 'message-50');
  assert.equal(initial.markReads, 1);
  await page.pull(page.context);
  await page.pull(page.context);
  const afterTwoPolls = { messagesShown: page.data.messages.length,
    lastShown: page.data.messages.at(-1)?.content,
    additionalPulls: actions.filter(action => action === 'pull').length - initial.pulls };
  assert.equal(afterTwoPolls.messagesShown, 101);
  page.onHide();
  console.log(JSON.stringify({ scope: 'actual cloud chat handlers and P35 page; synthetic records',
    initial, afterTwoPolls, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
