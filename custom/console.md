# 迷你波斯语控制台

> 2026-11-02 上线：`https://deepseekfa.com/me/login`（登录）、`/me/register`（注册）、`/me/`（用量）、`/me/keys`（密钥）。

官网 `www.deepseekfa.com` 的「ورود / ثبت‌نام」入口直接指向这两页，**不经过 New API 的 Semi SPA**（那套要加载 7 MB bundle，且没有波斯语与 RTL）。

## 为什么不是 New API 自带控制台

自带控制台是 Semi UI 单页应用，2816 个文案键、且**没有 RTL 支持**（Semi 2.72.2 也没有波斯语 locale）。用户只需要两件事：看消耗、拿 API Key。所以另做两个静态页面，复用网关已有的会话与接口。

## 鉴权

两个条件缺一不可：

1. **会话 cookie**——和 New API 同域（apex），`credentials: 'same-origin'` 自动携带；
2. **`New-Api-User: <id>` 请求头**——`middleware/auth.go` 校验它必须等于会话用户 id，否则返回 `401 无权进行此操作，未提供 New-Api-User`。

用户 id 不在 cookie 里，从同源的 `localStorage['user']` 取（SPA 登录时写入，字段 `id`）。拿不到就显示登录提示，跳 `/login`。

## 登录与注册（用户名制）

| 页面 | 调用的接口 | 成功后 |
|---|---|---|
| `/me/login` | `POST /api/user/login` `{username, password}` | 写入 `localStorage.user`（响应的 `data` 含 id/username），跳 `?next=` 或 `/me/` |
| `/me/register` | `POST /api/user/register` `{username, password}` → 再 `POST /api/user/login` | 自动登录，跳 `/me/keys` |

- **不改网关代码**：New API 的邮箱注册依赖 `EmailVerificationEnabled`——只有开启邮箱验证时才会写 `Email` 字段（`controller/user.go` 的 `if common.EmailVerificationEnabled { cleanUser.Email = ... }`），而开启它又要求注册时提交邮件验证码（需要 SMTP）。所以关闭验证的部署里，邮箱注册拿到了 `success` 但 `email` 落库为空（已在未打补丁的 hub 实例上实测复现）。
- 结论：**保持用户名注册**，网关代码与上游一致；将来要邮箱注册，先配 SMTP 再开 `EmailVerificationEnabled`。
- 注册后 New API 不会自动建立会话，所以页面自己再调一次 login；注册接口的响应没有 `data`
- **长度规则完全照抄服务端，不要自己加规则**：`model.User` 只声明了 `username max=20`（**没有下限、没有格式限制**，1 个字符也能注册）和 `password min=8,max=20`；SPA 的注册表单也只校验密码 ≥8。迷你站按同一套规则校验，并按**码点数**（`Array.from(s).length`）比较，和服务端 `go-playground` 的 rune 计数一致。
- 表单用 `novalidate` + JS 校验，原因有两个：浏览器原生校验的提示语跟的是**浏览器界面语言**（会出现中文），而 `maxlength` 会把超长密码**静默截断**成 20 位后注册成功
- 2FA 账号会被拦下并提示改用主控制台（迷你站没有 2FA 表单）
- SPA 的 `/register` 由 nginx `location = /register` 302 到 `/me/register`，注册统一走迷你站

## 两品牌构建与部署

迷你站源码一套，按品牌生成两份产物：

```bash
node console/build.mjs fa    # -> console/dist/fa/me
node console/build.mjs ru    # -> console/dist/ru/me
```

页面里的 `{{brand}}` `{{lang}}` `{{dir}}` `{{site}}` `{{api}}` 由构建脚本替换（品牌名、默认语言、方向、官网域名、API 域名）。

**构建期预渲染**：构建脚本把 `data-i18n` 节点的文案直接写进 HTML（按品牌的默认语言），所以首屏不依赖 JS——慢网下不会先闪一下另一种语言。JS 仍然负责切换语言与动态内容。

**构建自带校验**：产物 HTML 里若出现另一个品牌的名称/域名（如 RU 产物里出现 `DeepSeek-FA` 或 `deepseekfa.com`），或残留 `{{token}}`，构建直接以退出码 1 失败并指出文件与字样。`dict.js` 是共享词表、同时包含两个品牌，不在校验范围内。

| 部署 | 目标 | nginx |
|---|---|---|
| FA | `root@87.107.108.14:/var/www/fa-console/me/` | apex vhost 的 `location /me/`（root `/var/www/fa-console`） |
| RU | `root@104.248.155.54:/var/www/ru-console/me/` | `deepseek-ru.conf` apex 的 `location /me/`（root `/var/www/ru-console`） |

两边的 SPA 注册页都被 `location = /register` 302 到各自的 `/me/register`。

## 界面语言（fa / ru / en）

| 项 | 说明 |
|---|---|
| 文案 | `console/me/dict.js`（`DICT.fa` / `DICT.ru` / `DICT.en`）；静态文本用 `data-i18n="key"`，动态文本用 `t('key', {vars})` |
| 默认语言 | `<html data-default-lang>`：FA 构建为 `fa`、RU 构建为 `ru`；用户手动切换后存 `localStorage` |
| 切换 | 页头 `FA / EN`，链接为 `?lang=fa|en`；选择写入 `localStorage['console-lang']`，之后打开任意页面沿用 |
| 方向 | `applyI18n()` 同步 `document.documentElement.lang` 与 `dir`（fa=rtl、en=ltr） |
| 数字/日期 | `Intl.NumberFormat('fa-IR' | 'en-US')`，日期同理 |
| 报错 | 服务端返回英文/中文错误，`AUTH_ERROR_PATTERNS` 映射到当前语言的词条，未命中保留原文 |

浏览器原生校验仍然关闭（`novalidate`），否则提示语会跟随浏览器界面语言。

## 邀请码（aff）

| 位置 | 行为 |
|---|---|
| 注册页 | 增加可选字段 `aff`，提交时作为 `aff_code` 发给 `/api/user/register`；`/me/register?aff=CODE` 会自动预填 |
| 用量页 | 展示自己的邀请码、邀请链接（`/me/register?aff=<code>`）、`aff_count`、`aff_quota`，均可一键复制 |

服务端行为（`model/user.go` 的 `Insert`）：

- 注册时 `GetUserIdByAffCode(aff_code)` 解析邀请人，**无效码静默忽略**（不报错，也不阻止注册），有效则写入 `users.inviter_id`
- **奖励与计数只在开关打开时发生**：`QuotaForInvitee > 0` 给被邀请人加额度；`QuotaForInviter > 0` 才执行 `inviteUser()`（`AffCount++`、`AffQuota += …`）并记一条日志
- 目前两台线上 `QuotaForInviter/QuotaForInvitee/QuotaForNewUser` **都没有配置（默认 0）**，所以现在传邀请码的效果只是"记录 inviter_id"，不产生任何额度或计数
- 邀请人拿到的是 `aff_quota`（不是余额）；要变成可用额度需要 `POST /api/user/aff_transfer`（最小 1 个 `quota_per_unit`）。**迷你站暂未提供转账按钮**

### 当前奖励配置（2026-11-03 起，两台服务器一致）

| option | 值 | 折合 | 进入 |
|---|---|---|---|
| `QuotaForNewUser` | 50000 | $0.10 | 新用户余额（体验额度） |
| `QuotaForInvitee` | 250000 | $0.50 | 被邀请人余额 |
| `QuotaForInviter` | 500000 | $1.00 | 邀请人 `aff_quota` |

计价口径：`/api/status` 的 `quota_per_unit=500000` 且 `quota_display_type=USD`，即 500000 quota = $1。

由此产生的实际效果：**通过邀请注册的新用户拿到 $0.60**（$0.10 新用户 + $0.50 被邀请人）；不带邀请码注册拿 $0.10 体验额度；邀请人每邀请一人得 $1.00 邀请额度（满 $1 可转入余额）。

改动方式：直接写 `options` 表（`key`/`value`），服务端每 60 秒从库同步一次（`SyncOptions(SYNC_FREQUENCY)`），**不用重启容器**。

### 转账到余额

用量页的邀请卡片在 `aff_quota >= quota_per_unit` 时出现「转移」按钮，调 `POST /api/user/aff_transfer {quota: aff_quota}` 全额转入余额；低于 1 个单位时服务端拒绝，按钮隐藏。

## 桌面登录的路径约束（改之前必读）

客户端 `packages/credentials/deepseek-account-platform/src/protocol.ts` 的 `browserUrl()`
会校验 URL 路径与传入常量完全一致，且**两个地址都写死**：

| 地址 | 客户端要求路径 | 我们的做法 |
|---|---|---|
| `auth_init.authorize_url` | `/dsh/authorize` | 路径不变，网关 302 到 `/me/dsh?tx=…` |
| `auth_exchange.authorized_url` | `/dsh/authorized` | 路径不变，该路径 302 到 `/me/` |

路径不匹配会抛 `PlatformAuthError('protocol')`：前者表现为浏览器根本不打开，后者表现为
「登录未完成」——即使 `auth_exchange` 已经 200、token 也已签发。

所以换页面只能靠网关重定向，不能改这两个返回值。回退开关 `DSH_MINI_LOGIN=0`。

## 响应头

`/me/` 的 nginx location 加了四个头：

| 头 | 值 |
|---|---|
| `X-Robots-Tag` | `noindex, nofollow` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'` |

为满足 `script-src 'self'`，页面不再有内联脚本：每页 `<body data-page="...">`，由外部 `boot.js` 分发到 `startXxx()`。E2E 的 local 套件会断言十个页面都不含内联脚本。

## 两步验证（2FA，可选）

| 项 | 说明 |
|---|---|
| 开启 | `/me/account` → 显示 TOTP 密钥（手动加入认证器，无二维码）+ **4 个备份码**（只显示一次，可一键复制）+ 勾选"已保存" + 输入 6 位码确认 |
| 登录 | 密码通过后若 `require_2fa`，表单切换为动态码步骤（`/api/user/login/2fa`），支持 TOTP 或备份码 |
| 桌面登录 | `/me/dsh` 同样处理；网关在 `/api/user/login/2fa` 成功时给会话打 `twofa_user_id` 标记，`/api/dsh/complete` 见到该标记才放行（旧逻辑对所有 2FA 账号一律 409） |
| 管理 | 关闭与重新生成都接受 TOTP 或备份码；重生成有独立提示，不再复用启用面板 |
| 兜底 | 启用 2FA 的账号只能走「密码 + 动态码」建会话；passkey / OAuth 回调会被网关拒绝（`setupLogin` 内统一拦截） |
| 备份码数量 | **4 个**（服务端 `BackupCodeCount = 4`） |

E2E 用自实现的 TOTP 自动算码，不需要手机；`twofa` 套件第一项断言 RFC 6238 向量（`t=59s → 287082`）。

**2FA 恢复**：手机与备份码都丢失时，只能由管理员在库里删除该用户的 2FA 记录（`delete from two_fas where user_id=?` + `two_fa_backup_codes`），随后用户用密码登录。

## 注册方式（邮箱优先）

`EmailVerificationEnabled=true`（2026-11-03 起两站均开启）后：

| 项 | 行为 |
|---|---|
| 注册表单 | 显示邮箱 + 验证码；用户名隐藏，由邮箱本地部分 + 4 位随机后缀派生（≤20 字符） |
| 登录 | 标签「ایمیل یا نام کاربری」；服务端 `username = ? OR email = ?`，两种都能登 |
| 关闭验证时 | 自动回退为用户名注册（同一份代码，按 `/api/status` 切换） |

## 用量统计（/me/）

读 `GET /api/data/self?start_timestamp&end_timestamp`（服务端按天/模型的 `quota_data` 聚合），在客户端再合并：

| 表 | 维度 |
|---|---|
| 按天 | 请求数 / token / 费用，支持最近 7 天或 30 天 |
| 按模型 | 同上，按费用降序 |

数据来自后台 `UpdateQuotaData` 写入的 `quota_data` 表；窗口上限 1 个月（接口限制）。

## 旧密钥清理（/me/keys）

密钥列表新增「最后使用」列；面板会挑出「从未使用且创建超过 7 天」或「超过 30 天未使用」的密钥，确认后逐个 `DELETE /api/token/:id`。

## 价格页与公告

| 项 | 说明 |
|---|---|
| `/me/pricing` | 公开接口 `GET /api/pricing`；按 ratio 换算成「美元 / 百万 token」（ratio × $2，输出再乘 completion_ratio）；固定价模型显示"每次请求" |
| 公告 | 用量页读 `/api/status` 的 `announcements`（`publishDate` / `content`），只显示最新一条，关闭状态存 `localStorage['ann-dismissed']`；`announcements_enabled=false` 时不显示。**按纯文本渲染**（`textContent`，保留换行），不解析 HTML——避免管理员输入的 HTML 在持有会话的页面里执行 |

## 密钥编辑

密钥列表每行有「编辑」按钮，打开 `<dialog>` 编辑名称、是否无限额度、额度（按美元输入，换算 quota）、过期日期、允许 IP；提交 `PUT /api/token/` 后刷新列表。

## 桌面内嵌页的登录

桌面客户端的「用量 / 充值」在应用内嵌视图里打开（`DesktopPlatformView`），它**没有浏览器 cookie**，只在页面里提供 `window.dsh.getAuthToken()`（账号令牌）。迷你站加载时若本地没有登录态，会用这个令牌调：

```
POST /api/user/platform-session   Authorization: Bearer <账号令牌>
```

网关用 `GetTokenByKey` 找到令牌所属用户，校验令牌与账号状态后 `setupLogin` 建立会话并返回用户信息。页面拿到后写入 localStorage 继续。每个页面只尝试一次；启用 2FA 的账号仍会要求正常登录。

内嵌视图加载的是 `account.origin` 上的 `/usage`、`/top_up`（应用内写死），nginx 把这两个路径分别 302 到 `/me/`、`/me/topup`。

## 会话失效

用户表新增 `session_version`：登录时写进会话，每次请求比对（30 秒缓存）。**改密码会让其他设备上的会话立即失效**，改密的那台设备自身会被更新到新版本、保持登录。管理员重置密码与邮件重置同样会递增版本。

## 账号与安全（/me/account、/me/forgot、/me/reset）

| 页面 | 功能 |
|---|---|
| `/me/account` | 改密码（当前/新/确认，三个眼睛），链接到忘记密码 |
| `/me/forgot` | 输入邮箱 → `GET /api/reset_password`；SMTP 未配置时提示"联系支持" |
| `/me/reset` | 邮件链接落地页：`POST /api/user/reset` 后用服务器生成的新密码展示 + 复制 |

网关侧：`PUT /api/user/password`（自助改密，校验原密码与长度）；`SendPasswordResetEmail` 在 `DSH_MINI_LOGIN` 开启时把链接从 `/user/reset` 改为 `/me/reset`。

## 充值页（/me/topup）

显示余额、兑换码（`POST /api/user/topup {key}`）与充值历史（`GET /api/user/topup/self`）；没有支付渠道，页面提示"联系支持"。入口在头部导航「شارژ / Пополнение / Add credit」，`/top_up` 也 302 到这里（`DSH_MINI_LOGIN=0` 时回 `/console/topup`）。

## 退出登录

用量页与密钥页的头部在登录态显示「退出」（未登录隐藏）。点击后：

1. `GET /api/user/logout`（无鉴权中间件，只需会话 cookie）清服务端会话
2. 清 `localStorage` 的 `user` 与 `console-lang`
3. 跳 `/me/login`

请求失败也照样清本地并跳转，避免"点退出没反应"。

## 页面细节

- **favicon**：五个页面都声明 `/me/icon.svg` + `apple-touch-icon`；不声明时浏览器会回退请求 `/favicon.ico`（网关的 New API 图标）
- **跨页链接必须保留查询串**：登录↔注册互跳链接用 `data-carry`（`applyI18n` 把当前 `location.search` 拼上），受保护页的登录按钮带 `next=<当前路径>`；登录/注册成功后的落点统一由 `finishAuth()` 决定：`dsh`（桌面授权）> `next`（同源路径）> 默认页。缺任何一环都会表现为「切个页面就丢了上下文」
- **语言开关必须保留查询串**：`applyI18n` 生成 `?lang=` 链接时用 `URLSearchParams(location.search)` 复制其余参数；直接写 `?lang=en` 会丢掉 `tx`（桌面登录）、`dsh`（注册后回到授权）、`aff`（邀请码），表现为「切 EN 后变成另一个界面」或「注册完不给桌面授权」
- **注册提交必须同步绑定**：`startRegister` 里 `addEventListener('submit')` 不能等在 `await loadStatus()` 之后，否则慢网下用户先点击会触发原生 GET 提交，密码出现在 URL、历史和 Referer 里；处理器内部再 `await statusReady`

## E2E 回归套件

`tools/e2e/`（本地 UI 22 项 + 线上 31 项/品牌），改完迷你站或网关登录代码后跑一遍：

```bash
node tools/e2e/run.mjs --mode local --brand fa      # 不联网、不建数据
E2E_PROXY=direct node tools/e2e/run.mjs --mode live --brand both   # 真网关，自动清理临时账号
```

细节见 [tools/e2e/README.md](../tools/e2e/README.md)。限流提示（429）现在会显示「尝试过于频繁」而不是通用错误。

## 桌面登录 E2E

```bash
E2E_PLAYWRIGHT=/path/to/playwright-core/index.mjs \
  node tools/e2e-desktop-login.mjs --brand fa --user <用户名> --pass <密码>
```

浏览器与 curl 必须走**同一个代理出口**（`E2E_PROXY`，默认 `socks5://127.0.0.1:10808`）：网关的关键接口按 IP 限流 20 次/20 分钟，两个出口会互相消耗额度并误报失败。

脚本依次断言：`auth_init` 返回 `/me/dsh`、页面语言与品牌、用用户名登录、`complete` 返回 `dsh://…code=`、`exchange` 签发 token。页面会在完成后跳 `dsh://`，脚本在 `fetch` 层截获响应体并挂住导航，避免读到空 body。

`playwright-core` 不是仓库依赖，用 `E2E_PLAYWRIGHT` 指向本地安装位置。

## 用到的接口

| 页面 | 接口 |
|---|---|
| 用量 | `GET /api/user/self`（`quota` / `used_quota` / `request_count`）、`GET /api/log/self?p=&page_size=&type=0` |
| 用量明细 | 每行日志的 `other` 字段（JSON 字符串）：`model_ratio`、`user_group_ratio`/`group_ratio`、`completion_ratio`、`cache_ratio`、`cache_tokens`、`cache_creation_ratio`、`cache_creation_tokens`、`model_price`、`frt`（首字延迟 ms）、`request_path`、`billing_source`、`request_conversion` |
| 密钥 | `GET /api/token/?p=1&size=100`、`POST /api/token/`、`DELETE /api/token/:id` |

金额换算：`quota / status.quota_per_unit`（当前 `quota_per_unit = 500000`）。单笔金额很小（实测一次 36/24 token 的调用是 `quota=19` → `0.000038`），所以单笔用 6 位小数、总额用 2 位。密钥在库里不带前缀，**展示和复制时补 `sk-`**。

`other` 里 `-1` 表示"未使用/未设置"（例如非流式请求的 `frt` 为 `-1000`），要显示成 `—`，否则会看到 `-1.00` 这种假数据。

## 部署

```bash
# 本机先把权限改成 644，否则 rsync -a 会把 600 带上去，nginx 读不到 -> 403
chmod 644 console/me/*.html console/me/*.js console/me/*.css console/me/*.svg
rsync -az -e "ssh -o ProxyCommand='nc -X 5 -x 127.0.0.1:10808 %h %p' -i ~/.ssh/id_ed25519" \
  console/me/ root@87.107.108.14:/var/www/fa-console/me/
ssh ... 'chmod -R a+rX /var/www/fa-console'
```

nginx（`sites-available/deepseekfa.conf` 的 apex server 块，必须排在 `location /` 之前）：

```nginx
location /me/ {
    root /var/www/fa-console;
    try_files $uri $uri.html $uri/index.html =404;
    add_header Cache-Control "no-store";
}
```

## 验证方式（真浏览器）

SPA 的 `/login` 要拉 7 MB 的 bundle，网络抖动时会卡住 `domcontentloaded`；只测控制台时可以绕开它：
用 `context.request.post('/api/user/login')` 拿会话 cookie，再用 `context.addInitScript` 在同源写入
`localStorage.user = {id, username}`（控制台只读这个），然后直接打开 `/me/`、`/me/keys`。

本次实测覆盖：注册（API 200）→ 登录 → 用量页卡片 → 建 key（行数 1→2，key 形如 `sk-…`）→ 复制一致 → 删除（2→1）→ 真打一次 `/v1/messages`（`quota=19`）→ 展开明细看到 23 个字段。

```bash
# 匿名态：页面能渲染出登录提示（用无头浏览器跑 JS 后再看 DOM）

```bash
# 匿名态：页面能渲染出登录提示（用无头浏览器跑 JS 后再看 DOM）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --virtual-time-budget=6000 --dump-dom https://deepseekfa.com/me/ | grep -c 'برای دیدن مصرف'

# 带会话的接口形状（服务端本地跑，测试账号用完即删）
curl -b "$JAR" -H "New-Api-User: $UID" http://127.0.0.1:3104/api/user/self
```

## 已知限制

- 未做 RU 版本（同一套页面改文案即可，路由可放 `/me/` 之外的子域或前缀）
- SPA 登录页写入的 `localStorage.user` 被清掉时，即使 cookie 有效也会提示登录
- 没有"清理旧设备密钥"的入口：每次登录都会新建一枚令牌，重度用户列表会变长
- 金额显示为"اعتبار"（credits，`quota / quota_per_unit`），没有按站点货币符号换算
- `[hidden]` 会被 `.notice { display:flex }` 之类的类选择器盖掉，样式里必须显式写 `[hidden] { display: none !important }`，否则登录提示和内容会同时显示
