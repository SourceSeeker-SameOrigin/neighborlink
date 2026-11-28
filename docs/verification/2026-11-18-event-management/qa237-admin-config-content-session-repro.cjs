// Actual admin pages with synthetic administrators; all CloudBase reads intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['P25', 'miniprogram/admin/features/features.js'],
  ['P29', 'miniprogram/admin/content/content.js']
];
const admin = id => ({ _id: id, roles: ['admin'], communityId: 'community-' + id });
const communities = { list: [{ _id: 'community-a', name: '合成小区' }], hasMore: false };
const replies = {
  listCommunities: communities,
  getFeatures: { communityId: 'community-a', global: {}, community: {} },
  listNotices: { list: [], hasMore: false },
  listAds: { list: [], hasMore: false }
};

async function run([pageId, file], phase) {
  let resolveSession, finishRead;
  const env = runtime((_, action) => {
    assert.ok(Object.prototype.hasOwnProperty.call(replies, action), `unexpected read: ${action}`);
    if (phase === 'late-read' && action === 'listCommunities')
      return new Promise(resolve => { finishRead = () => resolve(communities); });
    return replies[action];
  });
  const first = admin('a'), second = admin('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance(file);
  const pending = page.onLoad();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-read') {
    for (let i = 0; i < 20 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${pageId} must start its catalogue read`);
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const requests = env.requests.map(request => request[1]);
  const observed = { pageId, phase, loading: page.data.loading, error: page.data.error,
    ready: page.data.ready, authorized: page.data.authorized, requests,
    visibleRows: (page.data.items || page.data.notices || []).length };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error &&
      (pageId === 'P25' ? observed.ready === true : observed.authorized === true)
    : !observed.loading && /身份.*变化|资料.*变化/.test(observed.error || '') &&
      observed.visibleRows === 0 &&
      (phase !== 'first-session' || requests.length === 0);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const item of pages)
    for (const phase of ['normal', 'first-session', 'late-read']) results.push(await run(item, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 6);
  assert.equal(failed.length, 3, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P25/P29 actual pages; synthetic admins; cloud intercepted',
    controlsPassed: results.filter(result => result.phase === 'normal' && result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
