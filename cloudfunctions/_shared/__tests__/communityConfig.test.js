const { validateCommunityPatch, validateGlobalPatch, validatePrices } = require('../communityConfig');
const plan = { code:'vacant_monthly',serviceCode:'vacant',name:'巡检',price:9900,firstPeriodPrice:9900,days:30,schedule:{type:'monthly',days:[1,15]} };
test('allows partial configuration without inventing prices or requiring unrelated services',()=>{expect(validateCommunityPatch({name:'测试小区',prices:{},stations:[],cardPlans:[],dutyWindows:[]})).toHaveProperty('name','测试小区');});
test('supports cross-midnight shifts and rejects overlaps and equal endpoints',()=>{expect(()=>validateCommunityPatch({dutyWindows:[{start:'22:00',end:'02:00'}]})).not.toThrow();for(const dutyWindows of [[{start:'22:00',end:'02:00'},{start:'01:00',end:'03:00'}],[{start:'10:00',end:'10:00'}]])expect(()=>validateCommunityPatch({dutyWindows})).toThrow();});
test.each([-1,1.5,'100',NaN])('rejects non-integer price %p',value=>{expect(()=>validatePrices({buy:{serviceFee:value}})).toThrow();});
test('validates min/max and explicit recycling category definitions',()=>{expect(()=>validatePrices({buy:{goodsCapMin:200,goodsCapMax:100}})).toThrow();expect(()=>validatePrices({recycle:{categories:{paper:{pointsPerKg:2,purchaseFenPerKg:100,recyclerId:'company'}}}})).not.toThrow();expect(()=>validatePrices({recycle:{categories:{paper:{pointsPerKg:2}}}})).toThrow();});
test('validates holidays and duplicate stations',()=>{expect(()=>validatePrices({pet:{holidayDates:['2026-02-30']}})).toThrow();expect(()=>validateCommunityPatch({stations:[{code:'s',name:'一'},{code:'s',name:'二'}]})).toThrow();});
test('validates card schedule, duplicate code and first-period price',()=>{expect(()=>validateCommunityPatch({cardPlans:[plan]})).not.toThrow();for(const p of [{...plan,days:31},{...plan,schedule:{type:'monthly',days:[1,15,20]}},{...plan,firstPeriodPrice:10000}])expect(()=>validateCommunityPatch({cardPlans:[p]})).toThrow();expect(()=>validateCommunityPatch({cardPlans:[plan,plan]})).toThrow();});
test('validates global contact, durations and all four keyword lists',()=>{expect(()=>validateGlobalPatch({hotline:'010-12345678',payTimeoutMinutes:15,blacklist:['词']})).not.toThrow();for(const patch of [{hotline:'abc'}, {payTimeoutMinutes:-1}, {idleBlacklist:['']}, {carryBlacklist:'x'}, {contentBlacklist:[1]}])expect(()=>validateGlobalPatch(patch)).toThrow();});

test('R07 only entitlement changes lock active plans; prices and names remain editable',()=>{const {changedCardEntitlements}=require('../communityConfig');const base={code:'express_monthly',serviceCode:'express',days:30,dailyParcelQuota:2,price:9900};expect(changedCardEntitlements([base],[{...base,price:10000,name:'new'}])).toEqual([]);expect(changedCardEntitlements([base],[])).toEqual(['express_monthly']);expect(changedCardEntitlements([base],[{...base,dailyParcelQuota:3}])).toEqual(['express_monthly']);expect(changedCardEntitlements([base],[{...base,days:60}])).toEqual(['express_monthly']);});


test('R08 revision accepts legacy absence but rejects corrupt or exhausted counters',()=>{const {nextMembershipRevision}=require('../membershipRevision');expect(nextMembershipRevision({})).toBe(1);expect(nextMembershipRevision({membershipRevision:5})).toBe(6);for(const value of [null,-1,0.5,'1',Number.MAX_SAFE_INTEGER])expect(()=>nextMembershipRevision({membershipRevision:value})).toThrow();});

test('D13 管理配置接受完整按次计价，拒绝缺失价格或包含时长',()=>{
  expect(()=>validatePrices({help:{billingMode:'per_visit',perVisit:3900,includedMinutes:30}})).not.toThrow();
  for(const help of [{billingMode:'per_visit',perVisit:3900},{billingMode:'per_visit',includedMinutes:30},{billingMode:'other'},{billingMode:'per_visit',perVisit:3900,includedMinutes:0}])expect(()=>validatePrices({help})).toThrow();
});
