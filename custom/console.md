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

## 页面细节

- **favicon**：五个页面都声明 `/me/icon.svg` + `apple-touch-icon`；不声明时浏览器会回退请求 `/favicon.ico`（网关的 New API 图标）
- **语言开关必须保留查询串**：`applyI18n` 生成 `?lang=` 链接时用 `URLSearchParams(location.search)` 复制其余参数；直接写 `?lang=en` 会丢掉 `tx`（桌面登录）、`dsh`（注册后回到授权）、`aff`（邀请码），表现为「切 EN 后变成另一个界面」或「注册完不给桌面授权」
- **注册提交必须同步绑定**：`startRegister` 里 `addEventListener('submit')` 不能等在 `await loadStatus()` 之后，否则慢网下用户先点击会触发原生 GET 提交，密码出现在 URL、历史和 Referer 里；处理器内部再 `await statusReady`

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
