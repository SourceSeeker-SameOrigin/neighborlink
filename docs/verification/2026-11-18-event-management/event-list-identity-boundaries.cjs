// Actual P48 page with synthetic residents/communities and intercepted API/navigation.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const event = id => ({ _id: id, title: id, fee: 0, remaining: 1, location: '测试地点' });
const fixture = handler => {
  const env = runtime(handler);
  env.app.globalData.user = { _id: 'resident-a', communityId: 'community-a', roles: ['resident'] };
  return { env, page: env.instance('miniprogram/events/list/list.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async () => ({ list: [event('event-a')], hasMore: false }));
    await page.onShow();
    results.push({ case: 'normal-current-community-list', pass: page.data.list.length === 1 });
  }
  {
    const old = deferred();
    const next = deferred();
    let calls = 0;
    const { page } = fixture(async () => ++calls === 1 ? old.promise : next.promise);
    const first = page.onShow();
    await pause();
    const second = page.load();
    await pause();
    next.resolve({ list: [], hasMore: false });
    await pause();
    old.resolve({ list: [event('event-a')], hasMore: false });
    await Promise.all([first, second]);
    results.push({ case: 'older-read-cannot-overwrite-newer', pass: page.data.list.length === 0 });
  }
  {
    const waiting = deferred();
    const { page } = fixture(async () => waiting.promise);
    const read = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve({ list: [event('event-a')], hasMore: false });
    await read;
    results.push({ case: 'late-list-after-hide', pass: page.data.list.length === 0 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async () => waiting.promise);
    const read = page.onShow();
    await pause();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    waiting.resolve({ list: [event('event-a')], hasMore: false });
    await read;
    results.push({ case: 'late-community-a-list-after-switch-to-b', pass: page.data.list.length === 0,
      observed: { ids: page.data.list.map(row => row._id) } });
  }
  {
    const { env, page } = fixture(async () => ({ list: [event('event-a')], hasMore: false }));
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b', roles: ['resident'] };
    page.open({ currentTarget: { dataset: { id: 'event-a' } } });
    results.push({ case: 'old-community-card-after-identity-change', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.length } });
  }
  {
    const { env, page } = fixture(async (name, action, payload) =>
      payload.offset === 0 ? { list: [event('event-a')], hasMore: true } :
        { list: [event('event-b')], hasMore: false });
    await page.onShow();
    env.app.globalData.user = { _id: 'resident-b', communityId: 'community-a', roles: ['resident'] };
    await page.onReachBottom();
    results.push({ case: 'same-community-other-user-pagination-does-not-reuse-old-rows',
      pass: page.data.list.length === 1 && page.data.list[0]._id === 'event-a' &&
        env.requests.at(-1)[2].offset === 0,
      observed: { ids: page.data.list.map(row => row._id), offset: env.requests.at(-1)[2].offset } });
  }
  console.log(JSON.stringify({ scope: 'synthetic identities/communities; API and navigation intercepted',
    pass: results.filter(result => result.pass).length,
    fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
