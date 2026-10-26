# vv-worker Windows x64 构建说明

> 给 Windows 上的 DSH/打包 agent。只构建 **unsigned 测试包**，不签名，不发布更新。

## 1. 分支与身份

```text
分支：brand/vv-worker
产品名：vv-worker
appId：com.vv.ds.worker
Home：C:\Users\<用户>\.vv-worker
userData：C:\Users\<用户>\AppData\Roaming\vv-worker
网关：https://vvworker.51vv.com
```

不要切到 `main`；`main` 仍是 DeepSeek-FA。

## 2. 安全同步

先检查本地状态：

```powershell
cd <dsh-rebrand 仓库目录>
git status --short
git branch --show-current
git log --oneline -3
```

不要在有未提交源码改动时切换或拉取。

首次切换：

```powershell
git fetch origin --prune
git switch -c brand/vv-worker --track origin/brand/vv-worker
```

已经有本地分支：

```powershell
git fetch origin --prune
git switch brand/vv-worker
git pull --ff-only origin brand/vv-worker
```

禁止使用：

```text
git reset --hard
git clean -fdx
git checkout -- .
```

`.desktop-build\` 是 gitignore 的构建产物；同步前把已有的最终 EXE 备份到仓库外。

确认：

```powershell
git rev-parse --short HEAD
git branch --show-current
```

## 3. 环境

要求：

- Windows 10/11 x64
- Node.js 24
- pnpm 11.28.5
- Git for Windows
- Python 3
- Visual Studio 2022 Build Tools，含 Desktop development with C++ 和 Windows 10/11 SDK
- 至少 15 GB 空闲磁盘

```powershell
git config --global core.longpaths true
corepack enable
corepack prepare pnpm@11.28.5 --activate
node --version
pnpm --version
pnpm install --frozen-lockfile
```

## 4. 镜像变量

在**同一个 PowerShell 窗口**执行：

```powershell
$env:DSH_DESKTOP_NPM_REGISTRY = "https://registry.npmmirror.com"
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
```

不要继承上一次 DeepSeek-FA 打包留下的品牌覆盖变量。若是新开 PowerShell 窗口即可；如不确定：

```powershell
Remove-Item Env:DSH_DESKTOP_APP_ID -ErrorAction SilentlyContinue
Remove-Item Env:DSH_DESKTOP_PRODUCT_NAME -ErrorAction SilentlyContinue
```

## 5. 构建

unsigned Windows 不需要 `.env.windows`、证书或更新策略。

```powershell
pnpm --dir apps/desktop run package:win:x64:unsigned `
  --build-version 0.2.1-rc.2.20261026.5
```

PowerShell 反引号是续行符；也可以写成一行。

产物：

```text
apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/
  vv-worker-0.2.1-rc.2.20261026.5-win-x64-unsigned.exe
```

记录：

```powershell
$file = "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\vv-worker-0.2.1-rc.2.20261026.5-win-x64-unsigned.exe"
Get-Item $file | Select-Object FullName,Length,LastWriteTime
Get-FileHash $file -Algorithm SHA256
```

构建失败时把以下日志发回来，不要只发最后一行：

```text
apps/desktop/.desktop-build/packaging-runs/<timestamp>-<id>/
  events.jsonl
  stdout.log
  stderr.log
```

## 6. 安装验收

1. 在干净的 Windows 10/11 x64 上安装 EXE。
2. SmartScreen → 更多信息 → 仍要运行。
3. 开始菜单显示 `vv-worker`。
4. 首次启动创建：
   ```text
   C:\Users\<用户>\.vv-worker
   C:\Users\<用户>\AppData\Roaming\vv-worker
   ```
5. 登录页指向 `https://vvworker.51vv.com`。
6. 验证文字对话、图片附件、模型菜单、账号用量页。
7. 托盘图标是 vv-worker mascot。
8. 确认 `C:\Users\<用户>\.dsh` 未被修改。

## 7. 上传

只上传最终 EXE，不改服务器配置、不重启 NewAPI、不覆盖已有版本。

有 SSH key：

```powershell
scp "<EXE 路径>" root@104.248.155.54:/opt/dsh-gateway/downloads/
ssh root@104.248.155.54 "cd /opt/dsh-gateway/downloads && ls -lh 'vv-worker-0.2.1-rc.2.20261026.5-win-x64-unsigned.exe' && sha256sum 'vv-worker-0.2.1-rc.2.20261026.5-win-x64-unsigned.exe'"
curl.exe -I "https://ds.openrouters.org/downloads/vv-worker-0.2.1-rc.2.20261026.5-win-x64-unsigned.exe"
```

没有 SSH key 时只回报：

```text
commit:
EXE path:
filename:
size:
SHA-256:
```

不要发送密码、token 或私钥。
