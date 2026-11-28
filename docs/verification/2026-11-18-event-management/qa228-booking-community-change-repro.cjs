// Actual P60 page with synthetic users and isolated merchant data; no CloudBase writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { setup } = require('../2026-11-16-escort/resident-shops.cjs');

async function fixture(wrapCall) {
  const { db, call } = setup(1, 'quote');
  const env = runtime(wrapCall ? wrapCall(call) : call);
  const user = db.data.users[0];
  env.app.globalData.user = user;
  const page = env.instance('miniprogram/shops/booking/booking.js');
  page.onLoad({ serviceId: 's000' });
  await page.onShow();
  assert.equal(page.data.ready, true);
  return { db, env, page, user };
}

async function main() {
  const stale = await fixture();
  stale.page.input({ detail: { value: '原小区的预约需求' } });
  stale.env.app.globalData.user = { ...stale.user, communityId: 'other-community', addresses: [] };
  await stale.page.submit();
  assert.equal(stale.env.requests.filter(request => request[1] === 'createBooking').length, 0);
  assert.equal(stale.page.data.requirement, '');
  assert.equal(stale.page.communityId, 'other-community');

  const oldOrder = await fixture();
  oldOrder.page.orderId = 'old-order';
  oldOrder.page.setData({ recovery: 'found' });
  oldOrder.env.app.globalData.user = { ...oldOrder.user, communityId: 'other-community' };
  oldOrder.page.openOrder();
  assert.equal(oldOrder.env.navigation.length, 0);

  let finishCreate;
  const delayed = await fixture(call => (name, action, data, options) => action === 'createBooking'
    ? new Promise(resolve => { finishCreate = resolve; }) : call(name, action, data, options));
  delayed.page.input({ detail: { value: '正在提交的预约' } });
  const submit = delayed.page.submit();
  assert.equal(typeof finishCreate, 'function');
  delayed.env.app.globalData.user = { ...delayed.user, communityId: 'other-community', addresses: [] };
  finishCreate({ orderId: 'old-order', status: 'pending_quote' });
  await submit;
  assert.equal(delayed.env.navigation.length, 0);
  assert.equal(delayed.page.orderId || '', '');

  const scoped = await fixture(call => (name, action, data, options) => action === 'createBooking'
    ? Promise.reject(new Error('synthetic lost response')) : call(name, action, data, options));
  await scoped.page.submit();
  const originalKey = scoped.page.storageKey;
  const originalRequestId = scoped.env.store[originalKey].requestId;
  scoped.page.onHide();
  scoped.env.app.globalData.user = { ...scoped.user, communityId: 'other-community', addresses: [] };
  const otherCommunity = scoped.env.instance('miniprogram/shops/booking/booking.js');
  otherCommunity.onLoad({ serviceId: 's000' });
  await otherCommunity.onShow();
  assert.notEqual(otherCommunity.storageKey, originalKey);
  assert.equal(otherCommunity.receipt, null);
  assert.equal(scoped.env.store[originalKey].requestId, originalRequestId);

  const legacy = await fixture();
  const oldKey = 'merchant-booking:' + encodeURIComponent(legacy.user._id) + ':s000';
  legacy.env.store[oldKey] = { requestId: 'legacy-request', addressId: '', hadRequirement: false };
  await legacy.page.load();
  assert.equal(legacy.page.data.recovery, 'confirm');
  assert.equal(legacy.page.data.legacyReceipt, true);
  legacy.page.startNewBooking();
  assert.equal(legacy.page.data.legacyReceipt, false);
  assert.notEqual(legacy.page.storageKey, oldKey);
  assert.equal(legacy.env.store[oldKey].requestId, 'legacy-request');
  await legacy.page.load();
  assert.equal(legacy.page.receipt, null);
  assert.equal(legacy.page.data.recovery, '');
  assert.equal(legacy.env.store[oldKey].requestId, 'legacy-request');
  legacy.page.onHide();
  legacy.env.app.globalData.user = { ...legacy.user, communityId: 'other-community', addresses: [] };
  const oldReceiptInOtherCommunity = legacy.env.instance('miniprogram/shops/booking/booking.js');
  oldReceiptInOtherCommunity.onLoad({ serviceId: 's000' });
  await oldReceiptInOtherCommunity.onShow();
  assert.equal(oldReceiptInOtherCommunity.data.legacyReceipt, true);
  assert.equal(oldReceiptInOtherCommunity.data.recovery, 'confirm');

  const normal = await fixture();
  normal.page.input({ detail: { value: '当前小区预约需求' } });
  await normal.page.submit();
  assert.equal(normal.env.requests.filter(request => request[1] === 'createBooking').length, 1);
  console.log(JSON.stringify({ scope: 'actual P60 page, synthetic community switch; no CloudBase call',
    staleCreateCalls: 0, staleOrderNavigations: 0, lateOrderNavigations: 0,
    scopedReceiptsSeparated: true, legacyReceiptExplicit: true, normalCreateCalls: 1 }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
