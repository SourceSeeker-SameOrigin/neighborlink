// Reproduce result-lost publishing with actual P40/P43 page code and a local
// deterministic-id model matching board/idle create. No CloudBase call.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(kind, mode) {
  const creates = [];
  const records = new Set();
  const env = runtime(async (name, action, payload) => {
    if (name === 'catalog' && action === 'getCommunity') {
      return { _id: 'community-1', dutyWindows: [{ start: '09:00', end: '12:00' }],
        enabledFeatures: { board: true, travelCarry: true, idle: true, idleEscrow: true } };
    }
    if (name !== kind || action !== 'create') throw Error(`Unexpected ${name}.${action}`);
    const id = crypto.createHash('sha256').update(`openid-1:${payload.requestId}`).digest('hex').slice(0, 36);
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
  // A retry on the same page keeps the request id and finds the committed item.
  await first.submit();
  const samePageRequestId = creates[1].requestId;
  first.onUnload();
  const reopened = await page();
  await reopened.submit();
  const reentryRequestId = creates[2].requestId;
  assert.equal(firstRequestId, samePageRequestId);
  assert.notEqual(reentryRequestId, firstRequestId);
  assert.equal(records.size, 2);
  return { kind, mode, samePageReusesId: firstRequestId === samePageRequestId,
    reentryReusesId: reentryRequestId === firstRequestId, uniqueSyntheticRecords: records.size,
    calls: creates.length };
}

(async () => {
  const cases = [];
  for (const mode of ['ask', 'carry', 'task']) cases.push(await scenario('board', mode));
  for (const mode of ['offline', 'escrow']) cases.push(await scenario('idle', mode));
  console.log(JSON.stringify({ scope: 'actual page code and local id model; no cloud write', cases }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
