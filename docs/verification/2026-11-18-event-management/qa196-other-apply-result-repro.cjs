// Actual P13/P54 pages with synthetic single-application service behavior.
// No CloudBase application or media upload.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(kind, path) {
  let application = null;
  let applyCalls = 0;
  let statusReads = 0;
  const env = runtime(async (name, action) => {
    if (name === 'catalog' && action === 'listCommunities') return { list: [{ _id: 'community-a', name: '合成小区' }], hasMore: false };
    assert.equal(name, kind);
    if (action === 'myApplication' || action === 'myStatus') {
      statusReads++;
      return kind === 'merchant' ? { merchant: application } : { provider: application };
    }
    assert.equal(action, 'apply');
    applyCalls++;
    if (application) throw Object.assign(Error('申请已提交，请等待审核'), { code: 'E_BAD_STATE' });
    application = { status: 'pending', _id: 'synthetic-application' };
    throw Error('合成响应丢失，申请已写入');
  });
  env.app.globalData.user = { _id: 'resident-a', openid: 'openid-a', roles: ['resident'],
    communityId: 'community-a', phone: '13800000000' };
  const page = env.instance(path);
  await page.onLoad();
  assert.equal(page.data.ready, true);
  await page.submit();
  assert.equal(application.status, 'pending');
  assert.equal((kind === 'merchant' ? page.data.existing : page.data.provider).status, 'pending');
  assert.equal(statusReads, 2);
  const firstError = page.data.error;
  await page.submit();
  assert.equal(applyCalls, 1);
  const retryError = page.data.error;
  await page.load();
  assert.equal((kind === 'merchant' ? page.data.existing : page.data.provider).status, 'pending');
  return { page: kind, firstError, retryError, applyCalls, statusReads,
    afterManualReloadStatus: 'pending', syntheticApplications: 1 };
}

(async () => {
  console.log(JSON.stringify({ scope: 'actual P13/P54 pages; synthetic API only', cases: [
    await scenario('merchant', 'miniprogram/merchant/apply/apply.js'),
    await scenario('provider', 'miniprogram/provider/apply/apply.js')
  ], realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
