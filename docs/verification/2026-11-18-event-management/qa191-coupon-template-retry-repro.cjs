// Actual P28 admin page with intercepted coupon API and synthetic templates.
// No CloudBase write or coupon issuance.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

(async () => {
  const templates = [];
  const requests = [];
  let lookupCalls = 0;
  const env = runtime(async (name, action, payload) => {
    assert.equal(name, 'coupon');
    if (action === 'adminTemplates') return { list: templates.slice() };
    if (action === 'lookupTemplate') {
      lookupCalls++;
      if (lookupCalls === 1) throw Error('合成查询暂不可用');
      return { templateId: templates.find(item => item.requestId === payload.requestId)?._id || null };
    }
    assert.equal(action, 'saveTemplate');
    requests.push({ templateId: payload.templateId, requestId: payload.requestId, name: payload.name });
    if (payload.templateId) return { templateId: payload.templateId };
    let record = templates.find(item => item.requestId === payload.requestId);
    if (!record) { record = { _id: `synthetic-template-${templates.length + 1}`, ...payload }; templates.push(record); }
    if (requests.length === 1) throw Error('合成响应丢失，模板已保存');
    return { templateId: record._id };
  });
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  async function page() {
    const instance = env.instance('miniprogram/admin/coupons/coupons.js');
    await instance.onShow();
    assert.equal(instance.data.loading, false);
    instance.setData({ 'form.name': '合成优惠券模板' });
    return instance;
  }
  const first = await page();
  await first.save();
  assert.equal(templates.length, 1);
  assert.equal(first.data.form.name, '合成优惠券模板');
  assert.equal(first.data.templateLookupError, true);
  await first.save();
  assert.equal(templates.length, 1);
  first.onUnload();
  const reopened = env.instance('miniprogram/admin/coupons/coupons.js');
  await reopened.onShow();
  assert.equal(reopened.data.recoveredTemplateId, templates[0]._id);
  await reopened.save();
  assert.equal(templates.length, 1);
  reopened.startNewTemplate();
  reopened.setData({ 'form.name': '下一张模板' });
  await reopened.save();
  assert.equal(templates.length, 2);
  assert(requests.every(item => !item.templateId));
  const cloud = fixture({ roles: ['admin'], allowWrites: true, records: {} });
  const payload = { requestId: 'template-request-01', name: '合成模板', kind: 'amount_off', value: 100,
    maxOff: 100, threshold: 0, services: ['all'], validDays: 7, totalLimit: 5,
    perUserLimit: 1, issueMode: 'manual', communityIds: 'all', status: 'active' };
  const created = await cloud.call('coupon', 'saveTemplate', payload);
  const replay = await cloud.call('coupon', 'saveTemplate', payload);
  const found = await cloud.call('coupon', 'lookupTemplate', { requestId: payload.requestId });
  const changed = await cloud.call('coupon', 'saveTemplate', { ...payload, name: '其他模板' });
  assert.equal(created.ok, true); assert.equal(replay.data.templateId, created.data.templateId);
  assert.equal(found.data.templateId, created.data.templateId);
  assert.equal(changed.code, 'E_CONFLICT');
  assert.equal(cloud.data.couponTemplates.length, 1);
  console.log(JSON.stringify({ scope: 'actual P28 page; synthetic API only',
    afterLostResponse: 1, afterSamePageRetry: 1, afterReentryRetry: 1,
    afterExplicitNewTemplate: templates.length, cloudReplaySameTemplate: replay.data.templateId === created.data.templateId,
    changedIntentRejected: changed.code, requestHasTemplateId: requests.some(item => !!item.templateId), issuedCoupons: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
