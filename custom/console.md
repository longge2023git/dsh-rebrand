# 迷你波斯语控制台

> 2026-11-02 上线：`https://deepseekfa.com/me/`（用量）、`https://deepseekfa.com/me/keys`（密钥）。

## 为什么不是 New API 自带控制台

自带控制台是 Semi UI 单页应用，2816 个文案键、且**没有 RTL 支持**（Semi 2.72.2 也没有波斯语 locale）。用户只需要两件事：看消耗、拿 API Key。所以另做两个静态页面，复用网关已有的会话与接口。

## 鉴权

两个条件缺一不可：

1. **会话 cookie**——和 New API 同域（apex），`credentials: 'same-origin'` 自动携带；
2. **`New-Api-User: <id>` 请求头**——`middleware/auth.go` 校验它必须等于会话用户 id，否则返回 `401 无权进行此操作，未提供 New-Api-User`。

用户 id 不在 cookie 里，从同源的 `localStorage['user']` 取（SPA 登录时写入，字段 `id`）。拿不到就显示登录提示，跳 `/login`。

## 用到的接口

| 页面 | 接口 |
|---|---|
| 用量 | `GET /api/user/self`（`quota` / `used_quota` / `request_count`）、`GET /api/log/self?p=&page_size=&type=0` |
| 密钥 | `GET /api/token/?p=1&size=100`、`POST /api/token/`、`DELETE /api/token/:id` |

金额换算：`quota / status.quota_per_unit`（当前 `quota_per_unit = 500000`）。密钥在库里不带前缀，**展示和复制时补 `sk-`**。

## 部署

```bash
# 本机先把权限改成 644，否则 rsync -a 会把 600 带上去，nginx 读不到 -> 403
chmod 644 console/me/*.html console/me/*.js console/me/*.css console/me/*.svg
rsync -az -e "ssh -o ProxyCommand='nc -X 5 -x 127.0.0.1:10808 %h %p' -i ~/.ssh/id_ed25519" \
  console/me/ root@87.107.108.14:/var/www/fa-console/me/
ssh ... 'chmod -R a+rX /var/www/fa-console'
```

nginx（`sites-available/deepseekfa.conf` 的 apex server 块，必须排在 `location /` 之前）：

```nginx
location /me/ {
    root /var/www/fa-console;
    try_files $uri $uri.html $uri/index.html =404;
    add_header Cache-Control "no-store";
}
```

## 验证方式

```bash
# 匿名态：页面能渲染出登录提示（用无头浏览器跑 JS 后再看 DOM）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --virtual-time-budget=6000 --dump-dom https://deepseekfa.com/me/ | grep -c 'برای دیدن مصرف'

# 带会话的接口形状（服务端本地跑，测试账号用完即删）
curl -b "$JAR" -H "New-Api-User: $UID" http://127.0.0.1:3104/api/user/self
```

## 已知限制

- 未做 RU 版本（同一套页面改文案即可，路由可放 `/me/` 之外的子域或前缀）
- SPA 登录页写入的 `localStorage.user` 被清掉时，即使 cookie 有效也会提示登录
- 没有"清理旧设备密钥"的入口：每次登录都会新建一枚令牌，重度用户列表会变长
- 金额显示为"اعتبار"（credits，`quota / quota_per_unit`），没有按站点货币符号换算
