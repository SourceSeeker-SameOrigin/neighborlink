// Actual P68/P69 pages with synthetic residents and intercepted CloudBase calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const resident = (id, communityId = 'community-a') => ({ _id: id, communityId, roles: ['resident'] });
const recycleFile = 'miniprogram/recycle/order/order.js';
const noticeFile = 'miniprogram/notices/list/list.js';
const quote = { slots: ['2026-12-01 10:00'], pricing: { total: 0 }, validationMessage: '' };
const notice = id => ({ _id: id, title: id, createdAt: Date.now() });
const fixture = (file, handler) => {
  const env = runtime(handler);
  env.app.globalData.user = resident('resident-a');
  return { env, page: env.instance(file) };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(recycleFile, async (name, action) => action === 'quote' ? quote : { orderId: 'order-a' });
    await page.onLoad();
    await page.category({ currentTarget: { dataset: { code: 'paper' } } });
    results.push({ case: 'recycle-normal-quote', pass: !!page.data.pricing && page.data.slots.length === 1 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(recycleFile, async (name, action) => action === 'quote' ? waiting.promise : {});
    await page.onLoad();
    const reading = page.category({ currentTarget: { dataset: { code: 'paper' } } });
    await pause();
    env.app.globalData.user = resident('resident-b', 'community-b');
    waiting.resolve(quote);
    await reading;
    results.push({ case: 'recycle-old-quote-after-user-switch', pass: !page.data.pricing && page.data.slots.length === 0,
      observed: { quoted: !!page.data.pricing, slots: page.data.slots.length } });
  }
  {
    const { env, page } = fixture(recycleFile, async (name, action) => action === 'quote' ? quote : { orderId: 'order-a' });
    await page.onLoad();
    await page.category({ currentTarget: { dataset: { code: 'paper' } } });
    env.app.globalData.user = resident('resident-b', 'community-b');
    await page.create();
    const calls = env.requests.filter(args => args[0] === 'order' && args[1] === 'create');
    results.push({ case: 'recycle-old-create-after-user-switch', pass: calls.length === 0,
      observed: { calls: calls.length, communityId: calls[0]?.[2]?.communityId } });
  }
  {
    const { env, page } = fixture(recycleFile, async () => { throw Error('unexpected request'); });
    env.store['recycleOrderReceipt:resident-a'] = { userId: 'resident-a', orderId: 'order-a' };
    await page.onLoad();
    env.app.globalData.user = resident('resident-b', 'community-b');
    page.openCreatedOrder();
    results.push({ case: 'recycle-old-order-entry-after-user-switch', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.map(item => item[1]) } });
  }
  {
    const { env, page } = fixture(recycleFile, async () => quote);
    await page.onLoad();
    page.note({ detail: { value: 'A 的合成备注' } });
    await page.category({ currentTarget: { dataset: { code: 'paper' } } });
    env.app.globalData.user = resident('resident-b', 'community-b');
    await page.load();
    results.push({ case: 'recycle-new-user-load-clears-old-draft',
      pass: !page.data.note && page.data.categories.every(item => !item.selected),
      observed: { note: page.data.note, selected: page.data.categories.filter(item => item.selected).map(item => item.code) } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(recycleFile, async () => waiting.promise);
    await page.onLoad();
    const reading = page.category({ currentTarget: { dataset: { code: 'paper' } } });
    await pause();
    page.onHide();
    waiting.resolve(quote);
    await reading;
    results.push({ case: 'recycle-old-quote-after-hide', pass: !page.data.pricing });
  }
  {
    const { page } = fixture(noticeFile, async () => ({ list: [notice('notice-a')], nextOffset: 1, hasMore: false }));
    await page.onShow();
    results.push({ case: 'notices-normal-list', pass: page.data.list.length === 1 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(noticeFile, async () => waiting.promise);
    const reading = page.onShow();
    await pause();
    env.app.globalData.user = resident('resident-b', 'community-b');
    waiting.resolve({ list: [notice('notice-a')], nextOffset: 1, hasMore: false });
    await reading;
    results.push({ case: 'notices-old-community-list-after-user-switch', pass: page.data.list.length === 0,
      observed: { ids: page.data.list.map(item => item._id) } });
  }
  {
    const { env, page } = fixture(noticeFile, async (name, action, payload) => payload.offset === 0 ?
      { list: [notice('notice-a')], nextOffset: 1, hasMore: true } :
      { list: [notice('notice-b')], nextOffset: 2, hasMore: false });
    await page.onShow();
    env.app.globalData.user = resident('resident-b');
    await page.loadMore();
    results.push({ case: 'notices-same-community-other-user-pagination',
      pass: page.data.list.length === 1 && page.data.list[0]._id === 'notice-b',
      observed: { ids: page.data.list.map(item => item._id), offset: page.data.offset } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(noticeFile, async () => waiting.promise);
    const reading = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve({ list: [notice('notice-a')], nextOffset: 1, hasMore: false });
    await reading;
    results.push({ case: 'notices-old-list-after-hide', pass: page.data.list.length === 0 });
  }
  console.log(JSON.stringify({ scope: 'actual P68/P69 pages, synthetic residents; CloudBase and navigation intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
