// P28 actual page with synthetic administrators and intercepted coupon calls.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const template = { _id: 'synthetic-template', name: '合成手动券', kind: 'amount_off', issueMode: 'manual',
  services: ['all'], communityIds: 'all', status: 'active' };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve: value => resolve(value) };
};

async function reproduce(leave) {
  const secondLoad = deferred();
  const secondStarted = deferred();
  let loads = 0;
  const env = runtime(async (_name, action) => {
    if (action === 'adminTemplates') {
      loads += 1;
      if (loads === 2) { secondStarted.resolve(); return secondLoad.promise; }
      return { list: [template] };
    }
    if (action === 'manualIssue') return { issued: 1, duplicates: 0,
      failures: [{ userId: 'private-recipient-a', message: '合成失败' }] };
    return { issued: 0, expected: 1 };
  });
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'] };
  const page = env.instance('miniprogram/admin/coupons/coupons.js');
  await page.load();
  page.setData({ 'form.issueTemplateId': template._id, 'form.userIdsText': 'private-recipient-a' });
  const issuing = page.issue();
  await secondStarted.promise;
  if (leave === 'switch') env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
  else if (leave === 'hide') page.onHide();
  else page.onUnload();
  secondLoad.resolve({ list: [template] });
  await issuing;
  const requests = env.requests.filter(request => request[1] === 'manualIssue').length;
  assert.equal(requests, 1);
  return { leave, requests, oldRecipientShown: page.data.error.includes('private-recipient-a'),
    rows: page.data.rows.length };
}

(async () => {
  const results = [];
  for (const leave of ['switch', 'hide', 'unload']) results.push(await reproduce(leave));
  console.log(JSON.stringify({ scope: 'actual P28 page; synthetic administrators and intercepted API',
    results, realCloudWrites: 0 }, null, 2));
  assert(results.every(result => !result.oldRecipientShown));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
