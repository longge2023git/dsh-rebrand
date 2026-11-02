# Windows 打包交接单（FA / RU）

> 给 Windows 机器上的执行方。目标是产出 **unsigned 测试安装包**，不做代码签名与自动更新。
> 一份脚本 + 一份验收清单；任何一步失败，按第 7 节回报。

## 1. 机器要求

| 项 | 要求 |
|---|---|
| 系统 | Windows 10/11 x64（**不能从 macOS 交叉打 Windows 包**） |
| Node.js | **24.x**（`node --version` 应为 v24） |
| pnpm | 11.28.5（脚本用 Corepack 自动激活） |
| Git | Git for Windows，并执行 `git config --global core.longpaths true` |
| Python | 3.x（加入 PATH） |
| 编译工具 | Visual Studio 2022 Build Tools：Desktop development with C++ + Windows 10/11 SDK |
| 磁盘 | 至少 15 GB 空闲 |

## 2. 品牌与分支（不要从 `main` 打）

| 品牌 | 分支 | 网关域名 | 产物前缀 |
|---|---|---|---|
| DeepSeek-FA | `brand/deepseekfa` | `https://deepseekfa.com` | `deepseek-fa` |
| DeepSeek-RU | `brand/ru-deepseek-ru` | `https://deepseek-ru.org` | `deepseek-ru` |

`main` 是共享基底，品牌常量与域名不在上面；从 `main` 打包会得到错误的域名或 vv-worker 品牌。

## 3. 一条命令

```powershell
git clone https://github.com/longge2023git/dsh-rebrand.git
cd dsh-rebrand
pwsh -File scripts/windows/build-desktop.ps1 -Brand fa -BuildVersion 0.2.1-rc.2.20261103.1
```

脚本会：校验 Node 版本 → 激活 pnpm → 设国内镜像 → 切到对应分支并 `pull --ff-only` → 拒绝脏工作区 → `pnpm install --frozen-lockfile` → 打包 → 输出 SHA256 与 `build-report.json`。

RU 版把 `-Brand fa` 换成 `-Brand ru`；不传 `-BuildVersion` 时默认 `0.2.1-rc.2.<当天日期>.1`。

两个品牌可以在一台 Windows 上连续构建（脚本会切分支）；但**每次换品牌都要重新 `pnpm install`**（`--frozen-lockfile`），不要复用同一份 node_modules 快照。

**版本号规则**：`0.2.1-rc.2.<yyyyMMdd>.<序号>`，同一天第二次构建序号递增（`.2`），不得与已发布版本重复。

## 4. 产物

```text
apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\
  deepseek-fa-0.2.1-rc.2.20261103.1-win-x64-unsigned.exe
  build-report.json
```

打包日志（失败时必须一起回传）：

```text
apps\desktop\.desktop-build\packaging-runs\<timestamp>-<id>\
  events.jsonl  stdout.log  stderr.log
```

## 5. 安装验收（在第 3 生产包前必须做）

1. 在**干净的** Windows 10/11 x64 上安装 EXE。
2. SmartScreen 提示时：更多信息 → 仍要运行（unsigned 包必然出现）。
3. 开始菜单显示 `DeepSeek-FA`（RU 版为 `DeepSeek-RU`）。
4. 首次启动创建 `%USERPROFILE%\.deepseek-fa`（RU：`.deepseek-ru`）与 `%APPDATA%\DeepSeek-FA`。
5. 登录页域名正确：FA 是 **`deepseekfa.com`**，RU 是 **`deepseek-ru.org`**；页面语言分别为波斯语（RTL）/俄语。若看到 `ds.openrouters.org` 或中文，说明打错了分支。
6. 用邮箱/用户名注册 → 自动登录 → 会话页出现 `DeepSeek-FA Account`（RU：`DeepSeek-RU Account`）。
7. 发一条文本消息成功；能附一张图片。
8. 卸载后 `%APPDATA%\DeepSeek-FA` 是否残留按需记录（测试包不强制清理）。

## 6. 上传与上线

两台服务器的 `root` 已加入构建机公钥（`deepseek-fa-2dev`，ED25519，指纹 `SHA256:AGrgJtmBuqFar+EA04AqvrsVHtLUoAsxlE2nDGe/ZPo`），可直接 scp。

**每次上传两个文件**：安装包（固定名 `<slug>.exe`）和清单（`<slug>.json`）。站点读取清单后才显示 Windows 下载按钮，所以只要这两个文件到位，页面上就自动出现，**不需要再改站点配置**。

| 品牌 | slug | 上传目录 | 公网路径 |
|---|---|---|---|
| FA | `deepseek-fa-win-x64-unsigned` | `root@87.107.108.14:/var/www/fa-site/downloads/` | `https://www.deepseekfa.com/downloads/` |
| RU | `deepseek-ru-win-x64-unsigned` | `root@104.248.155.54:/opt/dsh-gateway-ru/downloads/` | `https://www.deepseek-ru.org/downloads/` |

构建脚本已经把版本化的 exe 另存为固定名、并生成同名 json，直接按它打印的命令执行即可：

```powershell
# FA（脚本会把这三条打印出来）
scp "...\deepseek-fa-win-x64-unsigned.exe"   root@87.107.108.14:/var/www/fa-site/downloads/deepseek-fa-win-x64-unsigned.exe.part
scp "...\deepseek-fa-win-x64-unsigned.json"  root@87.107.108.14:/var/www/fa-site/downloads/deepseek-fa-win-x64-unsigned.json
ssh root@87.107.108.14 "mv /var/www/fa-site/downloads/deepseek-fa-win-x64-unsigned.exe.part /var/www/fa-site/downloads/deepseek-fa-win-x64-unsigned.exe"

# RU
scp "...\deepseek-ru-win-x64-unsigned.exe"   root@104.248.155.54:/opt/dsh-gateway-ru/downloads/deepseek-ru-win-x64-unsigned.exe.part
scp "...\deepseek-ru-win-x64-unsigned.json"  root@104.248.155.54:/opt/dsh-gateway-ru/downloads/deepseek-ru-win-x64-unsigned.json
ssh root@104.248.155.54 "mv /opt/dsh-gateway-ru/downloads/deepseek-ru-win-x64-unsigned.exe.part /opt/dsh-gateway-ru/downloads/deepseek-ru-win-x64-unsigned.exe"
```

上传后核对：

```bash
ssh root@<host> "sha256sum <下载目录>/<slug>.exe"      # 与本地 Get-FileHash 一致
curl -I https://www.deepseekfa.com/downloads/<slug>.exe     # 200 + 正确 content-length
```

页面侧：打开 `https://www.deepseekfa.com/download`（RU 为 `deepseek-ru.org/download`），Windows 卡片应显示版本、大小与 SHA-256——它读的就是刚传的 json。**若仍显示"即将推出"，说明 json 没传或名字不对**。

先传 `.part` 再改名，是为了避免用户在上传中途下到半个文件。

## 7. 失败回报格式

```text
分支/提交:   brand/deepseekfa @ <sha>
版本:        0.2.1-rc.2.<...>
失败步骤:    install / package / 验收
报错:        <最后 20 行>
日志目录:    apps\desktop\.desktop-build\packaging-runs\<id>\（打包 events.jsonl + stdout/stderr）
截图:        失败界面 / 安装界面
```

只发"最后一行报错"没法定位问题，日志目录必须一起给。

## 8. 禁止事项

- 不要提交 `.env`、证书、`.pem`、签名密码
- 不要修改 `apps/desktop/config/brand.mjs` / `src/brand.ts` 里的品牌与域名常量（要改先回 Mac 侧确认）
- 不要在脏工作区打包
- 不要用 `--build-version` 之外的参数覆盖 appId
