# Kokoro User Web 安全设计

状态：当前控制与目标缺口，2026-09-23。

W1C-2B-1 依赖决策：精确固定 `redis@5.12.1`，只由 server-only
`src/lib/server/iam-interaction-csrf.ts` 与本工作树 2C RP transaction 的 `oidc-rp-transaction.ts` 使用；`KOKORO_WEB_REDIS_URL` 不带 `NEXT_PUBLIC_`，
只存 Web sign-in CSRF token 摘要与目标 POST method/交互绑定摘要、短 TTL，一次性 `GETDEL`，故障拒绝。
`/auth/sign-in` POST 精确 Origin、Host、Cookie/hidden token/签名 query 后才连接 BFF；直接 `/iam/*`
browser POST 仍拒绝。Web 不读写 IAM/BFF Redis key，不清空共享实例。中间 IAM sign-in JSON token
不发浏览器；sign-in 失败的原始 body/issuer cookie 也不透传。IAM 200 JSON continuation 只在精确
redirect shape/同源允许路径校验后转成 303，合法 issuer cookies 保持多个 Set-Cookie。2B-2 tenant/consent 已发布；
本工作树 2C 仅 RP 验证候选，Product Session 与旧 IAM 直连尚未切换，不宣称登录安全闭环。

2C RP-only 候选精确固定 issuer/client/callback/resource、EdDSA ID token 算法，Redis 300 秒 state
摘要一次消费并绑定 HttpOnly state/PKCE/nonce cookie；BFF token/userinfo/JWKS 每请求独立 5 秒绝对
deadline、响应头/正文 1 MiB 限额，超限销毁连接。验证成功也只报 `503 product_session_unavailable`，
清除 RP cookie，不发可用 session/token。`NEXTAUTH_URL` 必须精确等于固定 Web origin 加 `/api/auth`；
`KOKORO_OIDC_CLIENT_SECRET` 与 `KOKORO_WEB_AUTH_SECRET` 只在 server 读取，禁止 `NEXT_PUBLIC_` 前缀。

## 1. Trust boundary

```text
Untrusted browser input
  -> kokoro same-origin route (cookie/origin/schema/header boundary)
  -> authenticated Web service call
  -> kokoro-bff authorization and tenant isolation
  -> internal owner
```

- Browser、URL、body、localStorage 和 browser-provided header 均不可信。
- `Forwarded` 只由 Web server 根据 `KOKORO_DOMAIN` 重建；它是部署路由上下文，不是认证凭据。
- user/namespace 来自已密封 session envelope，但 BFF/owner 仍需执行权限与 tenant 检查。
- UI 中的 disabled/hidden 状态只改善交互，不构成授权。

## 2. 已实现控制

### 2.1 Session 与 secret

- `kokoro_session` 使用 AES-256-GCM 认证加密；每次随机 IV，tag 防篡改。
- 当前密钥用于加密，多把密钥用于解密，支持轮换窗口。
- session 与 nonce cookie 为 HttpOnly、SameSite=Lax；production 设置 Secure。
- runtime/refresh credential 留在 server cookie envelope，不返回浏览器 JavaScript。
- production 缺 `KOKORO_INTERNAL_SECRET_WEB_BFF` 时 `authConfig()` 不进入 live authenticated 模式。

### 2.2 请求边界

- 主要 mutation route 执行 Origin/Host 同源比对。
- session route 只转发 `accept`、`content-type`、`last-event-id`、`idempotency-key`，不转发 cookie。
- 上游 transport 删除 browser-provided `host`、`forwarded`、`x-forwarded-*`、`x-domain`、
  `x-kokoro-tenant-id` 和 `x-kokoro-site-id` 后写入受信 `Forwarded`。
- 外部 JSON 主要使用 Zod 解析；非法 AG-UI frame 会使 event stream 进入错误路径。
- 多个身份相关响应使用 `no-store` 并传播 request id。

### 2.3 Preview 隔离

- preview 由显式非 production 配置选择。
- live 网络错误不应静默切换 fixture。
- dev preview file route 必须保持 production 关闭；fixture 不含真实 token、cookie 或受保护资产。

### 2.4 W1C-2A IAM 只读 relay

- `/iam/[...path]` 仅安装固定 BFF policy 中无需 browser Bearer 的 GET 子集；所有 mutation、userinfo、
  end-session 和未知 route fail closed，使用专用 transport 保持原生多个 `Set-Cookie`。
- `KOKORO_WEB_ORIGIN` 是 server-only 精确 HTTP(S) origin。缺失/非法配置返回 503；request URL origin、
  Host 和可选 Origin 不匹配返回 403，且两者都不打开 BFF socket。Location 只相对固定 origin 验证，
  不从浏览器 Host 推导。
- handler 可见的编码 route alias 与不安全上游 Location 被拒绝。Next 在 handler 前对 dot/encoded-dot
  规范化为同一个 canonical route、对双斜线返回 308、对编码 route 名返回 404；真实 HTTP 测试冻结这些
  框架事实，不把不可见原始路径冒充应用层拒绝，也不扩张 allowlist 或身份。
- GET 不接受请求体：非零/异常 `Content-Length`、任意 `Transfer-Encoding` 或可观察 Request body 均在
  BFF socket 前返回 400；真实 Next HTTP 测试覆盖无 Content-Length 的 chunked body。
- policy 保留的 `/auth/sign-in|select-tenant|consent` 在 2A 发布时只是后续 Location 目标；
  2B-1 已安装 sign-in，2B-2 候选把后两条 `/auth/*` 限为无状态 GET 引导，真正带 IAM
  `Path=/iam` issuer cookie 的页面位于静态 `/iam/interactions/*`。Auth.js RP 尚未安装，
  consent 最终 callback 受控 503，不能据此声称登录闭环。

## 3. Secret 与配置清单

| 变量 | 位置 | 浏览器可见 | 说明 |
| --- | --- | --- | --- |
| `KOKORO_WEB_SESSION_SECRET` | Web server secret | 否 | session envelope 密钥；支持逗号分隔轮换 |
| `KOKORO_INTERNAL_SECRET_WEB_BFF` | Web server secret | 否 | Web→BFF service credential |
| `KOKORO_BFF_BASE_URL` | Web server config | 否 | 业务与 Chat 上游 |
| `KOKORO_WEB_ORIGIN` | Web server config | 否 | `/iam` 的固定公开 HTTP(S) origin；精确 scheme/host/port，无尾斜杠或路径 |
| `KOKORO_IAM_BASE_URL` | 当前 Web server config | 否 | 当前直连缺口；目标移到 BFF |
| `KOKORO_DOMAIN` | Web server config | 否 | canonical deployment hostname |
| `KOKORO_PAYMENT_MOCK_WEBHOOK_SECRET` | 非 production | 否 | mock payment；production 禁用 |

任何真实值不得提交到 `.env*`、日志、测试 fixture、截图或前端 bundle。Git 只保留 `.example` 模板。

## 4. 已知风险与阻断项

| 优先级 | 风险 | 当前状态/所需动作 |
| --- | --- | --- |
| P0 | Web 仍直接调用 IAM | 将 auth/team owner call 收口到 BFF；删除 `KOKORO_IAM_BASE_URL` Web runtime 依赖 |
| P0 | 上游无 connect/read/overall timeout 与响应大小上限 | 在公共 server transport 实施并测试 abort、slow body 和 oversized body |
| P0 | 部分 route 返回 flat error/request id/cache policy 不一致 | 统一使用安全 BFF envelope mapper |
| P0 | 无全局 CSP/frame/referrer/permissions policy | 在 Next/edge 配置并以 route/browser test 阻断回归 |
| P0 | mutation 缺失 Origin 时当前允许 | 明确可信非浏览器调用策略，结合 Fetch Metadata/CSRF token；不能只依赖 SameSite |
| P1 | localStorage 可能保留 draft/preview 内容 | 建立数据清理、容量、敏感内容和 shared-device 策略 |
| P1 | 缺 dependency/source/secret scan | CI 增加阻断式扫描并记录处置 owner |
| P1 | Actions/Base image 未固定不可变 digest | 固定完整 SHA/digest，保留可读版本注释 |
| P1 | release 缺候选镜像扫描与 SBOM | push 前本地构建、扫描、smoke，再产出 SBOM/provenance/signature |
| P1 | 无专用 health/ready 与统一 telemetry | 增加不泄密探针、结构化日志、metrics 与告警 |

这些风险没有在本阶段通过文档“视为解决”；发布判断以 [`ACCEPTANCE.md`](ACCEPTANCE.md) 为准。

## 5. Header 与响应策略目标

所有动态 browser-private 响应应至少满足：

- `Cache-Control: private, no-store`（或更严格）；
- `X-Content-Type-Options: nosniff`；
- `Referrer-Policy: no-referrer` 或按明确页面需求收紧；
- `Content-Security-Policy` 禁止任意 script/style/frame source，并为需要的连接建立明确 allowlist；
- `frame-ancestors 'none'` 或等价 `X-Frame-Options`；
- 最小 `Permissions-Policy`；
- error body 只有稳定 code、安全 message、request id，不含内部诊断。

SSE 需要允许正确 content type/streaming，但不豁免鉴权、no-store、request id 和连接限制。

## 6. 认证与授权检查

1. Web 校验 session envelope 的结构、认证 tag 和 expiry。
2. Web 不信任 browser tenant/site/user header。
3. BFF 校验 Web service identity、session identity、permission 和资源 owner。
4. Owner 以受信 tenant context 查询；Web 不接触数据库。
5. 对 401/403 不泄漏资源是否存在、tenant、内部 endpoint 或上游原文。

团队切换、分享、支付、HITL 和工具执行需要各自的业务权限；Web 只能呈现后端返回的允许动作。

## 7. 安全验证

发布前至少执行：

- browser header 注入与 tenant/site spoof 测试；
- cross-origin mutation、缺失/错误 Origin 与 Fetch Metadata 测试；
- cookie flags、rotation、tamper、expiry、logout/revoke 测试；
- AG-UI unknown event、oversized frame、cursor 篡改与断线测试；
- JSON/body/response size、timeout、slowloris 与 abort 测试；
- dependency、source、secret、container 和 IaC scan；
- 浏览器 bundle 搜索 server-only env、token、internal URL；
- CSP、clickjacking、referrer 和缓存泄漏测试。

当前测试覆盖其中一部分 route/cookie/header contract；完整 production security acceptance 尚未闭环。

## 8. 事件响应

怀疑 credential/session 泄漏时：

1. 停止相关发布并保存 request id、版本、时间范围和脱敏日志；
2. 轮换 Web→BFF secret；将新值先部署到校验方，再部署 caller，最后撤销旧值；
3. 轮换 session envelope key 时把新 key 放首位、旧 key保留短窗口，随后删除旧 key；
4. 通过 IAM 吊销 refresh/session；不要只清一个浏览器 cookie；
5. 检查 Developer API/catalog、前端 bundle、日志和 artifact 是否误含 browser-private/secret；
6. 完成范围确认、恢复验证和事故记录。

操作细节见 [`RUNBOOK.md`](RUNBOOK.md)。
