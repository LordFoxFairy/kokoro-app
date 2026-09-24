# ui/auth — 登录与会话态门面

## 职责
会话态探针与 Product 退出交互。登录入口由 `src/app/login/route.ts` 服务端持有；鉴权由 HttpOnly Product Session cookie 同源携带，前端不持 token。

## 公开件
- `useSessionState`（`use-session-state.ts`）：探 `/api/auth/session` → `"checking"|"pass"|"anonymous"`；只有服务端明确返回 preview 才放行，探针网络失败按 anonymous 处理。
- `useSessionProbe`：在同一探针结果中保留 `preview|authenticated` 模式，供 `/app` 选择 Preview Transport 或真实 Session BFF。
- `/` 是固定 Kokoro 公开首页；`/login` 是固定 Product RP 登录；`/app` 是受保护工作台。`/auth/sign-in` 只承载 IAM issuer 交互，不是 Product 登录页。
- `AppGate`（`app-gate.tsx`）：`/app` 的认证闸；authenticated 直接渲染产品工作台；System manifest 仅在已验证时覆盖品牌、导航与 feature flags，anonymous 转到 `/login`。
- `/login` 没有 React 中转页；服务端签发 Auth.js CSRF 并启动固定 `kokoro-iam` OIDC，浏览器直接进入 `/auth/sign-in` 的 IAM 邮箱/密码表单。启动失败返回无自动循环的 503，绝不接收凭据或伪造成功；IAM 表单的凭据错误在原表单内呈现并签发新一次性 CSRF。

## 协作者
上游：`@/app/page.tsx`（公开首页）、`@/app/login/route.ts`（Product OIDC 启动）、`@/ui/settings`（useSessionState 匿名闸）。下游：Web 同源 `@/app/api/auth/*` RP 与 `@/app/auth/sign-in/route.ts` IAM 表单。只有 `AppGate` 消费 System runtime manifest。

## 陷阱
- 登录主链只使用 `GET /api/auth/csrf` + `POST /api/auth/signin/kokoro-iam`；会话探针使用 Product `GET /api/auth/session`，退出使用 CSRF 保护的 Product `POST /api/auth/signout` 并续接 issuer end-session。旧 magic-link route 仅因 Team/旧链依赖暂存，不作为 UI fallback。
- 诚实态：不放假 OAuth 按钮或可见中转；失败 URL 不自动循环提交，未接入 IAM 时不呈现假凭据表单。
