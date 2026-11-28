// Actual page in disposable tourist project; API/media intercepted, no business writes.
const fs=require('fs'),path=require('path');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
if(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).appid!=='touristappid')throw Error('Tourist only');
for(const dir of ['merchant/services','probe','utils'])fs.mkdirSync(path.join(project,dir),{recursive:true});
for(const dir of ['components','styles','templates','assets'])fs.cpSync('miniprogram/'+dir,path.join(project,dir),{recursive:true});
fs.copyFileSync('miniprogram/app.wxss',path.join(project,'app.wxss'));
fs.copyFileSync('miniprogram/utils/money.js',path.join(project,'utils/money.js'));
fs.copyFileSync('miniprogram/utils/media-links.js',path.join(project,'utils/media-links.js'));
fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({pages:['merchant/services/services'],window:{navigationBarTitleText:'服务管理合成联调'},usingComponents:{'private-media':'/components/private-media/index'}}));
fs.writeFileSync(path.join(project,'app.js'),"App({globalData:{user:{_id:'a',merchantId:'m',roles:['merchant']}},async ensureSession(){return this.globalData.user;}});");
fs.writeFileSync(path.join(project,'utils/api.js'),"module.exports=require('../probe/qa129-api');");
fs.writeFileSync(path.join(project,'utils/media.js'),"exports.uploadPhotos=async()=>[];");
fs.writeFileSync(path.join(project,'probe/qa129-api.js'),`
exports.fail=false;exports.pageFail=true;exports.writes=[];exports.records=[];exports.offsets=[];
exports.save=(p,phase)=>{exports.records.push({phase,ready:p.data.ready,rows:p.data.list.length,busy:p.data.busy,error:p.data.error,pageError:p.data.pageError,hasMore:p.data.hasMore,title:p.data.title,last:p.data.list.at(-1)?._id});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa129-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,offsets:exports.offsets,records:exports.records}),'utf8');};
exports.call=async(n,a,d)=>{if(a==='myServices'){exports.offsets.push(d.offset);if(exports.fail)throw Object.assign(Error('合成读取失败，请重试'),{code:'E_FORBIDDEN'});if(d.offset&&exports.pageFail){exports.pageFail=false;throw Error('合成续页失败，请重试');}const rows=Array.from({length:101},(_,i)=>({_id:'service-'+i,title:'联调服务第'+(i+1)+'项',desc:'仅供页面验收，不提供真实服务',status:'off',priceType:'fixed',price:500,unit:'次',images:[]}));const list=rows.slice(d.offset,d.offset+20);return{list,nextOffset:d.offset+list.length,hasMore:d.offset+list.length<rows.length};}if(a==='upsertService'){exports.writes.push({action:a,user:getApp().globalData.user._id,title:d.title});return{};}throw Error('Blocked '+a);};`);
for(const ext of ['json','wxss','wxml'])fs.copyFileSync('miniprogram/merchant/services/services.'+ext,path.join(project,'merchant/services/services.'+ext));
let js=fs.readFileSync('miniprogram/merchant/services/services.js','utf8').replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
js+=`
const shown=definition.onShow;definition.onShow=async function(){await shown.call(this);api.save(this,'shown');};
definition.qaFail=async function(){this.setData({title:'本人的合成草稿'});api.fail=true;await this.load();api.fail=false;api.save(this,'read-failed');};
definition.qaEnd=function(){wx.pageScrollTo({scrollTop:100000,duration:0});};
definition.qaTop=function(){wx.pageScrollTo({scrollTop:0,duration:0});};
definition.qaSwitch=async function(){getApp().globalData.user={_id:'b',merchantId:'other',roles:['merchant']};await this.save();await new Promise(r=>setTimeout(r,100));api.save(this,'old-save');};
for(const method of ['retry','more']){const original=definition[method];definition[method]=async function(...args){await original.apply(this,args);api.save(this,method);};}
Page(definition);`;
fs.writeFileSync(path.join(project,'merchant/services/services.js'),js);
const wxml=path.join(project,'merchant/services/services.wxml');
fs.writeFileSync(wxml,'<view>本地合成，真实保存0次</view><button bindtap="qaFail">模拟读取失败</button><button bindtap="qaEnd">查看列表底部</button><button bindtap="qaSwitch">换人后尝试旧保存</button>'+fs.readFileSync(wxml,'utf8')+'<button bindtap="qaTop">回到表单</button>');
console.log('Prepared synthetic merchant services fixture');
