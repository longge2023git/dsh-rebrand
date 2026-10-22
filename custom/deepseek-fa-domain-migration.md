# 待办：网关域名切换到 deepseek-fa.org

> 状态：**未执行**。证书已收到，线上仍是 `https://ds.openrouters.org`。
> 关联 Issue：https://github.com/longge2023git/dsh-rebrand/issues/13

## 目标

把 DSH 网关的公开域名从：

```text
https://ds.openrouters.org
```

切换到：

```text
https://deepseek-fa.org
```

## 证书

Cloudflare Origin 证书已确认：

```text
SAN: *.deepseek-fa.org, deepseek-fa.org
有效期: 2026-10-22 → 2041-10-18
```

本机保存位置（仓库外、600 权限）：

```text
~/.secrets/deepseek-fa.org/origin.pem
~/.secrets/deepseek-fa.org/origin.key
```

**私钥不得提交到 git，也不要在聊天/日志里再次输出。**

## 切换前

- [ ] Cloudflare DNS `deepseek-fa.org` / `www` 已指向 origin，代理开启，SSL/TLS 模式 Full (strict)
- [ ] 在服务器安装证书：
  ```bash
  install -m 600 origin.pem /etc/ssl/cloudflare/deepseek-fa.pem
  install -m 600 origin.key /etc/ssl/cloudflare/deepseek-fa.key
  ```
- [ ] 备份现有 nginx 配置和 NewAPI `.env`
- [ ] 确认服务器 3104 容器健康

## 切换步骤

1. nginx 新增 `deepseek-fa.org` / `www.deepseek-fa.org` server block，反代 `127.0.0.1:3104`，沿用 streaming/100m 配置；先用：
   ```bash
   curl -k --resolve deepseek-fa.org:443:127.0.0.1 https://deepseek-fa.org/api/status
   ```
   验证，不动旧 ds 站点。
2. NewAPI `.env`：
   ```text
   DSH_PUBLIC_ORIGIN=https://deepseek-fa.org
   ```
   重启 `dsh-newapi`。
3. 新域名完整 E2E：注册、PKCE、`/models`、SSE、`/v1/files`、file_id、Gateway API Key、logout。
4. 本仓库：
   - `custom/profiles/server-gateway.patch.yml` 的 platform/inference/baseURL 改成新域名；
   - `~/.dsh-dev/profiles/desktop/cordis.patch.yml` 同步；
   - `packages/bundle/base/cordis.patch.yml` 的 `llm-deepseek-gateway.baseURL` 改成新域名；
   - 重建客户端 artifacts。
5. 切换后，旧 `ds.openrouters.org` 可：
   - 保留 301 到新域名；或
   - 并行一段时间，确认客户端都迁完再停。
6. 旧 DSH token 的 issuer 是旧域名，切换后必须重新登录；账号/额度/文件仍在同一 DB，不受影响。

## 回滚

- nginx 恢复旧 ds server block；
- NewAPI `.env` 的 `DSH_PUBLIC_ORIGIN` 改回旧域名并重启；
- DSH profile 改回旧域名；
- 证书/新 server block 可保留不启用。

## 注意

- Cloudflare Origin 证书只用于 origin，不代表公网信任链；Cloudflare 侧 SSL 需 Full (strict)。
- 切换 window 内旧域名仍可用，但 token issuer 不同，用户需要重新登录一次。
- 私钥只放 `~/.secrets` 和服务器 `/etc/ssl/cloudflare`，权限 600。
