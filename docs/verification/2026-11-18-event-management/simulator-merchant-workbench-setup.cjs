// Disposable tourist-only fixture. Actual page/template/styles; no cloud API available.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'jinlin-qa131-'));
for (const dir of ['merchant/workbench', 'utils', 'probe', 'assets/icons']) fs.mkdirSync(path.join(project, dir), { recursive: true });
fs.writeFileSync(path.join(project, 'project.config.json'), JSON.stringify({
  appid: 'touristappid', projectname: 'jinlin-qa131-local', compileType: 'miniprogram',
  miniprogramRoot: './', setting: { es6: true, minified: false, urlCheck: false }
}));
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({
  pages: ['merchant/workbench/workbench', 'probe/away'],
  window: JSON.parse(fs.readFileSync('miniprogram/app.json', 'utf8')).window
}));
fs.writeFileSync(path.join(project, 'app.js'), "App({globalData:{user:{_id:'qa-A'}},async ensureSession(){return this.globalData.user;}});");
fs.copyFileSync('miniprogram/app.wxss', path.join(project, 'app.wxss'));
fs.copyFileSync('miniprogram/assets/icons/shop.png', path.join(project, 'assets/icons/shop.png'));
fs.copyFileSync('miniprogram/utils/status-labels.js', path.join(project, 'utils/status-labels.js'));
fs.writeFileSync(path.join(project, 'utils/api.js'), `
exports.fail=false; exports.records=[];
exports.call=async(name,action)=>{
  if(name!=='merchant'||action!=='myApplication')throw Error('禁止真实业务调用');
  if(exports.fail)throw Object.assign(Error('合成读取失败，请重试'),{code:'E_FORBIDDEN'});
  return {merchant:getApp().globalData.user._id==='qa-A'?{_id:'qa-merchant-A',name:'合成商家甲',status:'approved'}:null};
};
exports.save=(page,phase)=>{exports.records.push({phase,width:wx.getWindowInfo().windowWidth,loading:page.data.loading,error:page.data.error,merchant:page.data.merchant&&page.data.merchant._id});};
`);
for (const ext of ['json', 'wxss', 'wxml']) fs.copyFileSync('miniprogram/merchant/workbench/workbench.' + ext, path.join(project, 'merchant/workbench/workbench.' + ext));
let js = fs.readFileSync('miniprogram/merchant/workbench/workbench.js', 'utf8').replace('Page({', 'const definition={').replace(/\}\);\s*$/, '};');
js += `
const originalLoad=definition.load;
definition.load=async function(){await originalLoad.call(this);api.save(this,'load');};
definition.qaFail=async function(){api.fail=true;await this.load();api.fail=false;};
definition.qaSwitch=async function(){getApp().globalData.user={_id:getApp().globalData.user._id==='qa-A'?'qa-B':'qa-A'};await this.load();};
definition.qaLeave=function(){wx.navigateTo({url:'/probe/away'});};
Page(definition);
`;
fs.writeFileSync(path.join(project, 'merchant/workbench/workbench.js'), js);
const template = path.join(project, 'merchant/workbench/workbench.wxml');
fs.appendFileSync(template, '<view class="page"><view>仅本地合成测试，无云端写入</view><button bindtap="qaFail">模拟读取失败</button><button bindtap="qaSwitch">切换合成身份</button><button bindtap="qaLeave">离开后返回</button></view>');
fs.writeFileSync(path.join(project, 'probe/away.js'), 'Page({back(){wx.navigateBack();}});');
fs.writeFileSync(path.join(project, 'probe/away.json'), '{}');
fs.writeFileSync(path.join(project, 'probe/away.wxml'), '<view class="page"><button bindtap="back">返回工作台</button></view>');
console.log(project);
