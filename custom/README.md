# 知识库索引

> 最后整理：2026-11-03。**先看这里，再决定读哪份。**

## 1. 现状（会随部署变化）

| 文档 | 内容 |
|---|---|
| [progress.md](progress.md) | 三套部署、里程碑、关键决策 —— **事实总入口** |
| [site.md](site.md) | 官网两品牌：构建、部署、apex 路由、Windows 下载位、macOS 发布流程 |
| [console.md](console.md) | 迷你控制台：页面、接口、邀请奖励、桌面登录路径约束、E2E 脚本 |
| [smtp-plan.md](smtp-plan.md) | 邮件：Resend 域名状态、SMTP 配置、自建可行性实测、验证码 UI |
| [backlog.md](backlog.md) | 已明确但未做的事项 |

## 2. 运维手册

| 文档 | 内容 |
|---|---|
| [server-deployment.md](server-deployment.md) | 服务器、容器、镜像、nginx、可复现部署步骤 |
| [networking.md](networking.md) | 代理、上传目标表、大文件约定、Windows 构建机公钥 |
| [windows-handoff.md](windows-handoff.md) | 交给 Windows 机器构建与上传安装包的完整交接单 |
| [deepseek-fa-desktop.md](deepseek-fa-desktop.md) | 桌面端身份、图标、构建（macOS）、安装验证 |
| [runbook.md](runbook.md) | 本地开发环境：git 远端、启停、常见故障 |

## 3. 决策记录（ADR）

| 文档 | 结论 |
|---|---|
| [adr-001-relay-boundary.md](adr-001-relay-boundary.md) | 为什么要有 relay 边界 |
| [adr-002-merge-relay-into-newapi.md](adr-002-merge-relay-into-newapi.md) | relay 合并进 NewAPI 二开网关 |

## 4. 历史资料（仅追溯，别再照做）

| 文档 | 说明 |
|---|---|
| [requirements.md](requirements.md) | 最初需求 |
| [login-relay-spec.md](login-relay-spec.md) | 已删除的 relay 实现规格 |
| [files-api-research.md](files-api-research.md) | Files API 调研 |
| [review-findings.md](review-findings.md) | 早期评审记录 |
| [gateway-acceptance.md](gateway-acceptance.md) | 2026-10-26 验收记录 |
| [gateway-api-key-plan.md](gateway-api-key-plan.md) | API Key 模式计划 |
| [engineering-process.md](engineering-process.md) | 早期工程流程笔记 |
| [deepseek-fa-domain-migration.md](deepseek-fa-domain-migration.md) | **已作废**的 `deepseek-fa.org` 方案 |
| [windows-build-guide.md](windows-build-guide.md) / [windows-agent-handoff.md](windows-agent-handoff.md) | 已合并进 windows-handoff.md，仅留指针 |

## 维护约定

- 同一个事实只写一处：部署状态写 progress/server-deployment，站点写 site，控制台写 console，邮件写 smtp-plan
- 新增文档先在本索引登记，并标注「现状 / 运维 / 决策 / 历史」
- 历史文档在标题下加 `> 状态：历史资料（日期）` 横幅
