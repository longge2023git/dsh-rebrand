# Windows agent 交接单：构建与上传

> 给 Windows 上的 DSH agent。先 `git pull`，然后按本文执行。
> 当前服务器下载目录已准备好，不需要重新部署 NewAPI。

## 0. 同步仓库

```powershell
cd <dsh-rebrand 仓库目录>
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
```

构建代码基线是 `6ebb8bb4eb`；之后只有文档提交，不影响构建。

## 0.1 同步前保护本地内容

先检查：

```powershell
git status --short
git branch --show-current
git log --oneline -3
```

- 如果有未提交的源码改动，不要直接 `git pull`；先提交到本地分支，或：
  ```powershell
  git stash push -u -m "win-local-before-sync"
  ```
- 如果有本地提交，先建备份分支：
  ```powershell
  git branch win-backup-20261024
  ```
- 构建产物 `.desktop-build\` 是 gitignore 的，正常 `git pull` 不会删除。
- 但同步前仍建议把最终 EXE 复制到仓库外，例如：
  ```powershell
  Copy-Item "<EXE>" "$env:USERPROFILE\Downloads\"
  ```
- 不要执行：
  ```text
  git reset --hard
  git clean -fdx
  git checkout -- .
  ```
  这些命令才可能删除本地修改/未跟踪产物。
- `git pull --ff-only` 在本地与远端分叉、或改动会被覆盖时会中止，不会静默丢弃。

## 1. 确认构建产物

当前预期产物：

```text
apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/
  deepseek-fa-0.2.1-rc.2.20261024.1-win-x64-unsigned.exe
```

如果实际版本号不同，以实际产物为准，不要为了匹配本文而重命名版本。

计算并记录：

```powershell
$file = "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\<实际文件名>.exe"
Get-Item $file | Select-Object FullName,Length,LastWriteTime
Get-FileHash $file -Algorithm SHA256
```

## 2. 上传策略

服务器 IP、SSH 和下载目录见 [server-deployment](server-deployment.md#服务器)；下文用 `$gw` 指代 `root@<服务器 IP>`。先在同一个 PowerShell 窗口设置：

```powershell
$gw = "root@<服务器 IP>"
```

公网下载地址：`https://ds.openrouters.org/downloads/<文件名>`

### 有服务器 SSH key 时

```powershell
scp "<实际 EXE 路径>" "${gw}:/opt/dsh-gateway/downloads/"
```

复核：

```powershell
ssh $gw "cd /opt/dsh-gateway/downloads && ls -lh '<文件名>' && sha256sum '<文件名>'"
curl.exe -I "https://ds.openrouters.org/downloads/<文件名>"
```

预期 HTTP 200。

### 没有 SSH key 时

不要使用密码登录，不要在聊天里发送密码/token。
只回报 EXE 路径、SHA-256、文件大小、构建 commit，由 Mac 侧上传。

## 3. 禁止事项

- 不改 `/opt/dsh-gateway/data/`
- 不重启 `dsh-newapi`
- 不改 nginx 配置
- 不覆盖已有版本
- 不上传 `.env`、证书、私钥、token
- 不在服务器上重新构建或升级 NewAPI

## 4. 回报给 Mac 侧

```text
Windows build commit:
EXE path:
EXE filename:
EXE size:
SHA-256:
Upload URL:
HTTP status:
构建/安装验证结果:
```

如果上传失败，附上失败命令和服务器返回，不要只发一句“失败了”。
