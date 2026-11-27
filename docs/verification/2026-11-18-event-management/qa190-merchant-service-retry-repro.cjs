// Actual P56 page code with an intercepted merchant API. No CloudBase write.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

async function scenario(priceTypeIndex) {
  const records = [];
  const requests = [];
  let lookupCalls = 0;
  const env = runtime(async (name, action, data) => {
    assert.equal(name, 'merchant');
    if (action === 'myServices') return { list: records.slice(), hasMore: false };
    if (action === 'lookupService') {
      lookupCalls++;
      if (lookupCalls === 1) throw Error('合成查询暂不可用');
      return { serviceId: records.find(item => item.requestId === data.requestId)?._id || null };
    }
    assert.equal(action, 'upsertService');
    requests.push({ serviceId: data.serviceId, requestId: data.requestId, title: data.title, priceType: data.priceType });
    let record = records.find(item => item.requestId === data.requestId);
    if (!record) { record = { _id: `synthetic-service-${records.length + 1}`, ...data }; records.push(record); }
    if (requests.length === 1) throw Error('合成响应丢失，保存已完成');
    return { serviceId: record._id };
  });
  env.app.globalData.user = { _id: 'merchant-user', roles: ['merchant'], merchantId: 'merchant-a' };
  async function page() {
    const instance = env.instance('miniprogram/merchant/services/services.js');
    await instance.onShow();
    assert.equal(instance.data.ready, true);
    instance.setData({ title: '合成服务', desc: '隔离测试', priceTypeIndex, price: '5.00' });
    return instance;
  }
  const first = await page();
  await first.save();
  assert.equal(records.length, 1);
  assert.equal(first.data.title, '合成服务');
  assert.equal(first.data.recoveryError, true);
  await first.save();
  assert.equal(records.length, 1);
  first.onUnload();
  const reopened = env.instance('miniprogram/merchant/services/services.js');
  await reopened.onShow();
  assert.equal(reopened.data.recoveredServiceId, records[0]._id);
  await reopened.save();
  assert.equal(records.length, 1);
  reopened.startNewService();
  reopened.setData({ title: '下一项服务', desc: '隔离测试', priceTypeIndex, price: '5.00' });
  await reopened.save();
  assert.equal(records.length, 2);
  assert(requests.every(item => !item.serviceId));
  return { priceType: priceTypeIndex ? 'quote' : 'fixed',
    afterLostResponse: 1, afterSamePageRetry: 1, afterReentryRetry: 1,
    afterExplicitNewService: records.length, requestHasServiceId: requests.some(item => !!item.serviceId) };
}

(async () => {
  const cases = [await scenario(0), await scenario(1)];
  const cloud = fixture({ global: true, local: true, roles: ['resident', 'merchant'], allowWrites: true,
    securityResult: { result: { suggest: 'pass' } }, records: { merchants: [{ _id: 'merchant-a',
      status: 'approved', staffOpenids: ['actor'], communityIds: ['c'] }] } });
  const payload = { requestId: 'service-request-01', title: '合成服务', desc: '隔离测试',
    priceType: 'fixed', price: 500, unit: '次', status: 'off', images: [] };
  const first = await cloud.call('merchant', 'upsertService', payload);
  const replay = await cloud.call('merchant', 'upsertService', payload);
  const found = await cloud.call('merchant', 'lookupService', { requestId: payload.requestId });
  const changed = await cloud.call('merchant', 'upsertService', { ...payload, title: '不同服务' });
  assert.equal(first.ok, true); assert.equal(replay.data.serviceId, first.data.serviceId);
  assert.equal(found.data.serviceId, first.data.serviceId);
  assert.equal(changed.code, 'E_CONFLICT');
  assert.equal(cloud.data.merchantServices.length, 1);
  console.log(JSON.stringify({ scope: 'actual P56 page and merchant cloud entry; synthetic database only', cases,
    cloudReplaySameService: replay.data.serviceId === first.data.serviceId,
    changedIntentRejected: changed.code, syntheticServices: cloud.data.merchantServices.length }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
