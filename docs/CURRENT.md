# Kokoro User Web 当前状态

状态日期：2026-09-03。范围：当前 `kokoro` 子仓 checkout。本文把“已实现”“已接受目标”和
“未闭合缺口”分开；历史报告、preview fixture、旧截图和 Agent 自报不构成当前 commit 的生产证据。

## 1. 已实现

### 仓库与运行边界

- 独立 Next.js User Web，浏览器入口位于 `src/app/`。
- 浏览器业务请求使用同源 `/api/*`；Chat 的 `/api/session/*` 会转到
  `${KOKORO_BFF_BASE_URL}/v1/*`。
- Runtime Manifest、Skills/MCP、Agent setup、Scheduled 和 Billing 的主要 route 已以 BFF 地址
  作为业务上游。
- mutation route 的主要路径具有 Origin 比对；session route 不把浏览器 cookie 转发给 BFF。
- `KOKORO_DOMAIN` 仅在服务端读取；出站 transport 删除浏览器可控的 forwarding/tenant/site
  header 后重建 `Forwarded: host=<deployment-domain>`。
- session envelope 使用 AES-256-GCM 密封，cookie 为 HttpOnly、SameSite=Lax，production 启用 Secure。

### Chat 与契约

- `@ag-ui/core@0.0.59` 已锁定；`src/contract/agui-events.ts` 会先通过 AG-UI schema 校验，再投影到
  当前 reducer event shape。
- `src/engine/client.ts` 使用 fetch stream 消费 SSE，支持 `Last-Event-ID`、断流重连和 source cursor。
- JSON 输入/输出主要由 `src/contract/*.ts` 的 Zod schema 校验。
- `contract/api-contract.test.ts` 与 `tests/contract/` 覆盖路径、DTO、AG-UI parse 和部分边界。
- `src/generated/proto/` 保留一份带 digest/source commit 的冻结历史 consumer snapshot；当前运行时
  没有 import 它。

### 数据边界

- 本仓没有 `database/`、canonical schema、migration、ORM、PostgreSQL client 或 Redis client。
- browser storage 只承载 UI preference、draft、preview fixture 和本地投影；live 业务事实从 BFF 获取。

## 2. 已接受目标

- 唯一调用方向是 `Browser -> Web same-origin adapter -> kokoro-bff -> owner/Agent/Scheduler`。
- `/api/*` 的 visibility 固定为 `browser-private`；不发布到 Developer API。
- Web↔BFF 的 Agent 网络事件只使用 AG-UI；不保留 legacy `SessionEvent` wire、双读或 fallback。
- 仓内 `AgUiChatTransport` 将 AG-UI 映射为 Vercel AI SDK `UIMessage`/parts；AI SDK 只负责 Web 内部
  React 状态和渲染，不拥有网络协议、replay cursor 或 durable ledger。
- BFF 拥有 durable AG-UI projection 与公共 cursor；Web 只消费 snapshot/receipt/event 并执行
  reconciliation。
- Web 不直连 IAM/System/Agent 或其他 owner；认证也应经 BFF 的明确 owner adapter。

## 3. 未闭合缺口

### P0：架构与协议

1. `src/engine/client.ts` 目前先解析 legacy `SessionEvent`，失败后才解析 AG-UI，仍是双读网络路径。
2. `src/contract/session-events.ts` 和多处 engine/core 类型仍名为 `SessionEvent`；在网络双读删除前，
   其“仅内部投影”边界尚未由代码门禁保证。
3. `ai`、`@ai-sdk/react` 尚未安装，`AgUiChatTransport` 与 `UIMessage` 映射尚不存在。
4. Engine phase 目前是 `idle/submitting/streaming/reattaching/awaiting-hitl/error`，尚未完整显式建模
   `queued/resuming/cancelling/reconnecting/completed/failed` 的目标状态集合。
5. `src/lib/server/auth.ts` 仍直接使用 `KOKORO_IAM_BASE_URL` 调 IAM；这不符合最终 BFF-only 调用方向。

### P0：安全与可靠性

1. 上游 HTTP transport 传播 `AbortSignal`，但没有独立 connect/read/overall timeout 或响应大小上限。
2. route 的成功/错误 envelope、request id 和 `Cache-Control` 尚未全部统一；部分 route 仍返回
   `{error: string}` 或自行 flatten BFF 错误。
3. `next.config.ts` 没有全局 CSP、frame、referrer 和 permissions policy 响应头配置。
4. 没有专用 `/healthz`、`/readyz`；Dockerfile 本身也没有 `HEALTHCHECK`。
5. 缺少生产 telemetry：当前没有满足 `service/operation/request_id/trace_id/result/duration_ms` 的统一日志、
   SLI 采集和 burn-rate 告警证据。

### P1：质量与交付

1. `packageManager`/CI/Docker 仍固定 `pnpm@11.2.2`，Root 基线是 `pnpm@11.25.0`。
2. TypeScript 目前只有 `strict` 的基础配置；`useUnknownInCatchVariables` 已由 strict 生效并在本阶段
   显式固定，其余 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、
   `noImplicitReturns`、`noUnusedLocals`、`noUnusedParameters` 尚未开启，避免本阶段触发运行时代码修复。
3. 没有 `test:e2e`、Playwright/axe/视觉回归和 bundle budget 阻断门禁。
4. 多个 React/CSS 文件超过 Root 体量上限，且存在未登记 `!important`；留给独立 UI 重构阶段。
5. GitHub Actions 未固定完整 commit SHA；CI 无 dependency/source/secret scan；release 无候选镜像
   先扫描、SBOM 和漏洞扫描；基础镜像未固定 digest。
6. `docker-compose.example.yml` 会构建应用镜像，不符合 Root 的源码本地运行规则。
7. 冻结的 `src/generated/proto/` snapshot 来源位于已不在本仓的旧 Root contract；没有可运行的本仓
   generator，也没有 visibility extensions，不能作为当前 canonical 或公开 contract。

## 4. 当前验证口径

本仓自动化入口：

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Root 静态审计：

```bash
cd /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro
python3 scripts/verify-ten-repository-standard.py --format json
```

Root 审计是十仓 work queue；本阶段只评估 `repository == "kokoro"` 的切片。即使本仓 unit/build
通过，也不等价于 live BFF、浏览器 E2E、生产发布或 SLO 已验收。

## 5. 下一阶段顺序

1. 在不改变页面视觉的协议变更中删除 legacy SSE 双读，建立 `AgUiChatTransport`/`UIMessage` 单一路径。
2. 将 IAM 认证调用收口到 BFF，并统一所有同源 route 的 envelope、request id、timeout 与大小限制。
3. 单独执行 UI/CSS/React 拆分、可访问性和视觉回归工作。
4. 收敛 pnpm/CI/container 供应链与 health/ready/telemetry，再进行 live release acceptance。
