// Disposable guest project. Actual page + intercepted API/media; no cloud/camera writes.
const fs = require('fs'), path = require('path');
const project = fs.readFileSync('/tmp/jinlin-qa100-guest-path', 'utf8').trim();
if (JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'))).appid !== 'touristappid') throw Error('Tourist only');
for (const dir of ['merchant/orders', 'probe', 'utils']) fs.mkdirSync(path.join(project, dir), { recursive: true });
for (const dir of ['components', 'styles', 'templates', 'assets']) fs.cpSync('miniprogram/' + dir, path.join(project, dir), { recursive: true });
fs.copyFileSync('miniprogram/app.wxss', path.join(project, 'app.wxss'));
fs.copyFileSync('miniprogram/utils/money.js', path.join(project, 'utils/money.js'));
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({ pages: ['merchant/orders/orders'], window: { navigationBarTitleText: '商家订单合成联调' } }));
fs.writeFileSync(path.join(project, 'app.js'), "App({globalData:{user:{_id:'a',merchantId:'m',roles:['merchant']}},async ensureSession(){return this.globalData.user;}});");
fs.writeFileSync(path.join(project, 'utils/api.js'), "module.exports=require('../probe/qa127-api');");
fs.writeFileSync(path.join(project, 'utils/media.js'), "exports.uploadPhotos=async()=>['cloud://synthetic/merchant-orders/order-20/photo.jpg'];");
fs.writeFileSync(path.join(project, 'probe/qa127-api.js'), `
exports.fail=false;exports.pageFail=true;exports.writes=[];exports.records=[];exports.offsets=[];exports.done=false;
exports.save=(p,phase)=>{exports.records.push({phase,ready:p.data.ready,rows:p.data.list.length,busy:p.data.busy,error:p.data.error,pageError:p.data.pageError,hasMore:p.data.hasMore,writes:exports.writes.length,last:p.data.list.at(-1)?._id});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa127-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,offsets:exports.offsets,records:exports.records}),'utf8');};
exports.call=async(n,a,d)=>{if(a==='merchantOrders'){exports.offsets.push(d.offset);if(exports.fail)throw Object.assign(Error('合成读取失败，请重试'),{code:'E_FORBIDDEN'});if(d.offset&&exports.pageFail){exports.pageFail=false;throw Error('合成续页失败，请重试');}const rows=Array.from({length:21},(_,i)=>({_id:'order-'+i,orderNo:'TEST-'+(i+1),serviceName:'联调服务第'+(i+1)+'笔',status:i===20?(exports.done?'delivered':'in_service'):'completed',statusText:i===20?(exports.done?'待确认':'服务中'):'已完成',featureEnabled:true,detail:{category:'repair'},pricing:{payAmount:500},address:{buildingName:'合成楼栋',unit:'测试单元',room:'测试门牌'},note:'仅供界面测试，不履约'}));return{list:rows.slice(d.offset,d.offset+20),hasMore:d.offset+20<rows.length};}if(a==='completeBooking'){exports.writes.push({action:a,id:d.orderId,user:getApp().globalData.user._id});exports.done=true;return{};}throw Error('Blocked '+a);};`);
for (const ext of ['json','wxss','wxml']) fs.copyFileSync('miniprogram/merchant/orders/orders.' + ext, path.join(project, 'merchant/orders/orders.' + ext));
let js=fs.readFileSync('miniprogram/merchant/orders/orders.js','utf8').replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
js+=`
const shown=definition.onShow;definition.onShow=async function(){await shown.call(this);api.save(this,'shown');};
definition.qaFail=async function(){api.fail=true;await this.load();api.fail=false;api.save(this,'read-failed');};
definition.qaEnd=function(){wx.pageScrollTo({scrollTop:100000,duration:0});};
for(const method of ['retry','more','complete']){const original=definition[method];definition[method]=async function(...args){await original.apply(this,args);api.save(this,method);};}
Page(definition);`;
fs.writeFileSync(path.join(project,'merchant/orders/orders.js'),js);
const wxml=path.join(project,'merchant/orders/orders.wxml');
fs.writeFileSync(wxml,'<view>本地合成，真实履约0次</view><button bindtap="qaFail">模拟读取失败</button><button bindtap="qaEnd">查看列表底部</button>'+fs.readFileSync(wxml,'utf8'));
console.log('Prepared synthetic merchant order fixture');
