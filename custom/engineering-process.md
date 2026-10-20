# 工程流程与 AI 自动化（v1）

> 目标：**人只做两件事——需求澄清、最终验收**；其余（拆解、实现、测试、文档、PR、CI、发布准备、上游同步）由 AI 执行，CI 负责证明。
> 适用：`longge2023git/dsh-rebrand`（公开仓库，DSH 0.2.1-rc.2 基线）。

---

## 1. 角色与门禁

| 角色 | 负责 | 不负责 |
|---|---|---|
| **你（产品/验收）** | 需求澄清、优先级、最终验收、对外发布批准 | 写代码、跑测试、修 CI |
| **AI（实现）** | 拆任务、编码、单测/快照、文档、录 GIF、开 PR、修 CI、同步上游 | 需求取舍、安全协议决策、发布 |
| **CI（证据）** | lint/typecheck/unit/build/Web 快照/打包冒烟 | 判断产品是否「好用」 |

只有三道人工门：

1. **需求门**：Issue 里冻结验收标准（15 分钟）。
2. **验收门**：看 GIF/真机 5 屏，勾选 checklist（10 分钟）。
3. **发布门**：Release Environment 手动 Approve（对外版本才需要）。

---

## 2. 需求入口：Issue Form

新建 `.github/ISSUE_TEMPLATE/requirement.yml`，必填字段：

| 字段 | 说明 |
|---|---|
| 背景 | 为什么做，谁在用 |
| 目标行为 | 一段用户视角描述 |
| 非目标 | 明确不做什么（防蔓延） |
| 验收标准 | 逐条 Given-When-Then，可执行、可观察 |
| 工作流 | `A 品牌` / `B 登录` / `C RTL` / `D 分发` |
| 基线 | `base/0.2.1-rc.2`（固定 commit） |
| 证据位 | 截图/GIF/测试命令，验收时填 |
| 优先级 | P0 阻断 / P1 本期 / P2 可延后 |

**Definition of Ready（DoR）**：可测、只涉及一条工作流、无未决决策、影响面已列、基线已钉。满足后打 `ai/ready` 进入 AI 队列；否则 `status/needs-info`，AI 只提问不动手。

**变更控制**：已冻结的验收标准要改，在 Issue 追加 `## Change N`（原因、影响、需重跑的检查）；范围变化 >20% 重开 Issue，不在原 PR 上偷偷扩。

---

## 3. 开发：原子任务 + worktree

```bash
git fetch upstream --tags
git worktree add ../wt-<issue> -b work/<issue>-<slug> main
```

- 一个任务 = **一个可验证行为**，≤3 个文件、≤200 行 diff；大了就拆。
- commit：`feat(brand|relay|rtl|dist): …` + `Refs #<issue>`。
- PR 描述固定块：`Motivation` / `Changes` / `Testing` / `Proof`（GIF/截图）/ `Rollback` / `Upstream impact`（`git diff --stat upstream/master`）。
- **DoD**：代码 + 测试 + 文档/快照 + UI 证据 + 变更说明；碰到外部可感知面补 upgrade guide。

### 上游同步（公开仓库不重写 main）

```
upstream 分支：只做上游 tag 的 fast-forward 镜像
main：通过 merge 引入 upstream，绝不 force-push
work/*：从 main 切出；需要时 rebase 到 main
```

```bash
git fetch upstream --tags
git switch -c sync/upstream-<tag> main
git merge --no-ff <tag>            # 解冲突、跑门禁
git switch main && git merge --no-ff sync/upstream-<tag>
```

- 每周一次；冲突集中在自有改动文件，控制在 ≤30 行/文件。
- 发布 tag 不可变；回滚用 `git revert` 或回到上一个 `milestone/*` tag。
- 不把 `node_modules`、`.dsh-build`、`custom/mock-relay/*.db` 入库。

---

## 4. 测试策略（按工作流）

| 层 | 命令 | 用在哪 |
|---|---|---|
| 单元 | `pnpm exec vitest run <pkg>` | 品牌组件/插槽、RTL 转换函数、mock relay |
| 真实组合 | Loader 启动 test-only `cordis.yml` | 品牌插件是否真被加载 |
| 会话快照 | `pnpm run test:snapshot` | 登录/推理影响会话时（`record` 需 key，审 diff） |
| Web 浏览器 | `DSH_SNAPSHOT=replay pnpm run test:web:built` | UI 回归；已有 Chromium harness 可复用 |
| RTL 视觉 | 新增 `apps/web/tests/rtl/*.e2e.ts` | `dir=rtl` 下截图 + `scrollWidth`/`rect`/`computed direction` 断言 |
| 打包冒烟 | `pnpm package:desktop:mac:arm64:unsigned` | 启动产物、版本号、首启截图 |

**人工验收压缩为 checklist**（每个 Issue 只勾这几项）：

- 品牌：首屏、侧栏、会话、输入框、关于面板；无 `DeepSeek Harness` 残留。
- 登录：注册→登录→重启仍登录→登出→过期重登；错误提示可读。
- 推理：一次流式对话 + 一次工具调用 + 一次取消。
- RTL：首屏/会话/输入/工具卡/设置五屏无错位、无横向溢出。
- 分发：干净机器安装→启动→升级→卸载。

---

## 5. CI/CD（公开仓库）

上游 25 个 workflow 绑企业 runner，公开仓库跑不了，**不能照搬**。新建 `.github/workflows/ci-public.yml`：

| Job | 内容 | Runner | 触发 |
|---|---|---|---|
| `ci-static` | `pnpm run typecheck` + `pnpm run lint` + `pnpm run test:docs` | ubuntu-latest | PR |
| `ci-unit` | `pnpm run test`（可按包过滤） | ubuntu-latest | PR |
| `ci-browser` | `pnpm run build:artifacts` + `test:web:built`（replay） | ubuntu-latest | PR（UI 相关路径） |
| `ci-required` | 聚合上面三个，分支保护只要求这一个 | ubuntu-latest | PR |
| `ci-package` | `macos-14` 未签名打包 + 启动冒烟 | macos-14 | 夜间/手动 |

要点：

- 公开仓库的标准 runner **免费**；macOS 只放打包，避免排队拖慢 PR。
- 缓存：pnpm store（`hashFiles('pnpm-lock.yaml')`）、Playwright 浏览器、Node 编译缓存。
- `concurrency` 取消旧跑，单 job 45 分钟超时。
- **禁止 `pull_request_target`**；fork PR 不注入 secrets，e2e 自动跳过。
- 发布：tag `r<semver>` + `workflow_dispatch` + Environment `release` 必审；停用上游 npm publish / desktop-publish 工作流。

---

## 6. AI 自动化边界

| 完全自动 | 必须人工 |
|---|---|
| 重构、测试/快照、文档、依赖升级、视觉 diff 初筛、上游同步、录 GIF、周报 | 需求取舍、协议/安全变更（对照 `custom/login-relay-spec.md` §3/§10）、对外发布、最终验收、品牌/商标决策 |

防不可维护：

- 核心（`agent-loop`、session format）不改；确需改时人工批准。
- 上游热文件补丁 ≤30 行，每次升级后复验。
- 每个 PR 附 `diff --stat`，超过 200 行拆。
- 保留可回滚点：`base/<tag>`、`milestone/<阶段>`、`revert`。

---

## 7. 度量（每周自动生成）

`tools/metrics.mjs` 调 `gh pr list --json` 输出：

- 交付周期：Issue 创建 → merge 中位数。
- 返工率：被打回 PR / 总 PR。
- CI 首跑通过率。
- 验收一次通过率。
- 上游冲突文件数（`git diff --name-only main upstream/master`）。

---

## 8. 第一个迭代（示例：A2 品牌插件）

1. **Issue**：验收 =「侧栏显示自有标/名；UI 无 DeepSeek Harness；`verify-client-ui-i18n` 通过；首启截图无官方标识」。
2. **AI**：`work/12-brand` → 建 `packages/ext/brand-<you>/`（`package.json`、`cordis.patch.yml`、`src/client/index.tsx`、`locales/{zh,en}.ts`）→ 在 `tsconfig.client.json` 注册 → 禁用 `ui-brand-official` 行并插入自有行 → 单测（卸载回收）+ Web 截图。
3. **CI**：`ci-static` / `ci-unit` / `ci-browser` 全绿。
4. **验收**：看 30s GIF（首屏+侧栏+关于），在 Issue 勾选。
5. **合并**：squash merge → 打 `milestone/A2` tag。

---

## 9. 需要新建的仓库资产

| 文件 | 作用 |
|---|---|
| `.github/ISSUE_TEMPLATE/requirement.yml` | 需求冻结 |
| `.github/pull_request_template.md` | Evidence/Rollback/Upstream impact |
| `.github/workflows/ci-public.yml` | 公开仓库 CI |
| `.github/CODEOWNERS` | 核心路径人工评审 |
| `tools/metrics.mjs` | 周报度量 |
| `apps/web/tests/rtl/` | RTL 视觉回归 harness |
| `custom/mock-relay/` | 协议一致性 mock + 测试脚本 |
| `NOTICE` | 上游归属与修改声明 |

---

## 10. 版本与发布

### 10.0 发布前冻结项

appId、产品名、更新源域名、协议 scheme 在**首个对外版本前**冻结；之后修改会导致更新链断裂与用户数据迁移。品牌名/Logo 到位后先出一版未签名包验证，再冻结。

### 10.1 版本号

- Electron 要求桌面壳版本 == 根 `package.json` 版本；不能只改一个。
- 测试版：`0.2.2-test.YYYYMMDD.N`；稳定版：`0.2.2` 或 `0.3.0`（`latest` 通道拒绝 prerelease）。
- 版本变更用 `pnpm run release:dsh <version>`（会改约 344 个 manifest + lockfile），单独一个 PR。
- tag：`rebrand-v<version>`，上游 `dsh-v*` 保持不动。

### 10.2 发布前检查

1. `pnpm run typecheck && pnpm run lint && pnpm run build`
2. 品牌扫描无官方残留；`LICENSE`/`THIRD_PARTY_NOTICES` 已随包。
3. 遥测关闭验证：抓包确认无 DeepSeek collector 请求。
4. 登录/推理冒烟：注册→登录→对话→登出→重登。
5. RTL 五屏截图。
6. 未签名包先内测；签名包在私有环境构建（证书不进公开仓库）。

### 10.3 发布与回滚

- 灰度：`stagingPercentage` 10 → 50 → 100，每档观察 24h。
- `allowDowngrade=false`：回滚只能发更高版本或还原 feed（已升级用户不降级）。
- macOS：DMG 与 ZIP 分别公证并 staple；Windows：上传 `.exe.blockmap`。
- 发布后 24h 检查：崩溃、登录失败率、更新成功率。
