// Seven actual service-form pages; synthetic identities and intercepted catalog reads only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['P03', 'pages/service/express.js'], ['P04', 'pages/service/trash.js'],
  ['P05', 'pages/service/buy.js'], ['P06', 'pages/service/help.js'],
  ['P51', 'pet/order.js'], ['P66', 'elder/meal.js'], ['P67', 'elder/escort.js']
];
const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id,
  buildingId: 'building-' + id, buildingName: '合成A栋', unit: '1', room: '101', phone: 'synthetic-' + id });

async function run(pageId, file, phase) {
  let finishSession, finishRead;
  const env = runtime((name, action) => {
    assert.equal(name, 'catalog');
    assert.equal(action, 'getCommunity');
    const result = { _id: 'community-a', name: '合成A小区', prices: {},
      stations: [], canteens: [], dutyWindows: [] };
    if (phase.startsWith('late-community') && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(result); });
    return result;
  });
  const first = user('a');
  env.app.globalData.user = phase === 'session-error' || phase === 'first-session' ? null : first;
  if (phase === 'session-error')
    env.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
  else if (phase === 'first-session')
    env.app.ensureSession = () => new Promise(resolve => { finishSession = () => resolve(first); });
  else env.app.ensureSession = async () => first;

  const page = env.instance('miniprogram/' + file);
  page.hidden = false;
  const pending = page.load();
  if (phase === 'first-session') {
    env.app.globalData.user = user('b');
    finishSession();
  } else if (phase.startsWith('late-community')) {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${pageId}: catalog read must start`);
    env.app.globalData.user = phase === 'late-community-same-user'
      ? { ...first, communityId: 'community-b', buildingId: 'building-b' } : user('b');
    finishRead();
  }
  await pending;
  const observed = { pageId, phase, loading: page.data.loading, error: page.data.error,
    communityId: page.data.community?._id || '', addressText: page.data.addressText || '',
    addresses: page.data.addresses.length, calls: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error && observed.communityId === 'community-a' && observed.addresses === 1
    : phase === 'session-error'
      ? !observed.loading && /synthetic login timeout/.test(observed.error) &&
        !observed.communityId && !observed.addresses
      : !observed.loading && /资料.*变化|身份.*变化/.test(observed.error) &&
        !observed.communityId && !observed.addressText && !observed.addresses;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const [pageId, file] of pages)
    for (const phase of ['normal', 'session-error', 'first-session', 'late-community', 'late-community-same-user'])
      results.push(await run(pageId, file, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 35);
  assert.equal(failed.length, 28, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'Seven actual service-form pages; synthetic users; no cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length,
    failedByPhase: Object.fromEntries(['session-error', 'first-session', 'late-community', 'late-community-same-user'].map(phase =>
      [phase, failed.filter(result => result.phase === phase).length])),
    lateCommunityExample: failed.find(result => result.phase === 'late-community') }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
