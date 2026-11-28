// Reproduce result-lost publishing with actual P40/P43 page code and a local
// deterministic-id model matching board/idle create. No CloudBase call.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

async function scenario(kind, mode) {
  const creates = [];
  const records = new Set();
  const env = runtime(async (name, action, payload) => {
    if (name === 'catalog' && action === 'getCommunity') {
      return { _id: 'community-1', dutyWindows: [{ start: '09:00', end: '12:00' }],
        enabledFeatures: { board: true, travelCarry: true, idle: true, idleEscrow: true } };
    }
    if (name !== kind) throw Error(`Unexpected ${name}.${action}`);
    const id = crypto.createHash('sha256').update(`openid-1:${payload.requestId}`).digest('hex').slice(0, 36);
    if (action === 'lookupRequest') return kind === 'board'
      ? { postId: records.has(id) ? id : null, orderId: records.has(id) && mode === 'task' ? 'order-' + id : null }
      : { itemId: records.has(id) ? id : null };
    if (action !== 'create') throw Error(`Unexpected ${name}.${action}`);
    records.add(id);
    creates.push({ requestId: payload.requestId, id });
    // The first write committed, but its response never reached the page.
    if (creates.length === 1) throw Error('合成响应丢失');
    return kind === 'board' ? { postId: id, orderId: 'order-' + id, paymentError: true,
      imageWarnings: [] } : { itemId: id, imageWarnings: [] };
  });
  env.app.globalData.user = { _id: 'user-1', openid: 'openid-1', communityId: 'community-1', roles: ['resident'] };
  const path = kind === 'board' ? 'miniprogram/board/create/create.js' : 'miniprogram/idle/create/create.js';
  async function page() {
    const instance = env.instance(path);
    instance.onLoad(kind === 'board' ? { type: mode } : {});
    await instance.onShow();
    assert.equal(instance.data.ready, true);
    if (kind === 'board') instance.setData({ title: '测试求助', content: '仅用于隔离测试的求助描述',
      ...(mode === 'carry' ? { destination: '合成目的地', disclaimerAgreed: true } : {}) });
    else instance.setData({ title: '测试闲置', desc: '仅用于隔离测试的商品描述', priceYuan: '5.00',
      ...(mode === 'escrow' ? { tradeMode: 'escrow', tradeModeIndex: 1 } : {}) });
    return instance;
  }
  const first = await page();
  await first.submit();
  assert.equal(first.data.busy, false);
  const firstRequestId = creates[0].requestId;
  // A retry on the same page navigates to the committed item without a new create.
  await first.submit();
  assert.equal(creates.length, 1);
  first.onUnload();
  env.app.globalData.user = { _id: 'user-2', openid: 'openid-2', communityId: 'community-1', roles: ['resident'] };
  const otherUser = await page();
  assert.notEqual(otherUser.requestId, firstRequestId);
  otherUser.onUnload();
  env.app.globalData.user = { _id: 'user-1', openid: 'openid-1', communityId: 'community-1', roles: ['resident'] };
  const reopened = await page();
  await reopened.submit();
  assert.equal(creates.length, 1);
  assert.equal(reopened.requestId, firstRequestId);
  reopened.startNewRequest();
  await reopened.submit();
  assert.equal(records.size, 2);
  return { kind, mode, samePageCreates: 1, reentryCreates: 1,
    explicitNewCreates: records.size, uniqueSyntheticRecords: records.size,
    calls: creates.length };
}

(async () => {
  const cases = [];
  for (const mode of ['ask', 'carry', 'task']) cases.push(await scenario('board', mode));
  for (const mode of ['offline', 'escrow']) cases.push(await scenario('idle', mode));
  const cloud = fixture({ global: true, local: true, allowWrites: true,
    securityResult: { result: { suggest: 'pass' } } });
  const post = { requestId: 'board-request-01', communityId: 'c', type: 'ask', scope: 'community',
    title: '合成求助', content: '仅限隔离测试', images: [] };
  const firstPost = await cloud.call('board', 'create', post);
  const replayPost = await cloud.call('board', 'create', post);
  const foundPost = await cloud.call('board', 'lookupRequest', { requestId: post.requestId });
  const changedPost = await cloud.call('board', 'create', { ...post, title: '其他求助' });
  assert.equal(firstPost.ok, true, JSON.stringify(firstPost));
  assert.equal(replayPost.data.postId, firstPost.data.postId);
  assert.equal(foundPost.data.postId, firstPost.data.postId);
  assert.equal(changedPost.code, 'E_CONFLICT');
  const item = { requestId: 'idle-request-01', communityId: 'c', item: { title: '合成闲置',
    desc: '仅限隔离测试', category: '其他', price: 500, condition: 'used', tradeMode: 'offline',
    negotiable: true, images: [], scope: 'community' } };
  const firstItem = await cloud.call('idle', 'create', item);
  const replayItem = await cloud.call('idle', 'create', item);
  const foundItem = await cloud.call('idle', 'lookupRequest', { requestId: item.requestId });
  const changedItem = await cloud.call('idle', 'create', { ...item, item: { ...item.item, price: 600 } });
  assert.equal(firstItem.ok, true, JSON.stringify(firstItem));
  assert.equal(replayItem.data.itemId, firstItem.data.itemId);
  assert.equal(foundItem.data.itemId, firstItem.data.itemId);
  assert.equal(changedItem.code, 'E_CONFLICT');
  console.log(JSON.stringify({ scope: 'actual page and cloud entry; synthetic database only', cases,
    cloudPostReplay: replayPost.data.postId === firstPost.data.postId,
    cloudIdleReplay: replayItem.data.itemId === firstItem.data.itemId,
    changedIntentRejected: [changedPost.code, changedItem.code], realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
