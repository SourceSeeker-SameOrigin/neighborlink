# 体验版 33 项 A 方案执行台账

2026-11-27 用户统一批准 `pending-decisions-20261127.md` 的 33 项推荐 A。以下“本地通过”只表示实际页面代码的隔离回归；模拟器、真机、开发云和 69 页最终签收分别记录，不由本地通过自动推定。

| 阶段 | QA 编号 | 当前结果 | 主要隔离证据 |
| --- | --- | --- | --- |
| 本地通过，界面待验 | QA149、QA150 | 管理员导出 4/4、驿站审核 4/4 | `admin-export-identity-boundaries.cjs`、`station-review-identity-boundaries.cjs` |
| 本地通过，界面待验 | QA160、QA181 | 看板身份 4/4、日期恢复 4/4 | `dashboard-boundaries.cjs`、`dashboard-date-boundaries.cjs` |
| 本地通过，界面待验 | QA161 | 回收对账身份 4/4，既有 QA44/45 回归通过 | `recycle-admin-boundaries.cjs`、`../2026-11-11-ui-audit/qa43-45.cjs` |
| 本地通过，界面待验 | QA162、QA183 | 服务员审核 4/4、证书失败回退 2/2 | `provider-review-boundaries.cjs`、`provider-certs-failure-boundaries.cjs` |
| 本地通过，界面待验 | QA163、QA182、QA164 | 订单列表 5/5、金额 4/4、详情 5/5 | `admin-orders-boundaries.cjs`、`admin-orders-quote-boundaries.cjs`、`admin-order-detail-boundaries.cjs` |
| 本地通过，界面待验 | QA152–QA156 | 求助和闲置详情、发布草稿、卖家履约的跨身份保护，14/14 | `content-detail-identity-boundaries.cjs` |
| 本地通过，界面待验 | QA158、QA159 | 优惠券模板 6/6，小区配置 7/7；同管理员返回时保留有效草稿，换管理员后旧保存回读不能覆盖新资料 | `coupon-admin-boundaries.cjs`、`community-config-boundaries.cjs` |
| 本地通过，界面待验 | QA165–QA172 | 回收、公告、优惠券、活动、聊天、商家及申请入口的跨身份保护 | `recycle-notice-identity-boundaries.cjs`、`coupon-resident-boundaries.cjs`、`event-list-identity-boundaries.cjs`、`chat-list-boundaries.cjs`、`community-list-identity-boundaries.cjs`、`merchant-list-ad-identity-boundaries.cjs`、`merchant-detail-identity-boundaries.cjs`、`application-identity-boundaries.cjs` |
| 本地通过，界面待验 | QA173–QA180 | 首页、门牌、七类服务表单、订单、月卡、我的、服务员申请的跨身份保护；月卡另验同人切小区旧操作失效 | `home-identity-boundaries.cjs`、`binding-identity-boundaries.cjs`、`service-form-identity-boundaries.cjs`、`core-account-identity-boundaries.cjs`、`provider-application-identity-boundaries.cjs` |

33 项均已完成本地修复。26 个直接相关的边界脚本共 187/187 通过；交叉运行本目录全部 52 个边界脚本，退出码均为 0。项目单测 55 套、652/652 通过；改动过的 32 个页面与工具 JS 语法检查通过，`git diff --check` 通过。随后补跑旧 QA15、QA16：旧合成管理员夹具缺少用户 ID，与现在的身份校验不符；补齐夹具后，配置保存失败与已保存刷新共 19/19 通过。69 页静态引用、77 个模板组件和 207 个隔离加载场景均无失败；样式结构检查 69 页无问题，旧基线中四页 `load` 绑定已按此前获批的 `retry` 入口更新。模拟器连接本轮连续超时，不能把上述结果写成实际布局或原生交互通过。业务写入、开发云部署、体验版切换均为 0。后续新发现的 QA184–QA188 见 `pending-decisions-after-33-20261127.md`，留待用户统一决策。

2026-11-27 续验：重新运行 69 页 × 3 种失败/未绑定场景，共 207 组；静态引用、事件处理器、路由及资源检查无缺项，未捕获异常 0。77 个 WXML 和 78 个 WXSS 由本机微信编译器编译成功，静态检查问题 0；Jest 55 套、652 项通过。P62 QA138 的既有跨时区缺陷仍复现 4/6，与 QA184–QA188 一起收录在待统一决策清单，但不重复编号。P53 住户喂宠记录 14 项访问保护、10 项媒体访问，以及商家/驿站申请相关 9 项与 QA56 33 项隔离回归通过。开发工具可读到页面控件树，但截图仍为首页而控件树已到管理看板；坐标点击返回 `noWindowsAvailable`，本轮不增加视觉通过页数。没有调用真实业务写入或切换体验版。

2026-11-27 P40/P43 续验：实际求助、出行帮带、悬赏及闲置线下／担保共 5 种发布表单，在合成响应丢失后同页重试都复用请求编号，离页重进后都生成新编号。按现有服务端本人加编号确定记录 ID 的规则，本地模型每类形成两条不同记录；登记 QA189 待用户统一决策。未执行开发云发布、真实悬赏付款或体验版切换，悬赏支付与图片分支仍待单独验证。

2026-11-27 P56 续验：实际商家服务管理页接合成保存响应，在固定价与报价制两种模式下，首笔保存已成功但响应丢失，同页再保存各形成第二条服务，离页重进再保存各形成第三条；服务端新建分支直接 `add`，请求无去重编号。登记 QA190 待统一决策；没有在开发云创建服务、触发审核或上传图片。

2026-11-27 P28 续验：实际优惠券模板管理页接合成保存响应，新建成功但响应丢失后同页重试形成第二个模板，离页重进再保存形成第三个；服务端新建分支使用随机模板 ID，页面请求无去重编号。登记 QA191 待统一决策。QA189 五种发布表单、QA190 两种商家服务模式和 QA191 模板复现脚本均通过；既有商家服务 45/45、管理员优惠券 6/6 回归通过，`git diff --check` 通过。没有在开发云新增模板、发券或产生费用。

2026-11-27 P28 手动发券续验：实际页面及 `coupon.manualIssue` 代码接隔离数据库，首次发券成功但响应丢失后同页重试，同一收件人的券由 1 张变 2 张，模板 `issued` 由 1 变 2，个人上限 2 被用尽；登记 QA192 待统一决策。没有开发云发券或真实库存变化。

2026-11-27 P29 内容创建续验：公告和广告首次创建成功但响应丢失后，页面要求重新读取；读取完成后保留原草稿，重新保存各生成第二条合成记录，登记 QA193 待统一决策。开发工具画面通道本轮连续超时，未新增实景通过页；没有在开发云发布内容、确认广告款或切换体验版。

2026-11-27 P24 结算续验：共享结算代码接隔离账本，未新增账本时重复创建正确返回原单；100 分原单生成后同期间新增 200 分，预览报 300 分，再生成仍返回 100 分原单；原单标记为已打款后，新账本仍不能形成同期间补充单。既有结算页 18/18 隔离回归通过。登记 QA194 待用户确定补充结算或跨期结转口径。开发云没有账务写入、真实打款或导出。
