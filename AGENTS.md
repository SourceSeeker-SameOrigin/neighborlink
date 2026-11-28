# AGENTS.md — NeighborLink（近邻帮）小程序（给 Codex 的仓库说明）

你在实现一个微信小程序「近邻帮」（暂定名）：以小区为单位，由物业授权的实名服务员和邻居帮手，为住户提供取快递、代扔垃圾、代买、帮把手等上门小服务。

**开始任何任务前，先完整读一遍 `docs/SPEC.md`（核心交易）；做 T16 及以后的任务还要读 `docs/SPEC_EXT.md`（18 个扩展模块）；再读 `docs/TASKS.md` 里你要做的那个任务。** 两份 SPEC 是唯一的需求来源；SPEC 没写的，按"最简单、最安全"的方式做，并在 PR 描述里列为"我做的假设"。

## 技术栈（已定，不要更换）

- 前端：微信小程序原生框架（WXML / WXSS / JavaScript），**不引入任何 UI 组件库**，不用 TypeScript，不用 Taro / uni-app。
- 后端：微信云开发（云函数 Node.js 16+、云数据库、云存储、云调用）。没有自建服务器。
- 测试：Jest，只测 `cloudfunctions/_shared/` 里的纯逻辑模块。
- 包管理：npm。

## 目录约定

```
miniprogram/            小程序前端
  pages/                住户端主包页面
  provider/             服务员端分包
  admin/                管理后台分包（管理员、物业共用，按角色控制）
  board/ idle/ events/ chat/ coupons/ elder/ pet/ shops/ merchant/ station/   扩展模块分包（见 SPEC_EXT E18）
  components/           公共组件
  utils/                api.js（云函数调用封装）、money.js、time.js、scene.js、privacy.js
  config/env.js         云环境 ID 等配置（占位符，不要写真实值）
cloudfunctions/
  _shared/              纯逻辑模块（定价、分账、状态机、时间、黑名单、ID），唯一真相源
  _shared/__tests__/    Jest 单测
  user/ catalog/ order/ provider/ membership/ admin/ timer/ payCallback/ refundCallback/
database/               种子数据、索引说明、安全规则
scripts/sync-shared.js  把 _shared 复制到每个云函数的 lib/shared/
docs/                   SPEC.md、SPEC_EXT.md、TASKS.md、MANUAL_SETUP.md
```

云函数里一律 `require('./lib/shared/xxx')` 引用共享模块；`lib/shared/` 是 `npm run sync` 生成的副本，已加入 `.gitignore`。改共享逻辑只改 `cloudfunctions/_shared/`。

## 常用命令

- `npm install` — 安装 Jest
- `npm test` — 运行全部单测，**每个任务结束前必须通过**
- `npm run sync` — 同步共享模块到各云函数（部署前由人执行）

小程序本身无法在命令行运行，界面和云函数需要人在微信开发者工具里验证。所以：**每个 PR 必须写清楚"如何在开发者工具里手动验证"的步骤。**

## 硬性规则

1. **金额一律用整数"分"**（`fen`）存储和计算，只在展示时转成元。禁止浮点金额。
2. **价格只在服务端计算**。前端显示的报价来自 `order.quote`，`order.create` 必须重新计算，不信任前端传来的金额。
3. **所有数据库写操作只在云函数里做**。前端不直接写数据库。安全规则按 `database/security-rules.json`。
4. **每个云函数入口都要做身份与角色校验**（`_shared/auth.js`），openid 只取自 `cloud.getWXContext()`，不信任前端传的 openid。
5. **状态变更必须走 `_shared/stateMachine.js`**。单文档使用条件更新（`where({ _id, status: 旧状态 })`），更新条数为 0 时返回 `E_CONFLICT`；多文档一致性操作采用用户确认的等效方案：在事务内读取并核对旧状态后使用 `doc` 更新，事务冲突返回 `E_CONFLICT`。事务内不得调用外部支付或内容安全接口，时间线必须原子追加或在事务内基于最新值追加。
6. **支付回调、退款回调、月卡任务生成必须幂等**。
7. **不得在代码里写死** 云环境 ID、商户号、订阅消息模板 ID、管理员 openid。这些来自环境变量或 `config` 集合。
8. 时间一律按北京时间（UTC+8）处理，使用 `_shared/time.js`，**不要依赖服务器本地时区**。
9. 用户可见文字全部是简体中文，语气简洁友好；面向老人，正文字号不小于 16px（32rpx）。
10. 个人信息最小化：服务员在接单前看不到门牌号和手机号；手机号展示时打码；身份证照片审核后删除。
11. 云函数统一返回 `{ ok: true, data }` 或 `{ ok: false, code, message }`，`code` 以 `E_` 开头，`message` 是给用户看的中文。
12. 不引入 SPEC 未提到的第三方服务或 SDK。
13. **每个扩展模块都必须受功能开关控制**（`_shared/features.js`）：开关关闭时前端不显示真实业务入口（R02 已批准的完整目录状态说明除外，不发业务请求），接口返回 `E_FEATURE_OFF`。新功能默认关闭。用户已批准的管理员准备例外和历史订单售后边界按 SPEC_EXT E20.1/E20.2 执行；不能阻断已发生付款的回调、退款与补偿。
14. **密钥只放环境变量**（商户私钥、APIv3 密钥、`SECRET_KEY` 等），不进代码、不进数据库、不打日志。
15. 主包只放 SPEC §3.1 列出的页面（首页、绑定、4 项核心服务、订单列表与详情、月卡、我的、隐私政策、服务协议）；服务员端、管理后台和每个扩展模块各自一个分包，主包必须小于 2MB。
16. 所有用户生成内容（帖子、评论、闲置、活动、聊天、图片）必须走 SPEC_EXT E0.6 的内容安全流程。

## 每个任务的完成标准（Definition of Done）

- 只改该任务涉及的文件，不顺手重构无关代码。
- `npm test` 全部通过；新增的共享逻辑有对应单测。
- PR 描述包含：①改了什么；②在微信开发者工具里如何手动验证（逐步）；③做了哪些假设；④遗留问题。
- 新增云函数时，同时更新其 `config.json`（云调用权限、触发器）和 `package.json`（依赖 `wx-server-sdk`）。


## 2026-11-08 已批准 UI 与电话补充

- 用户要求所有 69 页严格按 `docs/design/approved-ui.png`，不得用仅换色、统一卡片代替逐页设计核查。具体视觉与验收约束见 SPEC D43。
- D44 允许开发和生产手填未验证联系电话，替代原强制微信手机号授权前置；来源与验证状态由服务端决定，角色/功能开关/支付边界不变。
