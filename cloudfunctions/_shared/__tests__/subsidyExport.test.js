const { HEADER, subsidyCsv } = require('../subsidyExport');

test('政府补贴导出仅包含业务字段，不包含地址、电话、姓名、备注或用户标识', () => {
  const order = { orderNo: 'JL123', communityId: 'c1', serviceCode: 'meal', status: 'completed',
    createdAt: new Date('2026-11-01T00:00:00Z'), completedAt: new Date('2026-11-01T02:00:00Z'),
    pricing: { payAmount: 300, goodsActual: 2500 }, refunds: [{ status: 'success', amount: 500 }],
    address: { room: '302', contactPhone: '13900000000' }, userPhone: '13900000000', note: '敏感备注', userOpenid: 'secret' };
  const csv = subsidyCsv([order]);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain(HEADER.map(value => '"' + value + '"').join(','));
  expect(csv).toContain('JL123');
  for (const privateValue of ['302', '13900000000', '敏感备注', 'secret']) expect(csv).not.toContain(privateValue);
});

test.each([
  ['待付款', { status: 'pending_pay' }, '0'],
  ['未付款关闭', { status: 'closed', timeline: [{ status: 'pending_pay' }, { status: 'closed' }] }, '0'],
  ['有付款时间', { payment: { paidAt: new Date() } }, '500'],
  ['旧成功流水', { payment: { transactionId: 'sample' } }, '500'],
  ['退款后保留原服务费', { status: 'refunded', timeline: [{ status: 'paid' }] }, '500'],
  ['付款服务费为零', { payment: { paidAt: new Date() }, pricing: { payAmount: 0 } }, '0'],
  ['历史关闭无支付资料', { status: 'closed' }, ''],
  ['历史完成无支付资料', { status: 'completed' }, ''],
  ['已付款但历史定价缺失', { payment: { paidAt: new Date() }, pricing: null }, '']
])('%s：导出实付与退款各自独立', (_, patch, expected) => {
  const order = { createdAt: new Date(), pricing: { payAmount: 500, goodsActual: 150 },
    refunds: [{ status: 'success', amount: 30 }, { status: 'processing', amount: 25 }], ...patch };
  const row = subsidyCsv([order]).split('\r\n')[1].split(',');
  expect(row[6]).toBe('"' + expected + '"');
  expect(row[8]).toBe('"30"');
});
