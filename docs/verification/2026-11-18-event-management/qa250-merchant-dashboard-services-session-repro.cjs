// Actual merchant dashboard and service editor; synthetic accounts, data and intercepted reads only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const merchant = id => ({ _id: id, merchantId: 'merchant-' + id,
  communityId: 'community-' + id, roles: ['merchant'] });
const pages = [
  ['workbench', 'miniprogram/merchant/workbench/workbench.js', 'myApplication'],
  ['services', 'miniprogram/merchant/services/services.js', 'myServices']
];

async function run(kind, file, readAction, phase) {
  let finishSession, finishRead;
  const env = runtime((name, action) => {
    assert.equal(name, 'merchant');
    assert.equal(action, readAction);
    const result = kind === 'workbench'
      ? { merchant: { _id: 'merchant-a', name: '合成商家A', status: 'approved' } }
      : { list: [{ _id: 'synthetic-service', title: '合成服务A', desc: '合成说明',
        price: 500, images: [] }], hasMore: false, nextOffset: 1 };
    if (phase.startsWith('late-') && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(result); });
    return result;
  });
  const first = merchant('a');
  env.app.globalData.user = phase === 'session-error' || phase === 'first-session' ? null : first;
  if (phase === 'session-error')
    env.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
  else if (phase === 'first-session')
    env.app.ensureSession = () => new Promise(resolve => { finishSession = () => resolve(first); });
  else env.app.ensureSession = async () => first;

  const page = env.instance(file);
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = merchant('b');
    finishSession();
  } else if (phase.startsWith('late-')) {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${kind}: intercepted read must start`);
    env.app.globalData.user = phase === 'late-merchant'
      ? { ...first, merchantId: 'merchant-b' }
      : phase === 'late-role' ? { ...first, roles: ['resident'] } : merchant('b');
    finishRead();
  }
  await pending;
  if (kind === 'workbench' && phase === 'late-role') page.orders();
  const observed = { kind, phase, loading: page.data.loading, error: page.data.error,
    merchant: page.data.merchant?.name || '', rows: page.data.list?.length || 0,
    ready: page.data.ready || false, canEdit: kind === 'services' ? page.canEdit() : false,
    navigation: env.navigation.length };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error && (kind === 'workbench'
      ? observed.merchant === '合成商家A' : observed.rows === 1 && observed.ready && observed.canEdit)
    : phase === 'session-error'
      ? !observed.loading && /synthetic login timeout/.test(observed.error) &&
        !observed.merchant && !observed.rows && !observed.ready
      : !observed.loading && /资料.*变化|身份.*变化/.test(observed.error) &&
        !observed.merchant && !observed.rows && !observed.ready &&
        !observed.canEdit && !observed.navigation;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const [kind, file, action] of pages)
    for (const phase of ['normal', 'session-error', 'first-session', 'late-user',
      'late-merchant', 'late-role']) results.push(await run(kind, file, action, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 12);
  assert.equal(failed.length, 8, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P55/P56 actual pages; synthetic merchant data; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
