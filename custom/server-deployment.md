# 生产部署

> 部署日期：2026-10-22；2026-10-28 迁移到新机器。本文不含密码/密钥。

## 当前生产：deepseekfa.com

2026-10-28 起，对外网关是 `https://deepseekfa.com`（伊朗 KVM，更贴近目标用户）。

| 项 | 值 |
|---|---|
| IP | `87.107.108.14` |
| hostname | `vm40239-60020.mobinhost.com` |
| 系统 | Ubuntu 22.04.1 LTS / x86_64 / KVM |
| 入口 | ArvanCloud DNS → nginx 443 → NewAPI `127.0.0.1:3104`（容器 `dsh-newapi`） |
| 域名 | `https://deepseekfa.com`、`https://www.deepseekfa.com`（301 到主域） |
| 证书 | Let's Encrypt，`/etc/letsencrypt/live/deepseekfa.com/`，`certbot.timer` 自动续期 |
| 防火墙 | ufw 仅放行 22/80/443；fail2ban `sshd` jail 生效 |
| 备份 | 每日 03:30 备份 SQLite 到 `/var/backups/dsh-newapi/`，保留 7 天 |
| 运行目录 | `/opt/dsh-gateway/`（compose + `.env` + `data/one-api.db`） |
| 镜像 | `dsh/new-api-deepseek:20261025a`（与原生产同一个） |

迁移只换了机器与域名，**数据库（用户/令牌/渠道/日志）原样复制**；`DSH_PUBLIC_ORIGIN` 已改为 `https://deepseekfa.com`。

迁移后的验收：`/` 200、`/api/status` 200、静态资源 200、`/v1/models` 无效 key → 401、HTTP → HTTPS 301。

### 迁移做法（2026-10-28，可复现）

1. 源机打包（排除历史镜像归档）：
   ```bash
   tar czf /tmp/dsh-migrate.tgz -C /opt --exclude='dsh-gateway/image-*.tar.gz' --exclude='dsh-gateway/downloads' dsh-gateway
   ```
2. 镜像用 `/opt/dsh-gateway/image-20261025a.tar.gz`；两包都经本地中转（伊朗线路约 1.6 Mbps，123 MB 约 10 分钟）。
3. 目标机：解包到 `/opt`、`docker load -i`、`.env` 改 `DSH_PUBLIC_ORIGIN=https://deepseekfa.com`、`docker compose up -d`。
4. nginx 反代 `127.0.0.1:3104`（流式关闭 buffering、600s 超时、64m body），配置已入库：[custom/nginx/deepseekfa.com.conf](nginx/deepseekfa.com.conf)；`certbot --nginx -d deepseekfa.com -d www.deepseekfa.com` 签 Let's Encrypt（本机 DNS 不经 CDN，HTTP-01 直接通过）。
5. 加固：`ufw` 只放 22/80/443、`fail2ban` sshd jail、sshd 关密码登录（`/etc/ssh/sshd_config.d/00-hardening.conf`）、2 GB swap。
6. 备份：`/usr/local/bin/dsh-db-backup.sh` + `/etc/cron.d/dsh-backup`，每日 03:30，保留 7 天，用 `sqlite3.backup` 热备。

### 语言兜底（2026-10-28）

非中文/英文浏览器此前落到简体中文。已改为英文兜底：登录页 `dshPageLanguage` 默认 `en`、控制台 i18next `fallbackLng: 'en'`、semi-ui locale 非 `zh-*` 走 `en_GB`。新镜像 `20261028-langen` 由本地原生编 web + 交叉编译 Go（`GOOS=linux GOARCH=amd64 GOEXPERIMENT=greenteagc`）后，在服务器上用 `FROM 20261025a` 打补丁层生成（QEMU 下 bun 因缺 AVX 会崩，不能本机跑 `docker build`）。

> 域名 `deepseek-fa.org` 的旧方案作废，见 [域名迁移](deepseek-fa-domain-migration.md)。

## 旧生产：ds.openrouters.org（仍在线，与上图并行）

下面各节描述的是 2026-10-22 那套部署，机器与域名都不同；两套实例各自写自己的 SQLite，**数据从 2026-10-28 起分叉**，切换或下线前先确认。

## 服务器

| 项 | 值 |
|---|---|
| IP | `104.248.155.54` |
| hostname | `ubuntu-s-2vcpu-4gb-sgp1-hub` |
| 系统 | Ubuntu 24.04 / x86_64 |
| 入口 | Cloudflare → nginx 443 → NewAPI `127.0.0.1:3104` |
| 域名 | `https://ds.openrouters.org` |

SSH：`ssh root@104.248.155.54`（需要已授权的 key）。

## 运行单元

```text
/opt/dsh-gateway/
├── docker-compose.yml
├── .env                  # 600，含 SESSION_SECRET/DSH_* 配置
├── image.tar.gz          # amd64 镜像归档（可删）
└── data/one-api.db       # SQLite
```

- 容器：`dsh-newapi`
- 镜像：`dsh/new-api-deepseek:20261025a`
- 端口：`127.0.0.1:3104 -> 3000`
- 重启策略：`unless-stopped`
- 数据：SQLite `/opt/dsh-gateway/data/one-api.db`
- 渠道：`deepseek-anthropic`（Anthropic 14，`https://api.deepseek.com/anthropic`）
- 管理员：`root`；密码在服务器 `/root/dsh-admin-password`（600），首次登录后请修改
- 初始数据库只保留 root + 渠道；测试用户/token 已清理

环境变量（`.env`）：

```text
DSH_PUBLIC_ORIGIN=https://ds.openrouters.org
DSH_ALLOW_REGISTRATION=true
DSH_NEW_USER_QUOTA=1000000000
FILE_CHANNEL_ID=1
SESSION_SECRET=<random>
```

## nginx

- 配置：`/etc/nginx/conf.d/deepseek-proxy.conf`
- 旧透明代理备份：`/root/dsh-nginx-deepseek-proxy.conf.bak-20261022`
- 新配置：`proxy_pass http://127.0.0.1:3104`，关闭 buffering，900s 超时，100m body
- 证书：`/etc/ssl/cloudflare/origin.pem`（原有 CF Origin 证书）
- 日志：`/var/log/nginx/dsh-gateway.access.log` / `.error.log`
- 旧 `ds` 直连 DeepSeek 的透明代理已停用（配置已替换，没有独立进程）

> 旧 llmgates / demo / beta / acme / hub 等容器和 nginx server block 均未修改。

## 部署步骤（可复现）

```bash
# 本地 amd64 构建
cd /Users/longge/projects/ai/new-api-deepseek
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o /tmp/newapi-image/new-api .
cd /tmp/newapi-image && docker build --platform linux/amd64 -t dsh/new-api-deepseek:20261025a .
docker save dsh/new-api-deepseek:20261025a | gzip > /tmp/dsh-newapi-image.tar.gz

# 服务器
ssh root@104.248.155.54 'mkdir -p /opt/dsh-gateway/data'
scp /tmp/dsh-newapi-image.tar.gz root@104.248.155.54:/opt/dsh-gateway/image.tar.gz
# 复制清理后的 one-api.db 到 /opt/dsh-gateway/data/one-api.db
ssh root@104.248.155.54 'cd /opt/dsh-gateway && docker load -i image.tar.gz && docker compose up -d'
```

## 账号页用量/充值链接

DSH 的 `deepseek-account-platform` 新增可配置路径，生产 profile 使用：

```yaml
usagePath: /console/log
topUpPath: /console/topup
```

因此：

- “前往开放平台查看” / “查询用量” → `https://ds.openrouters.org/console/log`
- “充值” → `https://ds.openrouters.org/console/topup`

用户用注册邮箱/密码登录 NewAPI 控制台后即可看到自己的 token、额度、用量和充值页；不再跳 DeepSeek 官方平台。官方 provider 的默认路径仍是 `/usage`、`/top_up`。

`/dsh/authorized` 授权完成页的“用量/充值”也已直接指向 `/console/log`、`/console/topup`；旧 `/usage`、`/top_up` 兼容入口会 302 到对应控制台页面（镜像 `20261022c`）。

`/dsh/authorize` 登录成功时会同步建立同源 NewAPI 控制台 session cookie，因此浏览器点“用量”不再二次登录；启用 2FA 的账号会跳过这个快捷会话，仍按控制台 2FA 登录。

DSH 登录/注册页支持中英文：优先 `?lang=en|zh`，其次浏览器 `Accept-Language`，默认中文。注册页新增“确认密码”，服务端校验两次输入一致。

额度不足现在返回 HTTP 402（此前 403 会被 DSH 归类为 AUTH，误显示为 `API key is invalid`）。DSH 已按 402 映射为 `QUOTA`，客户端不需要改。

## DeepSeek 官方计费倍率

按 DeepSeek 官方价格（2026-10-26）配置 NewAPI：

| 模型 | 输入峰值（缓存未命中） | completion ratio | cache ratio |
|---|---:|---:|---:|
| `deepseek-flash` | $0.30 / 1M | 4.0 | 0.02 |
| `deepseek-v4-pro` | $1.32 / 1M | 3.0 | 0.0333333333 |

NewAPI 的 `model_ratio` 换算：

```text
deepseek-flash:  0.15
deepseek-v4-pro: 0.66
```

官方还有高峰/空闲价：空闲时段是高峰的一半。NewAPI 当前是静态倍率，所以配置采用**高峰价**，避免低估；如果希望空闲时段按半价，需要再切换 `ModelRatio`（或做定时切换）。

官方价格来源：
- https://api-docs.deepseek.com/quick_start/pricing/
- https://api-docs.deepseek.com/zh-cn/quick_start/pricing/

旧倍率 `37.5` + `cache_ratio 1.0` 已替换；修改前的历史账单不会自动重算。

## Windows 安装包下载目录

- 服务器目录：`/opt/dsh-gateway/downloads/`
- 公网路径：`https://ds.openrouters.org/downloads/<文件名>`
- nginx：在 `deepseek-proxy.conf` 中增加只读 `location /downloads/`
- 配置备份：`/root/dsh-nginx-deepseek-proxy.conf.bak-downloads-20261024`
- 该路径只读，不支持上传；安装包通过 scp 上传
- 上传/下载不需要重启 NewAPI 容器

## 验收（2026-10-22）

- `https://ds.openrouters.org/api/status` → 200
- 远端完整协议 E2E（注册、PKCE、exchange、current/summary/bonuses、`/models`、SSE 单 start/stop、`/v1/files`、file_id 消息、logout、code 重放）全 PASS
- 本地 DSH 通过 `server-gateway.patch.yml` 指向 server；登录/注册页由 server 提供
- Gateway API Key 模式：baseURL 已改为 `https://ds.openrouters.org`，实测文本与图片 PASS（NewAPI 日志 `/v1/messages`、`/v1/files` 200）
- 新用户默认额度 1e9；`deepseek-flash` 支持图片

## 回滚

```bash
# 恢复旧 ds 透明代理
ssh root@104.248.155.54
cp /root/dsh-nginx-deepseek-proxy.conf.bak-20261022 /etc/nginx/conf.d/deepseek-proxy.conf
nginx -t && systemctl reload nginx

# 停新网关（不影响其它站点）
cd /opt/dsh-gateway && docker compose down
```

## 本地测试切换

```bash
cd ~/projects/ai/deepseek_rebuild
DSH_HOME=$HOME/.dsh-dev pnpm dsh --profile web \
  --patch custom/profiles/server-gateway.patch.yml --no-open
```

桌面 profile `~/.dsh-dev/profiles/desktop/cordis.patch.yml` 已同步到 `https://ds.openrouters.org`。

本地 13000 Docker 仅保留为回退，不再作为测试入口。
