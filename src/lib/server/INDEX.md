# lib/server — Web BFF 服务端边界

## 职责

`kokoro-app` 的服务端适配器只负责同源协议、固定 BFF owner、请求预算和错误映射。浏览器不接触内部服务地址、workload secret、owner 数据库或 OAuth token。

## 认证与 IAM 原生边界

- `product-bff.ts`：解析 `KOKORO_BFF_BASE_URL`、部署 domain 和 web origin；`nativeSessionBffHeaders` 只 allowlist IAM issuer cookie；`admittedNativeSession` 通过 BFF `/v1/me` 建立一次请求的 native admission proof；`productBffHeaders` 只转发原生 cookie、固定 Origin 和 web-bff service identity。
- `iam-relay-config.ts`：固定 web origin、BFF origin 和 service secret。
- `iam-relay-policy.ts`：固定 IAM route allowlist、请求/响应预算和 issuer cookie allowlist。
- `iam-relay-transport.ts`：原生 IAM HTTP transport，保留多 `Set-Cookie`，实施 deadline、取消和 header/body 限额。
- `iam-relay-response.ts`：校验原生 status、Location、content type 和 issuer cookies；不把 issuer body 或凭据泄露给浏览器。
- `iam-interaction-csrf.ts`：为 sign-in、tenant、consent 和 invitation 交互生成一次性 Redis proof，按原始 query、issuer cookie 和 flow 绑定并 CAS 消费。
- `iam-sign-in-flow.ts`：短期签名的 native sign-in flow 引用和 HttpOnly flow cookie；不保存密码或业务 session。
- `iam-sign-in-feedback.ts`：按 flow 隔离的加密失败反馈，不回显密码。
- `login-recovery.ts`：顶层 native 登录失败时跳转固定 `/auth/sign-in/failed`，API/非顶层导航保持 JSON 错误契约。

Web 不创建本地 Product Session，不读取 Auth.js/RP state、CSRF、callback、token refresh 或 userinfo；`/api/auth/[...nextauth]` 仅保留 `/api/auth/session` 和 `/api/auth/signout` 的 native-session adapter。

## 业务适配器

所有业务 adapter 必须沿同一 native admission proof 调用 BFF owner，使用 `upstream-http.ts` 的有限 deadline、响应大小和取消语义：

- `account-profile.ts`、`account-sessions.ts`、`shared-tasks.ts`：账户投影和分享边界。
- `session-answer-actions.ts`、`session-archive.ts`、`session-share.ts`：Chat 会话具名操作；不扩 generic proxy。
- `project-skill-content.ts`、`project-mcp-recommendations.ts`、`project-pins.ts`、`mcp-project-publication.ts`：Project owner 薄桥。
- `mcp-server-icon.ts`、`skill-download.ts`：固定媒体/下载路径，完整 EOF 后才返回内容。
- `admin-billing-proxy.ts`、`billing-routes` 相关 adapter：Billing owner 读写；不在 Web 建账本、权限或资金事实。
- `same-origin.ts`：变更请求的 Host/Origin/scheme 守卫，不读取 Redis、SQL 或用户自报身份。
- `bff-response.ts`：统一 success/error envelope、request id 和公开响应头。
- `domain-context.ts`、`service-config.ts`：只读取部署注入的 domain/base URL，不读取浏览器 authority。
- `upstream-http.ts`：HTTP、SSE、二进制流的统一传输；覆盖 caller 的 `Forwarded`，禁止 route 直接裸 `fetch`。

## 运行规则

1. Browser → same-origin adapter → BFF → owner；Web 不直连内部服务。
2. tenant、actor、subject 和 service identity 来自受信上下文；body、query、Forwarded 和自定义身份 header 不能改变 owner 选择。
3. 外部 JSON 使用 `snake_case`；原生 IAM route 保持 IAM 原生协议语义。
4. 每个请求只有一个 admission proof；禁止 token fallback、旧 cookie、自动业务重试和第二套网络 envelope。
5. Redis 仅由 `iam-interaction-csrf.ts` 使用，所有 key 使用 Web origin 前缀并设有限 TTL。
6. route handler 使用 Node runtime；SSE/下载保持流式，JSON 仅在已批准 envelope 边界解包。

## 目录边界

- `src/app/api/auth/[...nextauth]`：native session/sign-out adapter，不是 Auth.js runtime。
- `src/app/login`、`src/app/auth/sign-in`、`src/app/auth/sign-in/failed`：Web-owned native login entry and recovery。
- `src/app/iam/[...path]`、`src/app/iam/interactions/*`：固定 policy 的 IAM 原生 relay 和交互。
- `src/app/api/session/[...path]`：Chat BFF 兼容路径；不拥有 Session 数据。
- `src/app/api/hub/*`、`src/app/api/team/*`、`src/app/api/billing/*`：各自 BFF owner 的窄适配器。
- `src/app/v1/skill.list`：唯一 public Skill list 入口，使用外部 bearer，不读取 native admission。

新增上游服务时复用既有 owner API、`upstream-http.ts` 和 generated contract；不得新增 Repository/Service/Port 层来复制已有事实，也不得恢复被 C-1.3 删除的 OAuth/Product Session 实现。
