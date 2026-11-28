# D43 全页设计 / D44 手填电话 / D45 绑定一致性：验证与交接

本轮在 fix/dev-integration 上，尚未合并 main。严格以用户批准设计稿为准；功能参数按用户后续 D44 手填决定变化。不能把静态 69 页覆盖等同于 69 页已完成真实业务验收。

| 维度 | 当前范围 |
|---|---|
| What | 69 页统一视觉、核心三页重新按稿调整；手填电话、未验证标记与后端校验；云定位只读核查 |
| Why | 原实现与批准稿存在比例/图标/布局差异；个人主体手机号授权不能作为手填绑定的前置；定位必须用实际云配置判断 |
| Who | 开发者执行代码和隔离测试；用户决定云包上传、真实小区定位配置、角色及最终验收 |
| When | 本地回归已执行；云端新包部署、真机和角色前置后继续真实成功链路 |
| Where | 本地 jinlin，官方开发工具，既有开发云环境；未修改生产环境 |
| How | 以下证据及69页逐项清单；禁止将生成图作实机证据，禁止将隔离 fixture 写入云端 |
| How much | 无新增依赖下载、无付费升级、无真实交易；云只读检查使用既有套餐，实际调用费用未知 |

## 已执行

- 570 项 Jest（50 套）通过，见 jest-summary.json；包含新增手填号码格式/来源/验证状态规则。
- 44 项基础前端、15 项前期修正、13 项绑定/返回兼容回归通过。
- 新增 16 项手填/介绍/定位触发页面隔离场景通过，`manual-phone.cjs/json`。
- 实际 user 云函数入口配合内存数据库的24项测试通过，`user-entry.cjs/json`：手填成功、伪造角色/来源无效、错误输入不写资料、旧号保留、真实换号来源、封禁用户拒绝。没有实际云写入。
- D45 已批准并修复：绑定事件失败回滚资料，赠券失败仍返回绑定成功并独立提示，当前用户可幂等重试。故障原证据 `user-entry-before-d45.json`，修复结果 `user-entry.json`；没有真实云端写入。
- 78 项功能开关边界、289 次身份边界通过；没有网络/真实数据写入，见对应JSON。
- 69 页、77 WXML、78 WXSS 官方编译通过；504事件绑定可找到处理方法；原事件保留（只有 D44 明确移除的两处授权按钮例外），所有引用资产存在，页面局部及组件样式无禁用的标签/属性选择器，见 style-audit/static。
- 开发工具实际查看首页、绑定、我的、订单空列表和两个协议页，对比结构/间距/插画；绑定返回首页不会立即跳回绑定。没有输入真实电话/门牌、同意协议或提交资料。
- 开发工具实际截图以 `*-native.png` 保存；云配置证据 `cloud-location-check.json`：只有 demo_community，location/locationGeo 缺失，全局/本小区 location=false，地理索引 locationGeo_geo 已存在；没有改云配置。

刷新本项目文件索引及编译缓存后，已核验楼栋/单元对齐与协议行内链接。最终运行0错误、13条工具/基础库提示（包含重复热重载），未见页面局部选择器告警。官方最新包体：总918KB、主包645KB、14分包、361文件；此前364KB/107KB失效。见 native-summary.json、package-check.json 与 package-native.png。没有上传预览/体验版。

## 必须继续验收

1. 更新包含 D44/D45 的 user 云函数后，由用户使用本人或获授权电话，勾选协议并真实保存门牌；核验回首页、小区服务、我的打码/未验证标记，再重启核对持久性。上传需要 D10 的具体新包授权。
2. 69 页逐项清单见 `page-coverage.md`；角色页需要已授权服务员/商家/驿站/管理员/物业，详情页需要对应记录。来源审核、付款/退款、上传/内容检查、订阅消息和定时任务仍按原 TEST_HANDOFF 前置，不因手填号码自动通过。
3. 窄屏、系统大字体、键盘遮挡、长小区名/长订单内容、禁用/加载/报错/空/有数据状态逐项检查；目前未称全机型通过。
4. 自动定位成功路径：先由用户决定开发环境的实际测试小区与公开中心坐标，推荐只开启该小区 location，保留全局关闭；补写 location 与 locationGeo 后再测允许/拒绝/无附近结果。当前请求只有核查授权，不执行该方案。
5. 真机微信手机号换号属于独立可选路径，不能用手填成功代替其资格或结果。

## 复跑

在项目根目录执行：

```sh
npm run sync
npm test
node docs/verification/2026-11-08-ui/manual-phone.cjs
node docs/verification/2026-11-08-ui/user-entry.cjs
node docs/verification/2026-11-08-ui/style-audit.cjs
node docs/verification/2026-11-08/static.cjs
node docs/verification/2026-11-08-decisions/binding-flow.cjs docs/verification/2026-11-08-ui/binding-regression.json
node docs/verification/2026-11-08-decisions/frontend.cjs docs/verification/2026-11-08-ui/decisions-frontend.json
node docs/verification/2026-11-08-decisions/feature-boundaries.cjs docs/verification/2026-11-08-ui/feature-boundaries.json
```


## 本轮云端部署已授权、待选包

已按提交 `110ebe8b562cb1b8304a056e89bac5994b00e95d` 生成 `/tmp/jinlin-deploy-110ebe8/manifest.json`：8包、每包72文件、共964651字节，ZIP完整性与逐文件SHA-256已核对。摘要见 deployment-manifest.json。

- user：手填电话、来源/验证状态、D45绑定事务与本人赠券重试，是手填真实成功验收的必要更新。
- provider、order、membership、merchant、idle、board、timer：同步实际使用的“请先填写联系电话”提示，统一替代原“请先授权手机号”文案；不改这些函数的业务规则。
- timer仅更新代码。包内config.json保留仓库声明，但本次不得执行触发器配置部署或启用定时器。
- 仅既有开发环境，云端安装现有wx-server-sdk依赖；不改变角色、开关、HTTP、密钥、套餐或生产。用户已明确批准本批8包，授权持续有效。当前0/8上传：自动选包工具拒绝/tmp和IdeaProjects路径（不在工具配置的工作区根），原生Chrome没有对应CloudBase窗口，等待用户手动选择user.zip；文件选择SHA-256校验已提前准备。不得为此扩展工具文件权限。
