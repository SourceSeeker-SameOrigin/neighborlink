// Actual P28 page and coupon cloud entry against a synthetic database only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');

(async () => {
  const cloud = fixture({ roles: ['admin'], global: true, local: true, allowWrites: true,
    records: { couponTemplates: [{ _id: 'synthetic-template', name: '合成手动券', status: 'active',
      issueMode: 'manual', communityIds: 'all', issued: 0, totalLimit: 5, perUserLimit: 2, validDays: 7 }] } });
  let issueCalls = 0;
  const env = runtime(async (name, action, payload) => {
    assert.equal(name, 'coupon');
    const result = await cloud.call(name, action, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (action === 'manualIssue' && ++issueCalls === 1) throw Error('合成响应丢失，券已发放');
    return result.data;
  });
  env.app.globalData.user = { _id: 'u', openid: 'actor', roles: ['admin'], communityId: 'c' };
  const page = env.instance('miniprogram/admin/coupons/coupons.js');
  await page.onShow();
  page.setData({ 'form.userIdsText': 'u', 'form.issueTemplateId': 'synthetic-template' });
  await page.issue();
  assert.equal(cloud.data.coupons.length, 1);
  await page.issue();
  assert.equal(cloud.data.coupons.length, 2);
  assert.equal(cloud.data.couponTemplates[0].issued, 2);
  console.log(JSON.stringify({ scope: 'actual P28 page and coupon entry; synthetic database only',
    issueCalls, couponsAfterRetry: cloud.data.coupons.length, templateIssued: cloud.data.couponTemplates[0].issued,
    sameRecipient: cloud.data.coupons.every(row => row.openid === 'actor'), realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
