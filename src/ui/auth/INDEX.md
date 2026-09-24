# ui/auth — 登录与会话态门面

## 职责
会话态探针 + 独立登录页面板（AUTH-P0 / WEB-FACE 面一·面二）。鉴权由 HttpOnly Product Session cookie 同源携带，前端不持 token。

## 公开件
- `useSessionState`（`use-session-state.ts`）：探 `/api/auth/session` → `"checking"|"pass"|"anonymous"`；只有服务端明确返回 preview 才放行，探针网络失败按 anonymous 处理。
- `useSessionProbe`：在同一探针结果中保留 `preview|authenticated` 模式，供 `/app` 选择 Preview Transport 或真实 Session BFF。
- `/` 是固定 Kokoro 公开首页；`/login` 是固定 Product RP 登录；`/app` 是受保护工作台。`/auth/sign-in` 只承载 IAM issuer 交互，不是 Product 登录页。
- `AppGate`（`app-gate.tsx`）：`/app` 的认证闸；authenticated 直接渲染产品工作台；System manifest 仅在已验证时覆盖品牌、导航与 feature flags，anonymous 转到 `/login`。
- `LoginPanel`（`login-panel.tsx`）：`/login` 独立于 System manifest 使用固定单租户 Kokoro 品牌；首屏自动经 Auth.js CSRF 启动固定 `kokoro-iam` OIDC，没有中转按钮。失败回跳不自动循环，原登录布局保留、仅出现次级错误与显式重试；离开页面会取消未完成的 CSRF 请求。桌面使用全视口双区、窄屏单列，不将错误呈现为居中故障卡片。

## 协作者
上游：`@/app/page.tsx`（公开首页）、`@/app/login/page.tsx`（LoginPanel）、`@/ui/settings`（useSessionState 匿名闸）。下游：Web 同源 `@/app/api/auth/*` RP、`@/i18n`（auth.* 文案）。只有 `AppGate` 消费 System runtime manifest。

## 陷阱
- 登录主链只使用 `GET /api/auth/csrf` + `POST /api/auth/signin/kokoro-iam`；会话探针使用 Product `GET /api/auth/session`，退出使用 CSRF 保护的 Product `POST /api/auth/signout` 并续接 issuer end-session。旧 magic-link route 仅因 Team/旧链依赖暂存，不作为 UI fallback。
- 诚实态：不放假 OAuth 按钮或重复的中转操作；失败页显示明确错误与重试，不从失败 URL 自动循环提交。
