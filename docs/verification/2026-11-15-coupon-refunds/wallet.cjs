// Connect the state written by actual mock order handlers to coupon.mine, then render the resident template.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
  execFileSync
} = require('node:child_process');
const {
  harness
} = require('../2026-11-12-mock-orders/idempotency.cjs');
const {
  fixture
} = require('../2026-11-09-remediation/cloud-fixture.cjs');
const {
  runtime
} = require('../2026-11-09-remediation/page-fixture.cjs');
const wxml = 'coupons/mine/mine.wxml';
const wcc = '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec/wcc';
const ctx = {
  window: {
    __webview_engine_version__: 0.02
  },
  console
};
vm.runInNewContext(execFileSync(wcc, [wxml], {
  cwd: 'miniprogram',
  encoding: 'utf8'
}), ctx);
const render = ctx.$gwx(wxml);
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
async function main() {
  const h = harness(),
    now = Date.now();
  Object.assign(h.context.pricing, {
    couponId: 'wallet-sample',
    couponDiscount: 100,
    discount: 100,
    payAmount: 400
  });
  h.data.couponTemplates = [{
    _id: 'template',
    name: '合成抵用券',
    kind: 'amount_off',
    value: 100,
    maxOff: 100,
    threshold: 0,
    communityIds: 'all',
    services: ['all'],
    status: 'active'
  }];
  h.data.coupons.push({
    _id: 'wallet-sample',
    openid: h.user.openid,
    templateId: 'template',
    orderId: null,
    status: 'unused',
    validFrom: new Date(now - 3600000),
    validTo: new Date(now + 86400000)
  });
  const db = fixture({
    local: true
  });
  db.setActor(h.user.openid);
  db.data.users[0].openid = h.user.openid;
  const env = runtime(async (n, a, d) => {
    const r = await db.call(n, a, d);
    assert.ok(r.ok, r.message);
    return r.data;
  });
  const page = env.instance('miniprogram/coupons/mine/mine.js');
  async function verify(label, status) {
    db.data.coupons = structuredClone(h.data.coupons);
    db.data.couponTemplates = structuredClone(h.data.couponTemplates);
    await page.onShow();
    assert.equal(page.data.error, '');
    assert.equal(page.data.list.length, 1);
    const ui = text(render(page.data));
    assert.ok(ui.includes('合成抵用券'));
    assert.ok(ui.includes('1.00 元'));
    for (const name of ['未使用', '已锁定', '已使用', '已过期']) assert.equal(ui.includes(name), name === status);
    console.log('PASS', label, status);
  }
  await verify('领券后', '未使用');
  const order = await h.create();
  await verify('待付款', '已锁定');
  await h.actions.mockPay({
    orderId: order._id
  }, h.auth);
  await verify('付款后', '已使用');
  await h.pay.requestRefund(h.current(), 100, '部分服务费退款', {
    key: 'partial'
  });
  await verify('部分退款', '已使用');
  await h.pay.requestRefund(h.current(), 300, '剩余服务费退款', {
    key: 'rest'
  });
  await verify('全额退款', '未使用');
  h.data.coupons[0].validTo = new Date(now - 1);
  await verify('退回后到期', '已过期');
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
