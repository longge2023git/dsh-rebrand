# 运维手册（本地开发 / 联调）

> 记录这套环境怎么起、怎么停、换网络怎么办、以及常见故障。机器相关的 IP 不写死，命令里用 `$(ipconfig getifaddr en0)` 取。

## 1. 术语

| 词 | 含义 |
|---|---|
| `origin` | **你的** GitHub 仓库 `longge2023git/dsh-rebrand` |
| `upstream` | **官方**仓库 `github.com/deepseek-ai/deepseek-harness`，只用于 `fetch` 同步 |
| 上游（中转站语境） | 模型提供方，即 DeepSeek 官方 Anthropic API，不是 git 账号 |
| NewAPI | 唯一网关：DSH 账户协议、模型渠道、Files、配额、日志 |
| relay | `services/relay/`，已合并进 NewAPI，仅保留为协议参考/一致性测试，不再启动 |

## 1.1 当前生产入口（2026-10-22 起）

DSH 本地测试已切到：

```text
DSH ──▶ https://ds.openrouters.org ──▶ NewAPI 容器 :3104 ──▶ api.deepseek.com/anthropic
```

服务器 `104.248.155.54`，部署细节见 [server-deployment](server-deployment.md)。下面第 2 节起的本地 13000 流程仅作为回退/离线联调。

## 2. 拓扑与端口

```
DSH 桌面/Web ──▶ https://ds.openrouters.org（生产）
               或 127.0.0.1:13000（本地回退）
                         ▲
       宿主代理转发 0.0.0.0:10810 ──▶ 127.0.0.1:10808
```

| 端口 | 服务 |
|---|---|
| 13000 | NewAPI 网关（DSH 登录、模型、Files、控制台） |
| 10810 | 宿主代理转发（容器出网用） |
| 3080 | DSH Web 测试实例（可选） |
| 9222 / 9229 / 9230 | 桌面开发壳的 renderer/main/host 调试端口 |

## 3. 启动顺序

```bash
# 1) 宿主代理转发（容器无法访问宿主 127.0.0.1）
#    compose 文件仍放在 services/relay/，但默认只启动 new-api。
cd services/relay
node tools/host-proxy.mjs 10810 10808 0.0.0.0

# 2) NewAPI（代理使用 Docker host-gateway，不再写死 Wi-Fi IP）
# .env: HTTP_PROXY=http://host.docker.internal:10810
#      HTTPS_PROXY=http://host.docker.internal:10810
# compose 已声明 extra_hosts: host.docker.internal:host-gateway
docker compose up -d new-api

# 3) DSH Web（可选；直连 NewAPI）
cd ../..
DSH_HOME=$HOME/.dsh-dev pnpm dsh --profile web \
  --patch custom/profiles/server-gateway.patch.yml --no-open

# 4) 桌面开发壳
mkdir -p ~/.dsh-dev/profiles
[ -d ~/.dsh-dev/profiles/desktop ] || cp -R ~/.dsh/profiles/desktop ~/.dsh-dev/profiles/desktop
cat custom/profiles/server-gateway.patch.yml >> ~/.dsh-dev/profiles/desktop/cordis.patch.yml
env -u ELECTRON_RUN_AS_NODE DSH_HOME=$HOME/.dsh-dev pnpm dev:desktop
# 之后可跳过构建：pnpm start:desktop
```

## 3.1 用网关 API Key（不登录账号）

登录弹窗 / 未登录页选择 **使用网关 API Key**，粘贴 NewAPI 控制台创建的 `sk-...`。baseURL 由 `deepseek-gateway` provider 固定为 `http://127.0.0.1:13000`；不用邮箱密码。

模型菜单选择 `DSH Gateway` 下的 `DeepSeek-V4.1-Flash` / `DeepSeek-V4-Pro`。key 存于 `$DSH_HOME/.credentials.yaml` 的 `DSH_GATEWAY_API_KEY`。

账号页的“查询用量 / 前往开放平台查看”指向 `https://ds.openrouters.org/console/log`，“充值”指向 `https://ds.openrouters.org/console/topup`；用注册邮箱和密码登录 NewAPI 控制台即可查看。

官方 `Add API Key` 入口在发版前仍保留；发版时移除（见 [gateway-api-key-plan](gateway-api-key-plan.md) 第二步）。

## 4. 换网络后的恢复

症状：DSH 报 `DeepSeek Messages transport failed`，或 NewAPI 日志出现 `proxyconnect ... connection refused`。

```bash
cd services/relay
# .env 固定使用 http://host.docker.internal:10810；compose 已加 host-gateway
docker compose up -d --force-recreate new-api
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:13000/api/status
```

如果容器仍报 `lookup host.docker.internal ... server misbehaving`，确认 compose 的 `extra_hosts: host.docker.internal:host-gateway` 已生效；不要在 `.env` 里写宿主 Wi-Fi IP。

`host-proxy.mjs` 绑 `0.0.0.0`；容器通过 `host.docker.internal` 访问宿主，不再依赖当前 Wi-Fi IP。

## 5. 验证命令

```bash
# NewAPI 二开单测/构建
(cd ../new-api-deepseek && go test ./... -count=1 && go build ./...)

# 仓库类型检查
pnpm run typecheck

# 真实模型（经 NewAPI）
curl -sN http://127.0.0.1:13000/v1/messages \
  -H "Authorization: Bearer $NEWAPI_TOKEN" \
  -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' \
  -d '{"model":"deepseek-flash","max_tokens":16,"stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

已验证（2026-10-21，单网关）：

- NewAPI 二开 `go build ./...`、`go test ./... -count=1` 全绿；
- 独立测试：注册/PKCE、重复邮箱、code 重放、多设备 token 隔离、跨用户文件隔离、`/models`、SSE 单次 start/stop、logout 401；
- DSH Web 直连 13000：登录、文本、图片附件均通过；日志 `/v1/files 200` + `/v1/messages 200`；
- 上游 401→502、file_id 自动补 beta 已验证；
- git 中无 API key。

## 6. 停止

```bash
# 桌面/网页
# Ctrl+C 对应终端；或 kill 对应端口进程

# NewAPI
cd services/relay && docker compose down

# 代理转发
kill $(lsof -tiTCP:10810 -sTCP:LISTEN)
```

## 7. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| `ELECTRON_RUN_AS_NODE` / `bad option: --remote-debugging-port` | shell 里把 Electron 当 Node | `env -u ELECTRON_RUN_AS_NODE ...` |
| 登录页一直 Waiting | CSP 拦了表单 302 | 确认 NewAPI `/dsh/authorize` CSP 允许 loopback `form-action` |
| `profile "desktop" ... managed exclusively` | 用 CLI 检查桌面 profile | 看 Electron 宿主日志，别用 `--dump-config` |
| 桌面能登录不能对话 | 模型目录有、推理端不通 | 查 NewAPI 容器代理与上游渠道 |
| 登录后模型列表为空 | NewAPI 渠道模型没有 `anthropic_messages` 能力或 `DSH_MODELS` 未配 | 查 `/models` 响应与渠道类型 |

更细的排查见 [ADR-002](adr-002-merge-relay-into-newapi.md) 和 [services/relay/README.md](../services/relay/README.md)（仅参考实现）。
