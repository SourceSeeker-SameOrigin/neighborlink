const PRICE_FIELDS = [
 ['express.base','快递首件（分）'],['express.extraParcel','快递续件（分）'],['express.largeSurcharge','快递大件加价（分）'],['express.maxParcels','快递最多件数'],
 ['trash.single','单次扔垃圾（分）'],['buy.serviceFee','代买服务费（分）'],['buy.goodsCapMin','代买预付下限（分）'],['buy.goodsCapMax','代买预付上限（分）'],
 ['help.perVisit','帮把手每次（分）'],['help.includedMinutes','帮把手每次包含分钟数'],['help.per15min','帮把手每15分钟（分）'],['help.maxBlocks','帮把手最多档数'],['firstOrderPrice','首单服务价（分）'],['membershipTaskPayout','垃圾月卡每次报酬（分）'],
 ['meal.serviceFee','助老送餐服务费（分）'],['meal.goodsCapMax','餐费预付上限（分）'],['visit.taskPayout','每次探访报酬（分）'],['escort.perBlock','陪诊每2小时（分）'],
 ['pet.perVisitCat','每只猫每次（分）'],['pet.perVisitDog','每只狗每次（分）'],['pet.perVisitOther','其他宠物每只每次（分）'],['pet.holidaySurcharge','喂宠节假日加价（万分比）'],
 ['vacantHome.perVisitPayout','每次空置房巡检报酬（分）'],['stationDelivery.perPiece','驿站每件收费（分）'],['stationDelivery.perPiecePayout','驿站每件服务员报酬（分）'],
 ['recycle.providerBaseFen','回收每单基础报酬（分）'],['recycle.providerFenPerKg','回收每公斤报酬（分）']
];
const GLOBAL_FIELDS=[['autoConfirmHours','自动确认时限（小时）'],['acceptAlertMinutes','未接单告警（分钟）'],['payTimeoutMinutes','待支付超时（分钟）'],['complaintWindowHours','投诉窗口（小时）'],['phoneVisibleHoursAfterDone','完成后电话可见（小时）'],['referralBonus','推荐奖励（分）']];
const KEYWORDS=[['blacklist','通用禁止关键词'],['idleBlacklist','闲置禁售关键词'],['carryBlacklist','境外帮带关键词'],['contentBlacklist','内容审核关键词']];
const PLANS=[{code:'trash_monthly',name:'垃圾月卡',serviceCode:'trash'},{code:'express_monthly',name:'快递月卡',serviceCode:'express'},{code:'visit_monthly',name:'独居探访月卡',serviceCode:'visit'},{code:'vacant_monthly',name:'空置房巡检月卡',serviceCode:'vacant'}];
const CATEGORIES=[['paper','纸类'],['plastic','塑料'],['metal','金属'],['clothing','衣物'],['appliance','小家电']];
const copy=value=>JSON.parse(JSON.stringify(value || {}));
const read=(value,path)=>path.split('.').reduce((v,k)=>v&&v[k],value);
function write(value,path,next) { const keys=path.split('.');let cur=value;keys.slice(0,-1).forEach(k=>{if(!cur[k])cur[k]={};cur=cur[k];});cur[keys[keys.length-1]]=next; }
function number(value,label) { if(typeof value==='string'&&!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value)) || Number(value)<0) throw new Error(label+'请填写非负整数'); return Number(value); }
function fields(defs,source) { return defs.map(([key,label])=>({key,label,value:read(source,key)===undefined?'':String(read(source,key))})); }
function pricePatch(original,rows,helpMode) { const prices=copy(original); for(const row of rows) if(row.value!=='')write(prices,row.key,number(row.value,row.label)); if(helpMode !== undefined && prices.help) { prices.help.billingMode=helpMode; if(helpMode==='per_visit'){delete prices.help.per15min;delete prices.help.maxBlocks;}else{delete prices.help.perVisit;delete prices.help.includedMinutes;} } return prices; }
function plans(rows) { return rows.map(row=>{const selected=PLANS[row.kindIndex];const result={...copy(row.original),code:selected.code,serviceCode:selected.serviceCode,name:row.name.trim(),price:number(row.price,'月卡价格'),firstPeriodPrice:number(row.firstPeriodPrice,'首期价格'),days:number(row.days,'有效天数')};delete result.dailyParcelQuota;delete result.schedule;
 if(result.serviceCode==='express')result.dailyParcelQuota=number(row.dailyParcelQuota,'每日件数');
 if(result.serviceCode==='trash')result.schedule={type:'daily'};
 if(result.serviceCode==='visit')result.schedule={type:'weekly',weekdays:row.weekdays.split(/[,，\s]+/).filter(Boolean).map(v=>number(v,'星期'))};
 if(result.serviceCode==='vacant')result.schedule={type:'monthly',days:[1,15]};return result; }); }
module.exports={PRICE_FIELDS,GLOBAL_FIELDS,KEYWORDS,PLANS,CATEGORIES,copy,fields,pricePatch,plans,number};
