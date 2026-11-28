// Actual merchant booking page; synthetic identities and intercepted lookup only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id,
  addresses: [{ id: 'address-' + id, buildingName: 'A栋', unit: '1', room: '101' }] });

async function run(phase) {
  let resolveSession, finishRead;
  const env = runtime((name, action) => {
    assert.equal(name, 'merchant');
    assert.equal(action, 'lookupBooking');
    if (phase === 'late-lookup') return new Promise(resolve => { finishRead = () => resolve({ orderId: null }); });
    return { orderId: null };
  });
  const first = user('a'), second = user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  if (phase === 'late-lookup')
    env.store['merchant-booking:a:community-a:synthetic-service'] = { requestId: 'synthetic-request' };
  const page = env.instance('miniprogram/shops/booking/booking.js');
  page.onLoad({ serviceId: 'synthetic-service' });
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-lookup') {
    for (let i = 0; i < 20 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', 'lookup must start');
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const observed = { phase, loading: page.data.loading, ready: page.data.ready,
    loadError: page.data.loadError, error: page.data.error, initializing: page.initializing,
    requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && observed.ready && !observed.error && observed.requests.length === 0
    : !observed.loading && !observed.ready && observed.loadError && !observed.initializing &&
      /身份.*变化|资料.*变化/.test(observed.error || '') &&
      observed.requests.length === (phase === 'late-lookup' ? 1 : 0);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'first-session', 'late-lookup']) results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 3);
  assert.equal(failed.length, 1, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P60 actual page; synthetic users; no cloud writes',
    controlsPassed: results.filter(result => result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
