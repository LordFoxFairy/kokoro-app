# Kokoro Business BFF Contract v1

状态：当前业务层实施基线（2026-09-01）。本文件优先于旧的 Gateway 兼容说明。

资源级 API 文档和机器可读契约以独立 BFF 子仓库为准：[`LordFoxFairy/kokoro-bff/docs/api/v1`](https://github.com/LordFoxFairy/kokoro-bff/tree/main/docs/api/v1)。本 Web 文档只记录浏览器 `/api/*` 到 BFF `/v1/*` 的适配关系，不复制 BFF 的业务实现。

## 1. 三个独立子仓库

```text
浏览器
  → LordFoxFairy/kokoro-app（Web，同源 /api/*）
  → LordFoxFairy/kokoro-bff（Chat + 业务投影 /v1/*）
  → 业务 API 子仓库（Projects、Skills、Scheduled、Library、Billing 等）

kokoro-bff（Chat 业务边界）
  → kokoro-agent 内部 Run/Control/Worker 契约

kokoro-agent
  → Redis run streams（执行 worker；当前没有 HTTP ingress）
```

- `kokoro-app` 是当前唯一 Web 入口；每个 site/product 仍然是独立仓库。
- `kokoro-bff` 是业务层，不是 Gateway。它负责面向 Web 的 Chat 编排、聚合、投影、幂等、错误归一和 Mock/Live upstream 选择。
- `kokoro-bff` 的 Chat 业务边界是 Chat 的唯一 Web 业务入口；它不把 Chat 拆成新的仓库，也不把 Agent Redis 暴露给浏览器。
- `kokoro-agent` 只负责 Redis Run/Control/Worker、事件和 outbox；BFF 通过内部 adapter 对接，不直接访问 Agent Redis。
- `kokoro-gateway` 不在当前运行拓扑、环境默认值、CI 或部署路径中；旧 Gateway 文档只作为历史兼容记录，不是接入要求。

## 2. BFF API v1

成功响应：

```json
{ "data": {}, "meta": { "request_id": "req_..." } }
```

错误响应：

```json
{
  "error": { "code": "project_not_found", "message": "Project was not found" },
  "meta": { "request_id": "req_..." }
}
```

| 方法 | BFF 路径 | 业务责任 |
| --- | --- | --- |
| GET | `/healthz`, `/readyz` | 进程和配置探针 |
| GET/POST | `/v1/projects` | 专案列表/创建 |
| GET | `/v1/projects/:projectId`, `/v1/projects/:projectId/tasks` | 专案与任务投影 |
| GET | `/v1/skills`, `/v1/skills/pool`, `/v1/skills/catalog`, `/v1/skills/quota` | 技能目录、可用池、配额 |
| GET | `/v1/skills/:name/revisions` | 技能版本历史 |
| POST | `/v1/skills/:name/enable`, `/v1/skills/:name/disable` | 技能启停；必须幂等 |
| POST | `/v1/skills/github/preview` | GitHub skill 预览；请求体 `{repository}`，纯预览不要求幂等键 |
| POST | `/v1/skills/github/import` | GitHub skill 导入；请求体 `{repository}`，必须幂等 |
| POST | `/v1/skills/upload/preview`, `/v1/skills/upload/confirm` | 技能包上传预检/发布；multipart，必须幂等的 confirm |
| GET/POST/PATCH/DELETE | `/v1/scheduled-tasks[/:id]` | 定时任务投影与变更 |
| POST | `/v1/scheduled-tasks/:id/retry` | 定时任务重试 |
| GET/POST | `/v1/mcp/servers` | MCP server 列表/注册 |
| POST/DELETE | `/v1/mcp/servers/:name/enable`, `/v1/mcp/servers/:name/disable`, `/v1/mcp/servers/:name` | MCP 启停/删除 |
| GET/POST/DELETE | `/v1/mcp/secrets[/:handle]` | secret handle 列表/创建/删除；不回显 secret |
| POST | `/v1/connectors/mcp`, `/v1/connectors/custom-apis`, `/v1/connectors/assets` | 自定义连接器与图标资产 |
| GET | `/v1/agents/connections/setup?platform=telegram\|line\|slack` | Agent 连接 setup 投影 |
| GET | `/v1/library` | 资料/产物投影 |
| GET | `/v1/billing/plans`, `/v1/billing/summary` | 套餐与用量摘要 |
| POST | `/v1/billing/checkout` | 业务 checkout 投影 |
| GET/POST/PATCH/DELETE | `/v1/sessions[/:id]` | Chat 会话、消息、标题和软删除 |
| GET/POST | `/v1/sessions/:id/events`, `/v1/sessions/:id/runs/:runId/control` | Chat SSE、Run control、HITL |
| POST/DELETE | `/v1/sessions/:id/share` | Chat 分享生命周期 |
| GET | `/v1/models`, `/v1/agents`, `/v1/artifacts[/:hash]` | Chat 候选、成果与下载投影 |

所有变更请求必须带 `Idempotency-Key`。BFF 按 namespace、方法、路径和 key 做幂等隔离；重复请求返回第一次结果。
唯一例外是 `POST /v1/skills/github/preview` 与 `POST /v1/skills/upload/preview`：它们只做预检，不写入业务状态。

GitHub skill 请求/响应冻结为：

```http
POST /v1/skills/github/preview
Content-Type: application/json

{ "repository": "https://github.com/OWNER/REPO" }
```

```json
{
  "data": {
    "repository": "https://github.com/OWNER/REPO",
    "default_branch": "main",
    "skill": { "name": "REPO", "description": "..." }
  },
  "meta": { "request_id": "req_..." }
}
```

## 3. Web 适配规则

Web 保留既有浏览器路径，只在 server route 改变 upstream：

| Web 同源路径 | BFF 目标 |
| --- | --- |
| `/api/hub/self/skills/*` | `/v1/skills/*` |
| `/api/hub/self/mcp/*` | `/v1/mcp/*` |
| `/api/hub/self/connectors/*` | `/v1/connectors/*` |
| `/api/hub/projects/*` | `/v1/projects/*` |
| `/api/scheduled-tasks*` | `/v1/scheduled-tasks*` |
| `/api/agents/connections/setup` | `/v1/agents/connections/setup` |
| `/api/billing/plans`, `/api/billing/checkout` | `/v1/billing/*` |

`/api/session/*` 是 Web 为兼容既有 `SessionClient` 保留的同源路径，不是独立服务入口；它始终由
Web server route 转换到 `${KOKORO_BFF_BASE_URL}/v1/*`。BFF 未配置返回 `503 bff_not_configured`，
不可达返回 `502 bff_unreachable`，不直连 Session，不回退 Gateway，也不静默切换 preview fixture。

## 4. 身份与域名

Web → BFF 只在服务端传入：

```http
x-kokoro-service: web-bff
x-kokoro-internal-secret: <KOKORO_BFF_SHARED_SECRET>
x-kokoro-namespace: <sealed-session namespace>
x-kokoro-principal-id: <trusted principal id>
x-kokoro-request-id: <request id>
```

BFF → 业务服务使用 `x-kokoro-service: kokoro-bff`，并由 `KOKORO_DOMAIN` 生成：

```http
Forwarded: host=dev.kokoro.localhost
```

`X-Domain`、浏览器 Host、`X-Forwarded-*`、浏览器自行携带的 tenant/site header 不参与业务路由或身份选择。所有三个仓库都只通过环境变量、版本化 HTTP/Redis 契约和独立 CI 互通，不引入对方源码、`src/site`、workspace package 或 submodule。

## 5. Mock → Live 验收顺序

1. BFF 自身先运行 `KOKORO_BFF_MODE=mock`，通过 `/healthz`、Chat、项目、Agent setup、Scheduled 和幂等测试。
2. Web server route 配置 `KOKORO_BFF_BASE_URL=http://127.0.0.1:4300`，验证 Web 保持原有 `/api/*` 形状并正确解包 projection。
3. Agent 侧仅验证自身 Redis worker contract 和本文边界；没有 HTTP ingress 时不伪造 Agent live endpoint。
4. 每个业务 API 子仓库分别提供 `/v1` 对应的版本化 live contract，再按 env 逐项替换 BFF mock upstream。
5. 三个仓库分别运行自己的 lint/typecheck/test/build/CI；父仓库不作为运行时依赖，也不汇总源码。
