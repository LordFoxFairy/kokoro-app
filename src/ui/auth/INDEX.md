## SET33 两条原生withdraw测试的就绪前置（2026-10-15；D0，仅现测试）

基线Web d7f5d5d41ce4740de219480ccd6d7bf7d9166d40，939 tracked clean；runtime_audit唯一writer仅现native测试，931保护/Root7。Root资源/Git/docs/独审/正常运行；全部product source及原计数/安全assert/timeout/mock/cleanup仍保护。

仅两初始native withdraw测试开启cold/reload请求到达前置；所有产品源码、其余调用和原断言保护。

## SET32 原生登录请求顺序诊断（2026-10-15；D0，仅现测试）

基线Web 52b535789b93ebac740db7aa8e5296c82b6622b6，939 tracked clean；runtime_audit唯一writer仅tests/system/oidc-rp-next-http.integration.test.ts，931保护/Root7。Root设计/docs/独审/资源/Git与正常实例。现runtime修补已接收，终态20focused/3987PASS7旧FAIL/Playwright20PASS4原SKIP；不能据此认定R175/R177旧native多请求根因。

现native HTTP集成测试仅新增可关闭的请求顺序诊断；原helper、断言和product source逐字保护。

## SET31 runtime请求退休（2026-10-15；D0，先tests-only）

基线Web dc26502bfa47ba0c22422623118b455d46644be0，939 tracked clean；runtime_audit唯一writer，1既有hook/1既有test/930最终保护/Root7，先仅tests其余931保护。Root设计/docs/独审/资源/Git/正常激活/CUA。AppGate及原生R175/R177全部源码/oracle保护；不扩大trusted admission接口，不把hook负控冒称原生多请求根因。

现runtime hook owned dispatch/commit退休与局部scope呈现，AppGate接口和原生观察计数保护；原9测试仅追加负控。

# ui/auth — 登录与会话态门面

## 职责
会话态探针与 Product 退出交互。登录入口由 `src/app/login/route.ts` 服务端持有；鉴权由 HttpOnly Product Session cookie 同源携带，前端不持 token。

## 公开件
- `useSessionState`（`use-session-state.ts`）：探正式 `GET /api/auth/session` → `"checking"|"pass"|"anonymous"|"unavailable"`；preview 仅由非生产显式开关放行，探针故障保持显式重试面，不降级为 anonymous。
- `useSessionProbe`：在同一探针结果中保留 `preview|authenticated` 模式，供 `/app` 选择 Preview Transport 或真实 Session BFF；同一浏览器返回产生的 focus/visibility 事件共用一次未决检查和一次 read-boundary generation，pagehide 仍会退役该轮并允许 pageshow 建立新检查。
- `/` 是固定 Kokoro 公开首页；`/login` 是固定 Product RP 登录；`/app` 是受保护工作台。`/auth/sign-in` 只承载 IAM issuer 交互，不是 Product 登录页。
- `AppGate`（`app-gate.tsx`）：`/app` 的认证闸；首文档由 app layout 复用 Product Session owner 判定，anonymous 在 SSR 阶段转到固定 `/login`，配置或 Redis 故障显示可手动 reload 重验的 fail-closed unavailable；authenticated 才渲染产品工作台。挂载后的 AppGate 继续真实探针、focus/revocation 与原生 document sign-in 恢复，System manifest 仅在已验证时覆盖品牌、导航与 feature flags。
- 首次可信身份按 UI subject marker 决定是否清理 Web 自有会话索引；同 subject 新文档不清。身份切换先撤销 Project 读取、清理索引并硬刷新，旧引擎不承接新主体；marker 不参与认证或授权。
- `/login` 没有 React 中转页；Route Handler 签发兼容 Auth.js 的双提交 CSRF 和签名回跳 cookie，再由一次固定、同源的浏览器 POST 启动 `kokoro-iam` OIDC，避免在服务端嵌套 Route Handler 中丢失请求 cookie 上下文。浏览器直接进入 `/auth/sign-in` 的 IAM 邮箱/密码表单。启动失败返回无自动循环的 503，绝不接收凭据或伪造成功；IAM 表单的凭据错误在原表单内呈现并签发新一次性 CSRF。

## 协作者
上游：`@/app/page.tsx`（公开首页）、`@/app/login/route.ts`（Product OIDC 启动）、`@/ui/settings`（useSessionState 匿名闸）。下游：Web 同源 `@/app/api/auth/*` RP 与 `@/app/auth/sign-in/route.ts` IAM 表单。只有 `AppGate` 消费 System runtime manifest。

## 陷阱
- 登录主链为 `GET /login` 签发固定浏览器 POST，再由 `POST /api/auth/signin/kokoro-iam` 启动 RP；会话探针使用 Product `GET /api/auth/session`，退出使用 CSRF 保护的 Product `POST /api/auth/signout` 并续接 issuer end-session。旧 magic-link、sealed session helper 与 `/api/auth/logout|session-state` 均已删除，不作为 UI fallback。
- 诚实态：不放假 OAuth 按钮或可见中转；失败 URL 不自动循环提交，未接入 IAM 时不呈现假凭据表单。
