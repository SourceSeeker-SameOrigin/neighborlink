# 2026-11-08 补测证据

业务源码基线：`5b210b5`，分支 `fix/dev-integration`。本批提交仅新增测试证据与文档，没有修复 D33–D36。所有 fixture 都是合成数据，SDK/存储替身只存在于本目录脚本的隔离 VM，不接入应用。没有真实身份、手机号、密码、认证头或云端数据快照。

| 维度 | 说明 |
|---|---|
| What | 保留可重跑的静态、入口边界、前端异步和接口契约检查 |
| Why | 区分既有 Jest 通过和补测新发现的缺陷，防止把单测当成全业务验收 |
| Who | 代理执行并记录；用户决定修复和后续验收 |
| When | 2026-11-08；修复后需要重跑失败项及相关回归 |
| Where | jinlin 仓库根目录运行；输出固定在 `/tmp/jinlin-check-20261108` |
| How | 使用已有 Node/Jest/Babel parser 及本机微信官方 wcc/wcsc，不下载依赖；按下列命令重跑 |
| How much | 45 套/487 项 Jest；288 入口边界断言；44 个前端场景；另有登录契约和展示补测。数量不可作为整个项目覆盖率 |

```sh
mkdir -p /tmp/jinlin-check-20261108
npm test -- --coverage --coverageDirectory=/tmp/jinlin-check-20261108/coverage --json --outputFile=/tmp/jinlin-check-20261108/jest-results.json
node docs/verification/2026-11-08/static.cjs
node docs/verification/2026-11-08/boundary.cjs
node docs/verification/2026-11-08/frontend.cjs
node docs/verification/2026-11-08/login-contract.cjs
node docs/verification/2026-11-08/supplement.cjs
```

每条分别运行，frontend 当前会因 3 个缺陷断言非零退出。supplement 依赖 boundary 生成的 actionMap；login-contract 和 supplement 是诊断报告，退出零仅表示探针执行完毕，必须读取报告中的缺陷字段。static 输出 issues 数组，不能只看进程退出码。官方编译器路径固定为本机微信开发工具安装目录，其他机器需对应安装工具后调整路径。

| 文件 | 本次结论 | 不能证明什么 |
|---|---|---|
| jest-summary.json | 45 套/487 项通过，记录每套相对路径和数量 | Jest roots 仅为 `_shared`，没有覆盖全部页面/云入口 |
| static.json | 69 页、14 分包、177 个非测试 JS、124 JSON/JSONL、564 相对引用、53 组件引用、105 静态路由、496 事件绑定候选均未发现缺失；76 WXML/77 WXSS 官方编译通过 | 绑定名存在不保证业务行为；不是实际主包大小、运行时渲染或真机结果。177 排除 45 个 Jest 文件，与旧统计 222 的口径不同 |
| boundary.json | 21 函数、165 actions、288 拒绝/输入边界通过；DB/网络调用均 0；189 固定 API 目标匹配；1407 个共享副本一致 | SDK 替身不验证真实 OPENID、平台权限或数据库事务 |
| frontend.json | 44 场景中 41 通过、3 失败；失败属于 D33/D34 | 本地 wx 替身不等于真机隐私/订阅/媒体授权 |
| login-contract.json | 5 次内存读取、0 写；board 开启却无 me 入口条件，且登录返回 locationGeo（D35） | 未开启真实小区功能，未增加云测试用户 |
| supplement.json | 7 处动态 API 调用目标匹配；回收初始化失败没有重试入口，2 处字号低于规格（D36） | 不是完整无障碍或视觉验收 |

Jest 本次已加载文件的覆盖率：语句 76.35%、分支 65.41%、函数 80.33%、行 78.58%。这些分母只包含 Jest 收集到的文件，**不是全仓库覆盖率**；例如 eventCancellation、payoutFlow、notify 的行覆盖率分别约 8.19%、8.72%、8.88%，相关复杂路径仍需配置后的联调。完整原始覆盖报告和 Jest 运行 JSON 保留在上述临时目录，本目录仅保留简要结果，临时目录可能被系统清理。

本轮真实界面证据采用语义摘要，避免保存个人信息/凭据：绑定页显示测试小区、1号楼、1单元；协议未勾选时手机号和保存按钮禁用；隐私与服务协议可打开并返回；订单“已完成”“售后”均返回 loading=false、count=0、error 为空。最后导航“我的”后 Mac 锁定，未确认其最终画面。最后一次可操作时 Errors=0、Warnings=18，未完成逐条告警分类，不能称运行无告警。

后续恢复记录：用户再次解锁后，2026-11-08 北京时间约 13:48–13:57 已补齐“我的”、服务员申请表、无服务员工作台、进行中订单及月卡入口绑定保护。新增10项真实云只读/无效参数检查和告警分类，记录在 [live-resume.json](live-resume.json)。与前述凌晨检查是不同批次，后者补齐前者中断项；没有重复执行487项Jest或更改源码。

官方包体分析的8KB/106文件/2分包与当前14分包不符，刷新及重新编译后仍不符，不采信为主包体积证据，D37待决。编译后启动/绑定正常。本次最后一条追加控制台诊断又因Mac锁定未取得结果，不计为通过；不影响此前已经返回的10项云检查和页面证据。浏览器工具仍报告本地浏览器使用关闭，未进入浏览器或绕过设置。
