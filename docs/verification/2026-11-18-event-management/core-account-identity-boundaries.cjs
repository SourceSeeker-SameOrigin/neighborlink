// Actual P07-P10 pages with synthetic accounts; API, payment, phone and navigation are intercepted.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const pause = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const user = id => ({ _id: id, communityId: 'community-' + id, buildingId: 'building-' + id,
  buildingName: '合成楼', unit: '1', room: '101', roles: id === 'a' ? ['resident', 'provider'] : ['resident'], prefs: {} });
const order = (id, status = 'pending_pay') => ({ _id: id, serviceCode: 'trash', kind: 'service', status,
  pricing: { payAmount: 500, goodsCap: 0 }, createdAt: '2026-11-20T00:00:00Z',
  timeline: [], refunds: [], detail: {}, canPay: status === 'pending_pay', canCancel: true,
  provider: { canCall: status === 'accepted', phone: '13800000000' }, canChat: status === 'accepted' });
const listFile = 'miniprogram/pages/orders/list.js';
const detailFile = 'miniprogram/pages/orders/detail.js';
const membershipFile = 'miniprogram/pages/membership/index.js';
const meFile = 'miniprogram/pages/me/me.js';
const fixture = (file, handler) => {
  const env = runtime(handler);
  env.app.globalData.user = user('a');
  env.app.globalData.community = { _id: 'community-a', enabledFeatures: {}, hotline: '13800000000' };
  env.app.globalData.provider = { status: 'approved' };
  const phoneCalls = [];
  env.wx.makePhoneCall = options => phoneCalls.push(options.phoneNumber);
  env.wx.setTabBarBadge = options => { env.badge = options.text; };
  env.wx.removeTabBarBadge = () => { env.badge = ''; };
  env.wx.showModal = options => options.success?.({ confirm: true });
  return { env, page: env.instance(file), phoneCalls };
};
const listReply = async (name, action) => action === 'listMine' ?
  { list: [order('order-a')], hasMore: false } : { unreadTotal: 2 };
const detailReply = async (name, action) => action === 'detail' ? order('order-a') :
  action === 'open' ? { conversationId: 'conversation-a', unread: 0 } : {};
const membershipReply = async (name, action) => action === 'plans' ?
  { list: [{ code: 'trash_monthly', payAmount: 500, price: 500 }] } :
  action === 'mine' ? { list: [{ _id: 'card-a', status: 'active', startAt: '2026-11-20T00:00:00Z', endAt: '2026-12-20T00:00:00Z' }] } : {};
const meReply = async (name, action) => action === 'list' ? { unreadTotal: 2 } : {};

(async () => {
  const results = [];
  {
    const { page } = fixture(listFile, listReply);
    await page.load(true);
    results.push({ case: 'orders-normal-list', pass: page.data.orders.length === 1 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(listFile, async (name, action) =>
      action === 'listMine' ? waiting.promise : { unreadTotal: 2 });
    const read = page.load(true);
    await pause();
    env.app.globalData.user = user('b');
    waiting.resolve({ list: [order('order-a')], hasMore: false });
    await read;
    results.push({ case: 'orders-late-list-after-user-switch', pass: page.data.orders.length === 0,
      observed: { ids: page.data.orders.map(item => item._id) } });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(listFile, async () => waiting.promise);
    const read = page.refreshUnread();
    await pause();
    env.app.globalData.user = user('b');
    waiting.resolve({ unreadTotal: 7 });
    await read;
    results.push({ case: 'orders-late-badge-after-user-switch', pass: env.badge === undefined,
      observed: { badge: env.badge } });
  }
  {
    const { page } = fixture(detailFile, detailReply);
    page.onLoad({ id: 'order-a' });
    await page.load();
    results.push({ case: 'detail-normal-read', pass: page.data.order?._id === 'order-a' });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(detailFile, async (name, action) =>
      action === 'detail' ? waiting.promise : detailReply(name, action));
    page.onLoad({ id: 'order-a' });
    const read = page.load();
    await pause();
    env.app.globalData.user = user('b');
    waiting.resolve(order('order-a'));
    await read;
    results.push({ case: 'detail-late-order-after-user-switch', pass: !page.data.order,
      observed: { orderId: page.data.order?._id } });
  }
  {
    const { env, page } = fixture(detailFile, detailReply);
    page.onLoad({ id: 'order-a' });
    await page.load();
    env.app.globalData.user = user('b');
    await page.pay();
    const retry = env.requests.filter(args => args[0] === 'order' && args[1] === 'retryPayment');
    results.push({ case: 'detail-old-payment-after-user-switch', pass: retry.length === 0,
      observed: { retryPayment: retry.length } });
  }
  {
    const { env, page, phoneCalls } = fixture(detailFile, async (name, action) =>
      action === 'detail' ? order('order-a', 'accepted') : detailReply(name, action));
    page.onLoad({ id: 'order-a' });
    await page.load();
    env.app.globalData.user = user('b');
    page.callProvider();
    page.openChat();
    results.push({ case: 'detail-old-contact-after-user-switch',
      pass: phoneCalls.length === 0 && env.navigation.length === 0,
      observed: { dialCalls: phoneCalls.length, navigation: env.navigation.length } });
  }
  {
    const { page } = fixture(membershipFile, membershipReply);
    await page.load();
    results.push({ case: 'membership-normal-load', pass: page.data.ready && page.data.plans.length === 1 });
  }
  {
    const waiting = deferred();
    const { env, page } = fixture(membershipFile, async (name, action) =>
      action === 'plans' ? waiting.promise : { list: [] });
    const read = page.load();
    await pause();
    env.app.globalData.user = user('b');
    waiting.resolve({ list: [{ code: 'trash_monthly', payAmount: 500, price: 500 }] });
    await read;
    results.push({ case: 'membership-late-plans-after-user-switch', pass: !page.data.ready && page.data.plans.length === 0,
      observed: { ready: page.data.ready, plans: page.data.plans.length } });
  }
  {
    const { env, page } = fixture(membershipFile, membershipReply);
    env.store['membershipOrderReceipt:a'] = { userId: 'a', orderId: 'order-a' };
    await page.load();
    env.app.globalData.user = user('b');
    page.openCreatedOrder();
    results.push({ case: 'membership-old-order-entry-after-user-switch', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.map(item => item[1]) } });
  }
  {
    const { env, page } = fixture(membershipFile, membershipReply);
    await page.load();
    env.app.globalData.user = user('b');
    await page.skip({ currentTarget: { dataset: { id: 'card-a' } } });
    const skips = env.requests.filter(args => args[0] === 'membership' && args[1] === 'skipToday');
    results.push({ case: 'membership-old-skip-after-user-switch', pass: skips.length === 0,
      observed: { skips: skips.length } });
  }
  {
    const { page } = fixture(meFile, meReply);
    await page.load();
    results.push({ case: 'me-normal-load', pass: page.data.user?._id === 'a' });
  }
  {
    const { env, page } = fixture(meFile, meReply);
    await page.load();
    env.app.globalData.user = user('b');
    page.openWorkspace({ currentTarget: { dataset: { code: 'provider' } } });
    results.push({ case: 'me-old-workspace-after-user-switch', pass: env.navigation.length === 0,
      observed: { navigation: env.navigation.map(item => item[1]) } });
  }
  {
    const { env, page } = fixture(meFile, meReply);
    await page.load();
    env.app.globalData.user = user('b');
    await page.doorDeliveryChange({ detail: { value: true } });
    const writes = env.requests.filter(args => args[0] === 'station' && args[1] === 'setDoorDelivery');
    results.push({ case: 'me-old-door-delivery-after-user-switch', pass: writes.length === 0,
      observed: { writes: writes.length } });
  }
  {
    const waiting = deferred();
    const { page } = fixture(listFile, async (name, action) =>
      action === 'listMine' ? waiting.promise : { unreadTotal: 0 });
    const read = page.load(true);
    await pause();
    page.onHide();
    waiting.resolve({ list: [order('order-a')], hasMore: false });
    await read;
    results.push({ case: 'orders-late-list-after-hide', pass: page.data.orders.length === 0 });
  }
  console.log(JSON.stringify({ scope: 'actual P07-P10 pages; synthetic accounts, all external actions intercepted',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
