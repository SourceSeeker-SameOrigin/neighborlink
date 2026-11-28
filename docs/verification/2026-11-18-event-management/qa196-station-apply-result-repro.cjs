// Actual P61 page with a synthetic single-application server model.
// No CloudBase application or account change.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

(async () => {
  let application = null;
  let applyCalls = 0;
  let statusReads = 0;
  const env = runtime(async (name, action, payload) => {
    assert.equal(name, 'station');
    if (action === 'applicationOptions') return { list: [{ _id: 'community-a',
      stations: [{ code: 'station-a', name: '合成驿站' }] }] };
    if (action === 'myApplication') { statusReads++; return { application }; }
    assert.equal(action, 'apply');
    assert.equal(payload.stationCode, 'station-a');
    applyCalls++;
    if (application) throw Object.assign(Error('驿站申请已提交，请等待管理员审核'), { code: 'E_BAD_STATE' });
    application = { status: 'pending', communityId: 'community-a', stationCode: 'station-a' };
    throw Error('合成响应丢失，申请已写入');
  });
  env.app.globalData.user = { _id: 'resident-a', openid: 'openid-a', roles: ['resident'], communityId: 'community-a' };
  const page = env.instance('miniprogram/station/apply/apply.js');
  await page.onShow();
  assert.equal(page.data.ready, true);
  await page.submit();
  assert.equal(application.status, 'pending');
  assert.equal(page.data.application.status, 'pending');
  assert.equal(statusReads, 2);
  const firstError = page.data.error;
  await page.submit();
  assert.equal(applyCalls, 1);
  assert.equal(page.data.application.status, 'pending');
  const retryError = page.data.error;
  await page.load();
  assert.equal(page.data.application.status, 'pending');
  console.log(JSON.stringify({ scope: 'actual P61 page; synthetic application only',
    firstError, retryError, applyCalls, statusReads,
    afterManualReloadStatus: page.data.application.status, syntheticApplications: 1,
    realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
