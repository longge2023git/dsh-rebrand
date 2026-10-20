# 深度评审结论（v1）

> 评审对象：[PLAN.md](../PLAN.md) v3 + [login-relay-spec.md](login-relay-spec.md) v1
> 方法：4 个只读子评审（品牌/RTL、登录协议、发布合规、工程流程）+ 主评审实证核对
> 结论：**方向成立，但原计划的工期与改动面明显低估**；有 11 个 P0 必须先修计划再开工。

---

## 0. 总评

| 工作流 | 原估 | 评审后 | 主要偏差 |
|---|---:|---:|---|
| A 品牌 | 3–4 天 | **5–7 天** | 触点 ≥15 个；官方品牌插件受 build profile 控制；测试写死官方字样 |
| B 登录 | 2.5–3.5 天 | **4–5 天**（不含中转站） | 漏 `/models` 契约；token 生命周期；40003 语义；托管 Web 不可用 |
| C RTL | 7 天 | **10–13 天** | 转换挂错管线；lightningcss 不做反向转换；几何层无解；无 RTL 测试基线 |
| D 分发 | 3–4 天 | **6–8 天 + 外部依赖** | 强制更新服务、生产更新源写死、证书/硬件 Token、版本 bump |
| 合计 | 约 3 周 | **约 5–6 周** | 不含中转站与证书采购周期 |

---

## 1. P0：不修就会返工或直接失败

### P0-1 RTL 转换挂错管线（会白做）

- `ui-primitives/tsdown.config.ts`、`ui-dockkit/tsdown.config.ts` 走 `staticLinked`，CSS 以**原始文件** emit（`tsdown.client.ts` 的 `dsh-css-asset`：`source: await readFile(file)`），由 `apps/web` 的 Vite 编译。
- tsdown 里的 lightningcss 只覆盖**动态插件包**（`dsh-css-modules-inline` / `-global-` / `-text-`）。
- 因此「杠杆点 ui-primitives 96 处」根本不经过计划里写的那个钩子。
- **修正**：转换函数写成一个共享模块，接在 `dsh-css-asset` 的 emit 处 + 三个动态 load hook + `apps/web` 的 Vite CSS 插件；三处共用同一实现。

### P0-2 lightningcss 不做 physical→logical

- 实测 1.33：`margin-left` 原样保留；反向（logical→physical）才会按 `:lang()` + targets 降级。
- 必须用 visitor 手写映射，且**不能设 targets**（否则 `dir=rtl` + `lang=en` 失效）。
- visitor 必须成对处理：只改 `left:0` 会残留 `right:auto`；`margin:0 8px 0 4px`、`transform-origin:left` 无法简单还原。
- **修正**：转换器覆盖 `margin/padding/border/inset/float/clear/text-align/transform-origin`；四值简写按方向成对改写；写单测固定行为。

### P0-3 品牌触点不是 6 个，是 ≥15 个

- 已定位：`apps/cli/src/args.ts:156`、`apps/desktop/src/locale.ts:34-133`（中英两份）、`apps/desktop/src/main.ts:935`、`electron-builder-config.mjs:116-118`、`manifest.webmanifest:2`、`scripts/client-build-environment.ts:20`、`ui-settings-account`/`ui-settings-models`/`ui-plugin-manager`/`ui-sidebar-documentpreview` 的 locales、`locale/src/locales/en.ts:36`、`ui-deepseek-model-label-1017`。
- **插槽不是「加一个插件」**：`ui-slots/src/index.ts:1222` 单槽同优先级重复注册直接 throw；官方占用者受 `DSH_CLIENT_BUILD_PROFILE === 'official'` 控制；fallback 仍是鱼标（`SidebarRoot.tsx:189,225`）。
- **修正**：禁用 `ui-brand-official` 行 + 插入自有行；fallback 也要改；标题走 `DSH_CLIENT_TITLE` 但 build 门禁会校验固定值；测试里写死的官方字/`viewBox` 要同步改。

### P0-4 账户路由强制 `/models`，自建模型否则不可选

- `llm-deepseek-account` 的 `models` 配置被**禁止**（写了启动失败），目录来自 `GET {origin}/models`（注意是 origin 根，不是 `/v1/models`）。
- 每个条目必须有 `api_capabilities.anthropic_messages`，否则不可用；`client_requirements["deepseek-harness"].min_version` 可控制可见性。
- 不实现 `/models` 会回退到内置 `deepseek-flash` / `deepseek-v4-pro`，你的模型不会出现在选择器。
- **修正**：规范已补 §7.4 完整契约；中转站必须实现。

### P0-5 inferenceOrigin 不一致会把 token 发到官方

- `resolveToken` 只对 `inferenceOrigin` 返回 token；若 `inferenceOrigin` 仍是 `https://api.deepseek.com`，中转站签发的 token 会被发给官方（仅拦 loopback issuer）。
- **修正**：强制 `inferenceOrigin === platformOrigin`；规范 §2 与 §7.1 已写明。

### P0-6 40003 放错层不会登出

- 顶层 `{"code":40003}` → `expired`（清凭据）；`data.biz_code=40003` → `protocol`（只报通用失败，不清凭据）。
- **修正**：规范 §3.1 已明确；中转站只允许顶层 code 或 HTTP 401。

### P0-7 托管 Web 无法用这套登录

- `loginOrigin` 只接受 `http://localhost|127.0.0.1|[::1]:<port>/`；Web 端回调 origin 取 `window.location.origin`。
- 结论：**域名托管的 Web 无法发起登录**，除非改核心或改用「网关登录 + `connection/request` 守卫」。
- **修正**：把「对外分发是否为桌面安装包」列为 BLOCKING 需求；若是 Web，另立方案（+3–5 天）。

### P0-8 签名桌面包强依赖强制更新服务

- macOS 非 unsigned 构建必须解析 `DSH_DESKTOP_MANDATORY_UPDATE_{TEST,PROD}_ORIGIN`；Windows 无论是否 unsigned 都要求。
- 服务端需实现 `GET /api/v0/check_client_update`（带客户端身份头，返回强制/不强制决策）。
- 生产更新源在代码里写死 `https://download.deepseek.com`（`desktop-auto-update-environment.mjs:31`），上传器只支持腾讯 COS。
- **修正**：中转站增加策略端点，或打一个小补丁允许「无策略」；更新源改静态桶（S3/R2/COS）并改固定 origin。

### P0-9 版本号不是随便加后缀

- Electron 要求桌面壳版本 == 根 dsh 版本；`latest` 通道拒绝 prerelease；`release:dsh` 会改约 344 个 manifest。
- **修正**：测试版 `0.2.2-test.YYYYMMDD.N`，稳定版 `0.2.2`/`0.3.0`；tag 用 `rebrand-v*`，上游 `dsh-v*` 不动。

### P0-10 与官方 App 共用 `~/.dsh`

- 桌面 Host 继承 `DSH_HOME`，默认 `~/.dsh`；品牌版与官方版并存会共用 credentials/profiles/sessions，互相污染。
- **修正**：品牌版注入独立 `DSH_HOME`（如 `~/Library/Application Support/<Brand>/dsh-home`），提供一次性迁移。

### P0-11 遥测默认开启，且没有用户开关

- `desktop-product-telemetry` / `product-analytics` 两行在 desktop profile 默认启用，启动即发事件到 DeepSeek collector。
- `DSH_TELEMETRY_DISABLED` 只关 session telemetry，不关产品分析。
- **修正**：自有 bundle 里 `disabled: true`；对外分发前做一次「无外发请求」验证。

---

## 2. P1：遗漏与低估

| 项 | 证据/影响 | 修正 |
|---|---|---|
| 类名全量变化 | Vite CSS Module 名 = 内容 hash + 行号；转换后快照批量红 | 一次性刷新基线；加 `classMap` 键稳定性测试 |
| 现有 Web 测试撑不住 RTL | 多数是 Chromium（175 个），但品牌断言在 jsdom（9 个），无布局/rect | 新增 Chromium RTL harness：`dir=rtl` + `scrollWidth`/`rect`/`computed direction` |
| LTR 孤岛不存在 | 全仓无 `direction:ltr`/`unicode-bidi`/`dir="ltr"`；代码块会整体 RTL | 给 pre/code/终端/路径/URL 加 `dir="ltr"`，不只加 CSS |
| JS 几何假设 LTR | `AppFrame.tsx:226-231/301/303`、`dockkit/TabPanel.tsx:133-134,195-196`、`Tooltip.tsx:111-118,163` | R0 建立「几何层」清单，按 direction 取符号 |
| RTL 批次错配 | `ui-dockkit` 是右栏宿主、`ui-workspace` 注册 sidebar 插槽，每次会话可见 | 都提到 R1；补 `TurnNavigator` 虚拟列表 |
| 登录缺 token 生命周期 | 无 refresh；401 即删凭据；换号不吊销旧 token | 规范补 §12：TTL、吊销、多设备、审计 |
| 注册/风控缺失 | 手机/邮箱注册涉及验证码、限流、锁定、找回、协议 | 规范补 §12；列为中转站验收项 |
| Files API 契约不全 | 响应需 `id/type/mime_type/size_bytes/created_at/filename`，上传需 `expires_after` | 规范 §7.5 已补 |
| usage 语义 | 客户端是**覆盖**不是累加；`message_delta` 必须给累计值 | 规范 §7.2 已改 |
| 公开仓库 CI 跑不了上游 | 上游 25 个 workflow 绑企业/self-hosted runner | 新建 `ci-public.yml`（3 个 required + 夜间打包） |
| 许可证未打包 | `files/extraResources` 未含 LICENSE/THIRD_PARTY_NOTICES | 打包配置补入；NOTICE 写上 tag/commit |
| 回滚不可降级 | `allowDowngrade=false`；已升级用户无法回退 | 灰度发布（`stagingPercentage` 10→50→100），回滚只能发更高版本 |
| 品牌测试写死 | `built-boot.expected.e2e.ts:64-78` 断言官方字与 `viewBox`、欢迎页断言 Montserrat | 同步更新测试与字体许可 |
| `@deepseek-ai` scope 不可发布 | npm scope 归上游 | 只做二进制分发，或换自己的 scope |

---

## 3. P2：小坑

- `vite.config.ts` 只替换字面量 `<title>DSH Local Build</title>`，改 `index.html` 会静默失效。
- `brandFontLicense` 硬编码 Montserrat OFL 路径，换字体要同步换许可文件。
- `rewriteBrowserOrigin` 接受任意 https 源（仅开发用），生产别开。
- 授权 URL 可能被追加 `theme` 参数，中转站要忽略未知参数。
- `browserUrl` 不接受 hash；中转站页面别用 fragment 路由。
- `platformOrigin` 一改就登出（issuer 不匹配），升级/换域名要发公告。

---

## 4. 评审后的计划修正

| 项 | 原方案 | 修正后 |
|---|---|---|
| RTL 转换位置 | `tsdown.client.ts` 一处 | 共享转换器 + `dsh-css-asset` + 3 个动态 hook + Vite 插件 |
| RTL 工期 | 7 天 | 10–13 天（R0 3 天、R1 3 天、R2 3 天、R3 2 天） |
| 品牌改动 | ~6 个文件 | 15+ 触点、1 个新包、禁用官方行、改 fallback/测试 |
| 登录规范 | 9 个 API | 8 个 JSON API + 4 个页面 + `/models` + 生命周期章节 |
| 分发 | 自建更新源 2 天 | 6–8 天 + Apple/Win 证书 + 策略服务 + 灰度 |
| 版本 | `0.2.1-rc.2.1` | 测试版 `0.2.2-test.*`，稳定版 `0.2.2` |
| 上游同步 | rebase main | 公开仓库用 merge 同步，不重写 main |

---

## 5. 需要你确认的需求（完整版见 [requirements.md](requirements.md)）

**阻塞**

1. 对外分发是**桌面安装包**，还是也要域名托管的 Web？（后者现有登录不可用）
2. 品牌名称/Logo/字标/图标/字体授权，谁提供、何时给？
3. 中转站是否已能返回 Anthropic Messages SSE？是否实现 `/models`？

**影响范围**

4. 余额/充值保留吗？
5. 联网搜索/抓取保留吗？（要补 `/search`、`/fetch`）
6. token 有效期与多设备策略？协议无 refresh。
7. 遥测全关，还是改指自有 collector？
8. 更新源用 COS / S3 / R2？是否自建强制更新策略服务？
9. Windows 是否首发？EV 证书 + 硬件 Token + 实体机成本是否接受？
10. 最终品牌名/域名/appId（决定 userData、协议、更新缓存目录）。
11. `dir` 是持久化设置还是开发开关？RTL 用英文界面验收可以吗？
