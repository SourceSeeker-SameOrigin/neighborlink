// Actual P28 page; synthetic administrator role revocation; all APIs intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'synthetic-admin', communityId: 'community-a', roles: ['admin'] };
const template = { _id: 'synthetic-template', name: '合成样券', kind: 'amount_off',
  issueMode: 'manual', value: 100, maxOff: 100, threshold: 0, validDays: 30,
  totalLimit: 10, perUserLimit: 1, services: ['all'], communityIds: 'all', status: 'active' };

async function run(phase) {
  let delayed = false, release;
  const env = runtime((name, action) => {
    assert.equal(name, 'coupon');
    assert.equal(action, 'adminTemplates', 'unexpected coupon write or lookup');
    if (delayed) return new Promise(resolve => { release = () => resolve({ list: [template] }); });
    return { list: [template] };
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance('miniprogram/admin/coupons/coupons.js');
  await page.onShow();
  assert.equal(page.data.rows.length, 1, 'normal administrator read must succeed');
  page.setData({ 'form.phone': 'SYNTHETIC_PHONE', 'form.userIdsText': 'synthetic-recipient' });
  if (phase === 'action') {
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    await page.save();
    await page.issue();
  } else if (phase === 'late-list') {
    delayed = true;
    const pending = page.load();
    for (let i = 0; i < 25 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', 'reload must reach intercepted template read');
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
    await pending;
  }
  const observed = { phase, loading: page.data.loading, error: page.data.error,
    rows: page.data.rows.length, draftPhoneVisible: Boolean(page.data.form.phone),
    draftRecipientsVisible: Boolean(page.data.form.userIdsText),
    writes: env.requests.filter(request => request[1] !== 'adminTemplates').length };
  const desired = phase === 'normal'
    ? !observed.loading && observed.rows === 1 && observed.draftPhoneVisible
    : !observed.loading && !observed.rows && !observed.draftPhoneVisible &&
      !observed.draftRecipientsVisible && /权限.*变化|身份.*变化|资料.*变化/.test(observed.error) && !observed.writes;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'action', 'late-list']) results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P28 actual page; synthetic role change; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
