# 2026-11-08 已批准修正验证证据

本轮是 `d893f9b` 后的 D01–D04/D33–D37 修正；D38 历史订单与D39活动创建修复已批准并完成本地回归。本地自动化使用合成数据；另有17个真实开发云入口检查，仅发送无action的默认测试参数，不伪造云身份、不写真实业务数据。

| 证据 | 当前结果 | 验收边界 |
|---|---|---|
| jest-summary.json | 49套、555项通过 | 共享逻辑；不是全部云端业务 |
| baseline-frontend.json | 原44项全部通过 | 修复原3项失败；ADDRESS_RACE脚本改为等待实际异步handler完成后断言，断言未削弱 |
| frontend.json | 新15项全部通过 | 密码草稿迁移、地址反序/隐藏/重试、回收恢复/重复点击、图片过期/撤权/预览/旧外链拒绝 |
| feature-boundaries.json | 78项全部通过 | 真实云函数入口代码 + 隔离合成数据库；全局/小区覆盖、绑定、越权、管理员准备、D38历史读取/取消与新交易阻断、D39创建/角色/内容拒绝；写入仅本地内存 |
| login-contract.json | 登录成功、我的入口有效、locationGeo不返回 | 实际源码隔离调用，不代表已部署 |
| static.json | 69页/14分包；77WXML、78WXSS官方编译通过；issues为空 | 组件/路由/事件/语法检查；不代替真机排版和官方包体 |
| boundary.json | 21函数、165actions、288项通过；1449共享副本一致 | 无微信上下文时拒绝，DB/网络0调用 |
| deployment-status.json | 18/18源码确认，共1296文件，清单见JSON | 对应*-cloud-readback.json记录72文件SHA256及依赖版本；全部更新完成。编辑器旧显示通过实际云端下载比对排除，权限同步/业务调用边界见cloud-permission-sync.json |
| cloud-permission-sync.json | 13个非空权限声明同步成功，随后936个源文件逐字节一致 | 不等于独立有效ACL回读/真实OpenAPI业务调用；timer等3函数不在本批，未启用触发器 |
| cloud-readonly-smoke.json | 12项真实小程序上下文检查符合预期 | 当前未绑定住户：小区1个、首页空、4功能关闭、2服务员权限拒绝、3订单分组及月卡为空；未写业务数据 |
| permissions.json | 21函数声明匹配人工核对清单 | 13个本批非空声明已通过开发工具同步并确认成功；独立有效权限回读和真实OpenAPI业务调用仍待验收 |
| ui-status.json | 本轮重新编译0错误；官方分析刷新后14分包、329文件、总364KB、主包107KB | 本地包体通过；未上传预览/发布包；旧private-media告警重新编译后不再出现，工具/基础库提示仍保留 |
| cloud-entry-smoke.json | 17个普通函数返回E_UNKNOWN_ACTION，记录独立请求ID | 只验证云端模块加载与未知操作处理，不验证身份、权限或业务成功；payCallback未调用 |

重跑（仓库根目录）：

```sh
npm run sync
npm test
node docs/verification/2026-11-08/frontend.cjs
node docs/verification/2026-11-08/login-contract.cjs
node docs/verification/2026-11-08/static.cjs
node docs/verification/2026-11-08/boundary.cjs
node docs/verification/2026-11-08-decisions/frontend.cjs
node docs/verification/2026-11-08-decisions/feature-boundaries.cjs
node docs/verification/2026-11-08-decisions/permissions.cjs
node docs/verification/2026-11-08-decisions/binding-flow.cjs
```

前四个旧脚本输出到 `/tmp/jinlin-check-20261108`，本目录保存本次结果；原2026-11-08目录历史JSON保留未覆盖。

D02平台依据与限制：微信服务端SDK类型及[腾讯云Node SDK存储说明](https://github.com/TencentCloudBase/node-sdk/blob/master/docs/storage.md)列有 maxAge；[CloudBase当前存储OpenAPI](https://docs.cloudbase.net/api-reference/openapi/storage)同样列出该参数。但[Web SDK更新日志](https://docs.cloudbase.net/api-reference/webv3/changelog)对传统模式TTL有兼容性说明，接口产品/模式不同，不能外推保证本环境恰好600秒。代码请求600秒并限制前端缓存；须部署后用非敏感图片验证同一链接实际过期。未验证前不启用真实证件流程，若平台不支持则按5W2H重新决策，不擅自扩大有效期或改公开存储。

完整用户验收仍以 ../../TEST_HANDOFF.md 为准：40规格场景、15关闭回归、4真实支付、补充与69页索引均保留。D10代码部署及D37本地包体已完成；D01资格、D05–D07配置、云端实际权限/TTL和真机/跨角色实测未完成，不标总体完成。


D41–D42 后续证据：`binding-flow-before.json` 为旧代码13项中12项失败的基线，`binding-flow.json` 为修复后13/13；`d41-jest.json` 为49套555项通过；baseline-frontend.json已更新到批准后的首页/phoneError断言，44/44通过，frontend.json仍15/15；static.json已更新最终官方编译结果。`binding-ui.json`区分实际导航、模拟拒绝回调、隔离成功、资格阻塞；无真实绑定写入。D42仅专用class替换并验证加载无该警告；最终0错误，工具/基础库警告保留。
