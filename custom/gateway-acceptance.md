# 单网关验收记录（2026-10-21）

## 结论

relay 已合并进 NewAPI，DSH 直接连 `127.0.0.1:13000`；独立测试 10 项全部 PASS，无 P0。

- 网关：`new-api-deepseek` main `e2c7907d9`（合并 commit `f01087a21`，协议实现 `b96c7945e`）
- DSH 配置：`custom/profiles/server-gateway.patch.yml`；桌面 profile 已同步到 `~/.dsh-dev/profiles/desktop/cordis.patch.yml`
- relay：`services/relay/` 仅保留为参考实现/一致性测试，18082 不再监听

## 验收矩阵

| # | 场景 | 结果 | 证据 |
|---|---|---|---|
| 1 | 注册 → PKCE → exchange → current | PASS | 新用户可登录；重复邮箱 409；code 重放 400；错误 verifier 400 |
| 2 | 多设备 token 隔离 | PASS | 两次登录 token 不同；logout A 后 A=401、B=200；重复 logout=200 |
| 3 | 跨用户文件隔离 | PASS | B 对 A 文件 GET/DELETE 404；B 列表为空；B 用 A 的 file_id 发 Messages=404 |
| 4 | `/models` | PASS | 528B；含 `api_capabilities.anthropic_messages`；deepseek-flash 含 image；无 token 401 |
| 5 | `/v1/messages` | PASS | 非流式 200；SSE `message_start=1`、`message_stop=1`；带 file_id 200 |
| 6 | 上游 401 语义 | PASS | 真实 Relay 链路：带 `x-dsh-auth-token` 返回 502；普通 `Authorization` 仍 401 |
| 7 | 登录页安全 | PASS | CSP `form-action` 含 loopback；`Cache-Control: no-store`；`X-Frame-Options: DENY`；错误密码 400 HTML 不跳转 |
| 8 | DSH UI 文本+图片 | PASS | 独立测试：`UITESTOK` 与 `Blue`；截图 `/tmp/independent-dsh.png`；`/v1/files 200`、`/v1/messages 200` |
| 9 | 日志健康 | PASS | 5xx=0 |
| 10 | logout 后旧 token | PASS | `/v1/messages` 返回 401，不是 200/500 |

补充：

- `go build ./...`、`go test ./... -count=1` 全绿；
- 带 `file_id` 的 Messages **不带** `anthropic-beta` 也返回 200（`FileChannelPin` 自动注入）；
- DSH Web 直连 13000 的文本与图片均通过；网关日志有 `POST /v1/files 200` + `POST /v1/messages 200`。

## 桌面端补测（2026-10-21）

- 启动 `pnpm start:desktop`，桌面壳正常连到 13000；与 Web 共用登录态。
- 新建会话发送 `Reply with exactly: DESKTOMGW`：1 秒完成，回复 `DESKTOMGW`，PASS。
- 图片附件：macOS 原生文件选择器无法被 Playwright/CDP 注入（`setInputFiles`、CDP `DOM.setFileInputFiles`、drag/drop、剪贴板粘贴均未触发附件），因此桌面图片路径**未完成自动化验证**，需手工点一次“添加文件 → 文件 → blue.png”。
- Web 端图片附件已 PASS，桌面与 Web 共用同一 composer/attachment 实现，但不要把桌面图片记为已验证。

## 额度不足错误语义（2026-10-25）

- NewAPI 对用户/订阅额度不足返回 HTTP 402；
- 0 额度实测返回 402，补回额度后同一 token 返回 200；
- DSH 将 402 归类为 `QUOTA`，不再误报 `API key is invalid`；
- 这是网关协议适配，不需要改 DSH 客户端。

## 登录页中英文与确认密码（2026-10-24）

- 注册页新增确认密码，服务端校验一致；
- 登录/注册/错误/授权完成页支持 `lang=en` 与 `Accept-Language: en`；
- 中文默认不变；
- 生产验证：英文注册页 200、密码不一致 400 "Passwords do not match"、中文默认页正常。

## 生产部署补测（2026-10-22）

- `https://ds.openrouters.org/api/status` 200；
- 远端完整 E2E（注册/PKCE/models/SSE/files/file_id/logout）全 PASS；
- 本地 DSH 通过 server 登录页注册并成功（服务器日志有 `/api/...`、`/v1/messages`）；
- Gateway API Key 模式 baseURL 改为 `https://ds.openrouters.org`，文本与图片 PASS；
- 旧 `ds` 透明代理配置已备份并替换，其它站点未动。

## 已知限制（非 P0）

1. 旧 relay token 不迁移；合并后首次需要重新登录一次。
2. Email 非唯一索引；单实例注册用事务 + 互斥锁，多实例并发仍可能重复。
3. `DSH_MODELS.upstream` 只解析不参与模型改写；上游模型名不同请在 NewAPI 渠道配置模型映射。
4. 当前只验证 Anthropic 原生渠道（DeepSeek）；OpenAI 兼容渠道的 `message_start` 归一化未在 Go 侧实现。
5. `SESSION_SECRET` 生产必须固定；`DSH_PUBLIC_ORIGIN` 生产必须是 HTTPS 对外 origin。
6. 文件列表分页做了简化（只返回当前用户可见项，`has_more=false`）。
7. 桌面端配置已同步，但本轮自动化只覆盖 DSH Web；桌面建议手工复测一次。

## 启动

```bash
# 宿主代理（容器出网）
cd services/relay && node tools/host-proxy.mjs 10810 10808 0.0.0.0

# NewAPI 单网关
cd services/relay && docker compose up -d new-api

# DSH Web
cd ../..
DSH_HOME=$HOME/.dsh-dev pnpm dsh --profile web \
  --patch custom/profiles/server-gateway.patch.yml --no-open
```

更细的决策见 [ADR-002](adr-002-merge-relay-into-newapi.md)，运维见 [runbook](runbook.md)。
