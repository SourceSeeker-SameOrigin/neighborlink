// Actual merchant order list; synthetic merchant roles and orders; all API calls intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const merchant = id => ({ _id: id, merchantId: 'merchant-' + id,
  communityId: 'community-' + id, roles: ['merchant'] });
const order = { _id: 'synthetic-order', status: 'paid', featureEnabled: true,
  detail: { category: 'repair' }, pricing: { payAmount: 500 },
  address: { buildingName: '合成A栋', unit: '1', room: '101' } };

async function run(phase) {
  let finishSession, finishRead;
  const env = runtime((name, action) => {
    if (name === 'merchant' && action === 'merchantOrders') {
      const result = { list: [order], hasMore: false };
      if (phase.startsWith('late-list') && !finishRead)
        return new Promise(resolve => { finishRead = () => resolve(result); });
      return result;
    }
    if (name === 'merchant' && action === 'merchantTransition') throw Error('synthetic blocked');
    throw Error(`Unexpected API call: ${name}.${action}`);
  });
  const first = merchant('a');
  env.app.globalData.user = phase === 'session-error' || phase === 'first-session' ? null : first;
  if (phase === 'session-error')
    env.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
  else if (phase === 'first-session')
    env.app.ensureSession = () => new Promise(resolve => { finishSession = () => resolve(first); });
  else env.app.ensureSession = async () => first;

  const page = env.instance('miniprogram/merchant/orders/orders.js');
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = merchant('b');
    finishSession();
  } else if (phase.startsWith('late-list')) {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', 'intercepted merchant list must start');
    env.app.globalData.user = phase === 'late-list-merchant'
      ? { ...first, merchantId: 'merchant-b' }
      : phase === 'late-list-role' ? { ...first, roles: ['resident'] } : merchant('b');
    finishRead();
  }
  await pending;
  if (phase === 'late-list-role')
    await page.transition({ currentTarget: { dataset: { id: order._id, action: 'accept' } } });
  const observed = { phase, loading: page.data.loading, error: page.data.error,
    ready: page.data.ready, rows: page.data.list.length,
    address: page.data.list[0]?.address?.room || '',
    merchantTransitions: env.requests.filter(request => request[0] === 'merchant' &&
      request[1] === 'merchantTransition').length };
  const desired = phase === 'normal'
    ? !observed.loading && observed.ready && observed.rows === 1 && !observed.error
    : phase === 'session-error'
      ? !observed.loading && !observed.ready && !observed.rows &&
        /synthetic login timeout/.test(observed.error)
      : !observed.loading && !observed.ready && !observed.rows && !observed.address &&
        /资料.*变化|身份.*变化/.test(observed.error) && !observed.merchantTransitions;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal', 'session-error', 'first-session', 'late-list-user',
    'late-list-merchant', 'late-list-role']) results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 6);
  assert.equal(failed.length, 4, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P57 actual merchant order page; synthetic data; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
