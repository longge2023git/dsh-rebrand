# 迷你站 E2E

改完迷你站（`console/me/*`）或网关登录相关代码后，跑一遍防止回退。

```bash
# 1) 本地 UI（不联网、不建数据）
node tools/e2e/run.mjs --mode local --brand fa

# 2) 线上真实链路（会创建临时账号）
E2E_SSH_FA="ssh -o ProxyCommand='nc -X 5 -x 127.0.0.1:10808 %h %p' -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no root@87.107.108.14" \
E2E_SSH_RU="ssh -o ProxyCommand='nc -X 5 -x 127.0.0.1:10808 %h %p' -i ~/.ssh/id_ed25519_hub_104_248_155_54 -o StrictHostKeyChecking=no root@104.248.155.54" \
node tools/e2e/run.mjs --mode live --brand both
```

## 前置

- `playwright-core` 不在仓库依赖里，用 `E2E_PLAYWRIGHT` 指向本地安装：
  `export E2E_PLAYWRIGHT=/tmp/pw/node_modules/playwright-core/index.mjs`
- 出口由 `E2E_PROXY` 决定，浏览器与 curl **必须同一出口**：
  - 默认 `socks5://127.0.0.1:10808`
  - `E2E_PROXY=direct` 走本机直连。**推荐 live 模式用 direct**：代理出口通常和机器上其它客户端（含桌面端）共用，网关按 IP 限流 20 次/20 分钟，共享出口会被一起消耗，表现为注册/登录 429。
- 遇到 429 时套件会等 5 分钟重试两次；仍失败就报错而不是静默通过。
- 本地模式前先构建：`node console/build.mjs fa`（或 `ru`）。

## 覆盖范围

| 套件 | 模式 | 检查 |
|---|---|---|
| `site` | live | 6 个页面 200、语言/方向、无老 SPA 链接、下载页版本+SHA、Windows 位、语言切换、404 |
| `console-local` | local | 注册字段与邮箱开关、密码小眼睛、注册校验（超长用户名/短密码/不一致）、密码不进 URL、发码请求与载荷、查询串保留（tx/dsh/next）、密钥请求头与增删、退出登录、dsh 已登录直通与 2FA 提示 |
| `console-live` | live | 新用户 $0.10、密钥增删、退出→登录提示→重新登录、邀请链路（被邀请 $0.60、邀请人 $1.00、转账后 $1.50） |
| `desktop` | live | `auth_init` 路径、迷你登录页语言/品牌、登录→`complete`→`exchange` 拿到 token |

## 清理

live 模式创建的临时账号默认可通过 `E2E_SSH_*` 自动删除；未设置时会打印账号名，需要手工删除。

## 扩充约定

- 新检查写成 `checker.check('中文描述', 条件, 细节)`，描述里带上期望值
- 需要新建用户的检查自己登记到 `users`，由 runner 统一清理
- 断言要能区分"功能坏了"和"限流了"：接口返回 429 时先等一下再跑，不要改断言
