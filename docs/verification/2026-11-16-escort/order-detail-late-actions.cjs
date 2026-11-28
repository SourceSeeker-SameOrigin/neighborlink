// Run from the repository root. All orders, media and platform callbacks are synthetic.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { setup } = require('./resident-shops.cjs');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { resolve, promise };
}

async function openOrder(onReply = async () => {}) {
  const { db, call } = setup(1, 'fixed');
  const { orderId } = await call('merchant', 'createBooking', { serviceId: 's000', requestId: 'late_action_fixture' });
  const main = db.load('cloudfunctions/order/index.js').main;
  const payment = { pay: (...args) => session.load('miniprogram/utils/payment.js').pay(...args) };
  const session = runtime(async (name, action, params) => {
    assert.equal(name, 'order');
    const result = await main({ ...params, action });
    await onReply(action, result);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  }, { payment });
  const page = session.instance('miniprogram/pages/orders/detail.js');
  page.onLoad({ id: orderId });
  await page.onShow();
  assert.ok(page.data.order.canPay);
  return { session, page, db };
}

async function transition({ page, db }, stage) {
  if (stage === 'hide' || stage === 'return') page.onHide();
  if (stage === 'return') await page.onShow();
  if (stage === 'unload') page.onUnload();
  if (stage === 'denied') {
    db.setActor('staff');
    await page.load();
    assert.equal(page.data.order, null);
  }
}

async function photo(entry, stage, fail) {
  const test = await openOrder();
  const { session, page } = test;
  const file = 'cloud://fixture/sample';
  page.setData({ order: { ...page.data.order, photos: [file] }, vacantPhotoGroups: [{ photos: [file] }] });
  const links = session.load('miniprogram/utils/media-links.js');
  const release = deferred();
  links.register({ [file]: { url: '', expiresAt: 0 } }, async () => {
    await release.promise;
    if (fail) throw Error('合成链接读取失败');
    links.register({ [file]: { url: 'local-image', expiresAt: Date.now() + 60000 } }, () => {});
  });
  const effects = [];
  session.wx.previewImage = () => effects.push('preview');
  session.wx.showToast = () => effects.push('toast');
  const op = page[entry]({ currentTarget: { dataset: { url: file } } });
  await transition(test, stage);
  release.resolve();
  await op;
  assert.deepEqual(effects, stage === 'visible' ? [fail ? 'toast' : 'preview'] : []);
}

async function modal(entry, stage, confirmed) {
  const test = await openOrder();
  const { session, page, db } = test;
  const opened = deferred();
  session.wx.showModal = options => opened.resolve(options);
  const op = page[entry]();
  const dialog = await opened.promise;
  await transition(test, stage);
  dialog.success({ confirm: confirmed });
  await op;
  const action = entry === 'pay' ? 'mockPay' : 'cancel';
  const submit = stage === 'visible' && confirmed;
  assert.equal(session.requests.filter(([, name]) => name === action).length, Number(submit));
  assert.equal(db.data.orders.length, 1);
  if (action === 'mockPay') assert.equal(db.data.orders[0].status, submit ? 'paid' : 'pending_pay');
}

async function confirmAfterReturn() {
  const { page, session, db } = await openOrder();
  const oldDialog = deferred();
  session.wx.showModal = options => oldDialog.resolve(options);
  const first = page.pay();
  const stale = await oldDialog.promise;
  page.onHide();
  await page.onShow();
  stale.success({ confirm: true });
  await first;
  assert.equal(db.data.orders[0].status, 'pending_pay');
  const newDialog = deferred();
  session.wx.showModal = options => newDialog.resolve(options);
  const second = page.pay();
  (await newDialog.promise).success({ confirm: true });
  await second;
  assert.equal(page.data.order.status, 'paid');
  assert.equal(session.requests.filter(([, action]) => action === 'mockPay').length, 1);
}

async function paymentAlreadySent() {
  const arrived = deferred(), release = deferred();
  const { page, session, db } = await openOrder(async action => {
    if (action === 'mockPay') {
      arrived.resolve();
      await release.promise;
    }
  });
  session.wx.showModal = options => options.success({ confirm: true });
  const first = page.pay();
  await arrived.promise;
  page.onHide();
  release.resolve();
  await first;
  assert.equal(db.data.orders[0].status, 'paid');
  await page.onShow();
  assert.equal(page.data.order.status, 'paid');
  await page.pay();
  assert.equal(session.requests.filter(([, action]) => action === 'mockPay').length, 1);
}

(async () => {
  for (const stage of ['visible', 'hide', 'unload', 'denied', 'return']) {
    for (const flag of [false, true]) {
      for (const name of ['preview', 'previewVacant']) await photo(name, stage, flag);
      for (const name of ['pay', 'cancel']) await modal(name, stage, flag);
    }
    console.log(stage, '8/8');
  }
  await confirmAfterReturn();
  await paymentAlreadySent();
  console.log('返回后主动支付、已发送请求迟到均通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
