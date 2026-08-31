# ui/auth — 登录与会话态门面

## 职责
会话态探针 + 首页分流 + 登录页面板（AUTH-P0 / WEB-FACE 面一·面二）。鉴权由 httpOnly 信封 cookie 同源携带，前端不持 token。

## 公开件
- `useSessionState`（`use-session-state.ts`）：探 `/api/auth/session-state` → `"checking"|"pass"|"anonymous"`；只有服务端明确返回 preview 才放行，探针网络失败按 anonymous 处理。
- `useSessionProbe`：在同一探针结果中保留 `preview|authenticated` 模式，供 `/app` 选择 Preview Transport 或真实 Session BFF。
- `/` 是 Kokoro 产品的稳定入口，服务端直接重定向到 `/app`；公开营销预览保留在 `/preview/marketing`。
- `AppGate`（`app-gate.tsx`）：`/app` 的认证闸；authenticated 渲染 System-driven `AppFrame`，anonymous 转到 `/login`。
- `LoginPanel`（`login-panel.tsx`）：`/login` 登录卡（暖纸皮肤，无 antd）。email → magic-link；发送后态含重发倒计时 + 改邮箱；错误走顶部 toast（不内联）；不渲染未接入的 OAuth 假按钮；品牌/Logo/主题由 System runtime manifest 注入。

## 协作者
上游：`@/app/page.tsx`（根路径重定向）、`@/app/login/page.tsx`（LoginPanel）、`@/ui/settings`（useSessionState 匿名闸）。下游：`@/api/auth/*` BFF、`@/api/system/runtime-manifest`、`@/i18n`（auth.* 文案）、`@/ui/marketing`、`@/ui/shell`。

## 陷阱
- 登录机制零改动：只 POST `/api/auth/magic-link/request`，换会话在 `/api/auth/callback`（密封 cookie + 303 回 `/app`）。callback 失败 303 到 `/login?auth=link_unavailable`，由 LoginPanel 承载 toast。
- 诚实态：不放假 OAuth 按钮；错误 toast 归一，不在表单内联报错。
