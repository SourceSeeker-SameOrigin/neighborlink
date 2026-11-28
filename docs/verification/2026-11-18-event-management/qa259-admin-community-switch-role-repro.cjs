// Actual P22 page; synthetic community configuration and same-account role revocation.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'synthetic-admin', roles: ['admin'], communityId: 'community-a' };
const communities = ['community-a', 'community-b'].map((_id, index) =>
  ({ _id, name: `合成小区${index + 1}`, prices: {}, rates: {}, buildings: [] }));
const reply = community => ({ community, communities, global: { hotline: 'synthetic' } });

async function run(revoked) {
  let release;
  const env = runtime((name, action, data) => {
    assert.equal(name, 'admin');
    assert.equal(action, 'managementConfig');
    if (data.communityId === 'community-b') {
      if (revoked) return new Promise(resolve => { release = () => resolve(reply(communities[1])); });
      return reply(communities[1]);
    }
    return reply(communities[0]);
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance('miniprogram/admin/community/community.js');
  await page.onLoad();
  assert.equal(page.data.authorized, true, 'normal first community must load');
  const pending = page.chooseCommunity({ detail: { value: '1' } });
  if (revoked) {
    for (let i = 0; i < 30 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', 'second community read must start');
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { phase: revoked ? 'revoked-during-switch' : 'normal-switch',
    loading: page.data.loading, authorized: page.data.authorized,
    communityId: page.data.community?._id || '', error: page.data.error,
    canReload: page.data.canReload, reads: env.requests.map(request => request[1]) };
  const desired = revoked
    ? !observed.loading && !observed.authorized && !observed.communityId &&
      observed.canReload && /身份.*变化|权限.*变化|无权/.test(observed.error)
    : !observed.loading && observed.authorized && observed.communityId === 'community-b';
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [await run(false), await run(true)];
  const failed = results.filter(result => !result.desired);
  console.log(JSON.stringify({ scope: 'P22 actual page; synthetic communities; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, results }, null, 2));
  assert.equal(failed.length, 1, 'reproduction baseline changed; inspect before editing decision record');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
