const { ensure, integer, record, text } = require('../validate');
const { parseWindow, addDays, ymd } = require('../time');

const VISIT_CHECKS = ['mental', 'diet', 'utilities', 'doors', 'medical'];

function cleanMeal(detail, community) {
  record(detail, '送餐详情');
  const priceConfig = record(community.prices && community.prices.meal, '送餐价格配置', 'E_CONFIG');
  const canteen = (community.canteens || []).find(item => item.code === detail.canteenCode);
  ensure(canteen && canteen.name, '请选择本小区合作食堂');
  const items = text(detail.items, '餐品清单', 200).trim();
  const goodsCap = integer(detail.goodsCap, '餐费预付金额', 1, integer(priceConfig.goodsCapMax, '餐费预付上限', 1, Number.MAX_SAFE_INTEGER, 'E_CONFIG'));
  return { canteenCode: canteen.code, canteenName: canteen.name, merchantId: canteen.merchantId || null, items, goodsCap };
}

function cleanEscort(detail, dutyWindows = [], now = new Date()) {
  record(detail, '陪诊详情');
  const hospital = text(detail.hospital, '医院', 100).trim();
  const department = text(detail.department, '科室', 100).trim();
  ensure(typeof detail.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.date), '请选择陪诊日期');
  ensure(typeof detail.start === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(detail.start), '陪诊开始时间格式不正确');
  const [year, month, day] = detail.date.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  ensure(calendarDate.getUTCFullYear() === year && calendarDate.getUTCMonth() === month - 1 && calendarDate.getUTCDate() === day,
    '陪诊日期无效');
  ensure(detail.date >= ymd(now) && detail.date <= ymd(addDays(now, 30)), '陪诊日期需在未来 30 天内');
  const blocks = integer(detail.blocks, '陪诊时长档数', 1, 4);
  ensure(typeof detail.pickup === 'boolean', '请选择是否需要接送');
  const startAt = new Date(detail.date + 'T' + detail.start + ':00+08:00');
  ensure(Number.isFinite(startAt.getTime()) && startAt > now, '陪诊开始时间必须在未来');
  const endAt = new Date(startAt.getTime() + blocks * 2 * 60 * 60 * 1000);
  const withinDuty = Array.isArray(dutyWindows) && dutyWindows.some(window => {
    const duty = parseWindow({ date: detail.date, start: window.start, end: window.end });
    return startAt >= duty.startAt && endAt <= duty.endAt;
  });
  ensure(withinDuty, '陪诊日期和时长必须完全落在小区值班时段内');
  return { hospital, department, date: detail.date, start: detail.start, blocks, pickup: detail.pickup };
}

function escortSlot(detail, dutyWindows, now = new Date()) {
  const normalized = cleanEscort(detail, dutyWindows, now);
  const startAt = new Date(normalized.date + 'T' + normalized.start + ':00+08:00');
  const endAt = new Date(startAt.getTime() + normalized.blocks * 2 * 60 * 60 * 1000);
  return dutyWindows.map(window => ({ date: normalized.date, start: window.start, end: window.end }))
    .find(slot => {
      const duty = parseWindow(slot);
      return startAt >= duty.startAt && endAt <= duty.endAt;
    }) || null;
}

function cleanVisitReport(input) {
  record(input, '探访报告');
  record(input.checks, '检查事项');
  const checks = {};
  for (const key of VISIT_CHECKS) {
    ensure(input.checks[key] === true, '请完成全部探访检查事项');
    checks[key] = input.checks[key];
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  ensure([...notes].length <= 500, '探访补充说明不能超过 500 字');
  ensure(typeof input.attention === 'boolean', '请选择是否需要关注');
  if (input.attention) ensure(input.attentionCallConfirmed === true, '发现需关注事项时，请先电话通知下单人');
  return { checks, notes, attention: input.attention, attentionNotifiedAt: input.attention ? new Date() : null };
}

function cleanVisit(detail) {
  record(detail, '探访详情');
  return { membershipId: text(detail.membershipId, '探访月卡', 100) };
}

function quote(serviceCode, detail, prices, community) {
  if (serviceCode === 'meal') {
    const normalized = cleanMeal(detail, community);
    const config = prices.meal;
    const serviceFee = integer(config.serviceFee === undefined ? 300 : config.serviceFee, '送餐服务费', 0);
    return { normalized, listPrice: serviceFee, discount: 0, payAmount: serviceFee, goodsCap: normalized.goodsCap,
      freeByMembership: false, reason: '送餐服务费及餐费预付' };
  }
  ensure(serviceCode === 'escort', '暂不支持该助老服务');
  const normalized = cleanEscort(detail, community.dutyWindows);
  const config = prices.escort || {};
  const perBlock = integer(config.perBlock === undefined ? 16800 : config.perBlock, '陪诊每档价格', 1);
  const listPrice = perBlock * normalized.blocks;
  ensure(Number.isSafeInteger(listPrice), '陪诊总价超出范围');
  return { normalized, listPrice, discount: 0, payAmount: listPrice, goodsCap: 0,
    freeByMembership: false, reason: '陪诊按时长计价' };
}

module.exports = { VISIT_CHECKS, cleanMeal, cleanVisit, cleanEscort, escortSlot, cleanVisitReport, quote };
