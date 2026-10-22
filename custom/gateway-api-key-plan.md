# Gateway API Key 模式

> 状态：**第一步已实现并验收**（2026-10-22）。第二步等正式发版时执行。

## 目标

账号拥有者在 NewAPI 控制台创建 API key 后，可以直接发给其他人；对方在桌面端登录页选择“使用网关 API Key”，粘贴 key 即可使用，不需要邮箱密码，也不会被当成 DeepSeek 官方 key。

## 第一步（已完成）

### UX

未登录桌面/网页的登录弹窗现在有三个入口：

```text
[使用网关 API Key]  [添加 API Key]  [登录]
```

- **使用网关 API Key**：打开网关专用 onboarding，只填 key；
- **添加 API Key**：仍然进入 `deepseek-official` 官方 Key 模式（发版前保留）；
- **登录**：浏览器跳转 DSH 登录页，注册/登录账号。

### Provider

新增独立 provider：

```text
id: deepseek-gateway
plugin: @deepseek-ai/dsh-llm-deepseek-api-key
baseURL: http://127.0.0.1:13000
apiKeyEnv: DSH_GATEWAY_API_KEY
displayName: DSH Gateway
```

- `llm-deepseek-api-key` 的 `provider` 配置变为可配置，默认仍是 `deepseek-official`；
- base bundle 新增 `llm-deepseek-gateway` 条目；
- key 通过 credentials 服务写入 `DSH_GATEWAY_API_KEY`，不写进 cordis 配置；
- NewAPI 现在对 `/v1/messages` 和 `/v1/files` 都接受 `x-api-key`，因此网关 key 可以聊天和传图。

### 验收

- 登录页出现三个按钮；
- 点“使用网关 API Key”出现 key 输入框，保存后 onboarding 关闭；
- 模型菜单出现 `DSH Gateway`，可选 `DeepSeek-V4.1-Flash`；
- 文本 `GATEWAYKEYOK` 成功；
- 图片附件成功，NewAPI 日志 `POST /v1/files 200`、`POST /v1/messages 200`；
- 官方 `Add API Key` 入口仍在（发版前保留）；
- Go/TS 测试与 typecheck 通过。

证据：`/tmp/gw-key-e2e2.png`、NewAPI 日志、`custom/gateway-acceptance.md`。

## 第二步（发版时）

1. 从 `SignInDialog` 移除“添加 API Key”（官方）按钮；
2. 移除 `deepseek-official` 的 `settings.onboarding` 注册/入口；
3. 从 base bundle 移除/禁用 `llm-deepseek` 官方 provider（保留 `llm-deepseek-api-key` 包给 gateway 复用）；
4. 更新登录文案为「登录 / 使用网关 API Key」；
5. 重跑本文件验收 + 旧官方 key 用户的升级说明。

## 安全与限制

- key 属于 NewAPI 用户；同一账号的多个 key 共享额度与文件；
- key 是 bearer 凭证，credential store 明文保存（与官方 key 相同），不要提交到 git；
- 当前 baseURL 固定本地 13000；正式分发前改为可配置/品牌网关 origin；
- 官方 Key 模式在发版前仍可用，但不应作为对外推荐路径。
