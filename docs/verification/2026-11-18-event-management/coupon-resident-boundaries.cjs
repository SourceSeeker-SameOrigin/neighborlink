// Actual P36/P37 pages with synthetic residents and intercepted CloudBase calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const template = { _id: 'synthetic-template-a', name: '测试券', kind: 'amount_off',
  value: 200, threshold: 0, validDays: 7, remaining: 3 };
const coupon = { _id: 'synthetic-coupon-a', name: '测试券', kind: 'amount_off',
  value: 200, status: 'unused', threshold: 0 };
const fixture = (file, handler) => {
  const env = runtime(handler);
  env.app.globalData.user = { _id: 'resident-a', roles: ['resident'] };
  return { env, page: env.instance(file) };
};
const center = 'miniprogram/coupons/center/center.js';
const mine = 'miniprogram/coupons/mine/mine.js';

(async () => {
  const results = [];
  {
    const { page } = fixture(center, async () => ({ list: [template] }));
    await page.onShow();
    results.push({ case: 'center-normal-list', pass: page.data.list.length === 1 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(center, async () => waiting.promise);
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    waiting.resolve({ list: [template] });
    await read;
    results.push({ case: 'center-late-list-after-user-change', pass: page.data.list.length === 0,
      observed: { rows: page.data.list.length } });
  }
  {
    const { env, page } = fixture(center, async (name, action) =>
      action === 'center' ? { list: [template] } : { couponId: 'synthetic-coupon-b' });
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.claim({ currentTarget: { dataset: { id: template._id } } });
    const claims = env.requests.filter(args => args[0] === 'coupon' && args[1] === 'claim');
    results.push({ case: 'center-old-claim-after-user-change', pass: claims.length === 0,
      observed: { claimCalls: claims.length } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(center, async () => waiting.promise);
    const read = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve({ list: [template] });
    await read;
    results.push({ case: 'center-late-list-after-hide', pass: page.data.list.length === 0 });
  }
  {
    const { page } = fixture(mine, async () => ({ list: [coupon], hasMore: false }));
    await page.onShow();
    results.push({ case: 'wallet-normal-list', pass: page.data.list.length === 1 && page.data.ownerId === 'resident-a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(mine, async () => waiting.promise);
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    waiting.resolve({ list: [coupon], hasMore: false });
    await read;
    results.push({ case: 'wallet-late-list-after-user-change', pass: page.data.list.length === 0,
      observed: { rows: page.data.list.length, ownerId: page.data.ownerId } });
  }
  {
    const { env, page } = fixture(mine, async (name, action) =>
      action === 'mine' ? { list: [coupon], hasMore: false } : {});
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.retryWelcome();
    const retries = env.requests.filter(args => args[0] === 'user' && args[1] === 'retryWelcomeCoupons');
    results.push({ case: 'wallet-old-welcome-retry-after-user-change', pass: retries.length === 0,
      observed: { retryCalls: retries.length } });
  }
  {
    const { env, page } = fixture(mine, async (name, action) =>
      action === 'mine' ? { list: [coupon], hasMore: true, nextOffset: 20 } : {});
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await page.loadMore();
    const reads = env.requests.filter(args => args[0] === 'coupon' && args[1] === 'mine');
    results.push({ case: 'wallet-more-detects-owner-change', pass: reads.length === 2 && reads[1][2].offset === 0,
      observed: { offsets: reads.map(args => args[2].offset) } });
  }
  console.log(JSON.stringify({ scope: 'synthetic residents; CloudBase calls intercepted',
    pass: results.filter(result => result.pass).length,
    fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
