# 阶段 2 拓扑与废弃引用整理报告 v1

日期：2026-09-01
范围：Root 手册与 `kokoro` Web 子仓库文档
执行方式：仅文档整理；未修改代码、未提交、未推送

## 1. 权威结论

```text
浏览器
  → kokoro-app（独立 Web；同源 /api/*）
  → kokoro-bff（Chat + 业务 BFF；/v1/*）
  → owner repos（IAM / System / Model / Billing / Capability / Storage / Scheduler）

kokoro-bff（Chat 业务边界）
  → kokoro-agent（内部 Run/Control/Worker 契约）
```

- `kokoro-bff` 的 Chat 业务边界是 Chat 的唯一业务入口；Session 是 Chat 资源概念，不是独立子仓库。
- `kokoro-gateway`、`kokoro-session`、`kokoro-platform`、旧 `kokoro-web` 和 `kokoro-credit` 只保留历史/归档语义。
- Credit 归属 `kokoro-billing`；Scheduler 保持独立 Go 子仓库。
- 正式运行时使用 PostgreSQL + Redis；Storage 对象字节使用 S3-compatible ObjectStore。
- Web 不直连 owner repo；Web 的业务入口只有 `KOKORO_BFF_BASE_URL`。`KOKORO_DOMAIN` 由服务端生成 RFC 7239 `Forwarded`，浏览器自定义 `X-Domain` 不构成可信上下文。

## 2. 本次写入文件

| 文件 | 处理内容 |
|---|---|
| `docs/kokoro-handbook/README.md` | 增加阶段 2 owner 速查；区分当前模块与历史模块；修正 PG/Redis、Chat/BFF、Billing/Credit、Platform/Hub 和旧 Mongo/MySQL 叙述。 |
| `kokoro/docs/integration/kokoro-gateway-boundary-v1.md` | 重写为历史归档页；保留 Gateway 设计考古，但明确不属于当前运行、CI、Docker 或部署。 |
| `kokoro/docs/integration/chat-handoff-contract-v1.md` | 明确 Session 是 BFF Chat 资源；Direct/Project Chat 共用 Web `/api/session/*` 兼容路径与 BFF `/v1/sessions/*`。 |
| `kokoro/docs/integration/mock-fixture-matrix-v1.md` | 将 Chat fixture 指向 BFF；对 v214/v221 的 Gateway 配对内容加历史标签；Scheduled live 指向 BFF 与独立 Scheduler。 |
| `kokoro/docs/first-site-live-runbook.md` | 将首站链路、环境变量、Forwarded 验收和部署入口统一到 Web→BFF→owner repos。 |
| `kokoro/docs/integration/user-web-api-contract-v4.md` | 作为必要的同目录权威契约，移除旧 Hub/Agent 直连作为当前 fallback 的叙述，明确 BFF `/v1/*` 为业务入口。 |
| `kokoro/docs/integration/kokoro-subrepo-boundary-v1.md` | 作为必要的同目录边界审计，标记旧 Web 直连变量为历史或 BFF/owner 部署变量。 |
| `kokoro/docs/integration/stage2-topology-documentation-cleanup-report-v1.md` | 本报告。 |

## 3. 历史引用处理规则

保留名称只为可检索的考古信息，不作为新实现入口：

| 历史引用 | 当前入口 |
|---|---|
| `kokoro-gateway` / `KOKORO_GATEWAY_BASE_URL` | `kokoro-bff` / `KOKORO_BFF_BASE_URL` |
| `kokoro-session` / `KOKORO_SESSION_BASE_URL` | `kokoro-bff` Chat 业务边界 / `/v1/sessions/*` |
| `kokoro-platform` / `kokoro-hub` | `kokoro-bff` adapter + `kokoro-capability` |
| `kokoro-credit` | `kokoro-billing` 内部 Credit bounded context |
| `KOKORO_HUB_BASE_URL` / `KOKORO_AGENT_BASE_URL` | BFF 自己管理对应 owner adapter；Web 不读取 |
| Mongo/MySQL 运行时叙述 | PostgreSQL + Redis；旧 schema 仅作历史审阅 |

## 4. 检查结果

| 检查 | 结果 |
|---|---|
| 先读 `docs/CODEBASE_MAP.md` | PASS |
| `python3 scripts/verify-repository-topology.py` | PASS；10 个正式运行仓，6 个归档仓目录缺失 |
| `python3 contract/validate_slice_a_manifest.py contract/slice-a-contract-manifest.yaml` | PASS；`slice_a_manifest_valid` |
| `uv run python scripts/contract/render_slice_a.py --manifest contract/slice-a-contract-manifest.yaml --check` | PASS；`slice_a_contract_tree_verified` |
| `python3 scripts/goal2/mock_cross_repository_closure.py` | PASS；BFF→owner、Billing→Scheduler、Capability→Storage、Scheduler 边界均通过 |
| scoped Markdown 本地链接检查 | PASS；8 个文档，0 个缺失链接 |
| `git diff --check`（Root 与 Web scoped files） | PASS |
| Git commit / push | 未执行 |

## 5. 未纳入本轮

本轮严格保持文档范围：没有修改 Web/BFF/Agent 或 Goal 2 子仓库代码，没有修改其他仓库的 CI/Docker，也没有处理 GitHub remote、镜像发布或工作树提交。后续代码闭环应以本报告列出的当前契约为输入，避免恢复 Gateway/Session/Hub/Agent 的 Web 直连 fallback。
