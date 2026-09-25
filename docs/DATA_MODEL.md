# Kokoro User Web 数据模型与 Owner

## W1C 固定租户数据边界（2026-09-24 设计门）

Web 当前没有持久化 tenant owner；旧 Team sealed-session 切换路由已删除，RP
成功创建/refresh Product Session 前已在线核 BFF 固定部署租户。Web
无 PostgreSQL/schema/migration：server-only `KOKORO_TENANT_ID` 是部署约束而非
新业务事实；BFF `GET /v1/me` 的已验证 subject/tenant 是 admission 投影，
只用于 code callback/refresh 的 fail-closed 校验，不写入 Product Session 或新增 Redis/SQL 事实。现有加密 HttpOnly Product
Session/Redis CAS 不增加 tenant 副本或新 key；浏览器不能选择或覆盖 tenant。
删除旧 Team switch 对 sealed envelope 的重签/重密封路径。owner 的 tenant、
membership、token 与审计事实仍在 IAM/BFF 自仓；无跨 owner SQL、事务或缓存。

固定租户 issuer 续接已取消租户候选列表及其一次性 CSRF/POST：内层 GET
只读取服务端 `KOKORO_TENANT_ID`、原始 signed query 与 issuer cookie，经 BFF
窄 set-active relay 续接；不产生新 Web Redis key/tenant 事实。下文 W1C-2B-2
候选列表与租户 CSRF 仅为旧发布基线，非当前数据模型。

状态：当前数据边界与 W1C-2 会话协调目标，2026-09-23；2C RP-only 已发布，S1 未提交工作树已实现
Product Session 在线协调，真实三仓 IAM 组合尚未验收；普通代理已由 S2-A 切换；旧认证/Team 路径未删除。

已发布的 W1C-2B-1 只实现 Web 交互 CSRF：Redis `kokoro:web:iam-csrf:<Web-origin-hash>:<token-sha256>`
保存目标路径、POST method、原始签名 query、issuer-cookie 组合摘要，TTL 300 秒；`GETDEL` 是一次性消费原子边界。
随机 token 仅见 HttpOnly `Path=/auth/sign-in` cookie 与隐藏字段，不存 Redis 明文；Redis 故障
fail closed。测试只清理本次生成 token 的精确 key，不扫描同前缀的其他 key。S1 工作树另使用隔离的
Product Session record/generation/双 CAS/tombstone；Web 仍无 SQL schema。

W1C-2B-2 将同一 token 机制扩展到内层 `Path=/iam/interactions/select-tenant` 与
`Path=/iam/interactions/consent`；IAM issuer cookie 仍保持 `Path=/iam`，因此原始
`/auth/select-tenant|consent` 外层只有无状态 GET 302 引导，绝不承载 cookie mutation。Tenant 选择时
绑定 owner GET 返回的 active ID 候选串，POST 在消耗 token 后再次从 owner 列表确认当前资格。
Redis 只保存 token 摘要与绑定摘要，不存候选组织名、scope 明文、IAM session 或授权事实。

W1C-2C 第一切片**当前 RP-only 实现**另用 Web 自有 `kokoro:web:oidc-state:<Web-origin-hash>:<state-sha256>`
短 TTL key 原子登记/消费 RP state，绑定固定 provider、callback 与 RP transaction cookie 摘要；
当前 RP-only Redis 不保存 code、access/refresh/ID token、client secret、userinfo 或 PII；后续 Product
Session 唯一例外是隔离 record value 中由 Web 密钥加密的当前 refresh，见下节。Auth.js 的 HttpOnly
state/nonce/S256 verifier cookie 仅供短期 RP 校验，用后清除；这是已发布 2C 基线的事实，S1 工作树
已在有效回调后建立独立的加密 Product Session cookie 与在线 generation/tombstone。
固定 TTL 300 秒；`SET NX` 防 state 碰撞，`GETDEL` 保证同 state 并发最多一次 code exchange。
Redis value 只有固定 provider/callback 与三枚 RP cookie 摘要的组合摘要，无 token 或明文 userinfo。

## R2e-IAM-VERIFY-WEB：邮箱验证链接的数据边界（本提交已实现，真 IAM 待验）

当前只读来源为 BFF `dd605c99e9bb5c6669ec31e04e285e5f92b79ed0`、policy `2.0.0`、
artifact SHA-256 `74893ba4e566e4824a278cd3ee1548030a33435f9b37b7026a8a7e943c080037`、
IAM owner `ad5224a9e0a3a31d1c593d214d37940d6923b2e7`。本次只更新 consumer
快照/provenance，不改变 IAM allowlist/vendor digest、Web Redis/SQL owner、缓存、事务或运行语义。
下文 `1.0.0`/`1.1.0` 是原邮箱验证切片的历史来源。

起始 Web `main` 基线 `0a093f65bdc4990b956b10ae534198e3b4b5c3b5` 固定 BFF relay policy
`1.0.0`、BFF commit `eb1eb2926d08b8a3779898b2c31e604a8585ec8b`、SHA-256
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`，故
`/iam/verify-email` 不在基线的浏览器 GET 集合。当时 Web 消费 BFF `main`
`dadf9264116ea9df2c0886c4af84bacb67aa6e41` 的只读 policy `1.1.0`，blob SHA-256
`97022ea8727619bae03927027ef6a8ce87a3d2da4580ba5d211dc63b16fdc42c`，IAM owner
`b363554d07e5b6e182160b42ae1402330e55d9db`；该历史来源重钉只是
准入来源替换，不是 Web 新业务事实。IAM 独占有期签名验证 JWT 的校验、`emailVerified` 幂等状态
与审计；BFF/Web 不持有邮箱验证表、receipt、outbox 或副本，不自行决定 token 是否已使用。

目标传输为 `Browser → Web GET /iam/verify-email?token=...&callbackURL=... → BFF → IAM`。Web
只接受规范化后一个非空 `token` 与最多一个 `callbackURL`，重复/额外键本地拒绝；Next
可能在 handler 前把编码键名规范化为相同键，唯一键可接受，规范化后重复仍拒绝。Web 仅保证
支持形状的键值语义，不把任意 raw query 保真当作事实。
签名 query 只在有界 request target 中传输，不持久化到 Web Redis、SQL、cookie、localStorage、
sessionStorage、日志、trace 或缓存；`callbackURL` 不成为 Web 存储字段或出站 origin 选择器。
IAM 原生 302 的 `Location` 只经现有固定同源/精确路径白名单验证，不能从 query 推断允许外域。
Web 对该精确 GET 的浏览器响应（含本地拒绝/上游失败）合成 `Cache-Control: no-store` 与
`Referrer-Policy: no-referrer`，即使 BFF/header 过滤缺失或上游给出可缓存值；其他 GET 语义不变。
Next 的最终 `src/proxy.ts` 仅对此 pathname 覆盖通用安全头，响应头是传输边界而非数据 owner。
`next.config.ts` 仅抑制 Next 开发模式对此路径的 incoming URL stdout 日志，避免签名 token 进入
该框架日志；TLS 前置 access log、浏览器历史与外部邮件系统仍属各自边界，不归 Web 数据 owner。
无新 PostgreSQL schema、migration、Redis key/TTL、事务、索引、
保留/删除流程或 Product Session 状态转换。Web 对 GET 的本地拒绝不触达 BFF，IAM 验证失败
不触发 Web 写入。后续 contract/Next HTTP 测试与 Root 真邮件点击/同源 302/Referer 组合分别给出
静态和行为证据；已通过的真 Next/Chromium fixture 不等于真实 IAM JWT/SMTP/完整登录验收。

## W1C-2：Web Product Session 数据与事务边界

### 当前态与目标 owner

当前 Web 的旧路径仍使用 `kokoro_session`
AES-256-GCM sealed envelope；`kokoro_auth_nonce` 只剩旧 helper/常量，两个 browser magic-link route
已删除，不再由 Web 签发或消费该 cookie。`auth.ts` 仍保留 IAM 直连 helper，旧 namespace/
principal 和 runtime credential 仍从该信封参与旧路径，这是**待删除的旧态**。Product Session、
Redis CAS/tombstone 与 OIDC RP 的 S1 实现及真实三仓 HTTPS 已验；BFF relay 的 W1C-2 起始基线
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b` 已 pin IAM
`e36da9ecf8d62a364182949817431a8e2329d50a`，policy SHA-256
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；W1C-2A 已固定消费该只读
artifact 与 provenance；普通 Product Bearer/Team 真实三仓组合仍待验。

Web **无 PostgreSQL/业务持久化 owner**：不建 `database/`、schema、migration、ORM、SQL 表、跨
owner JOIN 或 `db:apply-schema`。Root 现行**目标态**是本地/CI 共用一个物理开发 PostgreSQL database、一套应用
credential，同时每个数据 owner 使用**独立 schema 与独立连接 URL**。表前缀仅是命名规则，不能替代
schema 隔离；代码、查询、事务和 schema apply 仍禁止跨 owner 表访问/JOIN。这不是“各 owner 当前
installer/URL 已支持同库”的声明：现有 owner 可能假定 `public` schema 或空数据库安装，连接 URL、
search_path、安装器及 drift gate 须逐仓核验、改造并留证，不能由本 Web 文档冒称已跑通。
Web 当前与目标均无 PostgreSQL 连接。Web 自有 Redis
namespace 仅是在线 Product Session 的临时协调状态，不是 IAM identity/session/token 权威库、BFF
业务事实或 durable ledger；不引入独立 Redis 进程、清库动作或跨 owner key。这里修正旧文“Web 不拥有
Redis logical DB”的过宽说法：Web 可按 Root namespace/logical DB 决策使用**隔离会话 keyspace**，
但不拥有 Redis 业务事实或任意后端 owner 的 DB。

### 目标数据清单

| 数据 | owner/位置 | 内容与生命周期 | 约束 |
| --- | --- | --- | --- |
| IAM issuer cookie | IAM；浏览器 `/iam` path | IAM 原生 session/interaction；IAM 决定 TTL/撤销 | 仅精确 `kokoro-issuer.*` 或 production `__Secure-kokoro-issuer.*` snapshot；常规 `Path=/iam`，logout-confirmation 精确子路径；Web 不解析为 Product 权限 |
| Auth.js RP transaction cookie | Web；浏览器 HttpOnly | state/nonce/S256 verifier 与回调相关短期事务 | 用后清除，callback/code 重放拒绝；不向 BFF/IAM 转发该 cookie |
| Web 交互 CSRF cookie/record | Web；浏览器 HttpOnly cookie + 隔离 Redis namespace | 随机 token 的摘要、目标 POST path、IAM 交互绑定与短 TTL | hidden form 字段配对；原子一次性消费；不把 Web CSRF 字段送 IAM；Redis 不可用即拒绝 |
| Product Session cookie | Web；浏览器 HttpOnly 加密 JWT | 随机 session ID、generation、server-only 当前 access、必要 RP 退出提示；**无 refresh** | `Path=/`、`SameSite=Lax`、固定 Web public origin 为 HTTPS **或** Web production mode 时 `Secure`（与 IAM issuer cookie 的过滤/发行模式分离）；公开 session callback 不回 token；浏览器脚本/localStorage 不读取 |
| generation/state record | Web Redis 隔离 namespace | 随机 session ID → `active(g)`、`refreshing(g,reservation,deadline)` 或 `revoked`、固定到期、Web 密钥加密的**当前** refresh；双阶段 CAS 协调 refresh | TTL 不长于会话与 refresh 有效期；每请求在线核验；缺失/Redis down fail closed；pending 不允许旧 g 代理；refresh 不写入 key/log/公开响应 |
| tombstone | Web Redis 隔离 namespace | logout/revocation 的 session ID 阻断记录；仅 active 时原子 take 已确认当前的加密 refresh，refreshing/pending 时不 take | TTL 覆盖最大 Product 会话/在途窗口；记录缺失也建立；先写 tombstone 再清 cookie/上游 revoke；不可被旧 generation 覆盖 |
| UI preference/draft | Web browser storage | 非敏感临时体验状态 | 不含 token、tenant 选择器、service URL；不是任何会话/授权证据 |

Redis key 只使用随机不透明 session ID、版本/generation、必要到期瞬时点与最少协调字段；Redis **value**
仅在 Web 隔离 session record 保存以 Web server-only 密钥加密的当前 refresh，不保存 access/ID token、
IAM session cookie、密码或用户 PII；key、日志、公开 session 与浏览器存储均无 refresh。key 名加 Web namespace
与环境前缀，TTL 与 clock skew 在实现测试中固定；无索引、无跨 owner 查询、无 schema install。
Web cookie 加密材料只在 server-only 配置，轮换时仍须 Redis 当前 generation；旧密钥能解封不意味着
旧 generation 可授权。Redis 不能成为 IAM token 是否有效的最终判断，BFF 每个受保护 `/v1` 请求
仍在线 IAM admission。

### 状态转换、并发与恢复

```text
OIDC transaction pending ──valid code/state/nonce/PKCE + userinfo（2C）──> RP verified / no Product Session / controlled 503（终态，丢弃 token）
后续新的 OIDC transaction ──同等验证 + 会话协调成功──> Product Session active(g)
active(g) ──reservation CAS──> refreshing(g,reservation)
refreshing(g,reservation) ──IAM exchange success + finalize CAS──> active(g+1)
refreshing(g,reservation) ──error/deadline/unknown/finalize failure/AAD decrypt failure──> revoked
active(g) ──logout/tombstone + take已确认当前refresh──> revoked
refreshing(g,reservation) ──logout/tombstone，不take旧refresh──> revoked
active(g) ──expiry/IAM reject/Redis unavailable──> fail closed
previous generation / tombstoned handle ──replay──> reject
```

- callback 仅在 IAM code exchange 与 claims/audience 验证成功后创建 Product Session；callback 重放
  不二次建 session。Web 不自行签发 IAM access token。
- refresh 首先以 session ID/generation 的 reservation CAS 从 `active(g)` 进入
  `refreshing(g,reservation,deadline)`，仅赢家向 IAM 发起**一次**固定 Basic/resource exchange。pending
  状态的普通代理和第二次 refresh 均拒绝；败者只拒绝本请求，不撤销赢家、不清赢家 cookie。赢家收到
  新 token 后，先检 token UTF-8 长度、期限与完整 Product Cookie ≤4096 B；仅在 reservation/deadline 匹配且未 tombstone 时以第二 CAS 同时写新加密 refresh、
  `active(g+1)`，随后才发送新 cookie。IAM 错误、deadline、结果未知或 finalize 失败使记录 revoked/
  fail closed；未决 reservation 到期也只撤销，不回退 active。Redis 故障使在线检查拒绝，不以旧 refresh
  猜测重试；不依赖 issuer 的 replay 窗口恢复败者。finalize 成功但新 cookie 交付未知，或 Redis
  finalize ACK 未知时不发送新 cookie；即使记录已是 `active(g+1)`，旧 g 仍拒绝，用户重新登录，
  无客户端可达的 active record 由固定 TTL 回收。不得以进程锁或 localStorage 代替跨实例 CAS。
- logout 从可信解封 cookie 取得 session ID 与 generation；Redis 原子比对当前 record generation，只有匹配时才 tombstone。旧 generation 不发 Product `Set-Cookie`，避免乱序响应删除新 cookie；旧 cookie 仍因在线校验不可用，保留当前 record/refresh 且不请求 revoke 或返回 issuer 确认引导；
  **仅匹配 generation 的 active 状态**同时 take 已确认当前的加密 refresh，经 BFF 固定 relay 单次有界尝试 IAM
  revoke。issuer end-session 是浏览器原生确认流程，不由 Web Redis refresh take 代替；refreshing/pending 时可能已轮换，故不 take/发送旧 refresh，报告远端撤销未确认。
  记录缺失也建立覆盖最大会话/在途窗口的 tombstone；迟到 finalize 不可复活，重复 logout 不重复远端
  revoke。清 Web cookie。旧 refresh 的 revoke 可能扩及同 client/user family 且返回 400，不能当作
  幂等/单设备撤销。active 状态的远端失败明确未确认；tombstone 写入 ACK
  未知时清 cookie 只代表本浏览器清除，不能报告服务端撤销。无补偿存储/后台重试，远端未确认只能由
  IAM owner TTL 兜底。清理只删本 Web session keys，不重置共享 Redis。
- retention：Product cookie/Redis generation 不长于 IAM refresh/session 有效性；tombstone 覆盖
  cookie 及可能重放窗口；S1 实现另设 Web 本地最长 1 小时会话上限和再加 60 秒的 tombstone 窗口，
  不是 IAM issuer refresh TTL 声明；RP transaction 到期清除。后续真实 IAM 组合须核对 IAM owner
  实际 token policy 与 clock skew，不能凭 Web 上限宣称 grant 生命周期。数据删除由到期、
  logout 和针对性 key 清理完成；无 SQL 软删/物理删、索引、fresh-install 或 schema drift 门。

### 契约与验证

`/iam` 原生响应/cookie 由 IAM 事实源、BFF 固定 relay policy 与 Web 同源过滤共同约束；Web
Product Session cookie 与 Redis key 是 Web 内部状态，不作为 public API 字段。普通 `/api/*` 代理
只向 BFF 发送当前 generation 的单一 user Bearer 与 Web service identity，不把 cookie、namespace/
principal 自报 header、Redis key 或 refresh token 传给 BFF；公开 session projection 仅给 UI 非敏感
状态。service-only manifest、公开 Share 边界另按 BFF contract 验证。详见
[`TECHNICAL_DESIGN.md`](TECHNICAL_DESIGN.md) 与 [`API_CONTRACT.md`](API_CONTRACT.md)。

实施测试须覆盖 CAS 双请求竞争、previous-generation replay、logout tombstone、Redis 丢失/超时、
cookie 到期/密钥轮换、callback 重放、IAM revoke 失败、同租户其他用户/跨租户拒绝与服务重启。
`pnpm contract`、`pnpm test:architecture`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、
`pnpm build`、`pnpm test:e2e` 与 Root 隔离真实 Web→BFF→IAM 组合是目标门；本次文档更新
未运行这些行为门，不宣称三文档门之后的实现、contract artifact 或 schema 验收。

## 1. Web 无业务数据库 Owner

`kokoro` 不拥有业务数据库、数据库 schema、migration、ORM entity 或服务端业务 repository。
本仓没有 `database/` 目录，也不应新增 `db:apply-schema`。W1C-2 目标仅新增隔离的 Web Redis
会话协调 namespace；它不是业务持久化 owner。

Web 拥有展示、浏览器交互状态和自身的 HttpOnly Product Session/临时 Redis 协调；身份与业务授权
事实仍由 IAM/BFF 判断。任何业务资源若需要跨浏览器、跨设备、审计、恢复、授权或服务端并发控制，
必须由对应后端 owner 持久化，并通过版本化 contract 返回 Web。

| 事实 | Owner |
| --- | --- |
| Conversation、Message、Share、Project、ScheduledTask、public AG-UI projection | `kokoro-bff` |
| Run、Checkpoint、Lease、Tool Journal、HITL、执行事件、Evidence | `kokoro-agent` |
| Tenant、Identity、Authentication、Authorization、Role、Permission、Audit | `kokoro-iam` |
| Site、Host、Workspace、Runtime Manifest、System Policy | `kokoro-system` |
| Model Catalog、Provider Metadata、Routing Policy | `kokoro-model` |
| Payment、Subscription、Credit、Ledger、Metering | `kokoro-billing` |
| Skill、MCP、Installation、Capability Authorization | `kokoro-capability` |
| Blob、Upload、Asset、Artifact、Scan | `kokoro-storage` |
| Schedule、Occurrence、Lease、Retry、Dispatch | `kokoro-scheduler` |

Web 不复制这些表、DTO 或状态机，也不通过数据库 JOIN 获取跨 owner 数据。

## 2. Web 持有的数据类别

### 2.1 Server-side cookie

| 名称 | 内容与用途 | 生命周期 | 安全属性 |
| --- | --- | --- | --- |
| `kokoro_session`（当前旧态，W1C-2 删除） | AES-256-GCM sealed envelope；含 runtime credential、refresh token、user/namespace 和过期时间 | 当前对齐 refresh expiry；旧密钥可解封 | HttpOnly、SameSite=Lax、Path=/；production Secure；不作为目标在线授权 |
| `kokoro_auth_nonce`（遗留 helper，browser route 已删除） | 原 magic-link 设备绑定 nonce；当前 Web 浏览器流程不再签发/消费 | 原实现 900 秒 | 原 HttpOnly、SameSite=Lax；production Secure；待清理常量/helper |
| `sidebar_state` | 非敏感 Rail 展开偏好 | 当前实现 7 天 | 浏览器可读 UI cookie，不是身份依据 |

当前 `kokoro_session` 的 namespace/user 由 Web server 解封后用于构造旧上游上下文；W1C-2
必须删除这一自报身份通道。目标 Product Session 的非敏感展示字段不替代 IAM/BFF 授权。

### 2.2 localStorage

当前可见类别：

| 类别 | 示例 key | 语义 |
| --- | --- | --- |
| UI preference | `kokoro.theme`、`kokoro.locale`、`kokoro.web.chat-prefs`、`kokoro.web.pinned_skills` | 本浏览器偏好，可清除、可重建 |
| Draft/local projection | `kokoro.web.drafts`、`kokoro.web.conversations`、`kokoro.web.process-disclosure` | 编辑草稿或有限 UI 索引；不是 Message/Conversation 事实源 |
| Preview fixture | `kokoro.preview.sessions.v1`、`kokoro.preview.scheduled-tasks` | local/test 合成数据；production 不启用 |
| Preview project state | `kokoro.preview.project.<ref>.instructions` 等 | 合成项目编辑状态；不是跨设备 Project 事实 |

规则：

- 不保存 access token、refresh token、internal secret、service URL、tenant/site selector 或支付凭据。
- 外部 JSON 必须在读取后以 `unknown` 经 Zod/显式检查校验；坏数据降为空态或明确错误。
- 用户登出、共享设备处置与 preview 重置要考虑清理非必要草稿；当前没有统一的隐私清理流程，属于缺口。
- localStorage 不参与授权、幂等、durable replay 或审计。

### 2.3 sessionStorage 与 URL

- `sessionStorage` 承载一次性 project draft handoff、creation intent 和 preview sequence；关闭 tab 后失效。
- URL/query/hash 承载可导航 surface、project/conversation 引用和非敏感筛选状态。
- 旧 magic-link 申请/回调 route 已删除，Web 不再生成带 token 的旧 callback URL；固定 OIDC callback 使用独立的 `code/state/iss` 流程。
- runtime JWT、refresh token、internal secret、tenant/site 不进入 URL。

### 2.4 内存状态

React state、query resource store、Chat engine 和 optimistic receipt projection 都是进程内/标签页内状态。
刷新后必须从 URL、browser preference 或 BFF snapshot/event 恢复，不能把未持久化内存状态当成功事实。

## 3. Chat 数据投影

```text
BFF snapshot + command receipt + durable AG-UI events
  -> Web contract validation
  -> UIMessage parts / reducer projection
  -> React view state
```

- BFF cursor 是唯一网络 replay axis。
- Web 可缓存最大已确认 cursor，但不成为 ledger owner。
- optimistic user message 只有在 receipt/event reconciliation 后才收敛为服务端状态。
- `SessionEvent` 是当前内部 reducer shape，迁移完成后不得继续作为独立 wire contract。

## 4. 时间、标识与分页

- 服务端 timestamp 使用 RFC 3339 UTC，例如 `2026-09-03T12:34:56.123Z`；Web 只在展示层本地化。
- opaque ID 不解析业务含义，不拼装 tenant 或 owner 信息。
- 列表使用 BFF opaque cursor；Web 不把数据库 offset 暴露为长期协议。
- 同一毫秒内的顺序由服务端 cursor/sequence 与稳定 ID 决定，不用浏览器时钟裁决事实顺序。

## 5. Retention 与删除

| 数据 | Retention owner | Web 行为 |
| --- | --- | --- |
| 服务端业务事实/事件 | 对应后端 owner | 发出删除/撤销 command，并依据 receipt/event 更新 UI |
| HttpOnly Product Session | Web 本地 tombstone/cookie；IAM 远端 token/session policy | logout 本地先失效、单次有界远端撤销；失败明确未确认并靠 IAM TTL 到期兜底，无清 cookie 后补偿重试 |
| UI preference/draft | Web | 用户清除浏览器数据或产品提供的清理动作 |
| Preview fixture | Web local/test | 可直接删除对应 browser key；不得作为 live 删除证据 |

当前缺少统一 browser-data inventory 自动测试、logout 后草稿清理策略和用户可见数据清理入口；这些是隐私
与产品决策项，不通过新增 Web 数据库解决。
