# QA229 驿站创建页首次身份竞态（2026-11-28）

| 5W2H | 结果 |
| --- | --- |
| What | P63 首次会话身份变化或原批次查询迟到后，结束加载并保留主动重试。 |
| Why | 实际页面配合合成 A/B 驿站复现：首次全局身份为空，会话返回 A 时当前已是 B，页面仍 `loading=true`、无错误；旧结果虽未触发创建，却无法继续。 |
| Who | Codex 按用户已统一选择的推荐方案修复与回归；真实驿站体验成员场景待验。 |
| When | 先保留修前失败断言，再修前端并复跑原创建/恢复边界。 |
| Where | `miniprogram/station/create/create.js` 和同页失败文案；不改 `station` 云函数。 |
| How | 页面仍可见且仍是本轮读取时，身份变化显示“登录身份已变化，请重新加载”；迟到原批次查询同样结束加载，不回填旧结果。点击“重新核对”后仅当前本人可创建。 |
| How much | 前端一页；开发云新增批次、账单、照片和资源均为 0。 |

`qa229-station-create-first-session-repro.cjs` 修前在“旧会话必须结束加载”断言失败，修后两种身份竞态与当前身份主动重试通过。`station-create-recovery.cjs` 20/20、`station-create-boundaries.cjs` 24/24、`station-create-resident-recheck.cjs` 21/21，以及 Jest 55 套 653 项通过；JS 语法与 `git diff --check` 通过。上述仅为实际页面代码的隔离检查，模拟器真实点击和有权限的驿站账号验收仍待完成。

本轮另尝试将主模拟器切至 375 宽核对 P02/P09。控件树显示 iPhone 6/7/8，但截图仍停在 320 宽画面；月卡入口控件点击无导航，坐标点击返回 `noWindowsAvailable`。因此未新增 375 宽视觉或按钮通过项，也未操作真实订单。
