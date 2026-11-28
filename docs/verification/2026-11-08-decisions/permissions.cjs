const fs = require('fs'), assert = require('assert');
const safety = ['security.msgSecCheck','security.mediaCheckAsync'];
const expected = {
 admin:['wxacode.getUnlimited','subscribeMessage.send'], board:[...safety,'subscribeMessage.send'], catalog:[], chat:safety,
 content:safety, coupon:[], event:[...safety,'subscribeMessage.send','wxacode.getUnlimited'], idle:safety,
 mediaCallback:[], membership:[], merchant:safety, order:['security.msgSecCheck','subscribeMessage.send'],
 payCallback:['subscribeMessage.send'], payout:[], pet:['subscribeMessage.send'], provider:['subscribeMessage.send','wxacode.getUnlimited'],
 refundCallback:[], station:[], timer:['subscribeMessage.send'], user:['phonenumber.getPhoneNumber'], vacant:['subscribeMessage.send']
};
const reasons={
 admin:'海报码及管理通知；聊天导入模块不等于管理员发送 UGC',board:'帖子/评论文本及图片审核；零元或模拟支付任务通知',
 catalog:'仅读取配置和二维码解析',chat:'聊天文本和图片审核',content:'公告/广告文本及图片审核',coupon:'券配置/发放无 openapi 调用',
 event:'活动内容审核、签到二维码和模拟支付后的活动通知',idle:'闲置内容审核；交易 kind 不触发服务任务通知',
 mediaCallback:'接收审核回调，不发起内容安全请求',membership:'月卡付款激活无服务订单通知分支',merchant:'商家服务及预约文本、图片审核',
 order:'下单/评价/投诉文本审核及服务通知',payCallback:'真实付款后新任务与回收住户通知',payout:'签名请求微信支付 HTTP API，不是 openapi 云调用',
 pet:'喂宠履约住户通知',provider:'接单/完成住户通知与推荐码生成；没有可达文本审核调用',refundCallback:'退款回调不触发付款通知分支',
 station:'驿站申请及配送当前无 openapi 调用',timer:'自动补偿与定时通知；本批不启用触发器',user:'真实手机号 code 换取手机号',vacant:'巡检报告通知'};
const rows=Object.entries(expected).map(([name,apis])=>{const actual=JSON.parse(fs.readFileSync(`cloudfunctions/${name}/config.json`)).permissions?.openapi||[];assert.deepStrictEqual([...actual].sort(),[...apis].sort(),name);return {name,apis,reason:reasons[name],cloudEffectivePermission:'未核验',realApiCall:'未验收'};});
fs.writeFileSync('docs/verification/2026-11-08-decisions/permissions.json',JSON.stringify({functions:rows.length,scope:'源码声明与调用分支核对；不代表云端授权已生效',rows},null,2)+'\n');
console.log('PASS: '+rows.length+' function permission declarations');
