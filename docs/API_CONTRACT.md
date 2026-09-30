# Kokoro User Web API 与协议契约

## WEB-PRODUCT-IA-CODE 当前消费者（2026-09-30；待 Root 验收）

基线 `7087225`。网络 API/contract/generated 未改：Conversation engine/project_ref、Project create frozen intent、
ScheduledTask live client/同源 `/api/scheduled-tasks` 继续现契约。只删除 Web 正式 Project 未解析 ACK 的 scheduled callback 接线，
其卡片导航独立 `/app/scheduled`；无新增、重命名或伪造 owner endpoint。项目专属 POST 契约仍属于 BFF，未来消费者须解析其真实回执。
内部 welcome `onCreateProject(draft?)` 与 `onOpenProject(ownerId,draft?)` 分离；不再把 preview sentinel 当正式创建命令。
rail 删除 onCreateTask→onNewChat / onReorderTasks alias；任务导航不提交 Chat。
审查返修同步 Conversation 的 DOM/data-test/aria/CSS 与组件文件名；命令菜单 new chat 文案对齐，非网络协议变更。缺 owner project ID 不发猜测项目请求。
Preview 夹具隔离、缺 callback 不宣称正式成功；无 auth、deadline、幂等、权限或错误门放宽。
下节文档门中的“当前”描述为实施前基线，代码候选与实测边界以本节/CURRENT 为准。

## WEB-PRODUCT-IA：既有资源入口消费边界（2026-09-30；仅文档）

基线 Web `79f19df`；本门不编辑 contract/generated，不新增 endpoint 或 owner wire。固定机器来源仍是
`src/generated/bff-public-openapi.yaml`，同源 path/schema 仍是 `src/contract/` 与现 route adapter。

| UI 意图 | 已存在边界 / 目标消费 |
| --- | --- |
| 独立会话 / 专案内会话 | 复用 Chat engine、既有 `project_ref` 与 conversation 列表过滤；归属可选，不把 Conversation ID 当 ScheduledTask/Run ID。原 Chat 幂等、AG-UI 与水位完全保留。 |
| 新建/打开专案 | 现 `features/app/project-create.ts` → `/api/hub/projects` → BFF `/v1/projects`；严格 owner 回执 ID 后打开 `/app/project/{id}`。未知 ACK 复用原意图；导航失败只重试已得 ID，不重发创建。品牌、slug 猜测、`kokoro`、preview sentinel 不提供真实项目身份。 |
| 独立任务 | 现 `/app/scheduled` → ScheduledTaskSurface live client → `/api/scheduled-tasks` → BFF `/v1/scheduled-tasks`，现 get/update/delete/retry 子路径保持。既有严格请求/回执 schema、mutation key 与失败状态复用；不新建“任务=新聊天”别名。 |
| 项目调度 | 固定 public 已有 POST `/v1/projects/{projectId}/scheduled-tasks`，要求 Idempotency-Key，返回 ScheduledTaskResponse；当前 useAppFrameProject 仅验 HTTP ok 丢弃回执，Project UI 合成 ID，不能当真实成功。首片移除正式嵌入假流程，任务导航去独立 live surface；后继若接项目创建，必须沿此 owner 回执和精确输入，不假造新协议。 |

**严守两个差异。** `/v1/projects/{projectId}/tasks` 返回 TaskListResponse，不等于 Conversation list，
也不等于 ScheduledTaskListResponse；不因路径里有 tasks 就挪用。现 ScheduledTask public 允许 project_id，
但 Web 独立 client 的视图投影未保留它，列表接口消费没有项目筛选；因此首片不声称任务页面已按 Project 过滤，
不通过猜 ID/标题或前端合成关系提供该承诺。完整项目集合消费者也尚未接入 rail，不把假单项目当集合。

浏览器只用同源 adapter；tenant/actor/owner 权限来自当前 Product Session/BFF，不由 UI body 自报。
HTTP 401/403/404/429/依赖错误仍保持现 contract 语义，loading/error 不转成功或预览数据；网络结果未知不发新副作用身份。
正式 UI 只有真实 owner ACK/经校验读取才宣称资源创建，入口存在不证明 Scheduler/Agent 已执行。
新入口沿站点有效导航与既有 mounted surface，不改公开 route 语义或添加兼容 alias。

验收建议：现 contract、architecture、ScheduledTask client/surface 行为门保持；首片组件 RED 覆盖导航意图不混用、
缺 callback/错误无假成功、真实 owner ID 才导航、preview 不污染正式请求。当前文档门未执行真 owner/E2E。

## W3-WEB-CHAT-SKILL-SELECTION（2026-09-29；当前消费合同，待 Root 验收）

BFF public 唯一 owner 为 `571b51de2057905c74c78ac966c8cf5ac11eca93`，其 OpenAPI 原字节 SHA-256 是
`f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90`；Web 已更新只读 snapshot 与生成校验 digest，
不建立第二可编辑契约。`MessageCreateRequest` clean-slate 删除旧 `pinned_skills`，改为
`selected_skill_source_refs`。Web 每次创建消息都显式发送该数组，包括无选择时的 `[]`；不得发送 alias、显示名称、
`null` 或省略来维持旧语义。

每项为 exact `skill:<SkillId>`：不得 trim/规范化，须匹配
`^skill:(?!skill:)[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])`；使用绝对末尾断言，尾随 LF、CR 或 Unicode
换行均拒绝，不得以 `$` 代替；
最多 16 项、有序唯一、单项最多 197 个字符，整个数组的 compact UTF-8 JSON 最多 4096 字节。选择顺序进入 BFF request digest。Web 在提交开始时冻结 content、idempotency key 与该数组；网络结果未知或
用户显式重试必须复用同一集合，不能采样重试时的新选择。同 key 不同选择由 BFF 409 拒绝。严格 consumer 同时拒绝旧
`pinned_skills`、重复、17 项、数组 JSON 超 4 KiB、前后空白/空 suffix 与多余字段。

个人 Skill GET 的 `source_ref/revision` 仅给选择标签与 exact identity；它不是 installed/enabled/executable proof。
当前正式页面没有选择入口，Agent 非空 reader 也未接，因此当前只提供 typed consumer/default `[]`，不宣称非空请求可执行。preview 名称动作
不进入此 wire；旧 `kokoro.web.pinned_skills` 不读取、不迁移、不作 fallback。

## W3 第二阶段 B：正式 Skill 写候选消费（2026-09-29；待 Root 真链验收）

BFF 唯一 public OpenAPI owner `62daba37fc0267830d73590bb5a3499807d46fc6`，Web 原字节 pin SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923`，无第二可编辑契约。浏览器业务只向同源 `/api/hub/self/skills/*` 请求；同源 route 把 CreateDraft、Get package-upload、Begin、Complete、Validate、Publish 转到 BFF `/v1/skills/*`，携 Product Session/service 身份而不接受浏览器自报 tenant。严格 JSON media、`no-store`、安全 request ID、`{data}`/`{error:{code,message,retryable}}`，成功 201/200 按 operation；零字节 Publish 不带 JSON/body，Idempotency-Key 单次意图稳定且符合 owner 1–128 printable 规则。拒绝旧 multipart preview/confirm 作为正式写回执。

Begin 返回 `url/method=PUT/required_headers={content-type:application/zip}/expires_at`；Web 仅用短期引用原 File 直 PUT，不追加 Cookie/Bearer/header、禁重定向。HTTPS 页面到 HTTP URL 必拒；开发仅 loopback HTTP→loopback HTTP，BFF 另对 ObjectStore public origin 作精确 allowlist。Get `none/intent/upload_pending/uploaded/validated/aborted` 是 attempt 状态，Begin/Complete/Validate 均不能证明发布。Complete `scan_state=pending|unknown` 要停在扫描 partial，同页显式复核当前 attempt/epoch/upload 后同键 Validate；状态被替换只能明确重开意图。唯一完成判断是 strict `PublishSkillResponse.data` ACTIVE 且匹配 draft ID，或本人 `GET /v1/skills/{id}` 的 ACTIVE 七字段权威核回；恢复 GET 可取消，401/403 原码保留且不重发，首轮 404 显示未知，后续显式核对仍 404 才同键零 body 重发。感染、旧 attempt、无效 phase、未知 ACK 均不走旧 pool/catalog fallback。Draft owner raw-body 65,536 字节独立于 schema 各字段最大值；Web 先按序列化 UTF-8 字节预检并给可编辑超限提示，route 同限额且超过有类型化 413；Begin filename 在创建 Draft 前复用 schema 预检。非 self Skills/MCP alias 404，不以通用 route 绕过严格边界。六写候选在 BFF 仍 default-off/Platform v4 inactive；Root 真 HTTPS/CORS/Storage 浏览器链另验。

## W3-WEB-SKILL-CONSUMER 第二阶段 A：正式 GET 消费（2026-09-29）

BFF 唯一 public OpenAPI `62daba37fc0267830d73590bb5a3499807d46fc6`、Web 原字节 SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923` 未变。正式同源 `/api/hub/self/skills?scope_kind=personal[&cursor]`、`/api/hub/self/skills/{id}`、`/api/hub/self/mcp/servers[?cursor]` 分别代理 BFF `/v1/skills`、by-ID、`/v1/mcp/servers`；不得直接访问 Platform。严格 `200 {data}`、`Cache-Control: no-store`、`x-request-id`，错误必须为 `{error:{code,message,retryable}}`，未知/缺失字段、旧 `{data,meta}`、redirect 和错误状态均失败；不从旧 pool/catalog 补读。Skill 列表保留 `source_ref/revision/next_cursor`；本人 ACTIVE by-ID 只取七安全字段，响应 ID/source_ref 与请求一致；404 不推断为未发布之外的事实。MCP 只投影六 owner-native 字段，不读 URL/secret/revision/allowed_tools，也不呈现无效启停/删除。旧 pool/catalog/quota、MCP secrets GET 在正式同源 route 拒绝；显式 preview fixture 与旧上传 preview/confirm 暂留到上传切片，非正式发布证据。六项新写 API 仍 default-off，本切不发请求。

第一阶段条目以下为历史 pin 门；本节才是当前只读运行状态。

## W3-WEB-SKILL-CONSUMER 第一阶段：BFF public 原字节 pin（2026-09-29）

唯一可编辑机器源是 BFF `62daba37fc0267830d73590bb5a3499807d46fc6` 的 `contract/openapi/v1/openapi.yaml`；Web `src/generated/bff-public-openapi.yaml` 只保存原字节 SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923`，Team client 仍由现有生成器从该 snapshot 派生，Web 不建另一份 public schema。本阶段更新 pin、文档与直接 contract 负例，**不改正式同源 route/client/parser/UI**。当前这些运行代码仍使用旧 preview/confirm 与 MCP/Skill 形状，不能将新机器契约误述为已消费。

| BFF 唯一 public 边界 | 下一运行片的严格消费义务（本阶段只 pin） |
| --- | --- |
| `GET /v1/skills?scope_kind=personal[&cursor=...]` | 当次 IAM subject/tenant；只把 owner 返回的个人 ACTIVE 投影作为个人页权威列表，保留 `source_ref` 与正 `revision`，不使用旧 `scope=official|third_party`、pool/catalog 代替；opaque cursor 原样继续。成功 strict `{data:{skills,next_cursor?}}`，无旧 `{data,meta}` 双读。 |
| `GET /v1/skills/{skill_id}` | 本人 PERSONAL/ACTIVE 且不要求安装；200 只取 `skill_id/source_ref/revision/status/name/summary/tags` 七字段，非本人/非 ACTIVE/跨租户 404。发布 ACK/key 遗失时此读可核已 ACTIVE，Get package-upload 不可替代。 |
| CreateDraft / Get / Begin / Complete / Validate / Publish | 六项写候选 BFF default-off、Platform v4 inactive。目标为单 ZIP→Draft/Get/Begin→签名原字节 PUT→Complete→Validate→零 body Publish；每个 mutation 原 key/body 同键重试，当前 IAM/owner 重验。`uploaded`/`valid=true` 非发布成功；严格 Publish ACTIVE/event 回执或本人 by-ID 才显示完成。未知 ACK 显式未知，失效/感染/旧 attempt、坏回执不得转成功。 |
| `GET /v1/mcp/servers` | 仅 owner-native `server_id/provider_key/server_identity/transport/declaration_digest/status` 六字段，strict `{data:{servers,next_cursor?}}`。URL、revision、allowed_tools、secret_ref 与旧启停/删除展示不是当前读投影；不可伪造为可操作连接。 |

浏览器业务请求仍只走 Web `/api/*` 同源 Product Session adapter→BFF；ZIP bytes 唯一例外是按 BFF 受控短期签名引用发往批准 ObjectStore public origin 的直接 `PUT`，`credentials: omit`、`redirect: error`，原样 headers、无 Cookie/Bearer；Web/BFF 不代理 ZIP。401/403/404/409/412/429/502/503、`x-request-id`、`Cache-Control:no-store` 与错误 `{error:{code,message,retryable}}` 以 owner OpenAPI/运行行为为准，不从 message 推断恢复分支。下阶段旧 preview/confirm、`scope=official|third_party`、`.skill` 多候选和 MCP 假字段需同 UI 切片删除，不能保留 fallback。真正 CORS preflight/PUT、ACTIVE 刷新列表/by-ID、撤权/感染/过期/坏回执仍须 Root 隔离 Chromium 真链核验；六项写候选不能因本 pin 自动打开。旧 W3-WEB-SKILL-UPLOAD-DOC-GATE 的 BFF `55ca6c1`/SHA `0198220b` 只是历史文档门来源。

## S9-WEB-DOC：Chat Delivery 消费契约（2026-09-28；仅文档）

唯一 owner 机器源是 BFF main `bd1f794e7b1115d96965aa03d8a3a83a33c42fd7` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`a224b186813615467b6c045d3be83082d3e164e140d6da9722bf3f8d7e33b219`。
Web main `102033e34be89ba0e9958447e4d4021fcbf257b7` 的 generated 仍固定旧 SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`；
本门不编辑 generated、Web Zod 或 BFF 契约，不声称当前 Chat 已能解析新响应。下一代码门先由固定
BFF 来源确定性重生成并查 drift，再改消费解析，不能手工改 owner schema 副本。

| 边界 | 目标消费规则 |
| --- | --- |
| `GET /api/session/sessions/{id}` → BFF `GET /v1/sessions/{id}` | 当前 Product Session 的本人 active Conversation/Project 准入由 BFF 实施。200 `data.deliveries` 为最近最多 100 件，按 `delivered_at DESC,artifact_id ASC`；`data.deliveries_has_more` **必填 boolean**，`data.event_watermark` 与 Delivery 来自同一 PostgreSQL 读快照。Web 不拿水位当授权；错误不构造空列表。 |
| 每个 snapshot `Delivery` | **必填且无额外字段**：`conversation_id`、`artifact_id`、`asset_id`、八值 `artifact_kind`、`title`、`mime`、`size`（0..`Number.MAX_SAFE_INTEGER` 的安全整数）、`run_id`、UTC `created_at`。`(conversation_id,artifact_id)` 是唯一视图身份/Library selector；`asset_id` 非单独下载入口。snapshot 不要求 `tool_call_id`、`path`、`content_hash`。 |
| `/api/session/sessions/{id}/events` AG-UI | BFF durable ledger cursor 是唯一 replay axis。`kokoro.delivery.created` 的 Agent live/replay payload 与 snapshot 不同：完整校验 ID、kind、`tool_call_id`、`path`、`content_hash`、title/mime/size 等生产字段；`conversation_id` 来自受校验的 AG-UI thread/session envelope，不从 hash/path 猜。保留 wire 协议严格性，但 UI 只投影必要字段，不能把 snapshot schema 套到 live 上。Web 当前 parser 尚拒这些新字段；不增加 legacy `SessionEvent` 网络 fallback。 |
| 断线/GC | 普通断线按 `Last-Event-ID` 从确认 cursor 续流；流建立收到 BFF HTTP 410 `event_cursor_expired` 时保留稳定码供 machine 区分、丢弃旧 cursor，重新 GET 本人快照，并从返回 watermark 续流。与 snapshot GET 的 410/404“会话不存在/已删”分开。Web 当前 transport 将流 410 包成无 status 普通错误，machine 直接 FAIL，尚无该恢复。其他 HTTP、坏 200 或坏事件 fail loud，提供显式重试，不降级为 hash/preview。 |
| Chat 卡/Canvas 动作 | 使用 Library 已发布的 `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}` 详情与同二元 `/content` 同源原生 attachment；每次由 BFF 重新授权，详情预检不保证下载仍可见。本人以外/错二元组不可见 404；Asset/hash/path 不是授权凭证。快照 `deliveries_has_more` 为真时显示现有 Library“查看全部作品”。 |

同一二元 ID 的 live/replay/snapshot 去重；同 hash 不同 ID 均保留。终态 snapshot 对账需要兼顾
同事务水位和在途 live 竞态，不能无条件以旧快照整表替换。Share snapshot 依 owner 契约保持
`deliveries: []`、`deliveries_has_more: false`，不是个人 Artifact 分享许可。本切片不扩展 Share、Project
授权，也不把个人 File `asset_id` 与作品联合。代码门覆盖坏字段/大小边界、双 ID、100+入口、410 恢复与
原生下载/私有错误，并跑 Node22 contract、architecture、lint、typecheck、test、build、隔离 E2E 与 Root 真
IAM→Chromium→Web→BFF→Agent→Storage 组合；本门仅要求文档/机器源核对及 `git diff --check`。

## W2-WEB-AGENT-ARTIFACT-F2-CODE：作品页消费契约历史基线（2026-09-28）

本仓已将 BFF `55d3c9cd55386d9dcc074e893cc388924dd94c13` 的唯一 public
OpenAPI 原字节固定到 `src/generated/bff-public-openapi.yaml`，SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`；
生成检查为 15 文件无漂移。正式作品 consumer 只读 `GET /api/hub/library?kind=artifact&limit=50`
及其 opaque cursor、二元详情 `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}`，
严格拒非空 File/混合页、坏项和错二元身份，允许 `items:[]` 带 `next_cursor`。
详情预检非下载许可。内容只发起精确同源二元 `/content` 原生 attachment GET；Route 对
200 校验 ≤1 GiB 长度及安全头后流式转发，非 200 不加下载成功头，3xx 拒绝。
401/403/404/429/502/503 与坏 200 不降级为旧 hash/preview 空页；页面只能观察
发起动作，不能观察浏览器保存完成或预检后的下载竞态。BFF 每次内容请求仍独立准入。
个人文件 1 MiB 与通用 Hub 默认不变，Web 不另发布 Product contract。

作品页正式旧 `/api/session/artifacts` 列表/内容消费者已删，Chat `deliveryPath`/Canvas
仍保留；BFF live 已发布 `artifact_id/asset_id/artifact_kind`，而 Web Chat strict schema 与
BFF 空 `deliveries` snapshot 尚未协同恢复，不能把旧 Chat 路径视为新 Artifact alias。
Root 真浏览器及跨仓固定来源验收另行记录，不由本仓 contract 测试代替。

## W2-WEB-AGENT-ARTIFACT-F2：作品页消费契约设计基线（2026-09-28；代码前）

唯一机器来源是 BFF main `55d3c9cd55386d9dcc074e893cc388924dd94c13` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`。
Web 当前生成快照仍为 BFF `d5c868f`/SHA-256
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`；本门不复制或手改
owner OpenAPI/generated，也不宣称当前 UI 已使用新 API。后续代码门须从该固定 commit 原字节 pin、确定性
重新生成并用 consumer contract 测试检验源 digest、operation、成功/错误和安全头。

| Browser → Web browser-private                                            | BFF public 与 Web 消费边界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/hub/library?kind=artifact&limit=50[&cursor=opaque]`            | 唯一 `GET /v1/library` / `listLibrary`；`kind` 必填且单值，仅 `file` 或 `artifact`，不接受省略、重复、`all`；作品页固定 `artifact`，`limit` 缺省 50、1–100，cursor 单值 1–4096。当前 subject/tenant 从在线 Product Session/BFF admission 获取，不接受浏览器身份 header/body。200 是 `{data:{items,next_cursor},meta:{request_id}}`；`data` 是**页级** `oneOf`：`items:[]` 空页、1–100 个纯 `kind:file`、或 1–100 个纯 `kind:artifact`。作品页必须拒绝非空 file/混合/坏 item；空页可仍带 `next_cursor`，需继续可见翻页，不与最终空态混同。cursor opaque、绑定 kind/tenant/subject/limit/位置但非快照或许可。                       |
| `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}`         | `GET /v1/library/artifacts/{conversation_id}/{artifact_id}` / `getLibraryArtifact`；只用二元 selector 请求当前已授权详情。200 `{data:LibraryArtifactItem,meta:{request_id}}`；与列表项同身份/字段，运行时严格解析。`asset_id`、hash、`source_run_id`、`content_sha256` 均不得取代二元路径或作为授权。                                                                                                                                                                                                                                                                                                                             |
| `GET /api/hub/library/artifacts/{conversation_id}/{artifact_id}/content` | `downloadLibraryArtifact`；无额外 query/body/客户端 Storage URL。BFF 200 为 `*/*` 原二进制，非 JSON、非 302，长度 `0..1,073,741,824` bytes。Web 只在**此精确 GET** 走专用有界流/真实背压/独立总与空闲 deadline/断连取消，检验 `Content-Type`、十进制 `Content-Length`、安全 `Content-Disposition`、`Cache-Control:no-store`、`Referrer-Policy:no-referrer`、`X-Content-Type-Options:nosniff`、`x-request-id`，最终 Proxy 不得覆盖 `no-referrer`；仅白名单同源返回。浏览器用同源原生 attachment 下载，不以 `fileFetch().blob()` 缓冲 1 GiB；UI 仅报告下载已发起，不宣称本地保存完成。短字节/超限/断流须终止流；下载文件名来自受校验的 owner 头，不执行 header 内容。个人 1 MiB 完整缓冲与通用 Hub 16 MiB/15 秒默认均不放宽。 |

非空 Artifact item 的判别字段为 `kind:"artifact"`，身份 `conversation_id`+`artifact_id`；还包括
`asset_id`、八值 `artifact_kind`、`title`、`filename`、`mime_type`、十进制 `size_bytes`、小写 64hex
`content_sha256`、`source_run_id`、UTC `delivered_at`。Web 映射为单独视图类型，不能 cast 成旧
`ArtifactRecord(content_hash,session_id,...)` 或个人 File。列表/详情/下载每次由 BFF 重验本人 active Conversation
关联及 Storage FINAL/CLEAN；同租户他人/错二元组/不可见统一 404，固定 Product tenant 外 403；401 会话失效，
400 非法 selector/query/cursor，429 准入限流，502 不可信 owner/对象，503 依赖故障或
`artifact_download_busy` 均保留 BFF 稳定错误码与请求 ID，错误不套二进制成功头、不降级旧 hash/preview。
下载前可用二元详情 GET 显示 401/403/404/503 等预检错误，但该结果不是 `/content` 授权，下载时仍重验且可能竞态失败。当前 transport `onData` 直接 enqueue、非 SSE 无独立空闲计时、end 未核 `Content-Length`/`response.complete`；代码门须实现 pause/resume 背压、独立总/空闲计时与短/超字节和完整结束核对。原生 `<a download>` 没有 JS HTTP/保存完成回执，预检后的 content 竞态或下载管理器失败不应被页面伪报为成功；若以后要求可见保存完成状态，应另设计 feature-detect 的流式 File System Access writer 与 fallback。分页错误保留已确认项与原 cursor 供显式重试，不能从 HTTP 200 外或坏 200 构造空列表；下载 503 busy
是进程内两 spool 背压而非客户端获得排队许可。成功/失败均 `no-store`，不暴露签名引用或内部身份头。

Agent live `delivery.created` **已有** `artifact_id/asset_id/artifact_kind`，但 Web 旧严格 Chat schema 会拒它；
BFF 当前 chat snapshot `deliveries: []`。本切片只替换 Library 作品页正式列表/详情/内容路径；Chat delivery、Canvas
及 snapshot/replay 的 schema、恢复和二元导航由后续 owner 协同切换，未切前不能把旧 Chat hash 描述成新 Product API
的别名，也不能以 Library 读取成功证明 Chat 恢复。待作品页新合同/UI/真浏览器过门后删除该页旧
`/api/session/artifacts` 与 hash 内容路径，不留正式双轨；Chat 旧路径有独立删除门。

## W2 个人文件下载 consumer 当前契约（2026-09-28；个人下载真纵切已验收）

Web generated public OpenAPI 已按 BFF main `d5c868f8ab8b8a33750e1286e9d020ca72895641` 原字节固定为
SHA-256 `3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`；Team 派生生成物 drift check 通过。
浏览器仅调用 `GET /api/hub/library/files/{asset_id}/content`；该精确路径校验完整二进制、≤1 MiB、
`Content-Type`、`Content-Length`、`Content-Disposition`、`Cache-Control: no-store`、
`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff` 及安全、有界的 `x-request-id`，只转发窄白名单。Owner 非 200
错误保持错误语义，重定向、缺失/坏 header、短 body 受控失败且不触发保存；404 就近呈现且不泄露归属。
直接 contract/adapter/UI 测试及本仓 Node22 全门已通过；Root 固定 `44ee670f` 的真 Chromium 两次按钮保存原字节、HTTP 安全头及他人同 asset 404 PASS。完整 Product/W2 边仍另验。

## W2 个人文件下载 consumer 设计门历史基线（2026-09-28；代码前）

唯一可编辑 public 机器事实源为 BFF main `d5c868f8ab8b8a33750e1286e9d020ca72895641` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`。该 owner 已发布
`downloadLibraryFile`：`GET /v1/library/files/{asset_id}/content`，`public`/beta、`storage.library.read`、
无幂等键；200 为上限 1,048,576 bytes 的完整二进制，含 `Content-Type`、`Content-Length`、
`Content-Disposition`、`Cache-Control: no-store`、`Referrer-Policy: no-referrer`、
`X-Content-Type-Options: nosniff`、`x-request-id`。BFF 的 400/401/403/404/429/502/503 仍使用 owner 错误
契约；404 不能被 Web 改写为“文件列表为空”。代码前 Web generated 快照 digest 为
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`，本设计门不修改生成物或运行时。

目标 browser-private 请求为 `GET /api/hub/library/files/{asset_id}/content`，无额外 query/body/客户端身份头，
只通过现有在线 Product Session adapter 注入 BFF Bearer；浏览器不接触 Storage reference/签名 URL。
仅该精确路径、GET、成功二进制响应增加上述下载安全头的严格校验与窄透传；既有通用 Hub header 白名单不
泛化，`Cache-Control` 保持 private/no-store 语义，错误响应不带成功下载头。畸形/缺失安全头、坏长度、
意外重定向或未完整取得内容不得进入文件下载；不能仅凭 `Content-Type`（例如用户上传的 JSON 文件）
推断成功或失败。文件卡以已校验个人 GET 项的 `asset_id` 构造路径，
但 BFF 仍须在每次请求重新校验 owner/ASSET/CLEAN，路径值本身不授予访问权。Web 可用已校验列表名称作为
安全锚点文件名，不将 Content-Disposition 当 HTML；下载 Blob 未完整取得前不得宣称成功。

运行状态须区分就近下载中、成功、可重试错误、私有/失效 404 与取消；主动取消回到可操作状态，不当作下载成功；重复点击禁发，切页/卸载取消，
迟到结果不下载或污染别的卡。401/403 不伪装为空页，429/502/503/网络错误由用户明确重试；
不自动走 Artifact hash URL 或 preview fallback。后续代码门须把 Web generated 原字节及 commit/digest
精确重钉、更新直接 contract/adapter/UI 测试，再由 Root 进行真实 Chromium 按钮与原字节验收。

## W2 个人文件上传 consumer 代码片（2026-09-28；历史切片，已由 Root 验收）

唯一 public 机器事实源是 BFF owner `8a90fdd9ec3809000924229bfc7b986ba8ba1522` 的
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`。其
`POST /v1/library/files`（`uploadLibraryFile`）已发布；代码前 Web 只读 generated 快照固定旧 BFF
`a67ae2d`，当前工作树已单轨原字节重钉并更新生成来源/直接 contract 断言。浏览器只调用已存在的
`POST /api/hub/library/files` browser-private 同源 adapter，服务端以当前 Product Session 转 BFF；
不得浏览器直连 BFF/Storage 或自报 tenant、subject、personal scope、project ID。

| 边界 | Web consumer 目标 |
| --- | --- |
| 请求 | 单文件 `multipart/form-data`，恰好一个 `files` part、无额外字段/query；必填每文件意图唯一且重试稳定的 `Idempotency-Key`（BFF 接受 1–191 位、无逗号和周围空白的可打印 ASCII）。`File.size > 1 MiB` 先快速拒绝，剩余文件仍须用原生 Request 的实际**整段** multipart body ≤1,048,576 bytes 判定，不以 `File.size` 单独放行；Web adapter 已为该精确 POST 设置 1 MiB/50 秒，BFF 继续最终校验。 |
| 200 | 只接受 `{data:{file:{kind:"file",asset_id,filename,mime_type,size_bytes,content_sha256,scan_state:"clean"}},meta:{request_id}}` 的 BFF 成功形状，运行时严格校验并核当前文件名/大小；响应无 `created_at`、下载 URL 或 Artifact 字段。随后重新 `GET /api/hub/library?kind=file`；GET 成功才显示权威列表，GET 失败不得把 POST 回执当作持久已列项。 |
| 可恢复 | 网络断开/响应未知、已发请求后的 408/429/全部 5xx（含 `503 library_file_scan_pending`）及 `409 idempotency_in_progress`：保留**同一 File、同一 key**，只在用户明确操作后重试，绝不自动换 key 或宣布成功；扫描待定/幂等处理中显示“稍后同文件重试”，不误报上传失败。401/403 的登录/准入错误不伪造空页或自动重试。 |
| 终态 | `409 idempotency_conflict`、`409 file_upload_aborted` 与 `422 library_file_infected` 对本意图为终态，禁同键重试；400 非法文件/键、413 整体超限须就近显示并修正输入。未知/畸形 200 也不宣布成功，先保留原 File/key 供结果核对/明确同键重试。 |

BFF 每次幂等重放仍须进行当前身份准入；个人 scope 由可信 tenant/subject 派生。Web 不用 GET cursor、内容 hash、POST key 或另一成员的 session 作访问许可；只读个人页与 Agent 作品页维持独立模型。BFF 下载 public 契约已由后续 owner 切片发布，但不属于本上传片；Agent Artifact F2 也不借 Project POST 或作品 hash 下载路径实现。此处是 consumer 行为，不复制 BFF 可编辑 OpenAPI；上传 UI 与 generated 回钉已发布，Root 固定真实 Chromium 上传点击门已通过；Web 下载按钮仍未实现。

## W2 Library 文件 consumer（2026-09-28；已发布的只读基线）

Agent 作品页签继续消费 `/api/session/artifacts` 的 `ArtifactRecord`；Web public 快照
`src/generated/bff-public-openapi.yaml` 已原字节固定 BFF owner
`a67ae2d06b52202f349305ae3723f6e296c087a1` 的唯一 public OpenAPI SHA-256
`82df2303f9f86e9b4caa4b5965f930735740d8c044c955450e45406dc29cabb9`，并通过 Team 生成 drift 检查。

文件页签：浏览器 `GET /api/hub/library?kind=file&limit=50[&cursor=opaque]`，经既有同源
Product Session adapter 到 BFF `GET /v1/library`；`kind=file` 必填，不借无参或 `kind=artifact/all`
语义。BFF 200 为 `{data:{items:[...],next_cursor:string|null},meta:{request_id}}`，单页最多 100；
每项必须是 `kind:"file"`、`asset_id`、`filename`、`mime_type`、十进制字符串 `size_bytes`、
`content_sha256`、`scan_state:"clean"`、RFC3339 `created_at`。Web 以独立 Zod consumer 校验
`unknown`，仅向文件视图投影必要字段；不导入 Artifact 的 `content_hash`、
`session_id` 或下载 URL。`next_cursor` 只作 opaque 分页位置，不作权限；Web 不提供 tenant/subject/scope。

只有有效 200 且 `items:[]` 才显示空态；401/403/429、BFF `400 invalid_library_kind` 或
`invalid_library_page`、`502 storage_response_invalid`、`503 storage_unavailable`、网络故障及坏 200
均显示错误，不降级为 preview 空页、不自动重试。翻页失败保留已确认项并由用户重试原 cursor；
切换页签/卸载取消迟到请求。此只读列表段不覆盖上方已发布但 Web 尚未消费的个人 POST；下载和 Agent Artifact 新 public 列表仍不在本契约，
旧作品页签的 `/api/session/artifacts` 行为不变。此处是 consumer 运行行为，不是第二份可编辑 BFF OpenAPI。

## W1D-WEB-IAM-DIRECT-CUT browser-private 当前契约（2026-09-26，Root 集成待验）

### 切片前 operation 与当前结果

切片前 Web 同时暴露两套名称相近但事实来源不同的 browser-private operation；当前只保留正式 Auth.js 链：

| 切片前浏览器 operation | 切片前实现与语义 | 当前结果 |
| --- | --- | --- |
| `GET /api/auth/session-state` | 读取旧 `kokoro_session` sealed envelope，返回旧会话投影；由 `auth.ts`/`session-envelope.ts` 支撑 | route 已删除，Auth.js catch-all 对 GET/POST 显式 404；不迁移、不留 alias |
| `POST /api/auth/logout` | 读取旧 envelope，经 `KOKORO_IAM_BASE_URL` 直连旧 revoke/logout helper 并清旧 cookie | route 已删除，Auth.js catch-all 对 GET/POST 显式 404；不重定向或兼容 |
| `GET /api/auth/session` | Product Session 的非敏感只读投影；在线核对 Redis generation/expiry，返回 authenticated/subject/expiry，不刷新、不轮换 cookie，响应不含 access/refresh | 保留，request/response、cache 与错误语义不变 |
| `POST /api/auth/session` | Auth.js CSRF 通过后执行 Product Session refresh：读取在线 session，reserve CAS 后经固定 BFF `/iam` relay 单次刷新 IAM token、再经 BFF `/v1/me` 重核 subject/tenant，finalize CAS 成功才推进 generation、写入轮换 cookie并返回新投影；冲突、结果未知或依赖失败保持既有 fail-closed 路径 | 保留，CSRF、reserve/finalize、cookie、响应与错误语义不变 |
| `POST /api/auth/signout` | Auth.js/Product Session 正式退出；同源 Origin + Auth.js CSRF，本地 tombstone 后返回受限 issuer confirmation 导航 | 保留，远端撤销未知和 issuer confirmation 语义不变 |

旧两条 operation 不是 BFF public API，也没有第三方兼容承诺；clean-slate 删除不修改 BFF OpenAPI、IAM
OpenAPI 或固定 relay policy，也不建立新的机器 contract。正式 OIDC callback、`/login`、`/iam/*` 和
`/api/auth/session|signout` 是唯一保留认证链。删除后 Web 不再直接请求 IAM；OAuth/token/revoke/issuer
协议仍只通过固定 `Web → BFF /iam → IAM` 边界。

### 六个同源消费者的保留契约

`sameOriginOk` 已从误命名的 `auth.ts` 迁到单责 `src/lib/server/same-origin.ts`，只改变 import owner，不改变
以下六个 route 的 browser-private HTTP 契约：

| route | guard 适用面与必须保留的行为 |
| --- | --- |
| `/api/session/[...path]` | mutation 才执行现有 guard；Product Bearer、幂等、SSE/cursor/取消、body/response 限额与错误映射不变 |
| `/api/hub/[...path]` | mutation 的 Origin 拒绝与现有 Product Session/BFF 转发不变 |
| `/api/team/[...path]` | 非 GET 的 Origin 拒绝、Product Session 与固定租户权限不变 |
| `/api/scheduled-tasks/[[...path]]` | mutation 的 Origin 拒绝、方法/path 白名单与错误体不变 |
| `/api/billing/checkout` | 写请求的 Origin 拒绝、Bearer/幂等与 BFF checkout 语义不变 |
| `/api/billing/mock-pay` | 开发支付写请求的 Origin 拒绝和既有非生产门不变 |

迁移后的纯 guard 继续按当前契约处理：存在 `Origin` 时必须是可解析且 host 与请求 `Host` 相同；没有
`Host` 才用 request URL host；畸形或不匹配返回各调用 route 既有 403/机器错误；缺失 `Origin` 的处理
保持现状，不在本片发明第二个 CSRF 协议。各 route 已有 method、SameSite、Auth.js CSRF 或业务写入门禁仍各自负责。
浏览器自报 Authorization、tenant、actor、namespace 或 principal 仍不能覆盖在线 Product Session Bearer。

### 失败与验收

旧 route 删除后不代理、不自动重试、不创建 Product Session，也不从旧 cookie 推断认证；正式 session/signout
在 Redis 缺失/故障、旧 generation、tombstone、远端撤销结果未知时继续既有 fail-closed 响应与恢复路径。
本切片不新增 API、错误码、header、cookie、Redis key、缓存或幂等 receipt。

architecture RED→GREEN 已证明活动生产源码不再引用 `KOKORO_IAM_BASE_URL`、旧 auth route 或 sealed
cookie/envelope；六 route 同源守卫与正式 Auth.js session/signout 保留。Node22 `pnpm check`（contract 69、
architecture 36、Vitest 1474、lint/typecheck/build）和独立 dev E2E 11 pass/1 预期 skip 已通过。
Root 固定 SHA 的真实组合验收尚待执行；没有变更 BFF/IAM 机器契约。

## 当前 W1E IAM relay 消费来源（2026-09-26）

Web 固定消费 BFF `1105553cfc24d4f44a90f626132bc30323a77946` policy `2.1.0` 原始字节，
SHA-256 `8f7d4f4cb6fa0ec34d2cce8702d8882d3270a316a6cbdb2d8bdaccefb9c6b4a1`；policy 固定 IAM
`a4c2b61467f1fc1772d6b6d8e98f081c090289fb`，internal OpenAPI `0.6.0` SHA-256
`392ca0e49544c0ec6e0d2fa782c46c33c1847e2c350102e7ad3b8af43f858ced`。route/method/header/cookie/status
及登录、邀请交互的 Web 同源契约均不变；IAM 新增的 Platform 内部 operation 不进入 browser relay。

## W1D IAM relay 消费来源（历史验收）

Web 当前原样消费 BFF main `bc45632b8654db7e06eb9878bb4d7a609d12dc7b` 的 browser-private
policy `2.1.0`，artifact SHA-256 `b18a559d162509c3029908b2e1c77ee7e59ed6af61b82e18be6b2e7669a0ef0c`；
该 policy 固定 IAM main `6a55ffb4c22f0b155ddb83157735c0ace766701d`，内部 OpenAPI `0.4.0`
SHA-256 `a18d57172df841cb2f55aa845a3eeb519ddb5abc8bea1c2be74fbb7e0fb62416`。本次只是来源 commit
和派生 policy digest 重钉；route、header、cookie、预算、邀请操作语义和 Web 对外行为不变。下节目标态
中的旧 pin/“尚无入口”描述是设计时历史基线，当前运行事实以此节与代码为准。

## R5-INVITE-WEB-ENTRY：独立邀请 browser-private 契约（目标态）

当前 Web main `63aca94f93095722425340a0a95985e8796a5b33` 的本地 policy 仍为 `2.0.0`，尚无静态邀请入口；目标只读固定
BFF main `d6dc8a0ea5a3fee7a4f54f01fefdeff0e28892e7` 的
[`contract/iam-relay-policy.json`](../../kokoro-bff/contract/iam-relay-policy.json) `2.1.0`，SHA-256
`b3ff912e70858cc5a5cf7bdbc597c8872ab29c5bfec4dfbe070ce4b37500239d`。其上游 IAM main
`ac94f152daffa2293801ea4f56f98b3ae59452d7`、内部 OpenAPI `0.4.0`/SHA-256
`a18d57172df841cb2f55aa845a3eeb519ddb5abc8bea1c2be74fbb7e0fb62416`。Web 重钉时只复制 BFF
commit blob 快照并机器校验 digest、路由/方法、Location 和四枚举，不手改生成物或维护第二份 IAM 契约。三条 dynamic invitation
operation 是 `browser-private`，绝不并入 BFF public Product `/v1` API。

| 浏览器 → Web | Web → BFF | 准入与响应 |
| --- | --- | --- |
| `GET /iam/interactions/invitation?id=<UUID>` | `GET /iam/v1/tenants/{tenant_id}/invitations/{invitation_id}/context` | 精确单一小写 UUID、无额外 query；tenant 仅来自 server-only 配置。有效 issuer Session 才读取，IAM 只向匹配收件人返回 pending 预览；无 Session 显示独立 issuer 登录/注册表单，不泄露邀请资料。context 返回组织名、角色、到期的 UI 投影，字段形状只以 owner OpenAPI 为准。 |
| 同一静态页面 POST 登录/注册 | 精确 `POST /iam/sign-in/email` 或 `POST /iam/sign-up/email` | 同源 Origin + Web 一次性 CSRF；BFF Web service 身份、无 Product Bearer。注册 body 只能是 `name,email,password,callbackURL`，callbackURL 由 Web 固定 Origin + 当前 UUID 构造，绝不接受浏览器 URL；注册成功只进入邮箱验证等待，不获得 issuer/Product Session。 |
| 同一静态页面 POST 接受/拒绝 | `POST .../{invitation_id}/accept` 或 `/reject` | 当前 issuer Cookie、固定 tenant/UUID、同源 Origin、Web 一次性 CSRF；上游无 query/body/Authorization/Idempotency-Key。accept 200 才可导航 Product `/login`；reject 200 仅本页完成。 |
| `GET /iam/verify-email?...` 的 302 | Web 同源页面 Location | BFF `invitationLocation` 只允许 `/iam/interactions/invitation?id=<canonical UUID>`，或其后单个 `&error=TOKEN_EXPIRED\|INVALID_TOKEN\|USER_NOT_FOUND\|INVALID_USER`；Web 只用固定安全文案显示错误，拒绝外域、额外/重复/编码 alias 与任意重排。 |

现有 `/iam/[...path]` 仍只有固定静态 issuer GET；静态 Web invitation route 不被视为 IAM API。`/auth/sign-in` 是 OAuth
签名交互，不是邀请登录别名；`/login` 是 Product RP 入口，不负责未入组者首登。Web 不接受浏览器指定 tenant、actor、
recipient、service secret、Origin 目标或 callbackURL；issuer Cookie 只走 BFF policy 白名单及 `Path=/iam`，Product/Auth.js Cookie 不转发。
请求/响应限额、deadline、原生 Cookie、错误码/状态与 Location 仍以固定 BFF policy、IAM OpenAPI 和本仓唯一运行时门禁为准，
本文不复制一份可编辑 DTO。context 404 不区分错人/不存在/终态；过期/停用按 IAM 稳定 code 局部反馈。所有页面、POST
与本地拒绝均 `Cache-Control: no-store`、`Referrer-Policy: same-origin`、受控 `x-request-id`，不向跨站请求发送邀请 URL，
并让浏览器同源表单 POST 保留可严格校验的 `Origin`；不回显验证 token、密码、
Cookie、原始上游 message/details 或完整 query。429 可按受控 `Retry-After` 局部提示；未知写入结果不自动重试，也不凭终态
404 推断曾接受成功。验收必须覆盖准确机器来源、精确路径/方法、CSRF 重放与身份/租户负例，以及真实三仓 HTTPS/SMTP/Chromium。

## W1C 固定租户 Web consumer 目标（2026-09-24 设计门）

当前 `/login` 成功只作同源 302，不呈现连接/整页重试 UI；浏览器
`/api/team/switch` 与可见 Team 切换器已删除。`/auth/select-tenant` 保留无状态
302 以使 `Path=/iam` issuer cookie 到达内层；内层 GET 仅使用 server-only
`KOKORO_TENANT_ID` 完成 signed continuation，不显示选择表单，不开放浏览器
POST 或 `/iam/organization/list`。Web code callback 与 refresh 已消费 BFF owner 发布的
固定版本 `GET /v1/me` 当前身份投影，验证 subject、tenant 与部署配置后才建立
可用 Product Session；BFF 公开契约为 `{data:{user_id,tenant_id},meta:{request_id}}`，
OpenAPI SHA-256 `75ab482132602bd1d7ce77dbec1423b10d4ce7a8244ad284ecac78cd4e7b50ca`。
Web 严格拒绝额外/缺失字段、非 JSON、非 200、超限、超时和取消；callback 拒绝不创建
Product Session，refresh finalize 前拒绝会撤销 pending record，不回退旧 generation。调用只发送
一个当前 user Bearer、固定 Web service identity 与受信 `Forwarded`，不向浏览器暴露上游正文或凭据。
删除旧 Team switch mutation/可见切换器，不能从浏览器 body/header 指定 tenant。
失败只给有界机器错误，不跳转到任何整页重试或假登录页面。现有历史小节描述
原发布版本，不作为新 consumer 的并行实现依据。

Web 当前固定消费 BFF `dd605c99e9bb5c6669ec31e04e285e5f92b79ed0`
policy `2.0.0`，artifact SHA-256
`74893ba4e566e4824a278cd3ee1548030a33435f9b37b7026a8a7e943c080037`，
IAM owner `ad5224a9e0a3a31d1c593d214d37940d6923b2e7`；仅来源重钉，policy
版本、route/method/header/cookie/限额及 Web 运行语义不变；
`/organization/list` 已删除。下文旧 policy 1.x/候选列表/tenant 表单是历史发布记录，
不表示当前仍可访问。

公开页面路径：`GET /` 是固定单租户营销首页，`GET /login` 是不依赖 System runtime manifest 的服务端 Product RP OIDC 启动路由（成功 302 到同源 IAM authorize，不渲染中转页）；`/app` 要求在线 Product Session；System runtime manifest 是可选展示数据，不决定访问权或 live/preview transport。`/auth/sign-in` 是 IAM issuer 签名交互路由，只有有效签名交互才呈现真正邮箱/密码表单，不能当作静态营销别名。公开首页/登录入口不调用 `/api/system/runtime-manifest`；`/login` 在服务端经 Auth.js CSRF 启动固定 OIDC provider，失败返回无自动循环的 503；此入口行为不改变 token、cookie 或 BFF/IAM owner API。

当前签名表单 GET 在 Web Proxy 签发原有 Cookie-bound 一次性 CSRF 后内部渲染 React/shadcn 页面；`/auth/sign-in/form` 不对浏览器开放。浏览器 POST 仍提交原始 `/auth/sign-in?{signed-query}`，字段、同源 Origin、issuer Cookie、CSRF 与 BFF→IAM 两步调用不变。HTML 模式的 401/429/503 改为 303 回原签名 URL：短时加密反馈仅传受控错误码/邮箱、不传密码或上游正文；新 GET 签发新 CSRF 并在同一表单就近提示。非 HTML 客户端仍按原错误状态与 envelope 返回；成功继续采用受限同源 Location。页面与资源的 Referrer-Policy 为 `origin`，不向资源请求带签名 query。

状态：browser-private 治理基线与 W1C-2 当前/目标契约，2026-09-23；W1C-2A 只读 GET relay、
W1C-2B-1 sign-in、W1C-2B-2 tenant/consent、2C RP-only 与 S1 Product Session 已发布，S1 真实三仓 HTTPS 组合已通过。
普通 `/v1` Bearer adapter 与 UI Product 登录/探针/退出已由 S2-A 切换；S2-A 真实三仓组合已验；两个旧 magic-link browser route 已删除，其余旧认证/Team 路径删除未完成。

## R2e-IAM-VERIFY-WEB：邮箱验证 browser-private 增量（本提交已实现，真 IAM 待验）

起始 Web `main` 基线 `0a093f65bdc4990b956b10ae534198e3b4b5c3b5` 消费 BFF policy `1.0.0`、
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`，artifact SHA-256
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；其浏览器 GET
白名单缺 `/iam/verify-email`。BFF owner `main` `dadf9264116ea9df2c0886c4af84bacb67aa6e41`
当时发布 `contract/iam-relay-policy.json` version `1.1.0`、SHA-256
`97022ea8727619bae03927027ef6a8ce87a3d2da4580ba5d211dc63b16fdc42c`；Web 该历史切片只读重钉
该 blob 与 commit，不编辑 BFF policy，不建立第二份可编辑 IAM contract。IAM owner
`b363554d07e5b6e182160b42ae1402330e55d9db` 拥有 Better Auth 1.7.3 验证 token/邮箱状态，
Web 不解释 token 或验证结果。此增量是 Web `browser-private`，不进入 BFF public `/v1` OpenAPI。

| Web 已实现 operation | 请求与原生响应 |
| --- | --- |
| `GET /iam/verify-email?token=...&callbackURL=...` | 仅此精确路径与 GET；Next 规范化后恰好一个非空 `token`、最多一个 `callbackURL`，重复或额外键在 Web 本地拒绝，零 BFF socket。纯函数拒绝其输入中的编码键名；真实 Next 可将 `%74oken` 规范化成相同 `token`，唯一键可接受，与字面键并存则按重复拒绝。Web 只保证支持形状的键值语义，BFF 保持收到的 Web URL query。`token` 为 IAM 有期签名 JWT；`callbackURL` 不是 Web/BFF 对上游或 `Location` 的授权，Web 不解释/记录 token。错误方法、路径编码 alias、畸形/超限 query 不形成 BFF socket。 |
| IAM 原生 200/302/失败 | 原生 status/body 与已允许 header/cookie 保持；302 `Location` 必须通过现有固定 Web origin、精确已批准路径检查，`/auth/sign-in` 是邮件 bootstrap 指定的返回路径，外域/任意新路径拒绝，不自动跟随。此精确路径的浏览器响应（含 Web 本地拒绝/上游失败）无论上游缺失或给出可缓存 `Cache-Control`，Web 固定覆盖为 `no-store` 并合成 `Referrer-Policy: no-referrer`；其他 GET 不变。 |

BFF policy 的 `responseHeaders` 仍不含 `referrer-policy`；BFF 对此敏感 GET 虽已合成
`Cache-Control: no-store`/`Referrer-Policy: no-referrer`，Web 不能依赖普通 header 白名单透传后者，
也不应为它泛化白名单；Web Route Handler 在已准入路径合成，最终 `src/proxy.ts` 在通用安全头后
对精确 pathname 再覆盖，保证 Next 最终浏览器响应而非仅 helper 对象满足契约。浏览器入站
`Authorization`、Product Session/Auth.js cookie、任意身份 header
不能作为 IAM 凭据；仅已有 issuer cookie 过滤继续有效。Web 自有拒绝维持受控 code、`x-request-id`、
`no-store`/`no-referrer`，不泄露 query、token、原生错误 body。该 GET 不生成 Product Session、Web Redis key、SQL、
receipt 或缓存，不增加 POST、sign-up、组织写入和通配 `/iam/*`。验证先以固定 artifact digest/provenance
及 contract/architecture 测试拒绝来源漂移，再用 unit/真实 Next HTTP 覆盖支持的 query 形状、同源 302、
缺失/恶意缓存头、外域/编码/错方法零上游；真实 IAM 邮件点击及浏览器 Referer 由 Root 组合门另验。
Next 开发模式的 `logging.incomingRequests.ignore` 仅精确抑制 `/iam/verify-email`（含 query）的
框架 stdout 请求行；不改变其他路由日志，也不是 TLS 前置 access log、浏览器历史或邮件系统的保密声明。

## W1C-2：同源 IAM 与 Product Session 契约（S1 已发布并完成三仓组合）

### 版本、来源和可见性

当前 Web 仍有 IAM magic-link/team-session 直连和旧 sealed session；2A 只读 `/iam`、2B-1 sign-in POST、2B-2 静态 `/iam/interactions/*` POST、2C Auth.js Code+S256 RP-only 与 S1 均已发布。S1 成功 callback 后建立在线 Product Session，提供标准 `GET/POST /api/auth/session` 与 `POST /api/auth/signout`；session GET 只在线核对并返回 authenticated/subject/expiry，不回 access/refresh、不刷新或轮换 cookie。session POST 要求同源 Origin 与 Auth.js CSRF，并按 reserve CAS → 固定 BFF `/iam` relay token refresh → BFF `/v1/me` 身份重核 → finalize CAS 执行刷新，只有 finalize 成功才推进 generation、轮换 cookie并返回新投影。普通 BFF `/v1` adapter 已在线核验 Product Session generation 并仅发送一个 access Bearer；S2-A 的真实三仓业务代理链仍待验收。
BFF relay 在 W1C-2 起始基线固定来源 `eb1eb2926d08b8a3779898b2c31e604a8585ec8b`，其
`contract/iam-relay-policy.json` version `1.0.0` 当时 blob SHA-256 是
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`，
引用 IAM owner `e36da9ecf8d62a364182949817431a8e2329d50a`、allowlist SHA-256
`f63dacfa8a7bcec3c56efb8ffb762a3f8bd82bb380eff40a1462db1e77d61ead` 与 snapshot SHA-256
`b2eac1919e16fdc30a40bee0f3c4300b641bd8f674214aea7731bf10299559e1`。IAM test-only fixture
已随 BFF repin 发布；W1C-2A 已 vendor **只读** policy snapshot。Web contract test 对 snapshot 原始
字节计算固定 digest，并校验 provenance、只读路由子集、结构不变量与篡改负例；Root 的跨仓门另从固定
BFF commit blob 比对同一字节，Web 仓不把本地副本自比冒充源 commit 证明。真实 Web→BFF→IAM 与
Auth.js S1 真实 IAM 组合已通过；S2-A 普通业务代理的真实组合待验。Web 不重建/维护 IAM OpenAPI、BFF Product OpenAPI 或 BFF policy 的第二事实源。

`/iam/*` 是 Web 拥有的 `browser-private` **原生 OAuth/OIDC 传输边界**，不是 BFF `/v1`
Product API，也不进入 Developer API。`/api/auth/[...nextauth]` 是已发布的 Auth.js RP transaction/callback 与 S1 session/signout
入口；`/auth/sign-in` 是 Web 表单，`/auth/{select-tenant,consent}` 是 IAM 外层引导，真正表单位于
`/iam/interactions/*`。普通 `/api/*` 是 Web 的 browser-private
Product projection，最终请求 BFF `/v1/*`；IAM 所有 endpoint 语义、字段、OAuth 错误和 cookie 仍由 IAM
发布的协议定义，Web/BFF 不包装成 `{data}`/`{error}`。Web 本地准入拒绝可以使用安全机器码和
`x-request-id`，不得泄露 token/secret/原始 provider body。

W1C-2C 第一切片的**历史 RP-only 契约**：当时 RP callback 即使完成 code、ID token 与 userinfo 验证，也只返回受控
`503 product_session_unavailable` 并清除 RP 事务；不签发可用 Auth.js/Product Session cookie，
不透出 token、userinfo 或 callback code。这不是首次登录完成。server-only Basic token POST 与
Bearer userinfo GET 只能经固定 BFF `/iam` relay；浏览器直打仍本地拒绝。S1 已替代成功 callback 的固定 503，建立 Product Session 并实现 refresh/signout；普通 `/v1` Bearer 代理已由 S2-A 完成；旧路径删除仍属 S2-B。
Browser-private RP 入口只接受单 provider 的 Auth.js CSRF 获取、受控 signin POST 与固定 callback GET；
精确同源 Host/Origin、方法、body/query 长度及重复键先校验，浏览器不能覆盖固定 `client_id`、
`redirect_uri`、`scope`、`resource`、`callbackUrl`。authorize 与 token 各恰好一个固定 internal
resource；token 使用 `client_secret_basic`，userinfo 使用 server-only Bearer 且不发送浏览器 cookie。
R5-Web-Team-Product 前置切片的固定申请 scope 为
`openid profile email offline_access iam:session-authorization.verify iam:member.read iam:invitation.read iam:role.read iam:member.write iam:invitation.write`；
保留既有顺序，在三个 Team 只读 scope 后仅追加 IAM `ad5224a` 授权的两个 user-delegated 写 scope。
Auth.js authorization Location 的 scope 必须完整、顺序一致且仅出现一次；缺项、重复或额外 scope 均拒绝。
这是 Web 申请边界，不替代 IAM/BFF 的授权验证；旧 Team UI/API 仍待独立原子替换。
state/nonce/PKCE 与 ID token issuer/audience/signature 在 code exchange 前后分别验证，userinfo
`sub` 必须等于已验证 ID token 的 `sub`；Redis state 原子一次消费，错误/失联只返回安全码。
ID token 算法固定 `EdDSA`（Ed25519），RS256 即使有合法 JWK 也拒绝。BFF token/userinfo/JWKS
backchannel 各有绝对 5 秒及响应头/正文 1 MiB 上限，超限/慢滴流关闭连接；不放宽 BFF 固定 policy。
浏览器 callback 断连时 Web 将 `request.signal` 传播到当前 BFF 请求并销毁 socket，不继续 JWKS/userinfo。

### `/iam` 固定 route/method 与 HTTP 语义

仅消费最终固定 BFF policy 的如下**精确** route/method；路径前缀是 Web/BFF 的 `/iam`，表内是
policy 的 relative path，不扩张为任意 catch-all：

| Relative path | Methods | 用途与入站凭据 |
| --- | --- | --- |
| `/.well-known/openid-configuration`、`/.well-known/oauth-authorization-server`、`/jwks` | GET | issuer discovery/JWKS；无浏览器 Authorization |
| `/oauth2/authorize` | GET、POST | Code+S256；issuer cookie；POST 同源 CSRF |
| `/oauth2/token` | POST | 仅 Web server 生成 Basic，code/refresh 与单一 resource；无浏览器 cookie |
| `/oauth2/userinfo` | GET | 仅 Web server 生成 Bearer；无浏览器 cookie |
| `/oauth2/revoke` | POST | 仅 Web server 生成 Basic；无浏览器 cookie |
| `/oauth2/end-session` | GET、POST | issuer cookie；POST 同源 CSRF |
| `/oauth2/end-session/confirm` | POST | issuer logout-confirmation cookie；同源 CSRF |
| `/sign-in/email`、`/sign-out` | POST | issuer cookie；同源 CSRF |
| `/get-session` | GET | issuer cookie；仅 IAM 交互状态，不是 Product Session 授权；`/organization/list` 已从 Web relay 删除 |
| `/organization/set-active`、`/oauth2/consent`、`/oauth2/continue` | POST | issuer cookie；同源 CSRF |

W1C-2B-2 的 `/auth/select-tenant|consent` 只准严格同源 GET 且保持原签名 query，302 引导到
Web-owned 静态 `/iam/interactions/select-tenant|consent`；外层 POST 405。issuer cookie 的 IAM
原生 `Path=/iam` 在内层才被浏览器携带；CSRF cookie 与 POST form 也只绑定内层路径。
四条交互 route 显式拒绝 HEAD/OPTIONS 为 405，不生成 CSRF cookie/Redis nonce，不触达 BFF；
真实入站 method 还在共用 guard 与 handler 预期 method 精确比较，不能借框架派发复用 GET/POST。
内层 select-tenant GET 只把受信 BFF `/iam/organization/list` 的 active
组织作为候选，POST 绑定候选集并重核，调用固定 `/iam/organization/set-active`；内层 consent GET
仅展示未验签的 signed-query `scope` 预览，POST 无浏览器 `scope` 字段，仅明确 Agree 后将 query
原样交 IAM `/iam/oauth2/consent`，签名与 scope 子集由 IAM 验证。两页的 200 redirect JSON/302
仅转成白名单交互 Location 与合规 issuer cookie；401/429/5xx body/cookie 不透出。最终 callback
在 2B-2 基线上，`/api/auth/callback/kokoro-iam` 尚未安装，匹配该目标返回受控 `503 rp_callback_unavailable`；
当前已安装固定 callback；按 IAM 实际成功响应仅将严格同源、唯一 `code/state/iss`
且 `iss=${KOKORO_WEB_ORIGIN}/iam` 的 Location 交给浏览器，完整 query 由 RP 验证型 callback 再核 issuer。后续 RP
2C RP-only 基线验证成功仍只报 `503 product_session_unavailable`；当前 S1 验证成功建立 Product Session、清 RP 事务 cookie 并 303 到 `/app`，仍不把 token 发给浏览器。S1 真实三仓链已验；S2-A 普通业务代理组合已通过固定三仓真 HTTPS。

上表是 W1C-2B 的完整固定 policy。已发布的 W1C-2A `/iam/[...path]` Route Handler 只安装 GET
`/.well-known/openid-configuration`、`/.well-known/oauth-authorization-server`、`/jwks`、
`/oauth2/authorize`、`/get-session`、`/organization/list`；S1 另安装固定 `client_id`/`post_logout_redirect_uri` 的 `/oauth2/end-session` GET，以及只接收 `action=confirm`、精确同源 Origin、IAM 签名 confirmation cookie 的 `/oauth2/end-session/confirm` POST。直接 owner POST、浏览器 userinfo Bearer 和其他动态路由仍在 Web 本地 fail closed。本片静态 `/iam/interactions/*` 是 Web 自有表单而非 BFF
catch-all 例外；callback/post-logout 传输在 2B-2 尚未安装。2C 只在 RP callback 真正安装并通过
严格 Location/签名交互与 code 测试后，将 consent 的固定 callback Location 交给浏览器；
S1 已安装受限 post-logout 确认流程，callback 验证成功建立 Web Product Session；其余动态路由仍关闭。

W1C-2A 拒绝 magic-link alias、任意 `/internal/v1`/admin/dynamic-client CRUD、未知方法，以及 handler
可见的大小写/encoded route alias；本地拒绝不得开启 BFF/IAM socket。真实 Next HTTP 探针证明 dot 与
encoded-dot 输入在 handler 前规范化为同一 canonical resource，双斜线由 Next 返回 308 canonical
Location，编码 route 名返回 404；这些框架行为不扩张 Web allowlist、身份或泄露响应。上游 Location
仍在 URL 解析前拒绝 `%`、dot segment、双斜线与 backslash。Web 固定 BFF origin、service identity
和受控 header/body；丢弃入站 browser Basic/Bearer、Forwarded、`x-kokoro-*` 自报身份，
不将 Auth.js/Product Session cookie 发给 BFF/IAM。仅 issuer snapshot 中的完整 cookie 名允许通过：
`kokoro-issuer.{session_token,session_data,dont_remember,session_token.oauth_logout_confirmation}`，
production 使用 `__Secure-kokoro-issuer.` 前缀。普通 cookie `Path=/iam`；logout-confirmation cookie
仅 `Path=/iam/oauth2/end-session/confirm`。多 `Set-Cookie` 不能合并；未知名称、Domain、路径或属性拒绝。

代理保持 IAM 原生 status/body、合法 Location、Cache-Control、Content-Type、429 Retry-After、logout
Content-Security-Policy/X-Content-Type-Options/Pragma 和精确 Set-Cookie，不自动跟随 redirect。
唯一浏览器导航适配是 `GET /iam/oauth2/authorize` 的 IAM 200 `application/json` 精确
`{redirect:true,url}`：先经原生响应 header/issuer cookie 校验，再按已存在的固定同源交互/严格 callback
Location 白名单验证 `url`，转无 body 302；其他 `/iam` JSON、非法 shape/URL、错误 status 不作重定向，
非法 authorize continuation 返回无上游 body/cookie 的 502。该适配不新增 BFF/IAM contract 或可编辑 policy。
固定 policy 的 Location 只允许固定 `KOKORO_WEB_ORIGIN` 下已安装的只读 `/iam` route，或固定的
`/auth/{sign-in,select-tenant,consent}` 目标路径；后两者现在先经无状态同源 302 到静态
`/iam/interactions/*`，浏览器才会携带 IAM `Path=/iam` issuer cookie。callback 与 post-logout
Location 在 2B-2 基线尚未允许；当前仅允许安装后的固定 callback URI/唯一
`code/state/iss`，其中 `iss` 精确等于固定 Web issuer；缺失、重复、错误或额外键拒绝。
合法 IAM 已签 query 只作为 opaque continuation 保留，
不当作 Web 自报授权。不可信 Location/Set-Cookie 必须在输出前拒绝。policy 最大
query 8192 B、request body 65536 B、header 16384 B、response 1048576 B、duration 5000 ms；
Web 限额不得高于这些值，并传递取消。`KOKORO_WEB_ORIGIN` 是 server-only 固定 HTTP(S) origin，缺失或
非精确 origin 时 relay 503；入站 Host 必须精确等于配置 host，GET 若有 Origin 必须等于配置 origin，
POST 必须携精确 Origin，否则在连 BFF 前 403。反代后的 Next handler URL authority 可为内部
`localhost:<port>`，不作为公开 origin 判据；不采信 `Forwarded`/`X-Forwarded-*` 作为替代身份。
W1C-2A 的 GET 必须无 body：非零/异常 `Content-Length`、任意 `Transfer-Encoding` 或 Fetch Request 可观察
body 均在连 BFF 前返回 400；真实 Next HTTP 测试覆盖无 Content-Length 的 chunked GET body。
所有浏览器 cookie mutation
缺失/`null`/错误 Origin 或 CSRF 证据都拒绝。Web-rendered `/auth/sign-in` 以及静态
`/iam/interactions/{select-tenant,consent}` GET
为目标 POST path、IAM 交互和短 TTL 生成随机 CSRF 值，分别放入 Web HttpOnly cookie 和隐藏 form 字段；
其摘要/绑定存 Web Redis 短 TTL key，POST 时原子一次性消费，Redis unavailable 拒绝；
浏览器表单 POST Web-owned Server Action/Route Handler 时，Web 在连 BFF 前验证 Origin、双值、
交互绑定与一次性消费，按 IAM 机器契约构造 `/iam/sign-in/email|organization/set-active|
oauth2/consent|oauth2/continue` 原生 body，Web CSRF 字段不传 IAM；IAM 已签 query 与 issuer cookie
原样续接。浏览器直 POST 上述 `/iam` 路由无 action 证明则拒绝。其余允许的浏览器 `/iam` POST
（authorize、sign-out）须
有等价 Web 表单证据，或经真实 wire 证明 IAM 原生 CSRF 生成/携带/校验，再叠加 Web Origin；否则拒绝。
`end-session/confirm` 已单独核对 Better Auth 1.7.3 原生 signed confirmation cookie、session/TTL 绑定；Web 再限制精确 Origin/Host、固定 form 与 cookie 路径，不作为通用 POST 例外。
Auth.js 自身 action 的 CSRF token 与同源 Origin 叠加校验；普通业务 cookie mutation 使用 Web 自有
CSRF 防护。server-only token/revoke 路径的 Basic 只来自 Web 受信代码；
BFF 验 Web service 身份但不假设同一 secret 能判断 Basic 最初是否来自浏览器。

### RP、Product Session 与普通 `/v1`

Auth.js RP 配 Code+S256 PKCE、state、nonce；IAM client 由 operator 创建/readback，必须是
`user_delegated`/`client_secret_basic`、`require_pkce=true`、`enable_end_session=true`、精确 callback/
post-logout URI、`openid profile email offline_access iam:session-authorization.verify` scopes、
internal resource binding。`IAM_ISSUER_URL` 与 discovery issuer 精确相同。authorize/token/refresh wire
均须恰好一个 `resource=https://kokoro.dev/resources/iam-internal`；浏览器参数不能覆盖它。Auth.js v4
默认 token request 不视为已覆盖，此点须在真实 HTTP 检查请求体/Bearer audience/BFF admission。

Product Session 是 Web server-only：Auth.js 加密 HttpOnly cookie 只含随机 session ID、generation、
当前 access 与必要 RP 退出提示，**不含 refresh**；固定 `KOKORO_WEB_ORIGIN` 为 HTTPS **或** Web 运行于 production mode 时，Product cookie 创建/refresh/清除均带 `Secure`，不借 IAM issuer 的 production cookie 模式决定；公开 session callback 不输出 token。Web Redis 隔离
record 保留 Web 密钥加密的当前 refresh、固定到期及 `active(g)`/`refreshing(g,reservation,deadline)`/
`revoked`。每请求先在线比对 generation/tombstone。refresh 的第一 CAS 只允许一位赢家从 active 预留，
由赢家向 IAM 发起至多一次固定 Basic/resource exchange；第二 CAS 仅在 reservation、deadline、未撤销
仍成立时提交新加密 refresh 与 `active(g+1)`，随后才发新 cookie。败者只拒绝本请求，不撤销赢家、
不清其 cookie、不请求 IAM；pending、旧 generation、replay、结果未知、Redis unavailable 均明确拒绝；reserve 后密文 AAD 解密损坏尽力按 reservation tombstone，Redis 故障仍 fail closed；
不回退旧 active/sealed cookie，也不依赖 issuer replay 窗口。未决 reservation 到期仅撤销。refresh wire 对 access UTF-8 ≤2048 B、refresh ≤8192 B、整数 `expires_in` 1–3600 s 校验；Product JWE Set-Cookie 完整字节 ≤4096 B，callback 在 Redis 创建前、refresh 在 finalize 前预检，超限不推进 generation。Product 成功 GET/refresh/signout 带随机 UUID `x-request-id`。finalize
成功但新 cookie 交付未知，或 finalize ACK 未知时不发送新 cookie；即使 Redis 已提交新 generation，
旧 g 仍拒绝，须重新登录，无客户端可达的 active record 由 TTL 回收。普通受保护 BFF `/v1` 代理只注入从当前
Product Session 读取的**一个** `Authorization: Bearer` 与 Web service identity；不再发送
`x-kokoro-namespace`/`x-kokoro-principal-id`，也不相信 body/query/header 中的 tenant/actor。
logout 以可信解封的 session ID 与 cookie generation 原子 compare-and-tombstone；若当前 record generation 不匹配，旧 cookie 调用不发送 Product `Set-Cookie`（否则乱序响应可能删除新 cookie），HTTP 200 返回精确 `{ "status": "stale_session", "remote_revocation": "not_required" }`，旧 cookie 仍被在线 generation 校验拒绝；不写 tombstone、不删除当前 record、不请求 revoke，也不返回 `issuer_session`/`issuer_end_session_url`。**仅匹配 generation 的 active 记录**
同时 take 已确认当前的加密 refresh，并单次有界尝试 IAM revoke；issuer end-session 是单独的浏览器确认流程，不由 refresh revoke 代替。refreshing/pending 记录
只 tombstone，绝不 take/发送可能已轮换的旧 refresh；报告远端撤销未确认。记录缺失也建覆盖最大会话/
在途窗口的 tombstone，迟到 finalize 不可复活；重复 logout 不重复远端 revoke。清 cookie；active
状态的远端失败报告未确认，写入 ACK 未知则清 cookie 只能报告本浏览器清除，不能报告服务端撤销。
不把旧 refresh 的 revoke 当作幂等或单设备操作；其可能影响同 client/user family 且返回 400。
无持久补偿队列，远端未确认仅靠 IAM owner TTL 兜底。 `POST /api/auth/signout` 返回 `issuer_session=pending_browser_confirmation` 与固定同源 `issuer_end_session_url`，URL 仅含注册的 `client_id` 和 `post_logout_redirect_uri`，无 ID/access/refresh token；该响应不表示 IAM issuer 已退出。浏览器 GET 确认页取得 IAM 签名、限定 `Path=/iam/oauth2/end-session/confirm` 的 confirmation cookie，随后以精确 Origin 和 `action=confirm` POST 专用路由，IAM 验签及 TTL/session 绑定后清除 issuer session 并重定向 `/auth/sign-in`。confirmation cookie 不透传其他 GET/POST；错误 Origin、额外参数、错误 form 或非法重定向在 Web 拒绝。确认表单限 1024 B、应用读取 5 秒硬截止；Next 在 body 未到齐前的缓冲不算 handler 已响应。
service-only runtime manifest 与公开 Share 按 BFF owner 明确边界运行，不伪造用户凭据。BFF 自己验证
IAM admission、resource/tenant 业务授权；Web session UI 不构成 owner 授权。

旧 `/api/auth/magic-link/request` 与 `/api/auth/callback` 已删除，不保留 alias 或失败重定向；
`/api/auth/logout`、`/api/auth/session-state`、旧 `/api/team/*` magic-link/team-session、
`/auth/refresh`、旧 sealed-envelope/nonce 与 IAM 直连仍待后续 clean-slate 切片删除或按上述 route 替换，
不留 fallback 或双轨 cookie；
2C RP 验证片不删除这些仍被旧调用点使用的路径，也不将其视为新 RP 授权。既有 Product request/
response、幂等 key、SSE/AG-UI 仍服从 BFF `/v1` owner contract；`/iam` 原生协议不套用 Product
JSON envelope、Product idempotency receipt 或分页。

### 验收矩阵

W1C-2A 的 `pnpm contract` 检查 snapshot 固定 digest/provenance/invariants/tamper，route/server 测试检查
只读路由正反例、cookie/header/redirect、固定 public origin、限额/timeout/cancel；真实 Next HTTP 测试记录
canonical、evil Host、dot/encoded-dot canonicalization、双斜线 308 和编码 route 404。Root 跨仓门负责
固定 BFF commit blob 的源字节比对。W1C-2B 再补 Origin/CSRF、普通 `/v1` 单一 Bearer 与零自报身份；
`pnpm lint`、`pnpm typecheck`、
`pnpm test`、`pnpm build`、`pnpm test:e2e` 覆盖实现及浏览器状态。Root 隔离真实 Web→BFF→IAM
HTTP/Browser 证明首次 sign-in、tenant/consent signed query、callback code 单次使用、refresh rotation
并发、logout/revoke、跨 tenant/同 tenant 其他用户 404/403、IAM/Redis 失联、429、安全 header、
无 credential 泄漏。IAM fixture/BFF repin 虽已发布，Web consumer 与真实组合仍为**待验**；登录边界完成
不等于 W1D Product generated consumer/AG-UI edge 完成。

## 1. Visibility 与发布边界

本仓所有浏览器同源 `/api/*` 都是 `browser-private`。它们由 `kokoro` 拥有，只用于当前 Web 与
同一部署中的 server adapter 协同升级，不承诺第三方兼容性，也不进入 Developer API 门户。

只有 `kokoro-bff` 自有、标记为 `public` 的 Product API 可以进入 Developer API。Web 文档可以链接
固定 BFF artifact，但不得复制一份可编辑 OpenAPI、发布内部 route，或把 browser-private DTO 宣称为
公开 API。

## 2. 调用拓扑

```text
Browser /api/*                         browser-private
  -> Web same-origin adapter
  -> kokoro-bff /v1/*                  BFF-owned Product API
  -> owner APIs / Agent / Scheduler    internal-owner or event-protocol
```

终态不允许 Web 直连 IAM/System/Agent/其他 owner。当前认证 helper 仍直连 IAM，是已登记迁移缺口，
不是新的允许例外。

## 3. 当前契约来源

| 来源 | 用途 | 权威性 |
| --- | --- | --- |
| `src/app/api/**/route.ts` | 实际注册路径、method、header 与 projection | 当前运行事实 |
| `src/contract/*.ts` | Zod request/response、path helper、AG-UI narrowing | 当前 runtime contract source |
| `contract/api-contract.test.ts`、`tests/contract/` | 正向、拒绝、路径和 event 回归 | 可执行约束 |
| `docs/integration/*.md` | 细节与历史上下文 | 次级参考；可能滞后 |
| `src/generated/proto/*` | 旧 Root source 生成的 consumer snapshot | 冻结历史；当前不可再生、未被 runtime import |

本仓没有活跃的 `contract/openapi/` 或 generator。不得手改 `src/generated/proto/` 使其看似当前；若
重新引入生成流程，source、生成器、固定工具版本、digest、breaking check 和 CI 必须一起落在正确 owner。

## 4. Browser-private route 分类

| 浏览器路径 | 当前用途 | 目标上游 |
| --- | --- | --- |
| `/api/session/*` | Chat snapshot、command、control、AG-UI SSE、artifact/share | `kokoro-bff /v1/*` |
| `/api/hub/*` | Skills、MCP、Projects 的历史 browser alias | `kokoro-bff /v1/{skills,mcp,projects}/*` |
| `/api/agents/*` | Agent connection setup 投影 | `kokoro-bff /v1/agents/*` |
| `/api/scheduled-tasks/*` | Scheduled typed adapter | `kokoro-bff /v1/scheduled-tasks/*` |
| `/api/billing/*` | Billing catalog/checkout 投影 | `kokoro-bff /v1/billing/*` |
| `/api/system/runtime-manifest` | 当前产品/surface 的 manifest | `kokoro-bff /v1/system/runtime-manifest` |
| `/api/shared/*` | 公开 share 投影 | `kokoro-bff` owner route |
| `/api/auth/magic-link/request`、旧 `/api/auth/callback` | 已删除的 magic-link 申请/消费端点 | 不保留 route、alias 或 `/login?auth=` 失败跳转；固定 OIDC `/api/auth/callback/kokoro-iam` 仍归 Auth.js `/api/auth/[...nextauth]` |
| 旧 `/api/auth/logout`、`/api/auth/session-state` | 仍在的旧 sealed session 退出/状态 | 后续 clean-slate 删除；Product Session 已由 Auth.js browser-private action 承接 |
| `/api/team/*` | 当前仍有 Team context/成员邀请等路径；`/api/team/switch` 已删除 | 固定 Product tenant，不保留浏览器租户切换 route 或 UI；Team context 整体替换属后续 consumer 切片 |
| `/iam/*`、`/auth/{sign-in,select-tenant,consent}` | `/iam` owner mutation 直接 browser POST 全拒绝；`/auth/sign-in` 是 GET/POST，另两个 `/auth/*` 仅 GET 引导；内层 tenant 是 GET-only 固定续接，consent 是带 issuer cookie 的 GET/POST 表单 | 已安装固定 Auth.js RP callback；不是任意 `/v1` proxy |
| `/api/dev/*` | 非 production preview fixture | 无 live upstream；不得在 production 启用 |

Catch-all route 不表示浏览器可以任意代理 `/v1`；允许路径必须由 client/schema/route test 明确冻结。

## 5. JSON 与 HTTP 规则

### 5.1 通用形状

BFF 成功（示意；request ID 位于响应 header）：

```json
{"data": {}}
```

BFF/Web 错误（示意）：

```json
{"error": {"code": "stable_code", "message": "safe message", "retryable": false}}
```

Web 可在 browser-private 边界将 BFF success `data` 投影成当前 UI 所需 DTO，但错误必须保留稳定 code
与响应 `x-request-id`。当前部分 route 仍返回 flat `{error: string}` 或 body `meta.request_id`，
列为收敛缺口，不能作为新 route 模板。

### 5.2 输入与命名

- 浏览器 JSON 使用 `snake_case`；外部值先以 `unknown` 接收并经 Zod 校验。
- tenant、subject、service identity、部署域名和 request id 不从 body 推导。
- opaque ID 在 path segment 中只编码一次；分页使用 opaque cursor 和稳定排序。
- 长期公开 offset pagination 不由 Web 定义。

### 5.3 幂等与并发

- POST/PATCH/DELETE 等具副作用 command 使用 `Idempotency-Key`；相同 key/相同 digest 重放原结果，
  相同 key/不同 digest 返回冲突。
- 浏览器可产生 command identity，但 durable receipt 与 request digest 由 BFF owner 保存。
- MessageCreate 的浏览器内部参数可携 `idempotency_key` 供状态机重试；标准 Chat 客户端发送的 JSON 仅为
  `{content, model?, agent?, thinking?, pinned_skills?, mcp_servers?, project_ref?}`，该 key 只在
  `Idempotency-Key` header。客户端在 fetch 前拒绝未知字段或空/缺 key；未获回执的重试冻结
  首发 options/业务 body 与 key。同一 AI SDK UIMessage id/content 的重复提交复用 key，新消息
  id 或编辑后的内容使用新 key。`/api/session/*` 不再从 JSON body 提升旧 key。
- 幂等身份缺失时不做自动 mutation retry。
- 资源版本冲突由 BFF contract 的 version/ETag/receipt 语义表达；Web 不猜测成功。

### 5.4 身份、缓存和错误

- 浏览器只携同源 cookie；Web 不把 cookie 原样转发 BFF。
- mutating request 需要同源防护；server adapter 重建 allowlisted header。
- 用户/工作区 JSON 和 SSE 使用 `private, no-store`；不在公共 CDN 缓存。
- 返回体不得含 SQL、堆栈、provider secret、runtime JWT、refresh token、internal URL 或 tenant selector。
- request ID 位于 `x-request-id`，不为关联信息机械新增 body `meta.request_id`；`Retry-After` 只按 allowlist 透传。

## 6. AG-UI 单协议规则

Web↔BFF 的 Agent event stream 只使用 AG-UI canonical event union：

- 标准 Run、Text、Tool、Reasoning、Activity、Subagent、Interrupt/Resume 事件优先；
- Kokoro 专有 artifact/delivery 只能使用有命名空间、已登记 schema 的 `CUSTOM`；
- BFF durable ledger 的 cursor 是唯一 replay axis；`Last-Event-ID` 回传该 cursor；
- Web 对 AG-UI 校验后映射为内部 `UIMessage` parts 或纯 reducer event；内部表示不回到网络；
- 不允许 legacy `SessionEvent` SSE、双读、protocol fallback 或第二个 resumable stream；
- `AgUiChatTransport` 是仓内 Vercel AI SDK adapter，不是 server endpoint，也不拥有持久化事实。

当前源码已有 AG-UI parser，但仍保留 legacy network parse fallback，且 AI SDK adapter尚未实现。
因此本节是已接受 contract 方向，不是“迁移已完成”的证据。

## 7. 版本与 breaking policy

- browser-private contract 与 Web commit 共同版本化；不单独承诺 public semver。
- BFF upstream 始终使用显式 `/v1`，其 breaking policy 由 `kokoro-bff` owner contract 定义。
- 变更顺序：BFF owner contract/artifact → Web 固定来源/digest → Zod/AG-UI parser → adapter → tests/docs。
- V1 clean-build 不保留双读、旧 endpoint alias 或 runtime fallback；协调发布后删除旧形状。
- generated 输出只读，必须由固定 source/generator 再生并通过 drift/breaking check。

## 8. 最小 contract test

每次变更至少覆盖：

1. 正常 request/response/event；
2. unknown field、缺失字段和边界值拒绝；
3. tenant/identity 字段不能由 browser body/header 注入；
4. idempotency、cursor、`Last-Event-ID` 和 request id；
5. BFF error envelope 与不泄密映射；
6. AG-UI 未知/非法事件 fail-loud；
7. live 失败不回退 preview 或旧协议；
8. browser-private contract 不进入 Developer API catalog。

执行入口：

```bash
pnpm contract
pnpm test:architecture
```

## Project resource upload browser projection (2026-09-28)

BFF `public` owner artifact is `kokoro-bff/contract/openapi/v1/openapi.yaml` at commit
`199a1833d5a6c17839ff39b81380cf5a8377cf85` (SHA-256
`8d250e61080f40a0c980b9d5c055bda605b66adcfb11450f1575375cca435f82`), copied byte-for-byte to
`src/generated/bff-public-openapi.yaml`. The Web browser-private `POST /api/hub/projects/{id}/resources`
adapter forwards one multipart `files` part and the caller's stable `Idempotency-Key` to the BFF owner.
The adapter caps the entire body at 1 MiB and the upstream wait at 50 seconds for this route only.
The client projects only a BFF HTTP 200 envelope with exactly one CLEAN resource into the visible
confirmed list; HTTP errors, malformed 200 receipts, and uncertain outcomes retain the original
file/key for explicit retry. A terminal infected result is shown without retry. Browser multi-select
uses N independent owner requests, not an unsupported N-file body. GET project resources is a
separate owner contract and not implemented by this mutation slice; preview resource fixtures are
unchanged. The local Zod schema is a consumer validator, not a second editable public contract.

## W2 project resource browser-private GET (2026-09-28)

Owner BFF public OpenAPI commit `31c4803b3df0e90c031a97844f89df384ca1a35c`, exact vendor bytes
SHA-256 `87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`.
Browser `GET /api/hub/projects/{id}/resources?limit=50[&cursor=opaque]` forwards through the existing
Product Session same-origin BFF adapter to BFF `GET /v1/projects/{projectId}/resources`. The response
is strictly validated as `{data:{items:[CLEAN asset],next_cursor},meta}` with at most 100 items; no upload
ID, download URL, or Storage credential enters the Web list. `cursor` remains opaque and URL-encoded.
HTTP failure or malformed 200 is a visible error, not an empty page; the user retries GET. Preview fixtures
are explicit preview-only. The POST mutation contract remains unchanged.

## W2 project create browser-private POST (2026-09-28)

Current BFF `public` owner OpenAPI is `kokoro-bff/contract/openapi/v1/openapi.yaml` at
`31c4803b3df0e90c031a97844f89df384ca1a35c` (byte-identical Web snapshot
`src/generated/bff-public-openapi.yaml`, SHA-256 `87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`).
Browser-private `POST /api/hub/projects` sends the owner `CreateProjectRequest` with required `name`
and `Idempotency-Key`; existing same-origin Product Session adapter maps it to BFF `POST /v1/projects`.
Only BFF HTTP 200 `ProjectResponse` with `data.project.id` and `slug` passing the local consumer
validator can navigate to `/app/project/{id}`. The ID is canonical; slug is validated but not substituted.
One unresolved user intent keeps the same key/name/draft across error-strip retry or rail/welcome re-entry. Preview creation is a separate
fixture and never sends this mutation. Error response or malformed success stays on the current view.
Compatible extra owner fields are ignored by the consumer validator; required Project identity fields
remain mandatory. Once a valid owner 200 has returned, a failed navigation retry reuses that confirmed
id and does not resend POST.
