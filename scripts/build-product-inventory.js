// Read-only source inventory. Does not execute pages or claim live acceptance.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), mini = path.join(root, 'miniprogram');
const read = p => fs.readFileSync(p, 'utf8');
const app = JSON.parse(read(path.join(mini, 'app.json')));
const routes = [...app.pages, ...app.subPackages.flatMap(p => p.pages.map(x => p.root + '/' + x))];
const functions = {
 user: ['身份与服务资料', '微信登录、手填电话与门牌绑定、扫码来源、新人赠券重试', '首页、绑定、我的、优惠券；全局应用及需身份的业务页面'],
 catalog: ['小区服务目录', '小区/楼栋/价格/班次查询、附近3公里小区、楼栋与推荐码解析', '绑定页、首页、全部下单页、管理配置'],
 order: ['交易主干', '报价、创建、支付重试、列表详情、取消、确认、评价、投诉、报告订阅', '核心/助老/回收等下单页、我的订单与详情'],
 provider: ['服务员履约', '申请、审核状态、值班、大厅、接单/放弃/开始/完成、收入、前台位置', '服务员5页；订单详情展示履约结果'],
 membership: ['周期服务', '月卡方案、购买、我的月卡、跳过今天任务', '月卡页；垃圾/快递/探访/空置房月卡共用'],
 admin: ['运营与物业管理', '看板、订单售后、服务员审核、小区/开关/楼栋、海报码、结算、导出', 'admin分包；物业只可操作规格允许的本小区功能'],
 board: ['邻里互助', '求助、悬赏、出行帮带的列表、详情、发布、评论、关闭、举报', '需求广场3页；悬赏交易复用order/provider'],
 idle: ['闲置交易', '信息发布、联系、担保购买、卖家接单交付、收入与商品状态', '闲置7页；担保售后复用订单处理'],
 event: ['社区活动', '创建/审核/发布、报名、签到、取消与异步退款任务管理', '活动列表、详情、活动管理'],
 chat: ['站内会话', '打开会话、发送、拉取、未读、标记已读、授权审计查看', '消息列表/聊天页、订单和闲置联系入口、后台审计'],
 coupon: ['优惠券', '领券中心、领取、我的券、模板管理、管理员发券', '优惠券2页、后台模板页；积分计算在共享交易/回收逻辑内'],
 payout: ['提现转账', '服务员/卖家提现申请、锁定账本、查询转账状态', '服务员收入、卖家收入；启用autoPayout且商户配置齐备'],
 merchant: ['商家预约', '入驻/审核、商家和服务查询、服务管理、预约报价与履约', '商家4页、住户商家3页、后台商家审核'],
 station: ['驿站批量配送', '账号申请审核、住户同意、创建批次、接批次、逐户复核、配送与对账', '驿站5页、我的送上门开关、服务员大厅、后台驿站审核'],
 content: ['社区内容运营', '公告、广告、曝光点击、确认广告收款、举报与内容/用户治理', '首页、公告、广场/商家广告位、后台内容和举报页'],
 pet: ['喂宠上门记录', '每次上门任务、授权读取入户信息、完成或漏做记录', '喂宠工作页/记录页；下单仍由order创建'],
 vacant: ['空置房报告', '授权读取入户信息、提交逐项巡检报告、订阅报告', '服务员任务详情、住户订单详情；购买复用membership'],
 timer: ['定时补偿与排期', '支付超时、未接单提醒、自动确认、月卡排期、退款/提现查单、活动退款分批等', '后台定时触发；无独立页面，不可由普通用户调用'],
 payCallback: ['支付结果入口', '可信支付通知、查单校验、幂等更新订单/月卡/资格', '微信支付系统回调；前端支付成功提示不能替代它'],
 refundCallback: ['退款结果入口', '核实退款结果、幂等更新退款与关联业务', '微信支付系统回调；用户从订单详情查看结果'],
 mediaCallback: ['媒体审核结果', '接收并核验异步图片审核结果，更新媒体可见性', '平台消息推送；影响图片显示，无独立页面']
};
function deps(file, seen = new Set()) {
 if (seen.has(file) || !fs.existsSync(file)) return [];
 seen.add(file); const src = read(file), result = [{ file, src }];
 for (const m of src.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
  let p = path.resolve(path.dirname(file), m[1]); if (!p.endsWith('.js')) p += '.js';
  if (p.startsWith(mini)) result.push(...deps(p, seen));
 }
 return result;
}
const old = JSON.parse(read(path.join(root,'docs/verification/2026-11-08-ui/page-coverage.json')));
// These dispatch targets were checked against each handler's allowlist/call sites.
const dynamicCalls = {
 'pages/orders/detail': ['order.confirm','order.rate','order.complain'],
 'provider/task/task': ['provider.start','provider.release','provider.deliver'],
 'admin/order/order': ['admin.assign','admin.forceCancel','admin.retryRefund','admin.resolveComplaint','admin.voidMembership'],
 'admin/providers/providers': ['admin.reviewProvider','admin.suspendProvider','admin.setInsurance','admin.setCerts','admin.cleanupProviderKyc'],
 'admin/exports/exports': ['catalog.listCommunities','admin.listProviders','merchant.adminList','admin.exportCsv','admin.exportSubsidyOrders','admin.exportRecyclerStatement','station.exportStatement'],
 'events/manage/manage': ['event.publish','event.cancelEvent','event.retryCancellation']
};
const pages = routes.map((route,i) => {
 const xml = read(path.join(mini,route+'.wxml'));
 const calls = [...new Set(deps(path.join(mini,route+'.js')).flatMap(({src}) => [...src.matchAll(/\bapi\.call\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)].map(m=>m[1]+'.'+m[2])))].sort();
 for (const call of dynamicCalls[route] || []) if (!calls.includes(call)) calls.push(call);
 calls.sort();
 const handlers = [...new Set([...xml.matchAll(/(?:bind|catch)(?::)?[a-z]+\s*=\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map(m=>m[1]))];
 const feature = ({board:'board / travelCarry',idle:'idle / idleEscrow',events:'events',chat:'chat',coupons:'coupons',pet:'pet',merchant:'merchants',shops:'merchants',station:'stationDelivery',elder:'elder',recycle:'recycle / points',notices:'notices'})[route.split('/')[0]] || '核心或按操作关联模块';
 const role = route.startsWith('admin/')?'管理员；物业按接口与小区限制':route.startsWith('provider/')?'申请页为住户；工作页需已审服务员':route.startsWith('merchant/')?'申请页为住户；工作页需已审商家':route.startsWith('station/')?'住户申请／驿站／服务员，按页面核验':route==='events/manage/manage'?'管理员／物业／商家':route==='pet/work'?'该订单已接单服务员':'真实微信用户，业务页需对应绑定/参与关系';
 const previous=old.find(p=>p.route===route);
 return {id:'P'+String(i+1).padStart(2,'0'),route,title:JSON.parse(read(path.join(mini,route+'.json'))).navigationBarTitleText,role,feature,calls,handlers,visual:previous?.liveVisualStatus.includes('observed')?'已有模拟器截图；用户验收待做':'待实景核查',business:'待完整业务验收'};
});
const out=path.join(root,'docs/product');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify({scope:'Source dependency reachability plus reviewed dynamic dispatch targets, not a runtime trace; app.ensureSession calls user.login globally',functions,pages},null,2)+'\n');
let fn='# 云函数用途与调用位置\n\n云函数是在腾讯云运行的后端程序。小程序把操作交给它；它验证身份、权限、开关和参数，再读写数据或调用微信能力。小程序端不掌握支付密钥，也不能直接写业务数据库。\n\n一个云函数包含多个 action。页面≠函数：一个订单详情会调用多个函数，多个下单页共用 order。21 个函数不是 21 个用户入口。以下用途人工核对入口源码；调用表按页面及其本地依赖的字面量 api.call 生成，并人工补齐当前6页动态分发目标；这是源码可达关系，不等于所有运行路径已实测。\n\n|函数|作用|在哪使用|\n|---|---|---|\n';
for(const [name,[title,desc,where]] of Object.entries(functions)) fn+=`|[${name}](../../cloudfunctions/${name}/index.js) · ${title}|${desc}|${where}|\n`;
fn+='\n## 页面到后端的调用索引\n\n全局应用及需身份的业务页面通过 app.ensureSession 共用 user.login；下表另列可静态追踪的业务调用（包含公用表单/支付辅助函数）。受分支控制的调用不代表打开该页就全部执行。\n\n|页面|接口|\n|---|---|\n';for(const p of pages)fn+=`|${p.id} [${p.title}](../../miniprogram/${p.route}.js)|${p.calls.join('、')||'无字面量业务调用；静态内容或共用登录'}|\n`;
fn+='\n## 三类系统触发\n\n```mermaid\nflowchart LR\n W[微信支付] --> P[payCallback]\n W --> R[refundCallback]\n M[微信内容安全] --> C[mediaCallback]\n T[获准启用的定时触发器] --> F[timer]\n P --> DB[(订单、月卡、账本等)]\n R --> DB\n C --> S[(媒体状态与内容)]\n F --> DB\n```\n\n部署了函数不等于触发器、回调或权限已配置。timer 的本轮授权仅更新代码，不启用触发器。不要在控制台随意模拟支付回调来代替真实交易验收。\n';
fs.writeFileSync(path.join(out,'CLOUD_FUNCTIONS.md'),fn);
let doc='# 全页面 UI 与功能验收册\n\n本册按 app.json 枚举全部69页。目标是逐页视觉符合设计、逐流程功能闭环；当前不是全量通过报告。原40个规格场景、15个关闭回归和4个真实支付场景继续以 [TEST_HANDOFF](../TEST_HANDOFF.md) 为准，不能被本册替代。\n\n## 验收标准与记录规则\n\n|维度|要求|\n|---|---|\n|What|69页的视觉、入口、权限、成功/失败/恢复流程，以及所有跨页业务闭环|\n|Why|静态编译不证明页面观感，空列表不证明订单履约成功|\n|Who|代理执行技术与界面验证；用户确认视觉和业务结果；真实角色由授权管理员审核|\n|When|新版部署→配置/身份准备→逐页→跨角色闭环→真机→用户确认合并|\n|Where|本地开发分支、指定开发云、微信开发工具及用户真机；不在生产测试|\n|How|每项记录版本、设备、角色、输入、预期、实际、截图/请求ID、通过/失败/阻塞；用户签收单列|\n|How much|工作量随角色/配置齐备程度变化，尚不能确定完成时长；不自动付费|\n\n### 每页都要检查的 UI 项\n\n- U1 对照批准设计稿：色彩、标题、图标、卡片、分组和主次按钮，不能仅换色。\n- U2 状态栏/按钮文字横纵居中；单行输入框文字居中、不裁切；多行输入仍按正常顶端排版。\n- U3 正文≥32rpx、主交互高度≥88rpx，长文案/长小区名不越界。\n- U4 320/375/390/430逻辑像素宽度、系统大字体、键盘弹起、安全区和底部价格栏不遮挡最后字段。\n- U5 加载、空结果、错误、重试、禁用、提交中有正确反馈；颜色和可读性一致。\n- U6 返回、tab切换、重进、下拉刷新不丢失应保留的输入、不重复提交。\n- U7 完整目录可用/未开通/待资料与工作台资格状态明确；无权限按钮不误露，直达接口仍拒绝。\n\n### 每页都要检查的功能项\n\n- F1 正常输入成功，刷新后云端记录一致；至少一次真实成功，不能只看空页。\n- F2 必填/格式/边界/协议错误，服务端拒绝且无错误写入。\n- F3 断网、慢响应、乱序、重试、重复点击，避免重复创建/支付/退款。\n- F4 切换小区/地址、过期状态、撤销角色或关闭功能，页面和接口结果一致。\n- F5 从真实入口到达并返回；详情参数不存在/越权/已删除时明确提示。\n- F6 涉及金额、文件、位置、订阅、扫码等能力时验证真实平台结果与权限拒绝。\n\n## 69页逐项台账\n\n每行 U1–U7、F1–F6 均需逐项填写；不适用必须说明原因。表中“已有截图”不等于用户签收或全部状态已通过。\n\n|编号|页面/路径|角色与前置|开关|当前视觉记录|完整业务|用户签收|\n|---|---|---|---|---|---|---|\n';
for(const p of pages)doc+=`|${p.id}|${p.title}<br>${p.route}|${p.role}|${p.feature}|${p.visual}|${p.business}|待确认|\n`;
for(const p of pages){doc+=`\n### ${p.id} ${p.title}\n\n- 路径：${p.route}。前置：${p.role}；${p.feature}。\n- 页面操作清点：${p.handlers.join('、')||'静态阅读与系统返回'}。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。\n- 后端关联：${p.calls.join('、')||'静态页面/共用登录'}。\n- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。\n`;}
doc+='\n## 当前必须保留的验收缺口\n\n1. 110ebe8批次user已部署并回读72文件一致，另7包待继续；R01–R08新修复尚待具体新包部署。真实手填成功与重进持久化仍须验收。\n2. 珺悦国际真实楼栋、单元由管理员手填维护，住户仍选择；价格、班次和服务人员未提供；不能复制示例数据冒充真实小区。\n3. 管理员/物业/服务员/商家/驿站角色准备及跨账号测试尚未完成；D07未自动解除。\n4. 非定位扩展开关不因本次任务自动打开；模块数据、内容安全、订阅模板与密钥按原决策逐项配置。\n5. D05–D07暂缓，真实支付/退款/提现与timer周期结果不能宣称通过。\n6. 定位必须分别验证数据库开关/坐标、catalog查询、设备授权与拒绝、近/远距离、订单前台共享及停止；公开中心坐标查询不等于手机实际定位成功。\n7. 真机大小屏、系统大字体及69页所有内容状态仍须实景验证。\n';
fs.writeFileSync(path.join(out,'PAGE_ACCEPTANCE.md'),doc);
console.log(JSON.stringify({pages:pages.length,functions:Object.keys(functions).length,files:['inventory.json','CLOUD_FUNCTIONS.md','PAGE_ACCEPTANCE.md']}));
