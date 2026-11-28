// Run with pptxgenjs on NODE_PATH. Does not change application dependencies.
const pptxgen = require('pptxgenjs');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(root,'docs/product/inventory.json')));
const p = new pptxgen(); p.layout='LAYOUT_WIDE'; p.author='近邻帮项目'; p.subject='产品、五端流程、技术架构与验收说明'; p.title='近邻帮 · 产品介绍'; p.company='近邻帮'; p.lang='zh-CN';
p.theme={headFontFace:'Arial Unicode MS',bodyFontFace:'Arial Unicode MS',lang:'zh-CN'};
const C={bg:'F7F6F1',ink:'202A23',green:'1F7A5C',dark:'184F38',sage:'EAF1E2',apricot:'FFF0D4',muted:'657164',white:'FFFFFF'};
const S=p.ShapeType; let n=0;
function text(s,t,x,y,w,h,size=19,color=C.ink,bold=false,extra={}){s.addText(t,{x,y,w,h,fontFace:'Arial Unicode MS',fontSize:size,color,bold,margin:0,breakLine:false,vertAnchor:'mid',...extra});}
function rect(s,x,y,w,h,fill=C.sage){s.addShape(S.roundRect,{x,y,w,h,rectRadius:.15,radius:.15,fill:{color:fill},line:{color:fill},radius:0.15});}
function base(title,sub='产品介绍 · 开发联调版',dark=false){const s=p.addSlide();s.background={color:dark?C.dark:C.bg};n++;text(s,title,.65,.48,12,0.66,36,dark?C.white:C.dark,true);text(s,sub,.68,1.2,11.8,.42,14,dark?'C6DEC9':C.muted);text(s,'近邻帮  /  产品与验收说明',.68,7.06,9,.2,10,dark?'C6DEC9':C.muted);text(s,String(n).padStart(2,'0'),12,7.02,.6,.25,11,dark?'C6DEC9':C.muted);s.addNotes('依据：仓库 docs/SPEC.md、SPEC_EXT.md、批准的D43/D44/D45及源码。此演示文稿介绍产品与实现，不表示全部功能已上线或全量验收通过。');return s;}
function card(s,title,body,x,y,w=3.8,h=1.85,fill=C.white,icon){rect(s,x,y,w,h,fill);let tx=x+.25;if(icon){const file=path.join(root,'miniprogram/assets/icons/'+icon+'.png');if(fs.existsSync(file)){s.addImage({path:file,x:x+.22,y:y+.2,w:.46,h:.46});tx=x+.84;}}text(s,title,tx,y+.23,w-(tx-x)-.22,.42,22,C.dark,true);text(s,body,x+.25,y+.86,w-.5,h-.98,17,C.ink,false,{valign:'top',paraSpaceAfterPt:8});}
function arrow(s,x1,y1,x2,y2,color=C.green){s.addShape(S.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width:2,beginArrowType:'none',endArrowType:'triangle'}});}
function steps(s,items,y=2.6){const w=(12-(items.length-1)*.36)/items.length;items.forEach((a,i)=>{const x=.68+i*(w+.36);rect(s,x,y,w,1.45,i%2?C.white:C.sage);text(s,String(i+1).padStart(2,'0'),x+.18,y+.15,.55,.35,15,C.green,true);text(s,a,x+.18,y+.62,w-.36,.55,18,C.dark,true);if(i<items.length-1)arrow(s,x+w+.04,y+.73,x+w+.31,y+.73);});}
function caption(s,t,y=6.35){text(s,t,.7,y,11.95,.5,16,C.muted);}
function grid(title,sub,items){const s=base(title,sub);items.forEach((a,i)=>card(s,a[0],a[1],.68+(i%3)*4.07,1.95+Math.floor(i/3)*2.25,3.8,2.0,i%2?C.sage:C.white,a[2]));return s;}
let s=base('近邻帮','把邻里小事，交给身边可信的人',true);text(s,'小区里的服务协作',.7,2.05,6.3,1.3,44,C.white,true);text(s,'住户 × 服务员 × 商家 × 驿站 × 管理与物业',.74,3.65,6.1,1.05,24,'DBEAD9');text(s,'产品介绍 / 业务流程 / 技术架构 / 验收边界',.74,5.3,6,.8,18,'C6DEC9');s.addImage({path:path.join(root,'miniprogram/assets/illustrations/neighborhood.png'),x:7.2,y:2.1,w:5.35,h:3.35});
s=grid('从一件小事，到完整的社区服务','产品价值来自本小区的履约协作，实际时效由人员与班次决定',[
 ['住户','减少跑腿和反复沟通；地址、订单、服务记录集中查看','home'],['服务员','经审核后接单，看到清晰时段、任务要求与收入','help'],['物业与运营','按小区组织服务，跟踪异常、投诉和经营数据','shield'],['周边商家','提供服务项目、报价与预约履约','shop'],['驿站','按住户同意批量配送，并核对件数和账单','express'],['社区关系','求助、闲置、活动与帮带形成邻里连接','board']]);
s=base('一套产品，五个工作区','一个微信账号可拥有多个获准角色；管理员与物业共用后台');
const roles=[['住户','默认身份'],['服务员','申请并审核'],['商家','入驻并审核'],['驿站','申请并审批'],['管理/物业','授权配置范围']];roles.forEach((r,i)=>{const x=.7+i*2.45;rect(s,x,2.25,2.22,2.3,i===4?C.apricot:C.sage);text(s,r[0],x+.2,2.75,1.82,.5,24,C.dark,true);text(s,r[1],x+.2,3.55,1.82,.55,16);});caption(s,'入口统一在“我的”；扫码和打开链接不授予角色。');
s=base('视觉基准：亲切、清楚、方便点按','原设计稿含旧授权文案；现行流程已改为手填电话，视觉风格保持一致');s.addImage({path:path.join(root,'docs/design/approved-ui.png'),x:3.15,y:1.8,w:7.1,h:5.05});text(s,'暖白底\n深绿主色\n浅绿服务卡\n暖杏月卡条',.7,2.35,2.1,2.4,24,C.dark,true);text(s,'正文 ≥32rpx\n主交互 ≥88rpx\n上下对齐\n长文案可读',10.62,2.35,2.1,2.4,20);s.addNotes('此页展示原批准设计稿。稿内的微信手机号授权文案已由D44改为手填未验证联系电话；此图不是最新程序截图，不可据图认为仍需授权。');
s=grid('核心服务：围绕日常四件事','价格由小区配置，服务端报价和创建订单时再次计算',[
 ['代取快递','驿站、取件码、件数与大件；门口或当面交付','express'],['代扔垃圾','袋数、分类确认、门口收取；支持周期月卡','trash'],['周边代买','服务费与商品预付款分开；小票核实后退差','buy'],['帮把手','搬运和生活协助，按预计时长计价；入户需二级服务员','help'],['月卡服务','快递额度、垃圾周期任务；支持探访与巡检扩展','ticket'],['订单售后','时间线、凭证、确认、评价和时限内投诉','orders']]);
s=grid('扩展服务：按小区准备情况开放','功能源码存在 ≠ 当前小区开通 ≠ 已完成真实验收',[
 ['助老与陪诊','送餐、独居探访、陪诊预约；班次、报告及证书约束','elder'],['喂宠与空房','多次上门记录、巡检清单、照片与入户信息保护','pet'],['回收与积分','分类称重、积分、服务员计件和企业对账','recycle'],['闲置与帮带','信息联系或担保交易；境外帮带仅信息模式','idle'],['商家与驿站','商家预约履约、驿站批量送上门','shop'],['内容与运营','活动、聊天、优惠券、公告、广告、联合社区','events']]);
s=base('完整目录可发现，开放状态清楚可见','19项扩展目录与核心服务；是否可办理仍由权限与配置决定');steps(s,['微信身份','选择并绑定小区','有效功能开关','角色或记录权限','业务入口'],2.25);card(s,'完整服务目录','可用项直达；未开通只说明，未绑定先完善资料',.7,4.35,5.8,1.65,C.white);card(s,'全局默认 + 小区覆盖','小区显式关闭仍优先；定位开启不自动开启其他模块',6.8,4.35,5.8,1.65,C.apricot);
s=base('先填资料，再把服务送到门口','手填联系电话即可；真实微信身份、有效门牌与协议仍保留');steps(s,['进入绑定页','小区、楼栋、单元','填写门牌与电话','同意协议并保存'],2.3);card(s,'失败与返回','格式或保存失败保留输入；允许返回首页，不循环强制绑定',.7,4.4,5.8,1.7);card(s,'绑定与赠券分离','资料和事件同事务；赠券异常提示门牌已保存，可本人重试',6.8,4.4,5.8,1.7,C.sage);s.addNotes('D44 / D45。当前旧云user仍可能返回授权提示，须完成获批110ebe8包部署后真实复验。');
s=base('定位：发现附近的小区','珺悦国际已获准新增；全局定位开启，示例数据保留');steps(s,['用户允许前台定位','查询3公里内合作小区','按距离选择小区','完善真实楼栋门牌'],2.2);card(s,'拒绝授权仍可用','定位失败或拒绝时退回完整列表，不阻止手动选择',.7,4.35,5.8,1.75);card(s,'配置与设备分别验收','公开中心坐标查询不等于手机实际定位通过；不采集后台持续位置',6.8,4.35,5.8,1.75,C.apricot);s.addNotes('公开坐标来源：https://www.amap.com/place/B000A8ZKTD 。天华大街9号院，lat 39.686298，lng 116.313420；新增社区无真实楼栋、价格和班次。');
s=base('下单到完成：每一步都有记录','展示目标流程，真实支付和跨角色闭环仍需配置与验收');steps(s,['填写需求','服务端报价','创建并支付','审核人员接单','履约与确认'],2.2);card(s,'开始前','门牌、时段、价格与服务等级校验；不能信任前端金额',.7,4.3,3.8,1.8);card(s,'服务中','接单后按权限显示联系方式；完成凭证和报告留存',4.77,4.3,3.8,1.8,C.sage);card(s,'完成后','评价、售后、账本与结算；异常有可追溯状态',8.84,4.3,3.8,1.8,C.apricot);
s=base('交易状态：支付、履约、售后各自清楚','待报价不自动过期；状态变更由服务端校验并防并发');steps(s,['待报价/待支付','待接单','服务中','待确认','已完成'],2.2);rect(s,3.6,4.55,6.1,1.1,C.apricot);text(s,'取消 / 关闭 / 投诉 / 退款：按原状态与时限处理',3.85,4.78,5.6,.65,21,C.dark,true);arrow(s,5.95,3.75,5.95,4.4);caption(s,'完整状态边见 README 状态图；退款成功和前端提示不是同一个时点。');
s=base('钱的流向：服务费与商品款分开','所有金额用整数分；示例配置不是珺悦国际的运营定价');card(s,'服务费','服务员报酬 / 物业分成 / 平台收入\n首单补贴不简单转嫁给服务员',.7,2.2,5.8,2.2,C.sage);card(s,'商品预付款','按小票核实实际商品金额\n多退差额，商品款不参与服务分成',6.8,2.2,5.8,2.2,C.apricot);steps(s,['订单完成','生成或冲减账本','人工结算 / 获准自动提现'],4.85);s.addNotes('依据SPEC §6/§11和SPEC_EXT E7；不承诺收入、GMV或商业回报。');
s=base('服务员：从审核到履约','邻居帮手一级、入户服务二级，特定项目另需证书');steps(s,['申请与审核','保险有效并值班','任务大厅接单','开始 / 凭证 / 完成','查看收入'],2.25);card(s,'接单前最小可见','只看楼栋、服务类型、时段和预计收入，不展示门牌与电话',.7,4.4,5.8,1.8);card(s,'接单后按关系开放','电话和门牌按订单授权；位置只在任务前台、指定状态共享',6.8,4.4,5.8,1.8,C.sage);
s=base('商家：固定价与报价制并存','通过入驻审核后管理服务与预约；开锁记录核验结果，不保存身份证照片');steps(s,['资料申请','管理员审核','上架服务','报价或直接付款','履约与确认'],2.3);card(s,'固定价','住户选择已上架项目并按固定价格预约',.7,4.5,5.8,1.6);card(s,'报价制','需求先进入待报价；商家报价后住户再付款',6.8,4.5,5.8,1.6,C.apricot);
s=base('驿站：同意在前，配送前再次复核','驿站审批范围与住户居住小区分开记录');steps(s,['审批驿站账号','住户主动同意','批量创建任务','服务员接批次','逐户确认与对账'],2.25);card(s,'住户可随时撤回','撤回后该户跳过并记录原因；不能由驿站替住户打开同意',.7,4.4,5.8,1.8);card(s,'月底按实际结果对账','逐户凭证与成功/失败/跳过状态可追溯，不按名单简单计费',6.8,4.4,5.8,1.8,C.sage);
s=grid('管理与物业：同一后台，不同权限','管理员可跨小区；物业受本小区和具体接口权限限制',[
 ['经营看板','订单、月卡、服务人员、来源漏斗与扩展指标','orders'],['审核准备','服务员、商家、驿站审核和功能准备','shield'],['异常处理','未接单、投诉、取消与退款，按权限和状态处理','support'],['小区配置','班次、楼栋、价格、合作点和功能开关','pin'],['内容运营','举报、公告、广告和活动；广告确认收款才记账','board'],['结算与导出','账本对账、角色范围和脱敏导出','ticket']]);
s=base('系统架构：小程序 + 云开发','原生前端；业务校验在后端；不另建网页后台');rect(s,.75,2.0,11.8,.75,C.sage);text(s,'69页 / 14分包  →  五端共用微信身份与云调用封装',1,2.15,11.3,.4,23,C.dark,true);arrow(s,6.65,2.85,6.65,3.2);rect(s,.75,3.3,11.8,.9,C.white);text(s,'21个云函数  +  共享定价、状态机、事务、排期和分账逻辑',1,3.55,11.3,.4,22,C.dark,true);[ ['33个数据库集合','业务数据与账本'],['私有云存储','凭证、审核与报告'],['微信平台能力','支付、审核、订阅、码']].forEach((a,i)=>{arrow(s,2.65+i*4,4.3,2.65+i*4,4.65);card(s,a[0],a[1],.75+i*4,4.8,3.8,1.5,i===2?C.apricot:C.sage);});
s=base('云函数如何参与一次操作','页面发请求，云函数判定，数据库保存，页面展示结果');steps(s,['页面 api.call','真实微信身份','角色 / 小区 / 开关','参数与业务校验','事务或外部接口'],2.25);card(s,'统一返回','成功：ok + data\n失败：错误码 + 中文提示；不能只在前端隐藏按钮',.7,4.45,5.8,1.7);card(s,'系统函数没有单独页面','支付/退款/审核回调与timer由平台触发，影响多个页面',6.8,4.45,5.8,1.7,C.sage);
s=base('支付时序：以服务端核实结果为准','付款页面返回成功，不等于订单数据库已经完成更新');
const cols=[1.7,4.8,8.0,11.1],labels=['住户页面','order / 数据库','微信支付','payCallback'];cols.forEach((x,i)=>{rect(s,x-.9,1.95,1.8,.65,C.sage);text(s,labels[i],x-.8,2.1,1.6,.35,16,C.dark,true);s.addShape(S.line,{x,y:2.7,w:0,h:3.65,line:{color:'B4C5AF',width:1,dash:'dash'}});});
[[0,1,'创建并重新定价'],[1,2,'创建支付单'],[0,2,'调起付款'],[2,3,'可信通知与查单核实'],[3,1,'幂等更新订单'],[0,1,'查询订单最终状态']].forEach((a,i)=>{let y=2.98+i*.53;arrow(s,cols[a[0]],y,cols[a[1]],y);text(s,a[2],Math.min(cols[a[0]],cols[a[1]])+.1,y-.24,Math.abs(cols[a[1]]-cols[a[0]])-.2,.22,12,C.ink);});
s=grid('数据与隐私：按业务需要开放','手填未验证电话不提升角色；测试不绕过真实身份',[
 ['身份可信','openid取微信上下文；客户端自报角色无效','shield'],['地址保护','大厅不暴露完整门牌；接单后按关系查看','home'],['私有图片','业务权限与归属校验后签发临时链接','shield'],['入户密码','加密、限日期/人员、读取审计，不本地持久保存','shield'],['内容治理','文字检查、图片异步审核、举报和处理记录','board'],['账目一致','事务、状态约束、幂等支付退款与结算','orders']]);
s=base('完整验收：页面和业务必须同时通过','69页只是覆盖范围；不能以源码样式检查替代真人实景');steps(s,['逐页对照设计稿','成功 / 空 / 错误状态','跨角色业务闭环','真机与权限拒绝','用户逐项签收'],2.2);card(s,'页面标准','字号、触达尺寸、上下对齐、键盘、安全区、长文本、恢复路径',.7,4.3,5.8,1.85);card(s,'流程标准','40规格场景 + 关闭回归 + 真实交易复测 + 后续批准修正',6.8,4.3,5.8,1.85,C.apricot);
s=base('当前进度：已有证据，仍有验收缺口','开发联调版；不要据此宣传为已正式上线');card(s,'已具备','69页源码、14分包、21云函数\n本轮592项单测与官方编译\n29项隔离入口回归',.7,2.05,5.8,2.7,C.sage);card(s,'仍待完成','其余云包、真实绑定与多角色\n模块配置、平台能力及真机\n完整交易与周期业务验收',6.8,2.05,5.8,2.7,C.apricot);caption(s,'珺悦国际由管理员维护真实楼栋；user旧批次已回读，main未合并。最新事实以仓库验收与部署记录为准。',5.65);
s=base('从开发联调走向试点','准备齐备后按顺序验证，不承诺未经核实的上线日期');steps(s,['代码部署核验','真实楼栋与运营配置','角色审批与模块准备','全量验收与整改','确认合并与发布'],2.25);card(s,'你决定','真实小区资料、角色授权、业务配置、费用与最终验收',.7,4.4,5.8,1.8);card(s,'我们交付','规格、代码、证据、完整待验收清单和可复查的缺口',6.8,4.4,5.8,1.8,C.sage);
// Function appendix: editable, complete 21-entry inventory.
const entries=Object.entries(inventory.functions);
for(let k=0;k<3;k++){s=base('附录：21个云函数 · '+(k+1)+'/3','完整页面调用索引见 docs/product/CLOUD_FUNCTIONS.md');entries.slice(k*7,k*7+7).forEach(([name,[title,desc,where]],i)=>{const y=1.95+i*.63;rect(s,.7,y,2.25,.51,i%2?C.white:C.sage);text(s,name,.85,y+.09,1.95,.3,15,C.dark,true);text(s,title,3.18,y+.07,2.2,.36,17,C.dark,true);text(s,where,5.55,y+.03,6.95,.52,13,C.ink);});s.addNotes(entries.slice(k*7,k*7+7).map(([a,b])=>a+'：'+b[1]).join('\n'));}
s=base('把每一个入口，都交付成可验收的服务','产品完整性由实际使用结果证明',true);text(s,'统一设计\n可信身份\n清晰履约\n可追溯售后',.8,2.1,5.8,3.7,40,C.white,true);rect(s,7,2.2,5.4,3.4,'EAF1E2');text(s,'交付资料',7.35,2.6,4.7,.5,26,C.dark,true);text(s,'README：架构、流程与使用\n云函数说明：21函数 / 69页映射\n验收册：UI + 功能逐项签收\n测试交接：业务场景与待准备项',7.35,3.45,4.7,1.65,20,C.ink);
p.writeFile({fileName:path.join(root,'docs/product/jinlin-product-introduction.pptx')});
console.log('slides='+n);
