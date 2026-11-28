# QA219–QA227 本地整改与验收记录（2026-11-28）

用户已统一选择待决清单中的推荐 A。本记录说明本地代码状态；开发云、体验版及真机结果另行验收。

| 5W2H | 本轮结果 |
| --- | --- |
| What（做什么） | 完成 QA219–QA227 九项前端边界，QA221 另增 `membership.lookupBuy` 只读云函数入口。 |
| Why（为什么） | 修复旧身份结果回填、首次会话失败无重试、月卡创建结果丢失后跨页重复建单。基线与推荐方案保留在 `pending-decisions-after-qa218-20261127.md`。 |
| Who（谁负责） | 用户选择推荐 A；Codex 实现并运行本地回归。真实身份及云端结果尚待独立核验。 |
| When（何时） | 先本地代码与专项回归，再准备云端 `membership` 包，最后做开发云只读与体验成员实景验收。 |
| Where（在哪里） | P02、P09、P10、P13、P18、P24、P28、P32、P44、P45 及 `cloudfunctions/membership`。 |
| How（如何做） | QA219 锁定发券错误回填的本人和读取；QA220 日期草稿按本人隔离；QA221 保存无密码的原请求信息、先只读找单、确认后沿原编号提交；QA222/224/227 首次会话失败结束加载并可重试；QA223 同人返回重读目录并恢复页面内存草稿；QA225/226 拒绝旧小区与身份结果。 |
| How much（多少） | 本轮云端业务写入 0、真实购买 0、真实发券 0。开发云部署和真机测试尚未执行，不计作通过；时间与平台费用待实际记录。 |

## 本地验证

- `qa219-coupon-late-issue-error-repro.cjs`、`qa220-admin-date-owner-repro.cjs`、`qa221-membership-lost-response-reentry-repro.cjs`、`qa221-membership-lookup-cloud.cjs`、`qa222-membership-session-error-repro.cjs`、`qa223-bind-return-repro.cjs`、`qa224-provider-apply-session-error-repro.cjs`、`qa225-me-community-change-repro.cjs`、`qa226-dashboard-community-change-repro.cjs`、`qa227-idle-lists-session-error-repro.cjs` 均退出码 0，使用实际页面或云函数代码及合成身份、订单和目录。
- QA221 四种计划分别覆盖原单已创建但响应丢失、原单确未创建后本人沿原编号确认提交。QA52 既有回归 44/44 通过；本轮不读取或持久保存入户密码。
- `npm test -- --runInBand`：Jest 55 套、653 项通过；`git diff --check` 与修改的 JavaScript 语法检查通过。

## 开发者工具手工复验

1. P02 同一住户填写门牌与协议，打开协议再返回；核对目录重读、有效草稿仍在；换住户或楼栋失效时不保留旧选择。模拟首次身份失败后主动重试。
2. P09 四种计划分别模拟购买请求结果未知：重进时先查询原编号；已存在则只进原订单，未存在则核对原选择并确认沿原编号提交；空置房入户密码必须重填。验证导航失败只重试导航，换人不显示前一人订单。
3. P10、P18 以同人小区 A→B 和管理员/物业角色变化触发迟到读取；页面不展示 A 数据，显示错误并只读重试。P18、P24、P32 以 A→B→A 与北京时间跨日核对各自日期范围。
4. P13、P44、P45 首次会话失败后应结束加载、显示重试；恢复会话后仅展示当前本人。P28 手动发券部分失败后切人或离页，不显示旧收件人错误。

上述步骤仍待实际界面及体验成员回读，不能以隔离脚本代替。`membership.lookupBuy` 尚需部署到开发云并核对本人权限；在云端更新前不要用新版前端进行月卡购买联调。
