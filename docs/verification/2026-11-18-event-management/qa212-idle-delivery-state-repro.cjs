// Actual P46 page, idle cloud entry and shared state machine; synthetic records only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { canTransition } = require('../../../cloudfunctions/_shared/stateMachine');

const backend = fixture({ global: true, local: true, allowWrites: true, mockPay: true, records: {
  buildings: [{ _id: 'building', communityId: 'c', name: '一号楼', units: ['1单元'] }],
  idleItems: [{ _id: 'item', communityId: 'c', scope: 'community', tradeMode: 'escrow',
    sellerOpenid: 'seller', sellerUserId: 'seller-user', status: 'on_sale', title: '合成闲置',
    desc: '仅供隔离测试', category: 'other', condition: 'used', price: 500,
    images: [], createdAt: new Date() }]
} });
Object.assign(backend.data.users[0], { buildingId: 'building', unit: '1单元', room: '101', phone: '13800000000' });
const seller = { _id: 'seller-user', openid: 'seller', roles: ['resident'], communityId: 'c',
  buildingId: 'building', unit: '1单元', room: '102', phone: '13800000001' };
backend.data.users.push(seller);
backend.data.config[0].features.idleEscrow = true;
backend.data.communities[0].features.idleEscrow = true;
backend.data.config[0].payMode = 'mock';

(async () => {
  const purchase = await backend.call('idle', 'buy', { itemId: 'item', requestId: 'idle_request_001' });
  assert.equal(purchase.ok, true);
  const orderId = purchase.data.orderId;
  assert.equal((await backend.call('order', 'mockPay', { orderId })).ok, true);
  backend.setActor('seller');
  const accepted = await backend.call('idle', 'acceptSale', { orderId });
  assert.equal(accepted.ok, true);
  assert.equal(backend.data.orders[0].status, 'accepted');

  // The fixture stores command.push as a token; normalize only that synthetic timeline field.
  backend.data.orders[0].timeline = [
    { status: 'pending_pay' }, { status: 'paid' }, { status: 'accepted' }
  ];
  assert.equal(canTransition('accepted', 'delivered'), false);
  assert.equal(canTransition('accepted', 'in_service'), true);

  const ui = runtime(async (name, action, input) => {
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = seller;
  const page = ui.instance('miniprogram/idle/sale/sale.js');
  page.onLoad({ id: orderId });
  await page.onShow();
  assert.equal(page.data.order.status, 'accepted');
  const template = fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/idle/sale/sale.wxml'), 'utf8');
  assert.match(template, /order\.status === 'accepted'[^>]*>[\s\S]*?bindtap="deliver"/);
  page.setData({ photos: ['cloud://fixture/idle-delivery/' + orderId + '/photo.jpg'], note: '合成交付' });
  await page.deliver();
  assert.equal(page.data.error, '订单状态已变化，无法执行此操作');
  assert.equal(backend.data.orders[0].status, 'accepted');
  assert.equal(backend.data.orders[0].idleDelivery, undefined);
  assert.equal(backend.data.orders.length, 1);

  console.log(JSON.stringify({ scope: 'actual P46 page, idle.buy/mockPay/acceptSale/deliverSale and state machine',
    orderId, displayedStatus: page.data.order.status, error: page.data.error,
    storedStatus: backend.data.orders[0].status, deliveryStored: Boolean(backend.data.orders[0].idleDelivery),
    acceptedToDeliveredAllowed: canTransition('accepted', 'delivered') }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
