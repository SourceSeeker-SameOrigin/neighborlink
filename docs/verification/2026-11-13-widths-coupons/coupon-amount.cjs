const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { couponDiscount } = require('../../../cloudfunctions/_shared/couponData');
(async () => {
  const items = [1, 20, 99].map(value => ({
    _id: 'sample-' + value, value, kind: 'percent_off', status: 'active',
    services: ['all'], communityIds: 'all', threshold: 0, maxOff: 1000
  }));
  const labels = {};
  for (const name of ['mine', 'center']) {
    const page = runtime(async () => ({ list: items.map(item => ({ ...item, status: 'unused', validTo: 1800000000000 })) })).instance('miniprogram/coupons/' + name + '/' + name + '.js');
    await page.load();
    assert.equal(page.data.error, '');
    labels[name] = page.data.list.map(item => item.discountText);
    assert.deepEqual(Array.from(labels[name]), ['减免1%', '减免20%', '减免99%']);
  }
  const args = { serviceCode: 'trash', communityId: 'sample', listPrice: 1000 };
  const rows = items.map((item, i) => ({ value: item.value, mine: labels.mine[i], center: labels.center[i], discountFen: couponDiscount(item, args) }));
  assert.deepEqual(rows.map(row => row.discountFen), [10, 200, 990]);
  assert.equal(couponDiscount({ ...items[1], threshold: 1001 }, args), 0);
  assert.equal(couponDiscount({ ...items[1], maxOff: 150 }, args), 150);
  assert.equal(couponDiscount(items[1], { ...args, listPrice: 999 }), 199);
  console.log(JSON.stringify({ listPriceFen: args.listPrice, rows, belowThresholdFen: 0, cappedFen: 150, floorFor999Fen: 199 }, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
