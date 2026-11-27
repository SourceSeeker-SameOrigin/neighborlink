// Actual P56 page code with an intercepted merchant API. No CloudBase write.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(priceTypeIndex) {
  const records = [];
  const requests = [];
  const env = runtime(async (name, action, data) => {
    assert.equal(name, 'merchant');
    if (action === 'myServices') return { list: records.slice(), hasMore: false };
    assert.equal(action, 'upsertService');
    requests.push({ serviceId: data.serviceId, title: data.title, priceType: data.priceType });
    const record = { _id: `synthetic-service-${records.length + 1}`, ...data };
    records.push(record);
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
  await first.save();
  assert.equal(records.length, 2);
  first.onUnload();
  const reopened = await page();
  await reopened.save();
  assert.equal(records.length, 3);
  assert(requests.every(item => !item.serviceId));
  return { priceType: priceTypeIndex ? 'quote' : 'fixed',
    afterLostResponse: 1, afterSamePageRetry: 2, afterReentryRetry: records.length,
    requestHasServiceId: requests.some(item => !!item.serviceId) };
}

(async () => {
  const cases = [await scenario(0), await scenario(1)];
  console.log(JSON.stringify({ scope: 'actual P56 page; intercepted API and synthetic writes only', cases }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
