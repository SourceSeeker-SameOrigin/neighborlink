# 近邻帮完整范围核查与剩余工作清单

> **这是整改前审计快照，以下“本轮”均指 61e587a 核查阶段。** R01–R05 已获批准并整改；云 user 已更新回读。最新状态及 F01–F14 对照见 [整改记录](../../verification/2026-11-09-remediation/README.md)。原始事实保留，不用它覆盖后续结果。
日期：2026-11-09（北京时间）。代码基线：`61e587a9708370a05d7a87c85804e25b473e61a7`，分支 `fix/dev-integration`。

**结论：尚未开发交付完成，也未达到全部功能可供用户完整验收的状态。已有核心与扩展代码骨架、部分纯逻辑验证和开发云部署，但存在明确前端/接口缺口、8包更新未闭环、运营配置不足以及大面积真实业务未验证。不能给出可信的单一完成百分比。**

本次是范围核查、源码对照、独立缺陷复现和证据盘点，不是69页/40业务场景全部实测。原始条款均编入索引，但其中未逐分支实测的条款明确标为未证实；未发现缺口不等于实现正确。本轮未修改业务代码、未部署、未更改角色/开关/密钥/付费/生产环境，也未合并 main。

## 1. 检查口径与证据

| 5W2H | 本轮执行与边界 |
|---|---|
| What | 按原规格、后续确认和设计稿核查功能范围、任务、页面、云函数、配置、部署、验证与交付；列出全部已知缺口与未知项。 |
| Why | 防止把“有文件/可编译/单测通过/函数已创建”混同为“用户能正常操作并完成业务”。 |
| Who | 代理负责对照、复现和报告；用户决定新取舍、真实数据/身份/费用以及最终签收。 |
| When | 原始基线校验 → 当前源码/批准变更 → 本地重跑 → 云/PR状态核查 → 缺口与决策清单。 |
| Where | Documents/近邻帮/jinlin-spec.zip；IdeaProjects/jinlin；指定开发云 cloud1-d4gbpd8zx89564fb6；GitHub。 |
| How | 状态分列：已实现线索、明确缺口、部署证据、验证证据、待用户验收；不以泛化“待验收”隐藏漏做。 |
| How much | 34任务、69页面、21函数、616原始文本/表格行或完整代码块索引；40当前业务场景+15关闭回归+4真实支付。无新增购买；云计量独立账单未知，后续总工时依赖角色/资料/平台条件。 |

原包 SHA-256：`d2a42d4204cb1082bbc4fd2cb4ebe87249a24faf6ac5af533d30cb90b9ae4323`。6个文件的解压副本均与ZIP逐字节一致，原包未改动。实施方案与深度分析仅作参考，不把其中未批准设想强加为必做需求。

**原始规格数量纠正：** 原ZIP的SPEC §17列15条，SPEC_EXT E19列20条，合计35条；原TASKS T33却写40条。当前批准更新后的E19已为25条（新增异步退款、地理索引、回收配置、助老排期、新转账验收），因此本次执行当前40条，另保留15次扩展全关回归和4次真实支付复测，不漏原条款也不缩减新增要求。

覆盖文件：
- [616条原始逐条索引（CSV，可用表格筛选）](baseline-clauses.csv) / [保留原文的JSON](baseline-clauses.json)。每个索引包含来源行号、原文、任务映射、文本差异与部署/验证边界；这是可追溯索引，不能当作616条行为全部通过。
- [原始与当前全部文本差异](baseline-current.diff)。变更须按第6节批准记录解释；没有明确批准或运行证明的地方保留未知。
- [34任务表](tasks.csv)、[69页面表](pages.csv)、[40场景表](scenarios.csv)、[机器可读核查摘要](summary.json)。

## 2. 已做成什么、还不能声称什么

| 交付层 | 已知事实 | 结论 |
|---|---|---|
| 代码/编译 | 本轮50套570个Jest通过；手填页面16项+user入口24项隔离测试通过；184JS/125JSON、77WXML/78WXSS编译、598依赖/54组件/110静态路由/504事件引用检查通过。 | 本地检查通过；不能证明云端写入、第三方能力和跨账号业务通过。 |
| 页面 | 69页、14分包；静态样式审查无问题；既有6核心页截图，订单3个分组与电话输入居中已有局部实测。 | 69页完整UI/业务实景未完成；6页截图也不是6页已签收。 |
| 数据库/定位 | 既有33集合/72业务索引/5种子回读、2可读31拒读；当前浏览器communities页仍见2小区及珺悦GeoPoint。 | 客户端写保护/全角色隔离未实测；珺悦无运营配置、楼栋既有回读为0。 |
| 函数部署 | 21函数存在的历史部署证据；18包1514833曾逐包72文件比对；13非空云调用声明曾同步。 | 最新110ebe8的8包记录0/8完成；权限同步不等于真实API成功。 |
| 真实业务 | 真实微信登录、目录/楼栋码解析、部分拒绝/空列表、定位查询有既有证据。 | 没有40场景整套通过、15关闭回归或4真实付款退款通过证据；不能说所有非交易已可验收。 |
| 文档与PPT | README有7幅Mermaid图；函数用途/页面册齐；27页可编辑PPT及PDF存在且有结构/渲染核查记录。 | 文件已交付；旧历史状态需整理，后续缺口修复后内容还须随实现同步。 |
| GitHub | 本轮实时查到21PR：#1已合并；#2–#21共20个OPEN Draft。 | 主功能未合入main；当前分支不等于main，不应现在直接合并。 |

本轮复跑证据：[static.json](static.json)、[manual-phone.json](manual-phone.json)、[user-entry.json](user-entry.json)、[summary.json](summary.json)。新增缺陷复现：[reproductions.json](reproductions.json)，复现命令 `node docs/audit/2026-11-09/reproduce.cjs`（合成身份/内存替身，无云写入）。一次诊断脚本语法错误已修正后成功复现；不是产品编译错误。

云端即时核验限制：本轮可读CloudBase页面；user上传区显示已选择user.zip（约119kB），没有据此点击部署或认定更新成功。官方CLI只读下载失败：code 17“二维码输出路径无效或不存在”；退出码0不代表下载成功。未重新登录/重启云资源。其他云端结论引用11月8日回读，不能当作本轮全量新扫描；因此最新8包状态准确表述为“无成功更新证据，待部署/回读确认”。

## 3. 明确未完成/缺陷（14组）

| 编号/优先级 | 问题 | 依据 | 发现/边界 | 证据 | 推荐处理 |
|---|---|---|---|---|---|
| F01/高 | 后台5个核心入口断开 | SPEC §3.3 / T06、T07、T10、T11 | admin/orders、providers、community、posters、settlements 已注册，但所有前端导航搜索未找到入链；dashboard 只有扩展入口。 | [miniprogram/admin/dashboard/dashboard.wxml](../../../miniprogram/admin/dashboard/dashboard.wxml) | 补齐按角色显示的订单/审核/配置/海报/结算入口；逐个从我的进入后返回。 |
| F02/高 | 首页完整服务目录未落实最新要求 | D43旧静态介绍方案 + 用户后来要求入口和功能完整展示 | 9类 introduce 一律只弹介绍；存在另一组受开关控制的业务入口，但未形成全部功能、可用状态及直达关系。旧D43允许介绍弹窗；不能将旧实现当作后来要求已完成。 | [miniprogram/pages/index/index.js](../../../miniprogram/pages/index/index.js)<br>[miniprogram/utils/service-catalog.js](../../../miniprogram/utils/service-catalog.js) | 目录可见与业务可用分离：可用项直达，未开通明确状态，无资料引导绑定；不自动全开开关。 |
| F03/高 | 五端发现/进入说明不完整 | 用户要求所有端入口可见；SPEC角色边界仍有效 | 服务员申请存在；商家/驿站申请依赖开关，管理员/物业入口依赖角色，无统一身份入口及未获资格说明。 | [miniprogram/pages/me/me.wxml](../../../miniprogram/pages/me/me.wxml) | 增加工作台分组：有资格进入，无资格说明申请/审核条件；管理员和物业显示不同权限说明，绝不扫码授予角色。 |
| F04/高 | 后台配置有接口但页面不完整 | SPEC §3.3 / T10 / T31 | 小区页只提交名称/站点/价格/时段/食堂/证书/坐标等；缺 cardPlans、rates、全局blacklist/hotline等编辑。updateConfig唯一页面调用只传features。楼栋按钮仅把最后一行当新增，未传buildingId供编辑已有楼栋。 | [miniprogram/admin/community/community.js](../../../miniprogram/admin/community/community.js)<br>[miniprogram/admin/community/community.wxml](../../../miniprogram/admin/community/community.wxml)<br>[miniprogram/admin/features/features.js](../../../miniprogram/admin/features/features.js) | 补齐原规格配置表单和已有楼栋编辑；按分校验金额、整段校验时段/费率；业务值仍由用户提供。 |
| F05/高 | 物业只读结算页被前端拒绝 | SPEC §2、§3.3、§14 / T11 | 结算页load只允许admin，property得到“只有运营管理员可以管理结算”；已用实际Page代码隔离复现。 | [miniprogram/admin/settlements/settlements.js](../../../miniprogram/admin/settlements/settlements.js)<br>[docs/audit/2026-11-09/reproductions.json](../../../docs/audit/2026-11-09/reproductions.json) | 增加本小区物业分成只读分支；不得展示或调用生成结算、标记付款等管理操作。 |
| F06/中 | 看板日期/指标未完整呈现 | SPEC §15 / T10、T31 | 后台dashboard接收from/to，但页面refresh只传communityId/scope；无日期筛选；complaintRate未展示，新首单/第二单只见漏斗口径；月卡仅显示垃圾/快递。 | [miniprogram/admin/dashboard/dashboard.js](../../../miniprogram/admin/dashboard/dashboard.js)<br>[miniprogram/admin/dashboard/dashboard.wxml](../../../miniprogram/admin/dashboard/dashboard.wxml)<br>[cloudfunctions/_shared/adminDashboard.js](../../../cloudfunctions/_shared/adminDashboard.js) | 补日期选择及规格指标、扩展月卡类型；区分漏斗和期间指标后核账，不编造统计结果。 |
| F07/高 | 活动/商家/聊天缺举报入口 | SPEC_EXT E0.6 / T16、T18、T21、T26、T32 | events/detail、shops/detail、chat/room未找到举报控件/处理器；board与idle有举报，因此不是全站完全没实现。content.report有通用后端但需要一并核对不同对象归属。 | [miniprogram/events/detail/detail.wxml](../../../miniprogram/events/detail/detail.wxml)<br>[miniprogram/shops/detail/detail.wxml](../../../miniprogram/shops/detail/detail.wxml)<br>[miniprogram/chat/room/room.wxml](../../../miniprogram/chat/room/room.wxml)<br>[cloudfunctions/content/index.js](../../../cloudfunctions/content/index.js) | 补3类举报入口及目标归属/参与人校验；验证3个不同用户阈值、重复举报及后台审核。 |
| F08/高 | 禁言/封禁参数冲突，按钮无法成功 | SPEC_EXT E0.6 / T16、T31、T32 | 页面传data.action=mute/block；api封装以路由action=moderateUser覆盖；后端又拿event.action判断mute/block。两路径均隔离复现E_INVALID_PARAM，写库前失败。 | [miniprogram/admin/reports/reports.js](../../../miniprogram/admin/reports/reports.js)<br>[miniprogram/utils/api.js](../../../miniprogram/utils/api.js)<br>[cloudfunctions/content/index.js](../../../cloudfunctions/content/index.js)<br>[docs/audit/2026-11-09/reproductions.json](../../../docs/audit/2026-11-09/reproductions.json) | 将业务操作独立为operation，前后端一致；保留原action路由及管理员校验；补整条调用链回归。 |
| F09/中 | 2个广告位可配置但没有展示消费 | SPEC_EXT E16 / T22 | 后台可选home_banner/board_top/shops_top；前台只有首页调用homeContent，查询只取home_banner；广场和商家列表未接另外2个广告位。 | [miniprogram/admin/content/content.js](../../../miniprogram/admin/content/content.js)<br>[cloudfunctions/content/index.js](../../../cloudfunctions/content/index.js)<br>[miniprogram/board/list/list.js](../../../miniprogram/board/list/list.js)<br>[miniprogram/shops/list/list.js](../../../miniprogram/shops/list/list.js) | 按原广告位范围接入对应列表，保持广告标识/站内跳转/曝光点击/审核规则；若缩减需用户明确改规格。 |
| F10/中 | 后台订单筛选漏待报价 | 已批准pending_quote / T26、T31 | 订单状态筛选数组无pending_quote。全部列表可能含待报价，但不能单独筛选；不称整个订单丢失。 | [miniprogram/admin/orders/orders.js](../../../miniprogram/admin/orders/orders.js) | 补待报价筛选和中文显示、全列表回归；维持不自动过期。 |
| F11/高 | 手填号码代码与云版本未闭合 | D44、D45及已批准8包部署 | 8包进度uploaded/verified均空；user有旧版回读，当前页面已选119kB包但选包不是部署。官方CLI本轮下载报code17，未完成最新源码回读。 | [docs/verification/2026-11-08-ui/deployment-progress.json](../../../docs/verification/2026-11-08-ui/deployment-progress.json)<br>[docs/verification/2026-11-08-ui/deployment-manifest.json](../../../docs/verification/2026-11-08-ui/deployment-manifest.json) | 继续既有授权8包部署并逐文件回读；同时核对实际运行前端/环境与错误来源。不能再要求微信手机号资格才能手填。 |
| F12/高 | 珺悦国际缺楼栋与运营配置 | D46保留真实数据边界 | 当前控制台可见坐标、GeoPoint、location=true；prices/rates为空，班次/月卡/站点为空。既有getCommunity返回0楼栋；本轮未重新查询buildings。无楼栋就不能保存有效门牌。 | [docs/verification/2026-11-08-full-review/location-results.json](../../../docs/verification/2026-11-08-full-review/location-results.json)<br>[miniprogram/pages/bind/bind.js](../../../miniprogram/pages/bind/bind.js) | 用户提供真实楼栋/单元；未配置显示明确空状态而不是可用假象；先用标明测试的小区验其他流程。 |
| F13/高 | 全页面视觉/功能验收没有完成 | 用户批准设计稿 / D43、D46 / T14、T33 | 69页样式脚本通过只说明静态规则；既有6核心页截图不是69页实景。订单居中已局部实测；所有角色、大小屏/大字体/键盘/成功失败状态未逐页签收。 | [docs/product/PAGE_ACCEPTANCE.md](../../../docs/product/PAGE_ACCEPTANCE.md)<br>[docs/verification/2026-11-08-ui/page-coverage.md](../../../docs/verification/2026-11-08-ui/page-coverage.md) | 按69页每页U1–U7/F1–F6收证据；缺角色或数据明确阻塞，不制作假完成截图。 |
| F14/中 | 文档历史状态混用 | 用户要求完整README/规格/验收交接 | ACCEPTANCE/MANUAL_SETUP/部分协作说明保留“强制授权”“全部已部署”“仅1小区”等旧段；顶部覆盖说明易被忽略。当前SPEC_EXT有重复E0.4/E20.2编号，接口setAddress参数表也未完整列D44字段。 | [docs/ACCEPTANCE.md](../../../docs/ACCEPTANCE.md)<br>[docs/MANUAL_SETUP.md](../../../docs/MANUAL_SETUP.md)<br>[docs/SPEC.md](../../../docs/SPEC.md)<br>[docs/SPEC_EXT.md](../../../docs/SPEC_EXT.md)<br>[.Codex/AGENTS.md](../../../.Codex/AGENTS.md) | 把当前状态独立为权威台账，历史转历史章节；补接口字段并整理重复编号，保留原ZIP与批准记录。 |

**手机号根因须分开：** 旧云user的授权前置与新user未更新是已知问题；但当前bind.save在没有有效楼栋/单元时应先本地拦截，不会调用setAddress。如果你在“珺悦国际无楼栋”的同一次操作还看到授权手机号，需核对实际编译目录、运行前端版本、云环境、请求及旧错误残留。不能未经实测认定只上传user就解决所有问题。

**原本允许与后来要求的区别：** 九格只弹介绍符合当时D43写下的静态展示方案；你后来要求所有入口及功能完整可见，当前页面没有完成该追加要求。后台5个核心入口、物业结算、举报和禁言属于原规格缺口，不能归因于你未配置商户。

## 4. T00–T33逐项状态

| 任务 | 范围 | 本地实现/已验证 | 部署/配置 | 未完成/未验证 | 定位 | 关联缺口 |
|---|---|---|---|---|---|---|
| T00 | 骨架/工具链 | 原生项目、npm、分包文件完整；本轮官方编译通过 | 项目导入/包体有既有证据；本轮未刷新模拟器包统计 | 发布版构建、真机兼容仍需复核 | [miniprogram/app.json](../../../miniprogram/app.json)<br>[project.config.json](../../../project.config.json) | F14 |
| T01 | 共享逻辑 | 定价、分账、状态机、权限、跨午夜及ID模块存在；50套570测试通过 | 纯逻辑不单独部署；由消费函数打包 | 云端跨夜/冲突/时间触发行为未全验 | [cloudfunctions/_shared](../../../cloudfunctions/_shared) | — |
| T02 | 数据库 | 33集合定义；种子/索引/安全规则文件存在且种子测试通过 | 既有33集合、72业务索引、5种子回读；当前控制台有2小区 | 客户端写拒绝、完整角色隔离、最新全库索引复核；珺悦楼栋缺失 | [database](../../../database) | F12 |
| T03 | 登录/绑定/首页 | 微信登录、手填未验证号码、事务绑定/赠券失败分离已写；隔离40项通过 | catalog有旧回读；新版user更新无成功证据 | 真实手填绑定、重进持久化/扫码来源；前后端版本核对 | [cloudfunctions/user](../../../cloudfunctions/user)<br>[miniprogram/pages/bind](../../../miniprogram/pages/bind)<br>[miniprogram/pages/index](../../../miniprogram/pages/index) | F02/F03/F11/F12 |
| T04 | 报价/订单/mock | 四项下单、报价重算、支付/取消、详情已写；纯逻辑有测试 | order新版待更新；mock参数暂缓D05 | 四服务真实开发云完整闭环/弱网报价；手机号手填不解除交易前置 | [cloudfunctions/order](../../../cloudfunctions/order)<br>[miniprogram/utils/service-form.js](../../../miniprogram/utils/service-form.js)<br>[miniprogram/pages/service](../../../miniprogram/pages/service) | F11 |
| T05 | 支付退款 | 支付/退款回调、金额/幂等与退款逻辑有代码和单测 | 旧版本存在；真实商户/资金测试未配置 | 真实付款到账/退款回调/失败补偿/查单对账 | [cloudfunctions/payCallback](../../../cloudfunctions/payCallback)<br>[cloudfunctions/refundCallback](../../../cloudfunctions/refundCallback)<br>[cloudfunctions/_shared/payFlow.js](../../../cloudfunctions/_shared/payFlow.js) | — |
| T06 | 服务员 | 申请/审核/证书/保险/大厅/接单履约/收入有代码 | provider新版待更新；真实角色未配齐 | 双服务员并发、等级/保险/证件删除、照片、小票、地址隐私 | [miniprogram/provider](../../../miniprogram/provider)<br>[cloudfunctions/provider](../../../cloudfunctions/provider)<br>[cloudfunctions/_shared/adminProviders.js](../../../cloudfunctions/_shared/adminProviders.js) | F01/F11 |
| T07 | 售后/定时 | 确认评价投诉、分项退款、指派、关单/自动确认代码存在 | timer待更新且触发器未启用 | 受控定时/重跑/退款/账本；3秒默认超时适配未测 | [cloudfunctions/_shared/adminOrders.js](../../../cloudfunctions/_shared/adminOrders.js)<br>[cloudfunctions/timer](../../../cloudfunctions/timer) | F01/F10/F11 |
| T08 | 月卡 | 垃圾/快递月卡、续期、额度、排期/跳过代码与单测存在 | membership/timer新版待更新 | 购买/生成/跳过/跨日额度/作废退款真实闭环 | [cloudfunctions/membership](../../../cloudfunctions/membership)<br>[cloudfunctions/_shared/membershipFlow.js](../../../cloudfunctions/_shared/membershipFlow.js)<br>[miniprogram/pages/membership](../../../miniprogram/pages/membership) | F04/F11 |
| T09 | 订阅通知 | 发送封装、四核心+两扩展模板文档与请求时机已写 | 既有记录6模板为空；未重新查询模板值 | 允许/拒绝/耗尽/发送失败/真实送达和落地页 | [cloudfunctions/_shared/notify.js](../../../cloudfunctions/_shared/notify.js)<br>[docs/TEMPLATES.md](../../../docs/TEMPLATES.md) | — |
| T10 | 管理配置/海报码 | 后台页面和API存在 | admin旧批次回读；普通住户拒绝有证据 | 5核心入口缺失、配置编辑不完整、看板条件未暴露；海报码真机保存未验 | [miniprogram/admin](../../../miniprogram/admin)<br>[cloudfunctions/_shared/adminDashboard.js](../../../cloudfunctions/_shared/adminDashboard.js) | F01/F04/F06 |
| T11 | 人工结算 | 预览/锁账/生成/标已付/CSV及卖家商家扩展存在 | admin已部署旧批次；真实业务未验 | 物业前端被拒；入口缺失；CSV与账本/重复结算实测 | [miniprogram/admin/settlements](../../../miniprogram/admin/settlements)<br>[cloudfunctions/_shared/adminSettlements.js](../../../cloudfunctions/_shared/adminSettlements.js) | F01/F05 |
| T12 | 漏斗/推荐 | 来源事件、首单奖励、推荐海报码、漏斗代码存在 | 相关函数存在；user/provider新版待更新 | 3账号扫码→绑定→首单→第二单与奖励核账未完 | [cloudfunctions/_shared/adminDashboard.js](../../../cloudfunctions/_shared/adminDashboard.js)<br>[cloudfunctions/user](../../../cloudfunctions/user)<br>[miniprogram/provider/workbench](../../../miniprogram/provider/workbench) | F01/F11 |
| T13 | 隐私/字段隔离 | 角色裁剪、手机号时限、证件清理/重试、隐私协议有代码 | D02代码有旧批次回读；实际跨账号媒体未验 | 双方媒体/真实600秒TTL/撤权/证件删除/敏感日志实测 | [cloudfunctions/_shared/views.js](../../../cloudfunctions/_shared/views.js)<br>[cloudfunctions/_shared/mediaAccess.js](../../../cloudfunctions/_shared/mediaAccess.js)<br>[miniprogram/pages/legal](../../../miniprogram/pages/legal) | — |
| T14 | 全部UI/易用性 | 69页四件套/样式扫描通过，订单状态/电话居中有既有截图 | 前端当前源码；完整体验版上传无证据 | 69页对稿、成功/空/错/重试、弱网/离线/大字体/键盘/安全区未全验 | [miniprogram/app.wxss](../../../miniprogram/app.wxss)<br>[docs/design/approved-ui.png](../../../docs/design/approved-ui.png)<br>[docs/product/PAGE_ACCEPTANCE.md](../../../docs/product/PAGE_ACCEPTANCE.md) | F02/F03/F13 |
| T15 | 核心验收 | 有15核心场景台账 | 不适用独立部署 | 15核心完整端到端及扩展全关后的15次回归无整套通过证据 | [docs/ACCEPTANCE.md](../../../docs/ACCEPTANCE.md)<br>[docs/TEST_HANDOFF.md](../../../docs/TEST_HANDOFF.md) | — |
| T16 | 开关/多地址/排期/审核 | 开关优先级/管理准备例外/地址/排期/证书/媒体审核代码与测试存在 | D02/D03旧批次更新有回读 | 多角色启停全矩阵、真实审核回调、举报闭环；不是全开就完成 | [cloudfunctions/_shared/features.js](../../../cloudfunctions/_shared/features.js)<br>[cloudfunctions/_shared/schedule.js](../../../cloudfunctions/_shared/schedule.js)<br>[cloudfunctions/_shared/ugc.js](../../../cloudfunctions/_shared/ugc.js) | F07/F08 |
| T17 | 券/积分 | 择优、锁券、限额、推荐、退款恢复及新人重试有测试 | coupon旧批次回读；user新人重试新版待更新 | 限量券参数与真实积分来源、并发核销/退款返还未全验 | [cloudfunctions/coupon](../../../cloudfunctions/coupon)<br>[cloudfunctions/_shared/couponFlow.js](../../../cloudfunctions/_shared/couponFlow.js)<br>[miniprogram/coupons](../../../miniprogram/coupons) | F11 |
| T18 | 聊天 | 会话/3秒轮询/未读/隐私提示/频率/只读/审计代码存在 | chat旧批次回读 | 双账号聊天图片/关闭期限/审计；消息举报入口缺失 | [cloudfunctions/chat](../../../cloudfunctions/chat)<br>[miniprogram/chat](../../../miniprogram/chat) | F07/F08 |
| T19 | 广场/帮带 | 悬赏事务、时段/等级/审核/评论/分享/跨境约束代码存在 | board新版待更新 | 真实发布/支付/接单/三人举报/跨小区边界；首页可达性 | [cloudfunctions/board](../../../cloudfunctions/board)<br>[miniprogram/board](../../../miniprogram/board) | F02/F08/F09/F11 |
| T20 | 闲置 | 信息及担保/预留/交付/72小时/恢复上架/卖家收入有代码 | idle新版待更新 | 两买家竞争、线下联系、交付、售后/退款、seller结算/提现 | [cloudfunctions/idle](../../../cloudfunctions/idle)<br>[miniprogram/idle](../../../miniprogram/idle) | F02/F11 |
| T21 | 活动 | 报名/审核/签到/赞助/异步取消分批退款代码与测试存在 | event旧批次回读；timer新版待更新/未触发 | 活动举报入口、真实二维码/提醒/多人容量/超时续批/失败重试 | [cloudfunctions/event](../../../cloudfunctions/event)<br>[cloudfunctions/_shared/eventCancellation.js](../../../cloudfunctions/_shared/eventCancellation.js)<br>[miniprogram/events](../../../miniprogram/events) | F07/F08/F11 |
| T22 | 联合社区/广告/公告 | 范围过滤、首页广告/公告、确认收款记账代码存在 | content旧批次回读；仅现有2小区不等于联合组已配 | board_top/shops_top广告无消费页；跨区发布/广告曝光收款/物业公告未全验 | [cloudfunctions/content](../../../cloudfunctions/content)<br>[cloudfunctions/_shared/visibility.js](../../../cloudfunctions/_shared/visibility.js)<br>[miniprogram/admin/content](../../../miniprogram/admin/content) | F09 |
| T23 | 定位 | GeoPoint/公开视图/附近查询代码存在；本轮geo单测通过 | 全局开关此前开启；当前控制台2小区，珺悦坐标/GeoPoint可见 | 真机允许/拒绝/GPS及服务员前台位置生命周期；楼栋不由定位产生 | [cloudfunctions/catalog](../../../cloudfunctions/catalog)<br>[cloudfunctions/_shared/geo.js](../../../cloudfunctions/_shared/geo.js)<br>[miniprogram/pages/bind](../../../miniprogram/pages/bind) | F12 |
| T24 | 助老 | 送餐、探访周期快照/报告、陪诊30天/完整值班窗口、补贴导出代码存在 | order/provider/membership/timer新版待更新 | 真实食堂/上限/计件/证书/班次、子女地址、报告订阅/隐私导出 | [miniprogram/elder](../../../miniprogram/elder) | F04/F11 |
| T25 | 喂宠 | 排期、每次图/视频、漏次退款、密码加密/授权/审计/删除代码与单测存在 | pet旧批次回读；order新版待更新；密钥D06暂缓 | 6次任务完整云流程、真实媒体、密码服务日限制和清理未验 | [cloudfunctions/pet](../../../cloudfunctions/pet)<br>[cloudfunctions/_shared/pet.js](../../../cloudfunctions/_shared/pet.js)<br>[miniprogram/pet](../../../miniprogram/pet) | F11 |
| T26 | 商家 | 入驻审核、服务管理、固定/报价制、开锁核验、完工佣金代码存在 | merchant新版待更新 | 真实审核/价格/员工隔离/报价/退款/结算；商家举报入口缺失 | [cloudfunctions/merchant](../../../cloudfunctions/merchant)<br>[miniprogram/merchant](../../../miniprogram/merchant)<br>[miniprogram/shops](../../../miniprogram/shops) | F03/F07/F08/F10/F11 |
| T27 | 回收 | 0.1kg/积分向下/金额四舍五入/计件/月结代码与单测存在 | order/provider新版待更新 | 类别价格/企业映射/资质配置、同区接单/积分抵扣/月结实测 | [cloudfunctions/_shared/recycle.js](../../../cloudfunctions/_shared/recycle.js)<br>[miniprogram/recycle](../../../miniprogram/recycle)<br>[miniprogram/admin/recycle](../../../miniprogram/admin/recycle) | F04/F11 |
| T28 | 空置房 | 30天/每月1、15/单次报酬/逐项报告/钥匙权限代码存在 | vacant旧批次；membership/timer新版待更新；D06暂缓 | 月卡配置、值班排期、当天密码/删除、每项照片、报告订阅实测 | [cloudfunctions/vacant](../../../cloudfunctions/vacant)<br>[cloudfunctions/_shared/vacant.js](../../../cloudfunctions/_shared/vacant.js)<br>[miniprogram/pages/membership](../../../miniprogram/pages/membership) | F04/F11 |
| T29 | 驿站 | 申请审核、独立站点身份、同意/撤回复查、配送/月结代码存在 | station旧批次回读 | 真实站点/角色/住户逐一同意、20户批次/撤回/不计费、对账 | [cloudfunctions/station](../../../cloudfunctions/station)<br>[miniprogram/station](../../../miniprogram/station)<br>[miniprogram/admin/stations](../../../miniprogram/admin/stations) | F03 |
| T30 | 自动打款 | 新版API/签名/确认页/锁账/卖家1999.99/份额分摊代码与单测存在 | payout旧批次回读；商户密钥/余额未配；timer未触发 | 真实收款/终态/失败解锁/部分提现/跨小区统计；未操作真实资金 | [cloudfunctions/payout](../../../cloudfunctions/payout)<br>[cloudfunctions/_shared/wxpayV3.js](../../../cloudfunctions/_shared/wxpayV3.js)<br>[miniprogram/provider/earnings](../../../miniprogram/provider/earnings) | — |
| T31 | 扩展后台 | 开关/券/商家驿站审核/指标/导出页面存在 | 相关函数旧批次存在 | 不能宣称后台可完成全部配置：缺控件/日期、封禁失败、部分端入口缺失 | [miniprogram/admin](../../../miniprogram/admin)<br>[cloudfunctions/content](../../../cloudfunctions/content)<br>[cloudfunctions/admin](../../../cloudfunctions/admin) | F01/F04/F05/F06/F08/F09/F10 |
| T32 | 扩展合规 | 纯逻辑/字段/内容审核/加密/隐私代码存在并部分有测试 | 声明同步有既有证据；真实API与回调未全验 | UGC举报/禁言缺陷；跨账号媒体/位置/开锁/公益规则/平台资格实测 | [cloudfunctions/_shared](../../../cloudfunctions/_shared)<br>[miniprogram/pages/legal](../../../miniprogram/pages/legal)<br>[docs/MANUAL_SETUP.md](../../../docs/MANUAL_SETUP.md) | F07/F08/F14 |
| T33 | 全量验收 | 40场景+15关闭回归+4真实支付和69页台账已编制 | 非独立云函数 | 没有整套实测通过和用户签收；未完成交付，不得按单测数报完成率 | [docs/TEST_HANDOFF.md](../../../docs/TEST_HANDOFF.md)<br>[docs/product/PAGE_ACCEPTANCE.md](../../../docs/product/PAGE_ACCEPTANCE.md) | 全部 |

以上“有代码”表示已找到对应实现与测试线索，不代表每个分支审计通过。T15/T33没有完整E2E通过证据；T14没有69页实景签收；T31不能标后台配置全部完成。

## 5. 云函数：21个用途、8个待更新

**不是只上传user。** 已授权8包合计964651字节；本轮全部核对存在、大小与SHA-256匹配、ZIP CRC通过。`110ebe8..61e587a`在cloudfunctions下无源码差异，因此8包仍对应当前后端；后续若修复本报告内容，会重新核算影响范围和包清单。

| 函数 | 职责 | 在哪里用 | 本批状态 |
|---|---|---|---|
| user | 微信登录、手填电话与门牌绑定、扫码来源、新人赠券重试 | 首页、绑定、我的、优惠券；全局应用及需身份的业务页面 | 新版待部署/回读 |
| catalog | 小区/楼栋/价格/班次查询、附近3公里小区、楼栋与推荐码解析 | 绑定页、首页、全部下单页、管理配置 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| order | 报价、创建、支付重试、列表详情、取消、确认、评价、投诉、报告订阅 | 核心/助老/回收等下单页、我的订单与详情 | 新版待部署/回读 |
| provider | 申请、审核状态、值班、大厅、接单/放弃/开始/完成、收入、前台位置 | 服务员5页；订单详情展示履约结果 | 新版待部署/回读 |
| membership | 月卡方案、购买、我的月卡、跳过今天任务 | 月卡页；垃圾/快递/探访/空置房月卡共用 | 新版待部署/回读 |
| admin | 看板、订单售后、服务员审核、小区/开关/楼栋、海报码、结算、导出 | admin分包；物业只可操作规格允许的本小区功能 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| board | 求助、悬赏、出行帮带的列表、详情、发布、评论、关闭、举报 | 需求广场3页；悬赏交易复用order/provider | 新版待部署/回读 |
| idle | 信息发布、联系、担保购买、卖家接单交付、收入与商品状态 | 闲置7页；担保售后复用订单处理 | 新版待部署/回读 |
| event | 创建/审核/发布、报名、签到、取消与异步退款任务管理 | 活动列表、详情、活动管理 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| chat | 打开会话、发送、拉取、未读、标记已读、授权审计查看 | 消息列表/聊天页、订单和闲置联系入口、后台审计 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| coupon | 领券中心、领取、我的券、模板管理、管理员发券 | 优惠券2页、后台模板页；积分计算在共享交易/回收逻辑内 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| payout | 服务员/卖家提现申请、锁定账本、查询转账状态 | 服务员收入、卖家收入；启用autoPayout且商户配置齐备 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| merchant | 入驻/审核、商家和服务查询、服务管理、预约报价与履约 | 商家4页、住户商家3页、后台商家审核 | 新版待部署/回读 |
| station | 账号申请审核、住户同意、创建批次、接批次、逐户复核、配送与对账 | 驿站5页、我的送上门开关、服务员大厅、后台驿站审核 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| content | 公告、广告、曝光点击、确认广告收款、举报与内容/用户治理 | 首页、公告、广场/商家广告位、后台内容和举报页 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| pet | 每次上门任务、授权读取入户信息、完成或漏做记录 | 喂宠工作页/记录页；下单仍由order创建 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| vacant | 授权读取入户信息、提交逐项巡检报告、订阅报告 | 服务员任务详情、住户订单详情；购买复用membership | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| timer | 支付超时、未接单提醒、自动确认、月卡排期、退款/提现查单、活动退款分批等 | 后台定时触发；无独立页面，不可由普通用户调用 | 新版待部署/回读 |
| payCallback | 可信支付通知、查单校验、幂等更新订单/月卡/资格 | 微信支付系统回调；前端支付成功提示不能替代它 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| refundCallback | 核实退款结果、幂等更新退款与关联业务 | 微信支付系统回调；用户从订单详情查看结果 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |
| mediaCallback | 接收并核验异步图片审核结果，更新媒体可见性 | 平台消息推送；影响图片显示，无独立页面 | 既有部署证据；本次D44/D45无需新增更新，业务仍未全验 |

| 8包 | 此次为何更新 |
|---|---|
| user | D44 手填号码与验证来源标记；D45 资料和绑定记录同事务、本人幂等重试赠券 |
| provider | D44 服务员申请所用联系电话校验提示 |
| order | D44 地址快照及创建订单所用联系电话校验提示 |
| membership | D44 月卡地址快照所用联系电话校验提示 |
| merchant | D44 商家预约地址快照所用联系电话校验提示 |
| idle | D44 闲置担保订单所用联系电话校验提示 |
| board | D44 悬赏订单所用联系电话校验提示 |
| timer | D44 月卡任务生成所用共享地址校验提示；仅更新代码，不启用触发器 |

其余13个无需因本次D44/D45盲目重传；它们调用的相关共享方法未受此差异影响。这不表示所有物理打包副本都是最新，也不表示以后修复F08等无需重新部署。timer本次授权仅代码，仍不包含启用触发器。

前端修改需开发工具重新编译/后续指定体验版上传；云函数上传不会自动更新手机中的前端。全局开关、数据库数据、环境变量、云调用权限、timer触发器也不是上传ZIP就自动完整配置。

## 6. 后续已确认要求：保留哪些、目前到哪

| 已批准事项 | 最终规则 | 实现/部署/验收状态 |
|---|---|---|
| 跨午夜/北京时间 | 时段归开始日、额度自然日、含开始不含结束、重叠/相等拒绝 | T01/T08本地测试；云跨夜真实业务未验 |
| 事务等效 | 事务内读旧状态再doc更新、冲突E_CONFLICT、外部支付不进事务 | 已写入公共事务/流程；真实并发竞争待验 |
| 投诉分项退款 | 服务费与商品款分别校验；商品报销/服务分成分别调整 | 代码/单测；真实投诉退款待验 |
| 待报价 | pending_quote报价后pending_pay；未报价不自动过期 | 代码存在；F10筛选遗漏；真实商家流程未验 |
| 优惠/积分 | 推荐人于被推荐人首笔付费完成获券；服务费比例返积分向下/按退款幂等 | 代码/单测；真实券限额/退款待验 |
| 悬赏 | 未来小区值班窗口，事务建帖和订单，入户需二级，未付款不公开 | 代码/单测；board新版待更新 |
| 活动取消 | 10000容量边界采用异步分批、可重试任务和管理进度 | 代码/单测；云批量/超时/真实退款未验 |
| 广告收入 | 管理员确认收款才记一笔平台收入；communityId空且保留多小区列表 | 代码/单测；F09广告位缺口、真实确认未验 |
| GeoPoint | 保留lat/lng，新增GeoPoint/索引，API不泄露内部字段 | 已有目录/坐标查询证据；真机/位置全生命周期未验 |
| 助老 | 陪诊30天且完整窗口、探访计件小区配、餐费上限小区配、逐项报告/关注、脱敏导出 | 代码/单测；参数/人员及完整流程待验 |
| 探访订阅 | 逐任务一次授权；未授权仍看订单报告 | 代码/单测；模板与真机送达待验 |
| 闲置 | 退款成功且所有权/关联仍匹配恢复上架；seller对象；按autoPayout切自动/人工 | 代码/单测；真实担保/退款/结算未验 |
| 舍入/卖家提现 | 佣金四舍五入到分；回收积分下取整/收购金额四舍五入；卖家单笔1999.99，余款保留 | 代码/单测；真实账本/转账待验 |
| 空置房 | 单次报酬小区perVisitPayout；30天、每月1/15、逐项报告 | 代码/单测；配置、排期、钥匙/报告实测待做 |
| 驿站 | 先申请后审核、独立站点身份、撤回同意每户复查/跳过不计费 | 代码/单测；真实角色、住户同意和批次实测待做 |
| 跨区卖家看板 | 按锁定账本份额分摊，一笔提现不重复计数 | 代码/单测；真实多小区统计待验 |
| 新版商家转账 | 采用新版创建/查单、微信确认页，不接旧版 | 代码/单测；商户配置与真实资金未验 |
| D01/D41→D44 | 真实微信身份保留；未绑定不强跳；开发生产手填未验证电话覆盖原强制授权 | 本地40项/原返回实测；真实新版云绑定待更新；无需重复选择手机号方案 |
| D02 | 私有媒体、按业务归属签发、600秒目标、一次鉴权刷新、不缓存、旧归属不明重传不删 | 已实现且旧批次部署；真实TTL、撤权、双账号/证件生命周期未验 |
| D03/D38 | 身份/参与权限优先；管理员准备例外；关开关保留历史查看/售后/回调，禁新交易履约结算 | 代码和隔离回归；完整云矩阵未验 |
| D04 | 最小云调用声明与实际授权分开检查 | 13非空声明同步记录；真实内容安全/二维码/订阅API待验 |
| D05–D07 | 模拟支付、门锁密钥、首个管理员继续暂缓 | 未擅自恢复；手填电话不等于批准这3项 |
| D28/D37/D40 | station下载异常、包统计/重开、CLI/浏览器替代通道 | station旧批次回读已成功；包统计14分包已恢复；本轮CLI新code17单列，不能说老异常永远未解决 |
| D33–D36 | 密码不落草稿、地址报价乱序保护、有效开关/GeoPoint裁剪、字号/回收重试 | 既有修正/测试；云实景全部成功尚未证实 |
| D39/D42 | 活动crypto导入、价格栏专用class | 已修正有本地/编译证据；真实创建/有数据UI待验 |
| D43/D46 UI | 所有页面严格按approved-ui.png；订单居中和同类布局排查 | 静态69页+部分截图；F13全页面视觉/功能未验完 |
| D45 | 绑定资料/事件事务，新人券失败独立提示/本人幂等重试 | 隔离24入口用例通过；user新版云待部署 |
| D46定位/资料 | 全局location开启、新增珺悦、保留示例；不编造真实楼栋/价格班次 | 既有全局回读；当前珺悦位置可见；真实数据不足 |
| README/图/PPT | 完整介绍、架构/流程/时序/状态/数据/部署图，21函数、69页、可编辑PPT | 文件已生成；F14当前/历史状态整理待做，后续修复同步 |
| 仓库与合并 | 允许创建/推送开发分支；验收后经用户同意再合main | 21PR中20草稿未合；本轮只读查询，不合并 |

## 7. 五端怎样进入

| 端 | 当前设计入口/取得资格 | 目前缺口 |
|---|---|---|
| 住户 | 同一小程序微信身份登录；手填电话/有效门牌后办理本小区服务 | user新版部署、珺悦楼栋/配置仍缺 |
| 服务员 | 我的→成为邻居帮手→审核通过→服务员工作台 | 后台审核入口断开，测试角色/保险等未配齐 |
| 商家 | 我的→申请商家入驻→审核→商家工作台 | 当前入口受开关隐藏；工作台发现体验未完成 |
| 驿站 | 我的→申请驿站账号→审核→驿站工作台 | 当前申请受开关隐藏；需要真实站点与授权 |
| 管理员/物业 | 我的→管理后台；同一后台按角色/小区分权限 | 管理员尚待指定；5入口缺失；物业只读结算被误拦截 |

**不需要五个小程序，也不是扫五种码获得身份。** 同一账号可有多个经批准角色，楼栋码/推荐码用于来源或预选门牌，不能赋权。一个多角色账号可便利验收界面，但跨用户隔离、并发接单必须有不同真实授权账号。

## 8. 需要决策/资料的完整5W2H清单

已有批准不重复索取。以下R编号是本报告提案，不是已批准规格；修复范围中的必做缺口不以“删需求”默认解决。已批准8包可继续部署，不必再批准同一上传范围；本轮按你的“先完整检查”要求未部署。

| 编号/关联 | What做什么 | Why事实/未知 | Who | When | Where | How选项/推荐/验收 | How much |
|---|---|---|---|---|---|---|---|
| R01 / F01、F05、F06、F10 | 补后台核心导航、物业分成只读、日期指标、待报价筛选 | 原规格明确；实现场景有缺口；物业拦截已复现，云端完整行为未知 | 代理修复；用户确认按原范围整改 | 后台角色实测前 | admin页面及现有API | 推荐A按原规格补齐，保持物业只读/本区；B暂缓则不能宣称后台完成；验收从我的逐页进入并验证越权拒绝 | 无新增服务；需数个页面/角色回归，工时待补丁范围确定 |
| R02 / F02、F03 | 完整服务目录与工作台可发现性 | 旧D43静态介绍不能满足后续完整入口要求；展示规则具体呈现需定 | 用户确认呈现方案；代理更新规格和UI | 首页/我的全页验收前 | 首页、我的、设计规范 | 推荐A保留批准视觉，目录统一标可用/未开通/待资料；可用项直达；工作台按角色进入、未获资格展示申请/说明，管理不自助赋权；B仅保留介绍不能满足新要求 | 不新增云服务；布局和路由回归工作量待确定 |
| R03 / F04 | 补齐后台配置表单及已有楼栋编辑 | 存在API无UI，运营无法按T31在后台完成；具体金额不应代定 | 代理补表单；用户提供运营值 | 录入真实小区和扩展开启前 | 小区配置/全局配置 | 推荐A普通表单维护月卡/费率/班次/站点/黑名单/热线等，保留既有字段；已有楼栋携ID更新；B继续控制台JSON不满足完整后台目标 | 无额外服务；页面工作量待设计细化，商业费用未知 |
| R04 / F07、F08 | 补举报入口并修复禁言/封禁调用契约 | 3类举报缺入口；实际API封装覆盖action导致2个操作确定失败；不同举报对象归属仍须核查 | 代理修复/回归；用户批准方案 | UGC模块实际试用前 | 活动/商家/聊天/内容后台/content函数 | 推荐A独立operation字段，保留action路由；举报按对象/参与者鉴权，补重复与阈值；B暂不开UGC可降风险但不算交付完成；新包按差异清单部署 | 新增少量API请求；不新购服务，修改后需新增部署范围 |
| R05 / F09 | 补广场/商家页两个广告位 | 后台允许配置但无对应前台读取展示，运营可能创建看不见的广告 | 代理实现；用户决定是否保留原范围 | 广告验收前 | board_top/shops_top及content | 推荐A按原三广告位补展示/审核/站内跳转/计数；B仅首页须明确缩减规格，当前不采用 | 云读/统计调用会增加，实际计量未知；不自动确认广告收款 |
| R06 / F11 | 核对运行前端/云版本并完成已批准8包 | 无楼栋时当前前端应先拦截，与用户旧授权提示可能来自不同版本/环境/残留状态；未定位全过程 | 代理诊断/部署；必要时用户完成工具登录或操作配合 | 真实手填绑定前 | 当前开发工具及指定开发云 | 推荐A核对编译目录/版本/环境→既有授权包哈希/部署回读→实际合法门牌手填保存；不重复要求同批授权；若需清缓存/换登录按具体影响另说明 | 8包约0.96MB；当前CLI只读code17，网页登录可读；不新增购买 |
| R07 / F12 / D13 | 提供珺悦真实楼栋/单元及运营值 | 0楼栋既有证据；当前价格/班次/月卡/驿站为空，定位不生成地址 | 用户/物业提供，代理录入和核验 | 珺悦绑定/下单前 | buildings/communities/config | 推荐A先给准确楼栋名称和单元列表，后给价格/值班/分成/站点/热线；保留示例测试。B先只验示例，不伪造珺悦数据 | 楼栋数量、录入工时、商业价格未知；不需要住户真实手机号房号名册 |
| R08 / F13 | 完整69页和跨角色验收顺序 | 静态通过但实景不足；完整功能验收需有记录/角色/开关/平台能力 | 代理技术验证；用户提供账号并最终签收 | 先补缺口/部署/数据，再分端、跨端、真机 | 69页U1–U7/F1–F6、40+15+4场景 | 推荐A先普通住户与非资金场景，再授权角色/模拟交易，最后真实资金；任何阶段未测明确标未测；B立刻让用户盲验会重复遇堵塞 | 工时随前置而变，不承诺日期；云/资金费用另批 |
| R09 / F14 | 统一当前规格/状态/文档 | 旧强制授权、1小区、0待部署等历史段与最新相冲突；接口字段/编号待整理 | 代理整理，用户决策记录为准 | 开始修复时及每次交接 | SPEC/EXT/README/ACCEPTANCE/SETUP/PPT | 推荐A单一当前状态表+历史存档，补已批准字段/编号与新修复证据；B继续叠加尾注易误读；不修改原ZIP | 文档工作无新增服务费用；不改既有业务决定 |


已有配置/外部条件仍需处理的编号如下。旧表估算仅供顺序参考，不是承诺或现行资质/收费结论。D05–D07继续暂缓，未经你明确恢复不配置。D15和D28已作最新状态修正。

| What编号/事项 | Why最新事实及未知 | Who | When | Where | How推荐/替代/验收 | How much估算 |
|---|---|---|---|---|---|---|
| D05 模拟支付【继续暂缓】 | 已有payMode=mock记录；ALLOW_MOCK_PAY缺失记录未获变更；手填已批准不等于模拟交易获批 | 用户确认开发范围；代理配置 | 真实手填绑定通过后、交易验收前，可提前准备 | 仅开发环境的支付调用链 | A **推荐仅开发环境设 ALLOW_MOCK_PAY=true，payMode 保持 mock**；B 等商户就绪直接真实支付不推荐。涉及 order/provider/membership/admin/board/event/idle/merchant/pet/timer 的支付或退款调用；支付回调真实模式另见 D24。验收：模拟订单/退款/账本正确，正式环境保持 false | 约 1–2 小时配置和回读；模拟支付不转真钱，云调用计量 |
| D06 门锁密钥【继续暂缓】 | 既有记录缺SECRET_KEY；本轮未读取任何密钥；需要4个读写函数一致配置 | 用户保管并录入；代理校验不读取明文 | 喂宠/空置房密码流程前 | 四个开发云函数环境变量 | **推荐独立开发密钥：32 随机字节、64 位十六进制，四函数一致；生产另生成**。不发到聊天、不入 Git/数据库。验收：加解密、服务日及角色限制、审计、到期/完成删除；轮换前需旧密文迁移方案 | 配置约 1 小时，业务验收另计；密钥遗失会影响旧密文解密 |
| D07 首个管理员【继续暂缓】 | 尚无获用户明确指定并授予首管理员的证据；不能凭当前登录自动赋权 | 用户指定唯一账号及授权范围；代理核对后执行或用户手工 | 管理端联调前 | 开发 users.roles、config.adminOpenids | A **推荐仅给用户核实的本人账号开发管理员角色**；B 用户自行维护。两字段作用不同：角色用于访问，adminOpenids 用于告警收件人。不能把当前任意登录账号默认当管理员；不跳过当前手填号码与有效门牌校验。验收：管理可访问、普通住户仍被拒，角色变更留记录 | 约 30–60 分钟；涉及扩大后台数据访问权限 |
| D08 多角色测试【需具体账号/范围】 | 当前已有2小区，但珺悦为空配置；不同测试成员、服务角色和有效期尚未齐备 | 用户提供获同意的测试成员/角色/小区；代理经授权建立测试数据 | 真实手填绑定通过且 D07 授权后 | 开发环境，至少两小区、住户/服务员/物业，扩展时加商家/驿站/卖家 | **推荐真实授权测试账号按正式申请审核流程进入；如跨区试验需要额外合成小区，先明确范围；不要把珺悦冒充合成数据**。用户决定各人的角色、小区范围及有效期。验收：正向流程、越权拒绝、并发抢单；不直接伪造手机号或资质 | 核心约 3–5 个微信账号可组合角色，但越权验证需分离身份；配置半天；保险/资料成本未知 |
| D09 定时任务与超时【待决】 | timer 无触发器、3 秒超时；负责关单、确认、月卡生成、退款恢复、通知、转账查询。实际批量耗时未知 | 用户批准运行与资源上限；代理配置和监测 | D05、测试数据、必要权限齐后 | 开发 timer；every5min | A **推荐先授权有限测试数据的一次受控运行和耗时测量，再按测量设超时/分批预算，最后启用每 5 分钟触发器**；B 直接启动不推荐。单纯加超时不能保证大批次可靠。验收：同一任务重跑幂等、失败可续批、无重复退款/结算；不触碰真实资金 | 5 分钟一次约 288 次/天、8640 次/30 天；测试半天至 1 天，实际资源费待测 |
| D11 订阅模板【提供配置】 | 此前回读六个模板 ID 均为空，本轮未重新读取；空模板会跳过发送，无法验收消息到达 | 用户在平台选可用模板/授权接收；代理做字段映射 | 核心通知先，扩展通知随模块 | config.templateIds/templateFields、公众平台 | **推荐先 newTask/accepted/delivered/unaccepted，再 eventReminder/visitReport**。提供模板 ID、字段类型和编号；visitReport 按逐任务一次性授权已定。验收：同意/拒绝/额度耗尽/发送失败、收到后跳转正确 | 最多 6 类模板；配置和真机验证半天；接口额度/费用以账号为准 |
| D12 内容审核与消息推送【提供权限/配置】 | mediaCallback 已部署且客户端调用被拒；真实平台回调来源、pass/risky/review、重复回调未验收 | 用户确认平台配置；代理技术联调；指定人工审核人 | 所有 UGC 模块开启前 | 公众平台消息推送、内容安全、mediaCallback | **推荐使用官方云函数消息推送，绑定现有 mediaCallback，核实来源边界和云调用权限**；不为方便开放未经验证的 HTTP。准备无敏感测试图/文本，逐项验证待审不可见、违规删除、复核和举报。不要把无 OPENID 当作完整来源证明 | 约半天至 1 天；人工审核需持续投入；额度/费用未知 |
| D13 运营数据【待提供，见R07】 | 珺悦已建档、价格/费率/班次/月卡/站点为空；示例数据保留不冒充正式资料 | 用户/物业给定，代理录入核验 | 管理和订单验收前；正式值上线前 | communities/buildings/config | **推荐开发先保留明确标记的示例价格，正式数据单独整理**：名称地址物业、楼栋单元/短码、驿站、值班时段、四服务价格、代买上下限、月卡与计件额、分成、热线、推荐奖励。已定跨午夜/分账规则不重选。验收：报价样例、跨夜班、热线可接通 | 模板填数约 1–2 小时；商业定价由用户决定，不代定 |
| D14 隐私、服务协议、类目、备案【提供资料/平台办理】 | 当前主体/类目/认证及隐私接口声明未形成完整上线证据；现有手册旧费用与时限不能视为现行政策 | 用户/运营主体审核、签署、备案；代理核对代码与声明一致 | 收集资料前及提审前 | 公众平台、legal 页面、合作协议 | **推荐按实际采集清单填写：手机/门牌、位置、照片视频、证件、门锁密码、使用目的、保留/删除、联系方式**；各模块逐项核准类目与资格。证件审核后删除、开锁不存证件照片为已定规则。验收：真实隐私弹窗、拒绝路径、数据可见范围与删除；不代为承诺“无需资质” | 审核/备案/认证费用和时间未知，以当前官方办理页面为准 |
| D15 定位【配置已批准，剩真机/资格核验】 | 用户已批准全局开启、珺悦坐标与GeoPoint；不要再推荐改回仅单区开启；真机生命周期未验 | 用户确认用途与小区坐标、真机授权；代理配置 | 地图验收前 | 公众平台接口/隐私声明、communities.location/locationGeo | 继续既有全局开启和独立珺悦配置；推荐只补真机允许/拒绝、GPS、只前台/结束停止、坐标更新后GeoPoint一致验证；不重复索取开启授权。 | 1–2 个测试坐标；约半天；接口资格与额度未知 |
| D16 助老【提供业务配置】 | 餐费上限、探访计件额须按小区填，不能臆造；陪诊人员证书与食堂资料未齐 | 用户/物业/合作方；代理核验配置 | elder 开启前 | canteens、prices.meal/visit/escort、cardPlans、证书 | **推荐逐小区提供食堂及商家映射、goodsCapMax、visit.taskPayout、排期、价格和合格陪诊人员**。30 天预约范围/完整落在值班时段/报告逐项填写已定。验收：越时段拒绝、周期地址不变、关注先电话、导出无敏感字段 | 配置半天；业务/证书/保险费用未知 |
| D17 喂宠及空置房【提供业务配置】 | 密钥和具备资质/保险的服务员未齐；空置房 perVisitPayout 无可猜默认 | 用户/物业决定运营值和责任；代理配置 | pet/vacantHome 开启前 | 小区价格/节假日/卡计划/服务人员、D06 | **推荐先一个测试小区**，提供宠物品类价、节假日及加价、可用入户方式、钥匙交接责任、巡检月价和 perVisitPayout。空置房 30 天有效、每月 1/15 排期已定。验收：当天权限、每次照片/视频、漏次退款、密文清理 | 联调约 1 天；培训/保险及钥匙保管成本未知 |
| D18 回收与积分【提供数值/合作方】 | 各品类积分价、企业收购价与企业映射缺一不可 | 用户/回收企业，代理配置 | recycle/points 开启前 | communities.prices.recycle、merchants、积分设置 | **推荐先完成回收企业审核，再按类别填值和服务员计件额**；积分下取整/收购价四舍五入到分已定；不向住户付回收现金。验收：0.1kg 精度、账本/月结、缺项阻止开启 | 配置半天；商业价格由用户定，积分兑换成本须核算 |
| D19 商家与佣金【提供资料/数值】 | 真实商家、员工范围、商品/服务和佣金尚未配置 | 商家提交、用户审核；代理联调 | merchants 开启前 | merchants/merchantServices、管理端 | **推荐真实申请→审核→授权流程**；提供服务小区、执照信息、员工、固定价/报价制服务、佣金、对公结算安排。pending_quote 不自动过期已定。验收：跨商家隔离、报价后付款、开锁只记核验结果、结算正确 | 准备与技术联调半天至 1 天；合作费用未知 |
| D20 驿站批送【提供合作与授权数据】 | 无 station 账号申请；需住户明确 doorDelivery 同意，不能批量代开 | 驿站申请、用户审批、住户自主授权；代理验证 | stationDelivery 开启前 | stations/stationApplications/deliveryBatches | **推荐一站先试**，给站点代码、服务小区、单件收费/报酬、结算规则；逐户真实同意。验收：申请批准、撤回后跳过、每户完成前复查、对账件数准确 | 开发测试可先 2–3 户，验收场景最终 20 户；约半天，服务费用另定 |
| D21 优惠券/积分营销【提供规则参数】 | 没有预置券；发券会形成实际优惠负担 | 用户定预算/参数；代理配置验证 | coupons/points 开启前 | couponTemplates、积分抵扣参数 | **推荐限量、限定测试小区的测试券**；提供面额/折扣、门槛、有效期、适用服务、总量、人限、新客/领取/推荐发放方式及积分兑换值。已定优惠择优、推荐首单发券、退款恢复算法不重选。验收：限额并发、幂等及退款恢复 | 技术半天；优惠预算须用户明确，不能自动按推荐金额批准 |
| D22 联合社区/广告公告【待运营范围】 | 已有2小区不等于联合组/物业/广告业务配置已完成；F09两广告位未接 | 用户/物业/广告方决定；代理录入测试 | 对应功能开启前 | federationGroupId、ads、notices | **推荐两测试小区先验证联合范围**；提供组成员、物业角色、广告位/价格/起止/投放范围和站内目标、公告内容。广告仅确认收款后记平台一笔收入已定；测试不冒充真实已收款。验收：跨区可见边界、广告标识、收款幂等 | 配置半天；广告费用与商业确认由用户负责 |
| D23 广场、聊天、闲置、活动、帮带【选择试用范围】 | 类目、内容审核、运营人员及真实业务验收未齐；不能因部署就全开 | 用户定试用模块和审核负责人；代理验收 | D03/D12/D14 及账号齐后 | 相关功能开关与模块 | **推荐逐模块/逐小区启用**；先信息发布/聊天，再付费悬赏/活动，担保闲置须单独确认资格后再开。提供活动地点/容量/时间/收费与测试参与者；跨境帮带法规文字需正式运营前复核。验收：举报/禁言、成员隔离、并发容量、退款续批；最终仍完成全部 40 场景，不缩减交付 | 多账号验收约 1–2 天；真实业务费用另批 |
| D24 真实支付/退款【提供商户配置和预算】 | 商户关联、支付产品、云支付受理关系未就绪；体验版套餐页面将“微信支付集成”列在升级能力中，当前套餐是否可用须确认 | 用户办理/确认交易；代理配置、查单对账 | 模拟全链路通过、主体/商户资格齐后 | 微信支付、开发云支付调用链、config.payMode | **推荐先确认套餐和官方云支付接入条件，再配 SUB_MCH_ID、ENV_ID、ALLOW_MOCK_PAY=false，并将 payMode=wechat**；用户给实际测试付款人、收款商户、金额上限、笔数、退款范围。验收：真实付款/退款/回调/主动查单、重复消息幂等；无预算不执行 | 资金上限及手续费未知，必须用户确定；技术约 1 天，办理等待未知 |
| D25 新版自动打款【提供配置和预算】 | autoPayout 关闭；商户产品、场景、密钥和余额未配置 | 用户办理、保管密钥并确认转账；代理技术联调 | D24 与收入账本通过后 | payout/timer 环境变量、商户平台 | **推荐保持关闭直至条件齐全**，提供非秘密配置并由用户安全录入密钥，变量名称以当前 [MANUAL_SETUP](../../MANUAL_SETUP.md) 及 payout/timer 源码逐项核对；收款人、笔数、总额单独确认。验收：微信确认页、SUCCESS 后结算，失败解锁、卖家 1999.99 上限、跨区金额分摊。未开启时沿用已批准人工结算，不擅自实际打款 | 商户余额、手续费与试转预算未知；约 1 天技术验证 |
| D26 HTTP网关【低优先待决】 | 既有记录总开关开、零路由；本轮未重读配置，无证据实际HTTP暴露 | 用户决定；代理执行回读 | 当前可决定 | 开发 CloudBase → HTTP 网关 | A **推荐确认无其他依赖后关闭总开关**；B 保持现状且继续零路由。微信云调用/官方云函数回调优先，未来新增 HTTP 独立审批鉴权。验收：总开关状态、零路由、wx.cloud 调用仍正常 | 约 15–30 分钟；关闭前先核对依赖 |
| D27 导入临时对象【可暂缓】 | 既有两临时对象约2.3KB；当前2小区应保留；本轮未重新列云存储 | 用户确认删除两个对象；代理执行回读 | 可最后处理 | 云存储根目录 | A **推荐仅删除 tmp-1794057144151-communities.json（1.75KB）及 tmp-1794057911479-buildings.json（582B）**；B 保留。删除不删数据库文档。验收：仅两文件消失，现有2小区及示例楼栋均保留 | 约 10 分钟；永久删除需执行时确认 |
| D28 station旧编辑器异常【不再阻塞】 | 后续源码72文件已成功回读；不以旧下载报错要求重建函数 | 用户决定；代理只读重试 | 低优先级 | CloudBase station 在线编辑器 | 无需当前决策；旧源码下载故障已由后续回读排除。保留历史故障记录即可。 | 本项暂无新增工作；实际站点业务验收另见D20。 |
| D29 基础库及真机兼容性【选择验证基线】 | 工具显示灰度基础库 3.18.0，以及 SharedArrayBuffer/worker 等告警；这不等于业务故障，也不能忽略兼容测试 | 用户确认基线；代理编译检查，用户配合真机 | 正式体验验收前 | 开发工具本地设置、project.private.config.json | A **推荐选择工具中可用的稳定基础库，另测最低兼容版本**；B 保持灰度仅作补充。先列实际可选版本再设置，不猜版本号。验收：69 页、隐私/定位/相机/订阅/支付真机路径、弱网及离线恢复、主包实际小于 2MB | 至少一台 iOS/Android 真机分别覆盖更稳妥；约半天至 1 天，不购设备 |
| D30 体验版与验收参与人【指定版本/成员】 | 云函数部署不代表小程序已上传体验版；完整 40 场景仍待逐项验收 | 用户定体验成员/版本/资料授权；代理准备发布包与步骤 | 上述阻塞解除后 | 微信开发者工具、公众平台版本管理 | **推荐先开发版联调，再上传指定 commit 的体验版供名单内成员验收**。上传前给版本号/说明/代码范围；不发布正式版。按 ACCEPTANCE.md 逐项记录通过/失败/阻塞、截图、测试账号角色，不以空列表测试替代成交 | 约 1–2 天组织验证，40 场景耗时受账号和业务前置影响 |
| D31 合并/发布【后续批准】 | 本轮GitHub21PR，#1已合并、#2–#21共20开放草稿；完整验收未完 | 代理提供 PR 依赖/测试证据；用户验收并批准合并/发布 | 验收结论形成后 | GitHub PR、main、公众平台 | **推荐先完成验收，再按依赖次序合并并核对 main 包体**；允许开发分支提交推送不等于允许合并 main。正式发布另行确认，不以批量“按推荐”代替尚未完成的验收 | PR 数与最新状态届时实时查询，不在此猜测；合并约半天，审核等待未知 |
| D32 生产环境、套餐、备份和运行责任【后续提供预算】 | 当前仅开发环境，已批准 DEV/PROD 分离但未批准开通费用；套餐期限与余量需在执行前重新确认；正式恢复演练/容量预算未定 | 用户决定预算与运营负责人；代理给具体配置清单 | 上线前；开发额度不足时提前处理 | 独立 PROD、CloudBase 套餐/日志/告警/备份 | **推荐开发继续现有套餐，生产另建环境和独立密钥/配置，只迁必要基础数据**；用户确定月预算、续费/超额策略、告警收件人、备份保留与恢复目标。付款/协议由用户确认；不得复制测试用户和 mock 账本到生产。验收：双环境隔离、生产 mock 禁用、恢复演练、日志脱敏 | 此前页面显示 4 万资源点，本轮未复核剩余额度，具体付费价格/生产容量未知；准备约 1–2 天，云资源另核 |

## 9. 接下来执行顺序及用户需提供的最小信息

| 顺序 | 代理应做 | 需要用户的具体内容 | 完成证据 |
|---|---|---|---|
| 1 | 按本报告确认的修复方案补原规格缺口，优先入口/权限/禁言；同步规格只记已批准决定 | R01–R05方案选择；不需再次确认你要“全部入口”这个目标 | 修复差异、针对调用链回归、正常与越权证据 |
| 2 | 核对运行版本/环境；完成既有授权8包更新并回读 | 必要的工具登录配合；已选文件无需因本报告再选；无需重复上传授权 | 8包逐文件哈希、前后端版本记录 |
| 3 | 补楼栋与手填绑定真实验收 | 珺悦楼栋/单元；使用本人电话和合法门牌的绑定操作同意 | 真实成功、拒绝/保存失败、返回、重进、事务/赠券异常结果 |
| 4 | 各角色工作台与业务正反向测试 | 是否恢复D07；具体管理员及测试成员角色/小区；不是直接给任意账号全部权限 | 多身份、小区、参与关系、并发隔离；普通用户不能管理 |
| 5 | 非资金模块及平台能力、图片/定位/扫码/通知 | 模块试用范围、模板/审核配置、必要业务资料；D06按你决定保持或恢复 | 真实平台接口/媒体/拒绝路径与数据一致性 |
| 6 | 模拟交易/定时/批量完整闭环 | 是否恢复D05；D09受控运行范围；不会因“测试”自动启动timer | 40场景涉及的模拟链路、15关闭回归、失败补偿/幂等/负载 |
| 7 | 真机69页对稿与完整体验版交付 | 测试设备/体验成员；商户、密钥、预算就绪后再做真实资金 | 69页UI功能证据+4真实支付/退款+转账场景+用户签收 |
| 8 | 整理PR依赖和最终main/生产发布包 | 验收后的合并批准、正式发布批准及生产预算 | 按依赖合并验证、DEV/PROD隔离、备份恢复与发布记录 |

不能用“有商户后全好”解释现状：入口、后台配置、物业只读、举报、禁言、广告位、文档均是产品/实现问题；商户仅是涉及真实支付/退款/转账的前置之一。不能用“手填后非交易都好”解释现状：角色、真实楼栋、开关、内容审核、消息、密钥和UI仍分别有缺口。

## 10. 已交付资料直接入口

- [完整README与图解](../../../README.md)
- [21云函数用途及页面调用说明](../../product/CLOUD_FUNCTIONS.md)
- [69页逐项UI/功能验收册](../../product/PAGE_ACCEPTANCE.md)
- [27页可编辑产品PPT](../../product/jinlin-product-introduction.pptx) / [PDF预览](../../product/jinlin-product-introduction.pdf)
- [原40场景及补充交接](../../TEST_HANDOFF.md)（历史段须结合本报告最新状态，F14待整理）

本报告只交付检查结果，未把推荐方案写成已批准新规格；既有原包、业务代码、原始测试证据保留。后续发现新问题继续入账，不能保证一次审计证明不存在其他缺陷。
