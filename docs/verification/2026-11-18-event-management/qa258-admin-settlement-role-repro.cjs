// Actual P24 page; synthetic settlement and same-account role revocation; all reads intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const settlement = { _id: 'synthetic-settlement', communityId: 'community-a', total: 500 };
const community = { _id: 'community-a', name: '合成小区' };

async function run(role, revoked) {
  let release;
  const user = { _id: 'synthetic-user', communityId: 'community-a', roles: [role] };
  const env = runtime((name, action) => {
    if (name === 'admin' && action === 'listSettlements') {
      const reply = { list: [settlement], hasMore: false };
      if (revoked) return new Promise(resolve => { release = () => resolve(reply); });
      return reply;
    }
    if (name === 'catalog' && action === 'listCommunities') return { list: [community], hasMore: false };
    if (name === 'catalog' && action === 'getCommunity') return community;
    if (name === 'admin' && action === 'listProviders') return { list: [], hasMore: false };
    if (name === 'merchant' && action === 'adminList') return { list: [], hasMore: false };
    throw Error(`unexpected read ${name}.${action}`);
  });
  env.app.globalData.user = user;
  env.app.ensureSession = async () => user;
  const page = env.instance('miniprogram/admin/settlements/settlements.js');
  const pending = page.onLoad();
  if (revoked) {
    for (let i = 0; i < 40 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${role} settlement read must start`);
    env.app.globalData.user = { ...user, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { role, phase: revoked ? 'revoked-during-read' : 'normal',
    loading: page.data.loading, ready: page.data.ready, authorized: page.data.authorized,
    settlements: page.data.settlements.length, error: page.data.error,
    reads: env.requests.map(request => request[1]) };
  const desired = revoked
    ? !observed.loading && !observed.ready && !observed.authorized && observed.settlements === 0 &&
      /身份.*变化|权限.*变化|无权/.test(observed.error)
    : !observed.loading && observed.ready && observed.authorized && observed.settlements === 1;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const role of ['admin', 'property']) {
    results.push(await run(role, false));
    results.push(await run(role, true));
  }
  const failed = results.filter(result => !result.desired);
  console.log(JSON.stringify({ scope: 'P24 actual page; synthetic roles and settlement; zero cloud calls',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, results }, null, 2));
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
