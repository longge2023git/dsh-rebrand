# Backlog

> 只记录“已明确、但还没做”的事项；里程碑与排期见 [PLAN.md](../PLAN.md)。

| ID | 状态 | 事项 | 关联 |
|---|---|---|---|
| **F-01** | **已完成** | **NewAPI 二开支持 `/v1/files`（Anthropic Files API 透传）** | `new-api-deepseek` `feat/files-api`、[#11](https://github.com/longge2023git/dsh-rebrand/issues/11)、[调研](files-api-research.md) |
| F-02 | **已完成** | `file_id → 用户/租户` 归属映射 | `file_owners` + Messages 渠道钉死 |
| B-01 | 阻塞 | 品牌名称 + Logo（正式 appId/域名可后补） | [requirements](requirements.md) |
| D-01 | 待办 | macOS 签名/公证、Windows EV 证书、更新源与强制更新策略 | [PLAN](../PLAN.md) §7 |
| R-01 | 待办 | RTL 基础层（转换器 + `dir` + LTR 孤岛 + Chromium harness） | [PLAN](../PLAN.md) §5 |
| A-01 | **已完成** | relay 合并进 NewAPI 二开网关 | [ADR-002](adr-002-merge-relay-into-newapi.md)、`new-api-deepseek` `feat/dsh-gateway` |
| G-01 | **已完成** | Gateway API Key 模式（第一步） | [计划](gateway-api-key-plan.md) |
| G-02 | 待办 | 发版时移除官方 API Key 入口（第二步） | [计划](gateway-api-key-plan.md) |
| G-03 | **已完成** | 账号页“查询用量/充值”指向 NewAPI 控制台 | `usagePath`/`topUpPath` |
| D-02 | **已完成** | macOS unsigned 包（FA + RU，`0.2.1-rc.2.20261103.1`） | [site](site.md) |
| D-03 | **阻塞**（等 Windows 机器构建） | FA / RU Windows unsigned 包；交接单、脚本、上传目录、两只公钥已就绪 | [Windows 交接单](windows-handoff.md) |
| S-01 | **已完成** | 网关域名切换到 https://deepseekfa.com（旧 `deepseek-fa.org` 方案作废） | [迁移清单](deepseek-fa-domain-migration.md) |
| I-02 | **已完成** | SMTP：两个域名 verified、两站 SMTP 已配、邮箱验证已开启 | [SMTP 方案](smtp-plan.md) |
| I-01 | 待办 | **服务端消息波斯语翻译**：`i18n/locales` 新增 `fa.yaml`（215 键）+ `LangFa`/localizer/`SupportedLanguages`。未做前 fa 页面的报错文案回落英文 | [i18n](console.md) |
| C-01 | **已完成** | 迷你波斯语控制台（用量 + 单笔计费明细 + 密钥增删复制） | [console](console.md) |
| C-02 | **已完成** | 2FA 登录表单 + 桌面授权放行；旧密钥清理入口 | [console](console.md) |

| C-03 | 待办 | 邀请奖励数值可调 + 被邀请人总额确认（当前被邀请注册共得 $1.00 = 0.50 新用户 + 0.50 被邀请） | [console](console.md) |
| S-02 | 待办 | 法务页（服务条款 / 隐私政策）、更新日志、FAQ | [site](site.md) |
| S-03 | 待办 | 访问统计、ArvanCloud CDN、Windows 包 CDN | [site](site.md) |
| D-04 | **待办（包丢失需重建）** | FA 的 Windows 安装包与清单在 2026-11-04 被误删，需在 Windows 机器上重新构建并上传 `deepseek-fa-win-x64-unsigned.exe` + `.json` | [Windows 交接单](windows-handoff.md) |

| C-04 | **已完成** | 充值页：`/me/topup` 兑换码 + 历史，`/top_up` 302 到此 | [console](console.md) |
| C-05 | **已完成** | 普通用户改密码：新增 `PUT /api/user/password` + 迷你站 `/me/account` | [console](console.md) |
| C-06 | **已完成** | 忘记密码：两站 SMTP 均可用，页面与接口已上线 | [smtp-plan](smtp-plan.md) |
| C-07 | **已完成** | 密钥编辑：配额/过期/IP 限制（`PUT /api/token/` + 迷你站对话框） | [console](console.md) |
| C-08 | **已完成** | 用量统计：`/api/data/self` 按天/模型汇总，7/30 天切换 | [console](console.md) |
| C-09 | **已完成** | 公告：用量页横幅（最新一条、可关闭） | [console](console.md) |
| C-10 | **已完成** | 价格页：`/me/pricing`（ratio → $/百万 token） | [console](console.md) |
| C-11 | **已完成** | 2FA：启用（密钥 + 4 备份码）、登录动态码步骤、关闭/重生成 | [console](console.md) |
| C-12 | **已完成** | `/me/*` 安全头：noindex / DENY / no-referrer / **CSP（script-src 'self'，页面无内联脚本）** | [console](console.md) |

| M-15 | 待办（需真人+手机） | **2FA 手工验收**（自动化覆盖不到，需真人 + 手机）：① 用 Google Authenticator / Aegis 手动录入 `/me/account` 的密钥，确认真实 App 的码能登录；② 同浏览器两个 2FA 账号并行登录，确认不串号（应提示「会话已失效」）；③ 4 个备份码逐个用尽后只剩动态码；④ 连续错码 5 次触发 5 分钟锁定，期满恢复；⑤ 手机+备份码都丢失时的管理员恢复流程（`delete from two_fas`）；⑥ ±30s 时钟偏差 | [console](console.md) |

| M-16 | **已完成** | `session_version`：改密/重置后旧会话失效，改密设备保留 | [console](console.md) |
| M-17 | **已完成** | `setupLogin` 统一拦截：2FA 账号没有动态码标记一律不给会话，passkey/OAuth 无法绕过 | [console](console.md) |

## F-01 摘要

- 现状：NewAPI `/v1/files` 是 `RelayNotImplemented`；relay 返回 404；DSH 回退 inline。
- 目标：让 DSH 走真实 `file_id`，支持大图与跨请求复用。
- 关键难点：上传请求没有 `model`，不能依赖 `Distribute` 选渠道；需要按令牌分组或显式文件渠道。
- 验收：见 Issue #11。
