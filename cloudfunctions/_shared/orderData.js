const { ensure, record, text } = require('./validate');
const { ymd, addDays, parseWindow, nextDutyWindow } = require('./time');
const { STATUS_TEXT, assertTransition } = require('./stateMachine');

const SERVICE_NAMES = Object.freeze({ express: '代取快递', trash: '代扔垃圾', buy: '周边代买', help: '帮把手', custom: '悬赏任务', idle: '闲置担保交易', meal: '送餐上门', visit: '独居探访', escort: '陪诊', pet: '上门喂宠', recycle: '回收上门', vacant: '空置房巡检' });
const STATUS_GROUPS = Object.freeze({ ongoing: ['pending_quote', 'pending_pay', 'paid', 'accepted', 'in_service', 'delivered'],
  done: ['completed', 'closed', 'cancelled'], aftersale: ['disputed', 'refunded'] });

function availableSlots(windows, now) {
  nextDutyWindow(windows, now); // 同时验证配置及循环时段不重叠。
  return [-1, 0, 1].flatMap(offset => windows.map(window => ({ date: ymd(addDays(now, offset)),
    start: window.start, end: window.end }))).filter(slot => {
    const { startAt, endAt } = parseWindow(slot);
    return endAt > now && (slot.date >= ymd(now) || startAt <= now);
  }).sort((a, b) => parseWindow(a).startAt - parseWindow(b).startAt);
}

function validateSlot(slot, windows, onDutyCount, now) {
  if (slot === null) {
    ensure(onDutyCount > 0, '现在没有服务员值班，请选择上门时段');
    return null;
  }
  record(slot, '上门时段');
  const matched = availableSlots(windows, now).find(item => item.date === slot.date && item.start === slot.start && item.end === slot.end);
  ensure(matched, '该时段已结束或不可预约，请重新选择');
  return matched;
}

function cleanDetail(serviceCode, detail, community) {
  record(detail, '服务详情');
  if (serviceCode === 'express') {
    ensure(community.stations.some(station => station.code === detail.stationCode), '请选择本小区的驿站');
    return { stationCode: detail.stationCode, pickupCodes: detail.pickupCodes.map(value => value.trim()),
      largeCount: detail.largeCount, placement: detail.placement || 'door' };
  }
  if (serviceCode === 'trash') return { bags: detail.bags, sorted: detail.sorted, placement: 'door' };
  if (serviceCode === 'buy') return { shop: detail.shop.trim(), items: detail.items.trim(), goodsCap: detail.goodsCap };
  if (serviceCode === 'meal') return require('./services/elder').cleanMeal(detail, community);
  if (serviceCode === 'visit') return require('./services/elder').cleanVisit(detail);
  if (serviceCode === 'escort') return require('./services/elder').cleanEscort(detail, community.dutyWindows);
  if (serviceCode === 'pet') return require('./pet').clean(detail, community).detail;
  if (serviceCode === 'recycle') return require('./recycle').clean(detail);
  if (serviceCode === 'vacant') {
    const date = text(detail.date, '巡检日期', 10);
    ensure(/^\d{4}-\d{2}-\d{2}$/.test(date), '巡检日期格式不正确');
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    ensure(parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day, '巡检日期无效');
    ensure(['password', 'key_handover', 'property_keybox'].includes(detail.entry), '入户方式不正确');
    return { date, entry: detail.entry, checklist: ['windows','utilities','leakMold','ventilation','mail','photos'] };
  }
  if (serviceCode === 'help') return { category: detail.category, desc: detail.desc.trim(),
    ...require('./helpPricing').helpTerms(community.prices.help, detail) };
  if (serviceCode === 'custom') return { title: text(detail.title, '任务标题', 100).trim(),
    desc: text(detail.desc, '任务说明', 2000).trim(), needEnterHome: detail.needEnterHome === true };
  ensure(false, '暂不支持该服务');
}

function cleanNote(note = '') {
  ensure(typeof note === 'string' && [...note].length <= 100, '备注不能超过 100 字');
  return note.trim();
}

function addressSnapshot(user, community, building, selected = null) {
  if (selected) user = { ...user, communityId: selected.communityId, buildingId: selected.buildingId,
    unit: selected.unit, room: selected.room, phone: selected.contactPhone };
  ensure(community && community.status === 'active', '该小区暂不可用');
  ensure(building && building.communityId === community._id && user.communityId === community._id,
    '请重新绑定本小区门牌');
  ensure(building.units.includes(user.unit), '请选择有效单元');
  text(user.room, '门牌号', 30);
  ensure(/^1\d{10}$/.test(user.phone || ''), '请先填写联系电话并绑定门牌');
  return { buildingName: building.name, unit: user.unit, room: user.room };
}

function transitionPatch(order, status, actor, now) {
  assertTransition(order.status, status, order.kind);
  return { status, alertPriority: status === 'paid' && order.alertedAt ? 1 : 0,
    updatedAt: now, timeline: [...order.timeline, { status, at: now, by: actor }] };
}

function newOrder({ id, orderNo, user, community, building, serviceCode, detail, note, slot, pricing, now,
  selectedAddress = null, minLevel = null, taskPostId = null, detailAlreadyClean = false }) {
  return { _id: id, orderNo, kind: 'service', serviceCode, planCode: null,
    communityId: community._id, buildingId: building._id, address: { ...addressSnapshot(user, community, building, selectedAddress),
      ...(selectedAddress ? { contactName: selectedAddress.contactName || '', contactPhone: selectedAddress.contactPhone } : {}) },
    userOpenid: user.openid, userPhone: selectedAddress ? selectedAddress.contactPhone : user.phone,
    minLevel: minLevel || (['help','meal','visit','escort','pet','vacant'].includes(serviceCode) ? 2 : 1),
    ...(taskPostId ? { taskPostId } : {}),
    ...(serviceCode === 'escort' ? { requiredCert: 'escort' } : {}),
    ...(serviceCode === 'pet' && (community.requiredCerts || []).includes('pet') ? { requiredCert: 'pet' } : {}),
    detail: detailAlreadyClean ? detail : cleanDetail(serviceCode, detail, community), note: cleanNote(note), slot,
    pricing: { listPrice: pricing.listPrice, discount: pricing.discount, payAmount: pricing.payAmount,
      goodsCap: pricing.goodsCap, goodsActual: 0, freeByMembership: pricing.freeByMembership,
      couponId: pricing.couponId || null, couponDiscount: pricing.couponDiscount || 0,
      pointsRedeemed: pricing.pointsRedeemed || 0 },
    status: 'pending_pay', source: 'user', membershipId: null, providerOpenid: null, providerId: null,
    photos: [], rating: null, complaint: null,
    payment: { outTradeNo: orderNo, transactionId: null, paidAt: null }, refunds: [],
    timeline: [{ status: 'pending_pay', at: now, by: user.openid }],
    alertedAt: null, alertPriority: 0, acceptedAt: null, deliveredAt: null, completedAt: null, createdAt: now, updatedAt: now };
}

function listView(order) {
  return { _id: order._id, orderNo: order.orderNo, kind: order.kind, serviceCode: order.serviceCode, communityId: order.communityId,
    serviceName: order.kind === 'merchant' ? order.detail && order.detail.title || '商家服务' : order.kind === 'idle_purchase' ? '闲置担保交易' : order.kind === 'event_signup' ? order.eventTitle || '活动报名' : SERVICE_NAMES[order.serviceCode] || '月卡', status: order.status,
    statusText: order.kind === 'membership_purchase' && order.status === 'paid' ? '已开卡' : STATUS_TEXT[order.status],
    pricing: { payAmount: order.pricing.payAmount, goodsCap: order.pricing.goodsCap }, slot: order.slot,
    createdAt: order.createdAt, buildingName: order.address && order.address.buildingName };
}

module.exports = { SERVICE_NAMES, STATUS_GROUPS, availableSlots, validateSlot, cleanDetail, cleanNote,
  addressSnapshot, transitionPatch, newOrder, listView };
