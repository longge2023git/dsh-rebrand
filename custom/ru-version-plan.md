# 俄语版方案建议

> 状态：站点已上线（2026-10-31，见 [部署记录](deepseek-ru-deployment.md)）；俄语界面改为采用上游 `ru` 字典（`RU-03`），客户端品牌未开工。
> 对象：与 [DeepSeek-FA](deepseek-fa-desktop.md) 同构的俄语版本 —— 独立站点、独立 App 品牌。
> 依据：`brand/deepseekfa`、`brand/vv-worker` 两条品牌分支的实际 delta，以及 `packages/client/locale` 已有的语言包机制。

已定事项：

| 项 | 决定 |
|---|---|
| 域名 | `https://deepseek-ru.org`（Cloudflare 代理，源站证书用 Origin CA） |
| 服务器 | 与 `ds.openrouters.org` 同机：`104.248.155.54`（DigitalOcean SGP1）；网关独立容器 `dsh-newapi-ru`，端口 3105 |
| 俄语翻译 | 不自译：采用上游 `ru` 字典生成语言包（`RU-03`，约 2 人日） |
| 图标 | 暂用 DeepSeek 现有鲸鱼图形，后续替换 |
| 品牌名 | 仍待定；临时用 `DeepSeek-RU` |

## 1. 结论

继续用「一条品牌分支 + 独立网关实例」的交付方式，但**先把品牌文案与语言从 `main` 里抽出来，再开分支**。理由是两条现存品牌分支的差异量：

| 分支 | 相对 `main` |
|---|---|
| `brand/deepseekfa` | 13 文件 / +211 −91（FA 品牌主体已在 `main`） |
| `brand/vv-worker` | **126 文件 / +864 −1370**；其中 53 个是 `tests/expected` 金样，8 个是图标二进制 |

第三个品牌若照抄 vv-worker，就是把 126 文件的分歧再复制一份：每次 `main` 引入上游都要在这些文件上解冲突，而大半冲突只是「品牌名出现在金样里」。

所以分两层：

- **公共层（落 `main`，FA / vv-worker 不受影响）**：品牌标识参数化 + 俄语语言包。
- **品牌层（新分支 `brand/ru-<slug>`）**：只放品牌 profile、图标、部署文档、默认网关。目标 delta ≤ 10 文件。

## 2. 公共层三件事

### 2.1 品牌文案收敛到一个 brand 命名空间

现状散在 71 处（`packages/client` 里 50 处，集中在各 `ui-*/locales.ts`），另有 `apps/desktop/src/locale.ts` 菜单文案、`apps/web/index.html`、PWA manifest、安装器字标（`apps/desktop/scripts/gen-installer-brand.mjs`）、`welcome-brand.svg`、`ui-brand-official` 的 Brand 组件。

做法：

- 新增 `brand` 语言命名空间，文案用 `{brand}` 占位。
- `apps/desktop/config/brand.mjs` 扩成 `config/brands/<slug>.mjs`，构建期用 `DSH_BRAND` 选择，默认 `deepseek-fa` 保持现状。
- `tests/expected` 金样改为测试运行时替换品牌占位，品牌分支不再改 53 个金样。

### 2.2 俄语界面：直接采用上游的 ru 字典

2026-10-31 复核上游（`upstream/master`）后改变了做法：**不再自己翻译**。上游已经原生支持 8 种语言，俄语是其中之一。

事实（2026-10-31 复核）：

- 俄语是 master 上 `84edeadc2b feat(i18n): add Spanish French German Russian and Portuguese` 引入的，**尚未进任何 tag**：`dsh-v0.2.1-rc.5`（10-29）还只有中英两种语言。抽取时要 pin 到 master 的具体 sha。
- 每个客户端包的 `src/client/locale*.ts` 同时导出 `zh / en / ja / es / fr / de / ru / pt`；例如 `ui-chat` 每语言 195 键、`ui-conversation` 每语言 383 键。
- 桌面壳 `apps/desktop/src/locale.ts` 同样有 `ru`（菜单、对话框、退出确认）。
- 每个包另有 `locale/<lang>.json` 提供插件市场里的标题与描述，ru 覆盖 296 个包。
- 上游 `packages/client/locale/README.md` 记载了语言包 seam：`addLanguage({ id, label, fallback })` + `register(ns, lang, dict)`。我们的 rc.2 基线已有这套 API（`packages/client/locale/src/client/index.ts`）。

对照我们的 rc.2 键集实测：

| 指标 | 数值 |
|---|---|
| 我们现有英文键（去重） | 1,146 |
| 上游 ru 直接覆盖 | 1,062（92.7%） |
| 需要手工补 | 47（`ui-schedule` 任务表单 44、`ui-user-questions` 2、`ui-plan` 1） |
| 另有 41 个键 | 路径对不上（我们的 `locale/src/locales/en.ts` 对应上游 `src/locales/ru.ts`，键集一致 41/41），抽取脚本加一条路径映射即覆盖 |
| 上游比我们多的键 | 468（rc.2 之后新增，用不到） |

也就是说手工只需 ~47 条，而不是 1,600 条。

做法（生成式语言包，不改 56 个包的源码）：

1. `scripts/extract-locale-ru.mjs`：对每个本地 `src/client/locale*.ts`，从 pin 住的上游 commit（当前 `84edeadc2b`，或下一个含 ru 的 tag）取同名文件的 `export const ru`，生成 `packages/client/locale-ru/src/client/dicts.ts`（命名空间 → 字典）。生成物入库，构建不依赖上游网络；上游后续修正只影响重跑后的 diff。
2. 新包 `packages/client/locale-ru`：`addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' })` + 逐命名空间 `register(ns, 'ru', dict)`；挂到 `packages/bundle/web-app/cordis.patch.yml`，桌面端复用同一 bundle，挂一次两边生效。
3. 覆盖 gate：测试断言每个命名空间 `ru` 键集 ⊇ `en` 键集、且占位符集合一致（`{name}` 这类原样保留），缺口走显式白名单（回落英文）并打印覆盖率；漏译不会把裸 key 打到界面上，占位符错位在测试阶段暴露。
4. 品牌替换：上游 ru 字典里有 46 处品牌串（`ui-plugin-manager` 20、`ui-plugin-market` 5、`ui-settings-account` 4…），走品牌 token 替换成俄语品牌名。
5. 手工补 47 条，术语表沿用 FA 的约定（会话、计划、子智能体、交付物、工作区、轨迹）。
6. 桌面壳：从上游 `apps/desktop/src/locale.ts` 取 `ru` 导出并入本 fork（~120 键）。
7. 每次同步上游后重跑脚本，差异进 git diff，评审可见。

估算 ~2 人日，对比自译 3,000+ 条（5–8 人日）且此后要持续维护。

为什么不做全量上游合并：rc.2 → `upstream/master` 是 2,527 个提交、8,133 个文件、其中 1,596 个客户端文件；而且上游把品牌串扩到了 8 种语言，全量合并会让每个品牌分支的分歧翻几倍。合并该做，但要排在品牌参数化之后，独立成一个事项。

### 2.3 让模型用俄语回答

界面翻译只解决「看得懂」，不解决「它用俄语答」。现在没有语言→提示词的机制，而 `packages/context/time-context` 证明「向会话注入一条事实」是既有扩展点。

建议加 `locale-context`：读 `locale.preference`，注入「用俄语回答」。对留存的作用不小于界面翻译，建议排在界面翻译之前。

## 3. 品牌层：`brand/ru-<slug>`

| 项 | 建议默认 | 说明 |
|---|---|---|
| 产品名 | 先 `DeepSeek-RU` 占位 | 与 `DeepSeek-FA` 同构，改动最小；正式名与域名尽早定 |
| appId | `com.deepseek-ru.harness` | |
| Harness home | `~/.deepseek-ru` | 与官方 `~/.dsh`、FA、vv-worker 完全隔离 |
| 图标 | 暂用 DeepSeek 现有鲸鱼图形 | 后续换正式 mark；对外分发前确认授权 |
| 协议 scheme | 继续 `dsh://` | 与 FA 第一版一致 |
| 默认网关 | `https://deepseek-ru.org` | 已上线，独立实例 |

## 4. 站点：已上线，独立实例，复用镜像，不共享数据库

部署细节见 [deepseek-ru-deployment.md](deepseek-ru-deployment.md)。要点：

- **服务器**：与 `ds.openrouters.org` 同一台（`104.248.155.54`，新加坡 SGP1），网关是独立容器 `dsh-newapi-ru`（`127.0.0.1:3105`）与独立 SQLite。
- **入口**：Cloudflare 代理 + Origin CA 证书（Full (strict)），nginx 按 `server_name` 分流，不影响同机既有站点。
- **镜像**：`dsh/new-api-deepseek:20261028-langen`，含 10-28 的英文兜底修复；首装用的 `20261025a` 会把俄语浏览器落到中文登录页，已换掉。
- **要补的**：DSH 登录/授权页仍是中英硬编码（`controller/dsh_pages.go` 的 `dshPageText`），俄语浏览器现在落到**英文**页；加 `ru` 分支属于 `R-02`。
- **上游 key**：独立官方 key + 独立额度池（先例：vv-worker 的独立 key）。当前实例还没有渠道，`/v1/models` 只有无效 key 的 401 行为可验收。
- **周边**：`/downloads/` 目录已建但为空；注册邮件/SMTP 走 NewAPI 默认，未定制。
- **支付**：`topUpPath=/console/topup` 指向 NewAPI 控制台，通道仍未确认。
- **延迟**：源站在新加坡，俄语用户回源偏慢；若 TTFT 不达标再迁欧洲节点。

## 5. 工作量估算

| 阶段 | 内容 | 人日 |
|---|---|---|
| P0 | 决策：品牌名、图标、域名、服务器、支付通道 | 域名/服务器/图标已定；品牌名与支付待定 |
| P1 | 公共层：brand 参数化、金样解耦、语言包框架、key gate | 3–4 |
| P2 | 站点：新机、nginx、TLS、俄语登录页、`/downloads`、独立 key | 站点主体已完成（2026-10-31）；剩上游渠道 |
| P3 | 上游 ru 字典抽取脚本 + `locale-ru` 语言包 + 覆盖 gate + 手工补 88 条 | ~2 |
| P4 | 分支出包（mac unsigned、win unsigned）与验收 | 1–2（Windows 首次 +1，D-03 未做） |
| P5 | 每次同步上游后重跑抽取脚本 | 0.2/次 |
| **剩余 MVP（P1+P3+P4）** | | **~6** |

对照：完全照 vv-worker 的做法不做 P1，首版可压到 5–6 人日，但品牌 delta 仍是约 126 文件，后续每次同步上游继续付利息。

## 6. 风险与取舍

1. **品牌名与图标未定**（`B-01` 仍阻塞）——出包、域名、分发都卡在这里。先定名，图形可以后补。
2. **支付与合规**——俄罗斯收款通道决定上线日，与代码无关。
3. **翻译漏项**——没有 key 对齐 gate 就会出现裸 key，必须同批上线。
4. **分支分歧成本**——P1 的全部理由。若确定「品牌就这两个、不再增加」，可以不做 P1。
5. **老用户迁移**——`S-02` 的教训是 profile patch 不覆盖，俄语版**第一天就必须写最终域名**，不要先上临时域。
6. **商标**——`DeepSeek-*` 命名与鲸鱼图形的对外分发风险，分发前确认（见 [TRADEMARKS.md](../TRADEMARKS.md)）。

## 7. 待定

1. 品牌名：正式名（决定 appId、安装器字标、控制台 `SystemName`），或长期用 `DeepSeek-RU`。
2. 支付通道：俄语区可用通道，决定开放注册与充值的上线日。
3. 上游渠道：俄语站独立的 DeepSeek 官方 key 与额度池。

域名、服务器、图标、翻译范围已定，见文首「已定事项」。
