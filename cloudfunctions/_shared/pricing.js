const { ensure, record, integer, text } = require('./validate');
const { couponDiscount: calculateCouponDiscount } = require('./couponData');
const elder = require('./services/elder');
const pet = require('./pet');
const recycle = require('./recycle');

function price(value, label) {
  return integer(value, label, 0, Number.MAX_SAFE_INTEGER, 'E_CONFIG');
}

// membershipState 是服务端查询后得到的 { active, dailyParcelQuota } 或 null。
// active 必须已校验用户、小区、卡类型及有效期；本函数不查库，也不读取系统时钟。
function quote(input) {
  record(input, '报价参数');
  const { serviceCode, detail, prices, user, membershipState = null, todayUsedParcels } = input;
  if (serviceCode === 'meal') {
    const elderQuote = elder.quote(serviceCode, detail, prices, input.community);
    const firstOrderPrice = price(prices.firstOrderPrice, '首单价');
    if (user.firstPaidAt == null && elderQuote.payAmount > firstOrderPrice) {
      elderQuote.payAmount = firstOrderPrice;
      elderQuote.discount = elderQuote.listPrice - firstOrderPrice;
      elderQuote.reason = '首单优惠';
    }
    return elderQuote;
  }
  if (serviceCode === 'escort') return elder.quote(serviceCode, detail, prices, input.community);
  if (serviceCode === 'recycle') return recycle.quote();
  if (serviceCode === 'pet') {
    ensure(input.community, '小区配置缺失', 'E_CONFIG');
    return pet.quote(detail, input.community, input.now || new Date());
  }
  ensure(['express', 'trash', 'buy', 'help'].includes(serviceCode), '暂不支持该服务');
  record(detail, '服务详情');
  record(prices, '价格配置', 'E_CONFIG');
  record(user, '用户信息');
  ensure(user.firstPaidAt == null || (user.firstPaidAt instanceof Date && Number.isFinite(user.firstPaidAt.getTime())),
    '首次支付时间格式不正确');
  const config = record(prices[serviceCode], '服务价格', 'E_CONFIG');
  let listPrice;
  let goodsCap = 0;
  let parcels = 0;

  if (serviceCode === 'express') {
    const maxParcels = integer(config.maxParcels, '最多快递件数', 1, 10, 'E_CONFIG');
    text(detail.stationCode, '驿站');
    ensure(Array.isArray(detail.pickupCodes), '取件码必须为列表');
    parcels = integer(detail.pickupCodes.length, '快递件数', 1, maxParcels);
    for (const code of detail.pickupCodes) text(code, '取件码', 20);
    integer(detail.largeCount, '大件数', 0, parcels);
    ensure(detail.placement === undefined || ['door', 'hand'].includes(detail.placement), '交付方式不正确');
    listPrice = price(config.base, '快递基础价') + price(config.extraParcel, '续件费') * (parcels - 1) +
      price(config.largeSurcharge, '大件附加费') * detail.largeCount;
  } else if (serviceCode === 'trash') {
    integer(detail.bags, '垃圾袋数', 1, 3);
    ensure(detail.sorted === true, '请确认垃圾已分类');
    ensure(detail.placement === undefined || detail.placement === 'door', '垃圾请放在门口');
    listPrice = price(config.single, '垃圾服务费');
  } else if (serviceCode === 'buy') {
    text(detail.shop, '店名');
    text(detail.items, '代买清单', 200);
    const min = price(config.goodsCapMin, '商品预付下限');
    const max = price(config.goodsCapMax, '商品预付上限');
    ensure(min <= max, '商品预付范围配置不正确', 'E_CONFIG');
    goodsCap = integer(detail.goodsCap, '商品预付金额', min, max);
    listPrice = price(config.serviceFee, '代买服务费');
  } else {
    const terms = require('./helpPricing').helpTerms(config, detail);
    ensure(['carry', 'elder', 'other'].includes(detail.category), '帮把手服务类别不正确');
    text(detail.desc, '服务描述', 200);
    listPrice = terms.billingMode === 'per_visit' ? config.perVisit : price(config.per15min, '每十五分钟价格') * terms.blocks;
  }
  price(listPrice, '服务总价');
  price(listPrice + goodsCap, '支付总额');

  if (todayUsedParcels !== undefined) integer(todayUsedParcels, '今日已用快递件数');
  if (membershipState !== null) {
    record(membershipState, '月卡状态', 'E_CONFIG');
    ensure(typeof membershipState.active === 'boolean', '月卡状态不正确', 'E_CONFIG');
  }
  let payAmount = listPrice;
  let freeByMembership = false;
  let reason = '原价';
  let couponDiscount = 0;
  let couponId = null;
  let pointsRedeemed = 0;
  if (serviceCode === 'express' && membershipState && membershipState.active) {
    const quota = integer(membershipState.dailyParcelQuota, '月卡每日额度', 1, Number.MAX_SAFE_INTEGER, 'E_CONFIG');
    integer(todayUsedParcels, '今日已用快递件数');
    // 超额整单原价，不继续套用首单价；与 SPEC §6.1、§17 场景 12 一致。
    if (parcels <= quota - todayUsedParcels) {
      payAmount = 0;
      freeByMembership = true;
      reason = '快递月卡免单';
    } else {
      reason = '快递月卡额度不足，整单原价';
    }
  } else {
    let firstDiscount = 0;
    if (serviceCode !== 'help') {
      const firstOrderPrice = price(prices.firstOrderPrice, '首单价');
      if (user.firstPaidAt == null && listPrice > firstOrderPrice) firstDiscount = listPrice - firstOrderPrice;
    }
    const coupons = Array.isArray(input.coupons) ? input.coupons.map(item => ({ couponId: item.couponId,
      discount: item.template ? calculateCouponDiscount(item.template, { serviceCode, communityId: input.communityId, listPrice }) : item.discount })) : [];
    const selectedId = input.couponId === undefined ? null : input.couponId;
    ensure(selectedId === null || selectedId === '' || typeof selectedId === 'string', '优惠券选择不正确');
    const candidates = selectedId ? coupons.filter(item => item.couponId === selectedId) :
      selectedId === '' ? [] : coupons;
    ensure(!selectedId || candidates.length === 1, '优惠券已失效，请重新选择', 'E_CONFLICT');
    const selectedCoupon = candidates.filter(item => Number.isSafeInteger(item.discount) && item.discount > 0)
      .sort((a, b) => b.discount - a.discount)[0];
    ensure(!selectedId || selectedCoupon, '该优惠券不适用于本服务或未达到使用门槛', 'E_INVALID_PARAM');
    couponDiscount = selectedCoupon ? Math.min(selectedCoupon.discount, Math.max(0, listPrice - 1)) : 0;
    couponId = selectedCoupon ? selectedCoupon.couponId : null;
    if (selectedId && selectedCoupon) {
      // 用户明确选券时尊重选择；仅自动模式在首单优惠与优惠券之间择优。
      payAmount = listPrice - couponDiscount;
      reason = '优惠券';
    } else if (couponDiscount >= firstDiscount && couponDiscount > 0) {
      payAmount = listPrice - couponDiscount;
      reason = '优惠券';
    } else if (firstDiscount > 0) {
      payAmount = listPrice - firstDiscount;
      couponDiscount = 0;
      couponId = null;
      reason = '首单优惠';
    }
    payAmount = Math.max(1, payAmount);
    const pointsBalance = integer(input.pointsBalance === undefined ? 0 : input.pointsBalance, '积分余额');
    const requestedPoints = integer(input.pointsToUse === undefined ? 0 : input.pointsToUse, '使用积分');
    ensure(requestedPoints <= pointsBalance, '积分余额不足', 'E_CONFLICT');
    ensure(input.pointsEnabled !== false || requestedPoints === 0, '环保积分暂未开放', 'E_FEATURE_OFF');
    const maxPoints = Math.floor(payAmount / 2);
    ensure(requestedPoints <= maxPoints, '积分最多抵扣服务费的 50%');
    pointsRedeemed = requestedPoints;
    payAmount = Math.max(1, payAmount - pointsRedeemed);
    if (pointsRedeemed) reason += ' + 积分抵扣';
  }
  const result = { listPrice, discount: listPrice - payAmount, payAmount, goodsCap, reason, freeByMembership };
  if (input.coupons !== undefined || input.couponId !== undefined || input.pointsToUse !== undefined || input.pointsEnabled !== undefined) {
    Object.assign(result, { couponId, couponDiscount, pointsRedeemed });
  }
  return result;
}

module.exports = { quote };
