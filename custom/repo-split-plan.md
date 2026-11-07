# 按品牌拆分仓库的规划

> 状态：2026-11-07 方案稿。目标是把 FA 和 RU 交给两个团队，各自独立开发、发布、部署。

## 1. 现状（事实）

| 仓库 | 内容 | 规模 |
|---|---|---|
| `dsh-rebrand` | harness fork；`main` + `brand/deepseekfa` + `brand/ru-deepseek-ru` + `brand/vv-worker`；站点/控制台在独立分支 `feat/mini-login` | 22k 提交，.git 397MB |
| `new-api-deepseek` | 网关（new-api fork），两个品牌共用；`new-api-deepseek-fa` 是它的 worktree | 5.2k 提交，.git 89MB |

**两个必须先纠正的错位**：

1. **站点/控制台不在品牌分支上**。`console/`（48 文件）、`site/`（17）、`tools/`（12）、`custom/`（29）都只在 `feat/mini-login` 上；`brand/*` 分支里 `console:0 site:0`。任何人从品牌分支打包都拿不到官网和迷你站。
2. **品牌差异极小**：FA 相对 `main` 只改 22 个文件，RU 改 157 个（其中 100+ 是 ru locale、测试期望、资源）。也就是说"一个品牌"≈ harness + 20~150 个定制文件。

## 2. 目标形态

```
deepseek-fa        独立仓库：客户端 + 官网 + 迷你站 + E2E + FA 部署配置
deepseek-ru        独立仓库：同上（RU）
new-api-deepseek   共享网关代码（平台团队维护，两个品牌用环境变量区分）
dsh-upstream       官方 harness fork（可选，作为两仓库的 upstream remote）
```

取舍说明：

- **不做"薄仓库 + 共享 core"**：那样要维护一个私有的 harness 包和一套版本兼容矩阵，两个团队谁也跑不起来。每个品牌一份完整 fork 反而简单、可离线、可独立升级。
- **网关继续共享**：代码是同一套，差异只在 `DSH_PUBLIC_ORIGIN` / `DSH_BRAND_NAME` / `DSH_EMAIL_LANG` 和部署配置。拆成两份会立刻分叉，且安全修复要打两遍。
- **官网/迷你站各归各团队**：文案、品牌、活动都要独立；接受分叉。等两边的确稳定了，再考虑抽 `dsh-brand-kit` 共享模板（第二阶段，不急）。

## 3. 每个品牌仓库的内容

| 目录 | 来源 | 归属 |
|---|---|---|
| `apps/`、`packages/`、`vendor/`、`docs/` | harness（品牌分支已含定制） | 品牌团队 |
| `site/`、`console/` | `feat/mini-login` 分支 | 品牌团队 |
| `tools/e2e/` | `feat/mini-login` 分支 | 品牌团队（先复制，后续可抽共享包） |
| `custom/` | 品牌分支已有的品牌文档 + 站点分支的 `site.md`/`console.md`/`console-spec.md`/`windows-handoff.md` | 品牌团队 |
| `deploy/` | **新增**：从服务器导出并脱敏的 compose、env 模板、nginx 配置 | 品牌团队 |
| `scripts/windows/` | 已有打包脚本 | 品牌团队 |

`deploy/` 建议结构：

```
deploy/
  gateway/
    docker-compose.yml        # 不含密码
    env.example               # DSH_PUBLIC_ORIGIN / DSH_BRAND_NAME / DSH_EMAIL_LANG / SMTP 占位
  nginx/
    <domain>.conf             # 从线上导出，含 CSP、/me/、/downloads/
  README.md                   # 部署步骤、回滚、备份位置
```

## 4. 共享边界与规则

| 事项 | 规则 |
|---|---|
| harness 上游更新 | 每个品牌仓库各自 `git remote add upstream`，按需 merge；冲突各自处理 |
| 网关代码 | 只在 `new-api-deepseek` 改；品牌团队提 PR，平台团队合并，然后各自升级镜像 tag |
| 网关部署 | 各品牌 `deploy/gateway/` 自己维护；环境变量值不同 |
| E2E 工具 | 先各复制一份（内容小），两边都改了再抽 npm 包 |
| 密钥 | 不进仓库；沿用 `~/.deepseek-secrets`（按团队分发） |
| 版本号 | 独立：`deepseek-fa-0.2.1-rc.2.<date>` / `deepseek-ru-...`；不再强求两品牌对齐 |
| 发布 | 各自仓库打 tag、各自打 Windows/macOS 包、各自上传自己的服务器 |

## 5. 迁移步骤

### 第 0 步（必须先做）：把站点分支合进两个品牌分支

在旧仓库完成，保证克隆下来的新仓库是完整的：

```bash
cd ~/projects/ai/deepseek_rebuild
git switch brand/deepseekfa
git merge feat/mini-login        # 预计冲突集中在 custom/ 文档与 apps/desktop/src
# 逐个解决后提交
git switch brand/ru-deepseek-ru
git merge brand/deepseekfa        # 或各分支独立 merge feat/mini-login
```

冲突处理原则：**代码取品牌分支，站点/控制台/文档取 `feat/mini-login`**；`apps/desktop/src` 两边的改动都要保留。

### 第 1 步：各建一个新仓库并推送完整历史

```bash
# FA
git clone --branch brand/deepseekfa ~/projects/ai/deepseek_rebuild ~/projects/ai/deepseek-fa
cd ~/projects/ai/deepseek-fa
git remote set-url origin git@github.com:<org>/deepseek-fa.git
git push -u origin brand/deepseekfa:main
git branch -m brand/deepseekfa main

# RU 同理（克隆 brand/ru-deepseek-ru）
```

> 每个仓库约 400MB。团队首次克隆建议 `git clone --filter=blob:none`（partial clone），日常只拉改动。

### 第 2 步：补 `deploy/` 与 CI

- 从服务器导出 compose/env/nginx（脱敏），放进 `deploy/`；
- `.github/workflows/`：typecheck + local E2E（每次 PR）、Windows/macOS 打包（按 tag）；
- 每个仓库配自己的 GitHub Actions runner（Windows 打包机可以共用，按仓库区分 job）。

### 第 3 步：归档旧仓库

`dsh-rebrand` 设为 archived + 在 README 顶部写明"已拆分到 deepseek-fa / deepseek-ru"。**不要删除**，历史还在用。

### 第 4 步（可选）：瘦身

若嫌 400MB 太大，可用 `git filter-repo` 只保留品牌相关提交 + 一个上游基线提交。代价是失去完整 blame，**不建议第一阶段做**。

## 6. 团队协作约定

1. **谁拥有什么**：品牌仓库 = 品牌团队全权；网关 = 平台团队；harness 上游 = 各自跟进。
2. **跨品牌修复**：网关 bug 修在共享仓库；站点/控制台的同类 bug 需要两边各自提 PR（接受重复，换取自治）。
3. **发布不互相等待**：两边版本号、镜像 tag、下载页各自维护；共享网关升级需要协调窗口。
4. **文档归属**：每品牌 `custom/` 独立；跨品牌的服务端事实（如网关限流、DSH 协议路径约束）放在网关仓库的 `docs/`，两边引用链接。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 两仓库各 400MB，克隆慢 | partial clone；CI 用浅克隆 |
| 站点/控制台分叉后修复要打两遍 | 第一阶段接受；稳定后抽共享模板 |
| 网关共享代码被某一品牌的需求带偏 | 平台团队评审 + 环境变量优先，不写死品牌逻辑 |
| 合并 `feat/mini-login` 时冲突较大 | 先在一个品牌分支做，解决完再把该分支合到另一个；冲突原则见第 0 步 |
| 密钥/证书随仓库泄露 | `deploy/` 只放模板；真实值留在 secret store |

## 8. 建议执行顺序

1. **今天**：把 `feat/mini-login` 合并进两个品牌分支（消除错位）——我可以直接做。
2. **本周**：建两个新仓库、推送、补 `deploy/`、配 CI。
3. **下周**：两个团队各自跑通一次完整发布（Windows + macOS + 部署），旧仓库归档。
