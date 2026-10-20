#!/usr/bin/env bash
# DSH 二次开发 —— 本机引导脚本（幂等，可重复执行）
#
# 只做三件事：对齐工具链、把本目录变成「上游基线 + 自有文件」的 git 仓库、安装依赖。
# 不会：创建云端仓库、推送、改全局 git 配置（除非显式给了 GIT_NAME/GIT_EMAIL）。
#
# 用法：
#   scripts/bootstrap.sh                     # 工具链 + 仓库 + 安装
#   scripts/bootstrap.sh --verify            # 追加 typecheck + build:web
#   GIT_NAME=... GIT_EMAIL=... scripts/bootstrap.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM="https://github.com/deepseek-ai/deepseek-harness.git"
BASE_TAG="dsh-v0.2.1-rc.2"
PNPM_VERSION="11.28.5"
DO_VERIFY=0
[[ "${1:-}" == "--verify" ]] && DO_VERIFY=1

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

cd "$ROOT"

# ---------------------------------------------------------------- 1. Node.js
log "检查 Node.js"
command -v node >/dev/null || die "未找到 node，请先安装 Node.js 22.19+ 或 24+"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [[ "$NODE_MAJOR" == "22" && "$NODE_MINOR" -lt 19 ]] || [[ "$NODE_MAJOR" -lt 22 ]]; then
  die "Node $(node -v) 不满足 ^22.19.0 || >=24.0.0"
fi
[[ "$NODE_MAJOR" -ge 25 ]] && warn "Node $(node -v) 并非上游 CI 覆盖的 22/24/26，遇到怪问题先换版本"
echo "node $(node -v)  OK"

# ---------------------------------------------------------------- 2. pnpm
log "检查 pnpm@${PNPM_VERSION}"
if ! command -v pnpm >/dev/null 2>&1 || [[ "$(pnpm -v 2>/dev/null || true)" != "$PNPM_VERSION" ]]; then
  echo "安装 pnpm@${PNPM_VERSION} ..."
  npm i -g "pnpm@${PNPM_VERSION}"
else
  echo "pnpm $(pnpm -v)  OK"
fi
[[ "$(pnpm -v)" == "$PNPM_VERSION" ]] || die "pnpm 版本不是 ${PNPM_VERSION}，拒绝继续（会改 lockfile）"

# ---------------------------------------------------------------- 3. git 身份
log "检查 git 身份"
if [[ -n "${GIT_NAME:-}" && -n "${GIT_EMAIL:-}" ]]; then
  git config --global user.name  "$GIT_NAME"
  git config --global user.email "$GIT_EMAIL"
  echo "已设置全局身份：$GIT_NAME <$GIT_EMAIL>"
fi
if [[ -z "$(git config --global user.name || true)" || -z "$(git config --global user.email || true)" ]]; then
  warn "全局 user.name / user.email 未设置，提交会失败。先执行："
  warn '  git config --global user.name  "your-name"'
  warn '  git config --global user.email "you@example.com"'
fi

# ---------------------------------------------------------------- 4. 仓库
log "准备仓库（base tag: ${BASE_TAG}）"
if [[ ! -d .git ]]; then
  git init -b main
  git remote add upstream "$UPSTREAM"
  git fetch upstream --tags
  git checkout -B main "$BASE_TAG"
else
  git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM"
  git rev-parse -q --verify "refs/tags/${BASE_TAG}" >/dev/null || git fetch upstream --tags
  if ! git rev-parse -q --verify HEAD >/dev/null; then
    git checkout -B main "$BASE_TAG"
  else
    echo "已有提交，跳过基线切换（当前：$(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)）"
  fi
fi
git rev-parse -q --verify "refs/tags/${BASE_TAG}" >/dev/null || die "缺少 tag ${BASE_TAG}"
echo "当前 HEAD：$(git rev-parse --short HEAD)  $(git log -1 --format=%s 2>/dev/null || true)"

# ---------------------------------------------------------------- 5. 依赖
log "安装依赖（pnpm install --frozen-lockfile）"
pnpm install --frozen-lockfile

# lefthook hooks 若因缓存被跳过，按上游说明补装
if [[ ! -f .git/hooks/pre-commit ]]; then
  node scripts/install-lefthook.mjs || warn "lefthook 安装失败，可稍后手动执行 node scripts/install-lefthook.mjs"
fi

# ---------------------------------------------------------------- 6. 验证
if [[ "$DO_VERIFY" == "1" ]]; then
  log "typecheck"
  pnpm run typecheck
  # 必须走完整 build：build:web 依赖 build:artifacts 产出的工作区运行时
  log "build（artifacts + check，约 5–10 分钟）"
  pnpm run build
fi

cat <<EOF

完成。下一步：

  pnpm dev:web                                   # 开发服务器（HMR，3080）
  DSH_HOME=~/.dsh-dev pnpm dsh web --no-open     # 构建产物运行（先 pnpm run build）

云端同步（公开仓库，仓库名按需替换）：

  gh repo create longge2023git/dsh-rebrand --public --source=. --remote=origin --push

EOF
