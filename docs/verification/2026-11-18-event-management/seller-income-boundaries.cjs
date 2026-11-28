// Actual seller income page with synthetic users and intercepted APIs only.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const income = { pending: 1000, settled: 0, available: 1000, payoutEnabled: true, canWithdraw: true };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'resident-a' };
  return { env, page: env.instance('miniprogram/idle/income/income.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async (name, action) => action === 'earnings' ? income : { list: [] });
    await page.load();
    results.push({ case: 'normal-read', pass: page.data.ready && page.data.available === '10.00' });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? wait.promise : { list: [] });
    const read = page.load();
    await pause();
    env.app.globalData.user = { _id: 'resident-b' };
    wait.resolve(income);
    await read;
    results.push({ case: 'late-read-after-identity-change', pass: !page.data.ready,
      observed: { ready: page.data.ready, available: page.data.available } });
  }
  {
    const wait = deferred();
    const { page } = fixture(async (name, action) => action === 'earnings' ? wait.promise : { list: [] });
    page.visible = true;
    const read = page.load();
    await pause();
    page.onHide();
    wait.resolve(income);
    await read;
    results.push({ case: 'late-read-after-hide', pass: !page.data.ready && page.data.available === '0.00' });
  }
  {
    let fail = false;
    const { page } = fixture(async (name, action) => action === 'earnings' ? (fail ? Promise.reject(Error('读取失败')) : income) : { list: [] });
    await page.load();
    fail = true;
    await page.load();
    results.push({ case: 'failed-recheck-clears-income', pass: !page.data.ready && page.data.loadError && page.data.available === '0.00' });
  }
  {
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? income : action === 'create' ? { state: 'created' } : { list: [] });
    await page.load();
    env.app.globalData.user = { _id: 'resident-b' };
    await page.withdraw();
    const calls = env.requests.filter(request => request[1] === 'create').length;
    results.push({ case: 'old-withdraw-after-identity-change', pass: calls === 0, observed: { createCalls: calls } });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? income : action === 'create' ? wait.promise : { list: [] });
    let transfers = 0;
    env.wx.canIUse = () => true;
    env.wx.requestMerchantTransfer = options => { transfers++; options.success({}); };
    await page.load();
    const payout = page.withdraw();
    await pause();
    env.app.globalData.user = { _id: 'resident-b' };
    wait.resolve({ packageInfo: 'synthetic', mchId: 'synthetic', appId: 'synthetic' });
    await payout;
    results.push({ case: 'late-payout-after-identity-change', pass: transfers === 0, observed: { transferCalls: transfers } });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? income : action === 'create' ? wait.promise : { list: [] });
    await page.load();
    const first = page.withdraw();
    const second = page.withdraw();
    await pause();
    const calls = env.requests.filter(request => request[1] === 'create').length;
    wait.resolve({ state: 'created' });
    await Promise.all([first, second]);
    results.push({ case: 'double-click-creates-once', pass: calls === 1, observed: { createCalls: calls } });
  }
  {
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? income : action === 'create' ?
      { packageInfo: 'synthetic', mchId: 'synthetic', appId: 'synthetic' } : { list: [] });
    let transfer;
    env.wx.canIUse = () => true;
    env.wx.requestMerchantTransfer = options => { transfer = options; };
    page.visible = true;
    await page.load();
    const payout = page.withdraw();
    await pause();
    const before = env.requests.filter(request => request[1] === 'create').length === 1 && !!transfer;
    page.onHide();
    transfer.success({});
    await payout;
    await page.onShow();
    const calls = env.requests.filter(request => request[1] === 'create').length;
    results.push({ case: 'native-return-only-rechecks', pass: before && calls === 1 && page.data.ready && !page.data.busy,
      observed: { createCalls: calls, ready: page.data.ready, busy: page.data.busy } });
  }
  console.log(JSON.stringify({ scope: 'synthetic users; no cloud or real transfer', pass: results.filter(result => result.pass).length,
    fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
