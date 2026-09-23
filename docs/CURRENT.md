# Kokoro User Web 当前状态

状态日期：2026-09-23。范围：`kokoro-app` 独立子仓。本文只陈述当前工作树可验证的事实；历史报告、preview fixture、截图和 Agent 自报均不构成生产验收。

## 1. 当前边界

- 浏览器只访问同源 `/api/*`；Chat 请求经 `/api/session/*` 代理到 `${KOKORO_BFF_BASE_URL}/v1/*`。Web 不拥有 PostgreSQL、Redis、ORM、migration 或任意 owner 数据库事实。
- Session cookie 使用 AES-256-GCM 信封，设置为 `HttpOnly`、`SameSite=Lax`，生产环境额外设置 `Secure`。浏览器 cookie 不透传给业务上游。
- Product 上游调用由 `src/lib/server/upstream-http.ts` 统一执行：重建可信 `Forwarded` 上下文，删除浏览器可控的 domain/tenant/site/forwarded 头，设置总 deadline，并限制请求与响应体大小。W1C-2A `/iam` 原生协议例外使用独立 transport，避免合并多个 `Set-Cookie`。
- `src/proxy.ts` 为每次页面请求生成 CSP nonce；配合动态 layout 注入的 nonce，响应包含 CSP、frame、referrer、permissions 与 no-sniff 防护头。`/api/*` 明确 `Cache-Control: no-store` 与 `Vary: Cookie`。
- `kokoro-app` 是 Web remote 名；主控仓中的对应 submodule 路径是 `apps/kokoro-app`，不使用歧义的 `kokoro/` 名称。
- W1C-2A 已新增 BFF-only 的同源 `/iam/[...path]` 只读入口：只允许固定 policy 中无需 browser Bearer 的
  discovery、JWKS、authorize、issuer session 与 organization GET；浏览器 POST、userinfo、end-session、
  Authorization 和 handler 可见的未知/编码 route alias 均在连接 BFF 前拒绝。固定 server-only
  `KOKORO_WEB_ORIGIN` 同时约束请求 URL origin、Host、可选 Origin 与响应 Location，缺失或不匹配即
  fail closed，不从浏览器 Host 推导。真实 Next HTTP 探针记录 dot/encoded-dot 在 handler 前成为同一
  canonical route、双斜线返回 308、编码 route 名返回 404，并证明无 Content-Length 的 chunked GET body
  在连接 BFF 前返回 400；这些行为不扩张固定 allowlist。policy 中三个 `/auth/*` Location 仅为 W1C-2B
  保留，页面当前未安装，W1C-2A 不构成可用登录流。专用 transport
  保持原生 status/header/body 与多个
  `Set-Cookie`，并实施 issuer-cookie 白名单、16 KiB header、1 MiB response、5 s deadline 与取消传播。
- 只读 snapshot 固定 BFF `cd1c2600ea2a6e0716b07628822a49653964675a`、IAM
  `b838853a81ff34bd0f7a079ccc75ba6abd61d1ec` 和 policy SHA-256
  `457909cd8c6ce77d59ca4cb929f22b439ebf00154256381a0cc3d6a32c2e8fb2`；Web 不编辑 owner policy，
  `tests/contract/iam-relay-policy.test.ts` 对 snapshot 原始字节与 provenance 做漂移门。

## 2. 已落地的质量门

- 单仓工具链固定 Node `>=22 <23`、`pnpm@11.25.0`，`.npmrc` 启用严格 engine、精确版本和 peer dependency 检查。
- `pnpm check` 依次执行 contract、架构、lint、typecheck、unit/integration test 与 production build；Playwright/axe 浏览器门禁单独使用 `pnpm test:e2e`。
- Scheduled Tasks 与 MCP configuration 已按 feature/职责拆分；scheduled feature 的 AST 架构测试约束 React 入口与函数体量，测试归 Web 子仓所有，不迁入主控仓。
- CI 固定 Action 的完整 SHA，执行文件系统 dependency/misconfiguration/secret 扫描、浏览器 accessibility/responsive smoke 和镜像候选构建。发布流在推送前扫描候选镜像、验证 health/隐私响应头，并生成 SBOM、provenance 与 digest 签名。
- 生产 Dockerfile 固定 Node base image digest，并提供非 root 运行与 `HEALTHCHECK`；本地开发仍从源码 `pnpm dev` 运行，compose 示例只引用已构建镜像。

## 3. 当前验证证据

在本次 Web 收敛提交上执行：

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

已获得的本地结果：130 个 Vitest test files / 1,221 个测试通过；Playwright desktop + mobile 共 6 个浏览器、可访问性与 viewport smoke 通过；Next production build 通过。该证据不等价于 live BFF、真实外部存储、生产 telemetry/SLO 或镜像发布验收。

W1C-2A 当前工作树使用 Node `22.22.2` 重新执行：vendor policy 与固定 BFF commit blob 的 SHA-256/字节
对照一致；聚焦 4 files / 38 tests、`pnpm contract` 6 files / 52 tests、`pnpm test:architecture`
4 files / 29 tests、`pnpm lint`、`pnpm typecheck`、全量 `pnpm test` 134 files / 1,259 tests、`pnpm build`
与 `pnpm test:e2e` 6 tests 均通过，build 列出动态 `/iam/[...path]` route。聚焦集合包含启动真实 Next dev
HTTP 边界的系统测试；它验证 canonical path、evil Host、chunked GET body 及 alias canonicalization，
并使用独立临时 Next 工程/构建输出且清理进程、server、目录；BFF 仍是本地
HTTP fixture。全量 Vitest 仍输出既有 jsdom `Not implemented: navigation to another Document` 提示但退出 0；
本切片未宣称真实 Browser→Web→BFF→IAM 登录闭环。

## 4. 尚未闭合的边界

1. Chat transport 仍保留 legacy `SessionEvent` 解析回退；AG-UI 单一路径、`AgUiChatTransport` 与 Vercel AI SDK `UIMessage` 映射尚未完成。
2. Auth magic-link / refresh 仍直连 `KOKORO_IAM_BASE_URL`；W1C-2A 的只读 GET relay 不等于 Auth.js Code+S256、
   server-only token/userinfo/end-session、交互 POST CSRF 或 Product Session 已完成，这些必须在后续切片一次性替换旧路径。
3. 全部 route 的 success/error envelope、request/trace ID 和结构化 telemetry 尚未统一；没有实测 SLI、错误预算、burn-rate alert 或 production runbook 证据。
4. 未建独立 `/healthz` 与 `/readyz`；当前镜像 healthcheck 只验证受保护 session-state 路由可服务。
5. 部分遗留 UI/CSS 仍超出目标粒度；视觉回归与 bundle budget 尚未成为阻断门禁。

## 5. 后续顺序

1. 基于已固定的 BFF relay policy 实现 Auth.js Code+S256、交互 CSRF/Product Session，再删除 Web→IAM 直连；
   legacy Chat 双读另由 W1D generated Product consumer/AG-UI 切片删除。
2. 统一 route envelope、request/trace ID、日志与 telemetry，并补 health/ready 与生产观测证据。
3. 独立完成遗留 UI/CSS 切片、视觉回归、bundle budget 与 live release acceptance。
