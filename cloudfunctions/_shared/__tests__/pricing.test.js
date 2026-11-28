const { quote } = require('../pricing');

function input(serviceCode = 'express') {
  return {
    serviceCode,
    detail: {
      express: { stationCode: 'S1', pickupCodes: ['A1', 'A2'], largeCount: 0, placement: 'door' },
      trash: { bags: 1, sorted: true },
      buy: { shop: '就近便利店', items: '牛奶', goodsCap: 5000 },
      help: { category: 'carry', desc: '搬桶装水', blocks: 2 }
    }[serviceCode],
    prices: {
      express: { base: 250, extraParcel: 100, largeSurcharge: 200, maxParcels: 10 },
      trash: { single: 500 }, buy: { serviceFee: 400, goodsCapMax: 20000, goodsCapMin: 1000 },
      help: { per15min: 1000, maxBlocks: 8 }, firstOrderPrice: 100, membershipTaskPayout: 120
    },
    user: { firstPaidAt: new Date('2026-11-01T00:00:00Z') }, membershipState: null, todayUsedParcels: 0
  };
}

test.each([['express', 350, 0], ['trash', 500, 0], ['buy', 400, 5000], ['help', 2000, 0]])(
  '四项服务原价报价 %s', (serviceCode, listPrice, goodsCap) => {
    expect(quote(input(serviceCode))).toEqual({ listPrice, discount: 0, payAmount: listPrice, goodsCap, reason: '原价', freeByMembership: false });
  });

test('SPEC §17 首单两件一件大件，原价 550、实收 100', () => {
  const data = input();
  data.detail.largeCount = 1;
  data.user.firstPaidAt = null;
  expect(quote(data)).toMatchObject({ listPrice: 550, discount: 450, payAmount: 100 });
});

test.each(['express', 'trash', 'buy'])('首单价仅折扣服务费 %s', service => {
  const data = input(service);
  data.user.firstPaidAt = null;
  const result = quote(data);
  expect(result.payAmount).toBe(100);
  expect(result.reason).toBe('首单优惠');
  expect(result.goodsCap).toBe(service === 'buy' ? 5000 : 0);
});

test('帮把手不享首单价，低于首单价的服务也不涨价', () => {
  const help = input('help');
  help.user.firstPaidAt = null;
  expect(quote(help).payAmount).toBe(2000);
  const trash = input('trash');
  trash.user.firstPaidAt = null;
  trash.prices.trash.single = 50;
  expect(quote(trash).payAmount).toBe(50);
});

test('月卡优先于首单，大件也按 SPEC 免单', () => {
  const data = input();
  data.user.firstPaidAt = null;
  data.detail.largeCount = 2;
  data.membershipState = { active: true, dailyParcelQuota: 3 };
  data.todayUsedParcels = 1;
  expect(quote(data)).toMatchObject({ listPrice: 750, discount: 750, payAmount: 0, freeByMembership: true });
});

test('当天第 1/2/3 件免费，再下两件整单原价，即使首单资格仍在', () => {
  const data = input();
  data.user.firstPaidAt = null;
  data.membershipState = { active: true, dailyParcelQuota: 3 };
  data.detail.pickupCodes = ['A1'];
  for (const used of [0, 1, 2]) {
    data.todayUsedParcels = used;
    expect(quote(data).payAmount).toBe(0);
  }
  data.todayUsedParcels = 3;
  data.detail.pickupCodes = ['A1', 'A2'];
  expect(quote(data)).toMatchObject({ payAmount: 350, discount: 0, freeByMembership: false });
});

test('额度不足不拆单；无效月卡回到正常首单价规则', () => {
  const data = input();
  data.user.firstPaidAt = null;
  data.membershipState = { active: true, dailyParcelQuota: 3 };
  data.todayUsedParcels = 2;
  expect(quote(data).payAmount).toBe(350);
  data.membershipState.active = false;
  expect(quote(data).payAmount).toBe(100);
});

test('有有效月卡却未提供已用件数时拒绝报价，不能默认免费', () => {
  const data = input();
  data.membershipState = { active: true, dailyParcelQuota: 3 };
  delete data.todayUsedParcels;
  expect(() => quote(data)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
});

test.each([
  ['express', 'pickupCodes', []], ['express', 'pickupCodes', Array(11).fill('A')],
  ['express', 'pickupCodes', ['a'.repeat(21)]], ['express', 'pickupCodes', ['']], ['express', 'pickupCodes', 'A'],
  ['express', 'largeCount', 3], ['express', 'largeCount', -1], ['express', 'largeCount', 0.5],
  ['express', 'stationCode', ''], ['express', 'placement', 'unknown'],
  ['trash', 'bags', 0], ['trash', 'bags', 4], ['trash', 'sorted', false], ['trash', 'sorted', 'true'],
  ['trash', 'placement', 'hand'], ['buy', 'goodsCap', 999], ['buy', 'goodsCap', 20001],
  ['buy', 'goodsCap', '5000'], ['buy', 'goodsCap', 1000.5], ['buy', 'items', '文'.repeat(201)],
  ['buy', 'shop', ''], ['help', 'blocks', 0], ['help', 'blocks', 9], ['help', 'blocks', 1.5],
  ['help', 'category', 'unknown'], ['help', 'desc', '']
])('拒绝非法服务详情 %s.%s=%p', (service, field, value) => {
  const data = input(service);
  data.detail[field] = value;
  expect(() => quote(data)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
});

test.each([1000, 20000])('代买上限边界 %i 允许且不打折', goodsCap => {
  const data = input('buy');
  data.detail.goodsCap = goodsCap;
  expect(quote(data).goodsCap).toBe(goodsCap);
});

test('使用小区配置的件数和时长上限', () => {
  const express = input();
  express.prices.express.maxParcels = 1;
  expect(() => quote(express)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
  const help = input('help');
  help.prices.help.maxBlocks = 1;
  expect(() => quote(help)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
});

test('价格配置异常、缺失或溢出拒绝报价', () => {
  for (const value of [-1, 0.5, '250', Infinity, undefined, Number.MAX_SAFE_INTEGER]) {
    const data = input();
    data.prices.express.base = value;
    expect(() => quote(data)).toThrow(expect.objectContaining({ code: 'E_CONFIG' }));
  }
  const data = input('buy');
  data.prices.buy.goodsCapMin = 20001;
  expect(() => quote(data)).toThrow(expect.objectContaining({ code: 'E_CONFIG' }));
});

test.each([null, {}, { serviceCode: 'toString' }, { ...input(), detail: null }, { ...input(), user: null }])(
  '缺失或非法报价参数被拒绝 %p', data => {
    expect(() => quote(data)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
  });

test('不信任前端传入价格，不修改输入对象', () => {
  const data = input();
  data.detail.listPrice = 1;
  data.detail.payAmount = 1;
  const before = JSON.stringify(data);
  expect(quote(data).payAmount).toBe(350);
  expect(JSON.stringify(data)).toBe(before);
});

test.each([false, '', '2026-11-01', new Date(NaN)])('首次支付记录异常时明确拒绝 %p', firstPaidAt => {
  const data = input();
  data.user.firstPaidAt = firstPaidAt;
  expect(() => quote(data)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAM' }));
});

test.each([{}, { active: 'true' }, { active: true }, { active: true, dailyParcelQuota: 0 }])(
  '月卡状态或额度异常时拒绝 %p', membershipState => {
    expect(() => quote({ ...input(), membershipState })).toThrow(expect.objectContaining({ code: 'E_CONFIG' }));
  });

test('件数、块数配置不能突破 SPEC 的上限', () => {
  const express = input();
  express.prices.express.maxParcels = 11;
  expect(() => quote(express)).toThrow(expect.objectContaining({ code: 'E_CONFIG' }));
  const help = input('help');
  help.prices.help.maxBlocks = 9;
  expect(() => quote(help)).toThrow(expect.objectContaining({ code: 'E_CONFIG' }));
});

test('允许 SPEC 的最大件数、大件数、袋数、块数与文本长度', () => {
  const express = input();
  express.detail.pickupCodes = Array(10).fill('a'.repeat(20));
  express.detail.largeCount = 10;
  delete express.detail.placement;
  expect(quote(express).listPrice).toBe(3150);
  const trash = input('trash');
  trash.detail.bags = 3;
  expect(quote(trash).listPrice).toBe(500);
  const help = input('help');
  help.detail.blocks = 8;
  help.detail.desc = '文'.repeat(200);
  expect(quote(help).listPrice).toBe(8000);
});

test.each([
  [{ kind: 'amount_off', value: 200, maxOff: 500 }, 200],
  [{ kind: 'percent_off', value: 20, maxOff: 1000 }, 70],
  [{ kind: 'free', value: 0, maxOff: 9999 }, 349]
])('优惠券类型计算且封顶有效 %p', (coupon, discount) => {
  const data = input();
  data.coupons = [{ couponId: 'c1', template: { ...coupon, threshold: 0, services: ['all'],
    communityIds: 'all', status: 'active' } }];
  data.communityId = 'c';
  expect(quote(data)).toMatchObject({ couponId: 'c1', couponDiscount: discount,
    payAmount: 350 - discount });
});

test('首单优惠与优惠券择优，代买商品款不参与抵扣', () => {
  const data = input('buy');
  data.user.firstPaidAt = null;
  data.communityId = 'c';
  data.coupons = [{ couponId: 'small', template: { kind: 'amount_off', value: 50, maxOff: 50,
    threshold: 0, services: ['all'], communityIds: 'all', status: 'active' } }];
  expect(quote(data)).toMatchObject({ payAmount: 100, couponId: null, couponDiscount: 0, goodsCap: 5000 });
  data.coupons[0].template.value = 350;
  data.coupons[0].template.maxOff = 350;
  expect(quote(data)).toMatchObject({ payAmount: 50, couponId: 'small', couponDiscount: 350, goodsCap: 5000 });
});

test('自动报价选更优优惠，用户手选时按所选优惠券计价', () => {
  const data = input('buy');
  data.user.firstPaidAt = null;
  data.communityId = 'c';
  data.coupons = [{ couponId: 'small', template: { kind: 'amount_off', value: 50, maxOff: 50,
    threshold: 0, services: ['all'], communityIds: 'all', status: 'active' } }];
  expect(quote(data)).toMatchObject({ payAmount: 100, couponId: null, reason: '首单优惠' });
  data.couponId = 'small';
  expect(quote(data)).toMatchObject({ payAmount: 350, couponId: 'small', couponDiscount: 50, reason: '优惠券' });
});

test('积分 100 点兑 1 元，最多抵扣五成，且实付至少 1 分', () => {
  const data = input();
  data.coupons = [];
  data.pointsBalance = 500;
  data.pointsEnabled = true;
  data.pointsToUse = 175;
  expect(quote(data)).toMatchObject({ payAmount: 175, pointsRedeemed: 175 });
  data.pointsToUse = 176;
  expect(() => quote(data)).toThrow('50%');
  data.pointsBalance = 1000;
  data.pointsToUse = 0;
  data.coupons = [{ couponId: 'free', discount: 349 }];
  expect(quote(data).payAmount).toBe(1);
});


describe('D13 按次帮把手', () => {
  const visit = () => { const d=input('help'); d.prices.help={billingMode:'per_visit',perVisit:3900,includedMinutes:30}; d.detail={category:'carry',desc:'搬桶装水',billingMode:'per_visit',includedMinutes:30}; return d; };
  test('39元包括30分钟，不享首单且不使用客户端价格或超时金额', () => {
    const d=visit();d.user.firstPaidAt=null;Object.assign(d.detail,{perVisit:1,elapsedMinutes:90,overtimeFee:99999});
    expect(quote(d)).toMatchObject({listPrice:3900,payAmount:3900,goodsCap:0});
  });
  test.each([{blocks:2},{includedMinutes:60},{billingMode:'per15min'},{billingMode:undefined}])('拒绝旧页面或改变服务范围 %p', patch => {
    const d=visit();Object.assign(d.detail,patch);expect(()=>quote(d)).toThrow(expect.objectContaining({code:'E_CONFLICT'}));
  });
  test('订单详情只保存服务端包含时长和超时规则，配置修改不影响旧快照', () => {
    const {cleanDetail}=require('../orderData');const d=visit();d.detail.overtimePolicy='automatic';
    const saved=cleanDetail('help',d.detail,{prices:d.prices});d.prices.help.includedMinutes=60;
    expect(saved).toEqual({category:'carry',desc:'搬桶装水',billingMode:'per_visit',includedMinutes:30,overtimePolicy:'new_order'});
  });
  test.each([{perVisit:0},{perVisit:39.5},{includedMinutes:0},{includedMinutes:'30'},{billingMode:'invalid'}])('拒绝无效配置 %p',patch=>{
    const d=visit();Object.assign(d.prices.help,patch);expect(()=>quote(d)).toThrow();
  });
  test('旧模式拒绝按次页面，不把按次规则当作时长块数',()=>{const d=input('help');d.detail.billingMode='per_visit';expect(()=>quote(d)).toThrow(expect.objectContaining({code:'E_CONFLICT'}));});
});
