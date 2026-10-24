# dsh-rebrand

Independent fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), based on
`dsh-v0.2.1-rc.2` (`687f282e`). This repository is **not** affiliated with or endorsed by DeepSeek.

Status: rebranding, local relay, and RTL groundwork in progress. The Agent core is intentionally
unchanged; the fork concentrates on branding, authentication, UI direction, and desktop distribution.

## Start here

| Document | Purpose |
|---|---|
| [PLAN.md](PLAN.md) | Scope, milestones, estimates, risks |
| [custom/requirements.md](custom/requirements.md) | Confirmed requirements and acceptance criteria |
| [custom/review-findings.md](custom/review-findings.md) | Independent review findings and corrections |
| [custom/login-relay-spec.md](custom/login-relay-spec.md) | Account/inference relay protocol |
| [custom/engineering-process.md](custom/engineering-process.md) | Issue → AI PR → CI → acceptance workflow |
| [custom/runbook.md](custom/runbook.md) | Local start/stop, desktop launch, network recovery |
| [custom/files-api-research.md](custom/files-api-research.md) | Files API standard, billing, and gateway options |
| [custom/backlog.md](custom/backlog.md) | Known TODOs, including NewAPI `/v1/files` |
| [custom/adr-001-relay-boundary.md](custom/adr-001-relay-boundary.md) | Early external-relay decision (superseded) |
| [custom/adr-002-merge-relay-into-newapi.md](custom/adr-002-merge-relay-into-newapi.md) | Merge relay into NewAPI: single-gateway design |
| [custom/gateway-acceptance.md](custom/gateway-acceptance.md) | Single-gateway acceptance matrix and known limits |
| [custom/gateway-api-key-plan.md](custom/gateway-api-key-plan.md) | Gateway API Key mode (step 1 done, step 2 at release) |
| [custom/server-deployment.md](custom/server-deployment.md) | Production deployment at ds.openrouters.org |
| [custom/deepseek-fa-domain-migration.md](custom/deepseek-fa-domain-migration.md) | TODO: switch gateway domain to deepseek-fa.org |
| [custom/deepseek-fa-desktop.md](custom/deepseek-fa-desktop.md) | DeepSeek-FA desktop identity, isolation and packaging |
| [custom/windows-build-guide.md](custom/windows-build-guide.md) | Windows x64 unsigned build guide |
| [custom/windows-agent-handoff.md](custom/windows-agent-handoff.md) | Windows agent build/upload handoff |
| [custom/progress.md](custom/progress.md) | Single progress dashboard |
| [services/relay/README.md](services/relay/README.md) | Archived relay reference implementation (not started) |

## Local stack

```
DSH desktop/web → New API :13000 → DeepSeek Anthropic API

`services/relay/` is retained as a protocol reference and conformance test only; it is not started.
```

See the runbook for prerequisites, desktop launch (`env -u ELECTRON_RUN_AS_NODE ...`), and the
host-proxy workaround for containers.

## License and marks

MIT, see [LICENSE](LICENSE). Upstream attribution is in [NOTICE](NOTICE); trademark guidance is in
[TRADEMARKS.md](TRADEMARKS.md). Upstream brand assets are not used to identify this fork.
