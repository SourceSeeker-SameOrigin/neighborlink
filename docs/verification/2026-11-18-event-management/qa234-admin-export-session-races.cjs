// Actual P31/P32 pages, synthetic identities and read responses, no exports.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['P31', 'admin/recycle/recycle'],
  ['P32', 'admin/exports/exports']
];
const admin = (id, communityId, roles = ['admin']) => ({ _id: id, communityId, roles });
const empty = { list: [], hasMore: false };
const start = (page, name) => {
  if (name === 'P31') return page.onLoad();
  page.onLoad({});
  return page.onShow();
};

async function firstSession([name, path], next) {
  const env = runtime(async () => empty);
  let resolveSession;
  env.app.globalData.user = null;
  env.app.ensureSession = () => new Promise(resolve => { resolveSession = resolve; });
  const page = env.instance(`miniprogram/${path}.js`);
  const pending = start(page, name);
  env.app.globalData.user = next;
  resolveSession(admin('first', 'community-a'));
  await pending;
  assert.equal(page.data.loading, false);
  assert.equal(page.data.ready, false);
  assert.match(page.data.error, /身份.*变化/);
  if (name === 'P32') assert.equal(page.data.errorKind, 'load');
  assert.equal(env.requests.length, 0, `${name} must not read stale selectors`);
  env.app.ensureSession = async () => next;
  await page.load();
  if (next.roles.includes('admin')) {
    assert.equal(page.data.ready, true, `${name} current admin can retry`);
    assert.equal(page.data.error, '');
  } else {
    assert.equal(page.data.ready, false);
    assert.equal(env.requests.length, 0);
  }
  page.onHide();
}

async function lateRead([name, path], next) {
  let release, calls = 0;
  const env = runtime(() => ++calls === 1
    ? new Promise(resolve => { release = () => resolve(empty); }) : empty);
  const first = admin('first', 'community-a');
  env.app.globalData.user = first;
  env.app.ensureSession = async () => first;
  const page = env.instance(`miniprogram/${path}.js`);
  const pending = start(page, name);
  for (let i = 0; i < 10 && !release; i += 1) await Promise.resolve();
  assert.equal(typeof release, 'function');
  env.app.globalData.user = next;
  release();
  await pending;
  assert.equal(page.data.loading, false);
  assert.equal(page.data.ready, false);
  assert.equal(page.data.communities.length, 0);
  assert.match(page.data.error, /身份.*变化/);
  if (name === 'P32') assert.equal(page.data.errorKind, 'load');
  page.onHide();
}

async function staleButton([name, path]) {
  const env = runtime(async () => empty);
  const first = admin('first', 'community-a');
  env.app.globalData.user = first;
  env.app.ensureSession = async () => first;
  const page = env.instance(`miniprogram/${path}.js`);
  await start(page, name);
  assert.equal(page.data.ready, true);
  const reads = env.requests.length;
  env.app.globalData.user = admin('first', 'community-b');
  if (name === 'P31') page.openExports();
  else await page.exportData();
  assert.equal(page.data.ready, false, `${name} old action must lose authorization`);
  assert.match(page.data.error, /身份.*变化/);
  assert.equal(env.requests.length, reads, `${name} must not export old scope`);
  assert.equal(env.navigation.length, 0, `${name} must not navigate to old export scope`);
  page.onHide();
}

async function main() {
  for (const item of pages) {
    await firstSession(item, admin('second', 'community-b'));
    await firstSession(item, admin('first', 'community-b'));
    await firstSession(item, admin('second', 'community-b', ['resident']));
    await lateRead(item, admin('second', 'community-b'));
    await lateRead(item, admin('first', 'community-b'));
    await staleButton(item);
  }
  console.log(JSON.stringify({ scope: 'P31/P32 actual pages, synthetic admin identities and selector reads', passed: pages.length * 6 }));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
