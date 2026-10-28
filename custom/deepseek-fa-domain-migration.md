# 已完成：网关域名切换到 deepseekfa.com

> 执行日期：2026-10-28。服务端与仓库配置已切换；桌面端需重新打包才生效。

## 目标

把 DSH 网关的公开域名从：

```text
https://ds.openrouters.org
```

切换到：

```text
https://deepseekfa.com
```

**旧方案 `deepseek-fa.org` 作废**：那个域名没有投入使用（Cloudflare Origin 证书是 `*.deepseek-fa.org` 的，对当前域名无效，`~/.secrets/deepseek-fa.org/` 可以删除）。当前实际使用的是 `deepseekfa.com`（ArvanCloud NS，A 记录直连，未走 CDN 代理）。

## 服务端（已完成）

| 项 | 值 |
|---|---|
| 机器 | `87.107.108.14`（`vm40239-60020.mobinhost.com`） |
| 网关容器 | `dsh-newapi`，`127.0.0.1:3104`，镜像 `dsh/new-api-deepseek:20261025a` |
| nginx | `/etc/nginx/sites-available/deepseekfa.conf`，关闭 buffering、600s 超时、64m body |
| 证书 | Let's Encrypt `deepseekfa.com` + `www`，`certbot.timer` 自动续期 |
| NewAPI | `DSH_PUBLIC_ORIGIN=https://deepseekfa.com` |

验收结果：`/` 200（`New API`）、`/api/status` 200、静态资源 200、`/v1/models` 无效 key → 401、HTTP → HTTPS 301、`www` 301 到主域。

## 仓库（已完成，分支 `brand/deepseekfa`）

改到 `https://deepseekfa.com` 的位置：

- `apps/desktop/config/brand.mjs` 的 `GATEWAY_ORIGIN`
- `apps/desktop/src/brand.ts` 的 `DESKTOP_PROFILE_PATCH`（`platformOrigin` / `inferenceOrigin` / `baseURL`）
- `packages/bundle/base/cordis.patch.yml` 的 `llm-deepseek-gateway.baseURL`（Web 端同源）
- `custom/profiles/server-gateway.patch.yml`（联调 profile）

## 待办

- [x] 重新打包桌面端 → `deepseek-fa-0.2.1-rc.2.20261028.1-mac-arm64-unsigned.dmg`（验证：asar 内 `deepseekfa.com` 命中 4 处、旧域名 0 处）
- [ ] **老用户迁移**：首次启动只在 `~/.deepseek-fa/profiles/desktop/cordis.patch.yml` 不存在时写入，已装用户升级后仍连旧域名；需要迁移逻辑或引导用户删除该文件
- [ ] 决定 `ds.openrouters.org` 的去向（继续并行 / 301 / 停用）；注意两套库自 2026-10-28 起各自写入
- [ ] 下载目录：新机器还没建 `/downloads/`，Windows/macOS 安装包要另行放置（旧地址 `https://ds.openrouters.org/downloads/` 不受影响）

## 回滚

1. 仓库把上面 4 个文件改回 `https://ds.openrouters.org`，重新打包；
2. 服务端 `DSH_PUBLIC_ORIGIN` 改回旧域名并 `docker compose up -d`；
3. nginx 保留新旧两个 server block，按需停用其一。

## 注意

- 切换域名会改变登录 token 的 issuer，已登录用户需要重新登录一次；账号、额度、文件仍在同一份 SQLite 里。
- 新机器用的是 Let's Encrypt，不是 Cloudflare Origin 证书；如果之后把域名接入 CDN 代理，证书策略需要重新确认。
