# 开发数据库初始化与验收

| 维度 | 内容 |
| --- | --- |
| What | 创建核心与已实现扩展集合、导入示例种子、建立索引及应用前端权限规则 |
| Why | 为登录、门牌绑定和 mock 订单提供测试数据 |
| Who | 开发者准备文件；用户在集中验收时确认云环境并操作控制台 |
| When | 首次部署业务云函数前完成，之后按下列步骤验证 |
| Where | 开发环境；生产环境需使用真实小区配置，不能直接套用示例数据 |
| How | 按集合分文件导入 JSON Lines，再检查日期类型、关联关系、索引及权限 |
| How much | 5 条示例文档；初始化云端资源可能使用已有套餐额度 |

1. 打开微信开发者工具的云开发控制台，确认当前是开发环境。
2. 创建 `users`、`communities`、`buildings`、`providers`、`orders`、`memberships`、`ledger`、`settlements`、`payouts`、`events`、`signups`、`eventCancelJobs`、`eventCancelTasks`、`config`、`reports`、`auditLogs`、`mediaChecks`、`conversations`、`messages`、`visits`、`secrets`、`posts`、`comments`、`couponTemplates`、`couponIssueBatches`、`coupons`、`pointsLedger`、`idleItems`、`ads`、`notices`、`merchants`、`merchantServices`、`deliveryBatches`、`stationApplications` 集合。
3. 在每个集合的权限设置中，选择自定义安全规则，将 `security-rules.json` 中对应集合的规则对象单独粘贴并保存。该文件是集合到规则的清单，不能整个粘贴为单个集合的规则。
4. 依次进入 `communities`、`buildings`、`config`，使用「导入」选择同名 `seed/*.json`。文件内容为 UTF-8 JSON Lines：每行一个对象，不是数组，也不是格式化的多行 JSON。
5. 日期使用扩展 JSON 的 `$date` 表示；导入后检查 `createdAt`、`updatedAt` 是 Date 类型，而不是普通对象或字符串。示例时间是固定测试时间，不能代表真实创建时间。
6. 按 `indexes.md` 建立索引，确认全部可用。
7. 验证 `communities` 恰有示例小区，`buildings` 有 3 栋楼且每栋 2 个单元、`communityId` 均指向示例小区；3 号楼短码为 `K3F9QA`。
8. 验证 `config/global` 的 `payMode` 为 `mock`，模板 ID 和管理员列表为空；开发云函数的 `ALLOW_MOCK_PAY=true` 需另行配置。客服电话是占位号码，正式使用前须替换。

种子 `_id` 固定。重复导入前先检查集合中是否已有同 `_id` 文档；不要使用覆盖模式替换已经调整过的小区价格或全局配置。已有文档时逐项比较后决定是否更新。未提供生产账号、管理员 openid 或任何密钥。

验收权限：小程序客户端只能读取 `communities` 和 `buildings`，不能直接写任何核心集合；其余集合不允许客户端直接读写。业务云函数使用服务端权限，因此必须自行完成身份和角色检查。

手动发券的 `couponIssueBatches` 只保存管理员、模板、收件人编号与请求指纹，用于结果未知时核对同一批次。集合按文档 ID 读取，无需额外索引；客户端读写均应拒绝。开发云启用 QA192 前，先确认集合存在并应用上述权限规则，不导入样本批次。

本地执行 `npm test -- seed.test.js` 可检查逐行 JSON、字段、默认价格、关联关系及权限清单。云端实际导入、索引可用性及客户端拒绝访问仍需验收，不由本地测试替代。
