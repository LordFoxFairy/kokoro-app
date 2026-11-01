## 2026-10-25 当前业务只读401的有限再准入

AppGate在整个KokoroAppSurface外提供单用途read-recheck context；只有既有MCP/API投影、精确connector详情、composer metadata及Project GET hook的当前typed HTTP401，携其原subject/generation/未abort signal，才可报告。403、parse、network、迟到、preview和所有写命令不触发。Probe同步撤旧数据代，合并一次原Session检查；既有POST/CAS/未知轮换不取消、不重派，真正同主体确认后才发布新代由原hook重读GET。

恢复自身的GET/POST成功不重置预算；恢复新代若再401，撤准入且不自动再探针，仅该分支以不占主surface文档流的有界status显示既有连接故障label与Retry按钮，取代重复sr-only播报，调用原probe.retry开始明确独立恢复。退休检查结算仅清其自身pending观察槽，epoch已过期的结果不授准入，也不阻塞后续focus/续期；不取消共享POST。后续独立正常续期可重新授予一次恢复额度；原页隐藏/主体退休/ABA围栏保留。不改HTTP/Schema/权限、命令正文/key或费用，不把本片定向回归说成原plaza相邻200错误根因或ChatEngine/bootstrap全局修复；正常激活与主方验收另做。

## 2026-10-21 原生退出确认产品页

`src/app/auth/sign-out/page.tsx` 只拥有中文确认／失败展示，复用Button/Card/token；无客户端状态或自动认证请求。确认form只POST既有issuer端点，issuer opaque确认cookie、期限和当前Session/client/redirect授权仍由IAM验证。`iam-logout-response.ts`仅把已校验正向native确认发行投影为固定页面导航，API维持原生响应。固定交互页origin referrer＋form-action self，失败态无form且no-referrer；不放宽Origin:null、取消不恢复Product会话。

## SET33 两条原生withdraw测试的就绪前置（2026-10-15；D0，仅现测试）

基线Web d7f5d5d41ce4740de219480ccd6d7bf7d9166d40，939 tracked clean；runtime_audit唯一writer仅现native测试，931保护/Root7。Root资源/Git/docs/独审/正常运行；全部product source及原计数/安全assert/timeout/mock/cleanup仍保护。

仅两初始native withdraw测试开启cold/reload请求到达前置；所有产品源码、其余调用和原断言保护。

## SET32 原生登录请求顺序诊断（2026-10-15；D0，仅现测试）

基线Web 52b535789b93ebac740db7aa8e5296c82b6622b6，939 tracked clean；runtime_audit唯一writer仅tests/system/oidc-rp-next-http.integration.test.ts，931保护/Root7。Root设计/docs/独审/资源/Git与正常实例。现runtime修补已接收，终态20focused/3987PASS7旧FAIL/Playwright20PASS4原SKIP；不能据此认定R175/R177旧native多请求根因。

现native HTTP集成测试仅新增可关闭的请求顺序诊断；原helper、断言和product source逐字保护。

## SET31 runtime请求退休（2026-10-15；D0，先tests-only）

基线Web dc26502bfa47ba0c22422623118b455d46644be0，939 tracked clean；runtime_audit唯一writer，1既有hook/1既有test/930最终保护/Root7，先仅tests其余931保护。Root设计/docs/独审/资源/Git/正常激活/CUA。AppGate及原生R175/R177全部源码/oracle保护；不扩大trusted admission接口，不把hook负控冒称原生多请求根因。

现runtime hook owned dispatch/commit退休与局部scope呈现，AppGate接口和原生观察计数保护；原9测试仅追加负控。

## IAM native-session 恢复（2026-11-01）

会话探针只读取同源 `/api/auth/session` 的 native projection；不会读取 CSRF、刷新 native session 或重放凭据。一次读失败只进入 unavailable，后续 focus、online、pageshow 和有限周期 GET 可恢复；同主体检查保留已有数据代际，身份标记变化、匿名结果、pagehide 或取消立即撤销读写准入。

# ui/auth — 登录与会话态门面

`ProductReadRecheck` 的可选结果只在原探针发布同主体可信新数据代后成立；原 MCP hooks 继续忽略结果。顺序 Message parts reader 可在原10秒内等待一次，不自行请求 Session/续期。主体变化（含排队ABA）、pagehide、卸载和读取消退休等待，不授予新身份或重复写入。

## 职责
会话态探针与 IAM native 退出交互。登录入口由 `src/app/login/route.ts` 服务端持有；鉴权由 HttpOnly issuer session cookie 同源携带，前端不持 token。

## 公开件
- `SignInRecovery`（`sign-in-recovery.tsx`）：失败文档的局部 GET-only 当前 Session 观察；服务端 active/access 未过期可导航固定 `/app`，由原 AppGate 重新准入。挂载／focus／online／pageshow／可见恢复每轮共用10秒、最多2次 GET，隐藏／卸载退休，拒绝迟到；显式检查仅重读及 RSC refresh，不自动 OAuth／POST refresh，不存身份、不重放旧 state。
- `useSessionState`（`use-session-state.ts`）：探正式 `GET /api/auth/session` → `"checking"|"pass"|"anonymous"|"unavailable"`；preview 仅由非生产显式开关放行，探针故障不降级为 anonymous，也不展示登录诊断卡片；可见页在 1s/3s 后至多自动重核两次，成功清理定时器，卸载取消，现有 focus/online/周期检查继续负责后续恢复。
- `useSessionProbe`：在同一探针结果中保留 `preview|authenticated` 模式，供 `/app` 选择 Preview Transport 或真实 Session BFF。focus/visibility/周期探针共用未决检查；同一已准入主体保留原数据代际和页面内容，不因核验重取全部业务列表。探针序号只隔离异步结果；真正失败、匿名、身份标记变化/不可读及pagehide才退休旧数据。跨标签storage只在身份标记变化时核验，隐藏页先退休、可见后再请求；核验期间标记切走又切回也令原响应失效。pagehide允许pageshow建立新检查，业务请求仍逐次经过服务端权限校验。
- `/` 是固定 Kokoro 公开首页；`/login` 是固定 native-session 登录入口；`/app` 是受保护工作台。`/auth/sign-in` 承载 IAM 原生邮箱交互，并在 native 查询下直接发行 IAM session cookie。
- `AppGate`（`app-gate.tsx`）：`/app` 的认证闸；首文档由 app layout 复用 IAM native admission，anonymous 首文档只渲染无业务数据导航组件，由浏览器保留白名单设置 fragment 后转到固定 `/login`，native admission 故障保持数据空壳，最多两次 RSC refresh 重验服务端 admission，不整页 reload、不启动第二次登录；首次 authenticated 才挂载私有 Runtime。已核验 actor 的临时故障保留原有工作区展示与冻结意图，但立即撤销该边界保护的 Project/Skills 读写准入；恢复沿现有可信 GET 探针，不重放业务写入或会话续期。辅助技术收到“重连中”状态，不再显示悬浮错误/重试卡片。挂载后的 AppGate 继续真实探针、focus/revocation 与原生 document sign-in 恢复，System manifest 仅在已验证时覆盖品牌、导航与 feature flags。
- 首次可信身份按 UI subject marker 决定是否清理 Web 自有会话索引；同 subject 新文档不清。身份切换先撤销 Project 读取、清理索引并硬刷新，旧引擎不承接新主体；marker 不参与认证或授权。
- `/login` 没有 React 中转页；Route Handler 仅校验白名单 `return_to` 并 303 到带 server-validated native marker 的 `/auth/sign-in`。Proxy 为该短查询建立一次性 Redis flow/CSRF，浏览器 POST 只调用 IAM `/sign-in/email`，成功后原样转发 allowlisted session cookie 并 303 回白名单目标，不再调用 OAuth continuation。启动失败返回无自动循环的 503，绝不接收凭据或伪造成功；IAM 表单的凭据错误在原表单内呈现并签发新一次性 CSRF。OAuth relay 仍仅服务第三方/交互协议路径。

## 协作者
上游：`@/app/page.tsx`（公开首页）、`@/app/login/route.ts`（native 登录启动）、`@/ui/settings`（useSessionState 匿名闸）。下游：Web 同源 `@/app/api/auth/*` native session adapter 与 `@/app/auth/sign-in/route.ts` IAM 表单。只有 `AppGate` 消费 System runtime manifest。

## 陷阱
- 登录主链为 `GET /login` → `/auth/sign-in?native=1&return_to=...` → IAM `/sign-in/email`；会话探针优先 `/v1/me` native admission，退出使用 native IAM sign-out。旧 RP 代码已移除；不得作为新的登录入口或 native fallback。
- 诚实态：不放假 OAuth 按钮或可见中转；失败 URL 不自动循环提交，未接入 IAM 时不呈现假凭据表单。

- `ProductSignInRedirect`只负责匿名文档导航，StrictMode同次挂载仅启动一次；无脚本保留校验过的path/query登录链接。`openProductSignIn`编码白名单设置hash到原签名return_to，不参与认证授权，未知fragment退回合法base。
