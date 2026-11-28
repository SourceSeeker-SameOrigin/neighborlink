const { requiredFeatures, orderEnabled, requireOrderFeatures, requireLedgerFeatures } = require('../orderFeatures');
const { residentOrderActions } = require('../residentOrders');
const { adminOrderActions } = require('../adminOrders');

test.each([
  [{serviceCode:'express'},[]], [{serviceCode:'trash'},[]], [{serviceCode:'buy'},[]], [{serviceCode:'help'},[]],
  [{kind:'idle_purchase'},['idle','idleEscrow']], [{kind:'merchant'},['merchants']], [{kind:'event_signup'},['events']],
  [{serviceCode:'meal'},['elder']], [{serviceCode:'visit'},['elder']], [{serviceCode:'escort'},['elder']],
  [{serviceCode:'pet'},['pet']], [{serviceCode:'recycle'},['recycle']], [{serviceCode:'vacant'},['vacantHome']],
  [{serviceCode:'custom',taskPostId:'p'},['board']], [{kind:'membership_purchase',planCode:'visit_monthly'},['elder']],
  [{kind:'membership_purchase',planCode:'vacant_monthly'},['vacantHome']], [{planCode:'trash_monthly'},[]]
])('order requirements %j', (order, expected)=>expect(requiredFeatures(order)).toEqual(expected));

test('local override and all idle dependencies are required',()=>{
  const order={kind:'idle_purchase'};
  expect(orderEnabled(order,{features:{idle:true,idleEscrow:true}},{features:{idleEscrow:false}})).toBe(false);
  expect(orderEnabled(order,{features:{}},{features:{idle:true,idleEscrow:true}})).toBe(true);
  expect(orderEnabled({serviceCode:'help'},{features:{}},null)).toBe(true);
});
test('feature checks use the order community; core orders perform no lookup',async()=>{
 const server={feature:jest.fn()};await requireOrderFeatures(server,{serviceCode:'express'});expect(server.feature).not.toHaveBeenCalled();
 await requireOrderFeatures(server,{serviceCode:'pet',communityId:'source'});expect(server.feature).toHaveBeenCalledWith('pet','source');
});
test.each(['order','idle_sale','merchant_order','membership_sale'])('new settlement checks source %s in transaction',async refType=>{
 const get=jest.fn(async (table,id)=>table==='orders'?{communityId:'c',serviceCode:'pet'}:table==='config'?{features:{pet:true}}:{features:{pet:false}});
 await expect(requireLedgerFeatures(get,{refType,refId:'o',communityId:'c'})).rejects.toMatchObject({code:'E_FEATURE_OFF'});
 expect(get).toHaveBeenCalledWith('orders','o');expect(get).toHaveBeenCalledWith('communities','c');
});
test('new settlement rejects missing/mismatched source; core remains eligible',async()=>{
 await expect(requireLedgerFeatures(async()=>null,{refType:'order',refId:'o',communityId:'c'})).rejects.toMatchObject({code:'E_CONFIG'});
 await expect(requireLedgerFeatures(async()=>({communityId:'other'}),{refType:'order',refId:'o',communityId:'c'})).rejects.toMatchObject({code:'E_CONFIG'});
 await expect(requireLedgerFeatures(async()=>({communityId:'c',serviceCode:'help'}),{refType:'order',refId:'o',communityId:'c'})).resolves.toBeUndefined();
});
test('resident confirmation and administrator assignment stop before writes when off',async()=>{
 const feature=jest.fn(async()=>{throw Object.assign(Error('off'),{code:'E_FEATURE_OFF'});});
 const server={db:{},get:async()=>({_id:'o',serviceCode:'pet',communityId:'c',userOpenid:'actor'}),feature};
 await expect(residentOrderActions({},server).confirm({orderId:'o'},{openid:'actor'})).rejects.toMatchObject({code:'E_FEATURE_OFF'});
 await expect(adminOrderActions({},server).assign({orderId:'o'},{user:{roles:['admin']},openid:'a'})).rejects.toMatchObject({code:'E_FEATURE_OFF'});
 feature.mockClear();await expect(residentOrderActions({},server).confirm({orderId:'o'},{openid:'stranger'})).rejects.toMatchObject({code:'E_FORBIDDEN'});expect(feature).not.toHaveBeenCalled();
});

test('manual settlement creates no lock for disabled source and accepts core source; paid retry is idempotent',async()=>{
 const {adminSettlementActions}=require('../adminSettlements');
 const row={_id:'l',refType:'order',refId:'o',communityId:'c',amounts:{property:100},settled:{property:false},settlementIds:{}};
 const data={ledger:{l:row},orders:{o:{_id:'o',communityId:'c',serviceCode:'pet'}},config:{global:{features:{pet:false}}},communities:{c:{features:{}}},settlements:{}};
 const writes=[];
 const tx={collection:table=>({doc:id=>({get:async()=>({data:data[table]?.[id]||null}),update:async({data:patch})=>{writes.push([table,id,patch]);Object.assign(data[table][id],patch);},set:async({data:value})=>{writes.push([table,id,value]);data[table][id]={_id:id,...value};}})})};
 const server={db:{runTransaction:work=>work(tx)},get:async(t,id)=>data[t]?.[id],all:async()=>[row],command:{gte:()=>({and:()=>({})}),lt:()=>({})}};
 const api=adminSettlementActions({},server),context={user:{roles:['admin']},openid:'admin'};
 const input={payee:'property',communityId:'c',from:'2026-11-01',to:'2026-11-08'};
 await expect(api.settlementCreate(input,context)).rejects.toMatchObject({code:'E_FEATURE_OFF'});expect(writes).toEqual([]);
 data.orders.o.serviceCode='help';const result=await api.settlementCreate(input,context);expect(result.settlements).toHaveLength(1);expect(writes).toHaveLength(2);
 const settlement=result.settlements[0];row.settlementIds.property=settlement._id;data.orders.o.serviceCode='pet';writes.length=0;
 await expect(api.settlementMarkPaid({settlementId:settlement._id},context)).rejects.toMatchObject({code:'E_FEATURE_OFF'});expect(writes).toEqual([]);
 data.settlements[settlement._id].status='paid';await expect(api.settlementMarkPaid({settlementId:settlement._id},context)).resolves.toMatchObject({status:'paid'});expect(writes).toEqual([]);
});
