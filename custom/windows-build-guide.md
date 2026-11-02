# DeepSeek-FA / RU Windows x64 构建指南

> 本文已被 [Windows 打包交接单](windows-handoff.md) 取代（2026-11-03）。
> 旧版本写在 `main` 分支、域名 `ds.openrouters.org`、版本 `20261024.1`，均已过期；
> 现在按品牌分支构建（FA → `brand/deepseekfa`，RU → `brand/ru-deepseek-ru`）。

构建与验收步骤、镜像变量、产物路径、上传方式全部收口在 [windows-handoff.md](windows-handoff.md)。

一键脚本：

```powershell
pwsh -File scripts/windows/build-desktop.ps1 -Brand fa -BuildVersion 0.2.1-rc.2.20261103.1
```
