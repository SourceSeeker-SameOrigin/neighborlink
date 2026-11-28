// Actual P01 home page with synthetic residents and intercepted CloudBase/native calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const user = (id, communityId) => ({ _id: id, communityId, buildingId: 'building-1', roles: ['resident'] });
const community = id => ({ _id: id, hotline: '13800000000', enabledFeatures: { merchants: true, events: true } });
const homeContent = { notice: { _id: 'notice-a', title: '合成公告' },
  ads: [{ _id: 'ad-a', target: { type: 'page', path: '/shops/list/list' } }] };
const fixture = handler => {
  const env = runtime(handler);
  env.app.globalData.user = user('resident-a', 'community-a');
  const calls = [];
  env.wx.makePhoneCall = options => calls.push(options.phoneNumber);
  env.wx.showModal = () => {};
  return { env, page: env.instance('miniprogram/pages/index/index.js'), calls };
};
const normal = async (name, action) => {
  if (name === 'catalog' && action === 'getCommunity') return community('community-a');
  if (name === 'content' && action === 'homeContent') return homeContent;
  if (name === 'content' && action === 'adEvent') return {};
  throw Error('Unexpected synthetic call: ' + name + '.' + action);
};

(async () => {
  const results = [];
  {
    const { env, page } = fixture(normal);
    await page.onShow();
    results.push({ case: 'home-normal-load', pass: page.data.community?._id === 'community-a' &&
      env.app.globalData.community?._id === 'community-a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(async (name, action) =>
      name === 'catalog' && action === 'getCommunity' ? waiting.promise : homeContent);
    const reading = page.onShow();
    await pause();
    env.app.globalData.user = user('resident-b', 'community-b');
    waiting.resolve(community('community-a'));
    await reading;
    results.push({ case: 'home-old-community-after-user-switch',
      pass: !page.data.community && !env.app.globalData.community,
      observed: { pageCommunity: page.data.community?._id, globalCommunity: env.app.globalData.community?._id } });
  }
  {
    const { env, page } = fixture(normal);
    await page.onShow();
    env.app.globalData.user = user('resident-b', 'community-b');
    page.introduce({ currentTarget: { dataset: { code: 'merchants' } } });
    results.push({ case: 'home-old-directory-entry-after-user-switch', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.map(item => item[1]) } });
  }
  {
    const { env, page } = fixture(normal);
    await page.onShow();
    env.app.globalData.user = user('resident-b', 'community-b');
    page.openAd({ currentTarget: { dataset: { id: 'ad-a' } }, type: 'tap' });
    const events = env.requests.filter(args => args[0] === 'content' && args[1] === 'adEvent');
    results.push({ case: 'home-old-ad-after-user-switch', pass: env.navigation.length === 0 && events.length === 0,
      observed: { navigation: env.navigation.length, adEvents: events.length } });
  }
  {
    const { env, page, calls } = fixture(normal);
    await page.onShow();
    env.app.globalData.user = user('resident-b', 'community-b');
    page.callHotline();
    results.push({ case: 'home-old-hotline-after-user-switch', pass: calls.length === 0,
      observed: { dialCalls: calls.length } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(async (name, action) =>
      name === 'catalog' && action === 'getCommunity' ? waiting.promise : homeContent);
    const reading = page.onShow();
    await pause();
    page.onHide();
    waiting.resolve(community('community-a'));
    await reading;
    results.push({ case: 'home-old-read-after-hide', pass: !page.data.community });
  }
  console.log(JSON.stringify({ scope: 'actual P01 page, synthetic residents; CloudBase/native calls intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
