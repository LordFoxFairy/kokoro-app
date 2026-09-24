# Kokoro User Web 当前状态

状态日期：2026-09-24。范围：`kokoro-app` 独立子仓。本文只陈述当前工作树可验证的事实；历史报告、preview fixture、截图和 Agent 自报均不构成生产验收。

W1C-2F-S1 已发布 Web main `0e0ec3a6a9682a09a7f335fbd7d96743afefd7dc`（含 HTTPS Product cookie `Secure` 修正）；后续已发布的旧 generation signout CAS 保持有效。S1 在已验 RP-only 基线之上接入 Web 自有 Product Session：成功 callback
以加密 HttpOnly cookie（随机 session ID/generation、server-only access，无 refresh；固定 Web origin 为 HTTPS 或 Web production mode 时带 Secure）和 Web Redis 加密
refresh record 建立在线状态；同源标准 `GET/POST /api/auth/session` 分别返回无 token 的最小 projection/
执行受 CSRF 保护的双 CAS refresh，`POST /api/auth/signout` 仅匹配 cookie generation 的 active record 才 take 已确认当前 refresh，
pending 时只 tombstone。旧 generation signout 不发送 Product `Set-Cookie`，避免乱序响应清除浏览器已收到的新 cookie；HTTP 200 返回 `stale_session`/`not_required`，旧 cookie 仍被在线 generation 校验拒绝，不改当前 Redis record、不 revoke、也不返回 issuer 引导；其他 signout 返回固定同源 `issuer_end_session_url` 与 `issuer_session=pending_browser_confirmation`；浏览器实际完成 `/iam/oauth2/end-session` GET 确认页和受 Origin/签名确认 cookie 保护的 POST 后，IAM issuer session 才算结束。七个普通受保护 BFF adapter 已切换为在线 Product Session generation 核验与唯一 access Bearer；legacy magic-link/team route 仍是**待删除旧态**，UI 主链不再消费它们；本切片不声称它们已删除；S1 真实三仓 HTTPS 组合已通过，S2-A 普通业务代理组合已通过固定三仓真 HTTPS。固定 BFF relay policy 已重钉
`84a560abeac5b7a63f32d7064abdde849ab33cf9`/IAM `b35a9a5301219654ea344c03407fd355f58c481e`，
SHA-256 `f7c3d29f500ffe729da006c9ff8bf29d4f853e2a613ba92357592414bee421d9`；仅来源 metadata 变化。
本地 Node `22.22.2` 在 Web main `0e0ec3a6a9682a09a7f335fbd7d96743afefd7dc` 以 `caffeinate -dimsu` 执行：
`pnpm contract` 6 files/52 tests、`pnpm test:architecture` 4/32、`pnpm lint`、`pnpm typecheck`、
`pnpm test` 139/1369、`pnpm build`、`pnpm test:e2e` 6/6 均通过。RP-only 固定 503 的成功断言先
反转获 RED，再在 S1 获得 GREEN；真实 Web→BFF→IAM 三仓 runner 首轮识别出 HTTPS Product cookie 缺 Secure，已由 main 修复、待 Root 复验。本次 stale-signout 切片新增 Redis CAS 与真实 Next HTTP 回归：旧 cookie 不发 Product `Set-Cookie`、不触发 revoke、不返回 issuer 确认引导、不影响新 cookie；Node `22.22.2` 在本工作树执行 `pnpm check`，contract 52/52、architecture 32/32、全量 Vitest 1371/1371、lint/typecheck/build 均通过，`pnpm test:e2e` 6/6 通过。普通 `/v1` Bearer adapter、
Team、GitHub runner 与上线验收仍未执行/完成。

## 1. 当前边界

- 公开入口已收敛：`/` 使用固定单租户 Kokoro 品牌直接渲染营销首页，`/login` 不依赖 System runtime manifest，首屏呈现单一 Kokoro 账号继续动作且不请求 CSRF；用户点击后才发起固定 Product RP OIDC，连接成功前保持过渡状态，失败后停止并提供显式重试，不呈现营销导航或 Web 凭据表单。`/app` 仍需在线 Product Session，但 System manifest 仅增强展示，不再阻断核心工作台；`/auth/sign-in` 是 IAM issuer 签名交互，不是 Product 登录页。`/preview/marketing` fixture 和未使用的 HomeGate 已删除。没有后端时仅在用户主动继续后真实请求 Auth.js CSRF/OIDC 并呈现受控错误，不伪造成功。
- W1D-Web-Gate：`/app` 的访问权只由在线 Product Session 决定；System manifest 为可选展示数据。已认证状态即使用本仓固定品牌/导航装载 live 工作台，有效 manifest 才覆盖动态展示；失败或重试会清除旧站点皮肤，不切到 preview transport。旧 `RuntimeUnavailable` 页面、样式、测试与九语种死文案已删除。当前 Node22 contract/architecture/lint/typecheck、串行 Vitest 1385/1385、build、Playwright 11通过/1既有skip；真实浏览器在已认证探针与 System 503 下仍于 `/app` 显示核心工作台。
- 浏览器只访问同源 Web 入口；Chat 请求经 `/api/session/*` 代理到 `${KOKORO_BFF_BASE_URL}/v1/*`。Web 不拥有 PostgreSQL、ORM、migration 或任何其他 owner 的数据库事实；Redis 自有 namespace 保存短期 CSRF/RP 摘要和 S1 Product Session 在线协调 record。
- 新 Product Session cookie 使用加密 HttpOnly 信封、`SameSite=Lax`，固定公开 Web origin 为 HTTPS 或 Web production mode 时设置 `Secure`；浏览器 cookie 不透传给业务上游。旧 sealed session 仅属于待删除旧路径。
- Product 上游调用由 `src/lib/server/upstream-http.ts` 统一执行：重建可信 `Forwarded` 上下文，删除浏览器可控的 domain/tenant/site/forwarded 头，设置总 deadline，并限制请求与响应体大小。W1C-2A `/iam` 原生协议例外使用独立 transport，避免合并多个 `Set-Cookie`。
- `src/proxy.ts` 为每次页面请求生成 CSP nonce；配合动态 layout 注入的 nonce，响应包含 CSP、frame、referrer、permissions 与 no-sniff 防护头。`/api/*` 明确 `Cache-Control: private, no-store, max-age=0` 与 `Vary: Cookie`。
- `kokoro-app` 是 Web remote 名；主控仓中的对应 submodule 路径是 `apps/kokoro-app`，不使用歧义的 `kokoro/` 名称。
- W1C-2A 已新增 BFF-only 的同源 `/iam/[...path]` 只读入口：只允许固定 policy 中无需 browser Bearer 的
  discovery、JWKS、authorize、issuer session、organization 与固定参数 end-session GET；仅 logout-confirm POST 通过专用窄路由，其他浏览器 POST、userinfo、
  Authorization 和 handler 可见的未知/编码 route alias 均在连接 BFF 前拒绝。固定 server-only
  `KOKORO_WEB_ORIGIN` 固定公开 authority：入站 Host 必须精确匹配，GET 如携 Origin 也须匹配，POST
  必须携精确 Origin；响应 Location 仍只相对该固定 origin 验证。Next 在反代后可能把 handler 的
  `request.url`/`nextUrl.origin` 重建为内部 `https://localhost:<port>`，因此不以它作公开 origin
  校验，也不信任浏览器可控的 `Forwarded`/`X-Forwarded-*`。真实 Next HTTP 探针记录 dot/encoded-dot 在 handler 前成为同一
  canonical route、双斜线返回 308、编码 route 名返回 404，并证明无 Content-Length 的 chunked GET body
  在连接 BFF 前返回 400；这些行为不扩张固定 allowlist。policy 中三个 `/auth/*` Location 在
  W1C-2A 发布时只是后续交互目标，未安装页面；2B-1 和本次 2B-2 才逐片安装。专用 transport
  保持原生 status/header/body 与多个
  `Set-Cookie`，并实施 issuer-cookie 白名单、16 KiB header、1 MiB response、5 s deadline 与取消传播。
- 只读 snapshot 固定 BFF `84a560abeac5b7a63f32d7064abdde849ab33cf9`、IAM
  `b35a9a5301219654ea344c03407fd355f58c481e` 和 policy SHA-256
  `f7c3d29f500ffe729da006c9ff8bf29d4f853e2a613ba92357592414bee421d9`；Web 不编辑 owner policy，
  `tests/contract/iam-relay-policy.test.ts` 对 snapshot 原始字节与 provenance 做漂移门。
- 已发布的 W1C-2B-1 新增 `/auth/sign-in` 交互入口：GET 保留 IAM 原始签名 query 并在 Web Redis 自有前缀写入
  5 分钟一次性 CSRF 摘要/目标 POST method/issuer-cookie 绑定，POST 必须精确同源 Origin、Cookie+hidden token 与原始 query
  匹配，Redis `GETDEL` 原子消费后才向 BFF 的 `/iam/sign-in/email` 与 `/iam/oauth2/continue` 发起两个有界原生
  POST；IAM 签名仍由 IAM owner 验证。中间 sign-in 响应中的 session token JSON 不返回浏览器；最终继续响应
  对 IAM 实际 200 `{redirect:true,url}` 严格校验固定 Web origin/允许交互路径后返回 303/Location 与多个
  issuer `Set-Cookie`；中间 sign-in 失败仅受控 401/429/503 且不调用 continue。直接 browser `/iam/*` POST
  仍全部拒绝；此项是 2B-1 历史切片状态，当前 S1 已安装 Auth.js/Product Session；普通业务 adapter 已由 S2-A 切换。Redis 依赖精确固定
  `redis@5.12.1`，`KOKORO_WEB_REDIS_URL` 缺失或 Redis 故障时交互 fail closed，Web 不清理共享 Redis。
- W1C-2B-2 新增 `/auth/select-tenant` 与 `/auth/consent` 严格 GET 外层，引导至
  `/iam/interactions/select-tenant|consent` 真正的 Web-owned GET/POST；外层 POST 405。IAM issuer
  cookie 原生 `Path=/iam`，真实浏览器不会将其发送至 `/auth/*`，故外层不得直接呈现需要会话的表单。
  静态内层路由优先于 `/iam/[...path]` catch-all，仍不开放直接 owner mutation。Tenant GET 经固定 BFF
  `/iam/organization/list` 取 owner 返回的 active 组织，候选 ID 摘要与一次性 CSRF/原始 query/issuer
  cookie 绑定；POST 先验证所见候选，再重读当前 owner 列表，只有仍在列表内才调用
  `/iam/organization/set-active`。Consent GET 只从 IAM 跳转 query 的唯一受限 `scope` 展示**未验签预览**，
  并未由 Web 确认签名/权限；POST 不接收浏览器自报 scope，仅在明确 Agree 后将该 query 的 scope 与原始
  `oauth_query` 送 `/iam/oauth2/consent`，由 IAM 最终验签并核 scope 子集。伪造 query 的 401/错误响应
  受控清洗。两页的 CSRF cookie/digest/form/clear 均绑定 `/iam/interactions/*`，复用 Redis 原子 CSRF、
  严格 Origin、固定 relay、原生多 issuer cookie 与交互 Location
  白名单；直接 `/iam` 浏览器 POST 仍拒绝。IAM 成功最终跳到固定未来
  `/api/auth/callback/kokoro-iam` 时，因本片未安装 Auth.js RP，Web 返回不泄露 code/cookie/Location 的
  `503 rp_callback_unavailable`，不假装浏览器登录闭环。Next16 dev HTTP 对 `%20` 可能正规化成 `+`；
  IAM 以参数规范化验签，Web 不自行解码再重签或改变已进入 handler 的 query。
  四条新外/内层 route 的 HEAD/OPTIONS 显式 405，零 BFF/CSRF Redis 写入；当 IAM 对
  `session_data` 下发 `Max-Age=0` 或已过期 `Expires` 删除时，Web 的后续 CSRF issuer 绑定与
  浏览器 CookieJar 一致，只保留有效 `session_token`，且有效 `Max-Age` 优先于旧 `Expires`。
- 历史 W1C-2C RP-only 切片（现已发布且被 S1 接续）：当时固定 `/api/auth/[...nextauth]` 只开放 CSRF GET、
  `kokoro-iam` signin POST 与 callback GET；固定 Host/按方法精确 Origin、Auth.js CSRF、固定 issuer/client/
  callback/resource、S256/state/nonce 与 300 秒 Redis `SET NX`/`GETDEL` 绑定。签名算法显式 pin
  EdDSA；自定义 token request 调用验证型 `openid-client` callback，server-only Basic token、
  Bearer userinfo 与 JWKS 仅走固定 BFF backchannel，每次独立 agent 限制绝对 5 秒、响应头/正文
  1 MiB，并传播浏览器 `request.signal`：callback 断连销毁当前 BFF socket 且不继续后续 backchannel。
  真实 Next+BFF fixture 覆盖签名/issuer/audience/nonce/过期/算法、userinfo sub、CSRF、
  竞态重放、body/响应超限与慢滴流；在当时 RP-only 基线验证成功仍只返回受控
  `503 product_session_unavailable`，清 RP cookie，不签发可用 Auth.js/旧 Product Session；当前 S1 成功回调已建立新 Product Session 并 303 到 `/app`。
  W1C-2D 将 IAM consent 实际成功响应的唯一 `code`、`state`、`iss` 三参数严格准入，
  `iss` 必须等于固定 `${KOKORO_WEB_ORIGIN}/iam`；完整 query 交验证型 `openid-client` 再核 issuer。
  缺失、重复、错误 issuer 或额外参数在 relay/RP 边界拒绝，不把 2B-2 的受控 503 误判当成功。
  旧 magic-link route 仍待删除，但 UI 登录/探针/退出主链与普通 `/v1` Bearer 代理均已迁移；该历史 fixture 不是 IAM owner 签名组合验收；当前 S1 已实现新 session/refresh/signout，但三仓真实闭环仍待 Root runner 验收。

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

W1D 登录 handoff 当前使用 Node `22.22.2` 执行 `pnpm check`：contract 6 files/54 tests、
architecture 4 files/32 tests、lint、typecheck、全量 Vitest 142 files/1,397 tests与 production build
均通过；`pnpm test:e2e` 在 desktop/mobile 为 15 passed、1 个既有 mobile rail logout skip。浏览器门证明
首屏零 CSRF/System 请求、点击后固定 CSRF/provider POST、失败停止重试、axe 与 viewport；其中真实 303
用例只证明 **RP 配置缺失时 signin route 的受控早退** 返回 `/login?auth=sign_in_failed` 且页面不自动循环，
不代表 authorize/token/userinfo、IAM 签名、Product Session 或完整 OAuth 失败链已经通过。

W1C-2A 当前工作树使用 Node `22.22.2` 重新执行：vendor policy 与固定 BFF commit blob 的 SHA-256/字节
对照一致；聚焦 4 files / 38 tests、`pnpm contract` 6 files / 52 tests、`pnpm test:architecture`
4 files / 29 tests、`pnpm lint`、`pnpm typecheck`、全量 `pnpm test` 134 files / 1,259 tests、`pnpm build`
与 `pnpm test:e2e` 6 tests 均通过，build 列出动态 `/iam/[...path]` route。聚焦集合包含启动真实 Next dev
HTTP 边界的系统测试；它验证 canonical path、evil Host、chunked GET body 及 alias canonicalization，
并使用独立临时 Next 工程/构建输出且清理进程、server、目录；BFF 仍是本地
HTTP fixture。全量 Vitest 仍输出既有 jsdom `Not implemented: navigation to another Document` 提示但退出 0；
本切片未宣称真实 Browser→Web→BFF→IAM 登录闭环。

W1C-2B-1 在基线 `85b4bad25769efcca8f417e0232fdaa6c485bf01` 的未提交工作树使用 Node
`22.22.2` 执行 `pnpm check`：contract 6 files/52 tests、architecture 4 files/32 tests、lint、
typecheck、全量 Vitest 135 files/1,295 tests、production build 均通过；`pnpm test:e2e` 原有 6/6
通过。聚焦真实 Next HTTP 17/17 验证恶意/缺失 Origin、缺失 CSRF、签名 query 变化、重放、错 path 和超限
均零 BFF socket，正向保留原始 query 至 BFF `oauth2/continue` 并将 IAM 实际 200 JSON 转为
303/Location/多 Set-Cookie；evil URL/错 shape 以及 sign-in 401/429/503 的敏感 body/cookie 均拒绝透传，
后者不调用 continue。Redis 测试仅删本次随机 token 的精确 key，预存同前缀 key 不误删，失联清理有限退出。
该测试的 BFF 是本地 HTTP fixture，**不是 IAM owner 的签名验证证据**。测试后 Web 自有 Redis CSRF key、
Next 临时目录和进程均为零；GitHub Actions runner、真实 IAM 组合仍待 Root 验收。

W1C-2B-2 以 Web main `d619f2c06951cb2decdb1eeac48547e3bcf40361` 为基线，使用 Node
`22.22.2` 跑聚焦 policy contract+真实 Next HTTP+Redis 3 files/52 tests、`pnpm lint`、`pnpm typecheck`、
`pnpm contract` 6 files/52 tests、`pnpm test:architecture` 4 files/32 tests、`pnpm test`
135 files/1,320 tests、`pnpm build` 与 `pnpm test:e2e` 6/6 均通过。真实 Next fixture
使用遵守 `Path` 的 CookieJar 与要求 issuer session token 的 BFF HTTP stub，证明外层无 cookie、
内层有 cookie、静态路由优先、两次交互继续和直接 owner POST 405/零 BFF；未假称真实 IAM 签名/RP 闭环。
BFF 仍是 HTTP fixture，
未做真实 IAM/RP 闭环或 GitHub Actions runner 验证。测试覆盖 tenant 列表信任、重核/越界、
签名 query 变化、Origin/CSRF/重放、consent 拒绝/伪造 query owner 401、恶意导航、native
302/多 Set-Cookie、错误敏感体清洗及未安装 RP callback 503。当前 W1C-Team-R3-Pin 再次机械 re-pin BFF policy
`84a560abeac5b7a63f32d7064abdde849ab33cf9`/IAM
`b35a9a5301219654ea344c03407fd355f58c481e`，复制 BFF 发布的只读 JSON 原字节，其余 route/method
语义与前 pin 相同。

## 4. 尚未闭合的边界

1. Chat transport 仍保留 legacy `SessionEvent` 解析回退；AG-UI 单一路径、`AgUiChatTransport` 与 Vercel AI SDK `UIMessage` 映射尚未完成。
2. 旧 Auth magic-link / refresh 仍直连 `KOKORO_IAM_BASE_URL`；S1 新 Auth.js Code+S256、server-only token/userinfo 和 Product Session 已落地，但普通 BFF adapter 已切换；旧认证/Team route 删除仍须在后续 S2-B 完成；UI 登录、会话探针和退出已切至 Product Session。真实三仓 IAM 组合验收未通过前不宣称首次登录全链闭环。
3. 全部 route 的 success/error envelope、request/trace ID 和结构化 telemetry 尚未统一；没有实测 SLI、错误预算、burn-rate alert 或 production runbook 证据。
4. 未建独立 `/healthz` 与 `/readyz`；当前镜像 healthcheck 只验证受保护 session-state 路由可服务。
5. 部分遗留 UI/CSS 仍超出目标粒度；视觉回归与 bundle budget 尚未成为阻断门禁。

## 5. 后续顺序

1. 完成 S1 真实三仓 IAM 组合验收，继续 S2-B：删除旧 Web→IAM 直连和旧认证/Team 路径；
   legacy Chat 双读另由 W1D generated Product consumer/AG-UI 切片删除。
2. 统一 route envelope、request/trace ID、日志与 telemetry，并补 health/ready 与生产观测证据。
3. 独立完成遗留 UI/CSS 切片、视觉回归、bundle budget 与 live release acceptance。
