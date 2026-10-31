# 进度总览

> 最后更新：2026-10-31
> 单一进度入口。详细计划见 [PLAN.md](../PLAN.md)，决策见 [ADR-002](adr-002-merge-relay-into-newapi.md)，验收见 [gateway-acceptance.md](gateway-acceptance.md)。

## 当前阶段

**单网关（NewAPI 二开）已完成**，DSH 不再运行独立 relay；Web 登录/文本/图片已验证，桌面端文本已验证，桌面图片附件待手工确认。

## 里程碑

| ID | 事项 | 状态 | 证据 |
|---|---|---|---|
| M-00 | NewAPI 二开仓库、基线、AGPL 说明 | 完成 | `new-api-deepseek` main |
| M-01 | Files API（上传/列表/查询/删除/content） | 完成 | #11 已关闭 |
| M-02 | DSH 账户协议、PKCE、登录页、8 接口、`/models` | 完成 | `b96c7945e` |
| M-03 | token 映射 / 多设备隔离 / 跨用户文件隔离 | 完成 | 独立测试 10/10 |
| M-04 | relay 合并、DSH 指向 13000、Web 端到端 | 完成 | ADR-002、验收记录 |
| M-05 | 桌面端文本 | 完成 | `DESKTOMGW` |
| M-06 | 桌面端图片附件 | **待手工确认** | 原生文件选择器无法自动化 |
| M-07 | Gateway API Key 模式（第一步） | 完成 | [计划](gateway-api-key-plan.md)、网关 key E2E |
| M-08 | 生产部署 `https://ds.openrouters.org` | 完成 | [部署记录](server-deployment.md) |
| M-09 | 本地测试切到生产网关 | 完成 | server-gateway.patch.yml、远端 E2E |
| M-10 | 账号页用量/充值入口指向 NewAPI 控制台 | 完成 | `usagePath`/`topUpPath` |
| D-01 | DeepSeek-FA 桌面品牌/配置隔离 | 完成 | [桌面说明](deepseek-fa-desktop.md) |
| D-02 | macOS unsigned 测试包 | 完成 | UI 品牌已统一，`deepseek-fa-0.2.1-rc.2.20261023.1-mac-arm64-unsigned.dmg` |
| D-03 | Windows unsigned 测试包 | 待 Windows 构建 | [Windows 指南](windows-build-guide.md) |
| V-01 | 发版时移除官方 API Key 入口（第二步） | 未开始 | 计划 §第二步 |
| S-01 | 网关域名切换到 deepseek-fa.org | 待办 | #13、证书已存本地 |
| B-01 | 品牌名称 + Logo | **阻塞** | 需要用户提供 |
| R-01 | RTL 基础层 | 未开始 | PLAN §5 |
| D-01 | 签名/公证/更新源 | 未开始 | PLAN §7 |

## 当前运行

| 服务 | 地址 |
|---|---|
| NewAPI 单网关（生产） | `https://ds.openrouters.org` |
| 俄语站网关（新） | `https://deepseek-ru.org` → 同机容器 `dsh-newapi-ru`（`127.0.0.1:3105`） |
| 本地回退 | `http://127.0.0.1:13000`（可选） |
| DSH Web 测试 | `http://127.0.0.1:3080`（指向生产） |
| 宿主代理转发 | `0.0.0.0:10810` |
| relay | **已停止**（仅参考代码） |

## 俄语版（deepseek-ru.org）

| ID | 事项 | 状态 | 证据 |
|---|---|---|---|
| RU-00 | 方案：与 FA 同构的独立站点 + 独立品牌 | 完成 | [方案](ru-version-plan.md) |
| RU-01 | 站点上线：Cloudflare + Origin CA + 独立网关容器 | 完成 | [部署记录](deepseek-ru-deployment.md) |
| RU-02 | 上游渠道（`deepseek-anthropic` + 独立 key） | 完成 | 渠道测试通过；`/v1/models`、`/v1/chat/completions` 均 200 |
| RU-03 | 俄语界面（抽取上游 `ru` 字典生成语言包） | 未开始 | 上游原生 8 语言；覆盖 92.7%，手工补 88 条，见 [方案 §2.2](ru-version-plan.md) |
| U-01 | 同步上游 rc.2 → rc.5 | 未开始 | 2,527 提交 / 8,133 文件；须与品牌参数化配套 |
| RU-04 | 俄语版桌面品牌分支与安装包 | 未开始 | `brand/ru-deepseek-ru` 分支已建，仅部署文档 |
| RU-05 | macOS/Windows unsigned 包与 `/downloads/` 产物 | 未开始 | 同 D-03 |
| RU-06 | 俄语区支付通道 | 未开始 | — |

## 已知限制

- 桌面端图片附件需人工点一次原生文件选择器。
- 旧 relay token 不迁移；合并后已重新登录。
- Email 非唯一索引；多实例并发注册同一邮箱仍可能重复。
- OpenAI 兼容渠道的 SSE 归一化未在 Go 侧实现；当前使用 DeepSeek Anthropic 原生渠道。
- `SESSION_SECRET`、`DSH_PUBLIC_ORIGIN` 生产必须固定/设为 HTTPS。

## 下一步

1. 手工确认桌面图片附件（M-06）。
2. 提供品牌名称 + Logo（B-01），随后进入 RTL（R-01）与分发（D-01）。
3. 发版前执行 Gateway API Key 第二步：移除官方 API Key 入口（V-01）。
