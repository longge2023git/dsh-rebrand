# Files API 调研（2026-10-21）

> 结论：`/v1/files` 是 Anthropic 的标准 Files API；上传/管理操作不单独计费，文件内容进入 Messages 时按输入 token 计费。DeepSeek 官方实现遵循同一模式。NewAPI 目前未实现该路由，已建二开待办 [#11](https://github.com/longge2023git/dsh-rebrand/issues/11)。

---

## 1. Anthropic 标准

Files API 已是 **GA**，不再强制 beta：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/files` | 上传，返回 `file_id` |
| GET | `/v1/files` | 列表（`page`/`next_page`，或 `ids[]`） |
| GET | `/v1/files/{id}` | 元数据 |
| DELETE | `/v1/files/{id}` | 删除 |
| GET | `/v1/files/{id}/content` | 下载（仅 skills / code execution 生成的文件） |

- 旧的 `anthropic-beta: files-api-2025-04-14` 仍然可用，返回 beta 形态（DSH 用的就是这一套）。
- 限制：单文件 500 MB，组织总存储 1 TB。
- 计费：上传、下载、列表、查询、删除都**不单独收费**；文件内容用于 Messages 时按 **input tokens** 计费。
- 安全：文件是 **workspace 级**，不是终端用户级。官方明确要求不要把客户端传来的 `file_id` 当可信输入，多租户应一租户一 workspace。

来源：
- <https://platform.claude.com/docs/en/build-with-claude/files>
- <https://platform.claude.com/docs/en/api/beta/files>

## 2. DeepSeek 官方实现

Anthropic 兼容端点：`https://api.deepseek.com/anthropic`

| 方法 | 路径（需 `anthropic-beta: files-api-2025-04-14`） |
|---|---|
| POST | `/anthropic/v1/files` |
| GET | `/anthropic/v1/files` |
| GET | `/anthropic/v1/files/{id}` |
| DELETE | `/anthropic/v1/files/{id}` |

- 文件对象：`{id, type:"file", size_bytes, created_at(RFC3339), filename, mime_type}`。
- 限制：单文件 64 MiB，单用户 25 GiB / 10000 个文件，有效期 1 小时–30 天（不传则永久）。
- 计费：价格表没有 Files API 行；图片按尺寸折算 token，**每图最多 1024 tokens**，与文本一起按模型 token 计费。
- 只有 `deepseek-flash` 支持图像理解；`deepseek-v4-pro` 不支持图片。
- 文件按账号共享：同一账号下的 key 都能引用。

来源：
- <https://api-docs.deepseek.com/zh-cn/guides/files_api>
- <https://api-docs.deepseek.com/zh-cn/guides/vision>
- <https://api-docs.deepseek.com/zh-cn/quick_start/pricing>

## 3. DSH 的行为

- 上传失败（404/5xx/超时）→ `FileResolutionFailure` → 整请求改为 inline base64。
- inline 上限：默认 20 MiB（base64 后）；超过会报 `IMAGE_OFFLOAD_REQUIRED_CODE`。
- 文件引用块：`image.source = {type:"file", file_id}`，DSH 会带 `anthropic-beta`。
- 因此 relay 返回 404 不是 bug，而是触发降级；只是大图会失败、无法跨请求复用。

代码位置：
- `packages/llm/llm-deepseek/src/request-files.ts`
- `packages/llm/llm-deepseek/src/adapter.ts`
- `packages/llm/llm-deepseek/src/serialize.ts`

## 4. NewAPI 的现状

- v0.10.9 与 main 的 `router/relay-router.go` 都把 `/v1/files` 映射到 `controller.RelayNotImplemented`。
- 直接请求会先被 `/v1` 组的 `Distribute` 中间件拦下（要求 model），即使绕过也会 501。
- 跟踪 issue：<https://github.com/QuantumNous/new-api/issues/2299>
- **但 Messages 会透传文件引用**：实测用上游真实 `file_id` 经 NewAPI `/v1/messages`，DeepSeek 能读到图片。缺的只是上传/管理这一段。

## 5. 可选方案

| 方案 | 做法 | 成本 | 适用 |
|---|---|---|---|
| A. 网关直连上游 Files API | 网关实现 `/v1/files*`，转发到 DeepSeek/Anthropic，记录 file→user | 1–2 天 | 单上游、想保留大文件与复用 |
| B. NewAPI 二开 | 在 NewAPI 里实现路由与透传 | 3–5 天 + AGPL | 所有流量统一走 NewAPI |
| C. 网关本地存 + inline | 网关存文件，Messages 时换 base64 | 2–3 天 | 多上游、不想持有上游 key |
| D. 维持 404 fallback | 当前 relay | 0 | 小图足够 |

## 6. 给二开网关的建议

如果网关是统一入口且持有上游 key：

1. 实现 beta 形态的 `/v1/files`（DSH 兼容），可选再支持 GA 形态；
2. 维护 `file_id → 用户/租户` 映射，所有引用/查询/删除都校验归属；
3. Messages 里遇到 `image.source.type=file` / `document.source.type=file` 时校验归属再转发；
4. 上游不支持 Files 时，要么返回 404 让客户端 inline fallback，要么网关自己换 base64；
5. 多租户尽量一租户一上游账号/workspace；共用账号时，归属校验必须在网关完成。

## 7. 待办

NewAPI 二开支持 `/v1/files`：已在 `new-api-deepseek` 实现并合并到 `main`（上传/列表/查询/删除、`file_owners` 归属、Messages 渠道绑定）。DSH UI 图片附件待手工验收。Issue [#11](https://github.com/longge2023git/dsh-rebrand/issues/11) 跟踪验收。
