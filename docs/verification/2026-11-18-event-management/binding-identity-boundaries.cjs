// Actual P02 binding page with synthetic residents, addresses and intercepted user writes.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const resident = id => ({ _id: id, communityId: 'community-' + id, buildingId: 'building-' + id,
  unit: '1', room: '101-' + id, phone: '13800000000', roles: ['resident'] });
const communities = [{ _id: 'community-a', name: 'A 小区' }, { _id: 'community-b', name: 'B 小区' }];
const reply = async (name, action, payload) => {
  if (name === 'catalog' && action === 'listCommunities') return { list: communities, hasMore: false };
  if (name === 'catalog' && action === 'getCommunity') return { buildings: [{ _id: 'building-a', units: ['1'] },
    { _id: 'building-b', units: ['1'] }] };
  if (name === 'user' && action === 'setAddress') return resident('a');
  if (name === 'user' && action === 'bindPhone') return resident('a');
  throw Error('Unexpected synthetic call: ' + name + '.' + action);
};
const fixture = handler => {
  const env = runtime(handler);
  env.app.globalData.user = resident('a');
  return { env, page: env.instance('miniprogram/pages/bind/bind.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(reply);
    await page.load();
    results.push({ case: 'binding-normal-load', pass: page.data.room === '101-a' &&
      page.data.communities[page.data.communityIndex]._id === 'community-a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async (name, action, payload) =>
      name === 'catalog' && action === 'listCommunities' ? waiting.promise : reply(name, action, payload));
    const reading = page.load();
    await pause();
    env.app.globalData.user = resident('b');
    waiting.resolve({ list: communities, hasMore: false });
    await reading;
    results.push({ case: 'binding-old-resident-load-after-user-switch',
      pass: page.data.room !== '101-a' && !page.data.phone,
      observed: { room: page.data.room, communityId: page.data.communities[page.data.communityIndex]?._id } });
  }
  {
    const { env, page } = fixture(reply);
    await page.load();
    page.setData({ agreed: true });
    env.app.globalData.user = resident('b');
    await page.save();
    const writes = env.requests.filter(args => args[0] === 'user' && args[1] === 'setAddress');
    results.push({ case: 'binding-old-address-submit-after-user-switch', pass: writes.length === 0,
      observed: { writes: writes.length, communityId: writes[0]?.[2]?.communityId } });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async (name, action, payload) =>
      name === 'user' && action === 'bindPhone' ? waiting.promise : reply(name, action, payload));
    await page.load();
    const binding = page.phone({ detail: { code: 'synthetic-code' } });
    await pause();
    env.app.globalData.user = resident('b');
    waiting.resolve(resident('a'));
    await binding;
    results.push({ case: 'binding-old-phone-return-overwrites-current-user',
      pass: env.app.globalData.user._id === 'b' && !page.data.phoneVerified,
      observed: { currentUser: env.app.globalData.user._id, phoneVerified: page.data.phoneVerified } });
  }
  {
    const { env, page } = fixture(reply);
    await page.load();
    env.app.globalData.user = resident('b');
    await page.load();
    results.push({ case: 'binding-new-resident-explicit-reload', pass: page.data.room === '101-b' &&
      page.data.communities[page.data.communityIndex]._id === 'community-b' });
  }
  console.log(JSON.stringify({ scope: 'actual P02 page; synthetic residents/phone/address, user API intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
