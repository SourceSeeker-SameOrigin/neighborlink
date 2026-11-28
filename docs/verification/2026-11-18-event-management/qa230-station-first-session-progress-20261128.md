# QA230 驿站三页首次会话竞态（2026-11-28）

| 5W2H | 结果 |
| --- | --- |
| What | P62、P64、P65 首次身份变化或首次只读响应迟到后结束加载，允许主动重试。 |
| Why | 实际页面接合成身份和只读结果，六种目标场景修前全为 `loading=true`、空错误；不能把旧结果当成当前本人资料。 |
| Who | Codex 按用户统一选择的推荐方案修复、回归；有权限驿站和服务员的实际业务验收待安排。 |
| When | 先运行修前脚本，再修三页并复跑旧边界及全量 Jest。 |
| Where | `station/workbench`、`station/worker`、`station/batch` 三页前端，不改云函数。 |
| How | 区分页面生命周期与当前身份；首次冷加载可显示身份变化和重试，曾核验页面的旧回调继续零写入。分页失败保留已读数据的原规则，以及相机返回重核规则仍生效。 |
| How much | 三页读取边界；开发云新增批次、接单、照片、配送与费用均为 0。 |

`qa230-station-first-session-races.cjs` 修前六种场景均未结束加载，修后 6/6 通过。既有 `station-workbench-boundaries.cjs` 38/38、`station-worker-boundaries.cjs` 40/40、`station-batch-boundaries.cjs` 26/26、`station-batch-media.cjs` 28/28 和 QA207 分页对照通过。Jest 55 套 653 项通过，JS 语法与差异检查无误。合成检查不能代替模拟器实际按钮、手机原生相机及合格账号真实配送；本轮均未操作。
