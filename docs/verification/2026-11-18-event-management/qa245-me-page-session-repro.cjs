// Actual Me page; synthetic profiles and intercepted read-only calls only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id,
  buildingId: 'building-' + id, buildingName: 'A栋', unit: '1', room: '101',
  phone: 'synthetic-' + id, prefs: {} });

async function run(phase) {
  let resolveSession, finishRead;
  const env = runtime((name, action) => {
    const result = name === 'chat' ? { unreadTotal: 7 } : { merchant: null };
    const delayed = phase === 'late-unread' ? name === 'chat' :
      phase === 'late-application' ? name === 'merchant' : false;
    if (delayed && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(result); });
    assert.ok(name === 'chat' && action === 'list' || name === 'merchant' && action === 'myApplication');
    return result;
  });
  const first = user('a'), second = user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.globalData.community = { enabledFeatures: {
    merchants: phase === 'late-application', stationDelivery: false
  } };
  env.app.globalData.provider = null;
  const session = new Promise(resolve => { resolveSession = resolve; });
  env.app.ensureSession = phase === 'first-session' ? () => session : async () => first;
  const page = env.instance('miniprogram/pages/me/me.js');
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase.startsWith('late-')) {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', 'read must start');
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const observed = { phase, loading: page.data.loading, error: page.data.error,
    displayedUser: page.data.user?._id || '', displayedPhone: page.data.user?.phone || '',
    merchantLoading: page.data.merchantLoading, canOperate: Boolean(page.currentUser()),
    requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error && observed.displayedUser === 'a' && observed.canOperate
    : !observed.loading && !observed.displayedUser && !observed.displayedPhone &&
      /身份.*变化|资料.*变化/.test(observed.error || '') && !observed.canOperate;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'first-session', 'late-unread', 'late-application'])
    results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 4);
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'Me actual page; synthetic profiles; no cloud writes',
    controlsPassed: results.filter(result => result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
