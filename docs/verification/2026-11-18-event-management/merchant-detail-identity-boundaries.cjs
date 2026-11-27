// Actual P59 page with synthetic residents and intercepted API/navigation.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const detail = { merchant: { _id: 'synthetic-shop-a', name: '测试商家', ratingCount: 0 },
  list: [{ _id: 'synthetic-service-a', title: '测试服务', price: 500 }],
  hasMore: false, nextOffset: 0 };
const fixture = handler => {
  const env = runtime(handler);
  env.app.globalData.user = { _id: 'resident-a', communityId: 'community-a', roles: ['resident'] };
  const page = env.instance('miniprogram/shops/detail/detail.js');
  page.onLoad({ merchantId: 'synthetic-shop-a' });
  return { env, page };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async () => detail);
    await page.onShow();
    results.push({ case: 'normal-detail-and-service',
      pass: page.data.merchant?._id === 'synthetic-shop-a' && page.data.list.length === 1 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async () => waiting.promise);
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    waiting.resolve(detail);
    await read;
    results.push({ case: 'late-detail-after-user-and-community-change',
      pass: page.data.merchant === null && page.data.list.length === 0,
      observed: { merchant: page.data.merchant?._id, services: page.data.list.length } });
  }
  {
    const { env, page } = fixture(async () => detail);
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    page.book({ currentTarget: { dataset: { id: 'synthetic-service-a' } } });
    results.push({ case: 'old-service-booking-entry-after-user-change',
      pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length } });
  }
  {
    const { env, page } = fixture(async (name, action) => {
      if (name === 'content' && action === 'report') return {};
      return detail;
    });
    env.wx.showActionSheet = ({ success }) => success({ tapIndex: 0 });
    env.wx.showModal = ({ success }) => success({ confirm: true, content: '' });
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    await page.reportContent();
    const reports = env.requests.filter(args => args[0] === 'content' && args[1] === 'report');
    results.push({ case: 'old-report-entry-after-user-change', pass: reports.length === 0,
      observed: { reportCalls: reports.length } });
  }
  {
    const { page } = fixture(async () => detail);
    await page.onShow();
    page.onHide();
    results.push({ case: 'hide-clears-old-detail',
      pass: page.data.merchant === null && page.data.list.length === 0 });
  }
  {
    let calls = 0;
    const { page } = fixture(async () => {
      if (++calls === 1) return detail;
      const error = Error('无权访问'); error.code = 'E_FORBIDDEN'; throw error;
    });
    await page.onShow();
    await page.load();
    results.push({ case: 'failed-recheck-clears-old-detail',
      pass: page.data.merchant === null && page.data.list.length === 0 && !!page.data.error });
  }
  console.log(JSON.stringify({ scope: 'synthetic residents/communities; API and navigation intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
