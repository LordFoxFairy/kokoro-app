# Kokoro User Web 仓库索引

状态：当前代码与治理入口，更新于 2026-09-23。

## 1. Owner 与非 Owner

本仓只拥有：

- User Web 页面与浏览器交互状态；
- 当前站点的 HttpOnly session envelope 与同源请求边界；
- `/api/*` browser-private adapter；
- 固定 BFF policy 约束的 `/iam/*` 原生 OAuth/OIDC 同源传输边界；
- AG-UI 到 Web 内部 view state 的适配职责。

本仓不拥有：

- Conversation、Message、Share、Project、ScheduledTask 或 durable AG-UI ledger；这些属于
  `kokoro-bff`；
- Run、Checkpoint、Lease、Tool Journal、HITL 或执行事件；这些属于 `kokoro-agent`；
- IAM、System、Model、Billing、Capability、Storage 或 Scheduler 的业务事实；
- PostgreSQL schema、Redis keyspace、migration 或服务端业务 repository。

## 2. 运行时入口

| 入口 | 说明 |
| --- | --- |
| `src/app/layout.tsx` | 根布局与 provider 装配 |
| `src/app/app/layout.tsx` | 登录后的桌面工作区布局 |
| `src/features/app/kokoro-app-surface.tsx` | mounted surface 路由投影 |
| `src/components/blocks/app-frame/app-frame.tsx` | 当前桌面 shell 组合；后续 UI 阶段处理 |
| `src/app/api/session/[...path]/route.ts` | Chat JSON/SSE/二进制的同源 BFF adapter；只转发显式 `Idempotency-Key` header，不从 JSON body 提升旧 key |
| `src/app/api/system/runtime-manifest/route.ts` | 经 BFF 获取 runtime manifest |
| `src/app/api/{hub,agents,scheduled-tasks,billing}/` | 业务 browser-private adapter |
| `src/app/api/auth/`、`src/app/api/team/` | 当前认证/团队适配；仍含 IAM 直连缺口 |
| `src/app/iam/[...path]/route.ts` | 固定 policy 的只读 IAM GET 同源 relay；仅 authorize 200 redirect JSON 转受限浏览器 302；直接 browser POST 与 server-only 凭据路由拒绝 |
| `src/app/iam/interactions/invitation/route.ts` | 邀请邮件的唯一静态入口：独立 issuer 登录/注册、recipient-only context；接受/拒绝写操作仍待下一切片 |
| `src/app/auth/sign-in/route.ts` | 原始签名 query 的 sign-in 页面与 Web-owned CSRF POST |
| `src/app/auth/{select-tenant,consent}/route.ts` | IAM 固定外层交互 URI 的严格 GET 到 `/iam/interactions/*`；外层 POST 405 |
| `src/app/iam/interactions/select-tenant/route.ts` | `/iam` cookie path 内的 owner `/organization/list` 候选、选择重核及 set-active 续接 |
| `src/app/iam/interactions/consent/route.ts` | `/iam` cookie path 内的未验签 scope 预览、明确同意及 IAM 最终验签；RP callback 未安装时受控 503 |

## 3. Chat 与契约入口

| 文件 | 角色 |
| --- | --- |
| `src/contract/agui-events.ts` | 校验 AG-UI frame 并投影到当前 reducer shape |
| `src/contract/session-events.ts` | 当前内部 reducer event shape；live client 仍将其当兼容 wire 读取 |
| `src/contract/{chat,control,artifacts,catalog,billing,scheduled}.ts` | browser-private JSON DTO 的 Zod schema |
| `src/contract/paths.ts` | 同源路径 helper |
| `src/contract/http.ts` | compatibility barrel；不定义新 schema |
| `src/engine/client.ts` | `/api/session` JSON/SSE client、cursor 与重连 |
| `src/engine/machine.ts` | Chat 状态机与 snapshot/event reconciliation |
| `src/core/reducer.ts` | 纯 UI 投影 |
| `contract/README.md` | owner、visibility、version、generation、breaking、provenance |
| `contract/api-contract.test.ts`、`tests/contract/` | contract 回归 |

规范目标是 AG-UI 为唯一 Web↔BFF 网络事件协议。`SessionEvent`、未来 Vercel AI SDK
`ChatTransport`/`UIMessage` 都是 Web 内部表示，不能被发布成 Developer API 或第二条 SSE。

## 4. 服务端边界

| 文件 | 说明 |
| --- | --- |
| `src/lib/server/auth.ts` | session cookie、nonce、session refresh 与当前 IAM client |
| `src/lib/server/product-bff.ts` | 普通受保护 BFF adapter 的在线 Product Session admission、唯一 Bearer 与 service identity |
| `src/lib/server/product-identity.ts` | RP callback/refresh 对固定 BFF `/v1/me` 的严格 subject/tenant 在线准入；wire 类型在此终止 |
| `src/lib/server/session-envelope.ts` | AES-256-GCM sealed envelope |
| `src/lib/server/domain-context.ts` | server-only `KOKORO_DOMAIN` 与 `Forwarded` |
| `src/app/iam/[...path]/route.ts` | server-only `KOKORO_WEB_ORIGIN`、固定 GET allowlist 与请求准入 |
| `src/lib/server/service-config.ts` | BFF 地址读取 |
| `src/lib/server/upstream-http.ts` | 上游 header 清洗与流式 transport |
| `src/lib/server/bff-response.ts` | BFF envelope、request id 与 no-store 响应 |
| `src/generated/iam-relay-policy.json` | 固定 BFF commit 的只读 policy snapshot |
| `src/lib/server/iam-relay-policy.ts` | snapshot provenance、只读 GET 子集、issuer cookie 入站过滤 |
| `src/lib/server/iam-relay-config.ts` | `/iam` 与 sign-in 共用的固定 Web origin/BFF/service-secret 配置解析 |
| `src/lib/server/iam-interaction-csrf.ts` | Redis 原子一次性 CSRF 摘要/交互绑定；唯一允许 Redis import 的 server-only 文件 |
| `src/lib/server/iam-interaction-page.ts` | 三条 IAM issuer GET 页面共享的无脚本品牌 HTML/CSS 外壳；表单字段与 POST 安全逻辑仍归各自 route |
| `src/lib/server/iam-invitation-input.ts` | 邀请入口 query、owner context 与有界表单的纯校验；不拥有网络调用或页面编排 |
| `src/lib/server/iam-invitation-page.ts` | 邀请专用中文登录、注册与 recipient-only 预览页面；不拥有 IAM/BFF 业务事实 |
| `src/lib/server/iam-invitation-page.ts` | 邀请登录、注册、context 的纯 HTML 投影；只对邀请启用紧凑视觉 variant，不改变已有 OAuth 交互外壳 |
| `src/lib/server/iam-interaction-route.ts` | 外层同源跳转及内层 tenant/consent 共用的严格 Origin/query/form 与安全导航边界 |
| `src/lib/server/iam-relay-transport.ts` | `/iam` 专用原生 HTTP transport；保持多 `Set-Cookie`、限额、deadline 与取消 |
| `src/lib/server/iam-relay-response.ts` | 原生 status/header/Location/issuer `Set-Cookie` 出站校验 |

## 5. Browser-only 状态

- `src/core/`、`src/lib/persisted-store.ts`：受 Zod 校验的 browser store；
- `src/dev/preview-transport.ts`：local/test 合成 Chat 历史；
- `src/features/app/kokoro-scheduled-surface.tsx`：preview Scheduled localStorage；
- `src/ui/theme/`、`src/i18n/`、`src/ui/shell/`：主题、locale、草稿和 UI 偏好。

这些数据不是服务端业务事实；完整分类见 [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)。

## 6. 文档阅读顺序

1. [`docs/CURRENT.md`](docs/CURRENT.md)
2. [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md)
3. [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)
4. [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
5. [`docs/SECURITY.md`](docs/SECURITY.md)
6. [`docs/RELIABILITY.md`](docs/RELIABILITY.md)
7. [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)
8. [`docs/SLO.md`](docs/SLO.md)
9. [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
10. [`docs/ADR/`](docs/ADR/)

历史设计、视觉审计和迁移资料的权威性分类见 [`docs/INDEX.md`](docs/INDEX.md)。

## 7. 验证入口

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Root 静态审计从父仓执行：

```bash
python3 scripts/verify-ten-repository-standard.py --format json
```

该命令会审计十仓；评估本仓时只提取 `repository == "kokoro"` 的诊断。它不替代本仓的真实
lint、typecheck、test、build、浏览器 E2E 或 live BFF 验收。
