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

  // Even an identical request is rejected before idle.buy checks its existing order.
  const sameRequest = await backend.call('idle', 'buy', { itemId: 'item', requestId: firstRequestId });
  assert.equal(sameRequest.code, 'E_BAD_STATE');
  assert.equal(backend.data.orders.length, 1);

  // The still-open page retains its on_sale snapshot and offers its old buy button.
  assert.equal(firstPage.data.item.status, 'on_sale');
  await firstPage.buy();
  const requestIds = ui.requests.filter(request => request[1] === 'buy').map(request => request[2].requestId);
  assert.equal(requestIds.length, 2);
  assert.notEqual(requestIds[0], requestIds[1]);
  assert.equal(firstPage.data.error, '商品已被购买或暂不可交易');

  firstPage.onHide();
  const secondPage = await openDetail();
  // WXML shows "担保交易进行中" and hides buy for a reserved item, but has no original-order link.
  assert.equal(secondPage.data.item.status, 'reserved');
  const template = fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/idle/detail/detail.wxml'), 'utf8');
  assert.match(template, /item\.status === 'on_sale'[^>]*bindtap="buy"/);
  assert.match(template, /item\.status === 'reserved' \? '担保交易进行中'/);
  assert.doesNotMatch(template, /orders\/detail/);
  assert.equal(backend.data.orders.length, 1);

  console.log(JSON.stringify({ scope: 'actual P42 page and idle.buy; synthetic database and lost response',
    requestIds, sameRequest: { code: sameRequest.code, message: sameRequest.message },
    samePageError: firstPage.data.error, reenteredItemStatus: secondPage.data.item.status,
    orderIds: backend.data.orders.map(order => order._id),
    itemStatus: backend.data.idleItems[0].status }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
