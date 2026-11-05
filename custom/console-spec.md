# 迷你控制台 UI 规范

> 状态：2026-11-06 定稿。**任何页面改动先改这份规范，再改代码**；代码与规范不一致时以规范为准，除非同时更新本文件。
> 适用范围：`console/me/` 下的静态页面、`app.js`、`dict.js`、`styles.css`，以及构建脚本 `console/build.mjs`。

## 1. 设计原则

1. **一个页面一个目标**：页面标题下方第一块内容就是该页的主操作或主数据，不堆叠入口。
2. **入口不超过三层**：顶栏 → 页面 → 快捷入口。任何功能必须能从顶栏或用量页两步内到达。
3. **先看后做**：数据页先展示当前状态（余额/用量/密钥），再给操作。
4. **失败必须说人话**：所有错误都要落到页面的可见位置，且本地化；禁止只写 `console.error`。
5. **无内联脚本、无内联样式**：CSP 是 `script-src 'self'; style-src 'self'`，页面由 `boot.js` 按 `data-page` 启动。
6. **金额一律带 `$`**，两位小数；数量允许本地数字。

## 2. 路由与页面清单

| 路由 | `data-page` | 标题 key | 说明 |
|---|---|---|---|
| `/me/` | `usage` | `usage.greeting` 问候 | 余额、统计、邀请、明细 |
| `/me/keys` | `keys` | `keys.title` | 密钥列表与新建 |
| `/me/topup` | `topup` | `topup.title` | 兑换码与充值历史 |
| `/me/account` | `account` | `account.title` | 身份、改密码、2FA |
| `/me/pricing` | `pricing` | `pricing.title` | 公开价格表 |
| `/me/login` | `login` | `auth.signInTitle` | 登录（含 2FA 步骤） |
| `/me/register` | `register` | `auth.signUpTitle` | 注册 |
| `/me/forgot` | `forgot` | `account.forgotTitle` | 发送重置邮件 |
| `/me/reset` | `reset` | `account.resetTitle` | 邮件落地页，点击后生成新密码 |
| `/me/dsh` | `dsh` | — | 桌面授权落地页 |

页面 `<body>` 必须同时有 `data-page="<上表>"`；`boot.js` 只认这十个值。

## 3. 布局

| 元素 | 规则 |
|---|---|
| 顶栏 `<header>` | 左（RTL 为右）品牌 logo+名称；导航：用量、密钥、充值、下载；右侧：语言（本语言/EN）、退出。账号入口固定在导航里。 |
| 内容宽度 | 普通页 `main` 无限制但内容用 `.cards`/表格自适应；表单页用 `main.narrow`（最大 520px） |
| 卡片区 `.cards` | `auto-fit minmax(200px,1fr)`；每张卡是「label + 数值」，数值 24px |
| 表格 | 包在 `.table-wrap`；表头 `th` 左对齐（RTL 右）；空行 `td.empty` 居中 |
| 间距 | 区块之间 18–24px；卡片内边距 20px；表单行距 12px |

## 4. 组件

### 4.1 按钮

| 类 | 用途 | 外观 |
|---|---|---|
| `.button` | 主操作，每屏最多 1 个 | 实心主题色、圆角药丸 |
| `.button.secondary` | 次要操作（返回、取消、快捷入口） | 透明底 + 1px 边框 |
| `.linkish` | 行内文字操作（复制、退出） | 无边框文字 |
| `button.danger` / `.button.danger` | 删除类 | 透明底 + 危险色文字 |

规则：
- 同一行内只允许一个 `.button`；其余用 `.secondary` 或 `.linkish`。
- 输入框 + 主按钮的组合用 `.create`；**RTL 下按钮 order:-1，位于输入框的前导侧**。
- 按钮文字必须是动词短语，不写"确定/OK"。

### 4.2 表单

- 结构：`<label><span data-i18n>标签</span><输入></label>`；密码用 `.field` 包一层放 `.eye`。
- 每个输入必须有 `autocomplete`：`username` / `email` / `current-password` / `new-password` / `one-time-code`。
- 邮箱、验证码、API key、URL、邀请码输入框加 `dir="ltr"`（RTL 页面里的文本孤岛）。
- 校验顺序：**先本地校验，再请求**；本地错误写在表单内的 `#error`（`.form-error`），请求错误写在同一位置。
- 密码：8–20 字符；注册需两次一致；改密码需原密码正确且新旧不同。
- 提交按钮在请求期间**不禁用**（避免误以为没反应），但必须防重复提交（同一次点击只发一次请求）。

### 4.3 提示与状态

| 状态 | 表现 |
|---|---|
| 加载中 | 表格首行 `common.loading`（`…`），不得留空白 |
| 空 | `td.empty` 单元格，文案来自 `*.empty`，不显示表头以外的占位 |
| 成功 | 绿色 `.hint.ok`，可自动消失或保留 |
| 失败 | `.form-error`（表单内）或 `.hint.bad`（页面级），必须本地化 |
| 未登录 | 显示 `#auth` 提示块 + 登录/注册按钮，隐藏 `#app` |
| 限流 429 | 显示 `errors.rateLimited`，不显示原始 status 文本 |
| 网络错误 | 显示 `errors.network` |

### 4.4 对话框

- 使用原生 `<dialog>`，最大宽 440px，含 `.stack` 表单；
- 必须有「保存（`.button`）」与「取消（`.button.secondary`）」；
- 关闭后不得残留上一次的值。

## 5. 表单字段顺序（硬性）

| 页面 | 顺序 |
|---|---|
| 注册 | 邮箱 → 验证码（+发送）→ 密码 → 确认密码 → 邀请码（可选） |
| 登录 | 邮箱或用户名 → 密码 → 忘记密码链接 → 登录按钮 → 注册链接 |
| 2FA 步骤 | 验证码/备份码 → 验证 → 返回 |
| 改密码 | 当前密码 → 新密码 → 确认 → 保存 |
| 忘记密码 | 邮箱 → 发送 |
| 重置 | （无输入）按钮「生成新密码」→ 结果展示 |
| 充值 | 兑换码 → 应用 |
| 新建密钥 | 名称（可选）→ 创建 |

顺序被 E2E 覆盖（见 §11），改动必须同时改测试。

## 6. 数字与金额

- 金额：`money(quota)` = `$` + 两位小数（`state.quotaPerUnit` 换算），用于余额、消费、邀请额度、统计费用、充值历史。
- 计数：整数，允许本地数字（波斯语数字由 `num()` 决定）。
- 比例/单价（价格页）：`$` + 两位小数；固定价模型显示"每次请求"。

## 7. 国际化

- 文案只存在于 `console/me/dict.js`，按 `fa` / `ru` / `en` 三份；页面用 `data-i18n`、`data-i18n-placeholder`、`data-i18n-aria`。
- **禁止**在 HTML/JS 里写死用户可见文字（品牌名、语言名除外）。
- 新增 key 必须同时补三种语言；缺 key 时 `t()` 返回 key，会在页面上直接暴露，视为 bug。
- 日期/时间用 `stamp()` 按当前语言格式化。
- 服务端返回的中文错误在 `errorText()` 里映射为本地文案；映射不到才显示原文。

## 8. RTL

- 布局全部用逻辑属性（`margin-inline`、`inset-inline-end`、`border-inline`），禁止 `left/right`。
- `dir` 由构建注入到 `<html>`；`fa` 为 `rtl`，`ru`/`en` 为 `ltr`。
- 输入框内容为技术字符串时单独 `dir="ltr"`。
- 图标方向性元素（箭头）随 `dir` 翻转；眼睛图标不翻转。

## 9. 安全与网络

- 页面不得有内联 `<script>`/`style`（CSP）。
- 服务端数据插入 DOM 前必须 `esc()`；公告按纯文本渲染。
- 会话 cookie 同源；所有需要登录的请求带 `New-Api-User` 头（取自 `localStorage.user.id`）。
- 桌面内嵌视图没有 cookie：`boot.js` 在启动页面前用 `window.dsh.getAuthToken()` 调 `POST /api/user/platform-session` 换取会话。
- 不把 token 放进 URL；重置链接只由服务端生成并 `url.QueryEscape`。

## 10. 可访问性

- 每个输入都有可见 label（不只用 placeholder）。
- 密码眼睛按钮：`aria-pressed` 表示是否可见，`data-i18n-aria="auth.showPassword"`。
- 表格空态用 `colspan` 覆盖全部列。
- 焦点可见：`:focus-visible` 不能移除轮廓。

## 11. 测试映射

| 规则 | 覆盖 |
|---|---|
| 表单顺序、字段存在 | `console-local.mjs` 注册/登录/改密码用例 |
| 密码不进 URL、提交防重 | `console-local.mjs` 快速点击用例 |
| 无内联脚本、有 `data-page`、无 www 链接 | `console-local.mjs` 十个页面静态断言 |
| 账号入口存在 | `console-local.mjs` 四个页面断言 |
| 内嵌页令牌换会话 | `console-live.mjs` 内嵌页用例 |
| 金额 `$` 前缀 | `console-local.mjs` / `console-live.mjs` 余额断言 |
| 旧会话失效、2FA、邀请、密钥、充值 | `console-live.mjs` / `security.mjs` / `twofa.mjs` |

## 12. 变更流程

1. 改规范（本文件）→ 2. 改页面/文案 → 3. `node console/build.mjs fa && node console/build.mjs ru` → 4. 跑 `--mode local`（两品牌）→ 5. 部署 → 6. 跑 `--mode live` → 7. 提交（站点 + 必要时网关）。
