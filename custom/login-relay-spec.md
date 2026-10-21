# DSH 登录中转站协议规范 v1.1

> 适用基线：`dsh-v0.2.1-rc.2`（`deepseek-account-platform`）
> 目标：你的中转站实现本文档后，**DSH 客户端不改代码**，只改 `platformOrigin` / `inferenceOrigin` 即可完成换登录。
> 来源：`packages/credentials/deepseek-account-platform/src/{protocol,index,details,logout}.ts`、`packages/llm/llm-deepseek-account/src/index.ts`。
> 适用范围：**桌面安装包**（已确认）。托管 Web 受 loopback 回调限制，不在本期。

---

## 1. 角色与拓扑

```
┌──────────────┐   ① auth_init                        ┌──────────────────┐
│ DSH Host     │ ───────────────────────────────────▶ │ 你的中转站        │
│ (桌面 / Web) │ ◀── authorize_url / authorize_id ─── │ (HTTPS)          │
│              │                                      │                  │
│ 系统浏览器    │ ② 打开 authorize_url ──────────────▶ │ /dsh/authorize   │
│              │                                      │   └─ 你的 SSO ──▶ │ IdP
│              │ ◀── 302 到 http://127.0.0.1:PORT/oauth/callback?code&state
│              │                                      │                  │
│ 本机回调      │ ③ auth_exchange {code, verifier} ──▶ │                  │
│              │ ◀── {token, authorized_url, user} ── │                  │
│              │ ④ 存 token，浏览器 302 → /dsh/authorized
│              │                                      │                  │
│ 推理请求      │ ⑤ x-dsh-auth-token: <token> ───────▶ │ /v1/... 或你的网关 │
└──────────────┘                                      └──────────────────┘
```

- DSH 是**单用户本地优先**架构：一个进程一个账户。中转站不需要做多租户会话隔离。
- 浏览器回调固定走 **loopback**（`http://127.0.0.1:<port>/oauth/callback`），不支持自定义 scheme；SSH 场景由客户端把端口转发到本机，中转站只需原样 302 回 `redirect_uri`。

---

## 2. DSH 侧配置

在 profile 的 `cordis.patch.yml`（或自有 bundle 层）覆盖账户行：

```yaml
- id: deepseek-account
  name: '@deepseek-ai/dsh-deepseek-account-platform'
  config:
    platformOrigin: https://relay.example.com     # 必须是 HTTPS origin（无 path/query/hash）
    inferenceOrigin: https://relay.example.com    # 允许带账户 token 的唯一推理 origin
    allowLoopbackHttp: false                      # 仅本地 mock 时对 loopback 放开 http
    # 补丁会整体替换该行的 config，因此必须复述 base 层原有的 desktopPlatform，
    # 否则桌面端会被当成 web，发出的客户端头不正确。
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"
    # rewriteBrowserOrigin: false                 # 仅开发代理需要
    # requestHeaders: { x-tenant: acme }          # 仅发往 platformOrigin，禁止覆盖授权头
```

模型路由指向中转站（账户 token 走 `x-dsh-auth-token`，不是 Bearer）：

```yaml
- id: llm-deepseek-account
  config:
    baseURL: https://relay.example.com/v1
```

约束：

| 配置 | 校验规则（违反即启动失败/登录失败） |
|---|---|
| `platformOrigin` | 必须 `https:`，且无 userinfo、path 必须为 `/`、无 query/hash；仅当 `allowLoopbackHttp: true` 时允许 loopback 的 `http:` |
| `inferenceOrigin` | 同样只接受 origin；账户 token 只发给这个 origin |
| `rewriteBrowserOrigin` | 仅用于把 `https` 授权页改写到配置 origin（本地代理调试），生产保持 `false` |

---

## 3. 通用约定

### 3.1 响应信封

所有 API 端点（除浏览器页面）都返回 JSON，HTTP 200 + 固定信封：

```json
{ "code": 0, "data": { "biz_code": 0, "biz_data": { } } }
```

| 字段 | 要求 |
|---|---|
| `code` | 必须为 `0`；非 0 一律按 `protocol` 失败 |
| `data.biz_code` | 成功必须为 `0`；非 0 一律按 `protocol` 失败（客户端不展示后端文案） |
| `data.biz_data` | 端点各自定义，见 §5 |

失败语义：

| 服务端返回 | 客户端归类 | 备注 |
|---|---|---|
| HTTP 401（且请求带 `x-dsh-auth-token`） | `expired` | 触发客户端清除本地 grant 并提示重新登录 |
| HTTP 200 + **顶层** `{"code":40003}`（带 token 时） | `expired` | 同上；`code` 不是 `0`，**不要**放进 `data.biz_code` |
| HTTP 200 + `data.biz_code = 40003` | `protocol` | **不会**登出，只会显示通用失败；不要这样返回 |
| 其他非 2xx / 无响应 / 超时 | `network` / `no-response` | 可重试 |
| 信封不合法、`biz_code≠0`、字段类型不符 | `protocol` | 不可重试，UI 报通用失败 |

### 3.2 传输限制（客户端强制）

- **禁止重定向**：API 请求以 `redirect: 'error'` 发出，3xx 直接失败。
- 响应体上限 **65 536 字节**；超限按 `protocol` 失败。
- 单请求超时默认 **30 s**（`requestTimeoutMs`，可配 1–120 s）。
- 必须是 `application/json`；不要压缩成非 JSON。
- 不需要 CORS（服务端到服务端 + 浏览器顶层导航）。

### 3.3 请求头

| 头 | 出现位置 | 值 |
|---|---|---|
| `content-type: application/json` | 所有 POST | — |
| `x-client-platform` | 所有 | `web`，桌面为 `desktop-mac` / `desktop-win` |
| `x-client-version` | 所有 | DSH 构建版本 |
| `x-client-locale` | 所有 | `zh_CN` / `en_US` |
| `x-client-timezone-offset` | 所有 | 东区为正的秒数，如 `28800` |
| `x-client-bundle-id` | 所有 | 固定空字符串，可忽略 |
| `x-dsh-auth-token` | 需鉴权的端点 | 账户 token |
| 自定义 `requestHeaders` | 发往 `platformOrigin` | 由部署配置，禁止覆盖上述保留头 |

> 中转站应当**容忍**这些头而不是强校验；只有 `x-dsh-auth-token` 是协议必需。

---

## 4. 端点总表

共 **8 个 JSON API + 4 个浏览器页面**。

| # | 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|---|
| 1 | POST | `/auth-api/v0/dsh/auth_init` | 创建登录事务，返回授权页地址 | 无 |
| 2 | GET | `/dsh/authorize` | 浏览器登录页（可 302 到你的 IdP） | 浏览器会话 |
| 3 | POST | `/auth-api/v0/dsh/auth_exchange` | PKCE 换 token | 无（凭 code） |
| 4 | POST | `/auth-api/v0/dsh/auth_cancel` | 取消登录事务 | 无（尽力而为） |
| 5 | GET | `/auth-api/v0/users/current` | 当前用户资料 | token |
| 6 | GET | `/api/v0/users/get_user_summary` | 钱包余额 | token |
| 7 | GET | `/api/v0/users/get_unnotified_bonuses` | 未读赠送金 | token |
| 8 | POST | `/api/v0/users/ack_bonus_notified` | 标记赠送金已读 | token |
| 9 | POST | `/auth-api/v0/users/logout` | 吊销 token | token |
| 10 | GET | `/models` | 模型目录（账户路由拉取） | token |
| 11 | GET | `/dsh/authorized` | 登录完成页（浏览器） | 无 |
| 12 | GET | `/usage`、`/top_up` | 用量/充值页（UI 链接与桌面内嵌） | 浏览器会话 |

---

## 5. 端点定义

### 5.1 `POST /auth-api/v0/dsh/auth_init`

请求：

```json
{
  "code_challenge": "43 字符 base64url(SHA256(verifier))",
  "code_challenge_method": "S256",
  "state": "43 字符 base64url 随机值",
  "redirect_uri": "http://127.0.0.1:51234/oauth/callback",
  "locale": "zh_CN",
  "login_source": "web"
}
```

响应 `biz_data`：

```json
{
  "authorize_url": "https://relay.example.com/dsh/authorize?tx=...",
  "authorize_id": "tx_...",
  "expires_in": 300
}
```

要求：

- `authorize_url` 的 **origin 必须等于 `platformOrigin`**、**pathname 必须精确为 `/dsh/authorize`**，不得带 userinfo 或 fragment；query 自由。
- `authorize_id` 非空字符串；`expires_in` 为正数秒。
- 服务端必须持久化本次事务：`code_challenge`、`state`、`redirect_uri`、`expires_at`、`login_source`。
- `redirect_uri` 只接受 `http://localhost|127.0.0.1|[::1]:<port>/` 形式的 loopback origin（客户端已校验，服务端仍应复核）。
- 建议 TTL ≤ 300 s；客户端整体尝试上限 600 s（`attemptTimeoutMs`）。

### 5.2 `GET /dsh/authorize`

浏览器页面。要求：

1. 读取事务，展示你的登录/SSO（可 302 到 IdP，带回跳）。
2. 登录成功后 **302 到事务里的 `redirect_uri`**，附加 `?code=...&state=...`：
   - `code` 单次有效、短 TTL（建议 ≤ 120 s）；
   - `state` 必须与 init 时一致，原样回传；
   - 不要附加多余参数（客户端只读 `code`、`state`）。
3. 登录失败时可直接展示错误页，不跳回 loopback（客户端会超时/取消）。

### 5.3 `POST /auth-api/v0/dsh/auth_exchange`

请求：

```json
{
  "code": "一次性授权码",
  "code_verifier": "43 字符 base64url 原始随机值",
  "redirect_uri": "http://127.0.0.1:51234/oauth/callback",
  "device_id": "uuid-v4（客户端持久化）",
  "device_model": "darwin-arm64",
  "os_version": "Darwin 25.5.0"
}
```

响应 `biz_data`：

```json
{
  "token": "opaque-printable-ascii",
  "authorized_url": "https://relay.example.com/dsh/authorized",
  "user": {
    "id": "u_123",
    "email": "user@example.com",
    "mobile": "",
    "id_profile": { "name": "Long Ge", "picture": "https://.../a.png" }
  }
}
```

要求：

- 校验 `base64url(SHA256(code_verifier)) === code_challenge`，并校验 `redirect_uri` 与 init 一致；code 单次使用，重复兑换返回失败。
- `token` 必须匹配可打印 ASCII `^[\x21-\x7e]+$`（无空格）；建议 ≥ 32 字节熵。
- **生产 token 不要以 `dsh_mock_` 开头**：客户端会拒绝用它访问官方推理 origin。
- token 与 `platformOrigin` 绑定：客户端保存 `{token, issuer=platformOrigin}`，换 origin 即视为未登录。
- **协议没有 refresh token**：token 过期只能重新登录。有效期建议 7–30 天；401 会被当作 `expired` 并删除本地凭据。
- `authorized_url` 同样必须 origin 匹配、pathname 精确为 `/dsh/authorized`、无 fragment；客户端会追加 `login_source`。
- `user` 可选；提供时按 §6.1 校验，失败只丢弃该字段，不影响登录成功。

### 5.4 `POST /auth-api/v0/dsh/auth_cancel`

请求：`{ "authorize_id": "...", "code_verifier": "..." }`

- 尽力而为：取消/超时后客户端会调用；失败不影响本地取消。
- 响应仍需合法信封（`biz_data` 可为 `null`）。

### 5.5 `GET /auth-api/v0/users/current`

请求头带 `x-dsh-auth-token`。`biz_data` 为用户对象（§6.1）。无效/过期 token 返回 **401** 或 `{"code":40003}`。

### 5.6 `GET /api/v0/users/get_user_summary`

```json
{
  "normal_wallets": [{ "currency": "CNY", "balance": "12.34" }],
  "bonus_wallets": []
}
```

- `currency` 仅允许 `CNY` / `USD`；`balance` 是十进制字符串（可带符号/指数，如 `"0"`、`"0E-16"`）。
- 没有钱包就返回空数组；**不要**返回 `null`。

### 5.7 `GET /api/v0/users/get_unnotified_bonuses`

`biz_data` 为数组（可为空）：

```json
[{
  "order_id": "bonus_1",
  "title": "新人赠送",
  "expires_at": "2026-12-31T00:00:00Z",
  "msg": "已到账 10 元"
}]
```

- `order_id` 必填；`msg` 必填；`expires_at` 缺失时按空字符串处理（表示永不过期）；`title` 可空。
- 没有赠送金返回 `[]`。

### 5.8 `POST /api/v0/users/ack_bonus_notified`

请求：`{ "order_id": "bonus_1" }`，`biz_data` 可为 `null`。失败不影响主流程。

### 5.9 `POST /auth-api/v0/users/logout`

带 `x-dsh-auth-token`，无请求体。客户端在本地删除 grant 后后台重试（指数退避，最多 5 次）。中转站应使该 token 立即失效。

### 5.10 浏览器页面 `/dsh/authorized`、`/usage`、`/top_up`

- `/dsh/authorized`：登录完成页，展示「已登录，可关闭窗口」即可；客户端会在 query 追加 `login_source=web|desktop`。
- `/usage`、`/top_up`：账户面板里的「用量」「充值」链接指向这两个路径；不做计费可返回简单说明页，避免 404。

---

## 6. 数据类型

### 6.1 用户对象

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | **是**（赠送金接口要求） | string \| null | 稳定用户 ID；为空时赠送金接口直接报 `protocol` |
| `email` | **是** | string | 资料页联系人兜底；无邮箱也要给占位值 |
| `mobile` / `mobile_number` | 否 | string | 任一存在即作为优先联系人 |
| `id_profile` | 否 | `{ name: string\|null, picture?: string\|null }` | 显示名/头像 |

联系人优先级：`mobile` → `mobile_number` → `email`。

### 6.2 钱包

| 字段 | 必填 | 取值 |
|---|---|---|
| `currency` | 是 | `CNY` / `USD` |
| `balance` | 是 | 十进制字符串 |

### 6.3 赠送金

`order_id`、`msg` 必填；`title`、`expires_at`、`campaign`、`amount`、`currency`、`granted_at` 可选。`campaign/amount/currency/granted_at` 按原样转发给 UI，不做校验。

---

## 7. 推理调用（中转站兼网关）

中转站同时承担模型入口时，DSH 用同一枚账户 token 调模型。协议是 **Anthropic Messages 风格**，不是 OpenAI Chat Completions。

### 7.1 端点与认证

`baseURL` 配置为 `https://relay.example.com`（或 `.../v1`）；客户端把根解析为：路径已以 `/v1` 结尾则原样，否则追加 `/v1`。

```
POST {root}/messages
content-type: application/json
accept: text/event-stream
x-dsh-auth-token: <token>        # 账户路由（llm-deepseek-account）
anthropic-version: 2023-06-01
anthropic-beta: files-api-2025-04-14   # 仅文件/图片请求需要
```

- API key 路由（`llm-deepseek-api-key`）用 `x-api-key`，与账户路由二选一，不会同时发送。
- token 只发往 `inferenceOrigin`；**强建议 `inferenceOrigin === platformOrigin`**，否则中转站签发的 token 会被发到官方 API（跨源泄漏，见 §11）。
- 请求/响应**拒绝重定向**；token 失效返回 401，DSH 归类 `expired` 并删除本地凭据。
- 请求体是 Messages API（`model`、`system`、`messages`、`tools`、`max_tokens`、`stream: true`，以及 thinking/reasoning 字段）。DSH 可能附带 provider 扩展字段；不认识时忽略，不要因此 400。

### 7.2 响应：SSE 事件契约

| 事件 | 必填内容 | 说明 |
|---|---|---|
| `message_start` | `message.usage` | 必须最先出现，且只能一次 |
| `content_block_start` | `index`、`content_block` | 文本/思考/工具调用块；index 不重复 |
| `content_block_delta` | `index`、`delta` | 文本增量 / 工具参数增量 |
| `content_block_stop` | `index` | 每个块恰好一次 |
| `message_delta` | `delta.stop_reason`、可选 `usage` | 结算停止原因与用量 |
| `message_stop` | — | 必须最后出现；此前所有块必须已关闭且 stop_reason 已给 |

规则：

- 其他事件类型会被忽略，但不要用它们承载正文。
- 缺少 `message_start`、重复块 index、块未关闭就 `message_stop`、流在 `message_stop` 前结束，都会失败。
- `stop_reason=stop` 且没有任何内容块 → `EMPTY_RESPONSE`。
- 工具调用的 JSON 必须完整合法（`max_tokens` 截断除外）。
- **用量是「覆盖」不是「累加」**：`message_start.message.usage` 给输入用量，`message_delta.usage` 必须给**累计值**（output 至少是累计输出），否则统计会错。
- 未识别的 `delta` 类型、`stop_reason`、块类型会直接失败；请只发客户端支持的取值。

### 7.3 错误格式与映射

```json
{ "error": { "type": "authentication_error", "message": "token expired", "code": "expired" } }
```

| 条件 | 归类 |
|---|---|
| 401 / 403 / `authentication_error` / `permission_error` | `AUTH` |
| 402 或额度类错误 | `QUOTA` |
| 429 / `rate_limit_error` | `RATE_LIMIT` |
| 400 / 413 / `invalid_request_error` | `INVALID_REQUEST` |
| 上下文超限（错误文本含 context/window/token 上限） | `CONTEXT_WINDOW_EXCEEDED` |
| 5xx / `api_error` / `overloaded_error` | `SERVER` |
| 其他状态码 | `HTTP_<status>` |

`retry-after`（秒数或 HTTP 日期）与 `request-id`/`x-request-id`/`x-deepseek-request-id` 会被读取，建议返回。

### 7.4 模型目录 `GET /models`（账户路由必需）

账户路由**不允许**在配置里写 `models`（写了直接启动失败）；模型列表来自 `GET {origin}/models`，注意是 **origin + `/models`**，不是 `/v1/models`。

请求头：`x-dsh-auth-token`、`accept: application/json`。

响应：

```json
{
  "data": [
    {
      "id": "your-model-id",
      "name": "Your Model",
      "input_modalities": ["text", "image"],
      "output_modalities": ["text"],
      "context_window": 200000,
      "max_output_tokens": 8192,
      "api_capabilities": {
        "anthropic_messages": { "system_prompt_update": "in-history" }
      },
      "client_requirements": {
        "deepseek-harness": { "min_version": "0.2.1-rc.2" }
      }
    }
  ]
}
```

字段规则：

| 字段 | 规则 |
|---|---|
| `data` | 必须是非空数组；无可用条目 → 列表失败 |
| `id` | 必填、非空、不重复 |
| `input_modalities` / `output_modalities` | 只认 `text` / `image`；输出必须含 `text` |
| `context_window` / `max_output_tokens` | 可选，正整数 |
| `api_capabilities.anthropic_messages` | **必填**，缺失则该模型不可用 |
| `client_requirements["deepseek-harness"].min_version` | 可选；低于此版本的客户端隐藏该模型 |

失败行为：请求失败或响应非法时，账户路由回退到内置 `deepseek-flash` / `deepseek-v4-pro`（这两个 id 会原样发给中转站）。**如果不实现 `/models`，你的自建模型不会出现在选择器里。**

### 7.5 文件 API（可选）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/v1/files` | multipart 上传 |
| GET | `/v1/files?<分页参数>` | 列表/清理 |
| GET | `/v1/files/{id}` | 元数据 |
| DELETE | `/v1/files/{id}` | 删除 |

上传需 `expires_after[anchor]=created_at`、`expires_after[seconds]=...`。文件对象至少返回：

```json
{ "id": "file_x", "type": "file", "mime_type": "image/png", "size_bytes": 1234, "created_at": "2026-10-20T00:00:00Z", "filename": "a.png" }
```

不实现也能跑：上传失败会回退 inline base64（有体积上限）。

---

## 8. 状态机与错误映射

```
initializing ──▶ waiting-browser ──▶ exchanging ──▶ committing ──▶ succeeded
      │                 │                 │              │
      └─────────────────┴─────────────────┴──────────────┴──▶ failed / expired / cancelled
```

| 触发 | 客户端状态 |
|---|---|
| init 超时 / `expires_in` 到期 | `expired` |
| 用户在浏览器取消、关闭窗口 | `cancelled`（由用户显式取消） |
| exchange 失败、信封非法 | `failed` + `protocol` |
| 401 / 40003 | `expired` |
| 网络不可达 | `failed` + `no-response` / `network` |
| 本地凭据写入失败 | `failed` + `storage` |

---

## 9. 一致性测试清单

在你的中转站上按顺序跑通：

1. `auth_init` 返回 200，信封合法，`authorize_url` 的 origin/path 正确，`expires_in > 0`。
2. 浏览器打开 `authorize_url`，登录后 302 到 `redirect_uri`，且 `state` 与 init 一致、`code` 只出现一次。
3. `auth_exchange` 用正确 verifier 成功；**重复使用同一 code 必须失败**；错误 verifier 必须失败。
4. `users/current` 带有效 token 返回用户；无 token / 错 token 返回 401 或 `40003`。
5. `get_user_summary` 返回两个数组；`get_unnotified_bonuses` 返回数组；`ack_bonus_notified` 返回成功。
6. `logout` 后，同一 token 再调 `users/current` 必须 401。
7. 所有 API 端点 **不返回 3xx**；响应体 < 64 KB。
8. 用桌面端跑完整登录：系统浏览器打开、回调、窗口关闭、账户面板显示你的用户名。
9. `GET /models` 返回非空 `data`，每个模型带 `api_capabilities.anthropic_messages`；模型选择器能看到你的模型。
10. 负例：把 40003 放进 `data.biz_code`，客户端应只报通用失败、**不**登出；放顶层 `code` 才登出。
11. 负例：把 `platformOrigin` 配成官方域名、推理仍走中转站，确认 token 不会被发到官方（应由 `inferenceOrigin` 一致性强约束）。

> 建议先写一个本地 mock（Node/Hono 或 Express），把 1–8 跑通，再让真实中转站对齐——DSH 侧不改一行代码即可切换。

---

## 10. 安全要求

- 全链路 HTTPS（除 loopback 回调）；API 端点不允许重定向。
- `state` 单次有效、与事务绑定；PKCE 强制 `S256`；code TTL ≤ 120 s。
- 不记录 `code_verifier`、`code`、`token` 明文；日志只留 `authorize_id` 与结果码。
- token 吊销要即时生效（logout/风控/改密）。
- `redirect_uri` 必须白名单校验为 loopback + `/oauth/callback`，防止开放重定向。
- 账户 token 存在客户端 `$DSH_HOME/.credentials.yaml`（0600），中转站只做校验，不要下发长期密钥到渲染进程。

---

## 11. 与官方实现的差异与待确认

| 项 | 官方行为 | 你的中转站 |
|---|---|---|
| 授权页 | `platform.deepseek.com/dsh/authorize` | 你的域名同路径 |
| 登录方式 | DeepSeek 账号 | 手机号 / 邮箱注册（中转站自有账号体系） |
| 钱包 | 真实余额 | 可返回空数组（UI 显示 0） |
| 赠送金 | 真实活动 | 返回 `[]` |
| 推理 | `api.deepseek.com` | 你的网关（已确认兼做），校验 `x-dsh-auth-token` |
| 资料页 | 真实邮箱/头像 | 至少返回 `email` 占位 |

已确认：

1. 中转站**兼推理入口**：`platformOrigin` 与 `inferenceOrigin` 都指向中转站，且必须相等。
2. 登录方式是**手机号 / 邮箱注册**，由中转站自己的账号体系承担；不需要 OIDC/OAuth2。
3. 分发范围包含自己、团队、对外：需自建更新源、签名与公证。

新增必须项（评审后）：

4. **实现 `GET /models`**（§7.4），否则自建模型不会出现在选择器。
5. **token 生命周期**（§12.2）：有效期、吊销、多设备策略；协议无 refresh。
6. 若签名构建需要一个强制更新策略服务：中转站补 `GET /api/v0/check_client_update`，否则要打补丁关闭策略（见 PLAN §9）。

仍需你定：

1. 是否保留「余额/充值」入口；不保留就返回空钱包、忽略 `/top_up`。
2. 注册/登录页的视觉与文案由谁提供（品牌工作流会复用）。
3. 完整需求清单见 [requirements.md](requirements.md)。

---

## 12. 注册、令牌生命周期与账号安全（中转站内部）

这些不经过 DSH 协议，但决定产品能否对外。建议作为中转站的验收项：

### 12.1 注册与登录

| 项 | 建议 |
|---|---|
| 注册方式 | 手机号或邮箱 + 验证码；密码可选（验证码优先，减少找回成本） |
| 验证码 | 6 位、5 分钟有效、单次使用、按手机号/IP 限流 |
| 密码（如启用） | argon2id；至少 8 位；禁止弱口令表 |
| 找回 | 邮箱/短信重置链接，单次、短 TTL |
| 锁定 | 连续失败 5 次锁 15 分钟；异常 IP 触发二次验证 |
| 防刷 | 注册/发码接口按 IP + 设备指纹限流；短信成本单独配额 |
| 协议 | 注册页展示用户协议与隐私政策，留痕同意时间 |

### 12.2 令牌

| 项 | 建议 |
|---|---|
| 格式 | 不透明随机串（≥32 字节），不使用可解析 JWT 也可 |
| 有效期 | 7–30 天；**没有 refresh**，过期即重登 |
| 吊销 | 登出、改密、封禁、风控立即失效；服务端保存可撤销记录 |
| 多设备 | 明确策略：允许并存 or 新登录踢旧；当前 DSH 单账户单 token |
| 审计 | 记录签发/吊销/失败原因，不记录 token 明文 |

### 12.3 账号切换与数据

- DSH 每个进程只有一个账户；换号 = 登出再登录。
- 切换 `platformOrigin` 会导致 issuer 不匹配，客户端视为未登录（预期行为）。
- 桌面内嵌的 `/usage`、`/top_up` 页需要注入 `window.dsh.getAuthToken`（`preload-platform-account.ts`）；不做就隐藏这两个入口。

### 12.4 文案

- `x-client-locale` 为 `zh_CN` / `en_US`；授权页与错误页按此本地化。
- 授权 URL 可能被客户端追加 `theme` 等参数，**忽略未知参数**，不要因此 400。

---

## 13. 本地实现（New API 单网关）

DSH 账户协议已合并进 `new-api-deepseek`（Go），不再运行独立 relay。`services/relay/` 只保留为参考实现和一致性测试。

| 项 | 实现 |
|---|---|
| 账户协议 | NewAPI 二开 `router/dsh-router.go` + `controller/dsh_*`；新增 `dsh_auth_transactions` 一张表 |
| 用户/令牌 | DSH 用户 = NewAPI User；DSH token = NewAPI Token.Key（每次登录新建，TTL 30 天） |
| 推理 | 直接走 NewAPI 的 `POST /v1/messages`（`x-dsh-auth-token` 由中间件翻译） |
| 模型目录 | `DSH_MODELS` 生成 DSH schema，默认 `deepseek-flash`（image）+ `deepseek-v4-pro` |
| Files | 同一网关的 `/v1/files` + `file_owners` + Messages 渠道钉死 |
| 端口 | 仅 NewAPI `127.0.0.1:13000` |

实测注意：

1. 渠道类型选 **Anthropic (14)**、Base URL `https://api.deepseek.com/anthropic` 时，NewAPI 原生透传 DeepSeek 的 Anthropic SSE；`deepseek-flash` / `deepseek-v4-pro` 直接可用。
2. 若渠道是 OpenAI 兼容类型，NewAPI 转换可能**重复发 `message_start`**；当前单网关没有 relay 的归一化，需避免用该渠道或后续在 Go 侧补 normalizer。
3. NewAPI 的 `/v1/models` 仍缺少 `api_capabilities.anthropic_messages`/`client_requirements`，DSH 使用单独的 `/models`。
4. 登录页的 CSP `form-action` 必须允许 loopback 回调（`http://127.0.0.1:*`、`http://localhost:*`）；否则浏览器会阻止表单 302，登录表现为「一直等待」。
5. 上游 401 对 DSH 请求会被映射为 502，避免 DSH 把供应商故障当成 token 失效。

完整启动步骤见 [ADR-002](adr-002-merge-relay-into-newapi.md) 和 [runbook](runbook.md)。
