const { quote, cleanVisitReport, cleanEscort, escortSlot } = require('../services/elder');
const { quote: priceOrder } = require('../pricing');
const { canTake } = require('../providerData');

const community = { canteens: [{ code: 'c1', name: '邻里食堂', merchantId: 'm1' }],
  dutyWindows: [{ start: '08:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
  prices: { meal: { goodsCapMax: 5000 } } };
test('送餐绑定本小区合作食堂、餐费上限和默认 300 分服务费', () => {
  const result = quote('meal', { canteenCode: 'c1', items: '午餐一份', goodsCap: 2500 }, community.prices, community);
  expect(result).toMatchObject({ listPrice: 300, payAmount: 300, goodsCap: 2500, normalized: { merchantId: 'm1' } });
  expect(() => quote('meal', { canteenCode: 'unknown', items: '午餐', goodsCap: 1 }, community.prices, community)).toThrow('合作食堂');
  expect(() => quote('meal', { canteenCode: 'c1', items: '午餐', goodsCap: 5001 }, community.prices, community)).toThrow('餐费预付');
});
test('陪诊 1 到 4 档按 16800 分计价，并限制在完整值班窗口内', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-07T10:00:00+08:00'));
  try {
    const result = quote('escort', { hospital: '市医院', department: '内科', date: '2026-11-20', start: '09:00', blocks: 2, pickup: false }, {}, community);
    expect(result).toMatchObject({ listPrice: 33600, payAmount: 33600 });
    expect(() => quote('escort', { hospital: '市医院', department: '内科', date: '2026-11-20', start: '09:00', blocks: 5, pickup: false }, {}, community)).toThrow('时长档数');
    expect(() => quote('escort', { hospital: '市医院', department: '内科', date: '2026-02-30', start: '09:00', blocks: 1, pickup: false }, {}, community)).toThrow('日期无效');
    expect(() => quote('escort', { hospital: '市医院', department: '内科', date: '2026-11-20', start: '12:00', blocks: 2, pickup: false }, {}, community)).toThrow('值班时段');
    expect(() => cleanEscort({ hospital: '医院', department: '内科', date: '2026-12-08', start: '09:00', blocks: 1, pickup: false }, community.dutyWindows,
      new Date('2026-11-07T10:00:00+08:00'))).toThrow('未来 30 天');
    expect(escortSlot({ hospital: '医院', department: '内科', date: '2026-11-20', start: '09:00', blocks: 2, pickup: false }, community.dutyWindows,
      new Date('2026-11-07T10:00:00+08:00'))).toEqual({ date: '2026-11-20', start: '08:00', end: '13:00' });
  } finally { jest.useRealTimers(); }
});
test('送餐走首单服务费优惠且餐费预付不参与折扣', () => {
  const result = priceOrder({ serviceCode: 'meal', detail: { canteenCode: 'c1', items: '午餐', goodsCap: 2500 },
    prices: { firstOrderPrice: 100, meal: { serviceFee: 300, goodsCapMax: 5000 } }, user: { firstPaidAt: null }, community });
  expect(result).toMatchObject({ listPrice: 300, discount: 200, payAmount: 100, goodsCap: 2500 });
});
test('陪诊要求服务员具备 escort 证书，接单接口也做资质校验', () => {
  const order = { kind: 'service', communityId: 'c1', status: 'paid', minLevel: 2, requiredCert: 'escort' };
  const provider = { _id: 'p1', communityId: 'c1', status: 'approved', level: 2, insuranceUntil: new Date('2027-01-01'), onDuty: true, certs: [] };
  expect(() => canTake(order, provider, new Date('2026-12-01'))).toThrow('缺少该服务要求的资质');
  expect(() => canTake(order, { ...provider, certs: ['escort'] }, new Date('2026-12-01'))).not.toThrow();
});

test('探访报告要求完成五项检查、限制说明长度并校验关注电话通知', () => {
  const checks = { mental: true, diet: true, utilities: true, doors: true, medical: true };
  expect(cleanVisitReport({ checks, notes: '已完成', attention: false })).toMatchObject({ checks, notes: '已完成', attention: false });
  expect(() => cleanVisitReport({ checks: { ...checks, diet: false }, attention: false })).toThrow('全部探访检查');
  expect(() => cleanVisitReport({ checks, attention: true, attentionCallConfirmed: false })).toThrow('电话通知');
  expect(() => cleanVisitReport({ checks, notes: '补充'.repeat(501), attention: false })).toThrow('500 字');
});
