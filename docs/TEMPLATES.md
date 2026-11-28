# 订阅消息模板设置

在微信公众平台「功能 → 订阅消息」添加以下一次性订阅模板，将模板 ID 填入云开发 `config` 集合的 `global.templateIds`。ID 为空时系统跳过发送。

| 键 | 收件人 | 字段映射（默认） | 页面 |
|---|---|---|---|
| `newTask` | 当前小区、等级达标且值班的服务员 | 订单号 `character_string1`、服务 `thing2`、状态 `phrase3`、时间 `time4` | `provider/hall/hall` |
| `accepted` | 下单住户 | 同上 | `pages/orders/detail` |
| `delivered` | 下单住户 | 同上 | `pages/orders/detail` |
| `unaccepted` | `config.adminOpenids` 中的管理员 | 同上 | `admin/order/order` |
| `eventReminder` | 已报名且同意订阅的住户 | 活动 `thing1`、地点 `thing2`、开始时间 `time3` | `events/detail/detail` |
| `visitReport` | 独居探访或空置房巡检订单下单人（每条任务订单逐次授权） | 订单号 `character_string1`、服务 `thing2`、状态 `phrase3`、时间 `time4` | `pages/orders/detail` |

默认字段类型必须和模板实际字段类型匹配。可在 `config.templateFields` 按模板键覆盖字段名，例如 `{"accepted":{"orderNo":"character_string1","service":"thing2","status":"phrase3","time":"time4"}}`。模板文本会按微信字段长度截短。

在开发者工具和真机中分别检查模板为空、用户拒绝、微信接口发送失败和授权成功；这些情况都不能改变订单状态。模板消息的剩余额度由微信平台管理，工作台数字只是本机累计的授权提示次数，不代表微信实际额度。
