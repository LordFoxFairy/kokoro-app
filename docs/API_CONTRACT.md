# Kokoro User Web API 契约策略

状态：browser-private 治理基线，2026-09-03。

## 1. Visibility 与发布边界

本仓所有浏览器同源 `/api/*` 都是 `browser-private`。它们由 `kokoro` 拥有，只用于当前 Web 与
同一部署中的 server adapter 协同升级，不承诺第三方兼容性，也不进入 Developer API 门户。

只有 `kokoro-bff` 自有、标记为 `public` 的 Product API 可以进入 Developer API。Web 文档可以链接
固定 BFF artifact，但不得复制一份可编辑 OpenAPI、发布内部 route，或把 browser-private DTO 宣称为
公开 API。

## 2. 调用拓扑

```text
Browser /api/*                         browser-private
  -> Web same-origin adapter
  -> kokoro-bff /v1/*                  BFF-owned Product API
  -> owner APIs / Agent / Scheduler    internal-owner or event-protocol
```

终态不允许 Web 直连 IAM/System/Agent/其他 owner。当前认证 helper 仍直连 IAM，是已登记迁移缺口，
不是新的允许例外。

## 3. 当前契约来源

| 来源 | 用途 | 权威性 |
| --- | --- | --- |
| `src/app/api/**/route.ts` | 实际注册路径、method、header 与 projection | 当前运行事实 |
| `src/contract/*.ts` | Zod request/response、path helper、AG-UI narrowing | 当前 runtime contract source |
| `contract/api-contract.test.ts`、`tests/contract/` | 正向、拒绝、路径和 event 回归 | 可执行约束 |
| `docs/integration/*.md` | 细节与历史上下文 | 次级参考；可能滞后 |
| `src/generated/proto/*` | 旧 Root source 生成的 consumer snapshot | 冻结历史；当前不可再生、未被 runtime import |

本仓没有活跃的 `contract/openapi/` 或 generator。不得手改 `src/generated/proto/` 使其看似当前；若
重新引入生成流程，source、生成器、固定工具版本、digest、breaking check 和 CI 必须一起落在正确 owner。

## 4. Browser-private route 分类

| 浏览器路径 | 当前用途 | 目标上游 |
| --- | --- | --- |
| `/api/session/*` | Chat snapshot、command、control、AG-UI SSE、artifact/share | `kokoro-bff /v1/*` |
| `/api/hub/*` | Skills、MCP、Projects 的历史 browser alias | `kokoro-bff /v1/{skills,mcp,projects}/*` |
| `/api/agents/*` | Agent connection setup 投影 | `kokoro-bff /v1/agents/*` |
| `/api/scheduled-tasks/*` | Scheduled typed adapter | `kokoro-bff /v1/scheduled-tasks/*` |
| `/api/billing/*` | Billing catalog/checkout 投影 | `kokoro-bff /v1/billing/*` |
| `/api/system/runtime-manifest` | 当前产品/surface 的 manifest | `kokoro-bff /v1/system/runtime-manifest` |
| `/api/shared/*` | 公开 share 投影 | `kokoro-bff` owner route |
| `/api/auth/*`、`/api/team/*` | 登录、session 和团队切换 | 目标经 BFF；当前仍有 IAM 直连 |
| `/api/dev/*` | 非 production preview fixture | 无 live upstream；不得在 production 启用 |

Catch-all route 不表示浏览器可以任意代理 `/v1`；允许路径必须由 client/schema/route test 明确冻结。

## 5. JSON 与 HTTP 规则

### 5.1 通用形状

BFF 成功：

```json
{"data": {}, "meta": {"request_id": "REQUEST_ID"}}
```

BFF/Web 错误：

```json
{"error": {"code": "stable_code", "message": "safe message"}, "meta": {"request_id": "REQUEST_ID"}}
```

Web 可在 browser-private 边界将 BFF success `data` 投影成当前 UI 所需 DTO，但错误必须保留稳定 code
与 request id。当前部分 route 仍返回 flat `{error: string}`，列为收敛缺口，不能作为新 route 模板。

### 5.2 输入与命名

- 浏览器 JSON 使用 `snake_case`；外部值先以 `unknown` 接收并经 Zod 校验。
- tenant、subject、service identity、部署域名和 request id 不从 body 推导。
- opaque ID 在 path segment 中只编码一次；分页使用 opaque cursor 和稳定排序。
- 长期公开 offset pagination 不由 Web 定义。

### 5.3 幂等与并发

- POST/PATCH/DELETE 等具副作用 command 使用 `Idempotency-Key`；相同 key/相同 digest 重放原结果，
  相同 key/不同 digest 返回冲突。
- 浏览器可产生 command identity，但 durable receipt 与 request digest 由 BFF owner 保存。
- 幂等身份缺失时不做自动 mutation retry。
- 资源版本冲突由 BFF contract 的 version/ETag/receipt 语义表达；Web 不猜测成功。

### 5.4 身份、缓存和错误

- 浏览器只携同源 cookie；Web 不把 cookie 原样转发 BFF。
- mutating request 需要同源防护；server adapter 重建 allowlisted header。
- 用户/工作区 JSON 和 SSE 使用 `private, no-store`；不在公共 CDN 缓存。
- 返回体不得含 SQL、堆栈、provider secret、runtime JWT、refresh token、internal URL 或 tenant selector。
- `x-request-id` 与 body `meta.request_id` 应一致；`Retry-After` 只按 allowlist 透传。

## 6. AG-UI 单协议规则

Web↔BFF 的 Agent event stream 只使用 AG-UI canonical event union：

- 标准 Run、Text、Tool、Reasoning、Activity、Subagent、Interrupt/Resume 事件优先；
- Kokoro 专有 artifact/delivery 只能使用有命名空间、已登记 schema 的 `CUSTOM`；
- BFF durable ledger 的 cursor 是唯一 replay axis；`Last-Event-ID` 回传该 cursor；
- Web 对 AG-UI 校验后映射为内部 `UIMessage` parts 或纯 reducer event；内部表示不回到网络；
- 不允许 legacy `SessionEvent` SSE、双读、protocol fallback 或第二个 resumable stream；
- `AgUiChatTransport` 是仓内 Vercel AI SDK adapter，不是 server endpoint，也不拥有持久化事实。

当前源码已有 AG-UI parser，但仍保留 legacy network parse fallback，且 AI SDK adapter尚未实现。
因此本节是已接受 contract 方向，不是“迁移已完成”的证据。

## 7. 版本与 breaking policy

- browser-private contract 与 Web commit 共同版本化；不单独承诺 public semver。
- BFF upstream 始终使用显式 `/v1`，其 breaking policy 由 `kokoro-bff` owner contract 定义。
- 变更顺序：BFF owner contract/artifact → Web 固定来源/digest → Zod/AG-UI parser → adapter → tests/docs。
- V1 clean-build 不保留双读、旧 endpoint alias 或 runtime fallback；协调发布后删除旧形状。
- generated 输出只读，必须由固定 source/generator 再生并通过 drift/breaking check。

## 8. 最小 contract test

每次变更至少覆盖：

1. 正常 request/response/event；
2. unknown field、缺失字段和边界值拒绝；
3. tenant/identity 字段不能由 browser body/header 注入；
4. idempotency、cursor、`Last-Event-ID` 和 request id；
5. BFF error envelope 与不泄密映射；
6. AG-UI 未知/非法事件 fail-loud；
7. live 失败不回退 preview 或旧协议；
8. browser-private contract 不进入 Developer API catalog。

执行入口：

```bash
pnpm contract
pnpm test:architecture
```
