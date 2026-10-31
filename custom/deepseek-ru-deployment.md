# 俄语版站点部署：deepseek-ru.org

> 部署日期：2026-10-31。与 `DSH-FA`（deepseekfa.com）、`ds.openrouters.org` 完全独立：自己的域名、自己的网关实例、自己的数据库。
> 客户端品牌与俄语界面尚未开始，见 [俄语版方案](ru-version-plan.md)。

## 身份

| 项 | 值 |
|---|---|
| 域名 | `https://deepseek-ru.org`（`www` 301 到主域） |
| DNS | Cloudflare 代理（orange cloud），A 记录指向源站 |
| 源站 IP | `104.248.155.54`（与 `ds.openrouters.org` 同机，DigitalOcean SGP1） |
| 源站证书 | Cloudflare Origin CA，SAN `deepseek-ru.org`、`*.deepseek-ru.org`，有效期至 2041-10-27 |
| Cloudflare SSL/TLS 模式 | 必须 **Full (strict)** |
| 网关容器 | `dsh-newapi-ru`，`127.0.0.1:3105 -> 3000` |
| 镜像 | `dsh/new-api-deepseek:20261031-ru`（本地构建 `0d1707b85`，见「镜像构建」） |
| 渠道 | `deepseek-anthropic`，type 14，`https://api.deepseek.com/anthropic`，模型 `deepseek-flash,deepseek-v4-pro` |
| 上游 key | DeepSeek 官方 key，存本地 `custom/credentials/deepseek-ru.org/deepseek-api-key.txt`（600），仅存在于渠道配置 |
| 数据 | `/opt/dsh-gateway-ru/data/one-api.db`（SQLite，新建空库） |
| 管理账号 | `root`；密码在服务器 `/root/dsh-admin-password-ru`（600），本地副本见凭证目录 |
| 运行目录 | `/opt/dsh-gateway-ru/`（compose + `.env` + `data/` + `downloads/`） |

## 源站

nginx 站点配置：[custom/nginx/deepseek-ru.org.conf](nginx/deepseek-ru.org.conf)，服务器上是 `/etc/nginx/conf.d/deepseek-ru.conf`。

```text
Cloudflare（边缘证书，对外 TLS）→ 104.248.155.54:443（Origin CA 证书）
  → nginx server_name deepseek-ru.org
  → 127.0.0.1:3105（dsh-newapi-ru）
```

与 `ds.openrouters.org` 的 `deepseek-proxy.conf` 的差别：独立日志（`dsh-gateway-ru.*.log`）、独立 `downloads` 目录、`client_max_body_size 100m`（Files API 上传）、SSE 关闭缓冲、900s 读超时。两套 `server` 块共存于同一台 nginx，按 `server_name` 分流。

证书与私钥：服务器 `/etc/ssl/cloudflare/deepseek-ru.org.{pem,key}`（root:root，私钥 600）；本地副本在 `custom/credentials/deepseek-ru.org/`（已被 `.gitignore` 排除，不要提交）。

## 网关实例

```text
/opt/dsh-gateway-ru/
├── docker-compose.yml   # image 20261028-langen, ports 127.0.0.1:3105:3000, ./data:/data
├── .env                 # 600，TZ/DSH_PUBLIC_ORIGIN/DSH_ALLOW_REGISTRATION/DSH_NEW_USER_QUOTA/FILE_CHANNEL_ID/SESSION_SECRET
├── data/one-api.db      # SQLite
└── downloads/           # 安装包下载目录（nginx /downloads/）
```

`.env` 关键值：

```text
TZ=Europe/Moscow
DSH_PUBLIC_ORIGIN=https://deepseek-ru.org
DSH_ALLOW_REGISTRATION=true
DSH_NEW_USER_QUOTA=1000000000
FILE_CHANNEL_ID=1
SESSION_SECRET=<openssl rand -hex 32>
```

本版本 NewAPI 二开首次启动不再自动建 `root/123456`，而是走 `/api/setup` 初始化（`constant.Setup` 为 false 时 `GET /api/setup` 返回 `root_init:false`）。本次用 `POST /api/setup` 建 `root` 并直接设置随机密码，未经过默认口令。

控制台选项已设置：`ServerAddress=https://deepseek-ru.org`、`SystemName=DeepSeek-RU`（名称是占位，正式品牌名未定）。

## 验收记录（2026-10-31）

| 检查 | 结果 |
|---|---|
| `https://deepseek-ru.org/` | 200 |
| `/console` | 200 |
| `/api/setup` | 200 |
| `/v1/models`（无效 key） | 401 |
| `/auth-api/v0/dsh/auth_init` + `/dsh/authorize` | 200，登录页正常渲染 |
| 源站证书（SNI `deepseek-ru.org`） | `*.deepseek-ru.org`、`deepseek-ru.org` |
| `https://ds.openrouters.org/api/status` | 200（同机既有站点未受影响） |
| `/downloads/` | 404（目录为空，`autoindex off`） |
| `Accept-Language: ru-RU` 的 `/dsh/authorize` | 英文页（`20261031-ru`；`20261025a` 是中文） |
| `/v1/models`（有效 key） | 200，返回 `deepseek-flash`、`deepseek-v4-pro` |
| `/v1/chat/completions`（`deepseek-flash`） | 200，返回正常补全 |
| 渠道测试 `/api/channel/test/1` | `success: true` |
| 控制台 SPA 资源 | `/assets/index-BCgzQ0rC.js`（本地构建产物） |

## 镜像构建（本地，不在服务器上构建）

首装用 `20261025a`，它早于 10-28 的兜底修复：`Accept-Language: ru-RU` 的登录页会落到**简体中文**（`dshPageLanguage` 未知语言默认 zh）。FA 生产镜像 `20261028-langen` 含该修复，但两台机器不能直连，跨网流式传镜像在中途被重置。

改为本地构建，服务器只做 `docker cp` + `docker commit` 补丁层：

```bash
# 1. 源码（new-api-deepseek HEAD = 0d1707b85，含英文兜底）
git -C ~/projects/ai/new-api-deepseek archive --format=tar.gz -o /tmp/new-api-src.tgz HEAD
mkdir -p tmp/newapi-build && tar xzf /tmp/new-api-src.tgz -C tmp/newapi-build

# 2. Web（bun 需要可写的 TMPDIR；本机沙箱只允许工作区）
cd tmp/newapi-build/web
TMPDIR=../.bun-tmp BUN_INSTALL_CACHE_DIR=../.bun-cache bun install
DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION= TMPDIR=../.bun-tmp bun run build

# 3. Go 交叉编译（产物已内嵌 web/dist）
cd .. && GOMODCACHE=$PWD/../.gomod GOCACHE=$PWD/../.gocache \
  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 GOEXPERIMENT=greenteagc \
  go build -ldflags "-s -w" -o /tmp/new-api-linux-amd64 .

# 4. 上机打补丁层（无 RUN，秒级，不占生产 CPU）
scp /tmp/new-api-linux-amd64 root@104.248.155.54:/opt/dsh-gateway-ru/
ssh root@104.248.155.54 'cd /opt/dsh-gateway-ru && docker create --name ru-patch dsh/new-api-deepseek:20261025a \
  && docker cp new-api-linux-amd64 ru-patch:/new-api \
  && docker commit ru-patch dsh/new-api-deepseek:20261031-ru && docker rm ru-patch \
  && sed -i "s#image: dsh/new-api-deepseek:.*#image: dsh/new-api-deepseek:20261031-ru#" docker-compose.yml \
  && docker compose up -d'
```

不要在 `104.248.155.54` 上跑 `docker build`：这台机器只有 2 vCPU / 4 GB，还跑着 `ds.openrouters.org` 等生产容器。2026-10-31 试过一次，构建把内存和 CPU 打满，`openrouters.org`、`beta`、`ds.openrouters.org`、`deepseek-ru.org` 全部不可用约 12 分钟，`load average` 一度到 173；靠 SSH 挤进去杀掉构建进程才恢复。构建只在本机做，服务器只做补丁层。

本地构建后先在 darwin 上冒烟（同一份源码 `GOOS=darwin GOARCH=arm64` 构建，跑在临时端口），确认 `/api/status`、SPA 资源、登录页语言兜底都正常再上传。

## 价格与模型倍率

渠道建好后模型测试报「倍率或价格未配置」。从 FA 实例（`127.0.0.1:3104`）导出 `ModelRatio`、`ModelPrice`、`CompletionRatio`、`CacheRatio`、`CreateCacheRatio`、`ImageRatio`、`AudioRatio`、`AudioCompletionRatio`、`GroupRatio`，用 `PUT /api/option/` 写入本实例。值是 JSON **文本**（不是对象），写成对象会被 `%v` 化成 `map[...]` 而报 `invalid character 'm'`。

## 待办

1. **俄语界面**：客户端 3,201 条词条（`packages/client/locale-ru`）与登录页 `ru` 分支，见 [方案 §2.2](ru-version-plan.md#22-俄语语言包不改-56-个包的源码)。
3. **桌面端**：`brand/ru-*` 品牌分支，`GATEWAY_ORIGIN=https://deepseek-ru.org`；图标暂用 DeepSeek 现有图形。
4. **安装包分发**：`/downloads/` 目录还没有产物（Windows 包 `D-03` 也未做）。
5. **源站区域**：源站在新加坡，俄语用户经 Cloudflare 回源延迟偏高（TTFT 明显）。若体验不够，再考虑欧洲节点。
6. **Cloudflare 侧**：确认 SSL 模式 Full (strict)、`Always Use HTTPS`；如需按 IP 限制回源，另配 Cloudflare 网段白名单。
7. **登录页品牌**：`/dsh/authorize` 标题仍是 “Sign in to DSH”，未带品牌名；属于客户端品牌工作。
