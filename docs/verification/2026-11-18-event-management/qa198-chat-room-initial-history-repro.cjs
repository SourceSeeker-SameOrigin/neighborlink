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
  const cloud = fixture({ local: true, global: true, allowWrites: true, orderedQueries: true, records: {
    orders: [{ _id: 'order-101', kind: 'service', userOpenid: 'actor', providerOpenid: 'provider',
      communityId: 'c', serviceCode: 'trash', status: 'accepted' }],
    conversations: [{ _id: conversationId, type: 'order', refId: 'order-101',
      communityId: 'c', members: ['actor', 'provider'], unread: { actor: 1 }, closedAt: null }],
    messages
  } });
  const actions = [];
  let page;
  const env = runtime(async (name, action, input) => {
    assert.equal(name, 'chat');
    actions.push(action);
    if (action === 'markRead') assert.equal(page.data.messages.at(-1)?.content, 'message-101');
    const response = await cloud.call('chat', action, input);
    assert.equal(response.ok, true, JSON.stringify(response));
    return response.data;
  });
  env.app.globalData.user = { _id: 'u', openid: 'actor', communityId: 'c', roles: ['resident'] };
  page = env.instance('miniprogram/chat/room/room.js');
  page.onLoad({ conversationId });
  await page.onShow();
  const initial = { messagesShown: page.data.messages.length,
    lastShown: page.data.messages.at(-1)?.content,
    newestMessage: messages.at(-1).content,
    pulls: actions.filter(action => action === 'pull').length,
    markReads: actions.filter(action => action === 'markRead').length };
  assert.equal(initial.messagesShown, 50);
  assert.equal(initial.lastShown, 'message-101');
  assert.equal(initial.markReads, 1);
  assert.equal(page.data.hasOlder, true);
  await page.loadOlder();
  await page.loadOlder();
  const afterTwoPages = { messagesShown: page.data.messages.length,
    lastShown: page.data.messages.at(-1)?.content,
    firstShown: page.data.messages[0]?.content,
    additionalPulls: actions.filter(action => action === 'pull').length - initial.pulls };
  assert.equal(afterTwoPages.messagesShown, 101);
  assert.equal(afterTwoPages.firstShown, 'message-1');
  assert.equal(page.data.hasOlder, false);
  page.onHide();
  const raceMessages = messages.slice(0, 2).map(item => ({ ...item }));
  const race = fixture({ local: true, global: true, allowWrites: true, orderedQueries: true, records: {
    orders: [{ _id: 'order-101', kind: 'service', userOpenid: 'actor', providerOpenid: 'provider',
      communityId: 'c', serviceCode: 'trash', status: 'accepted' }],
    conversations: [{ _id: conversationId, type: 'order', refId: 'order-101', messageSeq: 2,
      communityId: 'c', members: ['actor', 'provider'], unread: { actor: 2 }, closedAt: null }],
    messages: raceMessages
  } });
  let conflictCount = 0, markCalls = 0;
  const raceEnv = runtime(async (name, action, input) => {
    if (action === 'markRead' && ++markCalls === 1) {
      race.data.messages.push({ ...messages[2] });
      race.data.conversations[0].messageSeq = 3;
      race.data.conversations[0].unread.actor = 3;
    }
    const response = await race.call(name, action, input);
    if (!response.ok) {
      if (response.code === 'E_CONFLICT') conflictCount++;
      throw Object.assign(Error(response.message), { code: response.code });
    }
    return response.data;
  });
  raceEnv.app.globalData.user = { _id: 'u', openid: 'actor', communityId: 'c', roles: ['resident'] };
  const racePage = raceEnv.instance('miniprogram/chat/room/room.js');
  racePage.onLoad({ conversationId });
  await racePage.onShow();
  assert.equal(conflictCount, 1);
  assert.equal(racePage.data.ready, true);
  assert.equal(racePage.data.messages.at(-1).content, 'message-2');
  await racePage.pull();
  assert.equal(racePage.data.messages.at(-1).content, 'message-3');
  assert.equal(markCalls, 2);
  racePage.onHide();
  console.log(JSON.stringify({ scope: 'actual cloud chat handlers and P35 page; synthetic records',
    initial, afterTwoPages, lateMessageConflict: conflictCount,
    caughtUpAfterNewMessage: markCalls === 2, syntheticWrites: cloud.writes.length }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
