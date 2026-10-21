# ADR-002：把 relay 合并进 NewAPI，单网关

- 状态：Accepted（2026-10-21）
- 取代：[ADR-001](adr-001-relay-boundary.md)
- 实现：`new-api-deepseek` 的 `feat/dsh-gateway`（commit `b96c7945e`）

## 背景

ADR-001 选择外挂 relay，理由是 AGPL、NewAPI 升级成本和 DSH 协议未稳定。实际运行后，外挂的代价变成主要矛盾：

- DSH 用户与 NewAPI 用户是两套身份，所有推理共用一个 `NEWAPI_KEY`，无法按用户计费；
- 登录、模型目录、SSE、Files 分散在两个进程，排障要跨两套日志；
- 每次改 DSH 协议都要同时考虑 relay 与 NewAPI 的边界。

用户明确要求“一步到位，别搞两套东西”。

## 决策

NewAPI 二开成为唯一网关：

```
DSH Web/Desktop ──▶ NewAPI :13000 ──▶ DeepSeek Anthropic API
```

- DSH 用户 = NewAPI `User`（Email 登录，bcrypt 复用 NewAPI）。
- DSH token = NewAPI `Token.Key`（48 位字母数字，每次登录新建，TTL 30 天）；`x-dsh-auth-token` 由中间件翻译成 `Authorization: Bearer`。
- PKCE 登录事务只新增 `dsh_auth_transactions` 一张表；不再有 relay 的 users/tokens/sessions 表。
- 8 个账户接口、`/models`、`/dsh/authorize` 页面用 Go 实现；`/v1/messages`、`/v1/files` 复用现有 NewAPI 链路。
- 每次 login/exchange 新建独立 NewAPI Token，logout 只吊销当前 token，多设备互不踢。
- 上游 401 对 DSH 请求映射为 502，避免 DSH 把供应商故障当成 token 失效而清 grant。
- relay 代码保留为协议参考和一致性测试，但不再启动。

## 后果

正面：

- 一套用户、一套 token、一套配额/日志；
- 少一个常驻服务、数据库和部署单元；
- Files API、模型目录、SSE、登录都在一个进程里；
- DSH 用户直接映射 NewAPI 额度，P3 无需再做 token 映射。

代价：

- NewAPI 变成 AGPL 二开分支，升级要合 DSH 改动；
- DSH 协议进入 Go 代码，测试和发布节奏受网关影响；
- 旧 relay 签发的 token 不再有效，合并后需要重新登录一次；
- 登录页/CSRF/PKCE 的安全维护责任转到网关。

## 迁移与回滚

迁移：

1. 部署 `new-api-deepseek`（含 `/v1/files` + DSH 协议）；
2. DSH profile 的 `platformOrigin` / `inferenceOrigin` / `baseURL` 指向 `http://127.0.0.1:13000`；
3. 停止 relay（18082），重新登录 DSH；
4. 用 `/models`、文本对话、图片附件、logout 验收。

回滚：保留 relay 代码和旧 profile patch，把 DSH 指回 18082 即可；NewAPI 的 DSH 路由不影响原有 `/v1`。

## 未解决

- 多实例注册同一邮箱仍可能重复（Email 非唯一索引；单实例已用事务 + 互斥锁）。
- `DSH_MODELS.upstream` 不参与模型改写，上游模型名不同需在 NewAPI 渠道配置映射。
- `SESSION_SECRET` 生产必须固定，否则重启会让未完成的登录事务 CSRF 失效。
