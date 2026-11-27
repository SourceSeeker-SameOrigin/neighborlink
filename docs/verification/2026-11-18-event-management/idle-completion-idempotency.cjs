// Downstream completion of synthetic delivered idle orders; no CloudBase writes.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const backend = fixture({ global: true, local: true, allowWrites: true, mockPay: true, records: {
  buildings: [{ _id: 'building', communityId: 'c', name: '一号楼', units: ['1单元'] }],
  idleItems: [{ _id: 'item', communityId: 'c', scope: 'community', tradeMode: 'escrow',
    sellerOpenid: 'seller', sellerUserId: 'seller-user', status: 'on_sale', title: '合成闲置',
    desc: '仅供隔离测试', category: 'other', condition: 'used', price: 500,
    images: [], createdAt: new Date() }]
} });
Object.assign(backend.data.users[0], { buildingId: 'building', unit: '1单元', room: '101', phone: '13800000000' });
backend.data.config[0].features.idleEscrow = true;
backend.data.communities[0].features.idleEscrow = true;
backend.data.config[0].payMode = 'mock';

(async () => {
  const purchase = await backend.call('idle', 'buy', { itemId: 'item', requestId: 'idle_request_002' });
  assert.equal(purchase.ok, true);
  const orderId = purchase.data.orderId;
  assert.equal((await backend.call('order', 'mockPay', { orderId })).ok, true);

  // QA212 blocks the actual seller delivery path. Seed only this downstream state.
  const stored = backend.data.orders[0];
  const now = new Date();
  stored.status = 'delivered';
  stored.deliveredAt = now;
  stored.idleDelivery = { photos: ['cloud://fixture/idle-delivery/' + orderId + '/photo.jpg'], note: '合成交付', at: now };
  stored.timeline = ['pending_pay', 'paid', 'accepted', 'delivered'].map(status => ({ status, at: now }));

  const ui = runtime(async (name, action, input) => {
    const response = await backend.call(name, action, input);
    if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
    return response.data;
  });
  ui.app.globalData.user = backend.data.users[0];
  ui.wx.showModal = ({ success }) => success({ confirm: true });
  const page = ui.instance('miniprogram/pages/orders/detail.js');
  page.onLoad({ id: orderId });
  await page.onShow();
  assert.equal(page.data.order.status, 'delivered');
  assert.equal(page.data.order.canConfirm, true);
  await page.serviceAction({ currentTarget: { dataset: { action: 'confirm' } } });
  assert.equal(page.data.order.status, 'completed');
  assert.equal(backend.data.orders[0].status, 'completed');
  assert.equal(backend.data.idleItems[0].status, 'sold');
  assert.equal(backend.data.ledger.length, 1);
  assert.equal(backend.data.ledger[0].refType, 'idle_sale');
  assert.equal(backend.data.ledger[0].amounts.seller, 500);

  const replay = await backend.call('order', 'confirm', { orderId });
  assert.equal(replay.ok, true);
  assert.equal(backend.data.ledger.length, 1);

  // A separate delivered order is old enough for the actual timer entry point.
  backend.data.idleItems.push({ ...backend.data.idleItems[0], _id: 'item-auto',
    status: 'on_sale', purchaseOrderId: null, createdAt: new Date() });
  const autoPurchase = await backend.call('idle', 'buy', { itemId: 'item-auto', requestId: 'idle_request_003' });
  assert.equal(autoPurchase.ok, true);
  const autoOrderId = autoPurchase.data.orderId;
  assert.equal((await backend.call('order', 'mockPay', { orderId: autoOrderId })).ok, true);
  const autoOrder = backend.data.orders.find(order => order._id === autoOrderId);
  const deliveredAt = new Date(Date.now() - 73 * 3600000);
  autoOrder.status = 'delivered';
  autoOrder.deliveredAt = deliveredAt;
  autoOrder.idleDelivery = { photos: ['cloud://fixture/idle-delivery/' + autoOrderId + '/photo.jpg'],
    note: '合成交付', at: deliveredAt };
  autoOrder.timeline = ['pending_pay', 'paid', 'accepted', 'delivered'].map(status => ({ status, at: deliveredAt }));
  Object.assign(backend.data.config[0], { payTimeoutMinutes: 15, acceptAlertMinutes: 10, autoConfirmHours: 72 });
  backend.setActor('');
  const trigger = { Type: 'Timer', TriggerName: 'every5min' };
  const firstTick = await backend.call('timer', '', trigger);
  assert.equal(firstTick.ok, true);
  assert.equal(firstTick.data.idleAutoConfirm.done, 1);
  assert.equal(firstTick.data.idleAutoConfirm.failed, 0);
  assert.equal(autoOrder.status, 'completed');
  assert.equal(backend.data.idleItems.find(item => item._id === 'item-auto').status, 'sold');
  assert.equal(backend.data.ledger.length, 2);
  const secondTick = await backend.call('timer', '', trigger);
  assert.equal(secondTick.ok, true);
  assert.equal(secondTick.data.idleAutoConfirm.done, 0);
  assert.equal(secondTick.data.idleAutoConfirm.failed, 0);
  assert.equal(backend.data.ledger.length, 2);
  assert.equal(new Set(backend.data.ledger.map(entry => entry.refId)).size, 2);

  console.log(JSON.stringify({ scope: 'actual P08, order.confirm and timer with seeded delivered states',
    buyerConfirmed: { status: page.data.order.status, sellerAmountFen: backend.data.ledger[0].amounts.seller,
      ledgerCountAfterReplay: 1 },
    timer: { first: firstTick.data.idleAutoConfirm, second: secondTick.data.idleAutoConfirm,
      status: autoOrder.status, itemStatus: backend.data.idleItems.find(item => item._id === 'item-auto').status,
      totalLedgerCountAfterReplay: backend.data.ledger.length },
    realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
