// Exercise both real order entry points with an isolated database and mock payment configuration.
const assert = require('node:assert/strict');
const seed = require('../../../database/seed/communities.json');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const day = 86400000;
const input = { serviceCode: 'trash', communityId: 'c', detail: { bags: 1, sorted: true } };

function setup(count, allValid) {
  const db = fixture({ local: true, allowWrites: true, mockPay: true });
  const now = Date.now();
  const user = db.data.users[0];
  Object.assign(user, { buildingId: 'b', unit: '一单元', room: '测试', phone: '13800000000', firstPaidAt: new Date(now-day) });
  Object.assign(db.data.communities[0], { prices: seed.prices, rates: seed.rates, dutyWindows: seed.dutyWindows });
  db.data.config[0].payMode = 'mock';
  db.data.buildings = [{ _id: 'b', communityId: 'c', name: '合成楼栋', units: ['一单元'] }];
  const template = { _id: 'best', status: 'active', name: '合成券', kind: 'amount_off', value: 200,
    maxOff: 200, threshold: 0, communityIds: 'all', services: ['trash'] };
  db.data.couponTemplates = [template, { ...template, _id: 'small', value: 1 }];
  const coupon = { _id: 'z', openid: user.openid, templateId: 'best', status: 'unused',
    validFrom: new Date(now-day), validTo: new Date(now+2*day) };
  db.data.coupons = Array.from({ length: count }, (_, i) => ({ ...coupon, _id: 'small-'+i,
    templateId: 'small', validTo: new Date(now + (allValid ? day : -1000)) }));
  db.data.coupons.push(coupon, { ...coupon, _id: 'foreign', openid: 'other' });
  return db;
}

async function run() {
  let passed = 0;
  for (const [count, allValid, couponId, cents, selected] of [
    [0,false,undefined,300,'z'], [99,false,undefined,300,'z'], [100,false,undefined,300,'z'],
    [100,false,'z',300,'z'], [100,true,undefined,300,'z'], [100,true,'z',300,'z'],
    [100,true,'small-0',499,'small-0'], [100,true,'',500,null]
  ]) {
    const db = setup(count, allValid);
    const props = { ...input, couponId };
    const quote = await db.call('order', 'quote', { ...props, metadata:true });
    assert.equal(quote.ok, true, quote.message);
    assert.equal(quote.data.couponOptions.length, allValid ? count+1 : 1);
    assert.equal(quote.data.pricing.payAmount, cents);
    const created = await db.call('order', 'create', { ...props, slot: quote.data.slots[0],
      requestId: 'test_request', payAmount: 99 });
    assert.equal(created.ok, true, created.message);
    const [order] = db.data.orders;
    assert.equal(created.data.orderId, order._id);
    assert.equal(order.pricing.payAmount, cents);
    assert.equal(order.pricing.couponId, selected);
    assert.deepEqual(db.data.coupons.filter(c => c.status === 'locked').map(c => [c._id, c.orderId]),
      selected ? [[selected, order._id]] : []);
    passed++;
  }
  for (const boundary of ['foreign','expired','future','paused','threshold','service','community','missing']) {
    const db = setup(100, true);
    const target = db.data.coupons.find(c => c._id === 'z');
    const tpl = db.data.couponTemplates[0];
    if (boundary === 'expired') target.validTo = new Date(0);
    if (boundary === 'future') target.validFrom = new Date(Date.now()+day);
    if (boundary === 'paused') tpl.status = 'paused';
    if (boundary === 'threshold') tpl.threshold = 600;
    if (boundary === 'service') tpl.services = ['express'];
    if (boundary === 'community') tpl.communityIds = ['other'];
    const baseline = await db.call('order','quote',{...input,metadata:true});
    const props = { ...input, couponId: ['foreign','missing'].includes(boundary) ? boundary : 'z', slot: baseline.data.slots[0] };
    for (const action of ['quote','create']) {
      const result = await db.call('order', action, {...props, requestId:'test_invalid'});
      assert.equal(result.ok, false, boundary + '/' + action);
      assert.ok(['E_CONFLICT','E_INVALID_PARAM'].includes(result.code), result.message);
    }
    assert.equal(db.writes.length,0);
    passed++;
  }
  console.log('QA77 quote/create + coupon locking and rejection, passed:', passed);
}
module.exports = { setup, input };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
