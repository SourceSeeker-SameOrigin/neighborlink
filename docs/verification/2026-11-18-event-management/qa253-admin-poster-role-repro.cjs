// Actual P23 page; synthetic administrator role revocation; all directory reads intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'synthetic-admin', communityId: 'community-a', roles: ['admin'] };
const responses = {
  listCommunities: { list: [{ _id: 'community-a', name: '合成小区' }], hasMore: false },
  listProviders: { list: [], hasMore: false },
  getCommunity: { _id: 'community-a', buildings: [{ _id: 'synthetic-building', name: '合成楼栋' }] }
};

async function run(phase) {
  let release;
  const delayed = phase === 'directory' ? 'listCommunities' : phase === 'building' ? 'getCommunity' : '';
  const env = runtime((name, action) => {
    assert.ok((name === 'catalog' && ['listCommunities', 'getCommunity'].includes(action)) ||
      (name === 'admin' && action === 'listProviders'), `unexpected read ${name}.${action}`);
    if (action === delayed) return new Promise(resolve => { release = () => resolve(responses[action]); });
    return responses[action];
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance('miniprogram/admin/posters/posters.js');
  const pending = page.onLoad();
  if (delayed) {
    for (let i = 0; i < 30 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${phase} read must start`);
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { phase, loading: page.data.loading, ready: page.data.ready,
    communityLoading: page.data.communityLoading, communityReady: page.data.communityReady,
    error: page.data.error, communities: page.data.communities.length,
    buildings: page.data.buildings.length,
    reads: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && observed.ready && observed.communityReady && observed.buildings === 1
    : !observed.loading && !observed.ready && !observed.communityLoading &&
      !observed.communities && !observed.buildings && /身份.*变化|资料.*变化/.test(observed.error) &&
      (phase !== 'directory' || !observed.reads.includes('listProviders'));
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'directory', 'building']) results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P23 actual page; synthetic role change; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
