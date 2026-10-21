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

## 2. 拓扑与端口

```
DSH 桌面/Web ──▶ NewAPI 127.0.0.1:13000 ──▶ api.deepseek.com/anthropic
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

# 2) NewAPI（先确保 .env 的 HTTP_PROXY/HTTPS_PROXY 指向当前宿主 IP）
IP=$(ipconfig getifaddr en0)
# 编辑 .env: HTTP_PROXY=http://$IP:10810  HTTPS_PROXY=http://$IP:10810
docker compose up -d new-api

# 3) DSH Web（可选；直连 NewAPI）
cd ../..
DSH_HOME=$HOME/.dsh-dev pnpm dsh --profile web \
  --patch custom/profiles/local-gateway.patch.yml --no-open

# 4) 桌面开发壳
mkdir -p ~/.dsh-dev/profiles
[ -d ~/.dsh-dev/profiles/desktop ] || cp -R ~/.dsh/profiles/desktop ~/.dsh-dev/profiles/desktop
cat custom/profiles/local-gateway.patch.yml >> ~/.dsh-dev/profiles/desktop/cordis.patch.yml
env -u ELECTRON_RUN_AS_NODE DSH_HOME=$HOME/.dsh-dev pnpm dev:desktop
# 之后可跳过构建：pnpm start:desktop
```

## 4. 换网络后的恢复

症状：DSH 报 `DeepSeek Messages transport failed`，或 NewAPI 日志出现 `proxyconnect ... connection refused`。

```bash
IP=$(ipconfig getifaddr en0)
cd services/relay
# 把 .env 的 HTTP_PROXY/HTTPS_PROXY 改成 http://$IP:10810
docker compose up -d --force-recreate new-api
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:13000/api/status
```

如果 IP 在多个网卡之间来回切，检查 `ipconfig getifaddr en0` 后再重建；`host-proxy.mjs` 绑 `0.0.0.0` 可以跟随当前地址，但容器里的代理 URL 仍是固定值，必须更新。

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
