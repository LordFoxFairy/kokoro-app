# Kokoro User Web 当前状态

W1-LOGIN-UI（2026-09-25）：`/login` 仍仅在服务端启动 Product OIDC，浏览器直接进入唯一签名
`/auth/sign-in`；后者保留完整 Route Handler、一次性 Cookie-bound CSRF、原始签名 query、
同源 Origin 与 BFF→IAM 真实提交，GET 和凭据失败均显示紧凑正式表单。视觉按本仓 shadcn
token/尺寸/焦点收敛，但没有在 Route Handler 中导入 React 组件或新增第二条登录链。Root 用
Node 22.22.2 复验真实 Next HTTP/Chromium 7/7（含桌面、窄屏、移动和错误态）、contract 69、
architecture 34、Vitest 1483、lint、typecheck、production build，均通过。当前 3310 无监听，
本仓也没有 `.env.local`；这些隔离测试不是用户 3310 已可登录的证据。下一步仍须固定正式
Web/BFF/IAM 配置、同源 HTTPS 入口与常驻浏览器验收，不能用可见错误页或假表单代替。

R5-INVITE-BROWSER-ORIGIN 修复（2026-09-25）：真实 Chromium 表单 POST 暴露邀请页
`Referrer-Policy: no-referrer` 会使浏览器发送 `Origin: null`，与严格同源写入门禁冲突。
邀请静态入口与 Web proxy 的该精确路径改为 `same-origin`：跨站不传邀请 URL，
同源 POST 保留 canonical Origin；`/iam/verify-email` 继续使用 `no-referrer`。
该项仅记录代码事实，真实三仓 Chromium 结果以 Root 最新验收记录为准。

R5-INVITE-WEB-ENTRY 来源重钉（2026-09-25）：当前 Web `src/generated/iam-relay-policy.json` 与 BFF
main `2f1fc3382df31ba107d7eb2b2b6a611fa893bc13` 的 policy `2.1.0` 原始字节相同，SHA-256
`f7a3a44d9839a0e54faffc8cf6b7ceb601d0d6b647637faf10e9070c927d93e7`；其中 IAM owner commit 为
`7215223b2ed27a0d5217f3bbaaabce547006d3bb`，OpenAPI 0.4.0 SHA-256
`a18d57172df841cb2f55aa845a3eeb519ddb5abc8bea1c2be74fbb7e0fb62416` 不变。本次只更新只读快照、
provenance 与固定来源断言，邀请 UI/行为不变；下方旧 commit/digest 是当时切片的历史证据，不是当前消费 pin。
真实三仓 SMTP/HTTPS 浏览器组合及用户 3310 仍由 Root 独立验收。

R5-INVITE-WEB-ENTRY C 实现切片（2026-09-25，跨仓验收仍待 Root）：基线 Web main
`63a0c8523bc06a513ff897b9ed8326ac543a3895`。同一静态邀请页的 recipient-only pending 预览增加真实接受/拒绝
表单；Web Redis 一次性证明绑定固定 tenant、canonical 邀请 ID、当前 issuer Cookie 和动作。POST 精确同源 Origin、
方法、表单字段与 Cookie 后经 BFF 原生转发 IAM，不发送 Product Bearer、业务 body 或幂等键；仅匹配 owner 200
成功 shape 才确认：接受 303 `/login` 启动 Product OIDC，拒绝显示完成状态。404/超时/未知结果不推断成功、不自动
重放。注册失败改为注册区就近错误并自动展开，保留姓名/邮箱、不保留密码；致命依赖失败不再提示“从原链接重来”。
Node 22.22.2 本切片经 Root 复跑 contract 69/69、architecture 34/34、lint、Next typegen、typecheck、全量
Vitest 1483/1483 和隔离 production build，全部 exit0；真 SMTP/HTTP 浏览器组合仍待 Root 跨仓验收，本切片不触用户 3310。

R5-INVITE-WEB-ENTRY B 已提交 main `63a0c8523bc06a513ff897b9ed8326ac543a3895`（2026-09-25）：Web 已在上一 A commit
`45388f620d2d255eee02073ffe5ef62102b6a430` 固定 BFF policy 2.1.0、IAM 0.4.0 和 verify-email 精确邀请 Location。
该切片增加唯一静态 `/iam/interactions/invitation`：无 issuer Session 可用独立真实邮箱/密码登录或新邮箱注册；注册 callbackURL
由服务端固定同源邀请 ID 构造，成功只提示验证邮箱；有效 issuer Session 则向 BFF 读取 recipient-only pending context，并仅投影
组织/角色/到期。Web Redis 一次性 CSRF 对 sign-in/sign-up 分别绑定静态路径、ID、动作；页面使用仅邀请生效的紧凑视觉 variant，
不改变旧 OAuth sign-in/consent 布局。B 提交时 **accept/reject POST 尚未实现**，预览页不显示虚假操作按钮；这部分由上方 C 切片补齐，用户 3310 仍未验证。Node 22.22.2 B 切片复跑 contract 69/69、architecture
34/34、全量 Vitest 1474/1474、lint、Next typegen 和 `tsc --noEmit` 均通过；Chromium 独立页面布局/默认收起注册
3/3，通过桌面和移动端截图核对。隔离 production build 的临时目录使用仓外 node_modules symlink，Turbopack 因
filesystem root 限制拒绝该测试布置；随后 Root 在不改变用户 `.next` 的前提下于本仓隔离重跑 production build exit0。真 SMTP/HTTPS 浏览器验收仍待执行。


R5-INVITE-WEB-ENTRY 设计门（2026-09-25，仅文档，**未实现/未验收**）：Web main
`63aca94f93095722425340a0a95985e8796a5b33` 仍固定 BFF policy `2.0.0`，没有
`/iam/interactions/invitation` 静态入口；既有 `/auth/sign-in` 仅服务签名 OAuth，`/login` 仅服务 Product RP，
未入组邮件收件人没有真实首登路径。BFF main `d6dc8a0ea5a3fee7a4f54f01fefdeff0e28892e7` 已发布 2.1.0
policy SHA-256 `b3ff912e70858cc5a5cf7bdbc597c8872ab29c5bfec4dfbe070ce4b37500239d`，上游 IAM
`ac94f152daffa2293801ea4f56f98b3ae59452d7`/OpenAPI 0.4.0。Web 三设计面已记录下一切片：只读固定
policy 来源；唯一静态邀请页完成独立 issuer 登录/新邮箱注册+验证、recipient-only context、一次性 CSRF 接受/拒绝，
accept 200 后才启动 Product `/login`；无可见“连接中／整页重试”、假 `/auth/invitation`、Web SQL 或 Product 未入组 fallback。
未决且须代码证明：Web policy 2.1.0 pin、静态 Route Handler/表单/CSRF、安全响应和 owner 错误映射、Node22 全门、
Root 固定 SHA 的真实 PostgreSQL/Redis/SMTP/HTTPS Chromium 两类邮箱与错人/过期/并发验收；用户 3310 未由此门
启动或验证。早期 policy 2.0.0 与邀请空缺的后文属于历史/当前运行基线，不是已经完成 2.1.0 消费的证据。

R5-Web-Team-Product 切片（2026-09-25，Root 最终集成待验收）：已将旧 Team context、
namespace/inbox 与 IAM `/bff/*` 直达实现替换为 BFF public Team contract 生成客户端和
同源 `/api/team/*` adapter；设置中心只展示固定租户的成员、角色、管理邀请与显式确认写操作。
Node 22.22.2 的 `pnpm check` 已通过：contract 69/69、architecture 34/34、全量
Vitest 1459/1459、lint、typecheck 和 Next production build。独立只读审查发现的
写后刷新误报、跨页 actor/角色和邀请分页已修复并补测；真浏览器组合验收仍待 Root 执行；
不能把本地单仓门禁等同正式登录闭环。

R5-Web-Team-Product 前置切片（2026-09-24，工作树待 Root 审查）：固定 OIDC RP scope 在既有
三个 Team read scope 后追加 IAM `ad5224a` 的 `iam:member.write`、`iam:invitation.write`；
Auth.js authorization Location 仍按完整有序 scope 精确比较，缺项/额外项/重复项 fail closed。
聚焦测试先 RED（2 个预期失败），再 GREEN（13/13），Node 22.22.2。
该前置切片当时尚未替换旧 `/api/team/*` sealed-session→IAM `/bff/*`、namespace/inbox UI；
scope 申请本身不代表正式 Team Product 写、邀请链接或浏览器验收完成。BFF public Team contract 固定
`da03b76`、OpenAPI SHA-256 `5ac3c225193f70b99555e87f765c13128e43343929611f446fe744b77eef7954`。

R5-Web-policy-pin（2026-09-24，本仓来源重钉待 Root 验收）：Web browser-private IAM relay
只读快照原样复制 BFF `dd605c99e9bb5c6669ec31e04e285e5f92b79ed0` 的
`contract/iam-relay-policy.json`；policy 仍为 `2.0.0`，SHA-256
`74893ba4e566e4824a278cd3ee1548030a33435f9b37b7026a8a7e943c080037`，
IAM owner commit 仅更新为 `ad5224a9e0a3a31d1c593d214d37940d6923b2e7`。
IAM allowlist/vendor digest、relay route/header/cookie/限额与 Web 运行语义均未改变；
此切片不包含 Team Product 写或邀请邮件入口。下文旧来源 SHA/commit 是当时切片的历史证据，
不再是当前 consumer pin。Node `22.22.2` 在 Web 工作树先验证来源断言 RED，再执行
聚焦 4/4、`pnpm contract` 57/57、`pnpm test:architecture` 34/34、`pnpm lint`、
`pnpm test` 1424/1424，均通过；`pnpm typecheck` 与 `pnpm build` 在独立复制目录通过，
未触用户 3310 共享 `.next`。Root 的来源门、最终集成与真组合仍待审查。

W1C-FIXED-TENANT-WEB-D 第三切片（2026-09-24，Root 独立代码门与固定来源真三仓烟测已验）：Web RP code callback
在创建 Product Session 前、refresh 在 generation finalize 前，均以当前 user Bearer、固定 service
identity 和受信 `Forwarded` 调用 BFF `GET /v1/me`（owner OpenAPI SHA-256
`75ab482132602bd1d7ce77dbec1423b10d4ce7a8244ad284ecac78cd4e7b50ca`），严格核对
`data.user_id` 与 OIDC subject、`data.tenant_id` 与 server-only `KOKORO_TENANT_ID`。配置缺失、
非 200、超时/取消、响应超限/shape 错误或身份错配均 fail closed；callback 不创建 session，refresh
错配撤销 pending record，旧 generation 立即失效。无 JWT 自验、fallback 或可见中转，凭据不进响应/日志。
Root 在当前工作树重跑 contract 57/57、architecture 34/34、lint、全量测试 1424/1424、
typecheck 以及独立目录的 Next production build，均通过；3310 预览进程未重启。
Root 以 IAM `7f39193`、BFF `e0663a8`、Web `d117688` 固定来源运行测试自有 HTTPS
SMTP 首登→正式 IAM 邀请加入同一 tenant→OIDC→BFF `/v1/me`→Product Session/refresh/logout，
结果 `status=passed`、`owned_resources_remaining=0`。该结果不代表当前仅起 Web 的 3310
已经配齐 BFF/IAM/RP；只读实测 `/login` 仍为 HTTP 503、空 body，不显示旧中转页。

W1C-FIXED-TENANT-WEB-D 第二切片（2026-09-24，来源已重钉；真组合证据见上）：
该切片当时固定消费 BFF `e0663a8c85f055c2bac5af894070fea8e24ff3ce` 的
browser-private policy `2.0.0`（artifact SHA-256
`70cc9704ecf6f61d616011a72447ff3df8c209b3a769d5e4009692b81329e96f`，
IAM owner `7f39193fff97dbb1398cb536ded7dca0db354213`）。
`/iam/organization/list` 不再是可消费 Web GET；`/iam/interactions/select-tenant`
不再渲染选择表单/全屏重试、签发 tenant CSRF 或接受浏览器 POST，而是在精确签名
query 与 issuer cookie 下，以 server-only `KOKORO_TENANT_ID` 经窄 BFF
set-active 直接 302/303 续接。外层 `/auth/select-tenant` 仍仅保留把
`Path=/iam` issuer cookie 带入内层的无状态 302。Web RP callback/refresh 对
BFF `/v1/me` 的固定租户核验已由第三切片实现；本片不冒充 Product 登录全链验收。
真实 Next 51 个 IAM interaction 测试、5 个 HTTPS 反代测试与 Web 全量 Vitest
1417/1417 已通过；3310 当前 `/login` 仍是空 503（Web-only 未配齐），未改用户进程。
下文描述 tenant 表单、policy 1.x 的段落记录历史发布基线，以本节为当前事实。

W1C-FIXED-TENANT-WEB-D 第一切片（2026-09-24，待 Root 来源 pin）：已删除可见
Team switcher、客户端 `switchTeam` 和 `/api/team/switch` route；邀请/成员管理继续按
旧 Team context 展示，不把本片冒称固定租户登录已完成。三设计文档已明确目标：
待 IAM 第一方 Web client 续接和 BFF `/v1/me` 固定契约发布后，Web 内层 tenant
交互须无选择页、server-only 固定 ID 续接，并在 RP code/refresh 时校验受信
subject/tenant。测试先 RED 后 GREEN：Node22 聚焦 85/85、contract 57/57、
architecture 34/34、全量 Vitest 1418/1418、lint PASS；共享 3310 的 `.next`
仍缓存已删 route，当前 checkout 的裸 `tsc --noEmit` 被旧生成类型阻断，未清理
用户进程。一次性独立复制（实体 `node_modules`，无共享 `.next`）的 `pnpm typecheck`
及 `pnpm build` 均 exit0，生产路由表无 `/api/team/switch`。3310 `/login`
仍是 Web-only 的空 503，不是已打通的可见 IAM 入口。

R2e-IAM-VERIFY-WEB（2026-09-24，历史发布证据）：Web 当时从 BFF
`dadf9264116ea9df2c0886c4af84bacb67aa6e41` 固定只读 IAM relay policy `1.1.0`，artifact
SHA-256 `97022ea8727619bae03927027ef6a8ce87a3d2da4580ba5d211dc63b16fdc42c`，IAM owner
`b363554d07e5b6e182160b42ae1402330e55d9db`；原始切片仅新增
浏览器精确 `GET /iam/verify-email`。Web 对规范化后单一非空 `token`/可选单一 `callbackURL`
执行准入，重复/额外键本地拒绝；Next 可能在 handler 前规范化编码，故不声称任意 raw query 字节
保真。BFF/Web 继续受固定同源 302 Location 与 issuer cookie/Authorization 隔离约束；此精确路径
的最终浏览器响应无论成功、拒绝或上游失败均强制 `Cache-Control: no-store` 和
`Referrer-Policy: no-referrer`，其他 GET 不变。真 Next HTTP 聚焦测试覆盖 200/302、缺失/恶意缓存头、
外域 Location、错方法/路径别名/重复键零 BFF socket；真实 Chromium 从 token URL 的 200 页面点击
同源链接，出站 request 不带完整 token Referer。该 fixture 未验证 IAM JWT、SMTP 邮件点击或完整账号
登录；Web 无新 SQL/Redis owner。Next 16.2.6 开发模式默认会把完整 incoming URL 写入 stdout；
本工作树仅对精确 `/iam/verify-email`（含 query）启用 `logging.incomingRequests.ignore`，隔离真 Next
测试以独特 token 验证该框架请求日志不含 token、普通 `/iam/jwks` 仍被记录。此结论不覆盖 TLS
前置 access log、浏览器历史或外部邮件系统。Root 独立重跑 Node22 聚焦真 Next/登录/contract
13/13、`pnpm contract` 56/56、`pnpm test:architecture` 32/32、`pnpm lint`、`tsc --noEmit`、
`pnpm test` 1414/1414 均通过；为不触用户 3310 的共享 `.next`，`pnpm typecheck` 的 Next typegen、
正式 `pnpm build` 仍待隔离验收。Root 跨仓来源门与真 IAM 邮件点击/完整登录也待执行。

W1D-Chat 浏览器闭环修复候选（本工作树，尚待 Root 固定 SHA 真实 Chromium 复验）：BFF 当前
`RUN_FINISHED` 带 `status/outcome`（取消时另有 `result`），`RUN_ERROR` 带
`threadId/runId`，工具结果带 `isError`；此前 Web AG-UI 严格 schema 将这些 owner
字段误判为未知字段，使终帧解析失败。当前精确声明字段、仍拒绝未知键，并在内部投影保留
cancelled/tool error。SSE 同源代理此前使用普通 HTTP 15 秒总 deadline；当前仅
`GET /sessions/:id/events` 在首部连接后改用 60 秒可续的 idle deadline，普通响应保留原总
deadline。上述两项分别以旧实现 RED、修改后 GREEN 的 contract/真实 Node HTTP 测试证明；
尚未据此宣称浏览器 Chat 完成，须等 Root 独立固定版本端到端验收。
Node `22.22.2` 本工作树已执行 `pnpm contract` 56/56、`pnpm test:architecture`
32/32、`pnpm lint`、`pnpm test` 1408/1408、`tsc --noEmit`；共享 3310 dev 仍在运行，
本切片未在其 `.next` 上运行 build/Playwright，交 Root 串行完成。

状态日期：2026-09-24。范围：`kokoro-app` 独立子仓。本文只陈述当前工作树可验证的事实；历史报告、preview fixture、截图和 Agent 自报均不构成生产验收。

W1C 旧可见失败链清理：`/api/auth/magic-link/request` 与旧 `/api/auth/callback` 两个 browser-private
Route Handler 已删除，不再生成 magic-link 开发回调，也不再从失败回调 303 到
`/login?auth=link_unavailable`。固定 Auth.js `/api/auth/callback/kokoro-iam` 仍由
`/api/auth/[...nextauth]` 承载；旧 `auth.ts` helper、其他认证和 Team 路径本片未删。

W1C-2F-S1 已发布 Web main `0e0ec3a6a9682a09a7f335fbd7d96743afefd7dc`（含 HTTPS Product cookie `Secure` 修正）；后续已发布的旧 generation signout CAS 保持有效。S1 在已验 RP-only 基线之上接入 Web 自有 Product Session：成功 callback
以加密 HttpOnly cookie（随机 session ID/generation、server-only access，无 refresh；固定 Web origin 为 HTTPS 或 Web production mode 时带 Secure）和 Web Redis 加密
refresh record 建立在线状态；同源标准 `GET/POST /api/auth/session` 分别返回无 token 的最小 projection/
执行受 CSRF 保护的双 CAS refresh，`POST /api/auth/signout` 仅匹配 cookie generation 的 active record 才 take 已确认当前 refresh，
pending 时只 tombstone。旧 generation signout 不发送 Product `Set-Cookie`，避免乱序响应清除浏览器已收到的新 cookie；HTTP 200 返回 `stale_session`/`not_required`，旧 cookie 仍被在线 generation 校验拒绝，不改当前 Redis record、不 revoke、也不返回 issuer 引导；其他 signout 返回固定同源 `issuer_end_session_url` 与 `issuer_session=pending_browser_confirmation`；浏览器实际完成 `/iam/oauth2/end-session` GET 确认页和受 Origin/签名确认 cookie 保护的 POST 后，IAM issuer session 才算结束。七个普通受保护 BFF adapter 已切换为在线 Product Session generation 核验与唯一 access Bearer；legacy magic-link/team route 仍是**待删除旧态**，UI 主链不再消费它们；本切片不声称它们已删除；S1 真实三仓 HTTPS 组合已通过，S2-A 普通业务代理组合已通过固定三仓真 HTTPS。固定 BFF relay policy 已重钉
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`/IAM `e36da9ecf8d62a364182949817431a8e2329d50a`，
SHA-256 `ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；仅来源 metadata 变化。
本地 Node `22.22.2` 在 Web main `0e0ec3a6a9682a09a7f335fbd7d96743afefd7dc` 以 `caffeinate -dimsu` 执行：
`pnpm contract` 6 files/52 tests、`pnpm test:architecture` 4/32、`pnpm lint`、`pnpm typecheck`、
`pnpm test` 139/1369、`pnpm build`、`pnpm test:e2e` 6/6 均通过。RP-only 固定 503 的成功断言先
反转获 RED，再在 S1 获得 GREEN；真实 Web→BFF→IAM 三仓 runner 首轮识别出 HTTPS Product cookie 缺 Secure，已由 main 修复、待 Root 复验。本次 stale-signout 切片新增 Redis CAS 与真实 Next HTTP 回归：旧 cookie 不发 Product `Set-Cookie`、不触发 revoke、不返回 issuer 确认引导、不影响新 cookie；Node `22.22.2` 在本工作树执行 `pnpm check`，contract 52/52、architecture 32/32、全量 Vitest 1371/1371、lint/typecheck/build 均通过，`pnpm test:e2e` 6/6 通过。普通 `/v1` Bearer adapter、
Team、GitHub runner 与上线验收仍未执行/完成。

## 1. 当前边界

- 历史 W1C-2B-2 基线曾为 `/auth/sign-in`、`/iam/interactions/select-tenant|consent` 的服务端 GET 表单加上共享无脚本品牌外壳；当时 Email/Password、Tenant、Consent 各自原生 POST。当前 tenant 表单/POST 已由本文件首节的固定租户服务端续接取代，sign-in 与 consent 仍保留表单。旧真实 Next+Chromium fixture 只证明当时的视觉与交互边界，不冒充当前完整 OIDC/Product Session 闭环。
- 当前工作树的真实 Chromium 登录切片修复了 `GET /iam/oauth2/authorize` 的浏览器导航断层：IAM owner 实际返回 200 `application/json` `{redirect:true,url}`；Web 只在该固定 route 经原生 header/issuer cookie 和固定同源交互 Location 校验后转为无 body 302。其他 IAM JSON 保持原生，异常 authorize continuation 返回不透传上游 body/cookie 的 502。真实 Next + Chromium fixture 已验证浏览器进入 `/auth/sign-in`；完整 Product Session/Chat 浏览器闭环仍由 Root 独立组合 runner 验收。
- 公开入口已收敛：`/` 使用固定单租户 Kokoro 品牌直接渲染营销首页；`/login` 现为服务端 Product RP OIDC 启动路由，不依赖 System runtime manifest，浏览器成功时直接进入真正的 IAM `/auth/sign-in` 邮箱/密码表单。可见的连接中/整页重试组件与失败态共用的假登录页面均已删除；RP `signin` 失败后 303 回登录重试页的分支也已删除，失败仅返回结构化错误。`/login` 启动失败仅返回无 body 的 HTTP 503，并在服务端记录阶段。没有 RP 配置时当前本地 3310 返回这个空 503（非可登录预览），不会显示假凭据表单。`/app` 仍需在线 Product Session，System manifest 仅增强展示。IAM 表单已收敛为紧凑单列，浏览器凭据错误留在表单内并重签一次性 CSRF。`/preview/marketing` fixture 和未使用的 HomeGate 已删除。
- 本次改动在 Node `22.22.2` 下的 `pnpm check` 通过：contract 54、architecture 32、Vitest 1401、lint/typecheck/build；真实 Next HTTP 集成测试覆盖首次及已有 CSRF cookie 的 `/login` 302 与 RP cookie；聚焦 3310 离线 Playwright 10/10 通过。Auth.js v4 Route Handler 读取当前 Next request context 的 `cookies()`，不是合成 `NextRequest` 的 cookie header；服务端启动已显式同步经过 Auth.js 签发的 CSRF cookie。固定 Web `175a6d805b69b88c1478b86164fdcbfe925f498a` 的 Root 真 HTTPS Chromium 组合已 PASS：浏览器从 `/login` 直达带签名 IAM 表单，提交邮箱/密码、tenant、consent 后到 `/app` 并取得 Product Session；浏览器未发 CSRF/signin 中转请求。其后独立 CookieJar 完成 BFF/Agent worker 聊天回归，不能冒充 Chromium Chat；测试自有 PG、Redis、进程均清零。3310 仍无 RP/IAM/BFF 配置，HTTP 503 是当前环境事实。
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
- 只读 snapshot 固定 BFF `eb1eb2926d08b8a3779898b2c31e604a8585ec8b`、IAM
  `e36da9ecf8d62a364182949817431a8e2329d50a` 和 policy SHA-256
  `ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；Web 不编辑 owner policy，
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
  当时旧 magic-link route 仍待删除，但 UI 登录/探针/退出主链与普通 `/v1` Bearer 代理均已迁移；本轮已删除其中的申请和回调 route，其余旧认证/Team 路径仍在。该历史 fixture 不是 IAM owner 签名组合验收；当前 S1 已实现新 session/refresh/signout，但三仓真实闭环仍待 Root runner 验收。

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

W1D 登录 handoff 旧基线使用 Node `22.22.2` 执行 `pnpm check`：contract 6 files/54 tests、
architecture 4 files/32 tests、lint、typecheck、全量 Vitest 142 files/1,396 tests与 production build
均通过；`pnpm test:e2e` 在 desktop/mobile 为 15 passed、1 个既有 mobile rail logout skip。浏览器门证明
旧基线首屏零 CSRF/System 请求、点击后固定 CSRF/provider POST、失败停止重试、axe 与 viewport；本次自动登录与无卡片布局已替代“点击后”行为，当前工作树的聚焦浏览器门禁见本切片交付记录；其中真实 303
用例只证明当时 RP 配置缺失时的受控早退；其中失败后跳转登录重试页的旧行为已删除。
当前 RP `signin` 失败返回无跳转的结构化错误，`/login` 不承载中转或重试 UI；这不代表
authorize/token/userinfo、IAM 签名、Product Session 或完整 OAuth 失败链已经通过。

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
302/多 Set-Cookie、错误敏感体清洗及未安装 RP callback 503。当前 R2d-WEB-RELAY-PIN 再次机械 re-pin BFF policy
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`/IAM
`e36da9ecf8d62a364182949817431a8e2329d50a`，复制 BFF 发布的只读 JSON 原字节，其余 route/method
语义与前 pin 相同。

## 4. 尚未闭合的边界

1. Chat transport 仍保留 legacy `SessionEvent` 解析回退；AG-UI 单一路径、`AgUiChatTransport` 与 Vercel AI SDK `UIMessage` 映射尚未完成。
2. 两个旧 magic-link browser route 已删除；`auth.ts` 中的旧 magic-link/refresh helper 与其余旧认证/Team route 仍存在，其中旧调用继续直连 `KOKORO_IAM_BASE_URL`。S1 新 Auth.js Code+S256、server-only token/userinfo 和 Product Session 已落地，普通 BFF adapter、UI 登录/会话探针/退出主链已切换；其余旧路径仍须由后续 S2-B 清理。
3. 全部 route 的 success/error envelope、request/trace ID 和结构化 telemetry 尚未统一；没有实测 SLI、错误预算、burn-rate alert 或 production runbook 证据。
4. 未建独立 `/healthz` 与 `/readyz`；当前镜像 healthcheck 只验证受保护 session-state 路由可服务。
5. 部分遗留 UI/CSS 仍超出目标粒度；视觉回归与 bundle budget 尚未成为阻断门禁。

## 5. 后续顺序

1. 完成 S1 真实三仓 IAM 组合验收，继续 S2-B：删除旧 Web→IAM 直连和旧认证/Team 路径；
   legacy Chat 双读另由 W1D generated Product consumer/AG-UI 切片删除。
2. 统一 route envelope、request/trace ID、日志与 telemetry，并补 health/ready 与生产观测证据。
3. 独立完成遗留 UI/CSS 切片、视觉回归、bundle budget 与 live release acceptance。
