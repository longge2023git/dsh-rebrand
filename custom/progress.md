# 进度总览

> 最后更新：2026-11-03
> 单一进度入口。待办见 [backlog.md](backlog.md)，站点见 [site.md](site.md)，控制台见 [console.md](console.md)，Windows 打包见 [windows-handoff.md](windows-handoff.md)。

## 当前状态

| 成果 | 状态 | 位置 |
|---|---|---|
| 网关 `deepseekfa.com` | 运行中 | 87.107.108.14 `dsh-newapi` :3104，镜像 `20261103-mini-login4` |
| 网关 `deepseek-ru.org` | 运行中 | 104.248.155.54 `dsh-newapi-ru` :3105，镜像 `20261103-mini-login4` |
| 网关 `ds.openrouters.org` | 运行中（冻结） | 104.248.155.54 `dsh-newapi` :3104，镜像 `20261025a`；库已与 FA 分叉 |
| 官网 `www.deepseekfa.com` / `www.deepseek-ru.org` | 上线 | `feat/site` 构建，rsync 部署 |
| 迷你控制台 `deepseekfa.com/me/`、`deepseek-ru.org/me/` | 上线 | fa/ru/en 三语，含邀请、转账、密钥、计费明细 |
| macOS 安装包（两品牌） | 已发布 `0.2.1-rc.2.20261103.1` | 下载页 + `/downloads/` |
| Windows 安装包 | 交接单与脚本就绪，**等 Windows 机器构建** | [windows-handoff.md](windows-handoff.md) |
| 邀请奖励 | 已开启 | 新用户 $0.10 / 被邀请人 +$0.50 / 邀请人 $1.00 |
| 邮箱验证 | 已开启（两站） | 注册需邮箱+验证码（hex），用户名由邮箱派生；两站各用真实邮箱跑通过一次 |
| 两步验证 | 可选，已上线 | 密钥手动加入认证器；备份码 4 个；登录动态码步骤；桌面登录已放行 |
| 用量统计 | 已上线 | 按天 / 按模型汇总，7 或 30 天 |
| 旧密钥清理 | 已上线 | 未使用 >7 天或闲置 >30 天的密钥一键清理 |
| 安全头 | 已上线 | noindex / frame deny / no-referrer / 严格 CSP（外部 boot.js） |
| 限流 | 默认 20 次/20 分钟 | 测试期临时放宽过，2026-11-03 已恢复 |

## 里程碑

| ID | 事项 | 状态 | 证据 |
|---|---|---|---|
| M-00~M-05 | 二开仓库、Files API、账户协议、relay 合并、桌面文本 | 完成 | git 历史与旧验收记录 |
| M-06 | 桌面端图片附件 | 完成 | macOS 包内验证 |
| M-07 | 双品牌官网（fa/ru） | 完成 | `site/build.mjs`，两站上线 |
| M-08 | 迷你控制台 | 完成 | `console/build.mjs fa\|ru`，[console.md](console.md) |
| M-09 | 邀请码 + 奖励 + 转账 | 完成 | [console.md](console.md) |
| M-10 | macOS 两品牌发布 | 完成 | `0.2.1-rc.2.20261103.1` |
| M-11 | Windows 构建交接 | 就绪待产出 | [windows-handoff.md](windows-handoff.md) |
| M-12 | 桌面端登录改用迷你页 | 完成（客户端无需升级） | [console.md](console.md#桌面登录的路径约束改之前必读) |
| M-13 | apex 入口切换到迷你站 | 完成 | [site.md](site.md#apex-入口路由) |
| M-14 | 迷你站补充值页与退出登录 | 完成 | [console.md](console.md) |

## 关键决策

| 决策 | 结论 | 记录 |
|---|---|---|
| 邮箱注册 | **不采用**。New API 的邮箱落库依赖 `EmailVerificationEnabled`，开启又需要 SMTP 验证码；选择保持用户名注册，网关代码与上游一致 | [console.md](console.md) |
| 邀请奖励数值 | 邀请人 $1.00 → `aff_quota`；被邀请人 $0.50 → 余额；新用户 $0.50 → 余额 | [console.md](console.md) |
| Windows 构建 | 由 Windows 机器构建（不能从 macOS 交叉打），exe + 清单上传后页面自动出现 | [windows-handoff.md](windows-handoff.md) |
| 服务端消息波斯语 | 未做，报错文案仍回落英文 | backlog I-01 |
| SMTP / 邮箱验证 | 未启用；方案与实测（两台均可直连国外 SMTP）见 [smtp-plan.md](smtp-plan.md) | backlog I-02 |
