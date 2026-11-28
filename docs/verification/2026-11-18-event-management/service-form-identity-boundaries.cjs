// Seven actual shared service forms with synthetic residents and intercepted calls/navigation.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const files = {
  express: 'miniprogram/pages/service/express.js', trash: 'miniprogram/pages/service/trash.js',
  buy: 'miniprogram/pages/service/buy.js', help: 'miniprogram/pages/service/help.js',
  meal: 'miniprogram/elder/meal.js', escort: 'miniprogram/elder/escort.js', pet: 'miniprogram/pet/order.js'
};
const user = id => ({ _id: id, communityId: 'community-' + id, buildingId: 'building-' + id,
  buildingName: '合成楼', unit: '1', room: '101', phone: '13800000000', roles: ['resident'] });
const community = id => ({ _id: id, name: '合成小区', prices: {}, enabledFeatures: {},
  stations: [{ code: 'station-a', name: '合成驿站' }], canteens: [{ code: 'canteen-a', name: '合成食堂' }] });
const quote = { onDutyCount: 1, slots: [], pricing: { payAmount: 500, goodsCap: 0 },
  couponOptions: [], couponsEnabled: false, pointsEnabled: false };
const fixture = (file, handler) => {
  const env = runtime(handler);
  env.app.globalData.user = user('resident-a');
  return { env, page: env.instance(file) };
};
const handler = async (name, action, payload) => {
  if (name === 'catalog' && action === 'getCommunity') return community(payload.communityId);
  if (name === 'order' && action === 'quote') return quote;
  throw Error('Unexpected synthetic call: ' + name + '.' + action);
};

(async () => {
  const results = [];
  for (const [service, file] of Object.entries(files)) {
    {
      const { page } = fixture(file, handler);
      await page.load();
      results.push({ case: service + '-normal-load', pass: page.ownerId === 'resident-a' &&
        page.data.community?._id === 'community-resident-a' });
    }
    {
      const waiting = deferred();
      const { env, page } = fixture(file, async (name, action, payload) =>
        name === 'order' && action === 'quote' ? waiting.promise : handler(name, action, payload));
      await page.load();
      const reading = page.refreshQuote();
      await pause();
      env.app.globalData.user = user('resident-b');
      waiting.resolve(quote);
      await reading;
      results.push({ case: service + '-old-quote-after-user-switch', pass: !page.data.quote,
        observed: { quoted: !!page.data.quote } });
    }
    {
      const { env, page } = fixture(file, handler);
      await page.load();
      page.createdOrderId = 'order-a';
      page.setData({ createdOrderId: 'order-a' });
      env.app.globalData.user = user('resident-b');
      page.openCreatedOrder();
      results.push({ case: service + '-old-order-entry-after-user-switch', pass: env.navigation.length === 0,
        observed: { navigation: env.navigation.map(item => item[1]) } });
    }
  }
  {
    const { env, page } = fixture(files.trash, handler);
    await page.load();
    page.setData({ quote: quote.pricing });
    env.app.globalData.user = user('resident-b');
    await page.submit();
    const creates = env.requests.filter(args => args[0] === 'order' && args[1] === 'create');
    results.push({ case: 'trash-submit-current-owner-check', pass: creates.length === 0 });
  }
  {
    const waiting = deferred();
    const { page } = fixture(files.trash, async (name, action, payload) =>
      name === 'order' && action === 'quote' ? waiting.promise : handler(name, action, payload));
    await page.load();
    const reading = page.refreshQuote();
    await pause();
    page.onHide();
    waiting.resolve(quote);
    await reading;
    results.push({ case: 'trash-old-quote-after-hide', pass: !page.data.quote });
  }
  console.log(JSON.stringify({ scope: 'seven actual shared forms, synthetic residents; CloudBase/navigation intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
