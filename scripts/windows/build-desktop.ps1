# Build the DeepSeek desktop installer for Windows x64 on a Windows machine.
#
#   pwsh -File scripts/windows/build-desktop.ps1 -Brand fa
#   pwsh -File scripts/windows/build-desktop.ps1 -Brand ru -BuildVersion 0.2.1-rc.2.20261105.2
#
# The script only produces an unsigned test installer: no code-signing certificate,
# no update-policy file, no .env.windows. It fails fast when the checkout is dirty,
# Node is too old, or the branch does not match the brand.
[CmdletBinding()]
param(
    [ValidateSet('fa', 'ru')][string]$Brand = 'fa',
    [string]$BuildVersion = ('0.2.1-rc.2.' + (Get-Date -Format 'yyyyMMdd') + '.1')
)

$ErrorActionPreference = 'Stop'

$branches = @{ fa = 'brand/deepseekfa'; ru = 'brand/ru-deepseek-ru' }
$branch = $branches[$Brand]
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $root

Write-Host "== 仓库: $root"
Write-Host "== 品牌: $Brand  分支: $branch  版本: $BuildVersion"

# 1) 工具链
$nodeVersion = (& node --version).Trim()
if ([version]($nodeVersion.TrimStart('v')) -lt [version]'24.0.0') {
    throw "需要 Node 24+，当前是 $nodeVersion（用 nvm/fnm 切换后重跑）"
}
corepack enable | Out-Null
corepack prepare pnpm@11.28.5 --activate | Out-Null
Write-Host "== node $nodeVersion / pnpm $(& pnpm --version)"

# 2) 镜像（国内网络；清空这三个变量即走官方源）
$env:DSH_DESKTOP_NPM_REGISTRY = 'https://registry.npmmirror.com'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

# 3) 代码
git fetch --all --prune
$localBranch = (git branch --list $branch).Trim()
if ([string]::IsNullOrWhiteSpace($localBranch)) {
    git switch --create $branch --track "origin/$branch"
} else {
    git switch $branch
}
git pull --ff-only
$dirty = git status --porcelain
if ($dirty) {
    throw "工作区不干净，先处理这些改动再打包：`n$dirty"
}
$head = (git rev-parse --short HEAD).Trim()
Write-Host "== 代码基线 $head"

# 4) 依赖与打包
pnpm install --frozen-lockfile
pnpm --dir apps/desktop run package:win:x64:unsigned --build-version $BuildVersion

# 5) 产物与报告
$artifactDir = Join-Path $root 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'
$artifact = Get-ChildItem -LiteralPath $artifactDir -Filter '*.exe' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $artifact) { throw "没有找到生成物，检查 $artifactDir" }

$hash = (Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()

# 站点按固定文件名找安装包；把版本化的 exe 另存一份稳定的名字，上传时直接用它。
$slug = @{ fa = 'deepseek-fa'; ru = 'deepseek-ru' }[$Brand] + '-win-x64-unsigned'
$stable = Join-Path $artifactDir ($slug + '.exe')
Copy-Item -LiteralPath $artifact.FullName -Destination $stable -Force
$manifest = [ordered]@{
    brand   = $Brand
    version = $BuildVersion
    file    = ($slug + '.exe')
    bytes   = $artifact.Length
    sha256  = $hash
    builtAt = (Get-Date).ToString('o')
}
$manifestPath = Join-Path $artifactDir ($slug + '.json')
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$report = [ordered]@{
    brand        = $Brand
    branch       = $branch
    commit       = $head
    buildVersion = $BuildVersion
    file         = $artifact.Name
    bytes        = $artifact.Length
    sha256       = $hash
    builtAt      = (Get-Date).ToString('o')
    host         = $env:COMPUTERNAME
}
$reportPath = Join-Path $artifactDir 'build-report.json'
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ''
Write-Host '== 构建完成'
Write-Host ("   文件: " + $artifact.FullName)
Write-Host ("   大小: {0:N0} 字节" -f $artifact.Length)
Write-Host ("   SHA256: " + $hash)
Write-Host ("   报告: " + $reportPath)
Write-Host ("   稳定名: " + $stable)
Write-Host ("   清单:   " + $manifestPath)
Write-Host ''
Write-Host '下一步：在干净的 Windows 上安装验收（custom/windows-handoff.md 第 5 节），然后上传两个文件：'
if ($Brand -eq 'fa') {
    Write-Host ("  scp `"$stable`" root@87.107.108.14:/opt/dsh-gateway/downloads/$slug.exe.part")
    Write-Host ("  scp `"$manifestPath`" root@87.107.108.14:/opt/dsh-gateway/downloads/$slug.json")
    Write-Host ("  ssh root@87.107.108.14 `"mv /opt/dsh-gateway/downloads/$slug.exe.part /opt/dsh-gateway/downloads/$slug.exe`"")
} else {
    Write-Host ("  scp `"$stable`" root@104.248.155.54:/opt/dsh-gateway-ru/downloads/$slug.exe.part")
    Write-Host ("  scp `"$manifestPath`" root@104.248.155.54:/opt/dsh-gateway-ru/downloads/$slug.json")
    Write-Host ("  ssh root@104.248.155.54 `"mv /opt/dsh-gateway-ru/downloads/$slug.exe.part /opt/dsh-gateway-ru/downloads/$slug.exe`"")
}
Write-Host '传完页面会自动出现 Windows 下载按钮（读取清单），无需改站点配置。'
