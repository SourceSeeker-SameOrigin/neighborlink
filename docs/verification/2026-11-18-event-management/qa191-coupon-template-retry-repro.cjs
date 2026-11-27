// Actual P28 admin page with intercepted coupon API and synthetic templates.
// No CloudBase write or coupon issuance.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

(async () => {
  const templates = [];
  const requests = [];
  const env = runtime(async (name, action, payload) => {
    assert.equal(name, 'coupon');
    if (action === 'adminTemplates') return { list: templates.slice() };
    assert.equal(action, 'saveTemplate');
    requests.push({ templateId: payload.templateId, name: payload.name });
    if (payload.templateId) return { templateId: payload.templateId };
    const record = { _id: `synthetic-template-${templates.length + 1}`, ...payload };
    templates.push(record);
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
  await first.save();
  assert.equal(templates.length, 2);
  first.onUnload();
  const reopened = await page();
  await reopened.save();
  assert.equal(templates.length, 3);
  assert(requests.every(item => !item.templateId));
  console.log(JSON.stringify({ scope: 'actual P28 page; synthetic API only',
    afterLostResponse: 1, afterSamePageRetry: 2, afterReentryRetry: templates.length,
    requestHasTemplateId: requests.some(item => !!item.templateId), issuedCoupons: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
