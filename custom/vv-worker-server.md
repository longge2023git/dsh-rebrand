# vv-worker 服务端知识库

> 最后核对：2026-10-26。本文只记录部署事实和操作方式，不记录密码、token、私钥或数据库内容。

本页是 vv-worker 机器信息的唯一来源；`ds.openrouters.org` 是另一套部署，见 [server-deployment](server-deployment.md)。

## 1.1 入口 nginx

`vvworker.51vv.com` 由外部 nginx（`82.157.212.191`）终止 TLS 并转发到本机 `8008`；完整 server 块见 [nginx/vvworker.51vv.com.conf](nginx/vvworker.51vv.com.conf)，含 SSE 所需的关闭缓冲与 900s 超时。缺这个 vhost 时域名落到默认站点：`/` 返回 nginx 欢迎页，`/api/*`、`/dsh/*`、`/auth-api/*` 全部 404，桌面端登录会直接失败。

## 1. 基本信息

| 项目 | 值 |
|---|---|
| 业务域名 | `https://vvworker.51vv.com` |
| 外部入口 | 外部 nginx（不在 172.21.2.58 上），转发到 `172.21.2.58:8008` |
| 服务器 | `172.21.2.58` |
| 系统 | Debian GNU/Linux 12 (bookworm)，x86_64 |
| SSH | `ssh -i /Users/longge/.ssh/id_ed25519 root@172.21.2.58` |
| 部署目录 | `/opt/vvworker-gateway` |
| Compose 文件 | `/opt/vvworker-gateway/docker-compose.yml` |
| 环境变量 | `/opt/vvworker-gateway/.env`（600） |
| 数据库 | `/opt/vvworker-gateway/data/one-api.db`（600） |
| 容器 | `vvworker-newapi` |
| 镜像 | `dsh/new-api-deepseek:20261025a` |
| 监听 | `0.0.0.0:8008 -> 容器 3000` |

`172.21.2.58` 本机没有 nginx；TLS、域名和反向代理都由外部 nginx 负责。

## 2. 与 ds.openrouters.org 的关系

- `ds.openrouters.org` 是原有的独立部署，**没有被改动**。
- 本机 NewAPI 是从原部署复制出的独立库。
- 复制内容包括：上游渠道、模型倍率、注册/配额环境变量、管理配置。
- 复制后已清空旧业务用户、旧 token、旧日志和旧额度记录。
- 当前库只保留 root 管理员；之后的新注册属于 vv-worker 自己的用户。
- **不要再次整库覆盖**，否则会把 ds 的旧用户重新带回来。

当前状态以命令为准，不写死用户数量：

```bash
ssh -i /Users/longge/.ssh/id_ed25519 root@172.21.2.58
cd /opt/vvworker-gateway
python3 - <<'PY'
import sqlite3
con=sqlite3.connect('data/one-api.db')
for q in (
    'select count(*) from users',
    'select count(*) from tokens',
    'select count(*) from channels',
    'select count(*) from logs',
):
    print(q, con.execute(q).fetchone()[0])
PY
```

## 3. 运行配置

`docker-compose.yml`：

```yaml
services:
  new-api:
    image: dsh/new-api-deepseek:20261025a
    container_name: vvworker-newapi
    restart: unless-stopped
    ports:
      - "8008:3000"
    env_file: .env
    volumes:
      - ./data:/data
```

`.env` 关键项（值不含密钥）：

```text
TZ=Asia/Shanghai
DSH_PUBLIC_ORIGIN=https://vvworker.51vv.com
DSH_ALLOW_REGISTRATION=true
DSH_NEW_USER_QUOTA=1000000000
FILE_CHANNEL_ID=1
```

数据库里额外设置的公开地址：

```text
ServerAddress = https://vvworker.51vv.com
```

上游渠道：

```text
渠道：deepseek-anthropic
Base URL：https://api.deepseek.com/anthropic
模型：deepseek-flash, deepseek-v4-pro
凭证：使用 vv-worker 自己的 DeepSeek 官方 API key
```

渠道凭证只保存在目标机数据库 `channels.key`，不写进 Git/知识库。该 key 的 DeepSeek 官方计费归 key 所属账号；NewAPI 侧的用户 quota 仍按本地倍率独立计算，两边需要按月对账。

## 4. 客户端配置

`brand/vv-worker` 分支的桌面客户端：

```text
ProductName: vv-worker
AppID:       com.vv.ds.worker
Home:        ~/.vv-worker
userData:    ~/Library/Application Support/vv-worker
Gateway:     https://vvworker.51vv.com
macOS tag:   vv-worker-desktop-20261026.5
```

当前 Mac 测试包：

```text
~/Downloads/vv-worker-0.2.1-rc.2.20261026.5-mac-arm64-unsigned.dmg
SHA-256: 8b551f01131ad6c680f3801bd53043e9aaed667aaf07ad8d5169d0e20e4e19c5
```

Windows 构建版本使用 `0.2.1-rc.2.20261026.5`，步骤见 [vv-worker Windows 构建说明](vv-worker-windows-build.md)。

## 5. 模型倍率

和 `ds.openrouters.org` 当前配置一致：

| 模型 | model_ratio | completion_ratio | cache_ratio | create_cache_ratio |
|---|---:|---:|---:|---:|
| `deepseek-flash` | 0.15 | 4.0 | 0.02 | 1.0 |
| `deepseek-v4-pro` | 0.66 | 3.0 | 0.0333333333 | 1.0 |

这组值对应 DeepSeek 官方**高峰价**。官方空闲时段是高峰的一半；NewAPI 目前不会自动切换时段，所以空闲时段仍按高峰价计费。

## 6. 健康检查

本机：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8008/api/status
```

应返回 `200`。

公网：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://vvworker.51vv.com/api/status
curl -sS -o /dev/null -w '%{http_code}\n' https://vvworker.51vv.com/dsh/authorize
```

说明：

- `/api/status` 用 **GET** 检查；NewAPI 对 HEAD 可能返回 404，这不代表服务异常。
- `/dsh/authorize` 不带参数返回 400 是正常的参数校验。
- 公网 404 而本机 200，说明前置 nginx 没有 `vvworker.51vv.com` 的 vhost 或 upstream 不通，不是网关异常；配置见 [nginx/vvworker.51vv.com.conf](nginx/vvworker.51vv.com.conf)。
- NewAPI 控制台入口是 `https://vvworker.51vv.com/`。

## 7. 常用运维

```bash
cd /opt/vvworker-gateway
docker compose ps
docker compose restart
docker logs --tail 100 vvworker-newapi
```

数据库和日志都在：

```text
/opt/vvworker-gateway/data/
```

数据库包含用户、token 和请求记录，属于敏感数据；不要提交到 Git，也不要发到聊天。

## 8. 如果确实要再次清空用户

这是破坏性操作，会删除 vv-worker 已注册用户。只有在明确要重开新库时执行。

```bash
cd /opt/vvworker-gateway
docker stop vvworker-newapi
python3 - <<'PY'
import sqlite3
con=sqlite3.connect('data/one-api.db')
con.execute('begin immediate')
for table in (
    'tokens','logs','quota_data','dsh_auth_transactions','file_owners',
    'checkins','redemptions','top_ups','subscription_orders','subscription_plans',
    'subscription_pre_consume_records','user_subscriptions','user_oauth_bindings',
    'two_fa_backup_codes','two_fas','passkey_credentials','midjourneys','tasks',
):
    con.execute(f'delete from "{table}"')
con.execute('delete from users where id <> 1')
con.commit()
PY
docker start vvworker-newapi
```

保留 root（`id=1`）是为了还能进入 NewAPI 管理后台；它不是业务用户。

## 9. 故障排查顺序

1. `docker compose ps` 看容器是否 `Up`。
2. `curl http://127.0.0.1:8008/api/status` 看本机是否正常。
3. `curl https://vvworker.51vv.com/api/status` 看外部 nginx 是否转发到 8008。
4. 如果本机 200、公网 404/502，检查外部 nginx 的 upstream 是否为 `172.21.2.58:8008`，以及服务器安全组是否放行该端口。
5. 如果公网 200 但客户端登录失败，检查客户端 profile 的 `platformOrigin`、`inferenceOrigin`、`baseURL` 是否都是 `https://vvworker.51vv.com`。
6. 如果登录页能打开但注册失败，检查 `DSH_ALLOW_REGISTRATION=true`、数据库是否可写、容器日志。
7. 如果模型请求失败，先看数据库里的上游渠道和模型倍率，再用一个有效 token 直接请求 `/v1/messages` 验证，不要只看 UI 报错。
