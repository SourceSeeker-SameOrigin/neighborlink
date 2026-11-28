// P23 actual page; synthetic identities and selectors only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = (id, communityId) => ({ _id: id, communityId, roles: ['admin'] });

async function changedDuringSession(next) {
  const env = runtime(async () => ({ list: [], hasMore: false }));
  const page = env.instance('miniprogram/admin/posters/posters.js');
  let resolveSession;
  env.app.globalData.user = null;
  env.app.ensureSession = () => new Promise(resolve => { resolveSession = resolve; });
  const pending = page.onLoad();
  env.app.globalData.user = next;
  resolveSession(admin('first', 'community-a'));
  await pending;
  assert.equal(env.requests.length, 0, 'stale administrator must not start a selector read');
  assert.equal(page.data.loading, false);
  assert.equal(page.data.ready, false);
  assert.match(page.data.error, /身份.*变化/);
  assert.equal(page.data.retryAction, 'load');
  env.app.ensureSession = async () => next;
  await page.retry();
  if (next.roles.includes('admin')) {
    assert.equal(page.data.ready, true);
    assert.deepEqual(env.requests.map(request => request[1]), ['listCommunities', 'listProviders']);
  } else {
    assert.equal(page.data.ready, false);
    assert.match(page.data.error, /只有运营管理员/);
    assert.equal(env.requests.length, 0);
  }
  page.onHide();
}

async function changedDuringSelector() {
  let finishRead;
  const env = runtime((_, action) => new Promise(resolve => {
    assert.equal(action, 'listCommunities');
    finishRead = () => resolve({ list: [], hasMore: false });
  }));
  const first = admin('first', 'community-a');
  env.app.globalData.user = first;
  env.app.ensureSession = async () => first;
  const page = env.instance('miniprogram/admin/posters/posters.js');
  const pending = page.onLoad();
  for (let i = 0; i < 10 && !finishRead; i += 1) await Promise.resolve();
  assert.equal(typeof finishRead, 'function');
  env.app.globalData.user = admin('second', 'community-b');
  finishRead();
  await pending;
  assert.equal(env.requests.length, 1, 'old page must not continue to the next selector');
  assert.equal(page.data.loading, false);
  assert.equal(page.data.ready, false);
  assert.equal(page.data.communities.length, 0);
  assert.match(page.data.error, /身份.*变化/);
  page.onHide();
}

async function main() {
  await changedDuringSession(admin('second', 'community-b'));
  await changedDuringSession(admin('first', 'community-b'));
  await changedDuringSession({ ...admin('second', 'community-b'), roles: ['resident'] });
  await changedDuringSelector();
  console.log(JSON.stringify({ scope: 'P23 actual page, synthetic identities and catalog', passed: 4 }));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
