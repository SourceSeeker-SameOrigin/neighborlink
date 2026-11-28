// Actual coupon.center entry and P36 page with synthetic templates. No cloud writes.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

(async () => {
  const templates = Array.from({ length: 101 }, (_, index) => ({
    _id: `template-${String(index + 1).padStart(3, '0')}`,
    name: `合成券${index + 1}`, kind: 'amount_off', value: 100,
    maxOff: 100, threshold: 0, validDays: 7, services: ['all'],
    issued: 0, totalLimit: 10, status: 'active', issueMode: 'claim', communityIds: 'all'
  }));
  const backend = fixture({ roles: ['resident'], global: true, local: true,
    records: { couponTemplates: templates } });
  const ui = runtime(async (name, action, input) => {
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = { _id: 'u', roles: ['resident'], communityId: 'c' };
  const page = ui.instance('miniprogram/coupons/center/center.js');
  await page.onShow();
  const ids = page.data.list.map(item => item._id);
  assert.equal(ids.length, 101);
  assert.equal(new Set(ids).size, 101);
  assert(ids.includes('template-101'));
  assert.deepEqual(ui.requests.map(item => item[1]), ['center']);
  console.log(JSON.stringify({ count: ids.length, unique: new Set(ids).size,
    lastIncluded: ids.includes('template-101'), realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
