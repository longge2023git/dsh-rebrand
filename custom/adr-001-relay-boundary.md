# ADR-001：DSH 协议适配层为什么外挂在 NewAPI 之外

- 状态：**Superseded by [ADR-002](adr-002-merge-relay-into-newapi.md)（2026-10-21）**；保留为历史决策记录
- 相关：[PLAN](../PLAN.md)、[登录规范](login-relay-spec.md)、[NewAPI `/v1/files` 待办 #11](https://github.com/longge2023git/dsh-rebrand/issues/11)

## 背景

DSH 需要的是一套**产品账户协议**，而 NewAPI 提供的是**模型网关能力**，两者的职责不同：

| 能力 | DSH 需要 | NewAPI 提供 |
|---|---|---|
| 登录 | PKCE、`/auth-api/v0/dsh/*`、loopback 回调、登录页 | 用户名/密码、OAuth/OIDC、自己的会话 |
| 账户 token | `x-dsh-auth-token`、8 个固定接口 | `Authorization: Bearer sk-...` |
| 模型目录 | `api_capabilities.anthropic_messages` 等 DSH schema | OpenAI 风格 `/v1/models` |
| 推理 | 严格 SSE 事件顺序 | 协议转换，可能重复 `message_start` |
| Files | `/v1/files` | 未实现（`RelayNotImplemented`） |

## 决策

**当前阶段把 DSH 协议放在独立 relay 中，NewAPI 保持不改。**

- relay 负责：DSH 账户协议、PKCE、token 签发/吊销、注册登录页、`/models` schema、SSE 归一化。
- NewAPI 负责：上游渠道、模型映射、配额/计费、日志。
- 两者只通过 HTTP 契约耦合：relay → `POST /v1/messages`（Bearer `NEWAPI_KEY`）。

## 理由

### 1. 许可证边界

NewAPI 是 **AGPLv3**（还带 Section 7 归属要求）。把 DSH 账户逻辑写进 NewAPI，等于维护一个 AGPL 分支；如果对外提供网络服务，还会涉及 AGPL 的源码提供义务。

独立 relay 是 MIT，NewAPI 以**未修改容器**运行，边界清晰。对一个要对外分发的产品，这不是小事。

### 2. 升级成本

NewAPI 迭代很快，路由、中间件、用户模型都可能变。DSH 这边又处于 pre-stable，账户协议也会变。把两者绑在一个进程里，每次升级要同时处理两边的变更。

外挂层只依赖稳定的 HTTP 行为；NewAPI 升级不影响 relay 的协议实现。

### 3. 技术形态不同

NewAPI 的 `/v1` 路由组先跑 `Distribute` 中间件（要求 `model`），而 DSH 的账户接口没有 model；登录页还需要 Cookie、CSRF、CSP、PKCE 事务表。这不是“加一个 handler”，而是在 Go 服务里再放一个小型 Web 应用。

用 TypeScript 写 relay 可以快速迭代、直接复用 DSH 的协议测试；NewAPI 不需要为 DSH 的特殊性做改造。

### 4. 职责与故障隔离

- relay 挂了：登录不可用，但 NewAPI/模型不受影响；
- NewAPI 挂了：relay 仍能登录、展示模型目录，只是推理失败；
- 上游 key 只在 NewAPI；DSH 用户 token 只在 relay。

两边数据模型也不同：relay 存 DSH 用户/PKCE 事务/token 哈希；NewAPI 存渠道/令牌/配额。混在一起会让权限和审计边界变模糊。

## 代价（必须承认）

1. **多一个服务、多一个数据库、多一跳**。本地延迟可忽略，但部署/监控/备份多一份。
2. **用户体系重复**：relay 有自己的邮箱密码，NewAPI 也有用户；目前 relay 所有用户共用一个 `NEWAPI_KEY`，所以 **NewAPI 看到的是一个用户、一份额度**，做不到按 DSH 用户计费。
3. **Files API 需要额外处理**：NewAPI 不实现 `/v1/files`，relay 要么直连上游（需要上游 key），要么本地存文件再 inline。
4. **两套日志**：排查一次请求要同时看 relay 和 NewAPI。

## 什么情况下应该合并进 NewAPI

满足以下任意两条，就值得把 DSH 协议做进二开网关：

- 需要**按 DSH 用户**做配额、计费、审计；
- 已经决定长期维护 NewAPI 分支，接受 AGPL；
- 运维上不想再养一个常驻服务/数据库；
- 需要 Files API、模型目录、SSE 归一化都在一个进程里完成；
- DSH 账户协议已经稳定，不再频繁变。

反之，如果 NewAPI 只是可替换的模型网关，或者还想保留换网关的自由，就应继续外挂。

## 迁移路径

1. 保持 relay 作为**参考实现 + 协议一致性测试**；
2. DSH 协议稳定后，把 relay 的 handler 逻辑搬进二开网关（Go 或保留 sidecar）；
3. 用现在的 relay 集成测试作为搬迁后的验收套件；
4. 把 relay 的 `NEWAPI_KEY` 改成“每 DSH 用户一个 NewAPI token”，先解决计费/配额，再决定是否合并进程。

## 备选方案

| 方案 | 结论 |
|---|---|
| 直接改 NewAPI 加 DSH 路由 | 现在成本高、AGPL、升级耦合；等协议稳定后再评估 |
| relay 作为 sidecar（同 Pod/同机） | 部署上接近合并，许可证/升级边界仍在；可作为中间态 |
| 全部自己做网关（不用 NewAPI） | 自由度最高，但要重做渠道/配额/日志，不建议为了 DSH 协议重造 |

## 结论

外挂不是“永远多一层”，而是**在协议未稳定、许可证敏感、NewAPI 快速迭代时，把变化隔离开**。等计费/配额/Files 这些需求压过运维成本，再把 relay 收进二开网关是合理的下一步。
