# DeepSeek-FA Windows x64 构建指南

> Windows agent 构建完成后的上传步骤见 [Windows agent 交接单](windows-agent-handoff.md)。

> 给 Windows 上的 DSH 执行。当前代码版本：`8bdb204b1d`。
> 本次只出 **unsigned 测试包**，不配置 Windows 代码签名和自动更新。

## 1. 构建机器要求

- Windows 10/11 x64（不能从 macOS 交叉打 Windows 安装包）
- Node.js **24**
- pnpm **11.28.5**（通过 Corepack）
- Git for Windows
- Python 3
- Visual Studio 2022 Build Tools，勾选：
  - Desktop development with C++
  - Windows 10/11 SDK
- 建议开启 Git 长路径：

```powershell
git config --global core.longpaths true
```

磁盘至少预留 15 GB。

## 2. 拉代码

```powershell
git clone https://github.com/longge2023git/dsh-rebrand.git
cd dsh-rebrand
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
```

以 `main` 最新提交为准。本文对应的代码基线是 `6ebb8bb4eb`；之后的文档提交不影响构建。

如果 Windows 端已经有仓库，请先确认：

```powershell
git status --short
git pull --ff-only origin main
```

不要在有未提交改动时打包。

## 3. 安装依赖

```powershell
corepack enable
corepack prepare pnpm@11.28.5 --activate
node --version
pnpm --version
pnpm install --frozen-lockfile
```

`node --version` 应为 `v24.x`。

## 4. 配置国内镜像（推荐）

在 **同一个 PowerShell 窗口** 设置：

```powershell
$env:DSH_DESKTOP_NPM_REGISTRY = "https://registry.npmmirror.com"
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
```

如果公司网络需要代理：

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
```

代理端口按实际修改。不要提交代理凭据。

## 5. 打包

当前 unsigned Windows 构建**不需要** `.env.windows`、签名证书或更新策略文件。
脚本会自动使用：

```text
appId: com.deepseek-fa.harness
productName: DeepSeek-FA
unsigned: true
```

执行：

```powershell
pnpm --dir apps/desktop run package:win:x64:unsigned `
  --build-version 0.2.1-rc.2.20261024.1
```

PowerShell 反引号是续行符；也可以写成一行。

产物目录：

```text
apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/
```

预期文件名：

```text
deepseek-fa-0.2.1-rc.2.20261024.1-win-x64-unsigned.exe
```

打包日志在：

```text
apps/desktop/.desktop-build/packaging-runs/<timestamp>-<id>/
```

如果失败，把该目录里的 `events.jsonl`、`stdout.log`、`stderr.log` 发回来，不要只发最后一行报错。

## 6. 安装验收

1. 在干净的 Windows 10/11 x64 上安装 EXE。
2. SmartScreen 提示“Windows 已保护你的电脑”时：
   - 更多信息 → 仍要运行。
3. 开始菜单应显示 `DeepSeek-FA`。
4. 首次启动应创建：

```text
C:\Users\<用户>\.deepseek-fa
C:\Users\<用户>\AppData\Roaming\DeepSeek-FA
```

5. 打开后应显示 `ds.openrouters.org` 登录页，使用邮箱注册/登录。
6. 验证：
   - 文本对话
   - 图片附件
   - 模型菜单中的 `DeepSeek-FA Account`
   - 账号页“查询用量/充值”
7. 托盘图标应为简化 Persian 鲸鱼。
8. 确认官方 DSH 不受影响：

```text
C:\Users\<用户>\.dsh
```

不要读写、删除或覆盖这个目录。

## 7. 卸载检查

- 卸载 DeepSeek-FA 后，官方 DSH 仍能启动。
- 复测时如需干净状态，删除：

```text
C:\Users\<用户>\.deepseek-fa
C:\Users\<用户>\AppData\Roaming\DeepSeek-FA
```

只删这两个品牌目录，不要删 `.dsh`。

## 8. 本次不做的内容

- 不签 Windows 代码签名证书
- 不配置自动更新源
- 不发布到更新仓库
- 不接正式品牌签名

正式分发前需要 EV 代码签名证书 + SignTool + 独立更新源；届时使用不带 `:unsigned` 的命令，并配置 `.env.windows` 或 machine preset。

## 9. 上传到服务器

服务器已准备好只读下载目录：

```text
/opt/dsh-gateway/downloads/
```

公网地址：

```text
https://ds.openrouters.org/downloads/<文件名>
```

如果 Windows 机器有服务器 SSH key，上传：

```powershell
scp "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\deepseek-fa-0.2.1-rc.2.20261024.1-win-x64-unsigned.exe" `
  root@104.248.155.54:/opt/dsh-gateway/downloads/
```

然后在服务器复核：

```bash
ssh root@104.248.155.54
ls -lh /opt/dsh-gateway/downloads/
sha256sum /opt/dsh-gateway/downloads/<文件名>
curl -sSI https://ds.openrouters.org/downloads/<文件名> | head
```

要求：

- 只上传安装包，不要动 `/opt/dsh-gateway/data/`
- 不要重启 `dsh-newapi`
- 不要改 nginx 配置
- 文件名必须唯一，不要覆盖旧版本
- 上传后把 SHA-256 和下载 URL 回报

如果 Windows 机器没有服务器 SSH key：

- 不要尝试用密码登录，也不要把密码发到聊天里
- 把 EXE 路径、SHA-256、构建日志回报，由 Mac 侧负责上传

## 10. 完成后回报

请回报：

```text
git rev-parse HEAD
生成的 EXE 完整路径
EXE SHA-256
安装/启动/登录/文本/图片/托盘 结果
失败时的 packaging-runs 目录
```

不要发送证书、token、私钥或 `.env.windows` 内容。
