// Actual provider task page; synthetic identity, address and phone; all API calls intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const provider = id => ({ _id: id, communityId: 'community-' + id, roles: ['provider'] });
const order = { _id: 'synthetic-order', status: 'accepted', statusText: '已接单',
  serviceCode: 'trash', serviceName: '代扔垃圾', featureEnabled: true, canShareLocation: false,
  address: { buildingName: '合成A栋', unit: '1', room: '101' }, userPhone: 'synthetic-phone',
  detail: {}, pricing: { goodsCap: 0 }, slot: null };

async function run(phase) {
  let finishSession, finishRead;
  const env = runtime((name, action) => {
    if (name === 'order' && action === 'detail') {
      if (phase.startsWith('late-detail') && !finishRead)
        return new Promise(resolve => { finishRead = () => resolve(order); });
      return order;
    }
    if (name === 'provider' && action === 'start') throw Error('synthetic blocked');
    throw Error(`Unexpected API call: ${name}.${action}`);
  });
  const first = provider('a');
  env.app.globalData.user = phase === 'session-error' || phase === 'first-session' ? null : first;
  if (phase === 'session-error')
    env.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
  else if (phase === 'first-session')
    env.app.ensureSession = () => new Promise(resolve => { finishSession = () => resolve(first); });
  else env.app.ensureSession = async () => first;

  const page = env.instance('miniprogram/provider/task/task.js');
  page.onLoad({ id: order._id });
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = provider('b');
    finishSession();
  } else if (phase.startsWith('late-detail')) {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', 'intercepted task read must start');
    env.app.globalData.user = phase === 'late-detail-scope'
      ? { ...first, communityId: 'community-b' }
      : phase === 'late-detail-role' ? { ...first, roles: ['resident'] } : provider('b');
    finishRead();
  }
  await pending;
  if (phase.startsWith('late-detail'))
    await page.act({ currentTarget: { dataset: { action: 'start' } } });
  const observed = { phase, loading: page.data.loading, error: page.data.error,
    taskReady: page.data.taskReady, orderId: page.data.order?._id || '',
    address: page.data.order?.address?.room || '', phone: page.data.order?.userPhone || '',
    providerStarts: env.requests.filter(request => request[0] === 'provider' && request[1] === 'start').length };
  const desired = phase === 'normal'
    ? !observed.loading && observed.taskReady && observed.orderId === order._id && !observed.error
    : phase === 'session-error'
      ? !observed.loading && !observed.taskReady && /synthetic login timeout/.test(observed.error)
      : !observed.loading && !observed.taskReady && !observed.orderId && !observed.address &&
        !observed.phone && /资料.*变化|身份.*变化/.test(observed.error) && !observed.providerStarts;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'session-error', 'first-session', 'late-detail-user',
    'late-detail-scope', 'late-detail-role']) results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 6);
  assert.equal(failed.length, 4, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P16 actual task page; synthetic data; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
