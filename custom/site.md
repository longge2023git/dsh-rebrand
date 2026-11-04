# 官网（两品牌）

> 2026-11-02 上线。FA：`https://www.deepseekfa.com`；RU：`https://www.deepseek-ru.org`。

## 域名分工

2026-11-04 起改为**单域名**：裸域同时承载官网、迷你站和网关，`www` 301 到裸域。客户端 baseURL 仍是裸域，token issuer 不变，无需重登。

| 域名 | 内容 |
|---|---|
| `deepseekfa.com` | 官网 `/`、`/docs`、`/download`、`/en/*`；迷你站 `/me/*`；网关 `/v1`、`/api`、`/dsh`、`/auth-api`、`/console` |
| `www.deepseekfa.com` | 301 → 裸域 |
| `deepseek-ru.org` | 同上（ru / en 官网 + 迷你站 + 网关） |
| `www.deepseek-ru.org` | 301 → 裸域 |

站点静态资源走 `/site-assets/`（不是 `/assets/`），因为网关的旧 SPA 占用 `/assets/` 给管理控制台用。

## 首页下载按钮

首页主按钮按访客平台显示：macOS → 「下载 macOS」、Windows → 「下载 Windows」、其他/未知 → 中性文案（「下载应用」）。实现是 `data-download-cta` 加十几个字符的内联判断（`render.mjs` 的 homeBody），不依赖 UA 库；下载页本身始终列出两个平台卡片。安装说明同时覆盖 macOS（Gatekeeper）与 Windows（SmartScreen）。

## 结构

```text
site/
├── build.mjs            # 无依赖构建脚本，输出 site/dist/<brand>/
├── brands/fa.mjs        # 品牌：域名、语言、下载清单（版本/大小/sha256）
├── brands/ru.mjs
├── copy/{fa,ru,en}.mjs  # 文案；{{brand}} 在构建时替换
├── assets/<brand>/      # 品牌 App 图标：icon.svg（取自 apps/desktop/resources/）+ 32/180 PNG
└── src/
    ├── render.mjs       # 布局与三个页面：首页 / 下载 / 接入
    └── styles.css       # 逻辑属性（margin-inline 等），同一套样式服务 LTR 与 RTL
```

风格参照 DeepSeek 官方站：白底/近黑字、单一蓝 `#4D6BFE`、胶囊按钮、居中大标题；暗色模式随系统。品牌标记直接使用桌面端 App 图标（FA 是波斯纹样鲸鱼，RU 是浅色版），favicon 与 apple-touch-icon 由同一图标生成。

产物：`dist/<brand>/index.html`、`download.html`、`docs.html`、`styles.css`、`favicon.svg`、`robots.txt`、`sitemap.xml`，英文在 `dist/<brand>/en/`。

## 构建与预览

```bash
node site/build.mjs           # 两个品牌
node site/build.mjs fa        # 单品牌
cd site/dist/fa && python3 -m http.server 8899   # 预览：必须走 HTTP，file:// 下绝对路径样式会丢
```

## 部署

> 上传走 SOCKS5 代理，直连慢一倍以上；命令见 [网络与上传](networking.md)。

```bash
# FA（伊朗机器）
rsync -az --delete --exclude downloads -e "ssh -i ~/.ssh/id_ed25519" \
  site/dist/fa/ root@87.107.108.14:/var/www/fa-site/

# RU（hub 机器）
rsync -az --delete -e "ssh -i ~/.ssh/id_ed25519_hub_104_248_155_54" \
  site/dist/ru/ root@104.248.155.54:/var/www/ru-site/
```

nginx：FA 是 `/etc/nginx/sites-enabled/deepseekfa.conf`（`www.deepseekfa.com.conf` 只做 301）；RU 是 `/etc/nginx/conf.d/deepseek-ru.conf`。两者都用 `try_files $uri $uri.html $uri/index.html` 支持 `/download` 这种无扩展名路径。

**发布要点**：安装包放在 `/opt/dsh-gateway/downloads`（FA）与 `/opt/dsh-gateway-ru/downloads`（RU），已移出站点根目录。发布站点用 `rsync --delete` 时**必须**带 `--exclude downloads`（历史上漏过一次，把 FA 的安装包删了）。

## apex 入口路由

apex 不再直接暴露 New API 的 SPA：

| 路径 | 行为 |
|---|---|
| `/` | 官网首页（静态） |
| `/login` | 302 → `/me/login` |
| `/register` | 302 → `/me/register` |
| `/top_up` | 302 → `/me/topup` |
| `/console`、`/console/log`、… | **保留**，管理员与 2FA 用户仍需要 |
| `/api/*`、`/v1/*`、`/dsh/*` | 原样代理到网关 |

改法是在 apex 的 server 块里加两条 `location =`（`/etc/nginx/sites-enabled/deepseekfa.conf`、`/etc/nginx/conf.d/deepseek-ru.conf`）；回退就是删掉这两条并 reload。

## 构建校验

`build.mjs` 在写完后扫描每个品牌的 HTML：出现另一个品牌的名称或域名（FA 产物含 `DeepSeek-RU` / `deepseek-ru.org`，反之亦然），或残留 `{{token}}`，就打印问题并以退出码 1 失败。多品牌模板最容易出的事故就是"某处忘了参数化"，这条断言把它变成构建失败而不是线上事故。

## 静态资源缓存

`styles.css` 与品牌图标在 HTML 里带 `?v=<内容哈希>`（`build.mjs` 用 sha256 前 8 位）。原因：RU 站在 Cloudflare 后面，CSS 被边缘缓存 4 小时（`cf-cache-status: HIT`），改了样式线上仍旧——加版本号后每次构建 URL 变化，自动破缓存。FA 站是 A 记录直连，没有这个问题，但同样受益于浏览器缓存失效。

## Windows 下载位（清单驱动）

Windows 包由 Windows 机器构建（见 [windows-handoff.md](windows-handoff.md)），站点不预置版本号：

- 品牌配置里 `windows` 段给出**固定文件名** `slug.exe` 与**同名清单** `slug.json`
- 下载页的 Windows 卡片默认隐藏，页面脚本拉取清单；拿到 `version/bytes/sha256` 才显示卡片与按钮，否则保持"即将推出"
- 所以上传 `slug.exe` + `slug.json` 后页面自动出现，无需改配置重新部署

清单由 `scripts/windows/build-desktop.ps1` 生成（与 exe 同一次构建）。

## 发布（macOS）

构建本身见 [deepseek-fa-desktop.md](deepseek-fa-desktop.md)；RU 版同流程，换分支 `brand/ru-deepseek-ru` 与产物前缀 `deepseek-ru`。发布步骤：

1. 构建：`pnpm --dir apps/desktop run package:mac:arm64:unsigned --build-version <版本>`
2. 校验（挂载 DMG，三条都要对）：
   - `CFBundleIdentifier` = `com.deepseek-fa.harness` / `com.deepseekru.harness`
   - `CFBundleShortVersionString` = 目标版本
   - `app.asar` 内只含自家域名（FA `deepseekfa.com`，RU `deepseek-ru.org`），对方域名 0 处
3. 上传：`.part` → 服务端 `sha256sum` 比对 → 改名（见下"下载分发"的目录）
4. 改 `site/brands/<id>.mjs` 的 `version` / `file` / `size` / `sha256`
5. `node site/build.mjs`，rsync 部署；打开下载页确认版本与校验和

## 下载分发

- FA：`/var/www/fa-site/downloads/`，页面直链 `/downloads/<file>`
- RU：`/opt/dsh-gateway-ru/downloads/`，由 `www` 与 apex 两个 server 块共同暴露
- 发新版本时改 `site/brands/<id>.mjs` 的 `version`、`file`、`size`、`sha256`，再构建部署；**页面上的校验和必须与上传的文件一致**
- 安装包体积 250 MB 左右，FA 走伊朗源站带宽有限（实测 ~4 Mbps），并发下载会打满，后续建议接 ArvanCloud CDN

## 待办

- 文案（尤其波斯语）需要母语用户审校
- 控制台公告位尚未加入口；RU 已在控制台公告里挂过 `/download`
- Windows 卡片依赖清单：只传 exe 不传 json 时按钮不出现
- 未做访问统计，也未接 CDN
- 英文页的语言切换按钮：`fa` 站显示 `EN`、`ru` 站显示 `EN`，回切标签由 `render.mjs` 的 `otherLabel` 决定
- 移动端曾把语言开关一起隐藏：`nav.links a:not(.app)` 会匹配到 `.lang a`，已改为 `nav.links > a:not(.app)`
