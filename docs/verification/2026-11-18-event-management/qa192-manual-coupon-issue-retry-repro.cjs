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
  assert.match(page.data.issueRecoveryHint, /已查到 1 张/);
  cloud.data.users.push({ _id: 'u2', openid: 'recipient-2', communityId: 'c', roles: ['resident'] });
  const changed = await cloud.call('coupon', 'manualIssue', { templateId: 'synthetic-template',
    requestId: page.pendingIssue.requestId, userIds: ['u', 'u2'] });
  assert.equal(changed.code, 'E_CONFLICT');
  assert.equal(cloud.data.coupons.length, 1);
  await page.issue();
  assert.equal(cloud.data.coupons.length, 1);
  assert.equal(cloud.data.couponTemplates[0].issued, 1);
  await page.issue();
  assert.equal(cloud.data.coupons.length, 2);
  assert.equal(cloud.data.couponTemplates[0].issued, 2);
  const partial = fixture({ roles: ['admin'], global: true, local: true, allowWrites: true,
    records: { couponTemplates: [{ _id: 'partial-template', name: '合成批量券', status: 'active',
      issueMode: 'manual', communityIds: 'all', issued: 0, totalLimit: 5, perUserLimit: 1, validDays: 7 }],
    users: [{ _id: 'u', openid: 'actor', communityId: 'c', roles: ['admin'] },
      { _id: 'u2', openid: 'recipient-2', communityId: 'c2', roles: ['resident'] }],
    communities: [{ _id: 'c', status: 'active', features: { coupons: true } },
      { _id: 'c2', status: 'active', features: { coupons: false } }] } });
  const batch = { templateId: 'partial-template', requestId: 'partial_batch_1', userIds: ['u', 'u2'] };
  const firstPartial = await partial.call('coupon', 'manualIssue', batch);
  assert.equal(firstPartial.ok, true, JSON.stringify(firstPartial));
  assert.equal(firstPartial.data.issued, 1);
  assert.equal(firstPartial.data.failures.length, 1);
  assert.equal(partial.data.coupons.length, 1);
  const firstLookup = await partial.call('coupon', 'lookupManualIssue', batch);
  assert.equal(firstLookup.data.issued, 1);
  assert.equal(firstLookup.data.expected, 2);
  partial.data.communities.find(item => item._id === 'c2').features.coupons = true;
  const resumed = await partial.call('coupon', 'manualIssue', batch);
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(resumed.data.issued, 1);
  assert.equal(resumed.data.duplicates, 1);
  assert.equal(partial.data.coupons.length, 2);
  assert.equal(partial.data.couponTemplates[0].issued, 2);
  const finalLookup = await partial.call('coupon', 'lookupManualIssue', batch);
  assert.equal(finalLookup.data.issued, 2);
  assert.equal(finalLookup.data.expected, 2);
  console.log(JSON.stringify({ scope: 'actual P28 page and coupon entry; synthetic database only',
    issueCalls, couponsAfterRetry: 1, couponsAfterNewBatch: cloud.data.coupons.length,
    templateIssued: cloud.data.couponTemplates[0].issued,
    changedBatchRejected: changed.code,
    sameRecipient: cloud.data.coupons.every(row => row.openid === 'actor'),
    partialBatch: { firstIssued: firstPartial.data.issued, resumedIssued: resumed.data.issued,
      resumedDuplicates: resumed.data.duplicates, finalIssued: finalLookup.data.issued },
    realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
