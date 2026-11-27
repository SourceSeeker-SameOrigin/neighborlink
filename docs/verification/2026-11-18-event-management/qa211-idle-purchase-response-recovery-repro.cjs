// Actual P42 page and idle.buy with a synthetic database; no CloudBase requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const backend = fixture({ global: true, local: true, allowWrites: true, mockPay: true, records: {
  buildings: [{ _id: 'building', communityId: 'c', name: '一号楼', units: ['1单元'] }],
  idleItems: [{ _id: 'item', communityId: 'c', scope: 'community', tradeMode: 'escrow',
    sellerOpenid: 'seller', sellerUserId: 'seller-user', status: 'on_sale', title: '合成闲置',
    desc: '仅供隔离测试', category: 'other', condition: 'used', price: 500, images: [], createdAt: new Date() }]
} });
Object.assign(backend.data.users[0], { buildingId: 'building', unit: '1单元', room: '101', phone: '13800000000' });
backend.data.config[0].features.idleEscrow = true;
backend.data.communities[0].features.idleEscrow = true;
backend.data.config[0].payMode = 'mock';

let purchaseCalls = 0;
const ui = runtime(async (name, action, input) => {
  if (name === 'idle' && action === 'detail') return { item: { ...backend.data.idleItems[0] } };
  if (name === 'idle' && action === 'lookupPurchase') {
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  }
  if (name === 'idle' && action === 'buy') {
    purchaseCalls++;
    const result = await backend.call(name, action, input);
    // The first purchase commits on the server, but its response never reaches the page.
    if (purchaseCalls === 1) throw Error('合成响应丢失');
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  }
  throw Error('Unexpected API call: ' + name + '.' + action);
});
ui.app.globalData.user = backend.data.users[0];
ui.wx.showModal = ({ success }) => success({ confirm: true });
ui.wx.setNavigationBarTitle = () => {};

async function openDetail() {
  const page = ui.instance('miniprogram/idle/detail/detail.js');
  page.onLoad({ id: 'item' });
  await page.onShow();
  assert.equal(page.data.item._id, 'item');
  return page;
}

(async () => {
  const firstPage = await openDetail();
  await firstPage.buy();
  const firstRequestId = ui.requests.find(request => request[1] === 'buy')[2].requestId;
  assert.equal(backend.data.orders.length, 1);
  assert.equal(backend.data.idleItems[0].status, 'reserved');

  // An identical request finds the original order before checking the reserved item.
  const sameRequest = await backend.call('idle', 'buy', { itemId: 'item', requestId: firstRequestId });
  assert.equal(sameRequest.ok, true);
  assert.equal(sameRequest.data.recovered, true);
  assert.equal(sameRequest.data.orderId, backend.data.orders[0]._id);
  assert.equal(backend.data.orders.length, 1);
  backend.data.idleItems[0].price = 600;
  backend.data.config[0].features.idleEscrow = false;
  backend.data.communities[0].features.idleEscrow = false;
  const afterPriceAndFeatureChange = await backend.call('idle', 'buy', { itemId: 'item', requestId: firstRequestId });
  assert.equal(afterPriceAndFeatureChange.ok, true);
  assert.equal(afterPriceAndFeatureChange.data.orderId, backend.data.orders[0]._id);
  const conflictingItem = await backend.call('idle', 'buy', { itemId: 'different-item', requestId: firstRequestId });
  assert.equal(conflictingItem.code, 'E_CONFLICT');
  backend.data.config[0].features.idleEscrow = true;
  backend.data.communities[0].features.idleEscrow = true;

  // The still-open page recovers the original order and never creates a new request.
  assert.equal(firstPage.data.item.status, 'on_sale');
  assert.equal(firstPage.data.recovery, 'found');
  await firstPage.buy();
  const requestIds = ui.requests.filter(request => request[1] === 'buy').map(request => request[2].requestId);
  assert.equal(requestIds.length, 1);
  assert.equal(firstPage.data.error, '');

  firstPage.onHide();
  const secondPage = await openDetail();
  // A fresh page uses the per-user receipt to find the same order.
  assert.equal(secondPage.data.item.status, 'reserved');
  assert.equal(secondPage.data.recovery, 'found');
  assert.equal(secondPage.orderId, backend.data.orders[0]._id);
  ui.app.globalData.user = { _id: 'other-user', communityId: 'c', roles: ['resident'] };
  const otherPage = await openDetail();
  assert.equal(otherPage.data.recovery, '');
  assert.equal(otherPage.orderId, undefined);
  const template = fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/idle/detail/detail.wxml'), 'utf8');
  assert.match(template, /bindtap="buy"[^>]*>立即购买/);
  assert.match(template, /item\.status === 'reserved' \? '担保交易进行中'/);
  assert.match(template, /前往原订单/);
  assert.equal(backend.data.orders.length, 1);

  console.log(JSON.stringify({ scope: 'actual P42 page and idle.buy; synthetic database and lost response',
    requestIds, sameRequest: { recovered: sameRequest.data.recovered, orderId: sameRequest.data.orderId },
    samePageError: firstPage.data.error, reenteredItemStatus: secondPage.data.item.status,
    orderIds: backend.data.orders.map(order => order._id),
    itemStatus: backend.data.idleItems[0].status }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
