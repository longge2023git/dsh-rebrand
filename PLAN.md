# DSH 二次开发规划 v3 —— 品牌 / 登录中转站 / RTL

> 工作区：`/Users/longge/projects/ai/deepseek_rebuild`
> 更新时间：2026-10-20
> 上游：<https://github.com/deepseek-ai/deepseek-harness>（MIT）
> 基线：`dsh-v0.2.1-rc.2`（commit `687f282e`，与在用的桌面版、npm latest 同源）
> 远端：**公开**仓库 `longge2023git/dsh-rebrand`
>
> **目标**：换品牌、换登录（自建中转站）、界面支持 RTL 布局；**不动 Agent 核心能力**；**暂不做阿拉伯语翻译**。

---

## 0. 结论摘要

| 工作流 | 做法 | 改动面 | 预估 |
|---|---|---|---|
| 仓库 | 公开 `dsh-rebrand` + `origin`/`upstream` 双远程；MIT 保留 + NOTICE/Trademarks | 无代码 | 0.5 天 |
| **A 品牌** | 品牌 client 插件替换 sidebar 插槽 + 主题 token；只改 ~6 个上游元数据文件 | 小、可控 | 3–4 天 |
| **B 登录** | **协议兼容中转站**：中转站按 [规范](custom/login-relay-spec.md) 实现 11 个端点/页面，DSH 只改 `platformOrigin`/`inferenceOrigin` | 配置 + 1 个 mock | 2.5–3.5 天（不含中转站实现） |
| **C RTL** | 基础层一次做（dir + 构建期逻辑化），再按使用频率 P0→P2 分批；不做阿语 | 2 个构建钩子 + 1 个小插件 + 分档修 | 7 天 |
| 合计 | 单人串行 | — | **约 3 周** |

三条关键判断：

1. **登录不需要改 DSH 代码**。`deepseek-account-platform` 的 `platformOrigin` / `inferenceOrigin` 本来就是配置项；中转站按规范实现后，客户端零改动。这是最省、最稳的换登录方式。
2. **RTL 不要一把梭**。全仓 209 个 CSS 文件、约 367 处物理方向属性、30 处 `translateX`；但 60% 集中在 `ui-primitives`、`ui-trajectory`、`ui-dockkit`、`ui-workspace` 四个包。基础层一次做对，再按界面使用频率分三批。
3. **品牌替换的上游改动可压到 6 个文件以内**。侧边栏品牌是插槽（`sidebar.brand.mark` / `sidebar.brand.name`），不是硬编码。

---

## 1. 现状核查

### 1.1 本机

| 项 | 结果 | 影响 |
|---|---|---|
| macOS arm64 / 15 核 / 48 GB / 527 GB 可用 | 充足 | 编译、Electron 打包无压力 |
| Node 22.23.2 | ✅ 满足 `^22.19 \|\| >=24` | 不要升到 23/25 |
| pnpm 11.28.5 | ✅ 已安装并锁定 | 与上游 `packageManager` 一致 |
| Xcode 26.6 + clang 21 | ✅ | 原生模块可编译 |
| 全局 git 身份 | ❌ 仍未设置 | 建仓库前必须补 |
| gh | ✅ `longge2023git`，含 `repo`/`workflow` | 可建公开仓库 |
| 已装 App | 0.2.1-rc.2，asar，`channel: nightly` | 不要改 App 内部；夜间自动更新会覆盖 |

### 1.2 上游代码（决定方案的事实）

- **品牌**：`ui-sidebar/src/client/contract/slots.ts` 定义 `sidebar.brand.mark` / `sidebar.brand.name` 两个单占位插槽，`ui-brand-official` 只是内置占用者；`FishLogo`/`BrandWordmark` 仅作 fallback。
- **登录**：`deepseek-account-platform` 实现 `DeepSeekAccount` 抽象服务，协议是 9 个 JSON 端点 + 2 个浏览器页面 + 1 个 loopback 回调；`platformOrigin` / `inferenceOrigin` 均可配置。
- **Web 认证**：每个进程生成启动 token，`GET /?token=` 换 30 天签名 cookie（`dsh-auth-*`），未认证 401（已实测：无 token 401、带 token 303）。这是**实例级**准入，不是用户登录。
- **请求钩子**：认证后的 HTTP 请求经过 `connection/request` waterfall，可拒绝或等待（桌面锁更新用它）。要加用户级校验，这是官方缝隙。
- **模型凭据**：账户 token 走 `x-dsh-auth-token` 头（不是 Bearer）；API key 路由支持 `apiKeyEnv` + 自定义 `baseURL`。
- **桌面登录范式**：`apps/desktop/src/policy-test-auth.ts` 用隔离 session、origin 白名单、独立窗口做登录，可复用其模式（但不要复用它的 session）。
- **RTL 现状**：全仓仅 2 处 `rtl` 字样（均在文档预览测试）；`<html>` 只写 `lang` 不写 `dir`；`locale` 只内置 `zh`/`en`。

---

## 2. 公开仓库与合规

### 2.1 初始化

```bash
cd /Users/longge/projects/ai/deepseek_rebuild
git config --global user.name  "longge"
git config --global user.email "longge2023git@users.noreply.github.com"

# gh 会创建 origin 远程并推送当前 main；不要再手动 git remote add origin
gh repo create longge2023git/dsh-rebrand --public --source=. --remote=origin --push
git push -u origin main
```

仓库已经初始化好（`main` = `687f282e`，`upstream` 已配置，依赖已装），只差建远端并推送。也可用 [tools/bootstrap.sh](tools/bootstrap.sh) 在别的机器复现。

### 2.2 公开仓库的四个必做项

1. **保留 MIT 与版权**：`LICENSE` 原文不动；新增 `NOTICE`，写清「基于 DeepSeek Harness（tag/commit）修改」。
2. **改名**：上游 [BRAND_GUIDELINES.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/BRAND_GUIDELINES.md) 要求项目名不要直接用 "DeepSeek Harness" 商标；可用 "built on DeepSeek Harness" 描述关系。
3. **清理品牌残留**：logo、字标、引导页、关于面板、欢迎页全部换掉，避免「官方背书」误解。
4. **无秘密**：公开仓库不放 `.env`、token、证书；`~/.dsh/.credentials.yaml` 永不入库；签名密钥只进 Secrets。

---

## 3. 工作流 A：品牌替换

### 3.1 触点清单

| 表面 | 位置 | 改法 | 成本 |
|---|---|---|---|
| Web 文档标题 | `apps/web/index.html` + `apps/web/vite.config.ts`（`DSH_CLIENT_TITLE`）+ `ui-layout/src/client/AppFrame.tsx:233` | 构建期注入同名变量，两处一致 | 低 |
| Web favicon / PWA | `apps/web/public/favicon*.svg`、`manifest.webmanifest` | 替换文件 | 低 |
| 侧边栏标识 | `ui-sidebar` 两个插槽 | **新 client 插件**占用，不改上游 | 低 |
| 内置字标/鱼标 | `ui-primitives/src/{BrandWordmark,FishLogo}.tsx` | 仅 fallback | — |
| 品牌字体 | `ui-theme/src/styles/brand-font.css` + Montserrat woff2/OFL | 换自有字体并保留许可 | 低 |
| 桌面产品名/包名 | `apps/desktop/scripts/electron-builder-config.mjs`（`productName`、`artifactName`、appId 来自 `DSH_DESKTOP_APP_ID`） | 改常量 + `.env.macos` | 低 |
| 桌面图标 | `apps/desktop/resources/icon-macos.png`、`icon-windows.png`、`tray-windows.ico` | 1024 源图重新导出 | 低 |
| 应用菜单/关于 | `apps/desktop/src/locale.ts`（aboutMenu/aboutProduct/quitTitle…）+ `main.ts` 的 `applicationName` | 改文案表 | 低 |
| 桌面欢迎页 | `apps/desktop/renderer/welcome.html` + `welcome-brand.svg` | 换 SVG/文案 | 低 |
| 首次引导 | `ui-settings-account/src/client/OnboardingWelcomeStep.tsx` + `assets/*.webp` + `locales/onboarding.ts` | 换图 + 文案；或用自有欢迎插件禁用内置引导 | 中 |
| 侧栏「本地构建」徽标 | `ui-sidebar/src/client/SidebarRoot.tsx` + `brand.localBuild` | 换文案/隐藏 | 低 |
| 模型名标签 | `ui-deepseek-model-label-1017` | 禁用或替换 | 低 |
| 更新源/渠道 | `apps/desktop/.env.macos`、`app-update.yml` | 指向自己的发布源 | 中 |

### 3.2 推荐结构

```
packages/ext/brand-<you>/
├── package.json          # dsh.bundle.patch + engines.dsh
├── cordis.patch.yml      # 替换 sidebar.brand.mark / sidebar.brand.name
└── src/client/
    ├── BrandMark.tsx     # 你的 logo（SVG）
    ├── BrandName.tsx     # 你的字标
    └── index.ts          # 注册插槽 + 主题 token 覆盖
```

- 插槽替换是**运行时**的，不碰上游文件，升级零冲突。
- 颜色/圆角/字体走 `ui-theme` 的 `--dsw-*` token（第三方主题可通过 `ctx.theme` 注册 alias 覆盖）。
- 文案必须进 locale 字典（`verify-client-ui-i18n` 拒绝硬编码），不能写在组件里。

### 3.3 验收

```bash
grep -rn "DeepSeek Harness\|DeepSeek AI" --include=*.ts --include=*.tsx --include=*.json \
  --include=*.html --include=*.css packages apps | grep -v -E "LICENSE|NOTICE|docs/"
```

预期仅剩许可证、NOTICE、出处说明。再加「干净机器首启」截图：欢迎页、侧边栏、关于面板、安装包名、Dock 图标、窗口标题。

---

## 4. 工作流 B：登录（协议中转站）

### 4.1 路线

**不改 DSH 账户代码**，而是让中转站实现与官方 `deepseek-account-platform` 相同的协议，DSH 只改两个配置项。完整规范见 **[custom/login-relay-spec.md](custom/login-relay-spec.md)**（9 个 API 端点 + 2 个浏览器页面 + loopback 回调 + 信封/错误/限制/测试清单）。

```
DSH ──auth_init──▶ 中转站 ──▶ 你的 SSO ──▶ 302 回 127.0.0.1/oauth/callback
    ──auth_exchange(code, verifier)──▶ token
    ──模型请求 x-dsh-auth-token──▶ 中转站网关
```

配置（profile 的 `cordis.patch.yml`）：

```yaml
- id: deepseek-account
  name: '@deepseek-ai/dsh-deepseek-account-platform'
  config:
    platformOrigin: https://relay.example.com
    inferenceOrigin: https://relay.example.com
    # 补丁整体替换 config：base 层的 desktopPlatform 必须复述，否则桌面端头信息错误
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"

- id: llm-deepseek-account
  config:
    baseURL: https://relay.example.com/v1
```

### 4.2 分工与阶段

| 阶段 | 谁做 | 内容 | 工期 |
|---|---|---|---|
| **L0 规范** | 已完成 | 从端上实现反推出协议，写成可交付规范 | ✅ |
| **L1 Mock** | 我们 | 用 Node/Hono 写本地 mock，跑通规范 §9 一致性清单；验证 DSH 登录全链路 | 1 天 |
| **L2 配置接线** | 我们 | profile 覆盖 `platformOrigin`/`inferenceOrigin`；桌面/Web 两形态验证 | 0.5 天 |
| **L3 真实中转站** | 你（+我们联调） | 按规范实现 SSO、token 签发、推理校验 | 你的排期 |
| **L4 边界** | 我们 | 登出吊销、token 过期、取消登录、引导页、空钱包显示 | 1 天 |

我方总计 **2.5–3.5 天**（不含中转站实现）。

### 4.3 关键约定（详见规范）

- 响应信封固定 `{"code":0,"data":{"biz_code":0,"biz_data":...}}`；`401` 或 `40003` = token 过期。
- 响应体 ≤ 64 KB；API 端点**禁止 3xx**；单请求 30 s 超时。
- 授权页路径必须是 `/dsh/authorize`，完成页 `/dsh/authorized`，且与 `platformOrigin` 同源。
- token 必须是可打印 ASCII；生产不要以 `dsh_mock_` 开头。
- 推理头是 `x-dsh-auth-token`，不是 `Authorization: Bearer`。
- 用户对象 `email` 必填（可占位）；钱包/赠送金可返回空数组。

### 4.4 风险与对策

| 风险 | 对策 |
|---|---|
| 中转站只做登录、不做推理 | `inferenceOrigin` 仍指向官方会拒绝你的 token；要么中转站兼推理，要么改用 API key 路由 |
| 钱包/充值页缺失 | 返回空数组 + 简单说明页，避免 UI 404 |
| 官方协议随版本变动 | 规范基于 `0.2.1-rc.2`；升级时用 `git diff` 看 `deepseek-account-platform` 的协议文件 |
| 回调只支持 loopback | 远端/容器场景必须让浏览器能访问客户端所在机器的 loopback（SSH 转发即可） |
| 登录态不进业务层 | 若将来要按用户分会话/额度，再评估自建 `DeepSeekAccount`（成本 7–10 天） |

---

## 5. 工作流 C：RTL（分批，不做阿语）

### 5.1 现状量化（实测）

| 指标 | 数量 |
|---|---|
| CSS 文件 / CSS Modules | 209 / 199 |
| 物理方向属性（`margin-left` 等） | ≈367 |
| 逻辑方向属性 | ≈20 |
| `translateX` | 30 |
| TS/TSX 中方向性写法 | ≈300 |
| 现有 RTL 支持 | 仅 2 处测试 |

集中在少数包：

| 包 | 物理属性 | translateX | 使用频率 |
|---|---:|---:|---|
| `ui-primitives` | 96 | 23 | **每次会话**（按钮/菜单/提示/输入） |
| `ui-trajectory` | 64 | 3 | 低（轨迹视图） |
| `ui-dockkit` | 48 | 0 | 中（面板停靠） |
| `ui-workspace` | 35 | 2 | 中高（工作区/文件树） |
| `ui-chat` | 27 | 2 | **每次会话**（输入框/消息） |
| `ui-conversation` | 23 | 0 | **每次会话**（会话流） |
| `ui-schedule` | 20 | 0 | 低 |
| `ui-sidebar` | 10 | 3 | **每次会话** |
| `ui-tool` | 9 | 0 | 高（工具卡） |
| `ui-layout` | 8 | 1 | **每次会话**（框架） |
| `ui-attachment` | 8 | 2 | 高 |

`ui-primitives` 是杠杆点：修它，所有层级同时受益。

### 5.2 分层交付（按使用频率）

| 批次 | 范围 | 内容 | 工期 |
|---|---|---|---|
| **R0 基础** | 全局 | `dir` 运行时插件（Auto/LTR/RTL 设置）+ 构建期物理→逻辑属性（`tsdown.client.ts` + `apps/web` Vite）+ 代码/终端/路径/URL 的 LTR 孤岛 + RTL 快照基线 | 1.5 天 |
| **R1 主路径** | `ui-primitives`、`ui-layout`、`ui-sidebar`(含 files/terminal)、`ui-conversation`、`ui-chat`、`ui-tool`、`ui-input-trigger`、`ui-attachment`、`ui-user-questions` | 每次会话必经：框架、侧栏、消息流、输入框、工具卡、弹窗/菜单/Tooltip | 2 天 |
| **R2 常用面板** | `ui-settings*`（general/models/account/shell/agent-loop/subagent/web-search/plugin-inventory）、`ui-commands`、`ui-model-selection`、`ui-workspace`、`ui-dockkit`、`ui-plan`、`ui-goal`、`ui-jobs` | 设置全页、命令面板、模型选择、工作区、面板停靠 | 2 天 |
| **R3 低频** | `ui-trajectory`、`ui-schedule`、`ui-subagent`、`ui-workflow-run`、`ui-deliverables`、`ui-plugin-manager`/`market`、`ui-message-feedback`、`ui-skill`、`ui-sidebar-browser` | 逐页过一遍，允许非阻塞瑕疵 | 1.5 天 |
| **R4 不做** | `packages/experimental/*`、voice、translation、browser-use、computer-use、inspector | 按需再说 | — |

合计 **7 天**。R1 完成即可对外演示；R2/R3 可增量发布。

### 5.3 为什么这样排

- **使用频率**：`layout/sidebar/conversation/chat/primitives/tool` 每次会话都出现，错位最刺眼；settings 偶尔进；trajectory/schedule 只有特定功能才打开。
- **杠杆率**：`ui-primitives` 96 处物理属性 + 23 处 `translateX`，修一次全站受益，必须排在第一批。
- **风险控制**：基础层（R0）先做，避免每个批次重复处理方向属性；之后每批只处理图标、坐标、孤岛等真正需要人工判断的部分。

### 5.4 明确不做

- 不做 `ar` 语言包、不做阿语文案翻译；只提供 `dir` 方向能力与设置开关。
- 不手改 209 个 CSS 文件：用构建期转换，避免与上游每次 UI 迭代冲突。

### 5.5 验收

- `dir=rtl` 下跑关键页面矩阵：首屏、会话流、输入、工具卡、设置、命令面板、终端、文档预览、弹窗/菜单/Tooltip；
- 检查：无横向溢出、无文字截断、图标方向正确、代码块/终端仍 LTR、滚动条与拖拽手柄在正确一侧；
- 现有 Web 快照测试加 RTL 变体，防回归。

---

## 6. 构建与开发环境

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build              # artifacts + check（必须先跑，再单独 build:web）

pnpm dev:web                # HMR，3080
DSH_HOME=~/.dsh-dev pnpm dsh web --no-open
pnpm dev:desktop
pnpm package:desktop:mac:arm64:unsigned
```

- **构建顺序**：`pnpm run build:web` 单独跑会失败，因为前端依赖工作区里尚未构建的 `dsh-experimental-webworker-runtime`。
- `pnpm-workspace.yaml` 的 `allowBuilds` 是白名单：新增带 install 脚本的依赖必须显式加。
- `NODE_OPTIONS` 不能含 `--no-experimental-strip-types`。
- 开发实例用 `DSH_HOME=~/.dsh-dev`：session 格式 v4 迁移单向。
- 自有脚本放 `tools/`，不要放上游的 `scripts/`。

### 6.1 本仓库必须遵守的约定（AGENTS.md）

- **文案走 locale 字典**，`verify-client-ui-i18n` 拒绝硬编码。
- **颜色/圆角/字体只用 `--dsw-*` token**。
- **注册即 effect**：`ctx.effect()` / `ctx.on()`，卸载时回收。
- 开发用 `build:artifacts`，交付前 `build:check`；`typecheck` + `lint` 是基础门禁。
- 改到外部可感知面时补 upgrade guide；文件末尾恰一个换行。

### 6.2 本次已实测（M0 完成）

| 步骤 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ 1402 包 / 2m06s |
| `pnpm run typecheck` | ✅ 5 gate / 60s |
| `pnpm run build` | ✅ 9 gate / 14s |
| `DSH_HOME=~/.dsh-dev pnpm dsh web` | ✅ 3080 起服；无 token 401、带 token 303 |
| `pnpm run build:web` 单独 | ❌ 依赖 artifacts，已记录 |

---

## 7. 里程碑与排期

| 阶段 | 内容 | 工期 | 依赖 | 验收 |
|---|---|---|---|---|
| **M0** | 工具链、基线、install、typecheck、build、冒烟 | ✅ 完成 | — | 已实测 |
| **M1** | 建 `dsh-rebrand` 公开仓库、推 `main`、打 `base/0.2.1-rc.2` | 0.5 d | M0 | 仓库可访问 |
| **A1** | 品牌资产：名称、图标、标题、关于面板、欢迎页 | 2 d | M1 | 首启无 DeepSeek 标识 |
| **A2** | 品牌插件：侧栏插槽 + 主题 token + 引导替换 | 1–2 d | A1 | 侧栏/设置显示自有品牌 |
| **L1** | Mock 中转站 + 一致性清单 | 1 d | M0 | 规范 1–8 全过 |
| **L2** | DSH 配置接线（桌面/Web） | 0.5 d | L1 | 登录全链路走 mock |
| **L3** | 真实中转站联调 | 你的排期 | L2 | 登录 + 推理都通 |
| **L4** | 登出/过期/取消/引导/空钱包 | 1 d | L2 | 边界用例通过 |
| **R0** | RTL 基础层 + 快照 | 1.5 d | M0 | `dir=rtl` 可切换 |
| **R1** | 主路径 RTL | 2 d | R0 | 首屏/会话/输入/工具卡正确 |
| **R2** | 常用面板 RTL | 2 d | R1 | 设置/命令/工作区正确 |
| **R3** | 低频页面 RTL | 1.5 d | R2 | 逐页验收 |
| **D** | 打包分发：签名、公证、更新源 | 2 d | A/B/C | 干净机器安装可用 |

我方关键路径 = M1 → A → L1/L2/L4 → R0→R1 → D，约 **12–14 个工作日**；R2/R3 可与 L3 并行。

---

## 8. 上游跟随与冲突控制

自有改动收敛到四类：

1. 新包：`packages/ext/*`（品牌、RTL、登录守卫）——零冲突；
2. 元数据：`apps/web/index.html`、`apps/web/public/*`、`apps/desktop/resources/*`、`electron-builder-config.mjs`、`apps/desktop/src/locale.ts`——低冲突；
3. 构建钩子：`apps/web/vite.config.ts`、`packages/client/tsdown.client.ts`——中低冲突，≤30 行；
4. 桌面登录模块（若做外壳门禁）——新增文件 + `main.ts` 一处接线。

升级 SOP：

```bash
git fetch upstream --tags
git switch -c sync/upstream-YYYYMMDD main
git rebase --onto <新tag> base/<旧tag>
pnpm install --frozen-lockfile && pnpm run typecheck && pnpm run build
git tag -a base/<新tag> -m "upstream baseline"
git switch main && git merge --ff-only sync/upstream-YYYYMMDD
```

原则：不 merge upstream；自有提交保持「基线之上的一小摞」；升级与业务改动分段提交。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 上游预发布 API 频繁破坏 | 插件/配置失效 | 插件优先、`engines.dsh` 限范围、升级只重验自有包 |
| 桌面 nightly 自动更新 | 分发包与基线错位 | 自建更新源 + 自有 appId；或关自动更新 |
| RTL 遗漏内联样式/图标 | 局部错位 | 基础层统一逻辑化 + 分档清单 + 快照 |
| 中转站协议偏差 | 登录失败难定位 | 严格按规范信封/路径/限制；先过 mock 一致性清单 |
| token 只对 `inferenceOrigin` 生效 | 模型请求 401 | 中转站兼推理，或改用 API key 路由 |
| 公开仓库品牌残留 | 商标/背书误解 | 保留 NOTICE/MIT；发布前全局扫描 |
| 仓库体积 ~308 MB | 首次 clone 慢 | 完整历史只留一份；`node_modules` 不入库 |

---

## 10. 待确认

1. **中转站是否兼推理入口**？是 → `inferenceOrigin` 指向它；否 → 模型改走 API key 路由。
2. **登录方式**（OIDC / OAuth2 / 手机号 / 企业 SSO）？决定 `/dsh/authorize` 的实现和回调链路。
3. **分发范围**：只自己用 / 团队 / 对外发布？对外需要签名、公证、更新源，工期 +2 天。

---

## 11. 下一步（按顺序）

1. 设置 git 身份（两条命令，见 §2.1）。
2. 建公开仓库并推送：`gh repo create longge2023git/dsh-rebrand --public --source=. --remote=origin --push`。
3. 打基线 tag：`git tag -a base/0.2.1-rc.2 -m "upstream baseline" dsh-v0.2.1-rc.2`，提交 `PLAN.md` / `custom/` / `tools/`。
4. 起 L1：在 `custom/mock-relay/` 写 mock 中转站，按规范 §9 跑一致性清单。
5. 起 A1/R0 可并行：品牌资产与 RTL 基础层互不依赖。
