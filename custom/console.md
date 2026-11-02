# 迷你波斯语控制台

> 2026-11-02 上线：`https://deepseekfa.com/me/login`（登录）、`/me/register`（注册）、`/me/`（用量）、`/me/keys`（密钥）。

官网 `www.deepseekfa.com` 的「ورود / ثبت‌نام」入口直接指向这两页，**不经过 New API 的 Semi SPA**（那套要加载 7 MB bundle，且没有波斯语与 RTL）。

## 为什么不是 New API 自带控制台

自带控制台是 Semi UI 单页应用，2816 个文案键、且**没有 RTL 支持**（Semi 2.72.2 也没有波斯语 locale）。用户只需要两件事：看消耗、拿 API Key。所以另做两个静态页面，复用网关已有的会话与接口。

## 鉴权

两个条件缺一不可：

1. **会话 cookie**——和 New API 同域（apex），`credentials: 'same-origin'` 自动携带；
2. **`New-Api-User: <id>` 请求头**——`middleware/auth.go` 校验它必须等于会话用户 id，否则返回 `401 无权进行此操作，未提供 New-Api-User`。

用户 id 不在 cookie 里，从同源的 `localStorage['user']` 取（SPA 登录时写入，字段 `id`）。拿不到就显示登录提示，跳 `/login`。

## 登录与注册

| 页面 | 调用的接口 | 成功后 |
|---|---|---|
| `/me/login` | `POST /api/user/login` `{username, password}` | 写入 `localStorage.user`（响应的 `data` 含 id/username），跳 `?next=` 或 `/me/` |
| `/me/register` | `POST /api/user/register` `{username, password}` → 再 `POST /api/user/login` | 自动登录，跳 `/me/keys` |

- 注册后 New API 不会自动建立会话，所以页面自己再调一次 login；注册接口的响应没有 `data`
- **长度规则以服务端为准**：`model.User` 的校验是 `username max=20`（无下限）、`password min=8,max=20`。表单用 `novalidate` + JS 校验，原因有两个：浏览器原生校验的提示语跟的是**浏览器界面语言**（会出现中文），而 `maxlength` 会把超长密码**静默截断**成 20 位后注册成功
- 服务端报错默认是英文（`fa` 未在服务端 i18n 里注册，落到 `en`），`app.js` 的 `AUTH_ERRORS` 把常见几条映射成波斯语，未命中的保留原文并加前缀
- 2FA 账号会被拦下并提示改用主控制台（迷你站没有 2FA 表单）

## 用到的接口

| 页面 | 接口 |
|---|---|
| 用量 | `GET /api/user/self`（`quota` / `used_quota` / `request_count`）、`GET /api/log/self?p=&page_size=&type=0` |
| 用量明细 | 每行日志的 `other` 字段（JSON 字符串）：`model_ratio`、`user_group_ratio`/`group_ratio`、`completion_ratio`、`cache_ratio`、`cache_tokens`、`cache_creation_ratio`、`cache_creation_tokens`、`model_price`、`frt`（首字延迟 ms）、`request_path`、`billing_source`、`request_conversion` |
| 密钥 | `GET /api/token/?p=1&size=100`、`POST /api/token/`、`DELETE /api/token/:id` |

金额换算：`quota / status.quota_per_unit`（当前 `quota_per_unit = 500000`）。单笔金额很小（实测一次 36/24 token 的调用是 `quota=19` → `0.000038`），所以单笔用 6 位小数、总额用 2 位。密钥在库里不带前缀，**展示和复制时补 `sk-`**。

`other` 里 `-1` 表示"未使用/未设置"（例如非流式请求的 `frt` 为 `-1000`），要显示成 `—`，否则会看到 `-1.00` 这种假数据。

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

## 验证方式（真浏览器）

SPA 的 `/login` 要拉 7 MB 的 bundle，网络抖动时会卡住 `domcontentloaded`；只测控制台时可以绕开它：
用 `context.request.post('/api/user/login')` 拿会话 cookie，再用 `context.addInitScript` 在同源写入
`localStorage.user = {id, username}`（控制台只读这个），然后直接打开 `/me/`、`/me/keys`。

本次实测覆盖：注册（API 200）→ 登录 → 用量页卡片 → 建 key（行数 1→2，key 形如 `sk-…`）→ 复制一致 → 删除（2→1）→ 真打一次 `/v1/messages`（`quota=19`）→ 展开明细看到 23 个字段。

```bash
# 匿名态：页面能渲染出登录提示（用无头浏览器跑 JS 后再看 DOM）

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
- `[hidden]` 会被 `.notice { display:flex }` 之类的类选择器盖掉，样式里必须显式写 `[hidden] { display: none !important }`，否则登录提示和内容会同时显示
