# 俄语版方案建议

> 状态：站点已上线（2026-10-31，见 [部署记录](deepseek-ru-deployment.md)）；客户端品牌与俄语界面未开工。
> 对象：与 [DeepSeek-FA](deepseek-fa-desktop.md) 同构的俄语版本 —— 独立站点、独立 App 品牌。
> 依据：`brand/deepseekfa`、`brand/vv-worker` 两条品牌分支的实际 delta，以及 `packages/client/locale` 已有的语言包机制。

已定事项：

| 项 | 决定 |
|---|---|
| 域名 | `https://deepseek-ru.org`（Cloudflare 代理，源站证书用 Origin CA） |
| 服务器 | 与 `ds.openrouters.org` 同机：`104.248.155.54`（DigitalOcean SGP1）；网关独立容器 `dsh-newapi-ru`，端口 3105 |
| 俄语翻译 | **本轮不做**，记为待办（`R-02`） |
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

### 2.2 俄语语言包（不改 56 个包的源码）——本轮不做

> 2026-10-31 决定：本轮跳过俄语翻译，先上线英文界面站点；下面的方案保留，作为 `R-02` 的执行依据。

机制已经存在，不需要把 `LOCALE_IDS` 改成三种语言，也不需要逐包加 `ru`：

- `packages/client/locale/src/client/index.ts` 的 `addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' })` 注册可选语言；
- 单语言重载 `register(ns, 'ru', dict)` 供语言包补充已有命名空间；`(ns, locale)` 唯一占用，`ru` 全部空闲。

新建 `packages/client/locale-ru`（俄语字典 + 挂载点 `packages/bundle/web-app/cordis.patch.yml`）；桌面端 bundle 复用 `@deepseek-ai/dsh-web-app`，挂一次即两边生效。

翻译量：**3,201 条 / 56 个命名空间**。按批次分：

| 命名空间 | 条数 | 批次 |
|---|---|---|
| `ui-conversation` | 746 | 首批 |
| `ui-chat` | 382 | 首批 |
| `ui-trajectory` | 384 | 二批 |
| `ui-schedule` | 268 | 二批 |
| `ui-workspace` | 238 | 二批 |
| `ui-deliverables` | 120 | 二批 |
| 其余 50 个 | ≈1,060 | 首批（设置、账号、登录、错误、工具名） |

首批约 1,900 条（覆盖主交互），二批长尾约 1,300 条。

必须同时上一个 key 对齐 gate：每个命名空间的 `ru` 键集合必须等于 `en`，缺键即失败 —— 否则漏译会把裸 key 打到界面上。

翻译执行：先定术语表（会话、计划、子智能体、交付物、工作区、轨迹…），再 LLM 初译，再按命名空间抽检 10 条。模型名与供应商名保持英文（沿用 FA 原则）。

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
| P3 | 俄语首批 1,900 条 + 桌面壳 120 条 + 抽检 | 2–3（本轮不做，`R-02`） |
| P4 | 分支出包（mac unsigned、win unsigned）与验收 | 1–2（Windows 首次 +1，D-03 未做） |
| P5 | 长尾 1,300 条与迭代 | 1–2（可后置） |
| **剩余 MVP（P1+P4）** | | **4–6** |

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
