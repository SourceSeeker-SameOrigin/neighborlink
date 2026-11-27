// Actual P38/P41 pages with synthetic residents, communities, and intercepted calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const fixtures = [
  { label: 'board', file: 'miniprogram/board/list/list.js', key: 'posts',
    sample: id => ({ _id: id, title: id, type: 'ask', content: '测试内容' }), create: 'create' },
  { label: 'idle', file: 'miniprogram/idle/list/list.js', key: 'list',
    sample: id => ({ _id: id, title: id, price: 500, desc: '测试内容' }), create: 'create' }
];
const fixture = (config, listResult) => {
  const env = runtime(async (name, action, payload) => {
    if (name === 'catalog' && action === 'getCommunity') {
      return { enabledFeatures: { board: true, idle: true, federation: false } };
    }
    if (name === 'content' && action === 'adsForSlot') return { ads: [] };
    if (name === config.label && action === 'list') return listResult(payload);
    throw Error('Unexpected synthetic call: ' + name + '.' + action);
  });
  env.app.globalData.user = { _id: 'resident-a', communityId: 'community-a',
    buildingId: 'building-a', roles: ['resident'] };
  return { env, page: env.instance(config.file) };
};

(async () => {
  const results = [];
  for (const config of fixtures) {
    const row = id => config.sample(id);
    {
      const { page } = fixture(config, async () => ({ list: [row('a-item')], hasMore: false }));
      await page.onShow();
      results.push({ case: config.label + '-normal-list', pass: page.data[config.key].length === 1 });
    }
    {
      const waiting = deferred();
      const { env, page } = fixture(config, async () => waiting.promise);
      const read = page.onShow();
      await pause();
      env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b',
        buildingId: 'building-b', roles: ['resident'] };
      waiting.resolve({ list: [row('a-item')], hasMore: false });
      await read;
      results.push({ case: config.label + '-late-community-a-list-after-switch-to-b',
        pass: page.data[config.key].length === 0,
        observed: { ids: page.data[config.key].map(item => item._id) } });
    }
    {
      const { env, page } = fixture(config, async () => ({ list: [row('a-item')], hasMore: false }));
      await page.onShow();
      env.app.globalData.user = { _id: 'resident-b', communityId: 'community-b',
        buildingId: 'building-b', roles: ['resident'] };
      page.open({ currentTarget: { dataset: { id: 'a-item' } } });
      results.push({ case: config.label + '-old-card-after-user-switch',
        pass: env.navigation.length === 0,
        observed: { navigation: env.navigation.length } });
    }
    {
      const { env, page } = fixture(config, async payload => ({ list: [row('a-item')], hasMore: false }));
      await page.onShow();
      env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
      page[config.create]();
      results.push({ case: config.label + '-old-create-entry-after-unbound-user-switch',
        pass: env.navigation.length === 1 && env.navigation[0][1] === '/pages/bind/bind',
        observed: { navigation: env.navigation.map(item => item[1]) } });
    }
    {
      const { env, page } = fixture(config, async payload =>
        payload.offset === 0 ? { list: [row('a-item')], hasMore: true } :
          { list: [row('b-item')], hasMore: false });
      await page.onShow();
      env.app.globalData.user = { _id: 'resident-b', communityId: 'community-a',
        buildingId: 'building-b', roles: ['resident'] };
      await page.more();
      results.push({ case: config.label + '-same-community-other-user-pagination',
        pass: page.data[config.key].length === 1 && page.data[config.key][0]._id === 'b-item',
        observed: { ids: page.data[config.key].map(item => item._id) } });
    }
    {
      const waiting = deferred();
      const { page } = fixture(config, async () => waiting.promise);
      const read = page.onShow();
      await pause();
      page.onHide();
      waiting.resolve({ list: [row('a-item')], hasMore: false });
      await read;
      results.push({ case: config.label + '-late-list-after-hide', pass: page.data[config.key].length === 0 });
    }
  }
  console.log(JSON.stringify({ scope: 'synthetic residents/communities; CloudBase and navigation intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
