const { setup, input } = require('../../../docs/verification/2026-11-15-coupon-refunds/order-coupon-paging.cjs');

async function placed(couponId) {
  const db = setup(100, true);
  const quote = await db.call('order', 'quote', { ...input, metadata: true });
  const request = { ...input, couponId, slot: quote.data.slots[0], requestId: 'coupon-replay-78' };
  const create = changes => db.call('order', 'create', { ...request, ...changes });
  const first = await create();
  if (!first.ok) throw Error(first.code + ": " + first.message);
  return { db, request, create, id: first.data.orderId };
}

describe.each(['current', 'legacy'])('%s order', format => {
  test.each([undefined, 'z', ''])('replays original request selecting %s without writes', async selected => {
    const { db, create, id } = await placed(selected);
    if (format === 'legacy') delete db.data.orders[0].intentHash;
    const before = db.writes.length;
    expect((await create()).data.orderId).toBe(id);
    expect(db.data.orders).toHaveLength(1);
    expect(db.data.coupons.filter(row => row.status === 'locked')).toHaveLength(selected === '' ? 0 : 1);
    expect(db.writes).toHaveLength(before);
  });
  test('rejects changed details, address, time, note, coupon, points and owner', async () => {
    const { db, create } = await placed('z');
    if (format === 'legacy') delete db.data.orders[0].intentHash;
    const before = db.writes.length;
    for (const change of [{ detail: { bags: 2, sorted: true } }, { addressId: 'other' },
      { slot: null }, { note: '改动' }, {couponId: 'small-0'}, {pointsToUse: 1}]) {
      expect(await create(change)).toMatchObject({ok:false, code:'E_CONFLICT'});
    }
    db.data.orders[0].userOpenid = 'other';
    expect(await create()).toMatchObject({ok:false, code:'E_CONFLICT'});
    expect(db.writes).toHaveLength(before);
  });
});

test('new orders distinguish automatic, manual and opt out; object key order does not change intent', async () => {
  const { create, id } = await placed(undefined);
  expect((await create({couponId: null, detail:{sorted:true,bags:1}})).data.orderId).toBe(id);
  expect(await create({couponId:'z'})).toMatchObject({ok:false,code:'E_CONFLICT'});
  expect(await create({couponId:''})).toMatchObject({ok:false,code:'E_CONFLICT'});
});

test('a concurrent winner is recovered even if its coupon lock makes the second quote fail', async () => {
  const {db, create, id} = await placed('z');
  const original = db.data.orders.pop();
  const collection = db.db.collection.bind(db.db);
  let orderReads = 0;
  db.db.collection = table => {
    const q = collection(table);
    const get = q.get;
    q.get = async () => {
      const rows = await get();
      if (table === 'orders' && ++orderReads === 1) db.data.orders.push(original);
      return rows;
    };
    return q;
  };
  const before = db.writes.length;
  expect((await create()).data.orderId).toBe(id);
  expect(orderReads).toBeGreaterThanOrEqual(2);
  expect(db.writes).toHaveLength(before);
});

test('closed and already paid orders keep their status and payment records on replay', async () => {
  const {db, create, id} = await placed('z');
  const before = db.writes.length;
  db.data.orders[0].status='closed';
  expect((await create()).data).toEqual({orderId:id, paymentError:'E_BAD_STATE'});
  db.data.orders[0].status='paid';
  db.data.orders[0].payment.paidAt=new Date();
  expect((await create()).data).toEqual({orderId:id, free:true});
  expect(db.writes).toHaveLength(before);
});
