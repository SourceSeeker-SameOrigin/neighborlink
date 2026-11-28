const { createOrderContext } = require('../orderContext');
const { createServer } = require('../server');
const { setup, input } = require('../../../docs/verification/2026-11-15-coupon-refunds/order-coupon-paging.cjs');

test('分批读取 21 个模板，等额自动取较早到期的券，首单仍择优', async () => {
  const db = setup(0, true);
  const template = db.data.couponTemplates[0];
  const coupon = db.data.coupons[0];
  db.data.couponTemplates = Array.from({ length: 21 }, (_, i) => ({ ...template, _id: 'tpl-' + i }));
  db.data.coupons = db.data.couponTemplates.map((item, i) => ({
    ...coupon, _id: 'owned-' + i, templateId: item._id, validTo: new Date(+coupon.validTo - i * 1000)
  }));
  const build = createOrderContext(createServer(db.cloud));
  const resident = db.data.users[0];
  const quoted = await build(input, resident, { metadata: true });
  expect(quoted.couponOptions).toHaveLength(21);
  expect(quoted.pricing.couponId).toBe('owned-20');
  const first = await build(input, { ...resident, firstPaidAt: null }, { metadata: true });
  expect(first.pricing).toMatchObject({ couponId: null, payAmount: 100 });
});
