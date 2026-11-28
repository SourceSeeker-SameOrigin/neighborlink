// No network. Run actual page handlers against order.main, dropping only the first successful create response.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { setup } = require('./order-coupon-paging.cjs');

async function sample(choice, reenter, dropAfterWrite, entry, code = 'trash') {
  const db = setup(100, true);
  const community = db.data.communities[0];
  community.stations = [{ code: 'S1', name: '合成站点' }];
  community.canteens = [{ code: 'C1', name: '合成食堂' }];
  community.prices = structuredClone(community.prices);
  community.prices.meal.goodsCapMax = 20000;
  Object.assign(community.features, { elder: true, pet: true });
  db.cloud.openapi.security.msgSecCheck = async () => ({ result: { suggest: 'pass' } });
  const order = db.load(entry);
  const requests = [];
  let lost = false;
  const ui = runtime(async (name, action, params) => {
    if (name === 'catalog' && action === 'getCommunity') return db.data.communities[0];
    assert.equal(name, 'order');
    const first = action === 'create' && requests.length === 0;
    if (action === 'create') requests.push(params.requestId);
    if (first && !dropAfterWrite) { lost = true; throw Error('发送前网络中断'); }
    const result = await order.main({ ...params, action });
    if (!result.ok) throw Error(result.code + ': ' + result.message);
    if (first) { lost = true; throw Error('未收到建单响应'); }
    return result.data;
  }, { payment: { pay: async () => false } });
  ui.app.globalData.user = db.data.users[0];
  async function open() {
    const folder = ['escort','meal'].includes(code) ? 'elder/' : 'pages/service/';
    const page = ui.instance('miniprogram/' + (code === 'pet' ? 'pet/order' : folder + code));
    page.onLoad({});
    await page.load();
    await page.refreshQuote();
    return page;
  }
  let page = await open();
  const tomorrow = new Date(Date.now() + 32 * 3600000).toISOString().slice(0, 10);
  const values = { trash: { sorted: ['sorted'] }, express: { pickupText: '1-2-3456' },
    help: { desc: '搬运合成测试用水' }, buy: { items: '矿泉水一瓶' }, meal: { items: '米饭一份' },
    escort: { hospital: '合成医院', department: '内科', date: tomorrow, start: '07:00' }, pet: { dates: [tomorrow] } };
  for (const [field, value] of Object.entries(values[code])) {
    page.change({ currentTarget: { dataset: { field } }, detail: { value } });
  }
  if (choice !== 'auto') page.couponChange({ detail: { value: choice } });
  await page.refreshQuote();
  const initial = page.data.amount;
  assert.notEqual(initial, '--', code + ': ' + page.data.quoteError);
  if (code === 'trash') assert.equal(initial, choice === '' ? '5.00' : '3.00');
  await page.submit();
  assert.ok(lost, code + ': ' + page.data.error);
  const originalId = db.data.orders?.[0]?._id;
  if (reenter) {
    page.onUnload();
    const writes = db.writes.length;
    page = await open();
    assert.equal(db.writes.length, writes);
    assert.equal(requests.length, 1);
    assert.equal(ui.requests.filter(req => req[1] === 'lookupRequest').length, 1);
    assert.equal(ui.navigation.length, originalId ? 1 : 0);
    if (!originalId) assert.equal(page.data.amount, initial, code + ': ' + page.data.quoteError);
  }
  const retryQuote = page.data.amount;
  if (!reenter || !originalId) await page.submit();
  const href = ui.navigation.at(-1)?.[1];
  assert.ok(href?.startsWith('/pages/orders/detail?id='), page.data.error);
  const detail = ui.instance('miniprogram/pages/orders/detail');
  detail.onLoad({ id: decodeURIComponent(href.split('=')[1]) });
  await detail.load();
  assert.ok(detail.data.order, detail.data.error);
  assert.equal(new Set(requests).size, 1);
  assert.equal(db.data.orders.length, 1);
  assert.equal(detail.data.amount, initial);
  if (originalId) assert.equal(detail.orderId, originalId);
  const lookupsBefore = db.writes.length;
  db.setActor('other');
  db.data.users.push({ _id: 'another', roles: ['resident'], openid: 'other' });
  const foreign = await order.main({ action: 'lookupRequest', requestId: requests[0], openid: 'actor' });
  assert.equal(foreign.ok, true);
  assert.equal(foreign.data.orderId, null);
  const invalid = await order.main({ action: 'lookupRequest', requestId: '!' });
  assert.equal(invalid.ok, false);
  assert.equal(db.writes.length, lookupsBefore);
  return { code, choice: choice === '' ? 'optOut' : choice, reenter, dropAfterWrite, initial, retryQuote,
    requestIds: new Set(requests).size, orders: db.data.orders.length, recovered:originalId ? originalId === detail.orderId : null,
    detailAmount: detail.data.amount, status: detail.data.order.status, locked: db.data.coupons.filter(c => c.status === 'locked').length };
}

(async () => {
  const entry = process.argv[2] || 'cloudfunctions/order/index.js';
  for (const dropAfterWrite of [false,true]) {
    for (const reenter of [false,true]) {
      for (const choice of ['auto','z','']) console.log(JSON.stringify(await sample(choice,reenter,dropAfterWrite,entry)));
    }
  }
  for (const code of ['express','buy','help','meal','escort','pet']) {
    for (const committed of [false,true]) console.log(JSON.stringify(await sample('auto',true,committed,entry,code)));
  }
})().catch(e => { console.error(e); process.exitCode=1; });
