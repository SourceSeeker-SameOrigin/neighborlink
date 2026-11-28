// Actual admin detail page with synthetic read-only API responses. No cloud writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {runtime} = require('../2026-11-09-remediation/page-fixture.cjs');
const results=[];
async function test(name,fn){try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e.message})}}
async function page(patch={}){
 const order={status:'closed',kind:'service',pricing:{payAmount:100,goodsCap:0},detail:{placement:'door',bags:1,sorted:true},timeline:[{status:'pending_pay'},{status:'closed'}],refunds:[],...patch};
 const original=JSON.stringify(order),r=runtime(async(name,action)=>{assert.equal(name,'order');assert.equal(action,'detail');return order});
 r.app.globalData.user.roles=['admin'];const p=r.instance('miniprogram/admin/order/order.js');p.onLoad({id:'synthetic'});await p.load();assert.equal(p.data.error,'');assert.equal(JSON.stringify(order),original);assert.equal(r.requests.length,1);return p;
}
(async()=>{
 await test('closed unpaid quote is amount, no paid history',async()=>{const p=await page();assert.equal(p.data.amount,'1.00');assert.equal(p.data.paymentRecordText,'未见支付成功记录')});
 await test('pending payment not marked paid',async()=>assert.equal((await page({status:'pending_pay',timeline:[{status:'pending_pay'}]})).data.paymentRecordText,'未见支付成功记录'));
 await test('cancelled payment history remains payment fact with refund separate',async()=>{const p=await page({status:'cancelled',timeline:[{status:'paid'},{status:'cancelled'}],refunds:[{amount:100,status:'success'}]});assert.equal(p.data.paymentRecordText,'已记录支付成功（不代表真实扣款）');assert.equal(p.data.refunds[0].amountText,'1.00');assert.equal(p.data.refunds[0].statusText,'成功');assert.equal(p.data.amount,'1.00')});
 await test('zero fee history never claims cash charge',async()=>{const p=await page({pricing:{payAmount:0,goodsCap:0},timeline:[{status:'paid'}]});assert.equal(p.data.amount,'0.00');assert.match(p.data.paymentRecordText,/不代表真实扣款/)});
 for(const timeline of [undefined,[],[{status:'completed'}]] )await test('missing payment evidence stays unknown '+JSON.stringify(timeline),async()=>assert.equal((await page({timeline})).data.paymentRecordText,'未见支付成功记录'));
 for(const [value,text] of [['door','放门口'],['hand','当面交'],['future_value','future_value']])await test('placement '+value,async()=>assert.equal((await page({detail:{placement:value}})).data.details[0].value,text));
 await test('goods cap included without changing cents',async()=>assert.equal((await page({pricing:{payAmount:501,goodsCap:12345}})).data.amount,'128.46'));
 await test('processing failed refunds stay distinct and amounts unchanged',async()=>{const p=await page({refunds:[{amount:50,status:'processing'},{amount:25,status:'failed'}]});assert.deepEqual(Array.from(p.data.refunds,x=>[x.amountText,x.statusText]),[['0.50','处理中'],['0.25','失败']])});
 await test('template labels order amount and payment evidence, never quote as paid',async()=>{const s=fs.readFileSync('miniprogram/admin/order/order.wxml','utf8');assert.ok(s.includes('订单金额 ¥{{amount}}'));assert.ok(s.includes('支付记录：{{paymentRecordText}}'));assert.ok(!s.includes('实付 ¥{{amount}}'))});
 console.log(JSON.stringify({scope:'QA58 actual page synthetic read-only responses',total:results.length,passed:results.filter(x=>x.passed).length,results},null,2));if(results.some(x=>!x.passed))process.exitCode=1;
})();
