// P22 actual page and synthetic identities/configuration; no cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const admin = (id, communityId, roles = ['admin']) => ({ _id: id, communityId, roles });
const config = { community: { _id: 'community-b', name: '测试小区', buildings: [], rates: {}, prices: {} },
  global: {}, communities: [{ _id: 'community-b', name: '测试小区' }] };

async function firstSession(next) {
  const env = runtime(async () => config);
  const page = env.instance('miniprogram/admin/community/community.js');
  let resolveSession;
  env.app.globalData.user = null;
  env.app.ensureSession = () => new Promise(resolve => { resolveSession = resolve; });
  page.setData({ globalRows: [{ key: 'old', value: 'old data' }] });
  const pending = page.onLoad();
  env.app.globalData.user = next;
  resolveSession(admin('first', 'community-a'));
  await pending;
  assert.equal(page.data.loading, false);
  assert.equal(page.data.authorized, false);
  assert.equal(page.data.canReload, true);
  assert.match(page.data.error, /身份.*变化/);
  assert.equal(page.data.globalRows.length, 0);
  assert.equal(env.requests.length, 0, 'stale identity must not read configuration');
  env.app.ensureSession = async () => next;
  await page.load();
  if (next.roles.includes('admin')) {
    assert.equal(page.data.authorized, true);
    assert.deepEqual(env.requests.map(request => request[1]), ['managementConfig']);
  } else {
    assert.equal(page.data.authorized, false);
    assert.equal(env.requests.length, 0);
  }
  page.onHide();
}

async function lateConfiguration(next) {
  let finish;
  const env = runtime(() => new Promise(resolve => { finish = () => resolve(config); }));
  const first = admin('first', 'community-a');
  env.app.globalData.user = first;
  env.app.ensureSession = async () => first;
  const page = env.instance('miniprogram/admin/community/community.js');
  const pending = page.onLoad();
  for (let i = 0; i < 10 && !finish; i += 1) await Promise.resolve();
  assert.equal(typeof finish, 'function');
  env.app.globalData.user = next;
  finish();
  await pending;
  assert.equal(page.data.loading, false);
  assert.equal(page.data.authorized, false);
  assert.equal(page.data.community, null);
  assert.equal(page.data.globalRows.length, 0);
  assert.match(page.data.error, /身份.*变化/);
  page.onHide();
}

async function main() {
  await firstSession(admin('second', 'community-b'));
  await firstSession(admin('first', 'community-b'));
  await firstSession(admin('second', 'community-b', ['resident']));
  await lateConfiguration(admin('second', 'community-b'));
  await lateConfiguration(admin('first', 'community-b'));
  console.log(JSON.stringify({ scope: 'P22 actual page; synthetic identities and configuration', passed: 5 }));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
