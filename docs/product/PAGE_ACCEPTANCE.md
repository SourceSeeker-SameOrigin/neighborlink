> **2026-11-12最新结果（覆盖下方历史暂停/待验描述）**：QA51已按A修复七个服务页，63项前端隔离测试及390宽七页恢复卡片/按钮实点通过；该界面场景为本地注入，不是新建七类订单。真实会话对既有两笔终态订单重复mockPay/cancel共12次，订单/退款/时间线及付款统计不变。QA49首页卡片320/375/390/430矩形均测得同排等高。53套624单测、19项后端幂等、42项关联交互、69页207组加载及最终官方编译通过。69页完整UI/业务、真实并发/回调、D06云端加解密仍待验；本批无新增云包、未合并main。 [本轮完整证据](../verification/2026-11-12-mock-orders/README.md)。

> **最新续验（2026-11-12，模拟订单已收尾）**：D05/D06已恢复；QA50十二函数已部署并完成912/912源码回读。用户真机创建2笔垃圾单：未付款取消为closed；第二笔mock付款100分后取消为cancelled，100分模拟退款success。云端确认共2笔且均未分配，付款次数1及首单记录保留；列表分类/详情往返和退款显示已核对。重复请求幂等、真实支付退款、接单履约及69页完整UI仍未通过。见[本批证据](../verification/2026-11-12-mock-orders/README.md)。下方旧暂停/待部署/0笔描述为历史阶段记录。

> **最新续验（2026-11-11，QA43–QA47）**：五项A方案已实施并同步规格；15组新回归、39组关联回归、53套624项Jest、77WXML/78WXSS官方编译及69页207组隔离加载通过。真实首页/门牌点击区域、服务员申请初始化及上下屏、回收到导出条件回显已核对所述样本；没有上传证件、提交申请或生成CSV。本批仅前端，无新增云包。完整69页UI/业务尚未完成，D05/D06暂停；最新证据及逐页剩余项见[本轮记录](../verification/2026-11-11-ui-audit/README.md)。 QA46新版表单上屏和日期打开/确认已看，改日期及底部入口重验未完成；QA47三个筛选选中态/说明/空态已实测。

> **最新续验（2026-11-11，QA40–QA42）**：QA40五页读取保护、QA41商家/服务分页、QA42导出空选择器均已按A完成本地整改；13项复现转通过，15项扩展回归、24项导出关联回归、53组624项Jest及77WXML/78WXSS官方编译通过。QA41 merchant新包已部署，云端76/76源码一致且依赖存在；真实会话4项空分页/非法偏移检查通过；非空分页及最新6页真实UI未完成；69页整体未通过，D05/D06暂停。

> **最新续验（2026-11-11，QA38/QA39）**：两段用户录屏补齐数据导出四类型切换、返回再进入；物业/卖家及养老CSV查看器打开，回收/驿站显示功能未开放。仅见表头，不等于原文件内容或非空账目通过。QA38错误分类/过期提示、QA39表单设计均获A批准并修复；9组新回归、15组关联回归、53组624项Jest、77WXML/78WXSS官方编译通过。新版实景仍待验，69页整体未完成；D05/D06暂停，无新增云函数包，main未合并。

> **最新（2026-11-10，QA25/QA30/QA31）**：12个缺编号返回按钮已全部实点；服务员为未申请状态，驿站配送无权限回首页。喂宠曾偶发空白，QA30已批准先真机与模拟器对照，根因未定；专用模式模拟器正常；用户iPhone 16 Pro Max首次扫码、返回未申请工作台及再次扫码正常，本次未复现空白。QA31定位说明43字导致官方预览80058，按批准改为28字后官方预览成功；主包681861字节、14分包、总包1051549字节；52组614单测通过。69页897项仍未全验，D05/D06暂停，未合并main。

# 全页面 UI 与功能验收册

### 11 月 16 日补验（QA88–QA90）

|页面|本轮已验证|仍待实际业务验收|
|---|---|---|
|P52 喂宠上门清单、P53 喂宠服务记录|隔离环境验证首访照片、末次视频、登记漏次、重复请求及 30 次上门边界。开发云 pet 已回读 76/76。|有指派的体验账号在服务日实际提交，住户手机打开对应照片并播放视频。|
|P30 商家入驻审核、P54 商家入驻|真实 merchant.review 代码与合成账号验证审核、驳回、重试、申请人变化和角色权限。|开发云 merchant 已回读 76/76。待用获准的测试申请核对管理员审核、申请人手机刷新及服务管理入口。|
|P08 订单详情|合成推荐首单完成及重放均只记一笔收入、发一张符合条件的券；关闭发券或额度已满仍可完单。|开发云 order、timer 各已回读 76/76。待用有推荐关系的测试订单和对应账号核对完单、钱包和账本。|

69 页 207 项隔离加载检查未见引用或异常错误；上述结果分属接口、云包和页面加载，逐页视觉签收仍按各页记录。详见[联调验收记录](../TEST_HANDOFF.md)。

> 最新：QA29及首批与QA26–QA28详见[本轮记录](../verification/2026-11-09-all-pages/README.md)。P50真实示例活动管理通过所列样本；P29的content已部署，纯文字公告发布/读取/结束通过所列样本；不是69页完整通过。

本册按 app.json 枚举全部69页。目标是逐页视觉符合设计、逐流程功能闭环；当前不是全量通过报告。原40个规格场景、15个关闭回归和4个真实支付场景继续以 [TEST_HANDOFF](../TEST_HANDOFF.md) 为准，不能被本册替代。

> QA07追加：四核心服务（P03–P06）新无人值班提示、实际报价、换行与底部价格栏已在当前模拟器尺寸核对；重新编译后四页累计0错误，原渲染错误未复现但根因未定。其余视觉/交互标准与用户签收仍待验收，见[实景证据](../verification/2026-11-09-remediation/qa07-live-pages.json)。


> QA09–QA13全部A已实施并同步规格；26项针对性回归在3个时区分别通过，605单测/76既有隔离回归/207页加载检查通过。六页视觉与真实流程仍待实景核对，见[最新完整结果](../verification/2026-11-09-all-pages/README.md)。

> 最新追加：QA14已批准并修复，9项隔离回归及活动页空开始日期实际滚顶提示通过；协议上下屏/返回已看；AGENTS缓冲已恢复并保存核对。QA15/QA16均已批准并修复，9+10项回归通过；QA15实际本地校验提示、QA16真实只读刷新/构造失败态按钮恢复通过；真实保存后故障链路待验。完整业务仍未通过。

## 验收标准与记录规则

|维度|要求|
|---|---|
|What|69页的视觉、入口、权限、成功/失败/恢复流程，以及所有跨页业务闭环|
|Why|静态编译不证明页面观感，空列表不证明订单履约成功|
|Who|代理执行技术与界面验证；用户确认视觉和业务结果；真实角色由授权管理员审核|
|When|新版部署→配置/身份准备→逐页→跨角色闭环→真机→用户确认合并|
|Where|本地开发分支、指定开发云、微信开发工具及用户真机；不在生产测试|
|How|每项记录版本、设备、角色、输入、预期、实际、截图/请求ID、通过/失败/阻塞；用户签收单列|
|How much|工作量随角色/配置齐备程度变化，尚不能确定完成时长；不自动付费|

### 每页都要检查的 UI 项

- U1 对照批准设计稿：色彩、标题、图标、卡片、分组和主次按钮，不能仅换色。
- U2 状态栏/按钮文字横纵居中；单行输入框文字居中、不裁切；多行输入仍按正常顶端排版。
- U3 正文≥32rpx、主交互高度≥88rpx，长文案/长小区名不越界。
- U4 320/375/390/430逻辑像素宽度、系统大字体、键盘弹起、安全区和底部价格栏不遮挡最后字段。
- U5 加载、空结果、错误、重试、禁用、提交中有正确反馈；颜色和可读性一致。
- U6 返回、tab切换、重进、下拉刷新不丢失应保留的输入、不重复提交。
- U7 完整目录可用/未开通/待资料与工作台资格状态明确；无权限按钮不误露，直达接口仍拒绝。

### 每页都要检查的功能项

- F1 正常输入成功，刷新后云端记录一致；至少一次真实成功，不能只看空页。
- F2 必填/格式/边界/协议错误，服务端拒绝且无错误写入。
- F3 断网、慢响应、乱序、重试、重复点击，避免重复创建/支付/退款。
- F4 切换小区/地址、过期状态、撤销角色或关闭功能，页面和接口结果一致。
- F5 从真实入口到达并返回；详情参数不存在/越权/已删除时明确提示。
- F6 涉及金额、文件、位置、订阅、扫码等能力时验证真实平台结果与权限拒绝。

## 69页逐项台账

每行 U1–U7、F1–F6 均需逐项填写；不适用必须说明原因。表中“已有截图”不等于用户签收或全部状态已通过。

|编号|页面/路径|角色与前置|开关|当前视觉记录|完整业务|用户签收|
|---|---|---|---|---|---|---|
|P01|近邻帮<br>pages/index/index|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|首页已登录、珺悦与4项核心/19项目录可见；未开通标记已核对|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P02|选择门牌<br>pages/bind/bind|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|既有真实手填保存、强刷持久化；QA18加载失败空态隔离回归通过|本人绑定保存及强制刷新持久化已有真实证据；多地址/赠券异常/弱网仍待验|待确认|
|P03|代取快递<br>pages/service/express|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|既有D13真实报价/件数边界、QA07提示及价格栏核对|真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验|待确认|
|P04|代扔垃圾<br>pages/service/trash|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|既有D13真实报价、QA07提示核对|真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验|待确认|
|P05|周边代买<br>pages/service/buy|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|既有服务费/商品款分离、上下限拒绝及QA07提示核对|真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验|待确认|
|P06|帮把手<br>pages/service/help|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|既有39元/30分钟报价与超时不扣费说明核对|真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验|待确认|
|P07|我的订单<br>pages/orders/list|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|实点进行中/已完成/售后三标签，加载至空结果；11月10日320宽复验已完成/售后切换及空结果，标签文字上下居中|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P08|订单详情<br>pages/orders/detail|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|QA25缺编号提示/按钮实景通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P09|我的月卡<br>pages/membership/index|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|月卡读取完成，暂无已购卡；本小区无可选计划，未购卡|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P10|我的<br>pages/me/me|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|五个工作台及资格说明可见；11月10日320宽下半屏五入口、协议入口和底部标签已实际显示，管理员卡片进入看板；其他角色成功业务未验|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P11|隐私政策<br>pages/legal/privacy|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|隐私政策上下屏可读，无观察到当前尺寸裁切|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P12|服务协议<br>pages/legal/terms|真实微信用户，业务页需对应绑定/参与关系|核心或按操作关联模块|QA10协议上下屏和返回，按次/按时及不自动扣费说明已核对|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P13|服务员申请<br>provider/apply/apply|申请页为住户；工作页需已审服务员|核心或按操作关联模块|经真实工作台进入申请页，上下屏字段已看，未上传/提交|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P14|服务员工作台<br>provider/workbench/workbench|申请页为住户；工作页需已审服务员|核心或按操作关联模块|读取成功的无服务员资料状态、申请入口点击通过；QA18失败隔离通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P15|任务大厅<br>provider/hall/hall|申请页为住户；工作页需已审服务员|核心或按操作关联模块|本人无服务员角色，直达后回首页；成功工作台未测|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P16|任务详情<br>provider/task/task|申请页为住户；工作页需已审服务员|核心或按操作关联模块|QA25缺编号提示/按钮实景通过；实点返回provider/workbench/workbench：显示尚未提交服务员申请；不是已审服务员工作成功|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P17|我的收入<br>provider/earnings/earnings|申请页为住户；工作页需已审服务员|核心或按操作关联模块|本人无服务员角色，当前直达回首页；QA19收入失败/恢复仅隔离验证|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P18|管理看板<br>admin/dashboard/dashboard|管理员；物业按接口与小区限制|核心或按操作关联模块|既有D07管理看板、13导航及零统计已看；11月10日320宽上半屏管理导航已显示，非零统计未验|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P19|订单管理<br>admin/orders/orders|管理员；物业按接口与小区限制|核心或按操作关联模块|管理订单真实空列表/全部筛选与导出入口已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P20|订单处理<br>admin/order/order|管理员；物业按接口与小区限制|核心或按操作关联模块|QA25缺编号提示/按钮实景通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P21|服务员审核<br>admin/providers/providers|管理员；物业按接口与小区限制|核心或按操作关联模块|待审核服务员空列表已看，未审核|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P22|小区配置<br>admin/community/community|管理员；物业按接口与小区限制|核心或按操作关联模块|QA15非法数字保留/滚顶、QA16只读回读与草稿保留实景；真实写后读故障未验|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P23|海报码<br>admin/posters/posters|管理员；物业按接口与小区限制|核心或按操作关联模块|示例小区/楼栋与二维码生成表单已看；未生成码|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P24|结算<br>admin/settlements/settlements|管理员；物业按接口与小区限制|核心或按操作关联模块|320宽结算表单上下屏与底部空记录提示已核对；admin新包76/76源码一致；真实offset=0/100为空、-1被拒绝；未执行结算|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P25|功能开关<br>admin/features/features|管理员；物业按接口与小区限制|核心或按操作关联模块|全局及珺悦定位开启、扩展关闭状态上下屏已读；未改开关|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P26|内容举报审核<br>admin/reports/reports|管理员；物业按接口与小区限制|核心或按操作关联模块|举报空列表及三类标签可见；QA18读取失败隔离通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P27|聊天记录审计<br>admin/chat/chat|管理员；物业按接口与小区限制|核心或按操作关联模块|无案件参数错误/重试，未出现虚假审计成功；真实案件未测|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P28|优惠券模板管理<br>admin/coupons/coupons|管理员；物业按接口与小区限制|核心或按操作关联模块|优惠券表单上下屏中文标签/单位已看；未创建发券|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P29|公告与广告管理<br>admin/content/content|管理员；物业按接口与小区限制|核心或按操作关联模块|QA28已部署；示例小区表单及非空公告390宽实景已核对|纯文字公告发布/读取/结束真实通过；同区住户/图片/广告仍待验|待确认|
|P30|商家入驻审核<br>admin/merchants/merchants|管理员；物业按接口与小区限制|核心或按操作关联模块|待审核商家筛选与空列表已看；未审核|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P31|回收企业月度对账<br>admin/recycle/recycle|管理员；物业按接口与小区限制|核心或按操作关联模块|回收月结日期/小区/导出入口已看；未导出|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P32|数据导出<br>admin/exports/exports|管理员；物业按接口与小区限制|核心或按操作关联模块|2026-11-11两段用户真机录屏：四类导出切换、日期、返回再进入已见；物业/卖家及养老CSV查看器打开并见表头，非空数据和文件内容未验。QA38/39按A修复，9组新回归、15组关联回归、624单测及77WXML/78WXSS编译通过；第三段新版录屏已补卡片/标签/箭头、切换清错及文件返回；QA42空选择器新改动真机待验。|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P33|驿站账号审核<br>admin/stations/stations|管理员；物业按接口与小区限制|核心或按操作关联模块|驿站审核读取成功无申请；QA18失败隔离通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P34|站内消息<br>chat/list/list|真实微信用户，业务页需对应绑定/参与关系|chat|聊天列表功能关闭，仅错误重试，无虚假空结果|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P35|聊天<br>chat/room/room|真实微信用户，业务页需对应绑定/参与关系|chat|无会话提示，图片/发送禁用实景；QA20恢复与离页迟到响应隔离通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P36|优惠券中心<br>coupons/center/center|真实微信用户，业务页需对应绑定/参与关系|coupons|优惠券中心功能关闭提示已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P37|我的优惠券<br>coupons/mine/mine|真实微信用户，业务页需对应绑定/参与关系|coupons|我的券功能关闭提示及领券中心入口已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P38|需求广场<br>board/list/list|真实微信用户，业务页需对应绑定/参与关系|board / travelCarry|需求列表功能关闭，三类标签居中已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P39|求助详情<br>board/detail/detail|真实微信用户，业务页需对应绑定/参与关系|board / travelCarry|QA25缺编号提示/按钮实景通过；实点返回board/list/list：需求广场暂未开放|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P40|发布需求<br>board/create/create|真实微信用户，业务页需对应绑定/参与关系|board / travelCarry|求助/悬赏/帮带三表单上下屏、常驻标签与卡片已看；初始化失败禁用上传/发布|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P41|闲置交易<br>idle/list/list|真实微信用户，业务页需对应绑定/参与关系|idle / idleEscrow|闲置列表功能关闭提示已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P42|闲置详情<br>idle/detail/detail|真实微信用户，业务页需对应绑定/参与关系|idle / idleEscrow|QA25缺编号提示/按钮实景通过；实点返回idle/list/list：闲置交易暂未开放|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P43|发布闲置<br>idle/create/create|真实微信用户，业务页需对应绑定/参与关系|idle / idleEscrow|闲置发布上下屏常驻字段、卡片、失败禁用上传/保存已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P44|我的闲置<br>idle/mine/mine|真实微信用户，业务页需对应绑定/参与关系|idle / idleEscrow|我的闲置关闭提示，历史卖家订单/收入入口可见|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P45|担保交易订单<br>idle/sales/sales|真实微信用户，业务页需对应绑定/参与关系|idle / idleEscrow|历史卖家订单查询成功为空，收入入口可见|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P46|卖家交付<br>idle/sale/sale|真实微信用户，业务页需对应绑定/参与关系|idle / idleEscrow|QA25缺编号提示/按钮实景通过；实点返回idle/sales/sales：暂无担保交易订单，卖家收入与结算入口可见|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P47|卖家收入<br>idle/income/income|真实微信用户，业务页需对应绑定/参与关系|idle / idleEscrow|QA19真实关闭错误仅重试，不显示默认零收入或结算操作|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P48|社区活动<br>events/list/list|真实微信用户，业务页需对应绑定/参与关系|events|活动列表功能关闭提示已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P49|活动详情<br>events/detail/detail|真实微信用户，业务页需对应绑定/参与关系|events|QA25缺编号提示实景；真实跨区ID直达回首页，非正常详情页通过；实点返回events/list/list：该功能暂未开放|跨区detail服务端E_FORBIDDEN、signup拒绝；真实同区详情和报名成功仍待身份|待确认|
|P50|活动管理<br>events/manage/manage|管理员／物业／商家|events|QA26选择/表单/取消卡片已核对；QA29取消卡片隐藏签到；390宽度|示例活动创建/发布/零报名取消通过；event旧批回读及只读复验通过；QA29本地40项、新包76文件云回读及取消态签到拒绝通过；任务queued未执行|待确认|
|P51|上门喂宠<br>pet/order|真实微信用户，业务页需对应绑定/参与关系|pet|喂宠上下屏数量行、任务换行；QA24实际价格栏¥--、确认禁用及底部不遮挡已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P52|喂宠上门清单<br>pet/work|该订单已接单服务员|pet|QA25缺编号提示/按钮实景通过；实点返回provider/workbench/workbench：重新从首页进入后提示正常，返回显示尚未提交服务员申请；此前偶发空白；用户iPhone 16 Pro Max首次缺编号提示、返回未申请工作台及再次扫码正常；QA30根因未定|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P53|喂宠服务记录<br>pet/reports|真实微信用户，业务页需对应绑定/参与关系|pet|QA25缺编号提示/按钮实景通过；按钮实际返回我的订单|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P54|商家入驻<br>merchant/apply/apply|申请页为住户；工作页需已审商家|merchants|商家申请上下屏，失败重试/上传与提交禁用已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P55|商家工作台<br>merchant/workbench/workbench|申请页为住户；工作页需已审商家|merchants|QA17读取失败仅显示错误重试，不显示未申请状态|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P56|服务管理<br>merchant/services/services|申请页为住户；工作页需已审商家|merchants|本人无商家资格，直达回首页；QA20读取门槛隔离通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P57|商家预约订单<br>merchant/orders/orders|申请页为住户；工作页需已审商家|merchants|本人无商家资格，直达回首页；真实订单未测|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P58|社区商家<br>shops/list/list|真实微信用户，业务页需对应绑定/参与关系|merchants|商家列表关闭错误及资质提示已看|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P59|商家详情<br>shops/detail/detail|真实微信用户，业务页需对应绑定/参与关系|merchants|QA25缺编号提示/按钮实景通过；实点返回shops/list/list：该功能暂未开放|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P60|提交预约<br>shops/booking/booking|真实微信用户，业务页需对应绑定/参与关系|merchants|QA23真实绑定地址无undefined；QA25缺编号隐藏预约表单/提交，实际返回商家列表|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P61|申请驿站账号<br>station/apply/apply|住户申请／驿站／服务员，按页面核验|stationDelivery|QA18功能关闭错误，无假未申请/申请表|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P62|驿站工作台<br>station/workbench/workbench|住户申请／驿站／服务员，按页面核验|stationDelivery|本人无驿站资格，直达回首页；成功工作台未测|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P63|创建送上门批次<br>station/create/create|住户申请／驿站／服务员，按页面核验|stationDelivery|建批次常驻门牌标签及每行格式已看，空表单禁用；未建批次|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P64|驿站配送任务<br>station/worker/worker|住户申请／驿站／服务员，按页面核验|stationDelivery|本人无配送资格，直达回首页；成功工作台未测|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P65|驿站批次<br>station/batch/batch|住户申请／驿站／服务员，按页面核验|stationDelivery|QA25缺编号提示/按钮实景通过；实点返回station/worker/worker → pages/index/index：当前resident/admin账号无配送权限，providerHall实测E_FORBIDDEN并回首页；不是配送成功流程|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P66|送餐上门<br>elder/meal|真实微信用户，业务页需对应绑定/参与关系|elder|食堂未配置/功能关闭；QA24实际价格栏及禁用确认已核对|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P67|陪诊预约<br>elder/escort|真实微信用户，业务页需对应绑定/参与关系|elder|陪诊字段、报价¥--及功能关闭已看；下半屏完整交互待验|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P68|预约上门回收<br>recycle/order/order|真实微信用户，业务页需对应绑定/参与关系|recycle / points|回收类别纸类实际切换选中，关闭态提交禁用；未下单|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|
|P69|小区公告<br>notices/list/list|真实微信用户，业务页需对应绑定/参与关系|notices|公告读取成功空列表；QA18读取失败隔离通过|未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF|待确认|

### P01 近邻帮

- 路径：pages/index/index。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、openNotices、openAd、recordAd、introduce、callHotline。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、content.adEvent、content.homeContent。
- 本轮检查：首页已登录、珺悦与4项核心/19项目录可见；11月10日320宽上下屏已核对，目录底部、热线按钮及底部标签无观察到遮挡；未拨打热线。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：未开启扩展的真实目录跳转、广告/公告非空、多尺寸与真机定位；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P02 选择门牌

- 路径：pages/bind/bind。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、communityChange、buildingChange、unitChange、roomChange、toggleContact、contactNameChange、contactPhoneChange、manualPhoneChange、agreementChange、save、backHome。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、catalog.listCommunities、catalog.nearbyCommunities、catalog.resolveScene、user.bindPhone、user.setAddress。
- 本轮检查：既有真实手填保存、强刷持久化；QA18加载失败空态隔离回归通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：本人绑定保存及强制刷新持久化已有真实证据；多地址/赠券异常/弱网仍待验。
- 未完成：多地址切换、重复保存/断网及赠券异常真实链路；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P03 代取快递

- 路径：pages/service/express。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、addressChange、address、change、slotChange、couponChange、pointsChange、retryQuote、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、order.create、order.detail、order.mockPay、order.quote、order.subscriptionTemplates。
- 本轮检查：既有D13真实报价/件数边界、QA07提示及价格栏核对。静态/隔离结果只覆盖对应检查范围。
- 功能证据：真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验。
- 未完成：真实创建/支付/接单/履约/取消退款及重复请求；服务员身份与D05暂停边界；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P04 代扔垃圾

- 路径：pages/service/trash。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、addressChange、address、change、slotChange、couponChange、pointsChange、retryQuote、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、order.create、order.detail、order.mockPay、order.quote、order.subscriptionTemplates。
- 本轮检查：既有D13真实报价、QA07提示核对。静态/隔离结果只覆盖对应检查范围。
- 功能证据：真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验。
- 未完成：真实创建/支付/接单/履约/取消退款及重复请求；服务员身份与D05暂停边界；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P05 周边代买

- 路径：pages/service/buy。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、addressChange、address、change、slotChange、couponChange、pointsChange、retryQuote、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、order.create、order.detail、order.mockPay、order.quote、order.subscriptionTemplates。
- 本轮检查：既有服务费/商品款分离、上下限拒绝及QA07提示核对。静态/隔离结果只覆盖对应检查范围。
- 功能证据：真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验。
- 未完成：真实创建/支付/接单/履约/取消退款及重复请求；服务员身份与D05暂停边界；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P06 帮把手

- 路径：pages/service/help。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、addressChange、address、change、slotChange、couponChange、pointsChange、retryQuote、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、order.create、order.detail、order.mockPay、order.quote、order.subscriptionTemplates。
- 本轮检查：既有39元/30分钟报价与超时不扣费说明核对。静态/隔离结果只覆盖对应检查范围。
- 功能证据：真实报价与所述拒绝边界已验证；创建、支付、履约、退款未全验。
- 未完成：真实创建/支付/接单/履约/取消退款及重复请求；服务员身份与D05暂停边界；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P07 我的订单

- 路径：pages/orders/list。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：groupChange、retry。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：chat.list、order.listMine。
- 本轮检查：实点进行中/已完成/售后三标签，加载至空结果；11月10日320宽复验已完成/售后切换及空结果，标签文字上下居中。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：非空订单/分页、详情往返和刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P08 订单详情

- 路径：pages/orders/detail。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、openChat、subscribeVisitReport、subscribeVacantReport、previewVacant、openPetReports、callProvider、preview、pay、cancel、serviceAction、form。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：chat.open、order.cancel、order.complain、order.confirm、order.detail、order.mockPay、order.rate、order.retryPayment、order.subscribeVisitReport、order.subscriptionTemplates、vacant.subscribeReport。
- 本轮检查：QA25缺编号提示/按钮实景通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效编号非空详情、已删除/越权记录、相关业务状态操作与刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P09 我的月卡

- 路径：pages/membership/index。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、addressChange、slot、entry、entryPassword、buy、skip。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：membership.buy、membership.mine、membership.plans、membership.skipToday、order.detail、order.mockPay、order.subscriptionTemplates。
- 本轮检查：月卡读取完成，暂无已购卡；本小区无可选计划，未购卡。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：可用计划、购卡/激活/任务生成、修改计划并发保护；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P10 我的

- 路径：pages/me/me。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：load、callHotline、doorDeliveryChange、openWorkspace。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：chat.list、merchant.myApplication、station.myApplication、station.setDoorDelivery。
- 本轮检查：五个工作台及资格说明可见；11月10日320宽下半屏五入口、协议入口和底部标签已实际显示，管理员卡片进入看板；其他角色成功业务未验。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：经审核的其他角色工作台、物业本小区权限；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P11 隐私政策

- 路径：pages/legal/privacy。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：静态阅读与系统返回。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：静态页面/共用登录。
- 本轮检查：隐私政策上下屏可读，无观察到当前尺寸裁切。静态/隔离结果只覆盖对应检查范围。
- 功能证据：静态文档阅读与返回已有实景样本；云写入/支付成功不适用（本页无此操作），多尺寸可读性及用户内容确认仍待验。
- 未完成：320/375/430、大字体全篇阅读与用户内容签收；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P12 服务协议

- 路径：pages/legal/terms。前置：真实微信用户，业务页需对应绑定/参与关系；核心或按操作关联模块。
- 页面操作清点：静态阅读与系统返回。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：静态页面/共用登录。
- 本轮检查：QA10协议上下屏和返回，按次/按时及不自动扣费说明已核对。静态/隔离结果只覆盖对应检查范围。
- 功能证据：静态文档阅读与返回已有实景样本；云写入/支付成功不适用（本页无此操作），多尺寸可读性及用户内容确认仍待验。
- 未完成：320/375/430、大字体全篇阅读与用户内容签收；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA10 帮把手协议过时，已批准并完成本地修复，实景待验

### P13 服务员申请

- 路径：provider/apply/apply。前置：申请页为住户；工作页需已审服务员；核心或按操作关联模块。
- 页面操作清点：load、change、photo、agree、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.listCommunities、provider.apply、provider.myStatus、user.bindPhone。
- 本轮检查：经真实工作台进入申请页，上下屏字段已看，未上传/提交。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实本人资料、资质图片上传、申请/审核/退回重提；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P14 服务员工作台

- 路径：provider/workbench/workbench。前置：申请页为住户；工作页需已审服务员；核心或按操作关联模块。
- 页面操作清点：load、duty、subscribeMore、saveReferralPoster、task、more。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：order.subscriptionTemplates、provider.myStatus、provider.myTasks、provider.referralPoster、provider.setDuty。
- 本轮检查：读取成功的无服务员资料状态、申请入口点击通过；QA18失败隔离通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：已审核服务员上下班及实际任务；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P15 任务大厅

- 路径：provider/hall/hall。前置：申请页为住户；工作页需已审服务员；核心或按操作关联模块。
- 页面操作清点：retry、accept。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：order.subscriptionTemplates、provider.accept、provider.hall。
- 本轮检查：本人无服务员角色，直达后回首页；成功工作台未测。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：服务员资格、非空大厅、接单与并发拒绝；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P16 任务详情

- 路径：provider/task/task。前置：申请页为住户；工作页需已审服务员；核心或按操作关联模块。
- 页面操作清点：load、callResident、openChat、openPetTasks、revealEntry、weight、act、photo、goods、checklist、vacantPhoto、vacantNotes、vacantAttention、visitCheck、visitNotes、visitAttention、submitVacantReport。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：order.detail、provider.deliver、provider.release、provider.start、provider.updateLocation、vacant.recordReport、vacant.revealEntry。
- 本轮检查：QA25缺编号提示/按钮实景通过；2026-11-10实点返回provider/workbench/workbench：显示尚未提交服务员申请；不是已审服务员工作成功。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效编号非空详情、已删除/越权记录、相关业务状态操作与刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P17 我的收入

- 路径：provider/earnings/earnings。前置：申请页为住户；工作页需已审服务员；核心或按操作关联模块。
- 页面操作清点：createPayout、retry。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：payout.create、payout.list、provider.earnings。
- 本轮检查：本人无服务员角色，当前直达回首页；QA19收入失败/恢复仅隔离验证。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：服务员资格、非零账本、结算/提现；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P18 管理看板

- 2026-11-09 D07实测：本人开发管理员已从“我的”进入看板，13项管理导航及零数据统计已加载；顶部导航、底部卡片已查看实际截图。日期/小区/联合范围切换、非零业务、物业边界和用户视觉签收未通过，不能将本行全部打勾。证据：[D07记录](../verification/2026-11-09-remediation/d07-admin-setup.json)。

- 路径：admin/dashboard/dashboard。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、chooseCommunity、chooseScope、chooseDate。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.dashboard、admin.notificationTemplates、catalog.listCommunities。
- 本轮检查：既有D07管理看板、13导航及零统计已看；11月10日320宽上半屏管理导航已显示，非零统计未验。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：非零收入/商品款/退款及多小区汇总；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA33已批准并修复：5页选择器完整分页与加载门槛，24项隔离回归通过；真实大量数据及新版本完整交互未验。

### P19 订单管理

- 路径：admin/orders/orders。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：filter、retry、open。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.exportSubsidyOrders、admin.listOrders。
- 本轮检查：管理订单真实空列表/全部筛选与导出入口已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：非空筛选/分页、订单处理往返和导出；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P20 订单处理

- 路径：admin/order/order。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、preview、openChat、retryRefund、provider、assign、cancel、resolutionField、liable、resolve、voidCard。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.assign、admin.forceCancel、admin.listProviders、admin.resolveComplaint、admin.retryRefund、admin.voidMembership、order.detail。
- 本轮检查：QA25缺编号提示/按钮实景通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效编号非空详情、已删除/越权记录、相关业务状态操作与刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P21 服务员审核

- 路径：admin/providers/providers。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：filter、retry、preview、note、certs、review、cleanup、insurance、suspend。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.cleanupProviderKyc、admin.listProviders、admin.reviewProvider、admin.setCerts、admin.setInsurance、admin.suspendProvider。
- 本轮检查：待审核服务员空列表已看，未审核。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实申请审核、退回、敏感图片处理；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P22 小区配置

- 路径：admin/community/community。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、chooseCommunity、input、chooseLocation、editBuilding、newBuilding、addBuilding、rowInput、removeRow、addRow、togglePetCert、choosePlan、saveCommunity、saveGlobal。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.managementConfig、admin.updateCommunity、admin.updateConfig、admin.upsertBuilding。
- 本轮检查：QA15非法数字保留/滚顶、QA16只读回读与草稿保留实景；真实写后读故障未验。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实写成功后读失败/超时、跨小区草稿、月卡计划锁定；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA15已修复，9项本地回归和实际全局非法数字滚顶/保留输入通过；QA16已修复，10项本地回归通过；真实只读刷新与本地构造失败态按钮恢复通过，真实写成功后故障链路待验

### P23 海报码

- 路径：admin/posters/posters。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、retry、changeCommunity、generate、providerChange、preview、save。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.genPoster、admin.listProviders、catalog.getCommunity、catalog.listCommunities。
- 本轮检查：320宽示例小区楼栋卡片及无服务员禁用提示已看；新实例通过原页面方法读取珺悦，仅2号楼、绑定未变。构造的读取错误提示可见；实点重试及后续滚动遇noWindowsAvailable，未通过。。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实picker切换/按钮重试、多尺寸、实际生成/预览/保存与扫码仍待验证；本轮未真实生成海报。
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA33已批准并修复：5页选择器完整分页与加载门槛，24项隔离回归通过；真实大量数据及新版本完整交互未验。；QA32已批准，规格/代码完成，19项隔离回归通过；实际生成链未验。

### P24 结算

- 路径：admin/settlements/settlements。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、loadMoreHistory、select、input、preview、create、markPaid。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.exportCsv、admin.listProviders、admin.listSettlements、admin.settlementCreate、admin.settlementMarkPaid、admin.settlementPreview、catalog.getCommunity、catalog.listCommunities、merchant.adminList。
- 本轮检查：320宽结算表单上下屏与底部空记录提示已核对；admin新包76/76源码一致；真实offset=0/100为空、-1被拒绝；未执行结算。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实非空历史分页/失败恢复及物业身份；合法收款对象、非零账目、生成/确认及导出；适用多尺寸及用户签收仍未完成。
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA33已批准并修复：5页选择器完整分页与加载门槛，24项隔离回归通过；真实大量数据及新版本完整交互未验。；QA34已批准并修复：历史20条分页与加载更多、失败保留；10项共享及9项前端隔离测试通过。admin新包02e7d65已授权部署、76/76源码一致；真实空分页/负偏移拒绝通过，非空分页仍待验。

- QA35按用户选择A修复：条件变化清空预览、请求范围快照及迟到响应保护；9项隔离回归通过；仅前端，无新增云包，真实非空预览切换仍待验。

- QA37已批准A并修复：结算预览按类型/小区/实际对象使用稳定唯一行键，多卖家和重排隔离验证通过；真实非空渲染待验。 QA35本轮实际点击无服务员预览显示“请先选择小区及收款对象”；点击重新加载后恢复表单并清除该错误，未生成结算。

### P25 功能开关

- 路径：admin/features/features。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、scope、choose、toggle。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.getFeatures、admin.updateCommunity、admin.updateConfig、catalog.listCommunities。
- 本轮检查：全局及珺悦定位开启、扩展关闭状态上下屏已读；未改开关。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：逐扩展授权开启后的入口/接口边界及历史订单例外；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA33已批准并修复：5页选择器完整分页与加载门槛，24项隔离回归通过；真实大量数据及新版本完整交互未验。

### P26 内容举报审核

- 路径：admin/reports/reports。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：chooseStatus、load、openChat、resolve、moderate。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：content.listReports、content.moderateContent、content.moderateUser、content.resolveReport。
- 本轮检查：举报空列表及三类标签可见；QA18读取失败隔离通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实举报、下架/驳回与关联业务；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P27 聊天记录审计

- 路径：admin/chat/chat。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、preview。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：chat.adminPull。
- 本轮检查：无案件参数错误/重试，未出现虚假审计成功；真实案件未测。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实授权案件、审计记录与消息脱敏；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA12 审计成功提示，已批准并完成本地修复，实景待验

### P28 优惠券模板管理

- 路径：admin/coupons/coupons。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：field、chooseKind、chooseMode、save、reset、edit、toggleStatus、templatePick、issue。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：coupon.adminTemplates、coupon.manualIssue、coupon.saveTemplate。
- 本轮检查：优惠券表单上下屏中文标签/单位已看；未创建发券。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：券模板参数、创建/领取/发放/核销/失效；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P29 公告与广告管理

- 路径：admin/content/content。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：input、chooseImage、togglePinned、saveNotice、endNotice、adSlotChange、adTargetTypeChange、adPathChange、adStatusChange、saveAd、confirmAdReceived、endAd。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：content.endAd、content.endNotice、content.listAds、content.listNotices、content.markAdReceived、content.saveAd、content.saveNotice。
- 本轮检查：390宽度真实示例公告表单、发布后标题和结束入口已核对；多尺寸及广告成功态未全验。静态/隔离结果只覆盖对应检查范围。
- 功能证据：content76文件回读一致；实际点击发布→回读标题/正文/范围/有效期→点击结束→列表移除且无错误；普通住户及广告流程未验。
- 未完成：图片公告、同区普通住户读取、广告录入/收款/收入归属；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- QA28最新：content云端76/76文件回读一致；真实示例花园公告发布、完整内容回读、结束后列表移除且无错误已通过。390宽表单和非空公告已核对；同区普通住户查看、图片公告、广告完整流程与多尺寸仍未验收。
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA28已部署并完成纯文字公告管理成功流程；其余边界见qa28-live.json

### P30 商家入驻审核

- 路径：admin/merchants/merchants。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、inspect、serviceStatus、review。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：merchant.adminList、merchant.adminServices、merchant.review、merchant.setServiceStatus。
- 本轮检查：待审核商家筛选与空列表已看；未审核。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实商家资料、审核与通过商家服务管理；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA11 中文/标签/金额展示，已批准并完成本地修复，实景待验

### P31 回收企业月度对账

- 路径：admin/recycle/recycle。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：select、input。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.exportRecyclerStatement、catalog.listCommunities。
- 本轮检查：回收月结日期/小区/导出入口已看；未导出。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：回收企业非零账目、导出字段/金额/分页；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA33已批准并修复：5页选择器完整分页与加载门槛，24项隔离回归通过；真实大量数据及新版本完整交互未验。

### P32 数据导出

- 路径：admin/exports/exports。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、select、input、exportData。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：admin.exportCsv、admin.exportRecyclerStatement、admin.exportSubsidyOrders、admin.listProviders、catalog.getCommunity、catalog.listCommunities、merchant.adminList、station.exportStatement。
- 本轮检查：2026-11-11两段用户真机录屏：四类导出切换、日期、返回再进入已见；物业/卖家及养老CSV查看器打开并见表头，非空数据和文件内容未验。QA38/39按A修复，9组新回归、15组关联回归、624单测及77WXML/78WXSS编译通过；第三段新版录屏已补卡片/标签/箭头、切换清错及文件返回；QA42空选择器新改动真机待验。。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：QA38/39已补录屏所示视觉及交互，最终签收及QA42真机待验；四类非空CSV字段/金额/脱敏、回收与驿站启用后成功导出、下载失败/离页真实恢复；多尺寸、大字体、键盘与用户签收
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

- QA38/39按A完成错误分类/过期提示和表单卡片、标签、箭头、间距；9组本地回归及官方编译通过，新版实景与用户视觉签收待验。
- QA36已批准A并修复：读取成功才可导出，失败保留草稿、重试只读、离页不更新或打开迟到文件；14项隔离回归通过。两段真机录像已补部分文件打开；QA38/39新版实景、原文件内容与非空业务仍待验。

### P33 驿站账号审核

- 路径：admin/stations/stations。前置：管理员；物业按接口与小区限制；核心或按操作关联模块。
- 页面操作清点：load、review。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：station.listApplications、station.reviewApplication。
- 本轮检查：驿站审核读取成功无申请；QA18失败隔离通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实驿站申请、审核与角色授予；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P34 站内消息

- 路径：chat/list/list。前置：真实微信用户，业务页需对应绑定/参与关系；chat。
- 页面操作清点：load、open。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：chat.list。
- 本轮检查：聊天列表功能关闭，仅错误重试，无虚假空结果。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实双账号会话、未读/已读/分页；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P35 聊天

- 路径：chat/room/room。前置：真实微信用户，业务页需对应绑定/参与关系；chat。
- 页面操作清点：start、reportContent、input、image、send。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：chat.markRead、chat.open、chat.pull、chat.send、content.report。
- 本轮检查：无会话提示，图片/发送禁用实景；QA20恢复与离页迟到响应隔离通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：合法会话、发送/图片/审核/失败重试及双账号权限；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P36 优惠券中心

- 路径：coupons/center/center。前置：真实微信用户，业务页需对应绑定/参与关系；coupons。
- 页面操作清点：load、claim。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：coupon.center、coupon.claim。
- 本轮检查：优惠券中心功能关闭提示已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：可用券列表/领取/库存与重复领取；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P37 我的优惠券

- 路径：coupons/mine/mine。前置：真实微信用户，业务页需对应绑定/参与关系；coupons。
- 页面操作清点：load、retryWelcome。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：coupon.mine、user.retryWelcomeCoupons。
- 本轮检查：我的券功能关闭提示及领券中心入口已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：已领券可用/使用/到期状态；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P38 需求广场

- 路径：board/list/list。前置：真实微信用户，业务页需对应绑定/参与关系；board / travelCarry。
- 页面操作清点：chooseType、chooseScope、retryAds、openAd、recordAd、load、open、create、more。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：board.list、catalog.getCommunity、content.adEvent、content.adsForSlot。
- 本轮检查：需求列表功能关闭，三类标签居中已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：同区真实列表/三类筛选/分页及跨区边界；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P39 求助详情

- 路径：board/detail/detail。前置：真实微信用户，业务页需对应绑定/参与关系；board / travelCarry。
- 页面操作清点：load、preview、continuePayment、close、report、reportComment、input、comment。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：board.close、board.comment、board.detail、board.report。
- 本轮检查：QA25缺编号提示/按钮实景通过；2026-11-10实点返回board/list/list：需求广场暂未开放。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效编号非空详情、已删除/越权记录、相关业务状态操作与刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P40 发布需求

- 路径：board/create/create。前置：真实微信用户，业务页需对应绑定/参与关系；board / travelCarry。
- 页面操作清点：field、scope、choose、toggleEnterHome、agree、photos、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：board.create、catalog.getCommunity、order.detail、order.mockPay、order.subscriptionTemplates。
- 本轮检查：求助/悬赏/帮带三表单上下屏、常驻标签与卡片已看；初始化失败禁用上传/发布。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：开关、角色、三个发布类型成功/审核/上传/失败恢复；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA09 日期函数缺失，已批准并完成本地修复，实景待验

### P41 闲置交易

- 路径：idle/list/list。前置：真实微信用户，业务页需对应绑定/参与关系；idle / idleEscrow。
- 页面操作清点：scope、load、open、more、create、mine。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、idle.list。
- 本轮检查：闲置列表功能关闭提示已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：同区有效商品/筛选/分页；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P42 闲置详情

- 路径：idle/detail/detail。前置：真实微信用户，业务页需对应绑定/参与关系；idle / idleEscrow。
- 页面操作清点：load、preview、edit、markSold、sales、remove、buy、contact、want、carry、report。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：chat.openIdle、idle.buy、idle.contact、idle.detail、idle.markSold、idle.remove、idle.report、order.detail、order.mockPay、order.subscriptionTemplates。
- 本轮检查：QA25缺编号提示/按钮实景通过；2026-11-10实点返回idle/list/list：闲置交易暂未开放。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效编号非空详情、已删除/越权记录、相关业务状态操作与刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P43 发布闲置

- 路径：idle/create/create。前置：真实微信用户，业务页需对应绑定/参与关系；idle / idleEscrow。
- 页面操作清点：field、condition、switch、tradeMode、scope、photos、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、idle.create、idle.detail、idle.update。
- 本轮检查：闲置发布上下屏常驻字段、卡片、失败禁用上传/保存已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：开关、发布/编辑/审核/图片与草稿恢复；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P44 我的闲置

- 路径：idle/mine/mine。前置：真实微信用户，业务页需对应绑定/参与关系；idle / idleEscrow。
- 页面操作清点：load、open、sales、income、create。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：idle.mine。
- 本轮检查：我的闲置关闭提示，历史卖家订单/收入入口可见。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：本人成交/上下架/编辑非空列表；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P45 担保交易订单

- 路径：idle/sales/sales。前置：真实微信用户，业务页需对应绑定/参与关系；idle / idleEscrow。
- 页面操作清点：load、open。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：idle.sales。
- 本轮检查：历史卖家订单查询成功为空，收入入口可见。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实担保订单各状态与账本；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P46 卖家交付

- 路径：idle/sale/sale。前置：真实微信用户，业务页需对应绑定/参与关系；idle / idleEscrow。
- 页面操作清点：load、accept、preview、photos、note、deliver。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：idle.acceptSale、idle.deliverSale、order.detail。
- 本轮检查：QA25缺编号提示/按钮实景通过；2026-11-10实点返回idle/sales/sales：暂无担保交易订单，卖家收入与结算入口可见。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效编号非空详情、已删除/越权记录、相关业务状态操作与刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P47 卖家收入

- 路径：idle/income/income。前置：真实微信用户，业务页需对应绑定/参与关系；idle / idleEscrow。
- 页面操作清点：load、withdraw。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：idle.earnings、payout.create、payout.list。
- 本轮检查：QA19真实关闭错误仅重试，不显示默认零收入或结算操作。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：非零卖家收入、跨小区分摊/提现及真实转账；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P48 社区活动

- 路径：events/list/list。前置：真实微信用户，业务页需对应绑定/参与关系；events。
- 页面操作清点：load、open。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：event.list。
- 本轮检查：活动列表功能关闭提示已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：同区活动列表/有效日期/满额与分页；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P49 活动详情

- 路径：events/detail/detail。前置：真实微信用户，业务页需对应绑定/参与关系；events。
- 页面操作清点：load、signup、cancelSignup、reportContent。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：content.report、event.cancelSignup、event.detail、event.signup、event.templates、order.detail、order.mockPay、order.subscriptionTemplates。
- 本轮检查：QA25缺编号提示实景；真实跨区ID直达回首页，非正常详情页通过；2026-11-10实点返回events/list/list：该功能暂未开放。静态/隔离结果只覆盖对应检查范围。
- 功能证据：跨区detail服务端E_FORBIDDEN、signup拒绝；真实同区详情和报名成功仍待身份。
- 未完成：同区真实详情/报名/满额/取消/签到与并发；现有跨区拒绝不替代；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 最新：真实珺悦身份请求示例活动detail/signup分别被E_FORBIDDEN/E_INVALID_PARAM拒绝；真实编号直达页面因本人小区活动关闭返回首页。仅记录跨区接口拒绝，不计正常详情/报名成功；同区住户和双微信验收待身份就绪。
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P50 活动管理

- 路径：events/manage/manage。前置：管理员／物业／商家；events。
- 页面操作清点：load、input、typeChange、createActivity、scan、publish、showSignups、checkin、cancel、retryCancellation。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：event.adminList、event.cancelEvent、event.checkin、event.create、event.listSignups、event.publish、event.retryCancellation、event.review。
- 本轮检查：QA26小区picker实际切换、上下表单/发布与取消卡片已核对；390宽度；QA29取消卡片不显示签到按钮，刷新实景已核对。静态/隔离结果只覆盖对应检查范围。
- 功能证据：示例花园0元/容量1活动真实创建发布、空报名名单读取及零报名取消通过；任务queued未执行；event旧批76文件云回读及只读列表/跨区拒绝通过；QA29本地40项通过，新代码已76文件回读且真实取消态签到拒绝通过。
- 未完成：同区住户报名/签到成功与云并发；取消任务执行尚未授权；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 实景追加：bfcf067，iPhone12/13 Pro 75%；用户导航后上半屏中文字段/元人单位/卡片已核对，三个日期请选择日期及默认时刻仅AX确认；0错误/8警告。下半屏、选择器、提交与非空流程仍待验，见qa11-13-event-live.json。
- QA26最新：管理员真实小区选择器切换示例花园、创建并发布0元/容量1活动、读取空报名及点击取消均已核对，保留珺悦绑定。页面显示已取消0/1，后台任务queued 0/0；未执行timer。QA27免费报名取消仅本地通过，旧批event已76文件云回读，timer已76文件回读且未运行；QA29本地40项通过，实际取消卡片已隐藏签到按钮，新event修复已76文件回读且真实取消态签到拒绝通过；签到成功、云并发、同区报名与多尺寸仍待验。
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA29已修复部署；真实云并发与签到成功待验

### P51 上门喂宠

- 0.1.4 真机录屏：最早可确定 11 月 17 日，新增一次只加一天。滚到 23 日后取消仍保留原四天与 640 元报价；狗数量与遛狗校验、增加一只狗后的 1040 元报价已核对。喂宠返回首页、真机跨午夜和 QA83 新前端待验。

- 路径：pet/order。前置：真实微信用户，业务页需对应绑定/参与关系；pet。
- 页面操作清点：load、addressChange、removePetDate、addPetDate、change、slotChange、retryQuote、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、order.create、order.detail、order.mockPay、order.quote、order.subscriptionTemplates。
- 本轮检查：喂宠上下屏数量行、任务换行；QA24实际价格栏¥--、确认禁用及底部不遮挡已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- QA82/83：390 宽模拟器实际取消日期滚轮后，两天及合成报价保持一致。跨住户服务事项、报价参数和日期 8 组隔离回归通过。体验版 0.1.4 的手机选日与 QA83 新版实机另验。
- 未完成：喂宠报价配置/合法角色、上传/下单/实际履约；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P52 喂宠上门清单

- 路径：pet/work。前置：该订单已接单服务员；pet。
- 页面操作清点：load、reveal、done、missed、closeSecret。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：pet.listVisits、pet.markDone、pet.markMissed、pet.revealEntry。
- 本轮检查：QA25缺编号提示/按钮实景通过；2026-11-10实点返回provider/workbench/workbench：重新从首页进入后提示正常，返回显示尚未提交服务员申请；此前模拟器偶发空白，根因未定；用户真机反馈首次扫码显示缺编号、点击进入服务员未申请页面；用户补充iPhone 16 Pro Max再次扫码正常，本轮未复现空白。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效订单清单/上传报告/提交；偶发空白根因未知，真机缺编号样本未复现不算修复；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复；QA30：导航后曾偶发空白，冷启动缺编号页正常；iPhone 16 Pro Max真机首次提示、返回及重复扫码通过，模拟器空白根因未定，未改喂宠逻辑

### P53 喂宠服务记录

- 路径：pet/reports。前置：真实微信用户，业务页需对应绑定/参与关系；pet。
- 页面操作清点：load。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：pet.listVisits。
- 本轮检查：QA25缺编号提示/按钮实景通过；按钮实际返回我的订单。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效订单报告、私有图片可见权限/到期刷新；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P54 商家入驻

- 路径：merchant/apply/apply。前置：申请页为住户；工作页需已审商家；merchants。
- 页面操作清点：input、chooseCategory、upload、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：merchant.apply、merchant.myApplication。
- 本轮检查：QA56：390宽实际读取返回“该功能暂未开放”，ready=false、loading=false；实际重试后读取序号为2，仍正确显示关闭提示。上下屏表单、常驻标签、上传/提交禁用已看；通过Console返回，非实际返回按钮样本。 所见薄荷页头/米白背景/圆角卡片无截断重叠；未提交申请或上传。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：商家资质、上传/申请/审核/重提；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA11 中文/标签/金额展示，已批准并完成本地修复，实景待验

### P55 商家工作台

- 路径：merchant/workbench/workbench。前置：申请页为住户；工作页需已审商家；merchants。
- 页面操作清点：load、orders、services、apply。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：merchant.myApplication。
- 本轮检查：QA17读取失败仅显示错误重试，不显示未申请状态。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：已审核商家工作台非空订单/服务导航；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA11 中文/标签/金额展示，已批准并完成本地修复，实景待验

### P56 服务管理

- 路径：merchant/services/services。前置：申请页为住户；工作页需已审商家；merchants。
- 页面操作清点：input、chooseType、photos、save。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：merchant.myServices、merchant.upsertService。
- 本轮检查：本人无商家资格，直达回首页；QA20读取门槛隔离通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：商家资格、创建/编辑/上下架/报价与审核；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA11 中文/标签/金额展示，已批准并完成本地修复，实景待验

### P57 商家预约订单

- 路径：merchant/orders/orders。前置：申请页为住户；工作页需已审商家；merchants。
- 页面操作清点：load、chooseQuote、input、quote、transition、complete。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：merchant.completeBooking、merchant.merchantOrders、merchant.merchantTransition、merchant.quoteBooking。
- 本轮检查：本人无商家资格，直达回首页；真实订单未测。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：商家资格、有效订单接单/履约；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P58 社区商家

- 路径：shops/list/list。前置：真实微信用户，业务页需对应绑定/参与关系；merchants。
- 页面操作清点：retryAds、openAd、recordAd、load、open。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：content.adEvent、content.adsForSlot、merchant.listForCommunity。
- 本轮检查：商家列表关闭错误及资质提示已看。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效商家、分类/服务列表及跨区权限；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P59 商家详情

- 路径：shops/detail/detail。前置：真实微信用户，业务页需对应绑定/参与关系；merchants。
- 页面操作清点：load、book、reportContent。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：content.report、merchant.servicesForMerchant。
- 本轮检查：QA25缺编号提示/按钮实景通过；2026-11-10实点返回shops/list/list：该功能暂未开放。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效商家/服务、进入预约与可见范围；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P60 提交预约

- 路径：shops/booking/booking。前置：真实微信用户，业务页需对应绑定/参与关系；merchants。
- 页面操作清点：load、address、input、submit、openOrder。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：merchant.createBooking、merchant.lookupBooking、order.detail、order.mockPay、order.subscriptionTemplates。
- 本轮检查：QA55：430宽受控初始化失败时显示错误及只读重试，表单/提交隐藏；实际点击重试后ready=true、loading=false、loadError=false、错误清除，需求草稿保留，地址/表单/提交恢复可见；实际返回首页。仅合成服务编号的初始化样本，无预约创建或付款。 21:30后补验320/375宽：受控初始化失败隐藏表单和提交、错误与重试可见；实际点重试后错误清除、草稿保留、表单恢复，实际返回首页，所见布局无截断/重叠。390本轮补齐同样受控错误、实际重试、草稿保留、表单恢复及返回首页。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：有效商家服务预约、报价/付款及云端请求幂等；真实多地址、320/375/390新版布局、真机/键盘/大字体及完整视觉签收；离页与并发边界目前仅隔离回归
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25、QA55已批准并修复

### P61 申请驿站账号

- 路径：station/apply/apply。前置：住户申请／驿站／服务员，按页面核验；stationDelivery。
- 页面操作清点：load、chooseCommunity、chooseStation、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：station.applicationOptions、station.apply、station.myApplication。
- 本轮检查：QA56：390宽实际读取返回“该功能暂未开放”，ready=false、loading=false；实际重试后读取序号为2，仍正确显示关闭提示。未显示假未申请状态或申请表；实际返回按钮回到首页加载页。 所见薄荷页头/米白背景/圆角卡片无截断重叠；未提交申请或上传。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：真实驿站资料、申请/审核/退回重提；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P62 驿站工作台

- 路径：station/workbench/workbench。前置：住户申请／驿站／服务员，按页面核验；stationDelivery。
- 页面操作清点：monthChange、exportStatement、load。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：station.exportStatement、station.listMyBatches。
- 本轮检查：本人无驿站资格，直达回首页；成功工作台未测。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：驿站资格、真实批次/对账；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P63 创建送上门批次

- 路径：station/create/create。前置：住户申请／驿站／服务员，按页面核验；stationDelivery。
- 页面操作清点：change、create。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：station.createBatch。
- 本轮检查：建批次常驻门牌标签及每行格式已看，空表单禁用；未建批次。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：驿站资格、有效门牌批次/校验/重复提交；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P64 驿站配送任务

- 路径：station/worker/worker。前置：住户申请／驿站／服务员，按页面核验；stationDelivery。
- 页面操作清点：load、accept。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：station.acceptBatch、station.providerHall。
- 本轮检查：本人无配送资格，直达回首页；成功工作台未测。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：服务员/配送资格、非空批次接单；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P65 驿站批次

- 路径：station/batch/batch。前置：住户申请／驿站／服务员，按页面核验；stationDelivery。
- 页面操作清点：load、start、delivered、failed。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：station.checkDoorDeliveryConsent、station.providerBatch、station.recordDelivery、station.startBatch。
- 本轮检查：QA25缺编号提示/按钮实景通过；2026-11-10实点返回station/worker/worker → pages/index/index：当前resident/admin账号无配送权限，providerHall实测E_FORBIDDEN并回首页；不是配送成功流程。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：合法配送批次、开始/送达/失败及住户隐私授权；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。
- 问题记录（含已修复历史）：QA25已批准并修复

### P66 送餐上门

- 路径：elder/meal。前置：真实微信用户，业务页需对应绑定/参与关系；elder。
- 页面操作清点：load、addressChange、change、slotChange、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、order.create、order.detail、order.mockPay、order.quote、order.subscriptionTemplates。
- 本轮检查：食堂未配置/功能关闭；QA24实际价格栏及禁用确认已核对。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：食堂/服务费/商品上限、有效报价/下单/履约；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P67 陪诊预约

- QA84：开始时间下方随地址、日期和时长显示可选开始时间或调整提示。320、375、390、430 CSS px 微信游客模拟器分别核对 2 小时、4 小时及切回 2 小时的渲染边界与提示，四宽均通过。真实体验版更新及手机有效时段报价仍待验。

- 0.1.4 真机录屏：默认明日，滚动后取消保留原日期，确定后更新日期，实际返回首页。超出值班时段的 09:00、10:00 受到拦截；有效时段成功报价与真机跨午夜仍待验。

- 路径：elder/escort。前置：真实微信用户，业务页需对应绑定/参与关系；elder。
- 页面操作清点：load、addressChange、change、retryQuote、submit。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：catalog.getCommunity、order.create、order.detail、order.mockPay、order.quote、order.subscriptionTemplates。
- 本轮检查：陪诊390宽上半屏已看；11月10日320宽上下屏完整说明及底部价格栏无观察到遮挡；实点重新报价仍提示功能未开放、确认下单保持禁用。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：陪诊资质及价格配置、日期/完整时段、有效报价/下单；键盘/多尺寸；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P68 预约上门回收

- 路径：recycle/order/order。前置：真实微信用户，业务页需对应绑定/参与关系；recycle / points。
- 页面操作清点：category、note、selectSlot、load、create。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：order.create、order.quote。
- 本轮检查：QA53/QA54：临时关闭热重载后320/375/390/430恢复卡片、受控导航失败提示、原表单隐藏及实际按钮进入原closed测试订单均已核对；四宽详情ID匹配、无错误、凭据自动清除。320实际返回/重进无残留，375/390实际返回首页；430详情后返回/重进未测。原热重载文件及运行日志恢复已核实。375热重载开启时仍实见未注册空白，根因未知。非真实回收预约成功链。 本轮热重载保持开启：430正常进入、实际返回首页、重进状态及截图正常；375设备切换重启后页面可见、实际返回首页、后续进入状态正常，不能把设备切换前后算同一实例。390本轮补验因锁屏未执行。原375空白失败证据保留。 QA54本轮390热重载开启：同一运行实例普通首次进入、实际返回首页、重进均正常；loading=false、error为空、created/busy/navigating均false、恢复方法存在；不替代旧订单详情连续返回链，历史375未注册空白根因仍未知。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：回收企业配置、真实预约/履约/称重/积分/舍入/对账；375/390详情返回后再进、430详情后返回及重进；真机/应用重启、大字体/键盘及用户视觉签收；分包偶发空白根因未定
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。

### P69 小区公告

- 路径：notices/list/list。前置：真实微信用户，业务页需对应绑定/参与关系；notices。
- 页面操作清点：load、loadMore。逐项触发，验证文字、数据、导航及失败恢复，不把事件存在当作功能通过。
- 后端关联：content.listNotices。
- 本轮检查：公告读取成功空列表；QA18读取失败隔离通过。静态/隔离结果只覆盖对应检查范围。
- 功能证据：未完成完整业务闭环；具体已有成功样本与前置见PAGE_ACCEPTANCE及TEST_HANDOFF。
- 未完成：同区有效纯文/图片公告、分页与私有媒体；未完成的多尺寸/大字体/键盘及用户视觉签收另列
- 记录：版本____ / 设备____ / 角色____ / U1–U7____ / F1–F6____ / 实际结果____ / 证据____ / 用户签收____。






## 当前必须保留的验收缺口

1. 前轮授权部署已完成；前轮order/admin为02a4470，77+76=153源码一致，替代此前12函数回读中的对应版本。QA32/QA33仅前端修改，QA34 admin新包02e7d65已具体授权部署，76/76源码一致，空分页及负偏移拒绝已实测；不把历史回读当作本轮云端实测。
2. 珺悦真实楼栋/单元已维护，本人手填绑定及刷新持久化已验证；四核心价格/班次/北门站点已保存回读，四项报价和五项拒绝边界已测。月卡/报酬/分成/人员等资料尚不齐备。
3. 本人住户/admin入口及管理读取已有实景记录；其他角色、跨账号/跨小区权限、真实审核发布履约结算和非空分页未完整验收。
4. QA09–QA34各项已测/未测以11月10日续验报告为准，不能将局部样本记为完整通过。未开通扩展仍保持原开关；各模块成功数据与平台能力测试不因源码存在而通过。
5. D05、D06继续暂缓；真实支付退款提现、门锁加解密、timer定时任务及补偿不宣称通过。
6. 定位全局开关和珺悦坐标已按此前授权配置；真机允许/拒绝、GPS远近、前台共享和停止、坐标索引一致性仍待完整实测。
7. 69页全部U1–U7/F1–F6、320/375/390/430宽度、大字体、键盘、安全区、所有状态以及用户设计签收仍未完成；四核心页局部通过不能外推全页/全设备。
8. 原40场景、15关闭回归、4真实支付场景不缩减，全部平台、配置、上线前剩余事项见[当前完整清单](../verification/2026-11-09-all-pages/README.md#当前仍未完成不遗漏原验收范围)。


## QA17–QA25逐项状态（2026-11-09）

69页均有单独状态记录；完整通过页数仍为0（以全部UI/功能标准和用户签收计）。[机器可读台账](../verification/2026-11-09-all-pages/page-status.json)为每页列出U1–U7、F1–F6，共897个判定项；“部分”不计作“通过”。当前主要390逻辑宽度，其他尺寸/键盘/大字体、真实非空数据和多角色链路仍待验。最新证据和剩余分组见[续验报告](../verification/2026-11-09-all-pages/README.md)。

## QA40–QA42 本地整改完成，真实验收未完成

QA40五页读取保护、QA41商家/服务分页、QA42导出空选择器均已按A完成本地整改；13项复现转通过，15项扩展回归、24项导出关联回归、53组624项Jest及77WXML/78WXSS官方编译通过。QA41 merchant新包已部署，云端76/76源码一致且依赖存在；真实会话4项空分页/非法偏移检查通过；非空分页及最新6页真实UI未完成；69页整体未通过，D05/D06暂停。

P19/P21/P26/P30/P33：继续核对真实非空列表、筛选、分页、弱网/离页及原审核流程；P30须先部署merchant新包。P32：第三段录屏已核对QA38/39所示流程，QA42空选择器禁用需新版真机复验。详情见[本轮完整记录](../verification/2026-11-10-all-pages/README.md)。原有各页未完成项保留，不用新增局部通过覆盖原业务缺口。


### 2026-11-12 QA52 月卡购买恢复补充

用户已批准A，四类月卡取得订单编号后锁定购买，失败仅重试打开已有订单；按本人隔离最小恢复凭据，不存入户密码。前端及SPEC已同步，44项隔离回归与12项地址切换回归通过；53套624项Jest、77WXML/78WXSS编译及69页207组生命周期检查通过。无新增云包或云端月卡订单。

**本轮390宽样本已补验收尾**：本人最小凭据在新页面实例恢复；失败提示可见、购买表单隐藏。实际按钮打开原测试订单，回读ID匹配且已关闭、本地凭据已清除；实际返回后月卡页加载成功、恢复卡片消失、忙碌状态解除，正常显示无计划/无月卡空态。本次为注入既有测试订单的恢复导航，不是购卡成功。实际应用重启、其他宽度、真机及月卡购买激活/任务生成仍未通过。详见 [QA52证据](../verification/2026-11-12-mock-orders/README.md)；69页整体未全部通过。


### 2026-11-12 QA53 回收预约恢复补充

已按用户批准A整改并更新SPEC/SPEC_EXT/TASKS：未知创建结果且输入相同复用请求编号；取得订单ID后锁定创建，只恢复导航；本人隔离最小凭据及离页保护。21项专项、15项关联、53套624项单测、77WXML/78WXSS编译和69页207组离线生命周期通过。

**实际页面未标通过**：QA53：重开项目后实读320宽、恢复方法存在、本人归属匹配；受控导航失败返回预期提示，未写本地持久凭据。后续界面通道超时；恢复后重进又出现空白，日志为页面尚未注册，实例仅框架字段。卡片截图、实际按钮、返回仍未通过；QA54临时关闭热重载对照方案已在对话提出，待决策。QA52的320恢复补验也未通过，375/430尚未补测；390样本此前已验证。无新增订单、云包或main合并。全部69页完整UI/业务仍未通过，详见本轮README和逐页清单。


### 2026-11-12 QA54受控对照补充

用户已批准A。320宽关闭热重载后首次进入、实际返回首页、再次进入均注册成功，无业务加载错误；不是回收下单成功链。恢复卡片命令被Mac锁定中断，执行及本地测试凭据状态未知，解锁后须回读清理。原配置已逐字节恢复，运行时回读待验。卡片、按钮、订单详情及其他宽度仍不标通过；根因未定。见本轮qa54-hot-reload.json。


### 2026-11-12 19:57 QA53/QA54 320宽恢复链收尾（覆盖上方锁屏待验状态）

解锁后先回读，上次未留下回收测试凭据。沿用QA54授权临时关闭热重载并编译，当前本人最小凭据恢复成功；受控导航失败后恢复卡片、完整换行错误提示及“前往已有订单”按钮实际可见，原预约表单隐藏，导航API立即恢复。实际点击按钮进入原已关闭测试订单，回读ID匹配、loading=false、error为空、status=closed、本地凭据已自动清除。第一次返回点击审批超时，按工具允许重试一次后实际返回首页；再次进入回收页loading=false、error为空、createdOrderId为空、busy/navigating均false，凭据不存在。

原热重载配置已逐字节恢复true，19:57启动日志明确显示“已开启代码文件保存后自动热重载”，文件及运行时恢复均已核实。**本次320宽注入恢复、按钮、详情、返回和重进样本完成；不是实际回收预约成功链。** 375/390/430回收恢复样本、真机、实际应用重启及真实预约/履约/积分/对账仍待验；关闭热重载后本次未复现空白不等于确定根因或永久修复。本轮无业务源码变更、云包、新订单或付款。证据见qa54-hot-reload.json。


### 2026-11-12 QA54四宽补测与QA55整改收尾（最新状态）

本节覆盖此前QA54“375/390/430恢复样本未执行”的记录，不撤销实际失败证据。

| 范围 | 实际结果 | 验收边界 |
|---|---|---|
| QA53/QA54 320 | 既有证据：恢复卡片、失败提示、实际按钮、原closed订单详情、凭据清理、返回及重进均通过 | 临时关闭热重载；注入恢复样本，不是真实回收下单 |
| QA53/QA54 375 | 本轮关闭热重载后卡片/按钮、原closed订单详情、凭据清理、实际返回首页通过 | 开启热重载时重进曾实际空白并报页面未注册；返回后再次进入尚未测 |
| QA53/QA54 390 | 本轮关闭热重载后卡片/按钮、原closed订单详情、凭据清理、实际返回首页通过 | 详情返回后再次进入尚未测 |
| QA53/QA54 430 | 本轮关闭热重载后卡片/按钮、原closed订单详情、凭据清理通过 | 详情后实际返回及重进尚未测 |
| QA55 预约初始化 | 18/18专项、25/25关联；同一专项对修复前源码仅2/18通过；53套624项Jest及77WXML/78WXSS官方编译通过 | 隔离测试不替代真实商家业务 |
| QA55 430实景 | 受控初始化错误时隐藏表单/提交；实际点重新加载后读取本人地址成功、错误清除、草稿保留，表单恢复；实际返回首页 | 使用合成服务编号，未提交预约；其他宽度、真机和真实多地址未验 |

QA55已按用户A更新SPEC/SPEC_EXT/TASKS：身份与地址初始化成功才提交、失败只读重试、保留需求与有效地址选择、忙碌及离页/迟到响应保护；保持原QA21请求幂等、价格、权限、支付规则。新增代码仅前端，不需要云函数部署。实际页面所见薄荷页头、白色圆角卡片、常驻标签与按钮无观察到截断/重叠；不据此认定整页所有状态及69页全部通过。

热重载原配置已逐字节恢复true，20:51:04运行日志确认开启；测试恢复凭据已自动清除，临时导航/会话方法均已恢复。本轮新增云端订单0笔、真实扣款0元、云部署0次。QA54根因仍未知，不以关闭热重载时未复现宣称永久修复。

剩余：上述未测返回/重进、QA55其他尺寸与真机；69页各自剩余UI/业务项；D06实际入户密码加解密生命周期、其他真实角色/多账号与成功业务；真实微信支付、订阅送达等仍需相应资料/配置和具体测试范围。既有两笔模拟订单结果不扩展为这些项目通过。


### 2026-11-12 21:35后续实测与QA56待决策

- QA55预约页：320/375宽受控读取失败、实际重试、草稿保留、错误清除、表单恢复及返回首页均有真实点击/截图证据；430沿用上一轮。390设备切换后Mac锁定，未完成，不标通过。真实有效服务、键盘/大字体、真机和多地址仍待验。
- QA54回收页：本轮没有关闭热重载；430正常进入→实际返回首页→重进正常，无busy/navigating/恢复状态残留。375切换设备有重启日志，页面可见、实际返回首页、后续进入状态正常；不混算为设备切换前后的同一实例。390补验未执行。此处不替代原订单详情的连续返回链，也不推翻此前375开启热重载时的未注册空白失败，根因未定。
- QA56已直接在对话按5W2H提出，待用户决策，未修改申请页：实际页面代码合成测试显示商家申请迟到结果产生1次提示、1次返回和1次页面更新；驿站产生1次提示、4次更新及2次读取；商家上传迟到产生1次更新。推荐补忙碌与离页保护、重进只读核对、不自动重提，保留草稿并验证系统选图正常返回。测试无真实申请或上传。
- 已请求解锁以继续390界面验证；本轮无新增订单、付款、云部署或角色变更。证据：qa54-55-followup.json、qa56-repro.cjs/json（位于docs/verification/2026-11-12-mock-orders）。


### 2026-11-12 QA56修复与390宽补验（覆盖上述历史待决策/待验状态）

|项目|本轮证据|仍未通过的范围|
|---|---|---|
|QA56商家/驿站申请|用户批准A；初始化、忙碌、隐藏/卸载、迟到响应保护及同身份选图返回处理已实现；相同33专项修复前6/33、修复后33/33；原复现探针迟到提示/返回/写界面/额外读取均为0|合成选图生命周期不代表真实手机相机、真实上传和申请审核完成|
|QA56真实页面|390宽商家上下屏禁用表单、关闭功能错误、实际重试；驿站关闭错误、无假未申请表单、实际重试及返回按钮已看|两页真实成功业务、320/375/430、大字体/键盘、真机；本轮不启用功能或提交申请|
|QA55商家预约|本轮390宽补齐受控初始化失败、实际只读重试、草稿保留、错误清除、表单恢复及返回首页；320/375/430沿用已有证据|四宽仅该目标样本，不是整页所有交互通过；真实服务、多地址、预约支付、真机/键盘/大字体未验|
|QA54回收重进|390热重载开启，同一运行实例普通进入→实际返回首页→重进正常，方法及页面状态回读正常|历史375未注册空白根因未知；不把本轮普通返回当作旧订单详情连续返回链|
|关联/全量检查|65/65关联，53套624项单测；69页207组错误/关闭/未绑定加载无未捕获异常；77模板组件引用、77WXML/78WXSS官方编译通过|这些都不替代69页视觉或成功业务验收|

关联旧脚本曾有2项失败，修复前84f92c5同样复现：举报文案已由QA47改为“暂无符合当前筛选的举报”，管理员商家服务读取已由QA41要求列表加载完成。仅校正旧测试断言/前置，保留基线结果；对应业务代码未改。QA19商家手填电话测试也按已批准初始化门槛先读取再输入，原草稿保留断言不变。

本轮仅前端，无新增云包；新增订单0、真实申请0、文件上传0、真实付款0。热重载设置未改。规范见SPEC/SPEC_EXT QA56；证据见 `qa56-regression.json`、`qa56-baseline-qa56.json`、`qa56-repro-after.json`、`qa56-checks.json`、`qa56-compile.json`、`qa56-live-ui.json`（均位于docs/verification/2026-11-12-mock-orders）。

剩余继续按69页逐项台账，不宣称整体验收完成：上述真实业务/真机/多尺寸；D06实际入户密码加解密生命周期；各角色审核及协作、多账号越权/并发、真实支付和订阅送达、其余页面未覆盖状态与用户视觉签收。新数据写入或配置范围另在对话以5W2H提出，不依据本轮只读测试扩大授权。


### 2026-11-12 QA57/QA58（覆盖本项历史状态，非整体验收完成）

|项目|已取得证据|未完成与边界|
|---|---|---|
|QA57列表/角标|已按A修复住户及后台列表隐藏/卸载保护、未读响应序号和迟到错误保护；同31项修复前11/31、修复后31/31；原13项由7/13到13/13|合成响应测试不替代真实弱网、非零未读消息、多账号并发|
|320宽住户订单|宽度回读320；空态、实际切到已完成、两张终态卡片、实际滚到底部入口无遮挡；三筛选按钮同顶且等高37px|该宽详情返回、其他业务状态、大字体/真机未全验|
|375宽住户订单|宽度回读375；实际已完成切换、两终态卡片、底部入口无遮挡；三按钮同顶且等高44px|其他状态、详情返回、大字体/真机未全验|
|390宽住户订单|进行中/售后空态、两终态卡片；已关闭详情实际打开和返回后筛选保留；三按钮等高45px|整页所有状态、非零未读与分页未全验|
|430宽住户订单|仅切换iPhone14ProMax设备后被锁屏中断|页面结果/截图/尺寸回读未完成，不能算通过|
|390后台订单|全部两笔→待报价空态→全部；实际已关闭详情→返回，筛选/两条记录/加载与错误状态回读正常|其他尺寸、真实分页、物业身份、业务写操作未验|
|QA58展示|已按批准A改订单金额、支付记录事实及door/hand中文；13/13实际页面合成回归|新版实景待解锁补验；详情接口不返回payment模式，不能据timeline认定真实扣款；退款记录单列|
|全量检查|53套624项单测，69页207组错误/关闭/未绑定加载无未捕获异常；77WXML/78WXSS官方编译通过；QA40-42 15/15、QA56 33/33关联通过|均不替代69页真实UI及成功业务验收|

本轮仅前端，无新增云包、订单、付款、申请、角色或开关变化。热重载未更改。设备切换会重启运行实例，不声称跨重启同一实例连续验证。规格已同步SPEC、SPEC_EXT、TASKS及项目偏好。证据：
- docs/verification/2026-11-12-mock-orders/qa57-regression-before.json、qa57-regression.json、qa57-checks.json
- 同目录 qa58-regression.json、qa58-checks.json、qa58-compile.json、qa57-58-live-ui.json

仍未完成：上述未验项、QA54历史375分包未注册空白根因、QA55/56有效商家/驿站业务及真机选图、D06实际密码加解密生命周期、真实角色审核/接单履约、多账号越权与并发、真实微信支付/退款和订阅送达、69页剩余状态/大字体/真机/用户设计签收。D05模拟配置与已有两笔模拟订单终态是已取得证据，不等于真实支付通过；D06配置完成不等于业务加解密闭环通过。逐页明细见 docs/verification/2026-11-11-ui-audit/pages.md，不把缺资料或未验证项计通过。


### 2026-11-12 23:47 解锁后的430宽与QA58补验

覆盖上一节这两项“锁屏待验”：430宽回读已确认；住户进行中空态、已完成两张终态卡片及详情入口截图无重叠，三个筛选按钮同顶等高50px；实际进入已关闭详情再返回，done/count=2/loading=false/error空/hidden=false。

QA58新版后台详情430宽已看两笔现有订单：未付款关闭显示“订单金额 ¥1.00”“未见支付成功记录”；已模拟付款后取消显示支付记录及独立退款卡片“¥1.00 · 成功”；交付方式显示“放门口”。长说明换行正常，无观察到截断重叠。两页实际刷新与返回已操作，退款样本刷新后的金额、状态和退款记录只读回读一致，loading=false/error空。未创建订单或执行退款。控制台0错误、12警告；包含基础库/工具警告，未称零警告、未改工具设置。

剩余：QA58新版其他宽度/大字体与其他支付退款状态；订单真实跨页/非零未读/弱网/多角色；其余未覆盖状态；69页总体清单其余待验不变。四宽列表目标样本通过不等于整页或69页全部通过。证据更新qa57-58-live-ui.json；本次仅验收记录更新，业务代码仍419f0d0，既有31/31、13/13及624/624结果沿用，不虚报本轮重跑。

23:51追加：430售后实际切换为空态，旧卡片清除；后台退款详情实际返回后读到全部筛选、2条记录、loading=false/error空。末次截图警告累计14（此前读取12），不报告零警告。


### 2026-11-13 续验：我的与协议，QA59待决策

430宽实际核对我的上屏、商家/驿站关闭提示、物业资格提示、服务员申请上下屏与协议七组全文/返回。隐私入口和管理员入口本轮补验未完成，工具后续明确报告Mac锁定。入口17项隔离回归、本轮624项Jest通过；QA59另有7/8失败，已在对话交用户决定，业务代码未改、规格未擅自生效。没有新增订单、申请、付款、上传或角色/开关变化。

详细证据与边界见[本轮记录](../verification/2026-11-12-mock-orders/README.md)，完整69页状态见[P01–P69台账](../verification/2026-11-11-ui-audit/pages.md)。QA59、未覆盖尺寸/状态、真实角色/扩展成功业务、D06云端加解密和其他既有待验仍未完成，不因入口/阅读样本通过而标整页通过。


### 2026-11-13 QA59修复完成，430补验已更新

覆盖此前QA59待决策状态：已按批准A补齐我的加载保护、商家/驿站独立失败与重试。原探针8/8、新增21/21、入口17/17及全量624/624通过；69页207组边界、组件引用、官方模板/样式编译通过。430实际点击两类受控错误重试，随后清理替身并真实刷新；隐私四组上下屏/返回、管理员入口/看板/返回也已补验。仅前端，无新增云包或业务数据。

QA59其他宽度/真机和真实申请状态未全验；69页完整UI、真实角色成功业务、D06实际加解密、真实支付及订阅等剩余不变。详细证据见本轮qa59-live-ui.json、qa59-checks.json及69页逐项台账；本次不标整体验收通过。

2026-11-13 续验：P10 的受控错误独立重试已补320、375，连同既有430共三个宽度；390仍缺运行宽度和按钮证据。两张优惠券页、小区公告页的待决策缺陷与可复现结果见[按页记录](../verification/2026-11-13-widths-coupons/README.md)。不计为整页签收。

2026-11-13 P36、P37、P69已按QA60/61修复，离线乱序与离页回归通过。P37已核实390宽开关关闭提示。[三页证据与待验项目](../verification/2026-11-13-widths-coupons/README.md)

QA59：“我的”390宽双重试已补，目标样本四宽完成。QA61：390宽两页样券显示“减免20%”。QA62：已修复样券与无券提示并存；官方模板渲染16/16通过，新版模拟器导航超时，修后实景待验。 [逐项证据](../verification/2026-11-13-widths-coupons/README.md)

QA62 两张券页四种宽度各6项交互通过。QA63 公告换区失败清空旧卡片，同区翻页失败保留原页并按原偏移重试，四种宽度均通过。使用微信开发者工具本地合成数据。 公告隐藏记录分页 QA64 待决策。[本轮数据](../verification/2026-11-13-widths-coupons/README.md)。

QA64 前后端过滤分页通过16组回归。P34、P48、P69 合成列表在四宽完成目标样本，开发云部署及真实业务待验。[测试记录](../verification/2026-11-13-widths-coupons/README.md)。

QA64 的 content 开发云回读 76/76 一致，已核对 SDK；珺悦公告实读 offset 0、20 均返回 0 条，nextOffset 分别是 0、20，hasMore 均为 false。。QA65 五个住户列表 20 项时序、7 组筛选/分页/广告关联回归通过，新版模拟器五页四宽 80 项样本通过。珺悦五项接口实读均返回 E_FEATURE_OFF；真实非空业务待验。

QA91–QA93：P58 社区商家、P59 商家详情和 P60 提交预约已完成合成数据下的分页、旧响应、失效入口和两种计价的并发建单回归。P58 的珺悦关闭态已看到；非空真机、云上同名排序与可用索引、模拟器四宽分别记证据，不据此勾选整页通过。详见 [QA91–QA93 验收记录](../TEST_HANDOFF.md)。

QA91–QA93 后续：P58、P59 的 390 宽合成商家列表和服务卡片渲染已过，续页断网保留、重试至末页及详情被拒后清空已核对。其余三个尺寸待验。真实会话对珺悦和示例花园均已读到关闭态。

P58 周边商家在示例花园临时开启时，实际云端旧入口、首批、续页三次查询成功，均为空列表；小区及全局开关已回读与原值一致。P59 商家详情没有可见商家样本，真实服务查询待验。

P58、P59 本轮分页及旧服务清理的模拟器补验已完成。320、375、390、430 CSS px 均有页面实测回执，两页共 8 项通过。开发云非空服务详情与住户真机点击仍待验。[四宽结果](../verification/2026-11-16-escort/qa91-93-simulator-widths.json)

P60 提交预约的双地址表单已在 320、375、390、430 CSS px 量测。地址选择器、输入框和提交按钮均在水平边界内，纵向排列无重叠，选择和输入处理函数可更新页面。原生选址、真机键盘及真实预约待验。订单响应丢失后重试和切换账号的边界见 [P60 补验记录](../TEST_HANDOFF.md)。

P60 商家预约 QA94、QA95 已用合成住户完成固定价及报价制的断网找回、按原编号重提和换人清空检查。新版恢复状态已取得 320、375、390、430 四宽模拟器回执，真机仍待验。证据见 [联调台账](../TEST_HANDOFF.md)。

P07 订单卡片和 P08 订单详情的 QA96、QA97 专项已用合成订单补验。320、375、390、430 宽均观察到待报价文案和金额互斥；固定价与已报价显示金额，详情刷新失败清除旧备注与支付按钮。以上覆盖指定控件的实际渲染，真机弱网、换账号和真实商家预约待验。[四宽回执](../verification/2026-11-16-escort/resident-order-detail-widths.json)

P08 订单详情 QA98、QA99 已补验照片预览和模拟支付确认的离页时序。40 项隔离场景及 2 项支付边界通过；0.1.8 是修复前的体验版，手机原生预览及弹窗另行验收。[验收台账](../TEST_HANDOFF.md)

P08 QA98、QA99 已补齐 320、375、390、430 宽模拟器离页及返回交互。四宽均忽略旧回调，重新操作各生效一次。手机原生预览及弹窗待验。[实测回执](../verification/2026-11-16-escort/order-detail-lifecycle-simulator.json)

P49 活动报名和续付、相关住户下单入口、P32 养老补贴导出列入 QA100–QA102 待整改项。当前有隔离复现证据；真实微信收银台、手机原生确认及云端实际报表仍待验。[分项回执](../verification/2026-11-16-escort/experience-019-payment-export-baseline.json)

P49 活动支付 17 组、关联下单场景 84 项隔离回归通过。P32 养老补贴导出的跨页样本和新金额口径已在隔离环境验证。手机原生支付、管理员真实云端导出另验。[联调台账](../TEST_HANDOFF.md)

QA100 付费活动详情已在 320、375、390、430 宽完成实际页面离开和返回。四宽均显示首次可报名，取消后保留待付款和续付入口，旧确认触发 0 次模拟支付；返回后重新确认只触发 1 次并显示已报名。支付确认回调和接口使用合成样本，手机原生收银台仍待验。[四宽回执](../verification/2026-11-16-escort/paid-event-simulator.json)

**2026-11-17 体验版 0.1.10 与 QA102 开发云回读。** 微信公众平台版本管理已显示 0.1.10「体验版」，对应前端 c84ead3。开发云 admin 下载产物 76/76 个源码与配置文件匹配，wx-server-sdk 4.0.2。用下载的函数在隔离环境复测 102 笔合成订单，普通住户导出被拒。活动支付回调补测 5 项，合法重复回调无二次写入，最后 1 笔订单、1 条已报名、1 个名额。住户手机原生支付交互待验。[部署与联调回执](../verification/2026-11-16-escort/qa102-cloud-readback.json)

P49 活动详情 QA103 取消确认及 QA104 迟到付款退款已在隔离环境通过 36 项与 12 组回归。退款测试覆盖实际支付回调、模拟支付、退款回调及补偿入口，采用合成渠道与数据库。P49 四宽各完成一次取消确认测试。恢复 390 后额外复跑在返回阶段超时。测试工程重新初始化合成状态并等待导航结果后，390 宽再次完整通过。体验版 0.1.11 已上传并回读；开发云三包 228/228 个文件已回读，下载代码的隔离退款复测 12/12 通过。手机原生弹窗、真实支付渠道待验。[专项结果](../TEST_HANDOFF.md)

P49 活动详情 QA105、QA106 的报名、续付和举报身份校验，33 项隔离回归及四种宽度的受控交互已通过。旧详情不能替新住户提交。体验版 0.1.12 已在公众平台回读，手机原生交互待验。[四宽记录](../verification/2026-11-16-escort/event-action-identity-widths.json)

P49 与 P50 已用合成住户、组织者贯通免费报名、从模拟扫码结果签到、名单及住户状态回读、重复扫码拒绝。管理页翻到第 21 场（QA107）及物业、商家换区后拒绝旧活动签到（QA108）均未通过。手机相机扫码和开发云真实签到待验。[联调记录](../TEST_HANDOFF.md)

QA107、QA108 整改后，P50 在 320、375、390、430 宽均从 20 场续读到 21 场，错误重试保留首批，第 21 场名单可读。物业和商家换区后的签到均拒绝；跨小区管理员及原小区组织者正常。前端使用游客工程与合成接口，权限及签到写入使用隔离数据库。云端与真机另验。[四宽实测](../verification/2026-11-16-escort/event-management-paging-widths.json)

2026-11-18，QA108 event 已部署且 76/76 文件回读一致；下载代码隔离回归通过。QA107 前端已在公众平台核对为体验版 0.1.13。P49→P50 真机出码、扫码及签到流程仍待验。

2026-11-18，P50 创建正常对照 3/3 通过；网络失败后重试创建的 9 个场景未通过，QA109 待用户决策，涉及重复活动及重复赞助账。取消活动、重复取消、任务重复处理和页面回读在三个管理角色下均通过隔离验证。上述结果不代表真实云端创建或取消已验收。[本轮结果](../verification/2026-11-18-event-management/results.json)

P50 QA109 已按 A 修复创建及提交结果丢失后的原活动恢复。三角色创建重试 12/12、赞助去重 4/4、恢复与事务边界 27/27 项隔离通过。320、390 宽只取得合成恢复状态和调用次数，按钮布局未确认；375、430 尚未测，工具明确报告锁屏。四宽视觉、实际点击、开发云新接口及真机均保留待验，不能算整页通过。[本轮详细台账](../TEST_HANDOFF.md)


2026-11-18 QA109 后续：event 已部署并下载比对76/76一致，SDK4.0.2；下载代码隔离回归27+12+4通过。320/375/390/430四宽均取得四种恢复状态的按钮矩形及创建1次、发布1次结果，“创建下一场活动”实际点击后返回空白表单；恢复成功卡片四宽截图未见截断或溢出。其余三状态逐张视觉、长表单底部真实滚动点击、本人云会话新接口、体验版及真机仍待验，P50不标整页通过。详见[本轮台账](../TEST_HANDOFF.md)及[原始尺寸](../verification/2026-11-18-event-management/qa109-simulator-widths.json)。


2026-11-18 后续补验：P50 QA109的390宽三种待验状态截图、实际滚动到底部和点击提交/找回通过，合成创建1次、发布1次；本人云会话只读查原活动的不存在及非法编号返回符合预期。320/375/430剩余逐状态视觉因截图与AX不同步仍待验，真机及体验版更新仍待验。新增QA110：列表发布/审核/取消/重试取消任务/签到的换人及迟到错误20项未通过、原页对照5项通过，待用户决定修复范围，未改业务代码。P50整页仍未验收通过。

## QA110 本轮结果（2026-11-18）

用户已批准 A，五种列表操作统一使用本人、加载序号和小区保护，补齐按钮禁用。实际页面隔离回归 95/95 通过；重试退款对照补齐真实可操作的 attention/failedCount 记录，原始整改前结果保留不改。覆盖原页、换人只读刷新、会话核对期间换人、重复点击、可见错误、隐藏/卸载/刷新/重进后的成功和失败，以及旧请求不解除新操作忙碌。

关联回归：活动创建恢复 27 项、创建重试 12 项、三个管理角色取消流程、活动翻页及报名名单 10 项均通过。全量 Jest 55 套 652 项通过，git diff --check 通过。游客模拟器当前取得的宽度及运行记录见 qa110-simulator-partial.json；截图/AX未与运行状态可靠对应，因此四宽视觉与实际点击均未签收，430尚未执行。仅前端，未改云函数，未上传体验版，真实活动、退款及签到新增0。后续继续补界面验证；不能据专项结果认定 P50 或69页整体通过。


2026-11-18下午更新：QA111扫码保护按A完成，30项隔离回归通过；QA110五种管理操作的390宽实际点击回执齐全。QA111的375/390宽失败、取消、成功均实点并核对画面；320只有失败运行状态及按钮尺寸，430仅初始化，弹窗操作未生效，缺项保留待验。QA112已获A批准并修复，21项定位隔离回归及22项关联门锁回归通过，真实定位另验。详见[最新验收台账](../TEST_HANDOFF.md)。

QA113：服务员放弃任务旧确认6项隔离失败，已在对话提交推荐方案，待用户决策；不计通过。详见[最新验收台账](../TEST_HANDOFF.md)。

2026-11-18最新：QA111四宽的失败／取消／成功实际点击及截图已补齐；QA113按A修复，36项隔离回归通过，定位21项、门锁22项关联通过。QA113实际页面点击及原生弹窗仍待验，体验版未更新；此前QA113待决策标记由本条覆盖。详见[最新验收台账](../TEST_HANDOFF.md)。


2026-11-18 QA113最新补验：320宽任务卡片和取消后按钮恢复已取得实际点击、画面及0次release回执；真实导航触发基础库bg空值及__global错误，返回链未完成。普通编译后的截图/AX不一致、坐标输入noWindowsAvailable，375/390/430与其余交互仍待验。36项隔离、定位21、门锁22、Jest652及69页207离线加载检查通过；不代表页面整体通过。详见TEST_HANDOFF最新节及qa113-simulator-partial.json。体验版未更新，无真实任务、位置或资金写入。


2026-11-18 QA114：按A修复开始服务、普通完成及任务重新读取保护，88项隔离通过；关联36/21/22项及Jest652通过，69页207加载检查无异常。320/375/390宽实际开始、读取失败清理、只读重试、完成失败再提交均取得页面及回执；430仅初始化，AppID提示和截图不同步阻塞，不计通过。未更新云包或体验版、未写真实任务。QA113四宽合成确认回执补齐，视觉/原生弹窗仍按TEST_HANDOFF分项保留。


2026-11-18 QA114四宽补齐：正常重开同一游客工程后，430宽开始、读取失败清旧任务、重新加载、完成失败及重试待确认均实际点击并核对画面，start一次、deliver两次均为合成调用。与已验320/375/390共同完成本轮目标流程；此前430待验由本条覆盖。真实任务、手机和其他历史缺项仍待验，未切体验版。详见TEST_HANDOFF最新节和qa114-simulator-430.json。


2026-11-18 QA115/QA116：用户两项A已实施，巡检独立提交和三类照片上传按本人、原任务及最新状态保护，系统选图正常返回需重新核验。97项隔离、关联88/36/21/22项及Jest652通过。430目标上传/报告失败重试与画面已核对；375各入口回执及主要截图已核对，巡检分项图片单独截图待补；320仅初始化，游客AppID提示未关闭，390未执行，均不算通过。无真实照片、任务、云部署或体验版更新。完整证据及历史缺项见TEST_HANDOFF最新节。


2026-11-18 QA115/QA116最新补验：320宽已实际点击完成照片失败重试、小票回填、巡检分项失败重试、报告失败重试待确认，并核对目标截图；5次合成上传、2次合成提交。390宽仅完成照片成功画面、小票回填回执及巡检照片首次失败，滚动noWindowsAvailable在重绑/重建连接后仍未恢复；小票完整画面、巡检重试及报告仍待验。375巡检分项图片截图待补，430沿用已验结果。无明确锁屏报错、游客提示已自行关闭，不把未验证项计通过。见TEST_HANDOFF最新节；本轮仅补验收证据，云端及体验版未更改。


2026-11-18 QA117：用户A已实施，联系住户绑定本人/原任务及联系权限，正常系统返回重读后接纳，换人/换单/刷新/关注重置作废旧结果。54专项及关联97/88/36/21/22通过，Jest652通过；原生拨号与四宽画面待验。QA115/QA116的375照片画面和390剩余项目本轮未新增通过，点击仍报noWindowsAvailable。无真实电话、报告、云部署或体验版更新；见TEST_HANDOFF最新节。


2026-11-18 QA118/QA119待决策：六项巡检照片4/5张时不可提交且无移除入口，24项合成检查12通过12失败；喂宠父单可从通用完成绕过pending上门，实际页面与云入口8项检查5通过3失败。两项已在对话按5W2H提请推荐A，未改生产规则。模拟器点击仍报noWindowsAvailable，375/390与QA117缺项继续待验。证据见TEST_HANDOFF最新节；真实云写入0、体验版未变。


2026-11-18 QA118/QA119用户两项A已实施：巡检六项照片限制1—3张，支持移除草稿引用重拍、修复超量草稿并明确列出不合格项目；喂宠任务隐藏通用完成表单，前端旧处理和provider.deliver均拒绝绕过逐次上门，已完成幂等返回保留。QA118 67/67、QA119 8/8、pet专用履约23/23及关联296项通过，Jest55套652项通过。390宽已看到4张照片与上限提示并实际移除至3张，回执无上传/提交；继续操作时Mac明确锁定。320/375/430、390重拍/提交及喂宠入口视觉仍待验，原生相机和真实履约未验。provider云部署待固定包授权，体验版未变；不计为69页完整通过。最新范围覆盖前条“待决策”，历史缺项保留。详见TEST_HANDOFF。

2026-11-18 QA118续验：390实际移除3→2并重拍回3，回执uploading=false/error空，1次合成上传、0次报告提交；最终图片/提交区视觉与其他三宽待验。重开后游客提示未能自动关闭，已请最小协助。QA119 provider部署已授权，上传窗口/哈希校验就绪，选包被工具目录权限拒绝，待用户选文件；尚未部署。见TEST_HANDOFF最新节。


2026-11-18 QA119开发云已完成：provider固定包3d10e68上传哈希匹配，官方浏览器下载后76/76源码一致、SDK4.0.2，下载代码8/8隔离回归通过；未执行真实履约或退款。QA118在320/390宽实际完成4→3→2→3照片移除补拍、合成报告失败重试至待确认，喂宠只保留上门清单入口。两宽各1次合成上传、2次报告提交，目标照片区与喂宠入口有同步画面。375切换时明确Mac锁定，430尚未执行；这两宽不计通过。原生相机、真实履约、完整喂宠资料及其他历史缺项保留，未切体验版。前述“尚未部署”由此更新；详细边界与证据见TEST_HANDOFF最新节。


2026-11-18 QA118补验：375宽照片4→3→2→3实际操作与同步布局已核对，上传期间按钮禁用；合成报告首次失败且六项照片保留，回执1次上传/1次提交。准备重试时Mac再次明确锁定，375成功末态和喂宠入口、430全流程仍待验。320/390此前结果保留，云包及体验版未改，详细边界见TEST_HANDOFF最新节。


2026-11-18 QA118/QA119四宽目标流程补齐：375原失败草稿重试实际进入待确认，喂宠入口及表单隐藏已截图；430实际完成4→3→2→3、首次合成失败、原提交按钮重试成功及喂宠入口核对。四宽独立回执均1次合成上传/2次提交，照片数序列、失败保留、delivered与pet模式交叉核对通过。430补拍和失败/成功/喂宠入口同步画面已核对；上传中禁用仅回执，不计该状态截图通过。320/375/390失败提示所在屏、真实相机、真实履约、完整喂宠资料及其他历史缺项保留；69页整体未完成。未改生产代码、云端业务数据或体验版，详见TEST_HANDOFF最新节。


2026-11-18 QA117游客拨号工程已准备，当前AppID提示未关闭且截图空白，四宽没有新增视觉通过项。独立巡检报告重试8项安全检查通过，响应丢失后重复提交不重复写、手动读取能确认完成；但错误提示误导，QA120已在对话按5W2H提请决定失败后先只读核对，尚未修改生产代码。Jest55套652项通过，真实业务写入0，云端与体验版未变；完整边界见TEST_HANDOFF最新节。


2026-11-19 QA120用户A已实施：报告提交失败先只读核对，已完成显示实际状态，核对失败仅读取重试，仍可操作保留草稿供主动重试，换人/离页拒绝旧结果。25专项、226关联及Jest55套652项通过。390宽两条合成恢复路径已实际点击并核对同步截图；320仅初始回执，重开后游客AppID提示未关闭，375/430未验，不算通过。QA117补430宽取消/失败/成功与等待禁用同步画面；390只有三种回执、截图不同步，320/375和原生拨号仍待验。云端与体验版未改，无真实业务写入；其他历史缺项与69页整体未完成状态保留，详见TEST_HANDOFF最新节。


2026-11-19 QA120四宽补齐：320/375/430两条恢复路径已实际点击并核对同步画面，与前轮390合并完成目标流程。四份独立回执均lost提交1次、not-sent首次失败加主动重试2次，读取失败仅重试读取，草稿保留、最终delivered；无自动重复提交。375切机型基础库报错/截图不同步经正常窗口缩放恢复后重新实测，未把此前尝试计通过。无生产代码、云部署、体验版或真实业务数据变更；QA117三宽视觉和原生拨号、其他历史缺项及69页整体未完成状态保留。详见TEST_HANDOFF最新节。

2026-11-19 P11/QA117补验：320/375/390联系住户的等待禁用、取消恢复、失败提示和主动重试成功说明均已取得同步画面，合并430前轮结果，目标流程四宽通过。独立回执确认每宽cancel/failure/success各一次，最终无错误、无忙碌；未拨真实电话，不将合成回调算原生拨号或接听证据。此结论仅覆盖目标区域，P11整页及69页完整验收仍未完成；历史独立上传/小票、相机、履约等缺项保留。

2026-11-19 P11/QA116补验：390宽小票全图与底部按钮、巡检分项上传失败后重试成功的全图/数量/移除与上传按钮，375宽巡检分项独立图片区域均取得同步画面。两个宽度补充回执分别4次/2次合成上传、无报告写入；不覆盖旧回执。已关闭前文对应的独立照片视觉缺项，真实拍照上传、完整表单设计和真实履约继续待验；P11及69页不标整体通过。详见TEST_HANDOFF最新节。


2026-11-19 QA110三宽补验：320/375/430五类管理按钮均已实际点击并核对同步目标卡片画面；手动请求分别5/6/5次，375审核明确点击两次、签到另一次编译，自动探针与人工操作分别记录。最终error空、busy=false，当前95专项及Jest55套652项通过。结合此前390，目标卡片和五类点击四宽补齐；忙碌态逐张截图、原生扫码、真实退款签到与P50/69页整体验收不据此算通过。仅保存证据，无生产代码、云端或体验版更改，详细证据与其他缺项见TEST_HANDOFF最新节。


2026-11-19 QA109补验：430宽实际核对查询失败、原资料确认、创建响应丢失、找回已发布四态，独立回执确认create=1/publish=1/lookup=5、最终无错误与忙碌，底部提交按钮同步画面已核对。390沿用此前证据；375重开后初始卡片可见，但游客AppID提示无法自动关闭；320本轮未验，两宽不计完整通过。当前活动恢复27/27、创建重试12/12、放弃任务36/36及Jest55套652项通过。仅补证据，无生产代码、云端或体验版变更；原生交互及69页其他历史缺项保留。详见TEST_HANDOFF最新节。


2026-11-19 QA109 375宽补齐：用户关闭游客提示后，查询失败、原表单确认、创建响应丢失、原活动已发布四态及三次有效点击均取得同步画面；独立回执create=1/publish=1/lookup=5，最终无错误和忙碌。375/390/430目标流程现已有证据，320切换后截图不同步，随后工具明确报告Mac锁定，仍待验。Jest55套652项通过，仅补证据，无生产代码或云端变更；原生交互与69页其他缺项保留。详见TEST_HANDOFF最新节。


### 2026-11-19 QA109 320宽补验

320宽初始查询失败→原资料确认→创建响应丢失→原活动已发布均已实际点击并取得同步画面，独立回执确认create=1/publish=1、最终busy=false/error为空。目标恢复流程320/375/390/430四宽证据已齐；仅本地合成场景，不代表整页设计或真机断网通过。详见TEST_HANDOFF同日320宽段落及qa109-manual-320.json。QA113部分反馈/原生确认和扫码、定位、拨号、相机、真实履约等缺项保留，69页整体未完成。


2026-11-19 QA113 320宽反馈补验：取消→合成失败→取消三次实际点击及同步目标区域画面通过，独立补充回执3次确认/1次合成release、最终错误空且busy=false。375此前视觉证据保留；390控件错误与截图不同步，正常重开后的游客提示未能自动关闭，430本轮未验，均不新增视觉通过。专项36/36、Jest55套652项通过。原生确认、导航返回及69页其他历史缺项保留，无生产实现或云端变更。详见TEST_HANDOFF同日段落。


2026-11-19 QA113反馈四宽补齐：390、430实际取消→合成失败→取消清错均取得同步目标画面，独立补充回执各3次确认/1次合成release，最终busy=false/error空；按钮分别366×45px、404×50px且无横向溢出。结合320本日与375此前证据，目标反馈流程四宽视觉缺项关闭。原生确认、实际导航返回及P11/69页整体仍未签收。Jest55套652项通过，无生产代码、云端或体验版变更。详见TEST_HANDOFF最新节。


2026-11-19 QA113导航补验：最小两页对照也出现navigateTo超时；正常重启整个开发工具后往返恢复。430宽实际任务页完成取消、真实离页旧确认失效、返回、合成失败和重试成功跳至合成工作台；4次确认/2次合成release，旧确认0次写入。基础库报错仍在，根因未定。仅430新增完整导航证据，原生弹窗编译后遇明确锁屏尚未打开；四宽既有反馈布局通过保留，不代表P11或69页完成。无生产实现、云端、体验版或业务数据变更。详见TEST_HANDOFF最新节。


2026-11-19 QA113原生弹窗补验未通过：430宽实际点击发起1次wx.showModal，但未见弹窗或回调，合成release=0。无任务代码的最小弹窗对照已准备，普通编译画面不同步、正常重开后明确锁屏，尚无对照点击结果；不将基础库报错直接定为根因。生产实现未改，详见TEST_HANDOFF最新节。


2026-11-19 QA121：用户批准门锁读取绑定原身份与任务，前端已修复；专项24/24及原生命周期22/22、关联操作回归全部通过，Jest55套652项通过。430宽喂宠/空置房两页实际点击验证换人丢弃旧响应、主动查看、换任务清除，独立回执各3次合成读取；320/375/390、真机及真实门锁仍待验。本次无云部署或业务写入。QA113最小原生弹窗显示及取消取得一次成功，第二次仍无回调，原任务原生确认继续待验。详见TEST_HANDOFF最新节。


2026-11-19 QA122 A已实施：喂宠完成凭证和漏次确认绑定本人、原订单、上门记录；相机返回重新读取核验，失效不提交，忙碌可恢复。专项94/94、门锁24/24、生命周期22/22、履约23/23、通用完成8/8、Jest55套652项通过。QA121新增390宽两页同步画面及回执，430历史通过保留；320/375切换遇Mac锁定仍待验。QA122四宽、原生相机及真实履约未验；本轮无云部署、版本切换或真实业务写入。详见TEST_HANDOFF最新节。

2026-11-19 补验：QA121新增375宽喂宠、空置房两页三步实际点击，换人丢弃、主动显示、换任务清除均与同步截图及独立回执一致；每页3次合成读取。QA121现有375/390/430专项证据，320仍待验。QA122在重建的本地游客工程完成320/375/390宽五种操作：取消0写、刷新后旧确认0写、正常确认1写、同人照片返回新增1写、换人视频返回0新增，所有结束状态busy=false。回执qa122-{320,375,390}.json已核对；最终画面按钮无截断且恢复可用。合成弹窗及相机生命周期不替代原生相机/真机，也不代表整页所有设计状态已验。430切换后工具返回ScreenCaptureKit -3812，保留待验。原临时工程目录已不存在（官方CLI code19），已重新生成纯合成游客工程，不据此推定此前所有窗口错误根因。复跑QA122专项94/94、Jest55套652项通过。本轮无生产代码修改、云部署、真实媒体、履约、退款或体验版切换。


2026-11-19 QA121/QA122剩余宽度补齐：QA121在320宽喂宠和空置房两页实际点击换人读取、主动查看、换任务读取，三步同步画面及独立回执一致；各3次合成读取，秘密显示状态依次false/true/false，最终reading=false且无页面错误。QA122在430宽实际核对取消、刷新后的旧确认、正常确认、同人照片返回和换人视频返回，累计合成写入依次0/0/1/2/2，各最终busy=false。新增qa121-pet-320.json、qa121-vacant-320.json、qa122-430.json已逐项断言。结合此前证据，两项目标交互均具备320/375/390/430四宽专项结果；不是整页所有设计状态或69页整体签收。测试工程装配缺少empty-state与privacy依赖已补齐；控制台仍见基础库错误，不能据此声称环境无错误或把它认定为生产缺陷。原生相机、QA113原任务原生确认、真实授权任务及真实履约仍待验；无生产代码、云配置、体验版或真实业务数据变更。


2026-11-19 QA113原任务原生确认补验：320宽实际调用wx.showModal，依次点取消、确认（合成请求失败）、再次确认（成功返回合成工作台）。三次弹窗同步截图及独立回执一致，取消0写、两次确认各1次合成release，最终busy=false/error为空；qa113-native-complete-320.json已断言。由此补齐原任务在模拟器内的原生确认/失败重试成功路径，不能扩展为手机或四宽原生弹窗通过。测试工程曾缺utils/media，已在simulator-release-setup.cjs补显式禁止上传的替身及组件/隐私依赖；仅测试装配变化。基础库bg/__global错误仍出现，但本轮上述流程已完成，不能据此认定此前弹窗问题根因。

同轮新增QA123/QA124待用户决定：工作台及大厅12项隔离检查3通过9失败，原页读取/值班/接单正常；旧资料清除、读取顺序、离页结果和值班/接单旧处理保护有缺口。实际请求全拦截，未证实云端接受。对话已按5W2H推荐两页绑定最新本人及读取，尚未修改生产实现；复现见provider-entry-boundaries.cjs和qa123-qa124-before.json。


2026-11-19 QA123/QA124用户已批准A并实施，取代此前待决策状态：两页读取/值班/接单及订阅回调绑定当前本人、可见状态和最近读取；刷新/离页清旧资料，续页网络失败保留列表并按原偏移重试，权限拒绝清空。专项从12项3通过9失败扩展为51/51通过，含旧请求逆序、离页/换人、重复操作、分页失败恢复、订阅迟到及正常兼容；全量Jest55套652项通过。

320/375/390/430宽均实际点击两页合成读取失败→重新加载→换人后旧操作，并在大厅主动接单到合成详情。同步截图确认目标错误卡片、恢复与按钮可见；独立回执逐项断言：失败旧资料清空、重试恢复、换人旧操作0写、每宽正常接单仅1次合成写入。证据qa123-qa124-{320,375,390,430}.json与qa123-qa124-after.json。仅目标专项通过，不代表整页所有设计状态或69页整体完成；游客基础库bg/__global报错仍出现，根因未定。真实服务员资格、值班/接单、手机原生订阅和最新版体验版仍待验；云端、体验版及真实业务数据未变。


2026-11-19 QA125/QA126新增待决策：运行实际服务员收入页及工作台推荐码代码，合成接口和原生回调共25项（连续两次结果一致），6通过19失败。QA125共14项3通过11失败：正常收入、失败读取阻止提现、正常提现对照通过；隐藏/卸载/换人后旧收入仍回填，旧读取未完成时返回刷新被loading挡住，旧提现处理仍发请求，迟到提现返回仍调收款接口或写页面。QA126共11项3通过8失败：正常保存和原页错误对照通过；离页/换人仍生成、下载或保存，旧保存失败仍写页面。所有云请求、转账确认、下载和相册均被本地替身截断，未证明服务端接受、未写真实资金或文件；线上影响未知。对话已按5W2H提出绑定本人及最新读取、失效只读核对的A方案，尚未修改这两项生产逻辑。证据provider-income-poster-boundaries.cjs及qa125-qa126-before.json；失败项单列，不能并入通过统计。已完成QA123/124专项51项复跑通过。


2026-11-20 QA125/QA126 用户已批准A并实施，取代此前待决策状态：收入读取、提现入口及系统确认绑定本人和最新成功读取；刷新/离页清旧资料，过期结果不打开确认、不提示或写页面，返回只读核对。推荐码生成/下载/保存绑定原本人，保护正常相册授权返回，并阻止保存中翻页打断后一直忙碌。金额和后台规则不变。

实际页面隔离回归46/46通过，原QA123/QA124回归51/51通过；覆盖旧读取逆序、隐藏/卸载/换人、重复点击、同偏移续页重试、系统回调先到/页面先显示、正常成功/取消及失效结果。证据qa125-qa126-after.json、qa123-qa124-after125.json。全量Jest55套652项通过；初次651通过1失败，原因是elder.test.js的固定预约日已到，现仅固定该测试时钟到原场景并恢复计时器，未改业务时间规则。

四宽本轮状态：430、390两页目标专项已实际点击并同步观察错误清空、重新加载、换人阻止旧操作、重新主动操作；独立回执逐项断言通过，每宽仅1次合成create与1次合成referralPoster，旧操作0写，结束ready=true/busy=false。375仅初始收入显示，剩余交互和推荐码未完成；320未测。375开始操作时界面通道连续cgWindowNotFound；官方CLI成功open后仍无法绑定窗口，未明确报告锁屏，已在对话请用户确认可操作前台状态。不得把未完成两宽计入通过。

模拟器使用simulator-income-poster-setup.cjs复制实际页面并拦截云、收款、下载和相册接口，原生系统接口本轮没有实际打开；独立回执qa125-qa126-430.json、qa125-qa126-390.json。游客基础库既有错误仍在，未认定根因。正常手机收款/相册授权、真实收入/提现、完整设计状态及69页总体仍待验；本轮真实提现、云业务写入及相册写入0，云端及体验版未改变。


2026-11-20 QA125/QA126剩余尺寸补齐：用户确认窗口已置前台且可操作后，界面通道恢复。以09a500c重新装配游客工程并普通编译，375、320宽均实际点击收入和推荐码两页的读取失败、重新加载、换人后旧操作及重新主动操作；同步截图确认旧资料清除、错误卡片及按钮完整显示、重试恢复。独立回执qa125-qa126-375.json、qa125-qa126-320.json逐项断言通过，每宽只有1次合成create和1次合成referralPoster，换人旧操作未新增写入，最终ready=true、busy=false且error为空。结合430/390既有证据，本轮两页目标交互四宽补齐，取代上节375/320待验状态。正常手机收款及相册授权、真实收入/提现、完整设计状态和69页总验收仍未完成；不把合成接口计为原生或云端通过。本次只补验收记录，无新增生产代码修改、云部署、体验版切换、真实提现、下载或相册写入。


## 2026-11-20 QA127、QA128 商家预约订单续验（待决策）

P57实际页面、合成身份和拦截接口共35项隔离检查，7通过28失败，连续两次结果一致：重新读取被拒保留旧订单门牌/需求；旧读取覆盖新结果；隐藏/卸载后仍写界面；报价、接单及完成旧处理在换人/离页/读取失败后仍发出请求；开锁确认和照片返回在换人/刷新/离页后仍提交；直接重复调用完成处理产生2次上传调用、2次完成请求；迟到错误仍写页面。正常读取、原页报价/接单/完成、正常开锁确认/取消及原页照片返回对照通过。没有调用真实相机、上传、报价或履约；未证明云端接受旧请求，线上影响未知。证据merchant-order-boundaries.cjs、qa127-before.json。

另用实际merchantOrders入口及实际页面接合成数据库完成6项，5通过1失败：接口offset0/20分别读20/1笔，页面只请求offset0、没有加载更多，第21笔pending_quote不可达；其他商家、停用商家、负偏移正确拒绝，功能关闭仍读历史且所有履约开关为false。数据预先按时间倒序，夹具未验证真实数据库排序/索引；真实云端没有新增查询或写入。证据merchant-order-pagination.cjs、qa128-before.json。

已在对话分别按5W2H请求QA127本人/订单/读取有效期保护及QA128每页20笔加载更多方案，等待决定，尚未修改生产实现或规格。新测41项12通过29失败，失败单列，不合并为页面通过；没有新增四宽、原生手机或69页整体通过结论。QA125/126既有46项本轮复跑通过；全量Jest55套652项通过，新增脚本语法及git diff --check通过。


## 2026-11-20 QA127/QA128 已批准实施与部分四宽验证

用户已选择两项A，取代此前待决策状态。P57现在将读取、报价、接单、开始、开锁确认和完成凭证绑定最新核验的本人/商家/原订单；刷新或离页清旧资料，拒绝旧响应和重复提交。系统拍照返回重新核验同人同单及状态，第二页订单通过分批重新读取原范围接纳；不删除上传文件、不自动重发。列表增加每20笔主动加载更多，续页网络失败保留原列表并在底部重试原偏移，权限拒绝清空。

实际页面专项由35项扩展为63/63通过；实际merchantOrders加页面的合成数据库专项6/6通过，原第21笔待报价订单已可达。覆盖正常相机返回先后两种时序、取消/失败、换人/商家/状态/类别/开关、卸载及刷新、第二页完成、分页失败恢复和迟到续页。证据qa127-after.json、qa128-after.json；合成数据库预排排序，不能据此认定真实索引已验。

四宽实际结果：320、375已实际点击首次读取失败→重新加载→加载更多失败→底部重试→第21笔→合成拍照完成→再次加载末页，截图与页面状态同步，按钮和卡片无水平截断。独立回执qa127-qa128-320.json、qa127-qa128-375.json逐项断言：读取失败0行；续页失败保留20；偏移20原页重试；最终21行、ready=true、busy=false、hasMore=false；每宽仅1次合成completeBooking且原order-20不变，画面状态为待确认。390仅已见读取失败清空和重试按钮（qa127-qa128-390-partial.json），其余流程未验；430本轮未验。随后界面通道连续cgWindowNotFound，重新绑定及官方CLI打开成功仍不能取得窗口，未明确报告锁屏；已在对话按5W2H请用户确认可操作前台状态。未验两宽不能计通过。

模拟器装配：node docs/verification/2026-11-18-event-management/simulator-merchant-orders-setup.cjs；仅写/tmp/jinlin-qa100-guest-path指向且appid=touristappid的临时工程。普通编译/机型重启后按上述顺序实际点击，核对同宽USER_DATA_PATH中的jinlin-qa127-宽度.json；所有API和媒体本地拦截，原生相机未打开。复验脚本merchant-order-boundaries.cjs及merchant-order-pagination.cjs在仓库根目录运行。手机原生相机、真实商家身份/云履约、完整设计状态和69页整体验收仍待完成；本轮云部署、体验版切换、真实订单、照片上传及履约均为0。

本轮最终检查：QA127专项63/63、QA128专项6/6、Jest55套652项、四个JS脚本语法及git diff --check均通过；这些结果不代替390/430剩余界面与真机验收。


## 2026-11-20 QA127/QA128 390宽补齐，430宽部分验证

用户确认窗口置前台且可操作后，本轮恢复实际操作。390宽完成读取失败清空→重新加载→续页失败保留20笔→底部重试原页→第21笔及末页→合成拍照完成→重新加载末页；同步截图确认第21笔由服务中变为待确认，完成按钮消失，卡片及底部入口完整显示。独立回执qa127-qa128-390.json已逐项断言，偏移为0/0/0/20/20/0/20/0/20，只有一次原order-20的合成completeBooking，最终21行、ready=true、busy=false、hasMore=false。此前390-partial证据保留为历史。结合320、375既有证据，三个宽度的本轮目标流程已完成，不代表P57所有设计状态或69页整体验收通过。

430宽已实际观察读取失败清除旧订单，点击重新加载恢复首批20笔；回执qa127-qa128-430-partial.json只有shown/read-failed/retry三个阶段、无合成写入。准备加载更多时先遇到控件失效，重新读取及绑定连续cgWindowNotFound；官方CLI open返回成功后仍无法绑定窗口，未明确报告锁屏。430续页失败、原页重试、第21笔、完成后刷新和末页布局仍待验，不能算通过。用户已确认桌面可操作，本轮按工具连接异常登记，不再次要求解锁。

本轮只补模拟器证据和台账，未修改生产代码。全部媒体及业务接口为本地合成；原生相机、真实商家身份及云履约、完整设计状态仍待验。无云部署、体验版切换、真实订单、照片上传或履约写入。任务结束前全量Jest55套652项通过，git diff --check通过。


## 2026-11-20 QA127/QA128 四宽目标流程补齐

本轮430宽已实际点击续页失败→原页重试→第21笔→合成拍照完成→刷新后再次加载末页；同步截图看到错误卡片/重试按钮、第21笔完整卡片与末页提示，完成后第21笔由服务中变为待确认且完成按钮消失。首次读取失败及恢复20笔沿用上一轮同实例记录。独立回执qa127-qa128-430.json逐项断言通过：失败保留20笔、重试21笔、仅1次原order-20的合成completeBooking，最终21笔且ready=true/busy=false/hasMore=false。430-partial保留作历史，430待验状态由本段取代。

窗口绑定本轮恢复；坐标和AX滚动仍返回noWindowsAvailable，使用已有测试入口“查看列表底部”定位并重新观察截图完成目标布局核对，没有因此新增正常手势滚动通过结论。320/375/390/430本轮目标流程已补齐，但不代表整页所有设计状态、原生相机、真实商家身份/云履约或69页总体通过。现有QA127 63项及QA128 6项复跑通过，全量Jest55套652项通过。本轮未改生产代码、未切体验版、未部署云包，无真实订单、相机、上传或履约写入。

## 2026-11-20 QA129/QA130 服务管理续验（待决策）

运行实际P56页面及merchant.myServices云入口，合成接口/数据库共17项，连续两次结果一致：4通过、13失败。QA129前端14项3通过11失败：正常读取/原页保存/原页图片回填通过；拒绝重读仍留旧服务，隐藏/卸载/换人迟到读取各写界面3次，返回刷新被旧loadInFlight阻止，旧保存仍发请求，卸载/换人旧图片回填，换人仍保留原草稿。QA130三项中权限对照通过、分页两项失败：101条服务，offset0/100均返回相同首批100条，页面无翻页入口而仅读取100条。合成数据库已预排时间，未验证真实索引；不据拦截请求认定云端越权成功，线上影响未知。

证据merchant-service-boundaries.cjs及qa129-qa130-before.json。已在对话按5W2H请求QA129绑定身份/商家/最新读取与草稿隔离、QA130每页20条分页方案；待用户决定，未修改这两项生产代码或需求规格，失败项单列。全部媒体和保存调用本地拦截，云端服务创建、图片上传、审核、费用均为0。


## 2026-11-20 QA129/QA130 已批准整改与四宽目标验证

用户已选择两项A，取代上一段待决策状态。P56已补本人/商家/读取序号隔离、保存忙碌与旧回调保护、本人草稿保留及换人清理、系统选图返回重新核对；merchant.myServices已补20项分页、时间与编号倒序和旧客户端100项兼容。未修改审核、定价或图片内容安全规则。

专项merchant-service-boundaries.cjs 45/45通过（qa129-qa130-after.json）：含系统选图结果/返回先后顺序、读取拒绝、刷新或换商家、取消和失败、重复保存、续页失败原偏移重试、分页去重、101项读全、同时间编号倒序、旧版入口及权限/非法偏移/开关/停用对照。同时间排序为合成数据库执行实际query排序字段，不能替代真实云索引验证。此前17项复现证据保留，未覆盖的真实场景不算通过。

320、375、390、430宽均实际操作并观察截图：读取被拒后旧表单和列表消失，重试恢复本人草稿及20项；续页失败保留20项，底部重试恢复40项；继续翻到101项与末页提示；换人后尝试旧保存只触发读取，草稿清空。四份qa129-qa130-{width}.json回执均为offsets=[0,0,0,20,20,40,60,80,100,0]、保存调用0次。测试辅助按钮只负责定位列表底部/回顶部及注入失败与换人，不计正常手势滚动、真实身份或云端保存通过。320点击未响应时正常重开游客工程后恢复，本轮无需用户再次操作。

相关商家订单63项、订单分页6项及住户商家17组回归通过，Jest55套652项通过。实际页面WXML/WXSS编译已通过，JS语法与diff检查通过。控制台有游客模式基础库警告，其他机型曾见未分类计数，不宣称控制台零错误验收。

当前交付边界：两项本地实现与四宽目标流程完成，开发云merchant部署、索引是否存在/可用、真实商家读取、手机原生选图及完整69页设计状态仍待验。云端未新增服务、图片、审核或订单，未切体验版，未合并develop/main。下一步提供固定包与索引具体范围后由用户决定云端更新。


## 2026-11-25 QA131 商家工作台读取保护

用户已选择A。实际页面的12项隔离复现连续两次为3通过、9失败：逆序成功/旧错误覆盖新结果、旧finally提前结束加载、隐藏/卸载后成功或失败各写界面2次、身份改变后旧结果回填、身份初始化期间隐藏后仍发读取。QA17本身的失败隐藏条件对照通过，未将内存保留快照误报为视觉泄露。

已增加请求序号、可见性和本人身份复核；API采用isActive并禁止拒绝后自动导航。原12项及新增9项返回、只读重试、初始化失败/缺失身份等对照共21/21通过。证据：merchant-workbench-boundaries.cjs、qa131-workbench-reproduction.json、qa131-workbench-after.json。新旧结果与原生页面、真实账号分开记录。

本地游客工程启动成功，截图实际看到已通过商家卡片，实际页面WXML/WXSS可渲染；按钮AX点击未得到状态变化、坐标返回noWindowsAvailable，320/375/390/430交互均待验。工程生成脚本simulator-merchant-workbench-setup.cjs可重建，所有API均为合成接口。无云端业务写入、无体验版切换、无develop/main合并。QA130云包授权有效，本轮控制台原生正文不可读、截图空白、DOM读取超时，尚未下载基线，上传0次、索引新增0项；不跳过原约定核验。


## 2026-11-25 QA132 驿站工作台保护（用户已批准A）

读取及导出已绑定本人/驿站/最新读取；重新核对和离页清旧状态，续页网络失败保留批次并重试原偏移，权限拒绝清空；过期导出不调用复制或提示。保持现有云接口、每页20条及账单规则，无云函数更新。

实际页面合成检查由21项5通过16失败，修复并扩展后38/38通过；证据为 verification/2026-11-18-event-management/qa132-before.json、qa132-after.json，脚本 station-workbench-boundaries.cjs。Jest55套652项通过，官方WXML/WXSS编译、JS语法及diff检查通过。全部云调用、复制和弹窗均被拦截，未生成真实账单、写剪贴板或改云数据。

模拟器仅取得320宽首批20条运行回执。AX为驿站页，截图仍为旧商家页，失败按钮尝试没有新增回执；320/375/390/430视觉及完整点击流程均待验，见qa132-simulator-partial.json。QA131本轮390宽AX读到失败/重试/换身份状态，但截图不同步，同样不升级为视觉通过。QA130仍未下载云端基线、上传0次、索引新增0项；原授权有效，待可靠读取恢复后继续。


## 2026-11-25 QA133 批次创建恢复（用户已批准A）

P63创建批次已按本人、小区及驿站保存最少请求编号，不持久保存门牌清单。结果未知时先只读核对；找到原批次只显示原结果，查询失败仅重试读取，查不到则由本人确认原输入后沿用原编号提交。明确点击“创建下一批”才清理已确认凭据。身份或驿站变化、刷新和离页使旧结果失效；新建在事务内再次核对驿站身份及住户授权。新增station.lookupBatchCreation只返回本人创建结果的批次编号和数量；旧格式批次的读取保持保守拒绝，原创建入口兼容保留。

实际页面及实际云函数接合成数据库，原24项由8通过16失败变为24/24；补充20项通过，合计44/44。固定包使用本轮下载并与原记录72/72一致的station基线，仅替换index.js，包内重复运行24+20项也通过。全量Jest55套652项、官方WXML/WXSS编译及语法检查通过。证据qa133-before/after/recovery/package-boundaries/package-recovery/package-baseline.json及两个station-create测试脚本。

320宽已实际显示查询失败、“创建结果待核对”和只读“重新核对”；游客AppID提示在AX点击后仍在，坐标返回noWindowsAvailable。320完整点击和375/390/430均未通过，不以隔离测试替代四宽视觉或真实身份验收。当前station开发云部署、体验版更新、真实驿站创建仍待验/另列授权；本轮真实批次、账单、费用均为0。

补验：用simulator-station-create-setup.cjs准备一次性游客工程；每宽先核对查询失败无创建入口，恢复合成查询接口后实际点重新核对，应显示同一原批次；准备未查到原批次，确认原清单并重试，模拟创建响应丢失后应自动找到同一批次且create仅1次；再点创建下一批清空输入。换人、换驿站和离页回调另以隔离证据计，不冒充真实账号验证。

## 2026-11-25 QA130 云代码回读及QA132补验进展

本段取代此前“QA130上传0次/尚未下载基线”的当前状态。通过官方微信CLI下载merchant，确认76/76匹配原基线且仅index.js与已批准包不同后，增量部署批准包的index.js；再次独立下载，76/76源码匹配批准包。保留现有SDK4.0.2，未重装依赖、未改函数配置或业务记录。证据qa130-live-baseline-20261125.json、qa130-cloud-readback-20261125.json。分页索引尚未核对/创建，本人在线分页查询仍待验，不能把源码一致算业务查询通过。原索引授权继续有效。

QA132的320宽本轮实际触发读取被拒，AX及回执确认rows=0、导出禁用且出现重试；截图仍旧，重试尚无有效回执，所以四宽视觉及完整点击保持待验。QA131也保持四宽待验。


### QA133 开发云部署回读完成（2026-11-25）

用户已批准固定包后，官方CLI增量更新station/index.js成功；独立下载回读72/72源码与批准包一致，SDK4.0.2保留，配置未变。首次使用解压目录名导致CLI寻找不存在的同名函数并返回ResourceNotFound.Function，没有更新；改用已核验station同名目录后成功，未创建新函数。见qa133-cloud-readback.json及qa133-deployment-manifest.json。本段取代前述QA133云部署待授权/待部署状态。本人会话只读查单、四宽完整点击、真实驿站业务及体验版更新仍待验，不因此升级为通过。


## 2026-11-25 QA134 批次配送保护（已批准A，本地通过）

实际P65页面26项隔离检查连续两次为5通过、21失败：被拒读取保留旧门牌，旧结果覆盖新结果，换人/换批次/离页/刷新后旧开始、确认或上传仍提交；换批次时使用新批次编号。全部接口、弹窗、照片被拦截，未证明云端接受，真实影响未知。修复后26/26通过，新增相机返回先后顺序、取消/失败、重新鉴权拒绝、原门牌已处理、重复操作及迟到提交等28/28通过，共54项。Jest55套652项通过，JS语法及diff检查通过。

仅修改station/batch/batch.js，沿用已有页面模板和系统拍照重新核对模式。需求已更新SPEC_EXT与.Codex/AGENTS。四宽实际点击、原生相机、真实账号/配送仍待验；本轮模拟器仍被游客AppID提示阻挡，重新置前台、控件点击及回车未关闭，未新增视觉通过。未修改云函数、未上传照片、未配送或计费、未切换体验版。

补验步骤：使用合成已指派批次；每宽确认正常门牌→触发读取拒绝后门牌和按钮清空→只读重试恢复→正常开始及单户未送达确认/取消；拍照返回两种时序都只提交一次原批次原门牌。弹窗打开后刷新、换人或离页，再让旧确认返回，应不提交；照片晚于退出返回同样不提交。原生相机另用获准的真实测试任务验，不用合成接口代替。

### QA130 索引核对进展

控制台本轮成功读到merchantServices现有索引仅merchant_status_title、_openid_1、_id_，没有所需等价分页索引。按原授权打开新建表单并填merchant_created_id、merchantId升序、createdAt降序、_id；选择_id降序时工具超时。原生回读仍显示_id升序及下拉菜单，故未点击确定、索引新增0项。保留表单；下轮须先核对当前状态，不重建重复索引。云代码76/76回读结论不变，本人在线查询仍待验。


## 2026-11-25 QA135 驿站配送大厅（用户已批准A，本地通过）

实际P64页面22项隔离检查连续两次均4通过18失败：读取被拒保留旧20条批次，隐藏/卸载后的finally仍写界面，换人迟到读取回填，返回刷新被未完成读取拦住，旧接单仍发送或迟到导航，续页错误重试偏移20回到0。全部请求被本地拦截，未证明云端接受过期请求，线上影响未知。证据station-worker-boundaries.cjs及qa135-before.json。

按A修复仅涉及station/worker/worker.js与wxml；读取和接单绑定本人/小区/角色及读取序号，旧回调失效，模板禁用未就绪接单。续页保留失败偏移并显式retry，拒绝读取清空；接单失败后的重试仅读取，不自动接单。新增回归覆盖逆序读取、旧错误、会话等待、四种拒绝码、角色/小区变化、重复点击、加载互斥、去重后的偏移及返回恢复，共40/40通过（qa135-after.json）。回归中发现加载期间旧接单处理会额外读取，已修复并验证只保留一次读取。相关工作台38、批次边界26及媒体28项均通过。全量Jest55套652项、官方WXML/WXSS编译、JS语法及diff检查通过。

320/375/390/430宽均未取得本轮实际页面结果，保持待验；未切体验版、未改云函数或新增真实接单。补验步骤：各宽首批20条→读取拒绝清空并禁用接单→重试恢复→触底续页失败保留20条→点击错误重试得到第21条（offset 0/20/20）；当前列表合成接单一次仅导航一次；接单响应前离页，迟到响应不导航，返回只读刷新。正常手势触底、真实账号和整批接单须单独核对。

QA130本轮再次确认表单尚未提交，_id仍为升序；DOM读取超时，原生截图可读但坐标点击降序返回noWindowsAvailable。因此索引新增0项、在线分页待验，不重复要求用户解锁，也不提交方向错误的索引。


## 2026-11-25 QA136 整批接单资格及配送链（用户已批准A）

使用实际station入口和事务仅支持doc的合成数据库，19项连续两次均15通过、4失败。正常接单/开始/两户配送、重复开始零新增写入、重复送达不改记录、撤回授权跳过、全部未送达零账本、异批照片及其他服务员拒绝通过。两户送达只记1笔账，驿站100分、服务员80分；一户送达一户撤回仅50/40分。失败是初查后事务前停用、调区、下线、保险失效仍接走1批，初查前的同样条件均正确拒绝。证据station-delivery-cloud.cjs、qa136-before.json。均本地合成，未证明线上发生次数。

按A仅修改station/index.js的acceptBatch，在事务中重读原providers文档并复用canWork，复核归属与当前批次小区。19项全部通过；补充9项覆盖openid归属变化、等级失效、服务员删除、批次移区、已接、无待处理门牌、事务冲突、重复接单不改指派及响应丢失后只读核对，共28/28通过（qa136-after.json）。全量Jest55套652项及JS语法/diff检查通过。合成事务包含回滚和注入冲突，不替代真实CloudBase并发/压力测试。

官方CLI已只读下载当前station，72/72源码匹配上次QA133回读，SDK4.0.2；见qa136-cloud-baseline.json。云部署尚未执行，准备固定包后另列具体授权。未新建真实批次、配送、上传照片、收费、退款或切体验版。

本轮实景通道：QA130原生点击索引降序报elementHasNoFrame，网页读取超时，表单未提交；开发工具确认仍有touristappid提示，重新读取控件后点击未关闭，实际坐标返回noWindowsAvailable。没有明确锁屏报错，不再要求重复解锁。320/375/390/430没有新增实际点击通过项，保留原待验；未改变AppID、权限或锁屏设置。


### QA136 开发云部署完成（2026-11-25）

用户批准固定包后，官方CLI仅增量更新station/index.js成功（1文件）。独立下载72/72源码与批准包一致，无新增/缺失源码文件，SDK4.0.2保留，未重装依赖或更改配置。下载后的源码再次在合成数据库运行28/28通过，不冒充在线真实业务验证。证据qa136-cloud-readback.json、qa136-downloaded-tests.json；本段取代前述待部署状态。

未执行真实接单、配送或账本写入，未切体验版，未合并develop/main。QA130索引和QA131–QA135四宽完整实景仍按各自待验记录保留。QA136临时包、增量目录、下载目录及测试输出在核验与证据保存完成后已清理，manifest保留完整72文件哈希用于重建。


## 2026-11-25 QA130 索引回读及 QA133 部分实景补验

QA130：原生控制台索引表格已读到merchant_created_id，属性非唯一，merchantId升序、createdAt降序、_id降序；新建表单已消失，重复读取仍存在。截图停留旧表单，未将其作为保存证据。以当前索引表格回读确认创建完成，liveQueryVerified仍为false，实际云查询待验。该结论取代前述“未确认创建”，未重复创建第二个索引；见qa130-index-progress-20261125.json。

QA133：现有游客工程源码和模板均与任务分支一致。320宽实际点击恢复合成查询、重新核对后显示原批次结果，截图同步；未查到原单的确认表单也已显示，但下方提交按钮滚动失败noWindowsAvailable，不计完整通过。430及390宽均实际走通查询失败→只读重试→原批次，以及未查到→确认原清单→合成创建响应丢失→自动查回原批次，按钮点击和截图结果一致。375切换后控件/截图仍为旧390或空Webview，未新增通过项。没有明确锁屏报错，不要求用户重复解锁。见qa133-simulator-partial.json。

44项创建/恢复隔离回归及全量Jest55套652项通过。没有修改业务代码、切体验版或创建真实批次。QA137新整改范围仍待明确选择，不把“继续联调”代作A方案批准。QA131/132/134/135四宽状态保持原记录。本轮仅新增临时Jest日志，结果保存后删除；未动其他未完成测试工程或未知文件。
