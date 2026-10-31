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
| D-02 | **已完成** | DeepSeek-FA macOS unsigned 测试包 | [桌面说明](deepseek-fa-desktop.md) |
| D-03 | 待办 | DeepSeek-FA Windows unsigned 包 | [桌面说明](deepseek-fa-desktop.md#windows仅方案) |
| S-01 | 待办 | 网关域名切换到 https://deepseek-fa.org | [#13](https://github.com/longge2023git/dsh-rebrand/issues/13)、[迁移清单](deepseek-fa-domain-migration.md) |
| RU-02 | **已完成** | 俄语站上游渠道：`deepseek-anthropic` 渠道 + 独立官方 key | [俄语站部署](deepseek-ru-deployment.md) |
| RU-03 | 待办 | 俄语界面：`packages/client/locale-ru`（3,201 条）+ 登录页 `ru` 分支 | [方案 §2.2](ru-version-plan.md) |
| RU-04 | 待办 | 俄语版桌面品牌分支（`brand/ru-*`，`GATEWAY_ORIGIN=https://deepseek-ru.org`） | [方案 §3](ru-version-plan.md) |
| RU-05 | 待办 | 俄语版 macOS/Windows unsigned 包与 `/downloads/` 产物 | 同 D-03 |
| RU-06 | 待办 | 俄语区支付通道与充值入口 | [方案 §4](ru-version-plan.md) |

## F-01 摘要

- 现状：NewAPI `/v1/files` 是 `RelayNotImplemented`；relay 返回 404；DSH 回退 inline。
- 目标：让 DSH 走真实 `file_id`，支持大图与跨请求复用。
- 关键难点：上传请求没有 `model`，不能依赖 `Distribute` 选渠道；需要按令牌分组或显式文件渠道。
- 验收：见 Issue #11。
