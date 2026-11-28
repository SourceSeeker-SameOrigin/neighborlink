// Disposable tourist project only; no cloud, transfer, download or album writes.
const fs=require('fs'),path=require('path');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
if(JSON.parse(fs.readFileSync(path.join(project,'project.config.json'))).appid!=='touristappid')throw Error('Tourist only');
for(const dir of ['provider/earnings','provider/workbench','probe','utils'])fs.mkdirSync(path.join(project,dir),{recursive:true});
for(const dir of ['components','styles','templates','assets'])fs.cpSync('miniprogram/'+dir,path.join(project,dir),{recursive:true});
for(const name of ['money','time','privacy','subscriptions'])fs.copyFileSync('miniprogram/utils/'+name+'.js',path.join(project,'utils/'+name+'.js'));
fs.copyFileSync('miniprogram/app.wxss',path.join(project,'app.wxss'));
fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({pages:['provider/earnings/earnings','provider/workbench/workbench'],window:{navigationBarTitleText:'收入保护联调'}}));
fs.writeFileSync(path.join(project,'app.js'),"App({globalData:{user:{_id:'a',roles:['provider']},community:{features:{}}},async ensureSession(){return this.globalData.user;}});");
fs.writeFileSync(path.join(project,'utils/api.js'),"module.exports=require('../probe/qa125-api');");
fs.writeFileSync(path.join(project,'probe/qa125-api.js'),`
exports.fail=false;exports.writes=[];exports.records=[];
exports.save=(p,phase)=>{exports.records.push({page:p.route,phase,ready:p.data.ready,loading:p.data.loading,error:p.data.error,rows:(p.data.rows||[]).length,busy:!!(p.data.creatingPayout||p.data.savingPoster),writes:exports.writes.length});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa125-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,records:exports.records}),'utf8');};
exports.call=async(n,a)=>{if(exports.fail)throw Object.assign(Error('合成读取失败，请重试'),{code:'E_FORBIDDEN'});
if(a==='earnings')return{list:[{_id:'synthetic-income',amount:1000,createdAt:Date.now()}],pending:1000,settled:0,available:1000,canWithdraw:true,payoutEnabled:true,hasMore:false};
if(a==='list'||a==='myTasks')return{list:[],hasMore:false};if(a==='myStatus')return{provider:{_id:getApp().globalData.user._id,status:'approved',realName:'合成服务员',level:2,referralCode:'仅合成样例'},todayCount:0,todayIncome:0};
if(a==='create'||a==='referralPoster'){exports.writes.push({action:a,user:getApp().globalData.user._id});return a==='create'?{packageInfo:'synthetic'}:{tempFileURL:'synthetic'};}if(a==='subscriptionTemplates')return{};throw Error('Blocked '+a);};`);
for(const route of ['earnings','workbench']){
 for(const ext of ['json','wxml','wxss'])fs.copyFileSync(`miniprogram/provider/${route}/${route}.${ext}`,path.join(project,`provider/${route}/${route}.${ext}`));
 let js=fs.readFileSync(`miniprogram/provider/${route}/${route}.js`,'utf8').replace(/wx\./g,'testWx.').replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
 js="const testWx=Object.create(wx);testWx.showToast=()=>{};testWx.canIUse=()=>true;testWx.requestMerchantTransfer=o=>o.success({});testWx.downloadFile=o=>o.success({statusCode:200,tempFilePath:'synthetic'});testWx.saveImageToPhotosAlbum=o=>o.success({});\n"+js;
 js+=`
const shown=definition.onShow;definition.onShow=async function(){await shown.call(this);api.save(this,'shown');};
definition.qaFail=async function(){api.fail=true;await this.load(${route==='earnings'?'true':''});api.fail=false;api.save(this,'read-failed');};
const retry=definition.retry;definition.retry=async function(){await retry.call(this);api.save(this,'retry');};
definition.qaUser=async function(){getApp().globalData.user={_id:getApp().globalData.user._id==='a'?'b':'a',roles:['provider']};await this.${route==='earnings'?'createPayout':'saveReferralPoster'}();api.save(this,'changed-user');};
const act=definition.${route==='earnings'?'createPayout':'saveReferralPoster'};definition.${route==='earnings'?'createPayout':'saveReferralPoster'}=async function(){await act.call(this);await Promise.resolve();await Promise.resolve();api.save(this,'action');};
Page(definition);`;
 fs.writeFileSync(path.join(project,`provider/${route}/${route}.js`),js);
 const p=path.join(project,`provider/${route}/${route}.wxml`);fs.writeFileSync(p,'<view>本地合成，资金及相册写入0次</view><button bindtap="qaFail">模拟读取失败</button><button bindtap="qaUser">换人后尝试旧操作</button>'+fs.readFileSync(p,'utf8')+(route==='earnings'?'<navigator url="/provider/workbench/workbench">前往推荐码测试</navigator>':''));
}
console.log('Prepared synthetic income/poster fixture');
