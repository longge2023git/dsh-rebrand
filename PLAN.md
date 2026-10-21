# DSH 二次开发规划 v4 —— 品牌 / 登录中转站 / RTL / 分发

> 工作区：`/Users/longge/projects/ai/deepseek_rebuild`
> 更新时间：2026-10-20
> 上游：<https://github.com/deepseek-ai/deepseek-harness>（MIT）
> 基线：`dsh-v0.2.1-rc.2`（commit `687f282e`）
> 远端：公开仓库 `longge2023git/dsh-rebrand`
>
> **目标**：换品牌、换登录（自建中转站）、RTL 布局、三档分发；不动 Agent 核心；暂不做阿语。
> **依据**：本计划已通过 4 份独立评审，结论与修正见 [custom/review-findings.md](custom/review-findings.md)。

---

## 0. 结论摘要

| 工作流 | 做法 | 评审后工期 |
|---|---|---|
| 仓库 | 公开 `dsh-rebrand`，`origin`/`upstream` 双远程；merge 同步上游 | 0.5 天 |
| **A 品牌** | 自有 client 插件占插槽 + 禁用官方行 + 改 ≥15 个触点 | **5–7 天** |
| **B 登录** | 协议兼容中转站（[规范](custom/login-relay-spec.md) v1.1） | **4–5 天**（不含中转站） |
| **C RTL** | 共享转换器 + `dir` 运行时 + 几何层 + 分批验收 | **10–13 天** |
| **D 分发** | 签名/公证、Windows、自建更新源、策略服务、关遥测 | **6–8 天 + 外部依赖** |
| **E 本地中转站** | NewAPI + relay 适配层（协议、SSE 归一化、`/models`） | **4–5 天** |
| 合计 | 串行 | **约 6–7 周**（不含证书采购与上游 key 联调） |

四个必须先接受的现实：

1. **RTL 比原计划贵一倍**：CSS 走两条不同管线（静态包由 Vite 编译、动态插件由 lightningcss），lightningcss 也不做物理→逻辑的反向转换，必须自己写 visitor；另有 JS 几何层躲不掉。
2. **品牌不是 6 个文件**：实测 ≥15 个触点，官方品牌插件还受 build profile 控制，单槽重复注册会直接抛错。
3. **登录规范少了一整个 `/models` 契约**：不实现它，自建模型根本不出现在选择器里。
4. **对外分发卡在四个外部依赖**：Apple 开发者账号、Windows EV 证书+硬件 Token、强制更新策略服务、更新源托管；生产更新源在代码里写死。

---

## 1. 现状核查

### 1.1 本机

| 项 | 结果 | 影响 |
|---|---|---|
| macOS arm64 / 15 核 / 48 GB / 527 GB | 充足 | 编译、打包无压力 |
| Node 22.23.2 / pnpm 11.28.5 | ✅ | 与上游一致 |
| Xcode 26.6 + clang 21 | ✅ | 原生模块可编译 |
| 全局 git 身份 | ❌ 未设置（已用仓库级身份提交） | 换机器前要补 |
| gh | ✅ `longge2023git` | 可建公开仓库 |
| 已装 App | 0.2.1-rc.2，nightly 自动更新 | 不要改 App 内部 |

### 1.2 代码事实（评审后）

- **品牌**：`sidebar.brand.mark/name` 是单占位插槽，同优先级重复注册直接 throw（`ui-slots/src/index.ts:1222`）；官方占用者只在 `DSH_CLIENT_BUILD_PROFILE === 'official'` 时注册；fallback 仍是鱼标。
- **登录**：8 个 JSON API + 4 个浏览器页面 + `/models`；`platformOrigin`/`inferenceOrigin` 可配置；回调只接受 loopback；token 无 refresh。
- **Web 认证**：进程级启动 token → 30 天签名 cookie；这是实例准入，不是用户登录。
- **RTL**：CSS 管线分叉；全仓无 `dir`、无 `direction:ltr`、无 bidi 隔离；`translateX` 30 处。
- **分发**：签名构建强制要求强制更新策略服务；生产更新源写死 `download.deepseek.com`；上传器仅 COS；遥测默认开启。

---

## 2. 公开仓库与合规

```bash
git config --global user.name  "longge"
git config --global user.email "longge2023git@users.noreply.github.com"
gh repo create longge2023git/dsh-rebrand --public --source=. --remote=origin --push
git tag -a base/0.2.1-rc.2 -m "upstream baseline" dsh-v0.2.1-rc.2
```

必做项：

1. 保留 MIT `LICENSE`；新增 `NOTICE`（上游 tag/commit、修改范围）。
2. 项目名不用 "DeepSeek Harness" 全名；用自有名 + "built on DeepSeek Harness"。
3. 打包产物必须包含 `LICENSE` / `THIRD_PARTY_NOTICES`（当前 `files/extraResources` 没带，要补）。
4. 公开仓库无秘密；`@deepseek-ai` scope 不可发布，只能二进制分发或换自己的 scope。
5. 上游 git 历史可保留；MPL-2.0 的 libreoffice-kit 若改动需公开其修改。
6. **测试期身份**：appId 用 `com.vv.test.dsh`，图标暂用当前 DSH 图标；这两项只在内部/测试分发使用，对外首版前必须换正式 appId 与自有图标（appId 之后不能再改）。

---

## 3. 工作流 A：品牌（5–7 天）

### 3.1 触点（≥15）

| 类别 | 位置 |
|---|---|
| 应用名/包名 | `electron-builder-config.mjs:116-118`、`DSH_DESKTOP_APP_ID`、`manifest.webmanifest:2` |
| 桌面菜单/关于 | `apps/desktop/src/locale.ts:34-133`（中英）、`main.ts:935` |
| CLI | `apps/cli/src/args.ts:156`、`apps/cli/README*` |
| Web 标题 | `DSH_CLIENT_TITLE`（`scripts/client-build-environment.ts:20`）+ `ui-layout/AppFrame.tsx:233` |
| 侧栏品牌 | 插槽 + fallback（`SidebarRoot.tsx:189,225`） |
| 引导/欢迎 | `ui-settings-account/.../OnboardingWelcomeStep.tsx` + `assets/*.webp` + `locales/onboarding.ts` |
| 其他文案 | `ui-settings-models`、`ui-plugin-manager`、`ui-sidebar-documentpreview` 的 locales、`locale/src/locales/en.ts:36` |
| 模型标签 | `ui-deepseek-model-label-1017` |
| 字体 | `ui-theme/src/styles/brand-font.css` + OFL 许可 |
| 图标 | `apps/desktop/resources/icon-*.png`、`tray-windows.ico`、`apps/web/public/favicon*` |
| 测试断言 | `built-boot.expected.e2e.ts:64-78`、`assembled-boot.ts:230`、欢迎页 Montserrat 断言 |

### 3.2 实现方式

1. 新建 `packages/ext/brand-<you>/`：`package.json`（`dsh.client` + `dsh.bundle.patch`）、`cordis.patch.yml`、`src/client/index.tsx`、`locales/{zh,en}.ts`。
2. 在 `packages/bundle/web-app/cordis.patch.yml` **禁用** `ui-brand-official` 行，插入自有行。
3. 改 fallback（鱼标→自有标），否则插件失效时静默显示官方 logo。
4. 标题改 `DSH_CLIENT_TITLE` 常量；注意 `vite.config.ts` 只替换字面量 `<title>`，两处要同步。
5. 引导页：优先「禁用内置引导 + 自有欢迎插件」，避免 fork `ui-settings-account`。
6. 同步修改写死官方品牌/字体的测试。
7. 只换「名称 + Logo」：字标用 Montserrat 排版生成，app 图标/favicon 从 Logo 导出；**不复用上游鱼标与 DeepSeek 字标**，字体沿用 Montserrat（OFL）。

### 3.3 验收

- 全局扫描除 LICENSE/NOTICE/出处外无官方品牌；
- 首启五屏截图：欢迎、侧栏、会话、输入、关于；
- 插件卸载后不残留、不抛单槽冲突。

---

## 4. 工作流 B：登录中转站（4–5 天，不含中转站实现）

### 4.1 协议范围（v1.1）

- **8 个 JSON API**：`auth_init`、`auth_exchange`、`auth_cancel`、`users/current`、`get_user_summary`、`get_unnotified_bonuses`、`ack_bonus_notified`、`logout`
- **4 个浏览器页面**：`/dsh/authorize`、`/dsh/authorized`、`/usage`、`/top_up`
- **1 个模型目录**：`GET {origin}/models`（缺了自建模型不可选）
- 信封 `{code:0,data:{biz_code,biz_data}}`；顶层 `40003` 或 HTTP 401 = 过期；`biz_code=40003` 不会登出。
- token 无 refresh；过期重登；`inferenceOrigin` 必须等于 `platformOrigin`，否则 token 会发到官方。

### 4.2 配置

```yaml
- id: deepseek-account
  name: '@deepseek-ai/dsh-deepseek-account-platform'
  config:
    platformOrigin: https://relay.example.com
    inferenceOrigin: https://relay.example.com
    # 补丁整体替换 config：必须复述 base 层的 desktopPlatform
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"

- id: llm-deepseek-account
  config:
    baseURL: https://relay.example.com/v1
```

### 4.3 分发形态（已确认）

**对外只发桌面安装包**（2026-10-20 确认）。因此登录走本机 loopback 回调，完全可用；域名托管的 Web 不在本期范围。

> 若将来要做 Web：现有 `loginOrigin` 只接受 loopback，需改核心放宽回调，或在网关做登录并用 `connection/request` 守卫，另立 3–5 天方案。

### 4.4 阶段### 4.4 阶段

| 阶段 | 内容 | 工期 |
|---|---|---|
| L1 | Mock 中转站 + 规范一致性脚本（含 `/models`、40003 负例） | 1.5 天 |
| L2 | DSH 配置接线（桌面/本机 Web） | 0.5 天 |
| L3 | 真实中转站联调（登录 + 推理 + 模型目录） | 1 天 |
| L4 | 登出/过期/取消/空钱包/内嵌页降级 | 1 天 |
| L5 | 账号生命周期验收（TTL、多设备、吊销） | 1 天 |

### 4.5 本地参考中转站（NewAPI + relay，4–5 天）

已落地：`services/relay/`（Node 22，零依赖，代码进 git）+ Docker Compose 拉起 NewAPI。

```
DSH ──登录协议/推理──▶ relay :18082 ──Bearer NEWAPI_KEY──▶ NewAPI :13000 ──▶ 上游
```

| 组件 | 职责 |
|---|---|
| NewAPI | 渠道、模型映射、配额/计费、日志、管理台 |
| relay | DSH 的 8 个账户 API、PKCE、token 签发/吊销、注册登录页、`/models` schema、推理代理、SSE 归一化 |

实测发现（决定 relay 必须存在）：

1. NewAPI 原生支持 `POST /v1/messages`，但认证是 `Authorization: Bearer`；DSH 发的是 `x-dsh-auth-token`，必须翻译。
2. NewAPI 把 OpenAI 流转成 Claude 格式时会**重复发 `message_start`**，DSH 会判 malformed；relay 已做归一化（只保留第一个）。
3. NewAPI 的 `/v1/models` 是 OpenAI 风格，缺少 `api_capabilities.anthropic_messages`，DSH 会隐藏这些模型；relay 用 `MODELS` 生成 DSH schema。
4. `/v1/files` 未实现，返回 404，DSH 自动回退 inline 图片。

环境：NewAPI 映射 `127.0.0.1:13000`（本机 3000 被 ssh 占用），relay `127.0.0.1:18082`。完整步骤见 [services/relay/README.md](services/relay/README.md)。

**已用真实上游验证**：NewAPI 渠道类型 `Anthropic (14)`、Base URL `https://api.deepseek.com/anthropic`、模型 `deepseek-flash` / `deepseek-v4-pro`；DSH UI 登录后发消息，真实模型返回 `OK`，事件序列只有一个 `message_start`。若走 OpenAI 兼容渠道，转换路径会重复 `message_start`，relay 已归一化。详见 [custom/assets/relay-e2e.png](custom/assets/relay-e2e.png)。

> NewAPI 是 **AGPLv3**：独立容器运行、不修改源码；不要把它和桌面安装包捆绑分发。

---

## 5. 工作流 C：RTL（10–13 天）

### 5.1 关键修正

| 原方案 | 修正 |
|---|---|
| 在 `tsdown.client.ts` 一处转换 | 共享转换器：`dsh-css-asset` emit 处 + 3 个动态 hook + `apps/web` Vite 插件 |
| 依赖 lightningcss 自动转换 | 自己写 visitor；**不设 targets**；成对处理 left/right 与四值简写 |
| 只做 CSS | 另做 `dir` 运行时、LTR 孤岛、JS 几何层 |
| 7 天 | 10–13 天 |

### 5.2 批次

| 批次 | 范围 | 工期 |
|---|---|---|
| **R0 基础** | 共享转换器 + `dir` 插件/设置/首屏预注入 + LTR 孤岛 + Chromium RTL harness + 几何层清单 | 3 天 |
| **R1 主路径** | primitives、layout、sidebar（含 files/terminal）、conversation、chat（含 TurnNavigator）、tool、input-trigger、attachment、user-questions、**dockkit**、**workspace** | 3 天 |
| **R2 常用面板** | 全部 settings、commands、model-selection、plan/goal/jobs、sidebar-right | 3 天 |
| **R3 低频** | trajectory、schedule、subagent、workflow、plugin market、feedback、deliverables、skill、sidebar-browser | 2 天 |
| **R4 不做** | experimental、voice、translation、browser/computer-use、inspector | — |

`ui-primitives` 是杠杆点；`ui-dockkit`/`ui-workspace` 每次会话可见，从 R2 提到 R1。

### 5.3 几何层（构建期无解）

- `ui-layout/AppFrame.tsx:226-231/301/303`：侧栏/右栏拖拽的 `+dx/-dx` 与内联 `left`；
- `ui-dockkit/TabPanel.tsx:133-134,195-196`：`scrollLeft`、`rect.left/right` 假设 LTR 原点；
- `ui-primitives/Tooltip.tsx:111-118,163`：`r.right` 物理定位；
- `ui-sidebar-right/.../SidebarRight.module.css:55`：`translateX` 出屏。

按计算出的 `direction` 取符号，不靠 CSS 镜像。

### 5.4 验收

- Chromium RTL harness：`dir=rtl` + 截图 + `scrollWidth <= clientWidth` + 关键区 `rect` + `computed direction`；
- 五屏人工验收：首屏/会话/输入/工具卡/设置；
- 代码块、终端、路径、URL 仍 LTR。

---

## 6. 构建与开发环境

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build              # 先 artifacts，再单独 build:web

pnpm dev:web                # HMR，3080
DSH_HOME=~/.dsh-dev pnpm dsh web --no-open
pnpm dev:desktop
pnpm package:desktop:mac:arm64:unsigned
```

- `build:web` 单独跑会失败，依赖 `build:artifacts`。
- 自有脚本放 `tools/`，不放上游 `scripts/`。
- 品牌版桌面注入独立 `DSH_HOME`，避免与官方 App 共用 `~/.dsh`。
- 开发实例用 `~/.dsh-dev`：session 格式迁移单向。

### 6.1 仓库约定（AGENTS.md）

- 文案走 locale 字典（`verify-client-ui-i18n` 会拦硬编码）；
- 颜色/圆角/字体只用 `--dsw-*` token；
- 注册即 effect，卸载可回收；
- 交付前 `build:check`；
- 改外部可感知面补 upgrade guide。

### 6.2 已实测

| 步骤 | 结果 |
|---|---|
| install | ✅ 1402 包 / 2m06s |
| typecheck | ✅ 5 gate / 60s |
| build | ✅ 9 gate / 14s |
| dev web | ✅ 3080；无 token 401、带 token 303 |

---

## 7. 里程碑（约 5–6 周）

| 阶段 | 内容 | 工期 | 依赖 |
|---|---|---|---|
| M0 | 基线/工具链/冒烟 | ✅ | — |
| M1 | 公开仓库 + base tag + 轻量 CI | 0.5 d | M0 |
| A1 | 品牌资产与标题/图标/关于面板 | 2–3 d | M1 |
| A2 | 品牌插件 + 禁用官方行 + fallback | 2–3 d | A1 |
| A3 | 测试/字体/残留清理 | 1 d | A2 |
| L1 | Mock 中转站 + 一致性脚本 | 1.5 d | M0 |
| L2 | 配置接线 | 0.5 d | L1 |
| L3 | 真实中转站联调 | 1 d | L2 + 你的中转站 |
| L4 | 边界与生命周期 | 1–2 d | L2 |
| E1 | Compose + NewAPI 渠道/模型/key | 0.5 d | M0 |
| E2 | relay 账户核心 + 页面 + SQLite | 1.5 d | E1 |
| E3 | 推理代理 + SSE 归一化 + `/models` | 1 d | E2 |
| E4 | 集成测试 + DSH 接线 | 1 d | E3 |
| E5 | 文档/配置/CI | 0.5 d | E4 |
| R0 | 转换器 + dir + 孤岛 + harness | 3 d | M0 |
| R1 | 主路径 RTL | 3 d | R0 |
| R2 | 常用面板 RTL | 3 d | R1 |
| R3 | 低频页面 RTL | 2 d | R2 |
| D1 | macOS 签名/公证 | 2 d | A |
| D2 | Windows 安装包/签名 | 2–3 d | A |
| D3 | 更新源 + 强制更新策略 | 2 d | D1/D2 |
| D4 | 遥测/许可证/发布流程 | 1 d | D1/D2 |

关键路径：M1 → A → E → L2/L3 → R0→R1 → D，约 **6–7 周**。R2/R3 与 D 可并行。

---

## 8. 上游同步（公开仓库不重写 main）

```
upstream：只做上游 tag 的 fast-forward 镜像
main：merge 引入 upstream，绝不 force-push
work/*：从 main 切出，按需 rebase 到 main
```

```bash
git fetch upstream --tags
git switch -c sync/upstream-<tag> main
git merge --no-ff <tag>
# 解冲突、跑门禁
git switch main && git merge --no-ff sync/upstream-<tag>
```

- 自有改动集中在 `packages/ext/*`、`custom/`、≤30 行/文件的补丁。
- 发布 tag 不可变；回滚用 `revert` 或回到上一个 `milestone/*`。
- 每周一次；升级后重跑品牌扫描、登录冒烟、RTL 五屏。

---

## 9. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| 将来要托管 Web | 现有登录不可用 | 本期不发 Web；若要做另立方案 |
| 中转站未实现 `/models` | 自建模型不可选 | 规范 §7.4；relay 已实现 schema 转换 |
| NewAPI 转换不符合 DSH 事件顺序 | 对话直接失败 | relay 已归一化重复 `message_start`；联调时抓 SSE 事件序列 |
| NewAPI AGPL | 分发合规 | 独立容器、不修改、不捆绑；桌面包只连远程 relay |
| inferenceOrigin 不一致 | token 发到官方 | 强制二者相等；启动自检 |
| RTL 转换遗漏 | 局部错位 | 共享转换器 + RTL harness + 五屏验收 |
| 签名依赖外部证书 | 发布延期 | 提前采购 Apple/Win 证书；先出未签名包 |
| 强制更新策略服务 | 签名构建失败 | 中转站加 `check_client_update` 或打无策略补丁 |
| 生产更新源写死 | 无法自建更新 | 小补丁改固定 origin；用静态桶 |
| 遥测默认开启 | 隐私合规 | bundle 置 disabled；发版前抓包验证 |
| 与官方 App 共用 home | 数据互相污染 | 独立 `DSH_HOME` + 迁移脚本 |
| 版本 bump 面大 | 发布流程重 | 用 `release:dsh`；测试版 `0.2.2-test.*` |
| 上游 pre-stable | 升级破坏 | 固定 base tag、merge 同步、每周复验 |

---

## 10. 需求与流程文档

- [custom/requirements.md](custom/requirements.md)：已冻结/待确认需求与验收标准。
- [custom/review-findings.md](custom/review-findings.md)：四份评审的完整结论与证据。
- [custom/login-relay-spec.md](custom/login-relay-spec.md)：中转站协议 v1.1。
- [custom/engineering-process.md](custom/engineering-process.md)：Issue→AI PR→CI→验收流水线。
- [custom/runbook.md](custom/runbook.md)：本地启动/停止、换网恢复、桌面联调与故障排查。
- [NOTICE](NOTICE) / [TRADEMARKS.md](TRADEMARKS.md)：上游归属与商标声明。
- [custom/files-api-research.md](custom/files-api-research.md)：Files API 标准、计费与网关方案调研。
- [custom/backlog.md](custom/backlog.md)：已明确但未做的待办（含 NewAPI `/v1/files`）。
- [custom/adr-001-relay-boundary.md](custom/adr-001-relay-boundary.md)：relay 外挂 vs 合并进 NewAPI 的架构决策。
- [FORK.md](FORK.md)：公开仓库入口与文档索引。

---

## 11. 下一步

1. 你提供：**品牌名称 + Logo（SVG/1024 PNG）**；域名和正式 appId 可以后补（测试期先用 `com.vv.test.dsh` + 现有图标）。
2. 你提供：**上游 API key**，我们导入 NewAPI 渠道，跑通「DSH 登录 → 对话 → 工具调用」完整链路。
3. 建公开仓库并推 `main`、打 `base/0.2.1-rc.2`（你说动就做）。
4. E 的本地实现已就绪；下一步补 DSH UI 端到端（登录页 → 注册 → 对话）与 R0。
