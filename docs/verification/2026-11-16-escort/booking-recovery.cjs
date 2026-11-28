// Real page and cloud entry, synthetic identities and offline database.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { setup } = require('./resident-shops.cjs');

function scenario(type, fault) {
  const { db, call } = setup(1, type);
  let first = true, payments = 0;
  const env = runtime(async (name, action, data) => {
    if (first && action === 'createBooking') {
      first = false;
      if (fault === 'after') await call(name, action, data);
      throw Error('预约响应丢失');
    }
    return call(name, action, data);
  }, { payment: { async pay() { payments++; return false; } } });
  env.app.globalData.user = db.data.users[0];
  const open = async () => {
    const page = env.instance('miniprogram/shops/booking/booking.js');
    page.onLoad({ serviceId: 's000' });
    await page.onShow();
    return page;
  };
  return { db, env, call, open, payments: () => payments };
}

async function recover(type, change, reopen) {
  const { db, env, open, payments } = scenario(type, 'after');
  let page = await open();
  page.input({ detail: { value: '私有需求样本' } });
  await page.submit();
  assert.equal(page.data.recovery, 'lookup');
  assert.ok(!JSON.stringify(env.store).includes('私有需求样本'));
  if (change === 'hidden') db.data.merchants[0].moderationHidden = true;
  if (change === 'off') db.data.merchantServices[0].status = 'off';
  if (reopen) { page.onUnload(); page = await open(); }
  else await page.submit();
  assert.equal(env.requests.filter(r => r[1] === 'createBooking').length, 1);
  assert.equal(db.data.orders.length, 1);
  assert.equal(page.orderId, db.data.orders[0]._id);
  assert.equal(env.navigation.at(-1)[1], '/pages/orders/detail?id=' + page.orderId);
  assert.equal(payments(), 0);
}

async function missing(type) {
  const { db, env, open, payments } = scenario(type, 'before');
  let page = await open();
  page.input({ detail: { value: '测试需求' } });
  await page.submit();
  const request = env.requests[0][2].requestId;
  page.onUnload();
  page = await open();
  assert.equal(page.data.recovery, 'confirm');
  assert.equal(db.data.orders?.length || 0, 0);
  await page.submit();
  assert.equal(env.requests.length, 2);
  page.input({ detail: { value: '测试需求' } });
  await page.submit();
  assert.equal(db.data.orders.length, 1);
  assert.deepEqual(env.requests.map(r => r[1]), ['createBooking','lookupBooking','createBooking']);
  assert.ok(env.requests.every(r => r[2].requestId === request));
  assert.equal(payments(), type === 'fixed' ? 1 : 0);
}

async function boundaries() {
  const { db, env, call, open } = scenario('quote', 'after');
  let p = await open();
  p.input({ detail: { value: '住户甲草稿' } });
  p.onHide(); await p.onShow();
  assert.equal(p.data.requirement, '住户甲草稿');
  await p.submit();
  const request = env.requests[0][2];
  assert.deepEqual(Object.keys(await call('merchant', 'lookupBooking', request)), ['orderId']);
  await assert.rejects(() => call('merchant', 'lookupBooking', {...request,serviceId:'other'}), {code:'E_CONFLICT'});
  await assert.rejects(() => call('merchant', 'lookupBooking', {...request,requestId:'!'}));
  const original = db.db.collection.bind(db.db);
  db.db.collection = name => {
    const c = original(name);
    if (name === 'orders') c.get = async () => { throw Error('合成读取失败'); };
    return c;
  };
  p.onUnload(); p = await open();
  assert.ok(p.data.loadError && !p.data.ready); await p.submit(); await p.load();
  assert.equal(env.requests.filter(r=>r[1]==='createBooking').length,1);
  db.db.collection = original;
  env.wx.redirectTo = o => { o.fail(); o.complete(); };
  await p.load(); assert.equal(p.data.recovery,'found'); assert.match(p.data.error,/重新打开/);
  env.wx.redirectTo = o => { o.success(); o.complete(); };
  await p.submit(); assert.equal(Object.keys(env.store).length,0);
  db.setActor('staff');
  assert.equal((await call('merchant','lookupBooking',request)).orderId,null);
  p.onHide();
  let finish;
  env.app.ensureSession = () => new Promise(resolve => {finish = resolve;});
  const refresh = p.onShow();
  assert.equal(p.data.ready,false);
  finish(db.data.users[1]); await refresh;
  assert.equal(p.data.requirement,''); assert.equal(p.orderId,''); assert.ok(!p.receipt);
}

async function addressRecovery() {
  const { db, env, open } = scenario('quote','before');
  const u = db.data.users[0];
  const p = await open();
  await p.submit();
  u.addresses = [{id:'added',buildingId:'b'}];
  await p.submit();
  assert.equal(p.data.recovery,'confirm');
  assert.equal(p.data.addresses[p.data.addressIndex].id,'');
  env.store[p.storageKey].addressId = 'removed';
  await p.load();
  assert.equal(p.data.addressIndex,-1);
  await p.submit();
  assert.equal(env.requests.filter(r=>r[1]==='createBooking').length,1);
  u.addresses = [];
  await p.load(); await p.submit();
  assert.equal(db.data.orders.length,1);
  assert.equal(env.requests.at(-1)[2].addressId,undefined);
}

async function storageFailure() {
  const { db, env, open } = scenario('quote','before');
  const p = await open();
  env.wx.setStorageSync = () => { throw Error('合成存储失败'); };
  await p.submit();
  assert.match(p.data.error,/存储失败/);
  assert.equal(env.requests.length,0);
  assert.equal(db.data.orders?.length || 0,0);
}

(async () => {
  let count = 0;
  for (const type of ['quote','fixed']) {
    for (const change of ['unchanged','hidden','off']) for (const reopen of [true,false]) {
      await recover(type,change,reopen); count++;
    }
    await missing(type); count++;
  }
  for (const verify of [boundaries,addressRecovery,storageFailure]) { await verify(); count++; }
  console.log(count + ' 组通过，含固定价与报价制、同页与重进、换人、权限、读取与导航失败。');
})().catch(error=>{console.error(error);process.exitCode=1;});
