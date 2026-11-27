// Actual P68 page with a local model of orderWrite's request ID rule.
// No CloudBase call or real recycle reservation.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

async function scenario(reentry) {
  const requests = [];
  const records = new Set();
  const env = runtime(async (name, action, payload) => {
    assert.equal(name, 'order');
    if (action === 'quote') return { slots: ['2026-12-01 10:00'], pricing: { total: 0 }, validationMessage: '' };
    if (action === 'lookupRequest') {
      const id = 'o_' + crypto.createHash('sha256').update(`openid-a:${payload.requestId}`).digest('hex').slice(0, 40);
      return { orderId: records.has(id) ? id : null };
    }
    assert.equal(action, 'create');
    const id = 'o_' + crypto.createHash('sha256').update(`openid-a:${payload.requestId}`).digest('hex').slice(0, 40);
    requests.push({ requestId: payload.requestId, id });
    records.add(id);
    if (requests.length === 1) throw Error('合成响应丢失，预约已创建');
    return { orderId: id };
  });
  env.app.globalData.user = { _id: 'resident-a', openid: 'openid-a', communityId: 'community-a', roles: ['resident'] };
  async function page() {
    const instance = env.instance('miniprogram/recycle/order/order.js');
    await instance.onLoad();
    if (!instance.data.createdOrderId) {
      await instance.category({ currentTarget: { dataset: { code: 'paper' } } });
      assert.equal(instance.data.pricing.total, 0);
    }
    return instance;
  }
  const first = await page();
  await first.create();
  assert.equal(records.size, 1);
  const receiptAfterLostResponse = Boolean(env.store['recycleOrderReceipt:resident-a']);
  const requestAfterLostResponse = Boolean(env.store['recycleOrderRequest:resident-a:community-a']);
  assert.equal(receiptAfterLostResponse, false);
  assert.equal(requestAfterLostResponse, true);
  const second = reentry ? (first.onUnload(), await page()) : first;
  await second.create();
  assert.equal(requests.length, reentry ? 1 : 2);
  assert.equal(records.size, 1);
  return { retry: reentry ? 'reentry' : 'same-page', sameRequestId: reentry ? true : requests[0].requestId === requests[1].requestId,
    syntheticOrders: records.size, persistedReceiptAfterLostResponse: receiptAfterLostResponse,
    persistedRequestAfterLostResponse: requestAfterLostResponse };
}

(async () => {
  const lookupId = 'recycle-lookup-195';
  const originalId = 'o_' + crypto.createHash('sha256').update(`actor:${lookupId}`).digest('hex').slice(0, 40);
  const cloud = fixture({ records: { orders: [{ _id: originalId, kind: 'service', userOpenid: 'actor' }] } });
  const found = await cloud.call('order', 'lookupRequest', { requestId: lookupId });
  assert.equal(found.ok, true);
  assert.equal(found.data.orderId, originalId);
  assert.equal(cloud.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P68 page and local deterministic ID model; no cloud write',
    cases: [await scenario(false), await scenario(true)], existingLookupFindsOriginal: true }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
