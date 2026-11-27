// Actual P58 page and shared ad helper with synthetic identities and intercepted calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const shop = { _id: 'synthetic-shop-a', name: '测试商家', ratingCount: 0 };
const ad = { _id: 'synthetic-ad-a', title: '测试广告', target: { type: 'event', id: 'event-a' } };
const fixture = handler => {
  const env = runtime(handler);
  env.app.globalData.user = { _id: 'resident-a', communityId: 'community-a', roles: ['resident'] };
  return { env, page: env.instance('miniprogram/shops/list/list.js') };
};
const standard = async (name, action) => {
  if (name === 'content' && action === 'adsForSlot') return { ads: [] };
  if (name === 'content' && action === 'adEvent') return {};
  if (name === 'merchant' && action === 'listForCommunity') return { list: [shop], hasMore: false, nextOffset: 0 };
  throw Error('Unexpected synthetic call: ' + name + '.' + action);
};

(async () => {
  const results = [];
  {
    const { page } = fixture(standard);
    await page.onShow();
    results.push({ case: 'normal-merchant-list', pass: page.data.list.length === 1 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture((name, action) => name === 'merchant' && action === 'listForCommunity'
      ? waiting.promise : standard(name, action));
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    waiting.resolve({ list: [shop], hasMore: false, nextOffset: 0 });
    await read;
    results.push({ case: 'late-community-a-shop-after-switch-to-b', pass: page.data.list.length === 0,
      observed: { rows: page.data.list.length } });
  }
  {
    const { env, page } = fixture(standard);
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    page.open({ currentTarget: { dataset: { id: shop._id } } });
    results.push({ case: 'old-shop-card-after-user-change', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length } });
  }
  {
    const waiting = deferred();
    const { page } = fixture((name, action) => name === 'merchant' && action === 'listForCommunity'
      ? waiting.promise : standard(name, action));
    const read = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve({ list: [shop], hasMore: false, nextOffset: 0 });
    await read;
    results.push({ case: 'late-shop-after-hide', pass: page.data.list.length === 0 });
  }
  {
    const { env, page } = fixture(async (name, action) => {
      if (name === 'content' && action === 'adsForSlot') return { ads: [ad] };
      return standard(name, action);
    });
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    page.openAd({ currentTarget: { dataset: { id: ad._id } } });
    results.push({ case: 'old-ad-click-after-user-change', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length,
        adEvents: env.requests.filter(args => args[0] === 'content' && args[1] === 'adEvent').length } });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture((name, action) => name === 'content' && action === 'adsForSlot'
      ? waiting.promise : standard(name, action));
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    waiting.resolve({ ads: [ad] });
    await read;
    results.push({ case: 'late-community-a-ad-after-switch-to-b', pass: page.data.ads.length === 0,
      observed: { ads: page.data.ads.length } });
  }
  console.log(JSON.stringify({ scope: 'synthetic residents/communities; API and navigation intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
