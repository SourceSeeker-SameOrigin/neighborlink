const { ensure, record, integer, text } = require('./validate');
const { nextDutyWindow, parseDate } = require('./time');
const { cardPlan } = require('./membershipData');
function validatePrices(prices) {
  record(prices, '价格');
  function visit(value, path) {
    if (path === 'help.billingMode') {
      ensure(['per15min','per_visit'].includes(value), '帮把手计价方式不正确'); return;
    }
    if (path === 'pet.holidayDates') {
      ensure(Array.isArray(value), '节假日须为日期列表'); value.forEach(parseDate); return;
    }
    if (/^recycle\.categories\.[^.]+\.recyclerId$/.test(path)) { text(value, '回收企业', 100); return; }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, path ? path + '.' + key : key);
    } else integer(value, '价格或数量 ' + path, 0);
  }
  visit(prices, '');
  if (prices.help && prices.help.billingMode !== undefined) require('./helpPricing').helpConfig(prices.help);
  if (prices.buy && prices.buy.goodsCapMin !== undefined && prices.buy.goodsCapMax !== undefined)
    ensure(prices.buy.goodsCapMin <= prices.buy.goodsCapMax, '代买预付下限不能高于上限');
  for (const [key,min,max] of [['express.maxParcels',1,10],['help.maxBlocks',1,8],['pet.holidaySurcharge',0,10000]]) {
    const [group,field] = key.split('.');
    if (prices[group] && prices[group][field] !== undefined) integer(prices[group][field], key, min, max);
  }
  if (prices.recycle && prices.recycle.categories) for (const [key,item] of Object.entries(prices.recycle.categories)) {
    ensure(['paper','plastic','metal','clothing','appliance'].includes(key), '回收类别不正确');
    integer(item.pointsPerKg, '每公斤积分', 0, 1000000); integer(item.purchaseFenPerKg, '每公斤收购价', 0, 100000000); text(item.recyclerId, '回收企业', 100);
  }
  return prices;
}
function validateCommunityPatch(patch) {
  if (patch.name !== undefined) ensure(text(patch.name, '小区名称', 80).trim(), '请填写小区名称');
  for (const key of ['city','district','address','propertyName']) if (patch[key] !== undefined) ensure(typeof patch[key] === 'string' && patch[key].length <= 200, '小区资料格式不正确');
  if (patch.prices !== undefined) validatePrices(patch.prices);
  if (patch.dutyWindows !== undefined) { ensure(Array.isArray(patch.dutyWindows) && patch.dutyWindows.length <= 24, '值班时段须为最多24项列表'); nextDutyWindow(patch.dutyWindows,new Date()); }
  if (patch.stations !== undefined) {
    ensure(Array.isArray(patch.stations) && patch.stations.length <= 100, '驿站列表不正确'); const codes=new Set();
    for (const item of patch.stations) { record(item,'驿站'); text(item.code,'驿站代码',40); text(item.name,'驿站名称',80); ensure(!codes.has(item.code.trim()),'驿站代码不能重复'); codes.add(item.code.trim()); }
  }
  if (patch.cardPlans !== undefined) {
    ensure(Array.isArray(patch.cardPlans) && patch.cardPlans.length <= 4, '月卡配置不正确'); const codes=new Set();
    for (const plan of patch.cardPlans) { record(plan,'月卡'); text(plan.name,'月卡名称',80); ensure(!codes.has(plan.code),'月卡代码不能重复'); codes.add(plan.code); cardPlan({cardPlans:[plan]},plan.code);
      if (plan.code === 'trash_monthly' && plan.schedule) ensure(plan.schedule.type === 'daily','垃圾月卡须按日排期');
      if (plan.code === 'vacant_monthly') ensure(plan.schedule.days.length === 2 && new Set(plan.schedule.days).size === 2,'巡检月卡仅每月1日、15日排期');
    }
  }
  return patch;
}
function validateGlobalPatch(patch) {
  if (patch.hotline !== undefined) ensure(typeof patch.hotline === 'string' && (!patch.hotline || /^[\d+()\-\s]{5,30}$/.test(patch.hotline)), '客服电话格式不正确');
  for (const key of ['blacklist','idleBlacklist','carryBlacklist','contentBlacklist']) if (patch[key] !== undefined) ensure(Array.isArray(patch[key]) && patch[key].length <= 500 && patch[key].every(v=>typeof v==='string' && v.trim().length>0 && v.length<=80),'关键词每项1至80字，最多500项');
  for (const key of ['autoConfirmHours','acceptAlertMinutes','payTimeoutMinutes','complaintWindowHours','phoneVisibleHoursAfterDone','referralBonus']) if (patch[key]!==undefined) integer(patch[key],key,0);
  return patch;
}
function changedCardEntitlements(previous, next) {
  const schedule = plan => plan.code === 'trash_monthly' ? {type:'daily'} : plan.code === 'visit_monthly' ? (plan.schedule || {type:'weekly',weekdays:[2,5]}) : plan.schedule || null;
  const entitlement = plan => ({serviceCode:plan.serviceCode,days:plan.days,dailyParcelQuota:plan.dailyParcelQuota || null,schedule:schedule(plan)});
  return (previous || []).filter(old => {const current=next.find(plan=>plan.code===old.code);return !current || JSON.stringify(entitlement(old))!==JSON.stringify(entitlement(current));}).map(plan=>plan.code);
}
module.exports={validatePrices,validateCommunityPatch,validateGlobalPatch,changedCardEntitlements};
