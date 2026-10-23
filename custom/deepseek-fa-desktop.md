# DeepSeek-FA 桌面端

> 状态：macOS arm64 unsigned 测试包已构建；Windows 只保留方案。

## 身份

| 项 | 值 |
|---|---|
| 产品显示名 | `DeepSeek-FA` |
| 包名/产物前缀 | `deepseek-fa` |
| appId | `com.deepseek-fa.harness` |
| 默认 Harness home | `~/.deepseek-fa` |
| Electron userData | `~/Library/Application Support/DeepSeek-FA` |
| 协议 scheme | 第一版保留 `dsh://` |
| 图标 | `apps/desktop/resources/` 鲸鱼图标 |
| 默认网关 | `https://ds.openrouters.org` |

与官方 DeepSeek Harness 完全隔离：不读写 `~/.dsh`，不共用 Electron userData、单实例锁、profile、credentials、sessions。

## 默认配置

首次启动写入 `~/.deepseek-fa/profiles/desktop/cordis.patch.yml`：

```yaml
- id: deepseek-account
  config:
    platformOrigin: https://ds.openrouters.org
    inferenceOrigin: https://ds.openrouters.org
    usagePath: /console/log
    topUpPath: /console/topup
- id: llm-deepseek-account
  config:
    baseURL: https://ds.openrouters.org/v1
```

文件已存在时不覆盖。显式设置 `DSH_HOME` 时尊重用户设置。

## 构建（macOS arm64 unsigned）

当前 Node 22 可用，但打包运行时自带 Node 24。

```bash
cd ~/projects/ai/deepseek_rebuild
pnpm install --frozen-lockfile

export DSH_DESKTOP_NPM_REGISTRY=https://registry.npmmirror.com
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# dmgbuild 默认从 GitHub 下载；国内网络先手动下载并解压一次：
# https://github.com/electron-userland/electron-builder-binaries/releases/download/dmg-builder@1.2.5/dmgbuild-bundle-arm64-75c8a6c.tar.gz
export CUSTOM_DMGBUILD_PATH=/tmp/dmgbuild-extract/dmgbuild

pnpm --dir apps/desktop run package:mac:arm64:unsigned \
  --build-version 0.2.1-rc.2.20261023.1
```

产物：

```text
apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/
  deepseek-fa-0.2.1-rc.2.20261023.1-mac-arm64-unsigned.dmg
```

> `dmgbuild` 是 electron-builder 的 GitHub 二进制工具，不在 npm 镜像里。使用代理下载或 `CUSTOM_DMGBUILD_PATH` 指定本地已解压工具。Electron 与 npm 依赖分别由 `ELECTRON_MIRROR` 和 `DSH_DESKTOP_NPM_REGISTRY` 走国内镜像。

## 安装验证

1. 打开 DMG，拖入 `Applications`；
2. 未签名包首次启动在“隐私与安全性”中允许；
3. 应用名/关于/退出文案显示 `DeepSeek-FA`；
4. 首次启动创建 `~/.deepseek-fa`；
5. 登录页来自 `ds.openrouters.org`，注册/登录；
6. 文本、图片、查询用量/充值；
7. 官方 Harness 的 `~/.dsh` 和 `~/Library/Application Support/@deepseek-ai/dsh-desktop` 不受影响。

## Windows（仅方案）

Windows 包必须在 Windows x64 上构建，当前不产出。

环境：

- Node 24
- pnpm
- Git、PowerShell、Python
- Visual C++ Build Tools + Windows SDK
- 国内镜像：`DSH_DESKTOP_NPM_REGISTRY=https://registry.npmmirror.com`
- electron-builder 的 NSIS 工具从 GitHub 下载；用 `ELECTRON_BUILDER_BINARIES_MIRROR` 或代理

命令：

```powershell
pnpm install --frozen-lockfile
pnpm --dir apps/desktop run package:win:x64:unsigned `
  --build-version 0.2.1-rc.2.20261023.1
```

产物：

```text
apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/
  deepseek-fa-0.2.1-rc.2.20261023.1-win-x64-unsigned.exe
```

正式分发前需要 EV 代码签名/时间戳和独立更新源；测试包不接自动更新。

## 已知限制

- 未签名 macOS 包有 Gatekeeper 提示，Windows 有 SmartScreen 提示；
- 第一版保留 `dsh://`，与官方 Harness 同时安装时深链归属可能冲突；
- 正式品牌发布前还需确认 Logo/版权、签名证书、更新策略；
- `~/.deepseek-fa` 与官方 `~/.dsh` 是两套数据，不迁移历史会话。
