# Kokoro User Web 技术设计

状态：当前架构与目标收敛设计，2026-09-03。

## 1. 目标与范围

`kokoro` 是单一产品的 User Web 和同源 adapter。设计目标是让浏览器只理解 Web 可见模型，让
身份、业务事实、持久化、执行和跨 owner 编排保留在后端 owner。本文不把未来目标冒充当前实现；
差异统一列在 [`CURRENT.md`](CURRENT.md)。

## 2. Owner 与依赖方向

```text
Browser UI
  -> browser clients / Web state adapters
  -> Next.js same-origin interfaces (/api/*)
  -> kokoro-bff public Product API (/v1/*)
  -> internal owner APIs / Agent / Scheduler
```

| 层 | 本仓职责 | 禁止事项 |
| --- | --- | --- |
| Browser presentation | route、React surface、view state、可访问交互 | 读取 server secret、tenant/site selector、内部 URL |
| Browser application | Chat transport、reducer、query/mutation adapter、preview fixture | 建立第二条网络协议、把 localStorage 当业务事实源 |
| Contract boundary | Zod parse、AG-UI parse、path helper、DTO mapper | 在 UI 组件复制 JSON shape、把 generated wire type 当 view model |
| Same-origin interfaces | cookie、Origin、header 清洗、BFF envelope、stream proxy | SQL、业务状态机、跨 owner 编排、直连 owner 终态 |
| Bootstrap/config | server-only 环境读取和 client 装配 | 把服务地址或 secret 打入 browser bundle |

Web 不需要服务端 DDD 的空目录模板；关键约束是 Browser、server adapter、contract 和 UI 状态之间
依赖清晰。服务端业务 DDD 层属于 BFF/owner 仓。

## 3. 组件

### 3.1 Next.js 与同源 adapter

- `src/app/` 提供页面和 route handler。
- `src/lib/server/auth.ts` 管理 session envelope 与认证辅助逻辑。
- `src/lib/server/domain-context.ts` 从 `KOKORO_DOMAIN` 构造可信 `Forwarded`。
- `src/lib/server/upstream-http.ts` 清洗 browser-controlled forwarding/tenant header 后发往上游。
- `src/lib/server/bff-response.ts` 负责 BFF envelope、request id 与 no-store 响应的公共部分。

当前多数业务 route 已走 `KOKORO_BFF_BASE_URL`，认证仍直连 IAM。终态要求全部 owner 访问经 BFF
明确 adapter 完成，Web 不保存 owner base URL。

### 3.2 Chat 数据流

目标数据流：

```text
POST command + Idempotency-Key
  -> BFF receipt
  -> snapshot / durable AG-UI SSE
  -> AgUiChatTransport
  -> UIMessage parts / local reducer projection
  -> React rendering
```

- BFF 拥有 Conversation、Message、receipt、durable AG-UI ledger 和 cursor。
- Web 发送 command，依据 receipt 与 event reconciliation 收敛 optimistic state。
- `Last-Event-ID` 携带 BFF durable cursor；断线从下一条事件恢复。
- AG-UI 是唯一网络事件 union。Kokoro domain artifact/delivery 可使用有命名空间的 `CUSTOM`，但标准
  Run/Text/Tool/Reasoning/Activity/Subagent/Interrupt 事件优先。
- `AgUiChatTransport` 和 Vercel AI SDK `UIMessage` 是 Web 内部适配；它们不发布 endpoint，不拥有
  durable cursor，不定义第二个 resumable stream。

当前 `parseAgUiEvent` 会把 AG-UI 投影为旧 reducer `SessionEvent`，而 network client 仍双读两种
wire；这是迁移状态，不是终态设计。

### 3.3 Browser state 与 preview

- live snapshot/event 是服务端事实；localStorage 只能缓存 UI preference、draft 或有限本地投影。
- `src/dev/` 的 preview transport 仅用于 local/test，必须由显式 preview 配置选择。
- live 请求失败保持 unavailable/error，不回退 preview fixture。
- URL 是可分享/可恢复页面状态的首选；敏感 token 不进入 URL、localStorage 或客户端日志。

## 4. 契约边界

| 契约 | Owner | Visibility | 当前来源 |
| --- | --- | --- | --- |
| Web `/api/*` | `kokoro` | `browser-private` | route + `src/contract` + tests |
| BFF `/v1/*` Product API | `kokoro-bff` | `public` 或 BFF 定义的受限面 | BFF 自有 OpenAPI artifact |
| Web↔BFF Agent events | `kokoro-bff` | Web 消费的 AG-UI | BFF contract + `@ag-ui/core` + Web narrowing parser |
| BFF↔owner/Agent/Scheduler | 各事实 owner | `internal-owner` / `event-protocol` | owner 自有 contract |
| `src/generated/proto/*` | 历史 consumer snapshot | 不发布 | 冻结 provenance；当前不可再生 |

Web 不复制 BFF OpenAPI，也不把同源 contract 放进 Developer API。详细策略见
[`API_CONTRACT.md`](API_CONTRACT.md) 和 [`../contract/README.md`](../contract/README.md)。

## 5. 身份与安全

1. 浏览器仅自动携带同源 cookie。
2. Web 解封 HttpOnly session envelope，获得 server-side runtime credential 与用户上下文。
3. mutation 执行同源检查；上游 header 从 allowlist 重建。
4. Web 注入 service identity、request id 和部署域名上下文。
5. BFF 重新执行认证、授权、tenant isolation 和 owner 调用；Web 的展示状态不构成授权。

`Forwarded` 是路由上下文，不是认证凭据。详细 threat boundary 见 [`SECURITY.md`](SECURITY.md)。

## 6. 失败、重试与恢复

- JSON：外部 unknown 先过 Zod，再进入 Web 状态。
- SSE：非法 frame fail-loud；网络断流按 durable cursor 重连；不能切换到另一协议或 fixture。
- mutation：只有具备幂等 identity 时才可重试。
- error：保持稳定 code、request id 和适当 HTTP status，不回传堆栈、SQL、token 或 provider 原文。
- cache：身份相关 JSON/SSE 默认 `private, no-store`；只对内容寻址静态资源使用公共缓存。
- shutdown：浏览器 abort 应传播到 Web/BFF；server transport 仍需补 connect/read/overall timeout。

完整运行策略见 [`RELIABILITY.md`](RELIABILITY.md)。

## 7. 部署

- Node 22 standalone Docker image 或 OpenNext/Cloudflare Worker。
- 一个仓库对应一个产品发布单元；域名由运行时环境注入，不在 React/CSS 中分支。
- 本地应用从 `pnpm dev` 启动；容器用于 release candidate/smoke，不替代源码验证。
- 当前 Docker/CI 仍缺 digest pin、Dockerfile HEALTHCHECK、候选镜像扫描、SBOM 和完整 action SHA pin。

## 8. 变更顺序

1. 先更新本仓 browser-private contract/ADR 与 BFF owner contract 的固定引用。
2. 更新 Zod/AG-UI boundary 和 focused contract test。
3. 更新 server adapter 或 browser transport。
4. 更新状态机/UI consumer；删除旧 wire/fallback，而不是双读长期共存。
5. 运行 contract、architecture、lint、typecheck、test、build、E2E/live smoke。
6. 同 commit 更新 CURRENT、ACCEPTANCE 和必要 runbook。
