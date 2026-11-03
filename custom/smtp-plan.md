# SMTP 方案（邮箱验证 / 找回密码）

> 状态：**未启用**。两台服务器 SMTP 均未配置，`EmailVerificationEnabled=false`。本文是启用前的完整方案。

## 实测结论（2026-11-03）

两台服务器都能直连主流 SMTP 服务，伊朗机房没有封出网：

| 目标 | 87.107.108.14（伊朗） | 104.248.155.54（DO） |
|---|---|---|
| `smtp.resend.com:465` / `:587` | 通 | 通 |
| `smtp.mailgun.org:587` | 通 | 通 |
| `email-smtp.us-east-1.amazonaws.com:587` | 通 | 通 |
| `smtp.gmail.com:587` | 通 | 通 |

TLS 握手也正常（`smtp.resend.com:465` → TLSv1.3，证书 `*.resend.com`）。**所以不需要经 hub 中转，直连即可。**

## 自建发信服务器（实测可行性）

结论：**不推荐自建发信**。三项硬指标实测如下：

| 指标 | 87.107.108.14（伊朗） | 104.248.155.54（DO） | 自建发信要求 |
|---|---|---|---|
| 反向解析 PTR | **无** | `ubuntu-s2vcpu-4gb-sgp1-hub.`（泛化域名，非邮件域名） | 必须是 `mail.<品牌域名>` 且正向解析回来；Gmail 对无 PTR 的 IP 直接判垃圾 |
| 出网 25 端口 | Google MX 通，**Yandex / QQ 的 MX 不通** | 同上 | 需全通，否则部分收件人根本收不到 |
| 黑名单 | **Barracuda 已列入**（`b.barracudacentral.org` → 127.0.0.2） | 未列入 | 任一主流黑名单命中就会大面积进垃圾箱 |
| SPF / DMARC | 两个域名都没有 | 同 | 必须配 |

自建还意味着要自己承担：IP 信誉预热（新 IP 每天只能发少量）、DKIM 密钥轮换、DMARC 报告处理、退信/滥用投诉处理、IP 被列入黑名单后的申诉。对"一天几十封验证码"的用量，这些成本远高于服务商。

自建**收信**（IMAP/Webmail 供人用）与本产品无关——验证码只需发信，回复地址可以是 `no-reply@`。

### 折中方案：本地 Postfix 只做中继

应用连本机 `127.0.0.1:587`，Postfix 用 `relayhost` 转发给服务商。好处是应用配置不随服务商变化，坏处是多一个组件要维护。只有在"以后可能频繁换服务商"时才值得。

## 开启 SMTP 会改变什么

1. 注册**必须**带 `email` + `verification_code`，否则报错；邮箱开始落库
2. 可启用找回密码（`GET /api/reset_password` 发信 + `POST /api/user/reset`）
3. **迷你站注册页必须同步改造**，否则开验证后注册直接全挂（见下）
4. 验证邮件正文是中文模板（`%s邮箱验证邮件`），伊朗/俄语用户看不懂——要本地化就得改 Go 代码

## 当前进度（2026-11-03）

**已落地**：

| 项 | 状态 |
|---|---|
| RU 域名验证 | `mail.deepseek-ru.org` verified |
| RU 网关 SMTP | `SMTPServer=smtp.resend.com`、`SMTPPort=465`、`SMTPSSLEnabled=true`、`SMTPAccount=resend`、`SMTPFrom=no-reply@mail.deepseek-ru.org`，已写入 options 并通过网关实测发信 |
| 邮件文案多语言 | `controller/email_template.go` 提供 fa/ru/en/zh 四套主题与正文，语言由 `DSH_EMAIL_LANG` 决定；RU 实测收到俄语验证邮件 |
| 迷你站验证码 UI | `feat/email-verification` 分支完成（按 `/api/status` 的 `email_verification` 自动显隐），未上线 |
| `EmailVerificationEnabled` | **两站已开启**（2026-11-03），注册需邮箱验证码 |

**待办**：FA 的 4 条 ArvanCloud DNS；两站打开验证开关前先在 RU 跑一遍真实注册。

| 域名 | 状态 | DNS 提供商 | 记录 |
|---|---|---|---|
| `mail.deepseek-ru.org` | **verified**（sending enabled） | Cloudflare（已用 API 写入 4 条） | DKIM / MX / SPF / CNAME 全部 verified |
| `mail.deepseekfa.com` | **verified**（sending enabled） | ArvanCloud（手工添加，CNAME 需关代理） | 4 条全部 verified |

两个域名在同一个 Resend 账号下，区域 eu-west-1。发信地址分别为 `no-reply@mail.deepseek-ru.org`、`no-reply@mail.deepseekfa.com`。

DNS 记录（FA 待做）：`TXT resend._domainkey.mail`、`MX send.mail`（priority 10 → `feedback-smtp.eu-west-1.amazonses.com`）、`TXT send.mail`（`v=spf1 include:amazonses.com ~all`）、`CNAME rsend.mail`（`send.forge.rmta.net`，必须灰云）。Cloudflare 侧勿开代理，否则验证不过。

凭据存放：`~/.deepseek-secrets/{resend.env,cloudflare.env,README.md}`（目录 700、文件 600，不进仓库）。

## 服务端行为（写死的事实）

| 项 | 值 |
|---|---|
| 验证码 | 6 位数字，**10 分钟**有效 |
| 存储 | 内存 map，**容器重启即失效** |
| 发信限流 | 同 IP **30 秒内 2 次** |
| 465 端口 / `SMTPSSLEnabled=true` | 隐式 TLS，且 `InsecureSkipVerify=true`（不校验证书） |
| 587 | STARTTLS |
| `SMTPFrom` 留空 | 回落为 `SMTPAccount` |
| 邮件主题 | `SystemName` 前缀（`SystemName` 也是 options 项，建议设成 `DeepSeek-FA` / `DeepSeek-RU`） |

## 服务商建议

| 服务商 | SMTP | 免费额度 | 备注 |
|---|---|---|---|
| **Resend**（首选） | `smtp.resend.com` 465/587 | 100/天、3000/月 | 域名验证简单（DNS TXT），TLS 正常 |
| Mailgun | `smtp.mailgun.org` 587 | 试用 | EU 区也可 |
| Amazon SES | `email-smtp.<region>.amazonaws.com` 587 | 按量 $0.10/1000 封 | 新账号在沙箱，需申请解除 |
| ArvanCloud 邮件 | 视套餐 | — | 伊朗本地，适合主域邮件，不一定给 SMTP relay |

## DNS 配置

发信域名建议用独立子域（如 `mail.deepseekfa.com`），避免主域 SPF/DMARC 互相牵连。

| 记录 | 值 | 位置 |
|---|---|---|
| SPF（TXT） | `v=spf1 include:amazonses.com ~all`（按服务商给的） | ArvanCloud / Cloudflare |
| DKIM（TXT） | 服务商给的 selector 记录 | 同上 |
| DMARC（TXT `_dmarc`） | `v=DMARC1; p=none; rua=mailto:dmarc@deepseekfa.com` | 同上 |
| MX | **不需要**（只发不收） | — |

`deepseekfa.com` 在 ArvanCloud（`s/h.ns.arvancdn.ir`），`deepseek-ru.org` 在 Cloudflare，两处分别添加。

## New API 配置（写 options 表，60 秒自动同步，无需重启）

| key | 建议值 | 说明 |
|---|---|---|
| `SMTPServer` | `smtp.resend.com` | |
| `SMTPPort` | `465` | 隐式 TLS |
| `SMTPSSLEnabled` | `true` | |
| `SMTPAccount` | `resend` | Resend 固定用户名 |
| `SMTPToken` | `<API key>` | **只写服务器，不进仓库** |
| `SMTPFrom` | `no-reply@mail.deepseekfa.com` | 必须与 DKIM 域一致 |
| `SystemName` | `DeepSeek-FA` / `DeepSeek-RU` | 邮件主题前缀 |
| `EmailVerificationEnabled` | `true` | 开启后注册需验证码 |
| `EmailDomainRestrictionEnabled` | `false` | 不限制邮箱域 |

## 迷你站改造清单（**已在 `feat/email-verification` 分支完成，未上线**）

实现方式：注册页读取 `/api/status` 的 `email_verification`，为 true 时才显示邮箱/验证码字段并强制校验；为 false 时表单与现在完全一致（不多发字段）。验证码按钮 60 秒冷却，错误文案按语言本地化。开启 `turnstile_check` 时按钮直接提示改用主控制台（我们的页面没有 Turnstile 组件）。

本地验证（拦截 API，不改线上）：13/13 通过——两种开关状态下字段显示、本地拦截、发码请求、提交载荷、错误映射。

原始清单（供核对）：

1. 注册页加：邮箱输入框、`发送验证码` 按钮（`GET /api/verification?email=`）、6 位验证码输入框
2. 发送按钮 60 秒冷却（服务端 30 秒 2 次，前端更保守）
3. 提交时带 `email` + `verification_code`
4. 错误本地化：验证码错误/过期、邮箱已占用、发信失败
5. 两站同时改；验证码接口无需登录
6. 登录页补「忘记密码」入口（第二阶段，调 `/api/reset_password` + `/api/user/reset`）

## 上线步骤

1. 服务商开户 + 加 DNS 记录，验证域名（生效可能几分钟）
2. **先在一台**（建议 RU/hub）写 options，等 60 秒
3. `curl 'https://deepseek-ru.org/api/verification?email=<你的邮箱>'` 收信
4. 查邮件头：SPF / DKIM / DMARC 三项 pass，且进收件箱不是垃圾箱
5. 走真实注册流程：邮箱 → 验证码 → 注册 → 登录 → 查库 `email` 已落库
6. 通过后再对 FA 执行同样步骤

## 回滚

把 `EmailVerificationEnabled` 改回 `false`（或删掉该行），60 秒内注册恢复为"不需要验证码"。已注册用户的 `email` 字段保留但不影响登录。

## 成本

- Resend 免费额度按当前注册量足够；超量约 $0.001/封
- SES 约 $0.10/1000 封
