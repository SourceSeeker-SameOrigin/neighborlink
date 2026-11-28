// Actual P31/P32 pages; positive control for same-account administrator role revocation.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = { _id: 'synthetic-admin', communityId: 'community-a', roles: ['admin'] };
const community = { _id: 'community-a', name: '合成小区', stations: [] };
const pages = [
  { id: 'P31', file: 'miniprogram/admin/recycle/recycle.js' },
  { id: 'P32', file: 'miniprogram/admin/exports/exports.js' }
];

async function run(item, revoked) {
  let release;
  const env = runtime((name, action) => {
    if (name === 'catalog' && action === 'listCommunities') {
      const reply = { list: [community], hasMore: false };
      if (revoked) return new Promise(resolve => { release = () => resolve(reply); });
      return reply;
    }
    if (name === 'catalog' && action === 'getCommunity') return community;
    if ((name === 'admin' && action === 'listProviders') ||
        (name === 'merchant' && action === 'adminList')) return { list: [], hasMore: false };
    throw Error(`unexpected read ${name}.${action}`);
  });
  env.app.globalData.user = admin;
  env.app.ensureSession = async () => admin;
  const page = env.instance(item.file);
  const pending = item.id === 'P31' ? page.onLoad() : (page.onLoad(), page.onShow());
  if (revoked) {
    for (let i = 0; i < 40 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${item.id} directory read must start`);
    env.app.globalData.user = { ...admin, roles: ['resident'] };
    release();
  }
  await pending;
  const observed = { page: item.id, phase: revoked ? 'revoked-during-read' : 'normal',
    loading: page.data.loading, ready: page.data.ready, communities: page.data.communities.length,
    error: page.data.error, reads: env.requests.map(request => request[1]) };
  const passed = revoked
    ? !observed.loading && !observed.ready && observed.communities === 0 &&
      /身份.*变化|权限.*变化|无权/.test(observed.error)
    : !observed.loading && observed.ready && observed.communities === 1;
  page.onHide();
  return { ...observed, passed };
}

async function main() {
  const results = [];
  for (const item of pages) {
    results.push(await run(item, false));
    results.push(await run(item, true));
  }
  console.log(JSON.stringify({ scope: 'P31/P32 actual pages; synthetic roles; zero cloud calls',
    passed: results.filter(result => result.passed).length, total: results.length, results }, null, 2));
  assert.ok(results.every(result => result.passed), 'role revocation control regressed');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
