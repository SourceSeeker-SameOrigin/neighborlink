const { quote } = require('./pricing');
const { cleanNote, cleanDetail, addressSnapshot, availableSlots, validateSlot } = require('./orderData');
const { escortSlot } = require('./services/elder');
const { ymd, parseDate, addDays } = require('./time');
const { ensure, integer } = require('./validate');
const { isEnabled } = require('./features');
const { validCoupon, couponDiscount } = require('./couponData');

async function orderCoupons(server, openid, now, selectedId) {
  if (selectedId === '') return [];
  const owned = typeof selectedId === 'string'
    ? [await server.get('coupons', selectedId)]
    : await server.all('coupons', { openid, status: 'unused', validTo: server.command.gt(now) });
  const current = owned.filter(item => item && item.openid === openid && item.status === 'unused' &&
    item.validFrom <= now && item.validTo > now);
  const ids = [...new Set(current.map(item => item.templateId).filter(Boolean))];
  const byId = new Map();
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const result = await server.db.collection('couponTemplates')
      .where({ _id: server.command.in(batch) }).limit(batch.length).get();
    for (const template of result.data) byId.set(template._id, template);
  }
  return current.filter(item => validCoupon(item, byId.get(item.templateId), now))
    .sort((a, b) => a.validTo - b.validTo)
    .map(coupon => ({ couponId: coupon._id, coupon, template: byId.get(coupon.templateId) }));
}

function createOrderContext(server) {
  const { db, command, get } = server;
  return async function orderContext(event, user, { metadata = false, creating = false } = {}) {
    const now = new Date();
    const selectedAddress = event.addressId ? (user.addresses || []).find(item => item.id === event.addressId) : null;
    ensure(!event.addressId || selectedAddress, '请选择已保存的上门地址');
    const communityId = selectedAddress ? selectedAddress.communityId : user.communityId;
    const buildingId = selectedAddress ? selectedAddress.buildingId : user.buildingId;
    ensure(event.communityId === communityId, '请选择已保存地址所属的小区');
    const [community, building, config] = await Promise.all([
      get('communities', communityId), get('buildings', buildingId), server.config()
    ]);
    const address = addressSnapshot(user, community, building, selectedAddress);
    const couponsEnabled = isEnabled('coupons', config, community);
    const pointsEnabled = isEnabled('points', config, community);
    ensure(couponsEnabled || !event.couponId, '优惠券暂未开放', 'E_FEATURE_OFF');
    ensure(pointsEnabled || !event.pointsToUse, '环保积分暂未开放', 'E_FEATURE_OFF');
    if (['meal','visit','escort'].includes(event.serviceCode)) await server.feature('elder', community._id);
    if (event.serviceCode === 'pet') await server.feature('pet', community._id);
    if (event.serviceCode === 'recycle') await server.feature('recycle', community._id);
    const [duty, memberships] = await Promise.all([
      db.collection('providers').where({ communityId: community._id, status: 'approved', onDuty: true,
        insuranceUntil: command.gt(now) }).count(),
      server.all('memberships', { userOpenid: user.openid, communityId: community._id, status: 'active',
        startAt: command.lte(now), endAt: command.gt(now) })
    ]);
    const membership = memberships.find(item => item.planCode === 'express_monthly');
    let membershipState = null;
    let todayUsedParcels = 0;
    if (membership && event.serviceCode === 'express') {
      const plan = community.cardPlans.find(item => item.code === 'express_monthly');
      ensure(plan, '快递月卡配置缺失', 'E_CONFIG');
      membershipState = { active: true, dailyParcelQuota: plan.dailyParcelQuota };
      const start = parseDate(ymd(now));
      const usedOrders = await server.all('orders', { userOpenid: user.openid, communityId: community._id,
        'pricing.freeByMembership': true, createdAt: command.gte(start).and(command.lt(addDays(start, 1))) });
      todayUsedParcels = usedOrders.reduce((sum, order) => sum + order.detail.pickupCodes.length, 0);
    }
    const slots = availableSlots(community.dutyWindows, now);
    const common = { now, community, building, config, address, onDutyCount: duty.total, slots,
      hasTrashMembership: memberships.some(item => item.planCode === 'trash_monthly'),
      membership, membershipState, todayUsedParcels };
    const coupons = couponsEnabled ? await orderCoupons(server, user.openid, now, creating ? event.couponId : undefined) : [];
    const pointsBalance = integer(user.pointsBalance || 0, '积分余额');
    try {
      const pricing = quote({ ...event, prices: community.prices, community, user, membershipState, todayUsedParcels,
        communityId: community._id, coupons, pointsBalance, pointsEnabled });
      const petInput = event.serviceCode === 'pet' ? require('./pet').clean(event.detail, community, now) : null;
      const detail = petInput ? petInput.detail : cleanDetail(event.serviceCode, event.detail, community);
      let recycleSnapshot = null;
      if (event.serviceCode === 'recycle') {
        recycleSnapshot = require('./recycle').snapshot(community, detail);
        const recyclerIds = [...new Set(Object.values(recycleSnapshot.categories).map(item => item.recyclerId))];
        const recyclers = await Promise.all(recyclerIds.map(id => get('merchants', id)));
        ensure(recyclers.every(item => item && item.status === 'approved' && item.category === 'recycler' &&
          Array.isArray(item.communityIds) && item.communityIds.includes(community._id)), '回收企业未审核通过或未覆盖本小区', 'E_CONFIG');
      }
      const note = cleanNote(event.note);
      const slot = event.serviceCode === 'escort' ? escortSlot(detail, community.dutyWindows, now) :
        event.slot === undefined && metadata ? (duty.total > 0 ? null : slots[0]) : event.slot;
      if (event.serviceCode === 'escort') ensure(slot, '陪诊预约时段必须完整落在小区值班时段内');
      else validateSlot(slot, community.dutyWindows, duty.total, now);
      const couponOptions = coupons.map(item => ({ couponId: item.couponId, name: item.template.name,
        discount: couponDiscount(item.template, { serviceCode: event.serviceCode, communityId: community._id,
          listPrice: pricing.listPrice }), threshold: item.template.threshold, validTo: item.coupon.validTo }))
        .filter(item => item.discount > 0);
      return { ...common, pricing, detail, note, slot, selectedAddress, couponOptions, pointsBalance,
        couponsEnabled, pointsEnabled, recycleSnapshot, ...(petInput ? { entryPassword: petInput.entryPassword } : {}) };
    } catch (error) {
      if (!metadata || error.code !== 'E_INVALID_PARAM') throw error;
      return { ...common, pricing: null, validationMessage: error.message };
    }
  };
}

module.exports = { createOrderContext };
