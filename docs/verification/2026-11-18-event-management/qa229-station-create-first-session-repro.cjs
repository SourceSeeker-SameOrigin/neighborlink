// Actual P63 page with synthetic session races; no CloudBase calls or batch writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pagePath = 'miniprogram/station/create/create.js';
const station = (id, community) => ({ _id: id, roles: ['station'], stationCode: 'gate', stationCommunityId: community });

async function main() {
  const env = runtime();
  const oldUser = station('old-user', 'community-a');
  const newUser = station('new-user', 'community-b');
  let finishSession;
  env.app.globalData.user = null;
  env.app.ensureSession = () => new Promise(resolve => { finishSession = resolve; });
  const page = env.instance(pagePath);
  const initialLoad = page.onShow();
  env.app.globalData.user = newUser;
  finishSession(oldUser);
  await initialLoad;
  assert.equal(page.data.ready, false);
  assert.equal(env.requests.length, 0);
  assert.equal(page.data.loading, false, 'stale first session must end loading');
  assert.match(page.data.error, /身份|驿站|重试|重新/);

  env.app.ensureSession = async () => newUser;
  await page.load();
  assert.equal(page.data.ready, true);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.error, '');

  let finishLookup;
  const lookupEnv = runtime(() => new Promise(resolve => { finishLookup = resolve; }));
  lookupEnv.app.globalData.user = oldUser;
  const oldKey = 'station-creation:' + encodeURIComponent(JSON.stringify([
    oldUser._id, oldUser.stationCommunityId, oldUser.stationCode
  ]));
  lookupEnv.store[oldKey] = { requestId: 'station_old_request' };
  const lookupPage = lookupEnv.instance(pagePath);
  const pendingLookup = lookupPage.onShow();
  for (let attempt = 0; attempt < 10 && !finishLookup; attempt += 1) await Promise.resolve();
  assert.equal(typeof finishLookup, 'function');
  lookupEnv.app.globalData.user = newUser;
  finishLookup({ batchId: null, eligibleCount: 0, skippedCount: 0 });
  await pendingLookup;
  assert.equal(lookupPage.data.ready, false);
  assert.equal(lookupPage.data.loading, false);
  assert.match(lookupPage.data.error, /身份.*变化/);
  assert.equal(lookupEnv.requests.filter(request => request[1] === 'createBatch').length, 0);

  let failLookup;
  const errorEnv = runtime(() => new Promise((resolve, reject) => { failLookup = reject; }));
  errorEnv.app.globalData.user = oldUser;
  errorEnv.store[oldKey] = { requestId: 'station_old_request' };
  const errorPage = errorEnv.instance(pagePath);
  const pendingError = errorPage.onShow();
  for (let attempt = 0; attempt < 10 && !failLookup; attempt += 1) await Promise.resolve();
  assert.equal(typeof failLookup, 'function');
  errorEnv.app.globalData.user = newUser;
  failLookup(new Error('旧账号的网络错误'));
  await pendingError;
  assert.equal(errorPage.data.loading, false);
  assert.equal(errorPage.data.ready, false);
  assert.equal(errorPage.data.error, '登录身份已变化，请重新加载');
  console.log(JSON.stringify({ scope: 'actual P63, synthetic first-session identity race',
    staleCreateCalls: 0, lookupReadCalls: 1, staleLoadingEnded: true,
    lateLookupEnded: true, lateErrorIsolated: true, currentOwnerRecovered: true }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
