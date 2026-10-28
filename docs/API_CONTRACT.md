## RunDisplay tool_facts（正式Public28.11）

唯一原件BFF d629653cbf5799a44db55a947321a6ec152b7dcd，SHA256 4d93ec15e2931768afafffb2101039b1da64757ea48c760d16ef88aa8753db16；路径／权限／错误／预算与GET副作用语义不变。required tool_facts≤128、activity_id唯一；closed item必须有display_detail和／或status，detail仅既有安全mcp_tool name，status仅failed。null、空item、未来status／kind／额外字段均拒；不是Run终态或完整性证明。safe secret matcher仅sk[-_]项改为(?<![A-Za-z0-9])sk[-_]，不特判literal名称。正式decoder不接旧缺省wire，旧RAM空集规范只在纯mapper；五private／独立policy3保持。新exact raw inverse完整回Public28.10后复用旧证明链。

## 回答动作与私有Run展示（正式Public28.10消费者候选）

固定正式BFF `0b67e0eab4918264a7270b828d558e631bdfb3f5`／Public28.10／SHA256 `9e6a8dddea847ecfd2905f378f4f76022b6cc49a1a4352a2e7abb4e73b3f1328`；既有tool-display generator同时派生closed action／display validators，无第二wire源。`GET/PUT /api/session/sessions/{id}/messages/{messageId}/feedback`映射同名`/v1`，PUT仅`{feedback: up|down|null}`自然幂等。`POST .../{messageId}/regenerate`仅`{}`＋原Idempotency-Key；202返回new run/assistant、original user关联及regenerated_from_message_id，不是成功终态或human镜像。private MessageRead的source关联不扩普通ChatMessage／share。

`GET /api/session/sessions/{id}/runs/{runId}/display`只读本Run facts，不表示完整性；精确身份与10秒绝对预算贯穿准入／body／owner EOF，取消／UTF8／重复键／长度／status／响应关联严格核。feedback unknown只GET，regen unknown只同K显式POST恢复；正式closed4xx拒绝与可能postcommit权限拒绝区分，不借错误码造未提交事实。

真实safe activity的新字段同时严格适用于AG-UI／snapshot／ordered parts：ready Skill display_skills必须唯一且为原source_refs子集，native name/path及可选decimal revision；file detail virtual_path只file可用、MCP禁止，旧absence未知。private按需Run GET不进入Shared读或snapshot批量扇出。test-only精确28.10→完整28.9逆回后承接原全部父证明，普通API／旧private/policy原件保持。

## 私有取消终态（消费者候选）

Private ChatMessageRead 仅允许 optional terminal_status=cancelled；限定 assistant、failed、非空run_id且无failure，inline与ordered一致。缺省保持原failed语义，null与其它值拒绝；public ChatMessage／share／command不扩字段。RUN_FINISHED cancelled同义，202只admission，不推断正文或parts完整。唯一正式来源BFF `51e049df72c1fb2fe82b9114135c2fdc1a3450d9`／Public28.9／SHA256 `b438a749c919d24c4e0f1dadfdbcbbb11e0ac755f5785c543a661336c2cbb354`。完整test-only28.9→28.8逆回父SHA6376e2d2…承接旧风险；普通ChatMessage、command、share及五private／独立download policy3原件不变。

## Project Skill content：Public28.8 与私有下载资格／bytes policy3

固定 BFF364f80cab855a4358eab956b7e3e3a4b5bae647b：Public SHA256 `6376e2d2a5fa9efd8e6ce4d9d4aa3686ad73dda8babffd9ac5b7097073538498`，独立 policy3 固定 BFF966ec5e7b0804185349a5f5413091d8e9e792bc9／SHA256 `4b84ccddb70421fc3f5f48766c4fd87fafb7d94f00eb9774f75b627f4f361925`。`GET /api/hub/projects/{projectId}/skill-installations/{installation_id}/package`（唯一 optional file_path）与 zero-body `POST .../download` 分别映射正式 `/v1/.../package` 与 `/browser/v1/.../download`。dispatcher 先于个人 package catchall；Product Session、可信 headers、10秒绝对准入至 EOF、1MiB JSON、取消／长度／UTF8／重复字段与严格响应闭集保持，不透传浏览器身份头。

Project metadata、目录、文件与下载 descriptor 必须对应原 installation/source_ref/revision；路径只解码一次，文件仍过现 NFC／UTF8 256byte／排序／大小与 exact manifest 匹配。只有正式 package inspection 的 `412/skill_package_precondition_failed/retryable=false` 被接受；不得借 metadata union 给 opaque GET bytes 加412。policy3 的 byte_operation 单独生成 GET `/api/skill-downloads/{handle}` 验证：32MiB／UTF8 filename255byte、精确附件与必需安全 headers、bare／typed 各自错误形状、完整错误 EOF／长度、合法 Retry-After；不借 POST metadata／Share union。原 opaque path、流式取消、断流不拼 JSON 及10秒预算保持。四 POST 完整逆回 policy2 摘要454d，Public 全文6376不改。五个独立 private394 pin 不升级；新消费者尚不代表正常启用。

## GitHub discovery：Public28.7目录候选边界

唯一完整原件固定BFF `d040eb04c5875eec2ade19be947435071dca2a5e`，SHA256 `818dfe54d5eb50a72725983be136211c63bb17fa7392f94c5c1d46234db3ebd1`。仅 `GithubSkillResponse.data` selection_required=true 的 paths.maxItems=512；129／252／512保完整，513为invalid wire而非slice。`SkillPackageInspectionData.files.maxItems=128`及selected Preview、请求、路径、commit、duplicate、权限、error/status、幂等键和1MiB总响应限制不变；无新API／游标／分页。正式snapshot与11public正规生成消费同一原件，五private394不改；正常配对由Root另验。

## S13：Hub 可选发布者事实（Public28.6，2026-10-27）

固定 BFF `7f5c522b54762c5c0a01ffa7f71f5696eb4c70f6` 的唯一 canonical OpenAPI，SHA256 `a020e849f740165fa20099f5ab041b76bc480c70a9bbc067955e57f5ec22ae02`。`SpecificationHubResponse.skills[]` 新增 optional `product→Public9SkillProductFacts`、`publisher_profile→SkillPublisherProfile`，保原 closed 字段与身份。product.publisher 为 IAM 时必须有同 kind/id 的 found／合法 user missing profile；非 IAM 不接受 supplied profile。absence 仍未知；坏 ref 绑定／extra／union 是 invalid wire，不作为成功且省略作者。单一 additive reader 无历史专用 schema 或 required 迁移。

仅新 Hub／Catalog refinement 复用正式 owner 闭集：source_kind 与 publisher 同有／同缺；third_party 必须 repository publisher＋github creation provenance、同 repository_id、github_repository presentation；personal／official 必须 IAM＋first_party。混合来源／缺 provenance／错 repository 仍 invalid，不改变共享 Product schema 其它消费者。

11 现公共 generator 的固定 commit／digest 同步更新，private pin 不变。test-only 精确 28.6→28.5 仅移除本次两字段并还原 info.version，先核完整当前 SHA、再恢复完整父 SHA，之后进入未改旧证明链；不是运行兼容或 generic strip。HTTP 请求、权限、时限、缓存与写操作均不变。

## PREPARE-OUTCOME：独立政策1.0＋lookup1.1（2026-10-27，正式394a消费候选）

唯一源为 BFF `394ae559cd2018206c32d5ca3014de248effa203` 正式 `contract/mcp-prepare-outcomes-v1.json`（SHA256 `5169cbf5e431cc71a23e2717bda9b51c77f08bed82cae149667532511b3afe72`）及 `contract/openapi/browser/v1/mcp-prepare-receipt.json`（`97ac49936f7107ba5f25b9237997642069693b1e6d0b6dd38034718636ee6112`）。两 source pin／raw snapshot／TS 分别正规生成，lookup 必须引用 exact outcomes digest 与同 BFF commit。原件内 owner_feature 属 Platform f294，不将它误作 BFF pin；共享 connector错误／Public不变。

- 初次 `prepareServer` POST 仅新增 `412/mcp_personal_prepare_rejected/false`，原 GET `getMcpPrepareReceipt` 可新增该 tuple 及 `409/mcp_personal_prepare_execution_fenced/false`。Hub 与 same-origin adapter 各自按方法严格闭集；POST5、其它 mutation4／5、错 status／retryable／开放 shape 均拒。原 trusted Session／同源准入、key、CAS、10秒绝对预算、取消和严格 JSON不变。
- lookup `negative_ack=true` 仅 scoped `prepare_connection_rejected_typed_error_only`；`completed_only` 仅 `success_wrapper`。fenced 仍 unknown，automatic_intent_retirement_authorized=false；无自动重试、新命令／Prepare授权。成功仍严格 ready／needs_oauth＋replayed true 原绑定，不新增 negative DTO 或 synthetic Current。
- façade 退休动作捕获 exact 原 record；retireWaiting 的 committed immutable record 是唯一退休事实。typed rejected 自动 failed archive，typed fenced 只允许用户显式 stopWaiting。任何退休不得走 generic command success／complete／onConfirmed。原严格成功链与 completion.via 保持。
- listRetired／inspectRetired 仅窗口作用域历史读；历史 GET 固定原 key／CAS／server／connector，结果只显示，不清 active K2、不生成 locator／授权限／导航。分页沿稳定 primary-key cursor，不声称时间倒序。
- 新连接是另一显式动作：fresh exact Current／provider／manage gate＋fresh CAS＋不同 crypto key；旧 retry／原查询／归档／历史按钮绝不隐式起 K2。并发已有 active 只合并展示 unknown，不由此旧动作 execute。

无新 wire owner／后端表／通用状态或新 IDB 版本；当前源码候选与 Root 正常配对验收分开。

## PREPARE-JOURNAL-V2：feature 本地 port，不新增传输（2026-10-27，Root 已核引用槽；存储候选）

本节不是 HTTP／RPC contract。现正式 BFF `6557f189`／receipt1.0 及所有 generated/pin 不变；后续方法专属 POST reason4、query reason4／5 只由正式 BFF 原件生成，本片不定义其 wire 字段或数值 enum。以下只是 IDB adapter 的非秘密领域接口，不能由任意 HTTP status／message／Current 推导退休资格：

```ts
type McpPreparationDisposition = "unknown_fenced" | "definite_rejected";
type McpPreparationPolicyRef = Readonly<{
  artifact_sha256: string; profile: string; version: string;
}>;
type McpPreparationRetirement = Readonly<{
  disposition: McpPreparationDisposition;
  policy_ref: McpPreparationPolicyRef;
}>;
type McpPreparationHistoryCursor = Readonly<{
  subject: string; serverId: string; key: string; version: string;
}>;
// base McpPreparationRecovery 保持原样；factory 返回扩展 McpPreparationJournal：
retireWaiting(record: McpPreparationRecord, retirement: McpPreparationRetirement,
  signal?: AbortSignal): Promise<McpRetiredPreparationRecord>;
getRetired(record: McpPreparationRecord): Promise<McpRetiredPreparationRecord | undefined>;
listRetired(subject: string, serverId: string,
  options?: Readonly<{ limit?: number; after?: McpPreparationHistoryCursor }>):
  Promise<Readonly<{ items: readonly McpRetiredPreparationRecord[];
    nextCursor: McpPreparationHistoryCursor | null }>>;
```

`policy_ref` 是固定本地引用槽：artifact_sha256 为 lowercase 64-hex，profile／version 为 1–128 个非空格 printable ASCII；值由以后正式 consumer 从其已验证生成政策填入，不设任何当前候选值、默认 pin 或 reason enum。存储层只验证 closed shape、相等性及原命令身份，不将该槽当授权或网络证明。`retireWaiting` 只在事务 commit 后返回历史记录；失败 reject，不调用成功回调、不返回新 key／CAS／发送许可。重复 exact 退休返回原不可变历史，仍不是 K2 资格。reserve 有 active 时仍返回已有记录；仅无 active 时，在同一双 store 事务先查 exact retired primary key，存在即拒同 K/CAS 重建（不因换 connector 绕开）。不同 CAS 重用旧 key 的全局防错仍由后继不同 crypto K 及 owner 原 key/CAS 守卫，不新增索引。

只读列表限可信当前 subject＋server，limit 默认20／最大50，以 subject_server index 内 primary key 正序续页（不是按本地时间承诺顺序）。cursor 保原 subject／server／key／CAS，入参须与本页 subject／server exact 相等。用 openCursor／continuePrimaryKey 对非 unique index＋唯一 primary key 原生 seek，不 getAll／全扫排序；最多读取 limit+1 个结果及常数次 seek，校验每条 closed record 与 key 一致。相同静态历史集合不重漏；并发新插入由新一轮第一页读取，不承诺跨事务全局 snapshot。getRetired 始终按原 identity 精确读。具体持久 codec 与原子约束见 [数据设计](DATA_MODEL.md) 本节；读取历史不进入 active restore 或请求重放。

## Prepare completed 只读恢复 （2026-10-27，正式原件消费者）

本节取代旧 Prepare inspection→POST replay 的恢复约定；其它 Register／Update／发布和通用错误恢复不变。正式 BFF `6557f1895d4e1a4f6d2ad9e9e37ca4fc18371d45` 的独立私有原件 `contract/openapi/browser/v1/mcp-prepare-receipt.json` 固定 SHA256 `ad1f842626677c97ee3734aff3663f296cc9c58ccfe886ae116abf8f8b991810`，由具名 generator 派生 closed schema、policy 与 error tuple，public 与其它 private pin 不变。owner 边界如下：

- BFF：`GET /browser/v1/mcp/servers/{id}/prepare-receipt?expected_state_version=<原CAS>`，携原 `Idempotency-Key`，只读原结果；不触发 Prepare、外部 I/O、重试、新 key 或 CAS rebase。
- App 同源入口：`GET /api/hub/mcp/servers/{id}/prepare-receipt?expected_state_version=<原CAS>`。只允许该精确 GET 使用原 key header；query 必填且唯一、合法原 CAS，无额外身份／query/body，无 body／Content-Length／Transfer-Encoding。其它 GET 禁 Idempotency-Key 的原规则不放宽，不把 GET 归类成 mutation 或伪造 JSON body。
- 沿原 Product Session 当前准入及受信身份映射到 BFF；显式转发已验证原 key、仅该 query，保原 no-store、10秒 admission→完整 EOF 总预算、有界响应、fatal UTF-8／重复键拒绝、取消／迟到与安全错误映射。读取失败不能自动 fallback POST。
- 仅 `data.completed` 承载原 Prepare ACK且 `replayed=true`，严格验证 closed shape、原 server/connector、原 CAS/key 所定位命令和 ACK 内部一致性。复用原 Prepare 的历史 replay 校验，不把历史 ACK 当 fresh Current，不因 current CAS 已前进而替换原 query CAS；不扩展成泛 optional transport／宽松 ACK。
- 不新增 negative/completed=false 的成功分支。missing／expired／旧 failed marker／无可验证终态、非正式 tuple、损坏或不匹配响应全部保真实 unknown；HTTP GET 200、本次 fresh ready 或当前版本都不是原 receipt。
- 唯有 exact completed＋本地 journal compare-by-key clear 成功才完成原意图；clear失败不重基也不伪完成。历史完成不授当前连接／执行／配置权限，后继 fresh 读取和显式新操作仍走原权限与 CAS。

正式 private policy将 Prepare恢复精确收敛为 lookup_only；App同时替换旧 `prepare_inspection_recovery` 放行路径，不能只改一个按钮，亦不能让既有 same_command fallback产生POST。状态码／code／retryable闭集与该政策必须从同一正式原件生成，保其它原 tuple、旧版本证明与已有公共发行物，生成器校验原件全文 digest、政策及闭集，拒绝字节或语义漂移。

验证须同时覆盖 client＋same-origin route＋命令／全部创建和详情恢复入口：该 GET 只携原 key/query，其它GET仍拒key；零自动POST、严格 completed绑定、历史CAS、body/framing／query重复与缺失、慢 admission/body总预算、取消／主体退休、clear失败、跨tab新key保护；mock 不称正常完成恢复。

## PROJECT-PIN：正式BFF个人偏好消费 D0（2026-10-27）

唯一完整artifact固定BFF c195d2325ba9c433cc4c64e25e6c67eaf73c47f6／Public28.5／194操作，SHA256 109a2ae063b10699ae52776b09533c5622d906679c093d65730a289206043b1a；同snapshot正规生成，原三private pin不动，test-only完整28.5→28.4逆证再委托旧链。浏览器只新增GET /api/hub/self/project-pins（分页limit/cursor或互斥单project_id）与PUT /api/hub/projects/{id}/pin（closed {is_pinned:boolean}，≤1KiB，无key/CAS/query）。沿现Product Session／部署Domain／same-origin写防护，10秒admission至完整EOF、64KiB响应、取消及静态异常；generated schema核目标、bool/null条件、分页顺序/唯一性与方法fault。pin不授可见权，不改Project DTO。

验证：先正式pin/schema行为RED，窄生成器确定性/check、client/hook/rail focused、真实loopback薄桥；Root独立统一门、正常资源/浏览器/Git。本阶段不以mock或源码完成称正常已验。

## 2026-10-27 Public28.4 安全工具对象与共享隔离（本地消费者候选）

唯一原件固定 BFF `3d52a90ec42601a19536e95a8b9e48f93a63276c`／28.4.0／192 operations／SHA256 `48aa9638d133223c9f78655e9398ddbb44159963f92a2db891a09212f3aa2726`，十公共生成链与在线 Docs 同源，独立 MCP 私有 artifact 不改。optional `RunToolActivity.display_detail` 仅 closed `{kind:file|mcp_tool,name}`；name 为 1–120 Unicode scalar、≤480 UTF-8 bytes、NFC 且禁 Cc/Cf/Cs。code-kind 与 file-only basename pattern从 canonical allOf 条件正规派生；MCP 工具名称可含斜线。App 严格拒 null／extra／未知 kind／不匹配类别，不修正、截断或从参数补名称；旧 absent 保持合法。live／snapshot／parts 共用一份 validator，名称仅纯文本展示，不新增请求／endpoint／授权／执行事实。

匿名 `SessionSnapshotResponse.execution_process` 及 public example 正式仅 null；App shared z.null，private snapshot extend 单独恢复 nullable process。canonical optional execution_head 不在本片删除；SharedThread 在私有 hydration 前显式去 head，公共消息仍不接受 private rendering／parts，匿名 UI 不取得私有进度。正式新旧全文逆证与原父 hash 保留；完整正常激活及后端闭环不由消费者门禁代证。

## 2026-10-27 具体动作安全对象候选消费／分享隔离（D0；待正式 owner 发行）

当前正式消费者仍是下节 BFF Public28.3；Agent8.2／Public28.4 仅后继依赖，未取得正式 commit 与完整原件／摘要前不更新生成物、运行 schema 或手写 wire DTO。候选工具活动沿现唯一 AG-UI／snapshot／ordered parts 增 optional `display_detail {kind:file|mcp_tool,name}`，名称上限 120 Unicode scalar／480 UTF-8 bytes 并由源边界限定；最终字段、校验和 provenance 以正式 owner artifact 为唯一来源。App 十条既有公共生成链从同一 Git blob 原件正规更新，保独立 MCP 私有 pin 与旧父证明；旧 absent 合法，只显示原类别，不猜对象或回填历史。

对象仅用于纯文本动作展示、长名 ellipsis／完整 title，不是文件路径读取、MCP 执行或链接授权，不新增 endpoint／请求字段／权限／业务写入。live CUSTOM、私有 snapshot 和 activity parts 必须共用 strict schema 保值；坏 metadata 不静默降级或从参数／答案修复。匿名分享的 `execution_process` 明确只接受 null（App `z.null()`）；私有 snapshot 从 shared schema extend 后单独恢复 nullable process，分享不消费私有活动／metadata、不请求 private parts。当前宽 shared parser 是待修消费者边界，不把现状冒成目标已实现；完整 UI／consumer 写区与验收见本仓 `TECHNICAL_DESIGN.md` 首节，第一阶段结构／图标落地不代表具体对象目标已完成或正常组合生效。

## 2026-10-27 当前 Public28.3 文件工具类别

固定正式BFF `b2b9eb1eac4a3f0b0cd4099ed59cbf756f14124c`／Public28.3.0／192操作，完整 canonical SHA256 `85a1b51cd151581b51d7ea7992d85e04462c03fafb36d0527e1df352dd85223a`。唯一增量为 `RunToolActivity.display_code` 正式闭集追加 `tool.file.write`、`tool.file.deliver`；success仍只由原status表达，旧 `tool.execution` 合法，未知值、跨分支值及raw字段仍严格拒绝。live CUSTOM、snapshot与ordered parts共用生成tuple和现validator，无新endpoint、请求字段或执行许可。

十条公共生成链固定同一原件并正规生成；三条独立私有pin不变。完整28.3→28.2父证明及原历史SHA保持；正常reader配对与producer启用由Root验收，本地解析不冒真实工具执行。

## PROJECT-MCP-RECOMMENDATIONS-CONSUMER-D1（2026-10-27，独立消费者候选）

固定正式BFF `21c6447316aefcd8189f7dcedbb522d91a8e6cf5`／Public28.2／192操作、canonical全文SHA256 `e0bb74069c65fb8d414a6a3cb0d6f4c8d9bcb40bb693c2409a9cbe051b8bac53`，只从Git blob取得唯一完整snapshot，九条原public生成链统一正规更新，独立MCP私有pin不变；新增具名窄generator从同一snapshot导出三种refs、请求/响应和status/code/retryable闭集，生成物不手改。test-only exact28.2→28.1先验完整新旧全文，保原历史hash／fixture与证明链。在线Docs固定同一正式版本，不另建wire事实源。

standalone `src/hub/project-mcp-recommendations-client.ts`只GET/PUT当前Project推荐配置；不改HubClient、不接任何组件／Composer／locale。PUT自然幂等无key/receipt/journal，闭合原expected CAS+完整refs，ACK精确project、canonical引用集合、state_version为expected或expected+1（各自有界）；未知不自动PUT，后继GET只证明当前配置。三种ref仅偏好，私有引用不变成他人配置／执行授权，CustomAPI运行缺口仍OPEN。

`src/lib/server/project-mcp-recommendations.ts`经现Hub catchall精确两方法入口进入BFF同尾`/v1`，ProductSession是唯一用户身份，PUT沿现same-origin；拒query/body身份/command key及坏framing。16KiB请求/64KiB响应，从body/admission到响应EOF同10秒绝对预算，fatalUTF8、重复JSON键、closed shape、headers/status tuple与绑定均验证；取消/超时/迟到不冒成功、不换key重发。上游PUT只发送已完整有界读取的原bytes，显式可信Content-Length，不允许TE；浏览器响应复用private/no-store/zero-age策略，client沿既有hasHubNoStoreDirective接受正式扩展directive，不误认必须exact no-store。Web不直连Platform、不存业务数据或secret。

验证先正式pin/wire RED，再纯生成两次确定性/check、client边界/取消/慢body总预算、真实HTTP loopback薄桥（Session显式替身；真实CL/EOF/不透传caller身份），并跑相关contract/lint/types/build。运行／正常服务／App UI接线、Git index/提交均不在本片；Root与picker其他writer文件严格排除。

**本worker交付事实。** App基线已由Root前进到 `9fa5c289865d3d7f0daee219d01f63a46147b67f`；本片仅wire／generated／proxy／contract／Docs，不接并行UI文件。完整正式pin与历史父证明、100份生成物再次正规重出字节一致；真实HTTP薄桥与standalone取消／ACK／方法专属fault闭集已验。在线Docs由陈旧Public24固定到同一28.2：只按精确节点承接原Public27两项公开扩展，natural仅具名新PUT，nested local JSON-pointer链接所属顶层schema且保完整ref解析；原private route过滤／秘密扫描／header allowlist不放宽。首次失败日志与最终命令日志在本地ignored测试收据，未提交运行材料。正常服务／配置／库与Git index、提交、push均由Root负责，本worker未操作；CustomAPI运行绑定仍缺，不以推荐保存冒执行可用。


## 2026-10-27 当前 Project 资源消费者边界（优先于下方历史候选）

固定 BFF `11777152bf8fe2ae316e4c67fb355eab94e7c0b5`、Public28.1.0/190 operations，完整原件 SHA256 `07e98d803ac3c7342c2e322b507e8760d89e63bc5ecdab3cdf447b68bf3c904c`。新增 Project resource item metadata、原生附件下载与空 body/原 key 的 Asset 永久逻辑删除；既有生成器正规更新、历史187操作及negative保护保留，未新增第二可编辑wire。MCP独立固定契约及AG-UI网络协议不变。

浏览器同源响应必须消费现有 Proxy 的正式 `projectRenameBrowserCacheControl = private, no-store, max-age=0`；这不同于内部 BFF 的两directive响应。真实200因误认两directive而被客户端拒绝的缺陷已用同一常量修正，不改Proxy策略、不放宽private/no-store/zero-age保护。typed owner error与裸HTTP状态分开；未知DELETE保原空body/key，可信401/403才退休该授权scope。

当前上传沿已发布1MiB请求体限制；本片不擅自放大政策。唯有Web在发送BFF前返回的exact413+不可转发本地provenance，才可在重选同名文件时退休该失败行；pending/unknown仍保原File/key。原生附件沿现有1GiB有界verified transfer，不执行HTML/SVG，无inline preview冒承诺；UI仅声明已发起，实际完成由浏览器下载结果确认。Project删除202仅证明工作区逻辑删除，后台清理状态不伪造同步完成。

## 2026-10-26 Public28 安全工具类别消费者（实施候选，尚未正常激活）

**唯一 wire 来源。** `src/generated/bff-public-openapi.yaml` 从正式 BFF `5dfce099c7ce448e18b8ce5b1e26bb01692c9033` Git blob取得，固定28.0.0／全文 SHA256 `34ca44c01ebc73f7ff76a4a06be33696b96ba1636e8818f02c38d57b1f539809`；App26 正式本地 `5b651f40d6e16e8afa92c5149a97a86e684aadad` 前置已满足，Root 已授权既定写区。`generate-bff-tool-display.mjs` 仅提取 owner `RunToolActivity.display_code.enum` 到只读 generated tuple/type/provenance，无另一份可编辑字段事实；七个既有 public 生成器随同一完整正式原件正规更新，MCP 独立私有 artifact及其恢复政策原样保持。正常生效仍待 Root 配对，不从候选/Agent原件猜 wire。

目标 tool `display_code` 闭集为 `tool.execution`、`tool.file.read`、`tool.mcp.discover`、`tool.mcp.describe`、`tool.mcp.call`、`tool.web.search`、`tool.web.fetch`，其精确值与闭集性由固定 BFF28 原件验证，不手抄成运行时 wire 常量。其余 tool 字段仍 required `activity/activity_id/segment_id/status`、原 opaque ID与 `running/completed/failed`，不接受额外字段。unknown code拒绝；旧 generic仍合法并保持通用标签，不因没有具体类别而推测名称/行为。file.read不声明“读取技能”；MCP三类不暴露远端 server/tool 名、参数或说明，不把发现/说明/调用标签当成执行资格或成功证明。既有 Skill/Subagent/HITL/Delivery/错误语义不变。

现唯一 `runProcessActivitySchema` 同时校验 AG-UI `CUSTOM kokoro.activity.updated`、内部活动事件、snapshot过程与 Message parts活动；本片仅令其 tool分支引用正规生成 tuple，仍 strict，不新增 JSON envelope、事件名或第二 schema。ToolCallRow只把受信 code穷尽映射本地 MessageKey，九语提供六个新类别标签并保留 `thread.toolCall` 通用语义，状态文字沿原键；不存在 name/args/result/URL→code的客户端推理。公开 payload不新增名称、参数、结果、错误原文、路径、任意标题、phase、时长或推理字段，没有新网络请求或 endpoint。

完整 snapshot/live/parts保同一值：opaque activity identity、public ledger坐标/cursor、顺序/连续活动分组、真实状态、parts revision及原 scope/主体/代际/取消/退休/迟到围栏均不变。无浏览器业务持久化、Schema或新权限；不改旧正文/历史活动或重跑 R6来恢复未发布语义。mapper/reducer与现读取状态机只通过原共享 schema接新枚举，不借本片重构。

**正规生成与历史保护。** 本片按正式 BFF28 Git对象取得完整原件，更新当前来源断言，逐条运行既有 `contract:generate:bff-<surface>`（surface 为 agent-failure、team、account-sessions、account-profile、shared-tasks、archived-tasks、public-skill-list），再运行本片新增 `contract:generate:bff-tool-display`；生成文件只由命令更新，对应 `--check` 纳入 `pnpm contract`。test-only 完整28→27逆恢复旧 Public27 全文 SHA256 `d2b3d546164cadc9655616fc44daf1511a6f7d4a2e5d172f1415552af8942ed1` 后，继续现27→26与历史证明，保全部旧 raw parent hash和固定 helper身份；不把兼容转换带入客户端或默默忽略新值。精确源码/生成/locale/测试候选写区见本技术设计首节，正常配对、浏览器验收及恢复由 Root另行授权；本源码候选不代表正常链路已生效。

## 2026-10-26 MCP 列表 icon 媒体同源面（实施设计）

新增仅浏览器私有 `GET /api/hub/mcp/servers/{server_id}/icon`，映射 BFF `GET /browser/v1/mcp/servers/{server_id}/icon`。请求只允许精确 ID 路径、无 query/body/Content-Type/framing/命令头；身份只取现 Product Session。200 为完整 `image/png` 或 `image/jpeg`，严格非零 Content-Length ≤ 1,048,576，no-store/nosniff/no-referrer；不透传 redirect、cookie、owner location 或任意依赖头。完整 admission/响应 EOF 同一 10 秒预算，未知错误拒绝，不污染列表读取。私有 profile 固定 BFF `7a94139b607ca4e51feb1f5480b35f46c4afa53c` / `mcp-server-icon-browser/1.0.0` / SHA256 `26569264ab799b753e9e57621167a34b2b5530f9e0d8d65cf9dc333d3aada766`，`contract/bff-mcp-server-icon-source.json` 记录来源，原件与 status/code/retryable 闭集经 `generate-bff-mcp-server-icon.mjs` 正规生成；Public27、Connector JSON 与原命令错误 profile 均不扩。浏览器始终 fetch 固定同源路径且禁止缓存/redirect，只有完整校验后的当前寿命 blob URL 进入 img src，避免浏览器复用同 URI 的旧解码图像；没有额外 query、Storage URL 或第二条 JSON 读取。

## 2026-10-25 personal HTTP/SSE 与 Public26 消费（源码候选）

现 Browser→App `/api/hub`→BFF browser-private unary 路径不变，外部 SSE 由 Platform/Agent 执行。唯一 `src/generated/bff-public-openapi.yaml` 固定正式 BFF `aa0bdeb4397d3a022edf9b3cfc53d5a6cfb281b1`／Public26，全文 SHA256 `20d26736cf23da32c242c2c7cf75c45affb62c5d27696dcecb0bc6193bc39a09`；七个既有 public 生成链正规消费。Public26 Connection 的 `transport` 严格闭集为 `streamable_http|sse_compat`，unknown／STDIO／extra 拒绝；完整26→25→24逆证保旧全文 SHA、操作与权限断言，不改独立 connector-error／project-publication artifact。

- Register `/api/hub/mcp/servers` 的 optional `transport` 只接受 `streamable_http|sse_compat`；absent 保旧 HTTP body／摘要语义，显式值随原命令冻结。数字、Proto token、null、别名及 STDIO 拒绝；Update 不接受 transport，创建后不可变、同 URL 唯一规则不变。URL 添加继续 absent HTTP，自定义 MCP 才显式选择，不猜协议。
- import `/api/hub/mcp/servers/import` 保原 `config_json` 全文、顺序、key 与 owner 原子性；逐项按 `type:streamableHttp|sse` 绑定真实传输及原名称／URL／ID等字段。旧 HTTP 规范摘要不追加 transport2；SSE 加3由既有上游绑定负责。混合/SSE 批不能借某个 HTTP 项降成历史整批豁免，不拆成多个 Register 或重写秘密原文。
- fresh Get 的 Current 必须 present 真实 transport；新 Register/import ACK 同样须 present 且匹配请求 effective transport。历史 absent ACK 只在 owner `replayed=true` 与原 operation/key/请求及全部原绑定成立时承接：Register 须原请求 absent，JSON 须原整批旧 HTTP；显式 HTTP/SSE、混合/SSE 批均不得借 replayed 放过缺值。Prepare/Update 的历史 exact completed ACK 也须合法 replay 上下文，新 non-replayed ACK 缺值拒绝；旧 App 已确认成功不追溯改未执行。中央 ACK／Current schema 与 matcher 由 route/client 复用，保外层 replayed 和原 JSON 上下文，不设浏览器自报历史 flag、不泛 optional/fallback。
- ACK 证明原命令完成，不证明 fresh 展示／选择／执行资格。缺字段不补 HTTP、不填入 payloadGet、不换 body/key/CAS 重派；fresh 双 GET 失败保持原确认／unknown／草稿，只显式重读。创建后的独立 Prepare／Done 与 receipt 恢复分层保持。详情只展示 fresh immutable HTTP/SSE，未知／撤权不假 ready；Connection 的真 ID、availability、分页与原关联校验保持，选择不是工具执行授权。项目发布仅 fresh HTTP，两处 UI/action guard 同时核 transport，SSE 不冒项目执行 ready。

保原 Product Session、可信主体／tenant、MCP action、request ID/no-store、有界响应、10秒总预算、AbortSignal/late fence、secret-safe 错误与原 unknown 恢复，不新增 endpoint/权限/Schema/依赖或自动重试。本片为固定发行的消费者源码候选；定向行为／生成检查与停写输入另有绑定，纯 MCP 候选完整门及正常多 owner 配对由 Root 接手，未以混合工作树测试冒全部验收。

## 2026-10-25 Canvas 小文本成果读取边界

不新增 wire/Schema/endpoint。Canvas 只对用户打开的 `text/plain` / `text/markdown`、已知大小 ≤65,536 bytes 成果启用只读预览；当前可信 subject/admission/generation 必须存在，先严格读取原二元详情，再 GET 原同源二元 `/content`。内容 GET 仍由 BFF 独立授权，不把详情成功当许可；流硬限、EOF、头与 metadata 大小/MIME、metadata SHA-256、fatal UTF-8 全部通过才显示纯文本。一次10秒总预算覆盖详情至解码，不因分阶段重置；取消/退休/切项/晚到不显示旧正文或再发请求。缺边界、超界及不支持类型明确保原生下载；失败可显式重试，不造空正文成功。

原 ≤1 GiB native attachment 下载、同源安全头、当前身份准入及二元选择器不变；预览不修改 Workspace file 清单，不加载 Markdown 外链图片/HTML/脚本，不持久化正文或新增浏览器认证事实。

## 2026-10-25 cold session/CSRF 读并发（源码候选）

原 `GET /api/auth/session` 仍仅为在线 RP lifecycle/access-expiry 投影，不升级为 fresh IAM 准入。`serverAdmitted` 布尔只允许在原10秒总 signal 内提前并发读取现 CSRF；GET 可信 subject 和原 browser fence、CSRF 全部成立后才唯一 POST refresh。错误/anonymous/退休/timeout 零 POST，未消费或晚到 CSRF 不授权轮换；原 Origin、主体绑定、POST 后 fresh 验证、CAS、unknown 禁止自动重放与120秒规则保持。无新 endpoint、wire/公开 contract、cookie、SSR claims 或 auth cache；不以此调度调整宣称正常等待已消失。

## 2026-10-25 URL MCP 项目定义发布消费者（候选）

固定 BFF `c124705f5ab7f8aa8dac4a648f7e8e952661926f` browser-private profile1.1.0，原件 SHA256 `b743f452bf28c6c349d8d9fdf587dbcf42d9bbd8c97788a34615d603a497ae67`，精确来源见 `contract/bff-mcp-project-publication-source.json`；已逐字比对生产者 Git 对象。Public24 不变。新窄生成器从该原件生成 Zod请求/响应/闭合错误；客户端与同源桥均核status+code+retryable，原ACK须绑定server/connector/source CAS及每project/pin CAS，execution_ready仅false。

三条同源入口：POST `/api/hub/mcp/servers/{server_id}/project-publications`；GET `/api/hub/projects/{project_id}/mcp-pins`；POST `/api/hub/mcp/project-publication-receipts`。映射BFF同尾路径 `/browser/v1`，仅定义发布/原回执，不发送授权/执行请求。项目多选1–32、canonicalID、每pin absent/current，原失败不换body/key。首次自有明确400/412且无unknown历史才允许用户重新读取并修改意图；已未知、receipt任何失败或不匹配tuple均保留原命令。

## 2026-10-24 MCP 图标五私有操作消费（实施中）

固定 BFF400fab6e89c2fde77eb9f4917271e3e09a0c62da：/api/hub/mcp/icons/uploads POST、import POST、{intent_id} GET、{intent_id}/complete POST、{intent_id}/cancel POST，各映射原/browser/v1路径。四写保Idempotency-Key、原body与十进制CAS；主体来自Product session。请求/成功运行时schema在hub/mcp-icon.schema.ts，错误沿既有mcp profile1.1，不改Public24或错误artifact；GET不携body/key、不自动恢复。原Server／CustomAPI create/update承接icon selector，update可clear_icon=true互斥；响应icon metadata及短preview_reference独立，失败不猜保存成功。

## 2026-10-24 Prepare 原请求恢复（既有JSON卡，设计门）

**固定消费与UI恢复：** browser-private错误profile固定BFF `a9a6918d47e1f2654edf8720c561ee06eb57a78c`／1.1.0，原JSON SHA256 `5c12e237e03a6be446a564034ec5c18965e996be24ddeb40807ec4b9b074d83d`，由既有窄生成器更新；Public24发行物不变。核验按钮仅调用两条既有精确GET，随后另一次明确点击才重放原Prepare。窗口token只是浏览器显示资格，实际POST还核当前signal/主体/代际/exact日志；关窗清退proof不删除未知请求。completed只显式收口、不发POST。

**跨tab约束（独审补齐）：** failure存写也核exact subject/server/connector/key，且同key乱序回调不能把inspect_owner/expired/conflict降回undefined或same_command；invalid只可收紧为其它不可恢复分类。已恢复RAM K在核验前后及POST前须与日志原子重核；另一tab已清退K并reserve K2时，旧窗口不得采用K2、沿用K的核验凭证、覆盖其failure或清退K2。保守锁旧窗口并重新加载，不改owner/回执协议。

**问题/基线：** 长metadata已由BFF14bb159/App c3f301e修正且正常GET200；原502 invalid仍按browser-private profile1.0 inspect_owner锁定，旧tab消失证明RAM不能作为关闭/重开的恢复保证。当前主体/同实体ready只证当前状态，不证原命令receipt。

**取舍/边界：** 保留通用错误语义，增加Prepare专属“核验后显式原命令重放”政策；不把所有invalid改same_command，也不新建Platform receipt查询RPC/事实镜像。BFF code-first profile1.1新增独立prepare_inspection_recovery，原错误tuple/recovery、automatic_retries=false、new_command_authorized=false与Public24完整原件不变。条件为operation=prepareServer、failure=invalid、当前主体、精确server+connector可信读及原server版本不倒退；授权只允许原key/body/CAS显式重放，不授权新命令。其它inspect_owner错误不变。

**失败/验证：** 核验零POST，读取失败/错ID/错关联/旧版本/取消/身份或generation变化均不授恢复；核验不是成功、不是receipt。重放仍由owner当前授权/CAS/幂等回执裁决，完整exact ACK到达才收口。保过期/身份冲突锁定及迟到ACK、秘密清退、管理与Prepare互锁；固定消费者由正式提交及digest正规生成。先行为RED→窄修→相关门→正常同一实体与原请求验收；不以GET200称原Prepare恢复。

**App状态/恢复落点：** 沿mcp-preparation-commands与原ConnectorCommandProvider，仅Prepare增加非秘密恢复日志；新mcp-preparation-recovery.ts负责浏览器IndexedDB原子reserve、严格codec、失败标记与exact ACK后的compare-by-key清退，不保存headers、URL、OAuth/令牌、工具原文或业务成功facts。使用IndexedDB读写事务串行化跨tab同actor/server的首次命令，而非localStorage覆盖竞争或仅sessionStorage丢tab；无新依赖/服务/后端表。原generic connector command仅增加显式unknown bootstrap及Prepare专属mayResume钩子，默认行为不变；不将其它Create/Update秘密写入日志。

**本地数据模型：** IndexedDB `kokoro-mcp-preparation` version1，`intents` object store，key为JSON.stringify([verifiedSubject,serverId])，subject index；record closed `{subject,target:{serverId,connectorId,version},key,failure?}`，严格复用当前ID/CAS/key及已发布failure分类。首次POST前reserve事务必须commit；已存在则采用原target/key，绝不分配替代命令。初始化/重开只恢复unknown，不发POST、不把存储当主体证明或owner事实；同actor当前Session准入后才能读，跨actor不展示/不恢复。日志不自动TTL清掉未知意图；过期由owner明确返回后封锁。浏览器存储不可用/坏记录失败闭合且允许显式重新读取，不降级RAM后发送。

**生命周期：** 页面/弹窗关闭和reload保持日志；新实例恢复后需重新可信核验，再显式重放；核验凭证只在当前actor+generation有效，取消/重验/一次重放即退休。原请求body/key/CAS不可被当前owner新版本改写。完整client ACK且exact connector绑定通过后才compare-by-key删除日志；删除失败保未知，不置假成功；不同新key不可被迟到清退。旧actor实例退休只取消内存，非秘密日志留给原actor再次真实准入恢复，不授权新actor。恢复加载/失败与业务owner读取分别呈现，未完成恢复读取时阻止新Prepare/试用/同实体变更；管理清理仍沿既有owner语义。

**测试/正常验收：** 存储port测试reserve先于POST、跨实例恢复、原key/body/CAS、错actor/identity/generation、损坏/不可用/提交及清退失败、迟到ACK及新key保护；正常浏览器验证真实IndexedDB事务与reload，不把测试port替身称真实存储。UI核验按钮只GET，核验后显式原请求POST与完整回执，再刷新同ID；不重建连接、不清failure绕过政策。复用原最小组件与错误文案，不新建恢复中心。

## 2026-10-24 私有MCP发现长描述消费修正（正常读取已验，原Prepare恢复仍开放）

正常JSON导入201后Prepare返回502，已定位owner合法2006字节工具显示文本被消费者额外1000字节界限拒绝。仅对发现declaration display_name移除逐字段长度上限，保留Unicode/既有内容校验、其它字段上限、strict结构、ID/CAS/声明一致性以及整个传输响应预算；不截断、不改写owner原文或declaration digest。读取与首次/重放Prepare receipt共用该投影。

该面是现有browser-private管理投影；公开Public24原件、固定owner artifact、错误profile、SQL/权限与运行配置不变，不为局部实现伪造新的public发行。502 invalid仍为inspect_owner，旧冻结请求没有因本修正获得重试资格；后继须先正式定义可信核验后仅显式重放原key/body/CAS的Prepare恢复，合法exact receipt到达才完成。其它inspect_owner错误继续封锁。BFF14bb159/App c3f301e已正常配对，仅重载BFF及单份App源；同一实体详情GET502→200、硬刷新重开GET200，长文本547/2006字节保持。原Prepare exact receipt未重放，inspect_owner后恢复及关闭/重开持久恢复仍开放，不称JSON CRUD已闭环。

## 2026-10-24 JSON导入明确拒绝消费

既有`POST /api/hub/mcp/servers/import`及完整`config_json`原子语义不变。JSON flow现承接首个从未uncertain的精确HTTP409 / `mcp_personal_server_url_conflict` / retryable=false，作为本次整文档未创建的明确拒绝；保正文、更正后显式新key提交。旧unknown、错误tuple不符和传输未知仍保原命令，不自动重发。未新增/改动机器契约、生成物或后端API。长metadata引起Prepare响应502仍为后继契约消费缺口，不属于本片已修范围。

## 2026-10-24 MCP重复URL明确拒绝消费

消费既有正式409 `mcp_personal_server_url_conflict` / retryable=false元组，不新增或修改API/生成物。只有首个确定响应且此前无未知提交才作为可修改表单的语义拒绝；错误tuple不一致、传输未知及旧unknown重放仍不确定。不能仅凭code文案或所有409释放命令。

## 2026-10-24 MCP详情试用与正式消息边界

本地Try不新增API或改wire：私有server的exact `connection_id`经现engine选择进入新草稿，用户明确Send时才沿既有Public24 `selected_mcp_connection_ids`冻结到原消息请求；connector/server/provider ID及显示名不替代运行Connection。Try本身零消息/Prepare/授权请求，未知原请求不被新草稿覆盖。缺可用性、未ready或缺Connection不伪造试用；Prepare/重新授权保留各自正式操作与恢复语义。

## CHAT-1：首发刷新恢复不新增网络协议（2026-10-24）

仅增加App同标签浏览器未决意图adapter，首发/原retry继续原MessageCreateParams与唯一builder；GET snapshot-first、exact MessageCreateReceipt及AG-UI保持。刷新无自动POST、无新key/body、无本地伪会话，503/404/同正文不作为命令未发生或已成功的证据。原控制、身份、project_ref及MCP/Skill有序选择不变；设计/本地记录见TECHNICAL_DESIGN/DATA_MODEL，实际验收见CURRENT。

## 2026-10-24 普通会话 MCP 精确选择（App 实施中，正常未激活）

目标由BFF公共后继机器合同提供消息selected_mcp_connection_ids，Web只由原same-origin adapter运输、严格运行时校验，不自定tenant/actor或直连Platform/Agent。弃用的mcp_servers不作为alias继续输入。数组ID/唯一/数量/编码限制跟已发行固定owner source对齐，不自创执行字段。

候选连接来自现MCP Connection当前主体read接口，active状态仅显示资格，不是执行授权；工具调用仍由Agent重新核当前owner。空列表、不读到数据和读取失败不得混淆。选择对象只带Connection ID，不发URL、headers、密钥、profile或工具声明。

## 2026-10-24 Agent 待核对终态（候选，未正常激活）

固定BFF `b0f201e99c2ae3fa213942c5a909f47b06640a02`／Public23.1／raw `703dba47da8a5c659b4236bb0a72317588ad29a4ca444ff9e5c99cfbcd00634b`。原186操作不变；七public窄消费者正规生成，ChatMessage／RUN_ERROR只承接新增model_settlement_pending且retryable=false，未知／坏profile保持拒绝。既有ConversationThread与九语言保正文并说明结算待核对，不猜已扣款／释放、不给终态重发动作、不改历史generic。完整23.0父字节逆证及原证明链保持，在线Docs固定同一发行物。完整工程／正常激活状态见[CURRENT](CURRENT.md)。

## AUTH-1：第一方登录短地址（2026-10-23，正常已加载）

IAM原始GET `/auth/sign-in?<signed-query>`只作协议入口，同源/大小检查后303到`/auth/sign-in?flow=<随机引用>`。flow必须单独且规范编码，混合/重复拒绝，绝不转为IAM oauth_query。短GET/POST需要对应HttpOnly browser proof；原query仅服务端恢复后逐字透传。form action、失败303只用短地址，原query不放HTML/Referrer，内部HMAC覆盖flow和真实query，直达内部页仍404。

原POST字段csrf_token/email/password和一次消费不变；刷新只CAS退休本请求携带且绑定验证通过的当前flow旧证明；每render独立cookie，未被该请求观察的并发render与其他交易不受影响，旧POST仅清自己的cookie。错误凭据保本flow，成功导航退休本flow；未知结果不自动重发密码。缺失/过期走固定恢复页，Redis故障503，不变成功。保no-store/CSP/同源form策略；此为Web私有表单引用，不是新公开业务API/身份/授权。

## AUTH-1：原生会话连续性（2026-10-22，实施门）

不改公开BFF／同源业务API、OIDC scope／resource／callback path或session投影；issuerSessionId仅在服务端HttpOnly加密cookie，绝不输出到/api/auth/session、URL／浏览器JSON或日志。初始已验签TokenSet的sid必需，与最终account.id_token及sub同一证据；续期ID token亦必需并走原生openid-client验证，iss/client aud/EdDSA/exp及原sub/sid匹配，不能裸decode当证明。正常失败仍原rp_callback_rejected／rp_unavailable或refresh_unconfirmed状态与受控页面恢复，未知不二次提交refresh。旧无sid Product cookie不兼容。

原token响应expires_in为原数值正整数1..3600、access≤2048B／refresh≤8192B及有界响应保持；refresh先原一次HTTP，再公开SDK grant仅接该TokenSet进入原生refresh验证，无第二网络grant。JWKS只读固定BFF路径且同5秒预算，不开任意URL／额外IAM接口。公开合同与App在线文档无需换pin。

## AGENT-1／MODEL-1：精确模型绑定同源消费者（2026-10-22，本地已验）

最终1142输入无漂移，完整App七门／4749 PASS、preview108及独立Docs45测试／54HTML17941链接通过，四MCP SHA恢复，独审Approved。正常激活和实际Agent资金链仍待，详见CURRENT首节。

沿Root唯一主链和Billing rate2已批决定，主方唯一writer，App基线bc0c8c3；固定BFFa77276b35b07eb65df8a0af2e41b461b393afb12／Public23.0.0／34ea71e0aa56256ca00fc5b3c40abd4d142bea82e664a6871190b8547ec2b9e6。唯一snapshot增加MeteringRate required model_revision{id,content_digest}，原七窄生成器正规重出；不为透明桥创建重复validator。原三具名计价通路、Product Session、1MiB/12层、原充值16KiB和10秒／原body-key-time恢复语义不变，无新路由／服务／表／运行fallback。

写区为固定snapshot、七生成器和原派生／直接契约与薄桥fixture、App在线Docs catalog和指南／相邻当前文档；原四MCP WIP按既有精确保护，不覆盖或夹带提交。先原contract新required pair行为RED，再仅pair/version delta的test-only完整22.5逆证承接原历史门，业务网络协议不变。在线Docs同步解释精确修订而非模型显示名／Key推价；发布配置不是消费许可。完整App工程、preview和Docs门停写验收，正常配对／实际Agent资金链后继，不称一比一全站或正常结算已验。

## AGENT-1／CREDIT-1：计价管理同源映射（2026-10-22）

固定Public22.5正式三操作，browser-private `/api/admin/billing/metering/{pricing,rate-revisions,policy-revisions}`逐一映射BFF对应`/v1/admin/...`，仅GET pricing与POST两publish；不接其他路径／方法。请求与错误／ACK正文保持原字节，单次上限1MiB；资金数字字符串不经Number。GET最新发布可独立null／未来生效，不是active quote或未知命令结果证明。POST仅转原publication_id/configuration/reason和key，不自动改日期或补预算；Admin后继持原命令恢复，App不建第二份receipt。

当前Product会话与部署Domain来源不变，不信浏览器authorization／tenant／actor／forwarded。新操作准入至EOF共10秒，no-store与request-id绑定，禁止重定向／Set-Cookie／Location泄漏。原成员查询、充值16KiB与其他Admin桥限制保持；凭据、真实财务、正常激活均不因契约配对自动开启。

## CREDIT-1 具名管理薄adapter（2026-10-22）

固定 Public22.4／183：Admin两条具名业务路由经既有Product会话代理，浏览器不自报tenant／操作者，BFF保持当前管理员与租户资格owner。App不扩公开执行入口、不解释积分换算；原 funding_id／body／Idempotency-Key／effective_at 原样保留，未知不自动重发。成员GET只允许limit和opaque cursor，POST不接受query／CAS或旧credit action路径。

本仓canonical snapshot来自BFF c48a9bc committed blob；生成器与Docs固定同commit/digest，历史父证明由精确新增POST逆证承接，不改旧22.3父hash或运行兼容。字段事实仍在BFF；真钱支付及直接余额变更无入口。

## MODEL-1 Admin上游模型发现薄桥（2026-10-22）

`GET /api/admin/model-providers/{provider_id}/upstream-models`只接受canonical UUID路径（大小写形式沿现UUID规则）、无query/请求体/任何body framing（含Content-Length:0）/Content-Type/If-Match/If-None-Match/Idempotency-Key。映射正式BFF唯一 `GET /v1/admin/model-providers/{provider_id}/upstream-models`；不增加浏览器传入Key、地址或tenant/actor参数。

成功与权威错误原字节透传，成功data为 `{provider_id,items:[{id}]}`，保原meta.request_id及响应x-request-id/no-store；BFF管理权限拒绝不降级。App对无session回401、非法请求400、未知path404、依赖/取消/预算/超限503、非法MIME/request-id/no-store502，统一原错误信封。准入至完整EOF单10秒/1MiB、无自动retry。新GET不得扩成通用owner proxy；旧Admin请求合同保持。

发行固定BFF `e461d5178c6bf92558d7cd7dd288cb29cb008525`／Public22.3.0／182，canonical SHA256 `727159cea88e9f70ca3d1127306e8a6a6bcaa568398de8b0d8fec1cce6b3fae3`，唯一snapshot，无双pin；历史Public22.2/181完整基线经test-only精确逆证保持。

<!-- 2026-10-22 continuation retirement correction -->
积分客户端每次续发 PUT 或核实 GET 前复验调用方 `getCurrent`；真实账户/用量/rail传入现 controller/current 与发起时已准入subject的marker一致性检查。只更新storage、无rerender/focus仍会抑制旧续发；marker丢失、不匹配或读取异常一律退休。marker只抑制，不授予session权限；非UI调用可不传callback，初次GET契约保持，无新store/轮询/锁。

## 当前租户 Credit 账户初始化消费（2026-10-22）

唯一事实源固定 BFF `efe0ed8b3f791468608b61dd895208f0db709e50` / Public22.2.0 /181，原始 OpenAPI SHA256 `365d61aa5b3b4c01a178f077914e03b5fdbaeebc95fe740b9be46ca8fadc3205`。现同源 `/api/session/billing/credit-account` 以 PUT 严格空 JSON 对象、无 query，映射 `/v1/billing/credit-account`；成功投影与 summary 相同的真实账户/余额，disabled 为403，owner不可用503、非法响应502。GET summary/ledger保持只读。

浏览器先 GET，仅严格 envelope/request-id 匹配的404 `billing_account_not_found` 允许 PUT 一次，再原 GET；generic404、403/503、解析失败、身份未准入均不触发初始化。PUT网络/畸形回执及502/503未知结果先GET核实，不自动重复PUT；全流程有界10秒及外部取消，取消后无晚发写入。失败沿原显示错误/显式重新读取，无假余额/开户入口，不增加支付或计量调用。所有 public 消费快照和生成器按同一owner全文正规更新，历史逆证保留为test-only。

## 2026-10-22 固定公开Skill list adapter候选

App GET /v1/skill.list映射同一固定BFF正式GET /v1/skill.list；仅项目query由该operation生成validator消费，重复／未知query或非空GET body、idempotency-key、transfer-encoding拒绝。User API Key／OAuth App的原生Authorization Bearer独立于网站Session，受信service／tenant context仍由部署与BFF owner生成；网站/api/hub和RPC准入不变。

单操作生成源仍是f74fb1a / Public22.1 / 180、SHA f726cac620362524f92474ca9d647229280db308d16105820c718f9bc32db1ae。200使用SpecificationPublicSkillList，错误状态完全来自生成provenance的400／401／403／404／405／410／429／502／503与SpecificationPublicError；不增加managed data/meta信封、权限fallback或SDK自动重试。status／ok／request_id与owner header绑定；JSON media／no-store／有限EOF和合法429 Retry-After核验，Location／Set-Cookie不透传。Host／Origin采用现iam-relay规则，Forwarded只来自配置；不提供任意URL转发或其他/v1方法。

## 2026-10-21 个人系列删除消费者候选

固定BFF `f74fb1a6796e1b5860044c889fc5ed1355cf2ec9` / Public22.1.0 / 180，原始 SHA256 `f726cac620362524f92474ca9d647229280db308d16105820c718f9bc32db1ae`，六窄消费者正规生成，独立connector错误profile不换。浏览器DELETE /api/hub/self/skills/{skill_id}原字节映射正式DELETE /v1/self/skills/{skill_id}；精确Origin、在线准入、唯一Idempotency-Key、闭集JSON仅expected_state_version／expected_publication，十秒和有限body预算沿原生命周期adapter。双层拒重复JSON key及坏错误／request-id／no-store／retry-after；200闭集data/meta，data包含series_id、skill_id、state_version、status=deleted、event_id、replayed。anchor/CAS和UI预期series额外绑定；404不是成功，未知仅原命令显式恢复。

source_status增加deleted，不扩大managed status枚举；撤回与安装移除原合同不变。旧完整parent证明先以精确公开身份矩阵增量inverse恢复原177项删除候选，再委托未改的22.1→22.0及既有oracle，不放宽历史事实。正常成对运行和浏览器验收另记。

## 2026-10-21 本人历史恢复（实施中）

沿既有历史行提供恢复确认，使用当时明确 publication 指针/版本和所选精确 UID/revision；本人 managed 元数据读取后，POST /api/hub/self/skills/managed/{skill_id}/download 映射现 BFF private POST /browser/v1/skills/{version_id}/download，再经现 /api/skill-downloads/{handle} 读取原始 ZIP。该 adapter 不是新公开业务 API；来源、期限、请求标识、no-store、有限大小/时间和取消均严格验证，不重组预览文本、不持久化字节/句柄。

独立恢复确认组件复用现发布 session：原 metadata/ZIP创建新 UID，独立上传/扫描/校验、原确认 publication 发布，不复制旧 Storage scope、不自动安装。确认前不发写命令；失败/关闭重开/同主体重新准入保留原 session/body/key，主体变化退休，冲突需显式刷新历史重新确认。普通更新仍只接active/disabled，恢复另明确接本人personal active/disabled/withdrawn；隔离不放行。界面沿已采参考的历史行右侧恢复按钮和既有确认组件，不引入新服务/状态框架/兼容层。正常四端和真实页面须在最终验收后再配对。

## 2026-10-21 发布确认消费者配对（实施中）

固定BFF be5cc6f91145d46ea504420b29b16ff16c981f28 /Public22.0.0/176原始artifact，正式重出六窄消费者；独立connector错误profile不改。发布必填expected_publication，闭集null或{current_version_id,state_version}，版本为精确正十进制且上限9223372036854775806；缺字段拒绝，不把失败／404视为null。本人历史读取沿原GET；Admin详情meta由Admin后续配对，App透明桥保持。

## 2026-10-21 Skills 历史消费者候选

固定BFF `d28f7db8b84deb7305fd4212c1469347c0e63e2f` /Public21.2.0/176，SHA256 `2c56fd63faa5ed7759133046dfda147bf1d360ddfb32f7570e55df38e487f786`；同一snapshot下六窄生成器配对，connector-command-errors独立profile不变。历史同源 GET /api/hub/self/skills/managed/{skill_id}/versions 仅接受唯一limit/cursor，映射正式GET /v1/self/skills/{skill_id}/versions；不转发主体、status或命令头，不新增写操作。闭集 data/meta、exact versions/publication、required nullable next_cursor 及错误status/no-store/request-id按固定BFF收边界。

本人包预览同源GET /api/hub/self/skills/managed/{skill_id}/package映射既有GET /v1/self/skills/{skill_id}/package，复用现包读取预算、有限body、文件路径校验、身份、request-id和失败语义；不走已退役目录读取、不用安装替换。浏览器把返回source_ref/revision与所选历史行再绑定，文件正文必须匹配先读目录。测试专用精确inverse恢复原21.1.1，再委托原21/模型/双父证明；无runtime旧版回退。

## 2026-10-21 原生退出确认产品化（既有退出链局部修复）

沿现 App 同源 IAM relay 与锁定 Better Auth 1.7.3；不改 IAM、权限、协议、Schema、退出范围或 Product tombstone。比较添加未持有的 id_token_hint 跳确认、替换/解析 vendor HTML、以及保留原生确认cookie的本地展示，采用第三种：只有已通过原relay校验的200 HTML、无Location及正向限时确认cookie签发，且为正常顶层HTML导航，才303至固定 `/auth/sign-out`。opaque cookie和原Path原样保留，App不验issuer签名、不把形状判断当最终授权。

固定Server Component只展示中文确认及显式原生form POST `/iam/oauth2/end-session/confirm` 的 action=confirm；返回首页不恢复已经终止的Product会话，渲染/刷新不自动发确认、登录或业务请求。原生issuer继续核签名cookie/300秒期限/session/client/注册回跳并正式撤销Session及关联凭据。失败顶层导航回固定退出失败状态，API保持原status；不复制上游正文、Location或失败cookie，不自动重试、不清其他登录交易。成功回跳暂保既有 `/login`，不顺带重写退出协议。

验证沿既有真实Next HTTP退出旅程补浏览器导航、无副作用展示/刷新与错误恢复；保原非导航/API、跨Origin、坏表单、过期/更换issuer会话和未登记redirect拒绝。展示使用既有Button/Card/token、无客户端状态或新依赖；协议跳转/错误保持no-store；最终Proxy核验nonce/CSP，固定无私有数据React页生产no-store、锁定Next开发模式按原生no-cache/must-revalidate（实际覆盖Proxy的缓存头），不改框架或放宽协议缓存断言；固定交互确认页用Referrer-Policy:origin及form-action self，保证原生POST带精确Origin，失败页/技术地址no-referrer。不新增Origin:null例外。 failure选择仅由failed字段是否存在决定，包含空值、非法值或重复数组；Page与Proxy一致，所有失败变体无确认form，不借显示参数授予退出。正常加载与正式issuer验收另记，不以参考模板或fixture成功称完整登录/Skills目标完成。

## 2026-10-21 原生租户续接错误返回

GET `/iam/interactions/select-tenant` 的合法成功导航不变；顶层HTML失败303到固定 `/auth/sign-in/failed`，不复制签名query或上游header/body，不自动登录或重发set-active。API、非导航和HTML q=0保原401/403/429/502/503语义。outer `/auth/select-tenant` 和inner路径最终使用no-referrer；失败页GET/刷新不发IAM请求。诊断只输出固定phase、数字status及已知native invalid_grant分类，无身份／密钥原文。该项只修产品返回与诊断，不声称owner并发已修。

## 2026-10-21 登录失败的产品返回边界

登录交易消费先验证闭集记录、canonical target、MAC及三项浏览器proof绑定，再以原值比较后原子删除；错proof、错secret、未知或腐损记录拒绝但不删除，保原短TTL。验证与删除之间记录过期或变化也拒绝；并发合法callback最多一次进入exchange。NX及300秒期限保留。当前唯一 ledger 记录为 product-return-v2，MAC同时绑定state、handoff namespace、OIDC namespace和目标；旧记录不双读。/login 原生表单固定 csrfToken＋loginIntent；后者签名绑定 origin、期限、handoff namespace 和精确产品目标，不接受共享 return cookie 或请求头替代。各 POST 新建独立 OIDC namespace，由 Auth.js 原生 cookies options 校验，不重命名已生成 cookie、不投影 Request cookie。

IAM sign-in 的原生表单仍为 csrf_token／email／password；每次 GET 独立随机 proof，cookie 名由精确签名 query 和 proof 的摘要共同派生。POST 原 issuer/path/method/query/form-cookie 绑定验证后才原值 CAS，一次消费；未证明失败零清理，已消费终态只清自己，Consent／invitation 不改。顶层 HTML 失效表单去固定失败页，不自动重发密码／OAuth；API 仍403。分配前检查每请求可见 proof 数及 cookie 分配预算（超额429），原 header 总字节预算仍为413；不驱逐别的有效表单；不是全局并发配额。

OAuth/OIDC 继续归 IAM，App 只拥有 Product 登录交互和会话。原生顶层 HTML 登录／回调／authorize 失败 303 返回固定 `/auth/sign-in/failed`，不复制 query、owner body、Location 或 cookie；新页复用 App 现有 UI 组件与语义 token，显示登录状态及显式返回入口。失败页仅只读核当前 Product Session：canonical host 下 active 且 access 未过期才导航固定 /app，由原 AppLayout／AppGate 继续 fresh 准入，不猜原 Conversation／Project。无有效证明保显式恢复和登录；挂载及 focus／online／pageshow／可见恢复仅 GET 既有 /api/auth/session，每轮共用10秒绝对预算、最多2次GET，严格 authenticated／subject／未来 expires_at 后才 replace /app；隐藏／卸载退休且拒迟到。显式恢复只重读及 RSC refresh，登录只有用户点击 /login；不自动 OAuth／POST refresh、不消费旧 state、不改 cookie／storage，也不创建或恢复 session。API／iframe／非导航和 HTML q=0 保留原错误 status／JSON，不变成成功。

合法 issuer error 必须先满足唯一 query、精确 issuer、state 与浏览器交易绑定并一次性消费；配置类失败仅记录固定分类，不记录 state、描述或凭据，不调用 token exchange。旧回调、错主体和重复回执不清除较新登录的 cookie。账户三 scope 是当前正式功能依赖，应通过 IAM 原有 Product Web client/resource 演进入口配对；不删除 scope、添加权限回退或把环境故障归咎于用户。

验收分开记录：定向回归、隔离真实 Next/Redis 交易、正常环境 scope 回读及新登录。旧会话能打开页面不等于新登录通过。正常配对与完整 Skills／后台／MCP 仍按既有计划收尾。

## 2026-10-21 Skills 正常配对：公开契约

唯一BFF snapshot固定192396d29678e7977fce9c4ab837b249aaf1af93／Public21.1.1／175操作，SHA256 eff6676131081b20ba36fd4be243075c568ebd27358662a9c09fe3216b097848。只承接owner项目／个人Skills并集描述，保当前模型配置及全部既有消费者；六窄生成器正规重出，connector-command-errors独立发行物不变。测试专用逆证先严格还原原21.1.0全文，再保留既有模型与历史双父证明；不新增运行时旧版本兼容或改变执行授权。正常服务加载、页面回读和完整旅程仍待验证。

## 2026-10-20 MC-02 Public21.1模型配置桥（本地候选）

唯一BFF固定 `f3da7d5feb855b2b97c77a6ae9928cee96e1b8aa` /21.1.0/175，SHA256 `4db8bab6159a2f36061f8b292fba9074ea2614adab2a1489bf9d1b3b066b6fe3`。仅扩现Admin Product adapter的10具名模型配置路径，复用原Product session、服务身份和request-id，原body/key/CAS透传；发布严格证明实际EOF，不虚构JSON正文或丢幂等头。没有直连System/读取运行Key、模型执行、自动重试或新的OAuth。

七现有生成器按固定artifact正规重出；test-only21.1→21精确全文逆回，再委托原21→20及历史oracle，不作runtime兼容。Skills/MCP、自动化、聊天与其他owner语义不变。主方完整相关门与正常页面分别验收，受控peer adapter测试不是owner整链证据；首次完整测试缺资源配置的失败保留，后续按既有受管Redis隔离prefix验证。正常切换及集中PR尚待，模型/实际工具/扣费暂停。

## 2026-10-20 MC-02A Chat模型请求与身份

业务 `message.model` 必须为 raw candidate.name／System label_key，例如chat/fast，不加provider前缀、不用alias/request_model替代。Chat SessionClient固定 `/models?feature_key=chat`；同源query原样到BFF，响应只接受feature_key=chat，否则整体parse失败。候选显示仍用display_name；没有旧provider:name运行时兼容。

## 2026-10-20 Public21 ModelCandidate 严格消费

`GET /api/session/models`消费BFF既有 `/v1/models`：closed item required provider/name/is_default/display_name/model_id/revision_id/provider_id/feature_key/request_model；name为稳定label key，provider用owner明确值（均1..128），display_name为有效别名或原模型名（1..255），三ID为UUID，feature1..128、request_model1..255。closed data必需models及nullable next_cursor。拒旧四字段、缺字段及额外连接/密钥内容，不按别名/slash猜身份。

Public21仍165 operations；正式snapshot/pin固定Root已交付513b18e的Git原字节并正规生成。六public generator及已有非model闭包不扩面，第七独立connector-command-errors来源不换。浏览器和同源桥仍只访问BFF，模型执行许可不变。

## 2026-10-20 Admin模型同源桥（实施设计）

现有 `/api/admin/[...path]` 增加 GET `/api/admin/model-routing`、`/api/admin/model-labels`、`/api/admin/model-revisions` 与 PUT `/api/admin/model-routing/{label_id}`；上游为BFF相同 `/v1/admin/*`。只接受正式方法和路径，不放通任意model前缀；Product Session、可信request-id、no-store与原错误envelope保持。PUT透明传递原 `If-Match`／`If-None-Match`，非法前置条件由owner正式400/428决定；不替调用者构造版本或新幂等键。目录GET的命令/CAS头被拒绝，不借桥层丢弃头将非法读转为合法读。

## 设置与主线的契约组合（2026-10-20）

本次视觉增量不定义新接口。正式知识 CRUD/usage、Public19、Skills/MCP 与连接器 availability 均保留最新主线实现和正式契约；旧分支的知识未接通说明仅适用于 preview 草稿与记忆导入。账户积分仅复用 summary 读取，其余无 owner 契约的资产动作仍禁用。

## 设置内部流程的契约边界（视觉增量范围）

本次沿用现有同源 BFF 边界，无新增 API、generated、scope、权限或 owner wire。账户积分概览仅复用 Billing summary 读取，可用和冻结 micros 以 BigInt 格式化；未开户、错误和真实零余额分开，summary 不用于推算套餐事实。

邮箱验证、绑定、删除账户、邮箱与号码分配、钱包支付、知识保存、API key、Webhook 和外部应用授权没有本次可消费的完整写契约，最终动作禁用；浏览表单或说明不发送替代请求。正式套餐目录只读和手动重读保留原有取消、预算与身份边界，不触发 checkout。

Team 表单复用现有邀请 request schema，局部格式错误不调用客户端；真正写入结果未知时的恢复守卫不变。分享恢复重读时清掉旧审阅资格，不新增请求或自动重试写入。Skills/MCP 契约不变。

## 2026-10-20 既有 Public19 的保留消费者接线

唯一 snapshot 继续固定 08a2120／Public19.0.0／SHA-256 955412b680bf7a2529c4c35f553ff272d7361769ea95bb441ba820b552ffc564。Library 仅消费已有 q/type、精确 metadata／content；Web 本地分类与 return target 区分 audio/video，不恢复 websites/media 宽松值。

知识同源 adapter 仅路由已发布 preferences/knowledge 列表、单条 GET/PUT/DELETE、knowledge-usage GET/PUT；可信 subject 来源仍是 Product Session，严格输入／版本 CAS、未知写不自动重发、主体与 generation 变化退休旧读取。未接通的 Agent 知识应用仍明确标注，不把 usage 保存当执行验收。

## 2026-10-19 MCP 既定可用性消费者配对（隔离候选）

承接已确认的Platform只读五态方案与BFF本地850ffe1，不新增owner/API/Schema/刷新轮询。现严格browser decoder的Connector与PrivateServer必须消费availability五态，缺失/未知不回退status/enabled；历史header描述保完整，写入32项限额不动。原同源handler、身份/版本/CAS/原命令恢复不变。Public19和独立command-error发布物不变，本片不把MCP个人字段塞入不含它的Product OpenAPI。

复用原卡片/详情结构，仅一个小状态组件由owner字段显示当前可用性，active但过期不再展示可用对勾；enabled/status仍分别控制原管理动作，显示字段不触发续期/重连/模型/工具。状态文字是Kokoro已批准事实说明，不冒称Manus已观察到相同后台模型。Admin只消费Provider目录/受管包与Skills，不消费本人Connector/PrivateServer，核验闭集后不为对齐创建无用Admin字段/组件。

写区：现mcp-connector.schema、四处list/detail/picker状态、单状态组件、字典/原测试夹具/现文档。沿原测试补缺失/未知/五态独立与安全历史描述回归，相关交互/全本仓门后再交付；正常934输入保护，不改正常服务/数据库/登录/模型/工具/扣费，源码验证后按既有授权集中PR，不等CI但不冒CI通过。完整正常整链和Manus页面验收仍未完成。

## 2026-10-19 收尾集成候选：完整既有分支与固定 Public19

只集成 main d42fe1d2、PR37 的原生浏览器登录回归、PR38 的六页设置与完整 local362a9b7；保真实 merge ancestry，不按功能片继续开 PR。知识/记忆等其余混合工作保持原位，不在本次顺手接通。唯一 BFF snapshot 固定已合 owner08a2120ea85b6cad5cf6e839ef14dbf83d908b92、Public19.0.0/165、SHA256955412b680bf7a2529c4c35f553ff272d7361769ea95bb441ba820b552ffc564；六个既有窄 generator 正规配对，connector-command-errors 独立 profile 不换 pin。

复用原测试历史逆证，在原 Public16→15.4→15.3 前增加显式 Public19→两个完整 Public16 父版本的逆 delta，保原全文 hash/语义与退役 MCP 写入口负控，不在生产兼容旧协议。接入已经交付并在正常开发环境配对过的 calendar consumer：来源逐路径绑定既有 app-public18 冻结证据，使用每周多星期、每月多日期、一次性 local_date、IANA timezone 和 owner next_run_at；不再消费已退役 recurrence_anchor_at。仅接收该既有切片所需源码、字典及测试，不 wholesale 导入混合工作树。

主干 archive receipt/权限/账户/分享与本地单一 per-scope Reader registry、MCP command provider/受控 Skills scope/刷新及 callback 围栏按语义并集。archive revision/receipt 进入原 Reader host，不再启动第二读者；稳定现 archive retry callback，展示层只接实际使用的归档操作和 busy，不保无消费者字段。旧测试 fixture 接真实 keyed Reader hosts，保原退休/真实 GET/归档断言；未弱化浏览器 Origin:null/CSRF/nonce/CSP/第二次登录。无新 owner、API、DB/Redis schema、网关或认证旁路。

所有验证尚待最终冻结全门；本段是当前集成范围，不声称已合并、页面已对齐或正常服务已重载。正常数据库/配置/服务与已有混合工作均保留，模型、实际工具与扣费仍暂停。

## SET51 当前 `/login` 的浏览器启动表达（2026-10-16）

当前成功 `GET /login` 是 `200 text/html`、no-store、单一固定 `/api/auth/signin/kokoro-iam` POST 表单；Web 签发 HttpOnly CSRF cookie，浏览器携同 hidden token 提交后，provider 才返回 302 到同源 `/iam/oauth2/authorize` 并签发 state。当前请求 nonce 对应最终 HTTP CSP，文档 meta 要求 no-referrer；真实 Chromium 因此发送 `Origin: null`，沿用现有固定 provider-start、canonical Host 与 double-submit CSRF 共同限定的窄例外。它不扩展其它 action 的 Origin 资格，错误 Origin/CSRF 仍拒绝。无可见重试界面；先前“GET 成功直接 302”的说明已被替代。SET51 只更新真实 Next 回归，不新增或修改业务契约或 issuer/回调/退出确认规则。
## 个人资料输入反馈（2026-10-16）

仍消费既有四字段资料GET/PUT及expected_revision；输入上限由现personalization-schema唯一常量提供，无wire、路径、请求、响应、错误码或generated变更。过长尝试仅反馈未采用，合法旧草稿保持原blur保存语义；未开户Web契约消费仍未实施。

## 个性化内页与数据管理排版（2026-10-16；设计边界）

依据本轮实际 Manus 界面：个性化含个人资料/知识页签、名称/使用时机/内容知识弹窗，以及复制提示词/粘贴内容的记忆导入弹窗。当前 BFF 只有四项资料字段，没有知识存取或记忆解析契约。本片只补浏览界面和本机复制；资料继续沿既有可信读取/CAS保存，不新增业务请求。知识和导入最终保存动作保持禁用并展示原因，绝不虚构空知识列表或成功导入。数据管理保留真实分享/归档读取、分页、确认和恢复，仅补三行管理用途及排版。

Owner 为现 Web 设置模块：扩展 personalization-card 负责页签和既有资料；同级 personalization-knowledge-panel 负责知识浏览/草稿弹窗，memory-import-dialog 负责导入说明/复制/临时文本；沿现 sections CSS、九语言、现组件和浏览器测试。选择同级具名组件而非全塞资料卡（避免不同弹窗职责混合），不建新目录或全局状态层。弹窗复用原 Radix Dialog，支持键盘/焦点返回/窄屏；关闭即卸载文本草稿，不写 localStorage、API、账户资料或服务器。复制失败明确反馈，未完成复制不显示成功；不从其他网站自动采集用户记忆。

验证：原资料字段保存与全部旧业务断言保留，明确迁移旧“入口禁用”断言为“可浏览但不可提交”；验证页签/两弹窗/复制失败与重开清空、嵌套 Escape 和手机布局，随后组件、lint/typecheck/build、contract及architecture。Skills/MCP/连接器、generated、依赖、owner协议及数据库均排除。

## 设置页面内部排版（2026-10-16）

本次内部排版不增加或改变 HTTP、generated、权限、存储及 API 契约。未接服务按钮继续 disabled 并由可见 aria-describedby 解释原因，不呈现虚构空账户或成功结果。

## SET53 资产及服务页面边界（2026-10-16）

六个菜单扩为页面，不增加 HTTP/API、scope、生成契约或 owner 能力。固定 BFF public16 没有 Mail/邮箱资产/电话/支付钱包/API 密钥/Webhooks 管理闭环；现 beta agent connection setup 不在本次调用范围。页面导航和局部页签可用，其余服务动作禁用且说明不可用，不发送业务请求、不伪造读取成功或空列表。既有登录邮箱、积分、Skills/MCP 不改作新资产事实源。

## SET49 主线与设置契约组合（2026-10-16）

本次不增加浏览器API或授权能力。Web继续只消费BFF固定发行，承接主线已批准的MCP契约删除以及现设置账户/分享/归档增量；所有既有生成组必须从同一正式owner全文、commit、digest正规再生成，不混合pin或手改generated。当前已运行实例不因源码push自动切换。


当前固定BFF30df0c428c592ed2710d62035ceb5855d20c7506/public16.0.0/146，全文SHA-256 b4e91483e425fdcc9547eac8bcda554273cbee0863ccb0ddfb185fae18e4e267。严格继承主线四个MCP公开写操作退休；七段精确逆向仅为测试保留旧设置契约oracle，不进入产品。下方SET47 pin属历史发行。

## SET47 归档任务同源消费者（2026-10-15；已消费正式owner候选）

SET47传输边界补充：WHATWG会规范化单独的`.`/`..`段及其percentencoded形式；BFF保持原始HTTP的exact encodeURIComponent契约。Web对仅这两个历史ID在任何fetch前拒绝并将动作禁用、解释不可用；不使用双重解码/替代API，也不宣称任意历史ID浏览器皆可操作。其余合法Unicode ID不限制为conv UUID。依据：[URL Standard](https://url.spec.whatwg.org/#single-dot-url-path-segment)。

唯一外部事实源是BFF public15.4.0/150正式发行53f222ec41500d7a608da0c221a4695c402ff678（全文SHA-256 87186311e67eeebcd5f27d7974326186e1912de49d18d4d524a0bcbc940a0817），四操作：listOwnedArchivedTasks、getSessionArchiveState、archiveSession、restoreSession；只读src/generated/bff-public-openapi.yaml已固定owner原字节并正常生成新窄客户端，禁止手改产物。历史15.3/146全包digest为694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5。新outer inverse先严格恢复该完整旧包，再运行所有旧断言/hash/negative；生成器及whole-artifact provenance按新发行精确迁移，不修改Skills/连接器业务断言。

Web browser-private固定GET /api/account/archived-tasks与GET/POST /api/session/sessions/{encoded-id}/archive、POST /api/session/sessions/{encoded-id}/restore。沿既有session catch-all在generic proxy前精确分派archive/restore，其他操作不扩展；方法不允许则405。历史非空Unicode session ID采用唯一可逆encodeURIComponent编码，不强制conv UUID。列表仅limit/cursor闭集，POST仅严格JSON空对象、实际body含EOF最多4096字节、允许未指定或identity编码、允许chunked但拒Content-Length冲突和不支持的编码和唯一可见ASCII无逗号/空格1..128 idempotency-key，命令禁止query。状态/ACK为data.session_id+archived_at，不构造旧Chat meta envelope。

两个具名server adapter沿固定Host/scheme，GET如带Origin须精确匹配，命令必需精确Origin；Product Session必须在线有效，所有BFF调用使用现正式server-only admission headers。参数Promise、body EOF、会话读、固定上游headers/EOF/strict JSON以及最终会话六字段id/generation/subject/access/accessExpiresAt/expiresAt复验共享单绝对10秒与request.signal。严禁重定向/透传Location/Set-Cookie；响应头+body最多1MiB、UTF8 fatal/BOM/重复键拒绝、精确request ID/JSON/no-store；success/error嵌套严格schema、精确目标session ID、cursor身份与limit/顺序闭集，错误message受控清洗，Retry-After仅正式429范围。

浏览器具名四方法均支持AbortSignal，POST不自动retry；不新增machine token或浏览器自报tenant/subject。可读任务不推导可写权限。超时/断线的写入结果未知，UI先权威重读再显式继续，不将本地marker/旧ACK等同当前owner状态。新system测试当前为具名handler与依赖替身验证，覆盖总预算、EOF、最终六字段会话退休、严格目标/action及合法framing；真实Next HTTP和正常认证CUA仍由Root后续验收，不能以handler测试冒称端到端。

## SET43 已移除会话的账户资料读取（2026-10-15；D0，先真实HTTP负控）

测试夹具补充：GET不执行的Auth.js agent factory因server-only导入需空stub；身份准入与requestWithDomain仍是真实HTTP。前两轮仅collection失败，不算行为RED。

仅browser-private GET /api/account/profile：已确认BFF401 session_invalid在线拒绝映射既有401 account_profile_session_required；服务认证/503/畸形或未绑定结果仍503，不把所有401当失效登录。BFF /v1/me原精确error/meta envelope，不接受retryable plain包络；本次outbound ID绑定x-request-id及meta，JSON MIME允许charset、不接受json-malicious，no-store且无Location/Set-Cookie。其余原200/userinfo/错误形状、上限和总预算保持；不新增owner API、scope或授权。auth/session GET本地投影、callback/refresh策略不改。

## SET42 任务发送行窄屏排版（2026-10-15；D0）

任务发送现禁用queue选项仅改窄屏排版，无HTTP/事件/授权/契约/provider变化；不得开启灰选项或宣称其它发送策略已实现。

<!-- SET41 V2 D0: V2只增加General现滚动table固定布局和语言select宽度上限，无任何传输边界变化；不改共享组件或radio/provider语义。 -->

## SET41 主题选项窄屏可达性（2026-10-15；D0）

仅现主题布局换行；无wire、HTTP、事件、授权、幂等或版本变化。原radio语义与provider存写接口保持。

## SET40 V3 焦点协调归属（2026-10-15）

扩现AppFrame overlay hook，只在焦点未处于设置内部时执行原初始handoff；无API/wire、授权、schema或持久化变化。Root唯一writer；Skills/连接器业务不变。

## SET40 具体设置项搜索（2026-10-15；D0，先tests-only）

基线Web f82c891965f80eed9ff0c022d3f77b39bdbad42e，939 tracked clean。Computer Use实际Manus：昵称→个性化+昵称、点child切页并保query/结果焦点；通知→通用+浏览器通知；仅菜单名命中只parent；无匹配未找到结果、当前内容不变。现仅菜单过滤且强留selected，窄屏隐藏search，存在明确功能缺口。

现Navigation/Modal/CSS提供静态设置项搜索，仅导航既有页；无API/wire/schema/owner授权/持久化变化，Skills/连接器业务保护。

## SET39 英日文实际设置缺译（2026-10-15；D0）

仅现有en/ja补实际调用MessageKey值；无API/wire/schema变化，全旧值、全tests及其它源保护。

## SET38 六种语言的实际设置缺译（2026-10-15；D0）

基线Web 76a42c2e574eda12b86d97eaaf30d1bad3380068，939 tracked clean。runtime_audit唯一writer仅现ko/es/fr/de/pt/ru六locale，926文件保护/Root7；所有tests和产品逻辑字节不变。

仅现六locale补既有MessageKey native值，无API/wire/schema/owner/依赖变化，原value/全部tests与其它产品源保护。

## SET37 登录刷新早期失败诊断（2026-10-15；D0）

基线Web 01780925f62f5cdf2552567d8f97d0c0ee85abc5。runtime_audit仅改现OIDC实际Next测试；932文件保护，Root6文档。产品源码、原race/count/oracle/timeout/fixture/cleanup均不变。

仅测试观察增强，无API/wire/存储schema/owner变化；所有产品源码和原业务断言保护，已有诊断输出净化不变。

## SET36 复制当前任务链接（2026-10-15；D0，先tests-only）

基线Web 97a6d9694cf9e52d54c50d516fac7cde2889bcf1，939 tracked clean；runtime_audit唯一writer，最终13现source/4现test/914保护/Root8。先仅四现test可追加，927其余字节保护。Root方案/docs/独审/原source RED/Git/资源与正常激活。

仅复制当前同源需登录的正规任务URL；不调用share/create权限接口，不增加wire/owner授权或改变现后端契约。所有Clipboard仅当前用户明确按键动作发起。

## SET35 十四个实际设置日文提示（2026-10-15；D0，仅现locale）

基线Web 3f97368ef38c9cea4c88d53ad29e61b83a8716eb，939 tracked clean；runtime_audit唯一writer仅现src/i18n/ja.ts，931保护/Root7。Root设计/docs/独审/Git/资源与实际回归；全部tests与其它locale/产品逻辑字节保护。

无API/wire、授权、owner或HTTP行为变化；仅现locale提供实际设置提示的日文内容。

## SET34 到期日期测试按实际时区验日末（2026-10-15；D0，仅现测试）

基线Web fd627496a6f860c7ed3e1afef51c65fbc3bcca57，939 tracked clean；runtime_audit唯一writer仅现tests/ui/kokoro-scheduled-surface.test.tsx，932保护/Root6。Root设计/docs/独审/Git/实际复核；全product source与其它全部测试字节保护。

不改产品API或wire；仍提交同一timezone与UTC expiresAt，只修测试对所选当地日期日末的独立预期。

## SET33 两条原生withdraw测试的就绪前置（2026-10-15；D0，仅现测试）

基线Web d7f5d5d41ce4740de219480ccd6d7bf7d9166d40，939 tracked clean；runtime_audit唯一writer仅现native测试，931保护/Root7。Root资源/Git/docs/独审/正常运行；全部product source及原计数/安全assert/timeout/mock/cleanup仍保护。

无产品API/授权/owner变更，仅测试初始准备阶段确认runtime请求到达；原HTTP/status及全部count/safety断言保持。

## SET32 原生登录请求顺序诊断（2026-10-15；D0，仅现测试）

基线Web 52b535789b93ebac740db7aa8e5296c82b6622b6，939 tracked clean；runtime_audit唯一writer仅tests/system/oidc-rp-next-http.integration.test.ts，931保护/Root7。Root设计/docs/独审/资源/Git与正常实例。现runtime修补已接收，终态20focused/3987PASS7旧FAIL/Playwright20PASS4原SKIP；不能据此认定R175/R177旧native多请求根因。

只在测试进程输出closed category、sequence、相对elapsed ms、status、phase及stage；不得记录原URL/query/header/body/cookie/token/异常全文。无正式API/contract/owner/授权变化，不能用诊断记录替代原生实际断言。

## SET31 runtime请求退休（2026-10-15；D0，先tests-only）

基线Web dc26502bfa47ba0c22422623118b455d46644be0，939 tracked clean；runtime_audit唯一writer，1既有hook/1既有test/930最终保护/Root7，先仅tests其余931保护。Root设计/docs/独审/资源/Git/正常激活/CUA。AppGate及原生R175/R177全部源码/oracle保护；不扩大trusted admission接口，不把hook负控冒称原生多请求根因。

沿原同源 /api/system/runtime-manifest、原product_id/locale/surface_id和Accept header，System仍是正式呈现事实owner，认证仍由Product session负责。无新授权、contract/HTTP错误/status/query或owner服务变更，取消只退休本hook拥有的请求。System可选呈现不可阻塞核心Chat。

## SET30 未接通菜单与账户操作说明（2026-10-15；正式D0）

基线Web 0ab7bfaedf7425332049f5f867bcec79fccd285c，939 tracked clean；runtime_audit唯一writer，12既有source/920保护/Root7。所有tests原字节保护；Root设计、docs、独审、资源、Git、正常激活/CUA。实际Manus菜单已有对应本地入口，七个placeholder及三账户按钮仍按能力不可用，不引入owner/contract/API/deps或新source。

两个新增纯本地化key settings.unavailableNavigation、settings.accountActionsUnavailable；中文zh位于messages.ts的zh对象，八语言overlay各自翻译，只可追加这两项，原locale数据逐字保护。说明不表明接通新服务，也不重新启用或请求任何禁用能力；团队仍是当前部署租户的成员管理，不冒称创建团队。

## SET29 侧栏账户余额可信读取（2026-10-15；D0，先tests-only）

Web基线2d31cd502db44b5b0ad74e52321cba755624896f，939 tracked clean；runtime_audit唯一writer本片4既有source+1既有rail测试，927最终保护/Root7；先仅测试准入，其余931字节保护。Root管设计/docs/Git/资源/正式激活/CUA，Skills/连接器业务排除。

Web只调用原browserBillingClient.summary(signal)→同源→正式BFF/Billing；服务器权限/契约/金额/checkout/依赖/generated不变。本片是读取资格与本地投影生命周期，不是新授权或业务余额事实。admin-access/menu/signout原子树与其他读取不改。

## SET28 Web阅读轴滚动槽修补（2026-10-15；正式D0）

正式Web基线7e062cd5e69847bfb34181b6674cb998c4cc50f1，939 tracked clean。runtime_audit唯一writer仅app-frame-main.module.css；931保护/Root7。Root设计/docs/Git/资源/正常激活/CUA。既有精确E2E已多次真实RED，无新tests-only或新增镜像测试；全部tests/阈值/mock/skip/等待保持字节。

本片无API/权限/owner/依赖/新源文件/生成变化，所有请求与状态控制保留；仅Web现有阅读视图样式。Skills/连接器与设置行为排除。

## SET27 个性化未接通入口（2026-10-15；正式D0）

Web基线91fb1aee87df9e6dc0acadcdda4db5375623a13a，939 tracked clean；runtime_audit现Web唯一writer，12具名路径/920保护/Root7。Root设计/文档/Git/资源/运行/CUA。独立候选审查无确定P1/P2；原SET26已接收，本轮只个人资料呈现，不混入余额/支付/阅读轴。

无新增API/contract/owner/依赖/源文件/业务调用；知识与导入只可见禁用，不请求服务。四字段继续现正式profile读取与保存，不能误断言整个面板零请求。hook/client/schema与其他设置/source字节保护。

## SET26 body retirement correction (2026-10-15)

The plans optional AbortSignal and total 10s contract also retire the owned real body reader. Reading and decoding remain within that same budget; timeout and parent abort cancel the reader and release the lock. GET/no-store, schema, 503 mapping, money wire and the entire checkout transport stay unchanged. No additional body limit or header requirement.

## SET26 用量与套餐可信读取（2026-10-15；正式D0，先tests-only）

正式Web基线a9183585ab403797f79b522aedb120de562a64e9、939 tracked clean。仅现Web Billing/Pricing/settings消费接缝，runtime_audit唯一writer，17具名路径/914保护/Root8；Root独占设计/docs/Git/资源/正常运行/CUA。候选独审无确定阻断P1/P2。Skills/连接器、owner契约/SQL/generated/依赖、checkout源码与全局QueryStore保护；无新源文件/模块/owner。

仅既有PricingClient.plans加可选AbortSignal及准确timeout/aborted failure reason，现同源GET/no-store/严格schema/503 not_configured/金额wire保持；每call一个绝对10s race，signal转owned fetch，取消body可用时执行，headers/body/schema无phase预算重置或自动retry。checkout整体原字节保护，当前UI永久disabled购买且0checkout/redirect，owner capability不因目录非空而成立。可信scope只本地投影/生命周期，不把subject/generation/actor写wire，不复制BFF/Billing契约。

## SET25 浏览器测试就绪边界窄准入（2026-10-15）

仅现tests/e2e/web-governance.spec.ts原65/107/267/405/470五个初始/app goto覆盖六例：networkidle改DOMContentLoaded后准确Chat input可见/启用/可编辑web断言。原229及其余goto保持。已有实际六desktop等待超时证据及只读独审无确定P1/P2；官方Playwright建议测试以web断言判断ready。原logout POST/issuer、reading轴/长markdown/stream/HITL所有业务oracle、mock、skip、timeout、route保持，R137观察器仍先于首次发送。不能以输入就绪冒称业务通过，也不宣定位具体网络请求根因。无Product源码/fixture/权限改动；沿runtime_audit同一writer，SET25扩为13writer/919保护/Root7，仅本项追加范围，其余原边界保持。最终正规E2E运行仍待验。

## SET25 原有模型偏好深链可靠性（2026-10-15；正式D0，先tests-only）

Web既有chat-prefs/ChatPreferencesSection/旧chat深链局部修补；正式基线6921a1cbffd723fc37c4cc64342bb3a6f89369a1，939 tracked clean，12writer/920保护/Root7绑定。唯一writer runtime_audit，Root设计/文档/Git/资源/运行/CUA；候选独审无确定P1/P2。Manus General实为任务发送偏好，现TaskDelivery已对应，不加General模型/左栏入口，更正旧卡注释。无新源文件/模块/owner/依赖/CSS，通用store/client/API/generated/Skills/连接器保护。

无网络/API/owner/contract/generated/auth scope变更；现同源model list与ModelCandidate类型保持，listModels()不扩signal。单10s只截止UI观察，不表示底层请求已取消。writeChatModel从void改准确boolean仅本仓内部函数，唯一写caller消费成功，readChatModel/composer保持。目录Retry仅原GET，保存retry仅localStorage，无模型执行或BFF写。

## SET24 账户退出失败恢复（2026-10-15；正式D0，先tests-only）

Web现有AccountCard退出交互的局部修补；基线03fc794403116f93c318eeec3534ae0d199cb690，939 tracked clean。Root绑定921原保护，唯一writer runtime_audit；Root独占三设计/CURRENT/相邻INDEX与Git/资源/运行/浏览器，storage_platform_audit只读审查。Skills/连接器、Product auth client源码、API/contract/generated/lock/依赖/CSS及其他owner排除。独立D0审查无确定P1/P2。

不改传输或正式owner合同。现endProductSession(navigate,signal)完整保留：GET /api/auth/csrf、form POST /api/auth/signout、既有合法issuer URL与503 handoff。AccountCard只提供有界生命周期和导航护栏，无新scope/header/API/授权、CSRF绕过或host放宽。未确认结果不能自动POST重试或假成功跳首页；手动重试由用户明确点击。

## SET23 通用语言与主题保存失败反馈（2026-10-15；D0与Root真实RED通过，具名source准入）

归属Web现有浏览器偏好Provider和General AppearanceCard，是现文件局部修补，不新增模块、API、owner、依赖或存储框架。正式基线293ac84d7b2b6562b73e46c56436aadc4c1c2e3b，939 tracked clean已绑定；原主题/语言即时生效，setItem失败无提示，不能说整体不可用。候选独审无确定P1/P2。

本片无网络或机器contract变更，仅两现内部Context增加分别的persistenceFailed boolean。现setMode/setLocale签名与调用保持；只有显式当前选择或重试调用写原localStorage。成功仅清自身失败，其他Provider错误不变。alert及retry两文案键在九语言追加，旧键逐字保持。不改变账户、Team、Data、Skills/连接器请求或正式BFF15.3 pin。

SET21分享浏览器接缝准入澄清：现 engine/client.ts 仅 createShare/revokeShare 两方法可共用具名有界分享调用，createShare 增可选 AbortSignal，原 POST {}、idempotency key/value、路径编码和 flat ShareReceipt 保持。两分享操作各浏览器单10s覆盖 fetch/headers/body/strict ACK，停止分享外部单10s同时涵盖写与完整重读；不扩大 generic postJson、其他会话/SSE/Move 方法或 ShareButton 源，不新文件/框架/依赖。现 client-artifact-share 测试可沿这两个方法补具名 deadline/abort/坏ACK负控，原 oracle 保持。现 lint/type 通过是阶段输出，终态仍须重新冻结和复验。

SET21/22阶段更新：两冻结原client/modal入口由Root实际复现4FAIL/47PASS，現沿CURRENT具名source/正常正式生成实施；D0预算/身份/closed ACK/恢复和当前同页Data结构不变。历史tests-only文字不再表示当前无source权限。

SET21/22正式消费前置：BFF eec3244645d5129407147774ecb07e03848420c4，public15.3.0/146全文SHA256 694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5；当前只授CURRENT具名两现tests-only真RED，source/机器等待Root复现。旧15.2消费pin仅待正规整包原字节与正常窄生成更新，不手改生成。

SET21/22参考页面澄清（Root实际CUA）：Manus Data为同页依次“已分享任务”“已分享文件”“已归档任务”三段，不是页内三个tab；其下授权应用、云浏览器数据、已购买域名各有管理入口。Web只新增Data/Help两导航tab，Data内容沿同页三段及三管理行。现只任务分享具备真实owner，其他段保不可用说明/禁用管理，不制造“暂无”的假空事实。Help为侧栏底部本产品帮助入口，不能复用Manus客服。

## SET-21/22 browser-private Data/Help（2026-10-15；D0独审通过）

server以正规oidcRpConfig固定tenant及HttpOnly subject校验sht1；不接受browser/URL/body自报tenant。browser ProjectReadBoundary无tenant，只核subject与已由server验证的分页一致性。

新列表title保旧原string；同毫秒session_id顺序使用正式owner拟定的UTF8字节序（COLLATE "C"），不以JS UTF16或localeCompare猜序。正式发行前仍不消费该候选。

public唯一BFF，当前正式a88/15.2/145；拟15.3的GET /v1/account/shared-tasks在正式提交前不作为消费依据。后继单正规artifact+窄generated包含新GET和原createShare/revokeShare，旧能力shape/hash逆门不放宽。

GET /api/account/shared-tasks映射新public GET；query仅canonical limit1..100（本页固定100）/非空≤2048 cursor，拒未知/重复/坏percent/UTF8/body framing/encoding/Idempotency-Key；200恰{data:{items:[{session_id,title,shared_at,expires_at}],next_cursor}}，无meta/capability/URL。cursor须closed sht1实际tenant/subject/limit/末条anchor一致、next唯一、items安全排序且唯一；空页next=null。public错误closed error.code/message/retryable及status按正式机器，Web私有metadata/会话/响应校验错误独立且不伪称public。no-store/requestID只header，429 Retry-After沿正式可缺省/存在1..86400，其余无。

Share继续现/api/session/sessions/:id/share POST/DELETE，仅该exact路径入新有界支路；正规query scope/project_ref和Idempotency-Key保现语义，不加UUID/trim/ID长度猜测。POST真实{}、DELETE真实EOF（Node Next可能有空stream）。200原BFF closed data.share_id/meta.request_id严格原文+请求header绑定后投影原flat {share_id}；不存在session_id ACK字段，不能称ACK逐目标字段绑定。删除ok:true错误解析，无新停止分享endpoint。正规error envelope先闭集/请求ID验证后沿原flat错误，非法/未知响应502且视unknown；不透SQL/owner message。非share generic/SSE/Move行为保持。

单10s含params/body/session/上游/最终六字段栅栏，BFF响应和browser响应总≤1MiB、fatal UTF8/BOM/decoded重复key/深度32，browser redirect:error。mutation明确canonical Origin，GET允许无Origin或完全一致。无自动重试/新scope/client/credentials；preview、Help、禁用区域零API。

## SET-20 browser-private Team 可靠性（2026-10-15；V2冻结独审通过，Root集成验收中）

唯一正式合同仍为BFF a88/public15.2九个Team operation；本片不编辑snapshot/generated/public schema或IAM API。现/api/team/[...path]只映射现members/invitations/roles及六mutation；成功均200，closed data/meta字段与正式error envelope保持。caller actor/tenant永不从body读取，leave内部期望memberID只用于客户端ACK校验，不传输为身份字段。

canonical scheme/Host全部核，GET Origin缺省或完全相同，mutation Origin必须明确完全相同。无query的mutation同时拒bare?；未发布Idempotency-Key、content-encoding或body字段不接受。create/replace JSON原文≤16KiB、fatal UTF8/duplicate/closed；resend/cancel/remove/leave只允许实际EOF，在同一预算内验证为空，不转发fake空JSON。路径及page query沿原闭集，不新增接受/切团队/创建团队API。

server单10s从入口含params/body/session/BFF全响应及最终六session等值有效核；browser单10s、2MiB headers+body且主动取消不合作读取/迟到fetch。成功严格raw schema、200、no-store、meta/header request-id一致，正式4xx拒绝与未知网络/401最终身份变化/5xx/坏ACK区分；错误message不透未验证的原始upstream值。九操作429的Retry-After可缺省，存在时为^[1-9][0-9]{0,4}$即1..99999；503及其他未声明状态不接受该头，不套用姓名的必填或86400规则。server final-session退役即便owner已成功写仍401，客户端不能假未提交。

创建invitation ACK只新ID/pending；resend/cancel绑定请求invitationID；replace/remove绑定请求memberID，replace绑定完整角色集合；leave绑定已完整权限加载得到的actor memberID。首次权限加载查actor及全role有界20页/2000条、whole-read10s；未知写或ACK后刷新失败拒第二写，只有完整成功authority reload及显式决定可继续，More不提供该资格。subject/admission/generation/close/unmount退役结果及signout signal，无自动mutation retry或邮箱投递承诺。

## SET-19 browser-private 姓名PATCH（2026-10-15；源码已接收，正常浏览器待验）

现GET /api/account/profile保留userinfo读取。新PATCH同一路径只调用正式BFF a88e710d2201342200017f44c2bc34325937b5d0/public15.2.0 updateAccountProfile；唯一canonical全文SHA256 3214e32d273fbc514db1c1f2307f7855b623f1f613fb1da710cc51d23c41f453，唯一输入已按该正式Git对象更新，不创建第二份可编辑public schema。新增窄正常生成器消费唯一正式artifact，由generated派生严格input/ACK/error并在strip前校验原始JSON（含重复键/坏UTF8）。其余方法405/Allow GET,PATCH，不新增通用proxy。

PATCH严格同canonical scheme/Host、必须明确同Origin；无query/Idempotency-Key，唯一application/json，Content-Encoding仅缺省/identity，真实正文≤65536bytes。body恰{name,expected_name}；name1..100 UTF16、well-formed Unicode、无C0/C1和ECMAScript trim边界；expected_name恰正规userinfo原string≤16384 UTF16，不修剪/归一化/过滤旧值。name缺失/null不授予保存，不自报subject/tenant/client。仅HttpOnly session中的access经productBffHeaders提交BFF。

成功200严格{data:{subject,name}}，subject绑定同一可信session、name绑定提交原文；PATCH plain error严格{error:{code,message,retryable}}，private/no-store与合法x-request-id仅header，无meta、凭据或raw owner消息。BFF正规status/code/retryable tuple安全投影；本地400 account_profile_input_invalid、403 account_profile_forbidden、413 account_profile_request_too_large、401 session_invalid、502 account_profile_response_invalid、503 account_profile_unavailable，retryable只有429/503真。429必须有合法1..86400 Retry-After，其他状态出现该header拒绝。既有非PATCH方法405 account_profile_method_not_allowed保持原错误形状/private,no-store/Allow: GET,PATCH，不声称具备PATCH receipt。server/browser单10s，BFF headers+body总≤1MiB，最后same-session复核同一预算；未知写结果绝不自动retry或宣称未提交。

权威GET仍原5s与原四字段安全投影，只name放宽到原string≤16384 UTF16；响应总256KiB（含header与body）覆盖合法旧值JSON escaping，sub/email规则及userinfo其他字段剥离保持。GET和PATCH最终session的id/generation/subject/access/两个expiry逐项等值且未过期。PATCH ACK后的GET失败不构造本地profile；409、失去ACK、取消/超时/非法上游结果均需成功GET reconciliation后再由用户显式决定新PATCH。401可能由owner成功写入后的最终session退役产生，同样锁写、保草稿、权威重读，不把失败响应解释为数据库未写。

原十五OIDC scope严格有序追加iam:account-profile.write，16项只由fresh authorize获得，不改旧refresh/userinfo/ID token生命周期。正常scope资源与启动由Root在三owner正式提交后集成，不用旧运行假测试。Skills/连接器不变。

## SET-18 正文为空的 DELETE 输入核验（2026-10-14）

Account session DELETE 仍禁止业务正文、Transfer-Encoding、非零 Content-Length 和 idempotency-key。Next Node adapter 可为合法无正文请求提供非 null stream，故同源 adapter 在既有十秒总预算内验证 EOF；发现任何正文 byte 即拒绝，悬挂读取主动取消并释放 reader，未验证为空前不读取 session 或调用 BFF。空 stream 不构成新正文合同，不转发至 owner；其他 Host/Origin/path/ACK/final-session 约束保持。

## SET-18 browser-private 登录Session（2026-10-14；源码已接收，运行待验）

正式前置已接收：IAM284bfd8fea91d57dae18fa2b7c772d75c7b6dcd9/internal0.12/f6f3588d；BFF53996400e4100ed5940b104f0dce139d44fec383/public15.1.0/canonical与inventory144/SHA2565972f7be07a0117d8ee036fa4e742da7942b3c864d009c2847e70e69112a747d。Root沿SET18-Web任务卡授billing_scheduler_audit唯一源码writer；D0同一sessionID/generation/subject/access与session寿命最终复核规则保持。实现已冻结、独审并由Root接收，正常运行/browser尚未完成。Web实际OIDC_SCOPE按现原十三项严格顺序append账户read/revoke两scope，以正规fresh authorize取得；不得用旧refresh/machine提升。

独审后继规则：未知DELETE结果设独立reconciliationRequired写栅栏，hook与移除确认共同守卫；分页读取、分页失败或首屏读取失败不得清除，只有成功首屏relist核对权威目标状态后恢复合法写入。提示notice不是写资格。原分页/身份取消/正常ACK读回规则不变。

新同源GET /api/account/sessions只承接正式BFF GET /v1/account/sessions（limit1..100默认25、可选非空cursor≤2048）；DELETE /api/account/sessions/{sessionId}只承接正式BFF DELETE同sid，非空≤255且与正式owner约束一致，无query/body/Idempotency-Key。所有method/未知/重复参数/非法路径编码/非空body显式拒绝；其他method405并Allow。不与聊天/api/session混用，不新增IAM relay规则或通用URL。

GET校验部署侧canonical webOrigin的scheme/Host，Origin缺省或精确同canonical值；DELETE要求Origin必须存在且精确canonical webOrigin，同时Host/scheme匹配，不能用现sameOriginOk的missing-Origin允许路径。不信Forwarded/browser origin选owner。HttpOnly currentProductSession为cookie边界，沿productBffConfig/productBffHeaders只向固定BFF传单Bearer；缺配置503、匿名/过期401、不合Origin403、存储/准入不可确认503，subject来自session/BFF，不从body。

成功仅校验正式BFF15.1 generated closed response（current_session/sessions/created_at/expires_at，meta.request_id/next_cursor；撤销session_id/revoked:true与请求一致），零凭据、private/no-store、同一合法x-request-id。上游JSON/headers+body总1MiB/同request-id/no-store及状态code一致才输出，schema strip未知字段不可冒strict校验；错/多字段、current在other、重复ID/分页矛盾、错ACK、header绑定错误502。传输/timeout/不完整503，BFF正规拒绝沿正式closed error family，不透内部message/token。Web自有invalid_request400、forbidden_origin403、method_not_allowed405、session_required401、dependency_unavailable503、response_invalid502使用具名account_session前缀；同一error响应有安全message/request-id，不与public错误伪合并。

DELETE结果未知只提示重新list核目标active，不自动retry/宣成功；current409、foreign/不存在404、本人expired保留重复200/cleanup后404由IAM经BFF裁决。响应返回前再读取同一当前Websession（opaqueID+ProductSession generation+subject+accessExpiresAt/session expiresAt仍有效，含同一ID/subject的刷新或权限代际变化），identity退役返回401/503而非把迟到数据给新用户；该未知也不证明owner写回滚。

正式发行顺序：IAM0.12→BFF15.1不可变commit/digest→本仓正常narrow生成与完整出处更新；不从IAM源文件/未提交BFF复制类型，不放宽Team/Agent/Skills/MCP原schema。新scope只能正规provisioning与fresh authorize，不能修改旧refresh或用machine/admin替本人。当前源码唯一artifact已逐字节核验为BFF15.1；正常部署、fresh授权和真实用户旅程仍待成对验证。

## SET-17 支付未提供的现有边界（2026-10-14，目标待验）

不新增/改写BFF public或owner机器契约。套餐GET仍经当前同源adapter消费正式目录；固定checkout503不提供交易，UI不发checkout请求。旧browser-private `/api/billing/mock-pay`保留配置503、Origin403、匿名401、准入失败503守卫，已准入请求在所有环境都503 `mock_pay_unavailable`，没有支付owner请求或成功ACK；其旧开发relay退役，在线身份准入所需的读取保留。直接pay页面只说明不可用，不证明URL中的orderId存在或已支付。Team只消费现有固定团队九操作，导航改名不产生创建tenant/team契约。验证守卫和零支付owner I/O，不调用支付或伪造账单。

## SET-16 通用通知与声音：沿已有任务契约（2026-10-13，实现候选）

2026-10-14 修正：仍无 wire/generated 改动。可信原始 subject 与 engine/scope 是长期资源身份，readBoundary admission/generation 是同步投递门；同主体重验保留已验证锚、去重和已解锁音频，但门关闭期间零投递且不补播。设置授权异步结果仍绑定当次 admission/generation，Audio unlock 单次 attempt fence 防止旧完成影响新尝试；真实主体/logout/preview/engine/scope/dispose 退役。readBoundary generation 不授予新任务或历史通知资格。

本片无新HTTP、owner API、权限、版本或generated改变。唯一任务事实仍为现固定BFF public15.0.0 validated AG-UI、MessageCreateReceipt与SessionSnapshot；Web只新增内部typed任务信号订阅，不成为第二套wire。完成严格取run.completed且status=completed，失败/取消/dispatch_failed/ACK/EOF不替代；快照event_watermark与active execution_head只用于正规恢复和锚定，不发历史通知。请求/音频许可是浏览器能力，不授权运行或服务端写入。

资源主体来自受信readBoundary原始subject，当次投递仍需layout已提交admission；设置授权异步结果受当次generation绑定，scope/session/run标识来自现引擎。不得从browser body、localStorage偏好、preview、ready或任意feature flag推断准入。营销通知没有正式owner契约，disabled且恒false；不新增假成功API。当前模型授权硬门与正式支付缺口仍未闭合。

实现补充：active execution_head搭配合法null watermark亦可锚定未来live事件，null不被解释为历史完成；快照自身不投递。引擎receipt/snapshot捕获通知代际，身份退役后迟到事实不能重授通知资格。Audio create/resume由手势同步启动，resume单次3s预算，超时/拒绝/退役关闭owned context并拒绝late复活；无自动resume或补播。任务观察者逐事件隔离异常；切会话/身份/scope关闭owned投递，声音刷新/退役后需再次手势。无新契约、SQL、依赖、营销订阅或Skills/连接器改动。

V2实现补充（2026-10-14）：同subject临时失准入只更新layout投递门，长期observer/audio及engine锚保持；门内终态仍被正规引擎消费，不缓存或补播。真实资源替换仅退役旧engine，保留新engine已经合法锚定的owner head。AppFrame awaiting身份不含read generation，旧主体未变化的waiting投影不在退休后立即重登记。现page-clients engine lease在StrictMode重新取得时取消延迟release，真正无owner时正规engine.dispose清锚和listeners；hook关闭owned Notification/Audio并取消订阅，不增加第二个dispose owner。每次Audio unlock递增独立attempt fence，旧resolve/reject/timeout不得关闭同subject后发有效context；Settings组件仍以当次admission/generation取消迟到许可和保存。

## SET-SHORTCUTS：无网络协议变更

快捷键编辑、清空和重设只写既有浏览器localStorage偏好，无请求、用户身份/API/权限/SQL/generated变更。保存成功只表示当前浏览器存储写入成功，不声称跨设备同步。语音输入无能力契约，显示不可用。

## SET-13 TeamRole public15严格消费目标（2026-10-13）

BFF是唯一可编辑public机器owner。等待SET13审查并提交后，由其不可变SHA/digest原字节替换src/generated/bff-public-openapi.yaml；两既有generator固定同一来源。正常生成Team SDK与Agent failure provenance，失败片段/roles/tuples及非Team语义不手改。TeamRole.permissions只接受现八域，platform仅execute，skill仅固定IAM十五动作，数组非空；未知域/动作继续拒绝，保原错误/paging/mutation输入/输出。

strict response集合扩展为breaking，15.0.0 /v1仅Root此次自有开发配对，不能冒minor或稳定生产兼容。先owner固定、再Web单pin/生成/严格测试、最后Root真实组合；不混新旧response。Admin consumer与未来稳定/v2激活规则见BFF三设计，日常/main/生产切换未授权。完整snapshot会继承95fbd894相对于Web旧413e3bbe已有的非Team机器差异，本片不编辑这些owner字段或Skills/MCP运行行为。

## 登录回调与失败恢复（2026-10-19）

GET /login沿原固定provider表单POST，复用唯一、两段格式及SHA256摘要均有效的Auth.js CSRF cookie；无效或歧义cookie重新签发。state一次消费、cookie binding、PKCE、nonce、issuer和身份核验不变。所有callback均不发送共享RP事务cookie删除头（成功只发Product session cookie），避免先前请求迟到后删除新登录的proof。三事务cookie仍按锁定Auth.js默认15分钟签名有效期/Expires过期；Redis state仍300秒TTL及GETDEL，保留cookie不恢复重放权限。没有新cookie、状态表或latest-login登记；不保证后完成的旧成功回调不会覆盖已完成的Product会话。

原错误status/code和非HTML客户端JSON保持。精确signin/callback路径的GET/POST失败仅在明确接受HTML且有有效Proxy nonce时提供无脚本手动登录链接，无自动重试、授权query回显或成功cookie。最终Proxy仅对authorize和这两个精确路径设置no-referrer与同nonce限制CSP；恢复页另有no-referrer meta，不向重新登录链接传播code/state。其他auth路径和相似前缀保持原策略。

## Product Session 过期与续期投影（2026-10-17）

访问凭据过期不等于七天 Product Session 到期。现 `GET /api/auth/session` 在线核验同一 Redis generation 后：active 且 access 有效返回原 authenticated/subject/expiry；active 但 access 到期返回 `200 {authenticated:false,refresh_required:true,subject,expires_at}`；absent/tombstone/无有效cookie仅返回 `{authenticated:false}`。refreshing 或 stale generation 返回409 `product_session_refresh_conflict`，过期 reservation 返回503 `product_session_refresh_unconfirmed`，损坏记录/依赖故障503 unavailable。不返回凭据、generation或reservation，不在GET/RSC轮换cookie。

App layout 仅凭有效RP生命周期挂 data-free AppGate；refreshing/stale/unconfirmed保故障壳，真正anonymous才走严格return_to登录。浏览器冷启动或未满120秒但收到refresh_required，沿现CSRF POST＋同主体确认续期，确认前不准入。unknown后只读确认，refresh_required不算成功，也不赋予重发权限。POST保Origin/CSRF、Redis双CAS、正式身份核验与tombstone；access deadline固定在收到token时，不把身份核验耗时加回有效期。业务adapter仍逐请求拒绝过期access，不把壳资格当业务Bearer资格。覆盖原文中“GET投影语义不变”的历史表述，IAM/BFF协议不变。


CSRF获取失败或在POST派发前取消不产生未知写；仅在真正派发POST前标记，已派发未知只读确认、不自动重发。服务器故障壳在可见恢复/pageshow沿原1s/3s两次预算重核，不另启登录。

## Admin同源本地失败（2026-10-19）

既有`/api/admin/*`错误固定为完整`error.code/message/retryable`、同request-id与no-store；无Product Session为401 session_authentication_required且retryable=false，退休旧admin_session_required，无alias。本地503 admin_gateway_unavailable及502 admin_gateway_response_invalid均retryable=true，表示上层可保原命令处理，不自动刷新/登录/重发写。固定message不泄露内部异常，上游owner响应与严格头校验不变。不新增路径、权限、配置或认证方案；原测试与真实同源无cookie链验收，完整交付结果由Root原收尾计划绑定。

## 第一方Authorize导航失败的表示（2026-10-19）

既有`GET /iam/oauth2/authorize`、OIDC参数、Issuer/Product Session与owner allowlist不变。全部既有入站校验通过后，只有`Sec-Fetch-Mode: navigate`、`Sec-Fetch-Dest: document`且Accept明确允许text/html、存在代理nonce的失败导航使用无脚本恢复页；status与request-id保留，no-store/no-referrer/CSP固定，唯一动作是用户显式进入`/login`。不自动重试、不转移旧query/state或owner失败body/cookies/Location。 最终Proxy在精确authorize路径使用同一nonce策略并固定no-referrer，避免框架全局头覆盖；其余路径不改变。

成功302/owner原生导航原样；接口调用、非顶层请求、拒绝HTML或缺nonce仍用原JSON/native错误契约。入站拒绝也不改成恢复导航。此处只是Web浏览器表示，不是新的IAM/BFF API、认证方案或登录成功证据；现有nonce由Proxy覆盖生成，不以fetch metadata作身份准入。

## Provider Create 调用方幂等身份（2026-10-19）

既有同源 `POST /api/hub/mcp/connectors` 与 BFF/Platform wire 不变。Hub client 的 `createMcpConnector(input, key, signal?)` 强制调用方传原 ASCII 幂等键，按既有 create schema 校验并发送；不再在每次调用内部生成新键。ACK 继续通过既有 `mcpConnectorMatches("create", ...)` 绑定 provider/type/名称/说明及初始状态。已确认的原回执不是当前事实；授权前另行双精确 GET 当前 connector/provider，现 CAS 与 OAuth server 仅用于本次授权，不持久复制到命令投影。

App 内存恢复按主体/准入代际/窗口分离：未知仅允许显式同正文/键重放，关闭不声称撤销，成功创建后 Begin/GET 失败不生成第二个 Create。未新增 API、权限、浏览器持久化、Schema 或兼容回退，完整刷新后恢复不在本内存命令的保证内。

## MCP 目录与精确详情独立交付（2026-10-18）

沿已有owner query/category/cursor与精确GET：目录搜索不再过滤首屏数组冒全量，筛选/续页与首屏seed分开；保留已确认行、显式重试、主体/准入代际退休旧请求。Custom API续页只属于当前head，详情按精确locator读取并订阅原聚合写失活。目录OAuth发出ticket仍保详情，关闭/换窗退休等待；active重连仅来自实际OAuth绑定，不从保存配置推断已连接。

JSON导入仅提示当前owner支持的HTTP格式，不预填命令，窄短视口保留操作。既有API/权限/存储/命令owner不变，无新网关、Schema或依赖。Create未知原命令恢复和正常MCP配对仍另验，不将页面可见或fixture成功称真实工具执行、完整Manus一比一或整个目标完成。

## Project Skills 面板职责（2026-10-17，既定模型内实施）

保持 Browser→同源→BFF Public16，不改owner/契约/Schema。workspace只组合ProjectSkillsSection；独立面板/卡片与useProjectSkills维护展示和请求，来源选择器单独持个人/官方只读列表。使用ready canonical Project ID与当前subject/admission/generation；同actor重核与关闭退休私有事实/取消迟到工作但保未决原命令，换actor/project彻底清除。ACK后只回读，不凭GET推断未决命令成功；显式原key/body恢复，无自动升级、重装或默认勾选。启停/移除默认项前先显式取消并保存默认，避免隐式双写；update确认两pin后走原update。删除旧技能名称callback、聚合dialog状态/假卡及浏览器旧名称入口，不保alias。

2026-10-17同已登录Manus参考项目只读实测：项目技能dialog800×680、圆角16，header/toolbar左右20、title18/24、search208×32，添加菜单含个人/官方/本地/GitHub，空态不造技能。沿该布局与现token实现，默认选择checkbox/保存是已批准Kokoro项目模型所需的明确业务差异；本地/GitHub仍从现个人管理正式流程取得后再显式装入项目，不伪造项目直导入。复用原UI用例验证真实HTTP意图、未知原key恢复、ACK后仅读、分页/取消/跨actor及键盘；正常配对/浏览器整链单独验收，不因源码测试冒一比一完成。

## 项目 Skills 传输职责（2026-10-17，本地组件，面板待接）

沿已批准项目模型与固定 BFF a804b0f/Public16，分离项目技能的 wire/client、同源 adapter 与面板状态。先将现安装 adapter 原样移出 catch-all，再让同一生命周期实现显式选择 personal/project 目标；项目路径只用已读取的 canonical Project ID，不借个人安装或名称开关。独立 selection client/adapter 消费正式 GET/PUT skill-selection，保有序 ≤16 个唯一 installation ID、[]清空、原 key/body 和项目 ACK 绑定。保存 ACK 不代表重读后的当前默认，精确重放不会恢复后续变更。

后继面板从 workspace/dialog aggregator 拆出，安装不等于默认选择；权限重核/换主体撤销私有事实，未知写只显式原意图重放，不按列表推断成功。复用现样式/安装能力，不建新框架、服务、Schema 或兼容接口。旧名称入口随面板替换删除。验证扩现 client/proxy/项目 UI 用例；正常服务/Schema/浏览器与执行链另验，本片不冒全功能完成。

项目浏览器路径：`/api/hub/projects/{canonical_project_id}/skill-installations` 及其 `/{installation_id}`、`/enabled`、`/update`，保留 Project 映射到 BFF `/v1/projects/...`。个人路径 `/api/hub/self/skill-installations` 仍映射 `/v1/skill-installations`；不接受 self/projects 别名。独立 `/api/hub/projects/{canonical_project_id}/skill-selection` GET/PUT 映射正式默认接口，PUT 严格 `{installation_ids}`＋原 Idempotency-Key；响应严格 `{data:{project_id,installation_ids}}`，PUT 按项目和有序原意图绑定。仅使用正式当前会话的 BFF 头，浏览器 body/header 不供 actor/tenant。单次总10秒涵盖准入、body及上游；selection 请求和响应最多65536字节、fatal UTF-8、显式取消，不自动重试。上游 ACK 只证明原操作，不推断当前默认或安装事实。面板 UI 接线仍待后继，不把 browser-private adapter 称已完成项目产品能力。

## S4d Composer 选择意图（2026-10-17，本地实施切片）

沿已批准项目模型，固定BFF a804b0fd91d3f089afea8b48722095dbe71fbc3e/Public16。只维护现engine、execution adapter与Skill试用hook各自职责：项目未作选择时保留省略，[]为明确不选，非空refs为本次显式覆盖；Direct仍发送[]。新建/切换会话和生命周期退休恢复作用域默认，用户点击清除保持显式[]；未知提交继续冻结首次完整意图，重试不套用当前选择。历史消息接收owner新增exact refs，不能因strict schema拒绝正常回读。

本片不增加页面状态、安装事实或选择框架；后继项目Skills选择器独立组件承接真实项目安装与默认保存，替换原名称假卡片，不继续堆进project-workspace-dialogs。正常Schema/服务切换、项目选择器与浏览器整链仍未完成；不以本片消费pin/engine验证冒整个产品已闭环。

## 2026-10-17 S3 current BFF Public15 消费

唯一快照固定 `e60ff311075b01f1d0ca58f1cebc47080dbc3ea1` /15.0.0/139 operations、SHA256 `e3f70ab1111295d1df10775853ff9c20bf85ea466da32996a73d37a8b16d54c0`，由owner Git blob复制；两个既有生成器固定相同digest，不维护第二份可编辑owner Schema。该版只改公开SpecificationPublicSkill.owner_type八值，不改变本仓已消费的website Skills、分享、管理/安装、项目、Team、AG-UI或错误协议。网站真实归属、publisher与获取来源仍不同轴；分享精确revision owner_type保持五值。没有新增同源路径、授权、请求字段或兼容fallback。正常Platform/BFF和项目/Agent链后继不由此pin关闭。

## 2026-10-16 SKILLS-UPDATE U4（本地实现，正常产品链待验）

唯一来源 BFF 615b16a7f75917d30d334b66d5470d87339aacd1 / public14.8.0（139 operations），原 blob SHA256 a9729722383de5571821961357051499612d12c76aa835b8774828adea82a577。既有同源 POST /api/hub/self/skill-installations/{installation_id}/update 精确映射 /v1/skill-installations/{installation_id}/update；严格两字段 expected_source_ref/source_ref、原 Idempotency-Key、JSON≤65536/同源准入，无 identity body/alias/query。原有非更新操作语义保持。

成功200必须 change=upgraded、event_id、installed=true且无 removed_at，精确安装 ID/目标 pin；enabled 不要求 true，由 owner 事务保留。逐 status 错误沿本 operation 契约，不把未知/错 ACK当成功。安装卡片只消费 owner available_update，不用目录 currentVersion 推导自动升级；确认后保留同一 installation ID，历史消息/冻结试用意图不重写。

<!-- BEGIN:T-K03.13-WEB-MCP-PERSONAL-READ-D0 -->

## T-K03.13 Web 本人 MCP 读取 D0（目标，尚未实施）

唯一机器源为 BFF 已发行 public 13.3.0 / 137 operations；Web snapshot 与正式 canonical SHA256 均为 `0a9683b38cfd30534931dd0cd7821e3ccded94d6d15613a711cebc1f1e83a209`，不 repin/生成。

仅 GET /api/hub/self/mcp/connectors、/connectors/{connector_id}、/connectors/{connector_id}/connections、/connections/{connection_id} 保 self 映射对应 /v1/self/mcp 正式路径。list connectors 仅 status/limit/cursor，list connections 仅 limit/cursor，detail 零 query；canonical ID≤191、opaque cursor≤2048、limit 1–100。拒重复/未知 query、body、任何 Content-Length（含 0，仅本地拒绝、不 forward）、Transfer-Encoding、Idempotency-Key、未发行写和 provider 路径。旧 active projection 的路径/query/wire 不变。

按四 operation strict snake_case 成功 envelope、connector 五字段/connection 六字段及资源/filter/分页绑定；错误 error{code,message,retryable} 无 meta，逐 status/code 闭集 400/401/403/429/502/503，404 仅两个 detail 与 connector 下 connections，不适用于 connector 总 list；429/503 retryable=true，其余 false。实际字段与枚举引用机器，不复制第二规范。严格 JSON/request ID/no-store、存在时合法 Retry-After、10s 总预算和 1MiB UTF-8 body；拒 redirect/alias/fallback。

<!-- END:T-K03.13-WEB-MCP-PERSONAL-READ-D0 -->

<!-- BEGIN:T-K03.14-WEB-PERSONAL-LIFECYCLE-D0 -->

## T-K03.14-WEB-PERSONAL-LIFECYCLE D0（目标，未实施）
唯一机器事实源：正式BFF e1769b56 contract/openapi/v1/openapi.yaml public13.3，现Web固定snapshot不升级。Managed详情已有example_prompts/skill_updated_at，直接显示真实字段。
新同源闭集POST /api/hub/self/skills/{skill_id}/versions及/withdraw，精确映射正式/v1/self/skills/{skill_id}/versions及/withdraw；不添加alias/泛转发。前者display_name/summary/tags及明确example_prompts/category_keys，禁止expected_state_version，201严格draft六字段含state_version；后者reason+expected_state_version，200严格source_ref/status/event_id/replayed/state_version。全部exact UID、同series、decimal revision/CAS与请求绑定，unknown原key/body不可换意图。
按CreatePersonalSkillVersion/WithdrawPersonalSkill机器operation逐status错误闭集：400/401/403/404/409/412/413/429/502/503；保原envelope、request ID/no-store、合法Retry-After及取消。不得用其它Skill族通用enum×status放宽。10s总网络/累计body上限沿现client；共享PUT仍既有60s生命周期。不复制契约字段长文。
更新201不是发布/安装成功：真实新包链Publish显式owner及最终CAS；不凭旧UI恢复公开发布权。撤回与包上传互不串意图；服务端仍是权限唯一裁决。

<!-- END:T-K03.14-WEB-PERSONAL-LIFECYCLE-D0 -->

<!-- BEGIN:T-K03.14-WEB-SHARE-D0 -->

## T-K03.14-WEB-SHARE D0（目标，尚未实施）
BFF正式 `e1769b56aefa2e00e6460195c049cea81a9eea3b` / public `13.3.0` / 137 operations / canonical SHA256 `0a9683b38cfd30534931dd0cd7821e3ccded94d6d15613a711cebc1f1e83a209`；Platform `91bc3655ebd3648cb8f8ccddfacb5628bdeb1c5c`。 机器唯一事实源为正式BFF `contract/openapi/v1/openapi.yaml`；原Resolve六字段及现series GetSkill不变。

闭集同源：POST `/api/hub/skill-shares`→POST `/v1/skill-shares`；GET `/api/hub/skill-shares/{share_id}`→GET正式同路径；GET `/api/hub/skill-shares/{share_id}/skill`→GET正式nested路径。拒其它method/segment/query、GET body及任何Idempotency-Key。POST只接受strict source_ref/可选expires_at，无自动重试；无DELETE UI，owner撤销资格不扩大。

成功strict `{data:...}`：Create201/Resolve200的share_id/source_ref/url/created_at/expires_at/revoked_at完整六字段，创建核原source_ref且未撤销/未过期；url只接受当前可信浏览器同源、exact `/skills/shared/encodeURIComponent(share_id)`、零query/fragment，不改写服务端URL。Nested200精确share_id/source_ref/skill；skill含实际skill_id/series_id/decimalrevision/display_name/description/tags/example_prompts/category_keys/created_at/updated_at/owner_type/source_kind，optional original_name/author/cover_image，按机器strict，不接受private locators/current/installed/usage或未知字段；source_ref=skill:skill_id，cover仅actualUID path rewrite。

错误按正式三个operation各自response.status与SkillProductErrorResponse实际闭集，不通用enum×任意status、不把IAM失效当notfound；保request-id/no-store/Retry-After存在时合法校验。无conversation匿名读取，分享页可信session未admitted不发业务；anonymous显式正规login return_to，unavailable可重试且不授权。

每次JSON含fetch/body总10秒、累计1MiB/fatalUTF8、finally cancel/clear/迟到body cleanup；同源adapter保持Origin、在线session、可信tenant/subject、取消/timeout、请求body≤65,536bytes。分享reader沿现revision package GET/file_path闭集与既有字节预算，不扩任意转发。return-target新增仅canonical `/skills/shared/{合法share_id}`，无query/fragment/外链/双decode；新页不借/shared conversation。

共享 summary 不携带下载句柄；正式独立 browser-private policy 已有零字节 POST `/browser/v1/skill-shares/{share_id}/download`。同源仅映射 POST `/api/hub/skill-shares/{share_id}/download`；禁 query/key/TE，CL absent 或 0，ACK strict source_ref/revision/download_info(download_url/filename/expires_at)，绑定摘要实际 UID/decimal revision。`download_url` 只接受 `/skill-downloads/{43字符opaque handle}`，明确同源映射现字节 route；不调用 series current DownloadSkill。资格与字节读取总预算各 10s（BFF startSkillRequestBudget 默认 10s 含 pipeline），字节 route 拒 redirect，ZIP/attachment/长度受限，累计上限沿 BFF spool 1GiB，流式背压/取消/超时/迟到 cleanup，不缓存整个 ZIP。错误资格沿 policy 独立 504 deadline 闭集；字节 handler 保真实 410/Gone 等既有失败，不当成功保存。安装使用现正式独立客户端和strict19-field安装事实，不复制API、不用summary制造ACK。snapshot/资格准确文件清单见本任务TECH前缀，原历史测试语义不删。

<!-- END:T-K03.14-WEB-SHARE-D0 -->

<!-- BEGIN:T-K03.14-WEB-GITHUB-IMPORT-D0 -->

## T-K03.14-WEB-GITHUB-IMPORT D0（2026-10-10；目标，尚未实施）

当前Web `745f273` 保留已验收local-import、独立真实包reader和revision安装；GitHub仍为self伪路径、旧URL直接Import及合成installed卡片。Root正常浏览器已证旧Import404，未创建draft/install。目标消费正式BFF `486ec7e80e834471878dd031553571d7f16c03bd` / public `13.2.0` / canonical OpenAPI SHA256 `3e4dd272fa8180b8f2a2bacc88d37f99ed5c77eaba05ef03e858ab766f891206`，Platform `4f7501b`；以下为批准设计，不表示代码、generated pin或浏览器已接通。只加此前缀，下面原mixed全文逐字节保留。

### 唯一机器源与同源闭集
机器源为正式BFF `/Users/nako/.codex/worktrees/kokoro-r257-bff-normal/contract/openapi/v1/openapi.yaml` 的 `previewGithubSkill` / `importGithubSkill` 及 `src/http/routes/skill-github-import.ts`。Web新增两精确browser-private POST：`/api/hub/skills/github/preview`→`/v1/skills/github/preview`；`/api/hub/skills/github/import`→`/v1/skills/github/import`。旧self伪路径保持拒绝，不alias/fallback；拒其它method/segments/query，JSON请求累计≤65,536bytes，保Origin/在线session/可信上下文。

Preview exact `{repository_url,path?}`，无Idempotency-Key；200 `{data:...}` strict联合：selection_required=true仅repository_url/commit/paths；false仅selector/metadata/repository/content_sha256/size_bytes，按机器完整nested schema与实际绑定验证，不复用旧GithubImportResult。Import exact四字段owner/repository/commit/path，必须单一合法原Idempotency-Key；201 strict七字段skill_id/source_ref/status=draft/state_version/valid=true/content_digest/manifest_identity，source_ref必须绑定skill_id，state_version是正signed64 decimal。13.2五处path上限256字符已与运行selector一致；owner archive UTF8相对文件路径含文件名256bytes是另一边界，不放宽它；历史provenance/URL上限不机械替换。

现PublishDraft携带明确audience=owner与Import ACK expected_state_version；现Install使用真实revision source_ref。成功ACK逐项核资源/状态，不拿series作安装source。Preview/Import的SkillProductErrorResponse与实际admission/runSkillRoute错误按operation×status闭集：400 invalid_skill_request、401 session_authentication_required/session_invalid、403 service_auth_failed/session_forbidden/product_tenant_forbidden/skill_forbidden、404 skill_not_found、409 skill_idempotency_conflict/skill_command_in_progress、412 skill_precondition_failed、413 request_body_too_large、429 session_rate_limited/skill_rate_limited、502 skill_response_invalid、503 product_tenant_not_configured/iam_admission_unavailable/skill_dependency_unavailable；拒旧dotted alias与code/status错配。Publish/Install保持各自现正式错误族，不串用。

每次网络请求10秒总deadline包括fetch与body读取，累计响应≤1MiB，fatalUTF8/JSON、严格envelope、request-id/no-store；取消/超限/失败finally cancel，迟到response也清理。Preview不自动发写，Import未知不得换selector/key重试。

<!-- END:T-K03.14-WEB-GITHUB-IMPORT-D0 -->

<!-- BEGIN:T-K03.14-WEB-LOCAL-IMPORT-API_CONTRACT-D0 -->

## T-K03.14-WEB-LOCAL-IMPORT D0（2026-10-10；目标，尚未实施）

当前 Web main `3d2b419f971aaa3478b22d7f4e96f34190dff79b` 已有真实目录/包reader/安装动作；普通目录上传仍调用旧preview/confirm，个人设置的新建仍手填个人publish元数据，两者尚未消费正规local-import。事实源为正式BFF `939bf0e1da98a313233a923c6aa55481d06f5aca` 与Platform `32666c1c18360e707048a1104efe6b50e375002f`；既有协议已足够，不新增owner API/RPC/SQL/依赖。此D0仅新增本具名前缀，下面原mixed全文逐字节保留，不表示实现或浏览器验收通过。

### 唯一机器/运行事实
BFF browser-private/version1：`src/http/routes/local-skill-import.policy.ts`、`local-skill-import.ts`、`src/http/local-skill-import-input.ts`与`src/infrastructure/clients/platform/local-skill-import-response.ts`；Platform既有`SkillCatalogService`四个LocalSkillImport RPC及source/local-skill-import.state/service是状态机事实。不将本browser-private操作塞入Public13.1 OpenAPI或另建可编辑owner契约；现generated pin不动。

Web目标唯一 `/api/hub/skills/local-imports` POST、`/{intent_id}/complete` POST、`/{intent_id}/finalize` POST、`/{intent_id}` GET，精确映射BFF `/browser/v1/skills/local-imports`对应路径。closed method/segments/query与一次decode的安全ID；写请求必须单一合法idempotency-key、fresh Origin/session/可信BFF头，身份不从body自报。GET无body/key；Finalize必须实际零body，拒JSON{}，不套个人Publish audience/CAS。Begin/Complete JSON≤65,536 bytes，所有响应累计≤1MiB，fatal UTF8/JSON媒体/no-store/request-id/strict未知字段失败闭合。

Begin输入exact(filename,size_bytes:number正safe integer,content_sha256小写64hex)；文件名≤255、无路径/控制字符、满足owner小写.zip/.skill后缀。Begin201返回intent_id/skill_id/phase=upload_pending/upload_id/transfer_reference/expires_at/replayed。Complete exact(upload_id,source_version_id,size_bytes,content_sha256)；源版本只能真实PUT x-amz-version-id或owner Get已完成proof，不能生成/从URL推算。Complete200含intent_id/skill_id/phase=uploaded/upload_proof/scan_state/expires_at/replayed；proof的upload/version/size/hash与原冻结命令逐项核对，scan只接受pending/clean/infected/unknown。

Finalize200 strict data(intent_id,phase=completed,skill,installation,replayed)，完整skill采用实际SkillProductRecord projection（包括package_phase，不能误套少字段managed envelope）；安装采用现完整personalInstallation schema。核intent/预留series、skill.source_ref与skill.skill_id、skill↔installation的source/series/decimal revision、个人active/owner事实，再显示实际结果。不合成示例/标签/名称，也不把首次series=revision偶然相等当规则。

Get200 strict data(intent_id,skill_id,phase,expires_at，按phase可选upload_proof/rejection_code/skill/installation)：upload_pending无proof；uploaded/rejected/completed有真实proof；rejected需rejection_code；非completed不含skill/installation；completed必须skill但installation可缺失；expired不臆造proof。Get没有replayed/transfer/upload_id独立字段/scan_state。Get completed installation若缺失或已停用，展示实际事实，不根据phase造安装成功。

错误按四operation实际code/status闭集，引用当前route/admission：400 invalid_local_skill_import_request/local_skill_import_idempotency_key_required，404 local_skill_import_not_found，409 local_skill_import_idempotency_conflict，412 local_skill_import_precondition_failed，413 request_body_too_large，429 local_skill_import_rate_limited，502 local_skill_import_response_invalid，503 local_skill_import_dependency_unavailable，加fresh admission/IAM精确状态代码。GET不挂写skill action，写核create_draft+install。拒任意异常message码与personal/official别族错配；Web本地拒绝用本片闭集，不把缺字段、412或未知状态转空/成功。

BFF本身Get2s、Begin/Complete10s、Finalize20s总界；Web GET/Begin/Complete各10s、Finalize20s单请求总预算覆盖admission/fetch/body，边界不得重置计时；对象PUT本片20s（现publish仍60s），严格消费owner transfer.url/method/required_headers/expires_at，credentials omit/redirect error/no-referrer，真实version头校验、非成功不Complete。caller取消、慢不close/超限body、迟到fetch/reader需finally清timer、取消/释放body，不能只Promise.race而遗留请求。

验证精确四path/status/shape/identity/proof绑定，Finalize零body、错误族错配、unknown原key/body、Get各phase/缺installation、账号切换/locator过期/无File、慢流/超限/取消，以及两入口同一真实普通上传。保旧publish完整60s/ACK测试，不能因提取PUT破坏已有版本包链。

<!-- END:T-K03.14-WEB-LOCAL-IMPORT-API_CONTRACT-D0 -->

<!-- BEGIN:T-K03.14-WEB-CATALOG-PACKAGE-DETAIL-API_CONTRACT-D0 -->

## T-K03.14-WEB-CATALOG-PACKAGE-DETAIL D0：真实目录包详情目标（2026-10-10；待实施）

当前 Web main `d2545a34cc2f9bbc4aa991b93fde773db555e2d5` 已显示真实目录/摘要，品牌与分类一致；“查看详情”包 reader 尚未接通，同源目录 package 读取仍404。本前缀定义待实施目标，不作为业务已生效/浏览器验收证据。BFF正式 `939bf0e1da98a313233a923c6aa55481d06f5aca` 已有 public `GET /v1/skills/{skill_id}/package`（getSkillPackageDirectory），经 `publishedSkillPackageInspectionRoute` 调 `ProductSkillReadService.InspectSkillPackage`；Platform物理 `apps/kokoro-capability` 正式 `32666c1c18360e707048a1104efe6b50e375002f`。不新增 owner API/RPC、依赖或持久化。下面原 mixed 全文逐字节保留。

### 唯一机器事实与同源边界
字段事实引用 BFF `contract/openapi/v1/openapi.yaml` 的 `getSkillPackageDirectory`、`SkillPackageInspectionResponse/Data/File/SelectedFile`；成功为strict `{data}`，错误引用该operation的 `SkillProductErrorResponse`，不误用 self/installation 专属 `SkillPackageInspectionErrorResponse`。行为核对同仓 `src/http/routes/skill-download.ts`、`skill-drafts.ts` 及 `infrastructure/clients/platform/skill-package-inspection-response.ts`；Web既有generated pin不变，不维护另一份owner契约。

目标private exact `GET /api/hub/skills/{revision_skill_id}/package` 唯一映射正式 `/v1/skills/{skill_id}/package`；参数取owner `currentVersion.versionUid`，不是series。只容许一个可选非空 `file_path`，一次decode、不trim/二次decode；拒绝alias、非GET、未知/重复query、body/content-length（含0）/transfer-encoding/idempotency-key，沿现Origin/session/受信头/超时取消规则，不转发浏览器identity。

成功/嵌套未知字段失败闭合；source_ref须等于 `skill:{请求revision_skill_id}`。data.revision为正uint64十进制（非URL Skill ID）；size_bytes为含0的uint64十进制。最多128文件，安全NFC路径UTF8≤256 bytes，无绝对路径/drive/反斜杠/BOM/NUL/空段/dot/dotdot；目录严格排序且唯一。目录请求selected_file=null；文件请求selected_file.path精确等于请求且唯一在files中，text为合法Unicode，其真实UTF8 bytes等于列出size_bytes，保留空文本、BOM与行尾。后续文件响应须与已展示目录source_ref和decimal revision一致，错配提示刷新而非合并。

目录是owner认可的UTF8文本集合，不是ZIP全量binary文件目录。错误按该operation实际400/401/403/404/409/412/413/429/502/503及对应code闭集测试；实际`runSkillRoute`/admission错误与Web本地失败分别校验，禁止通用enum×status、fallback或把412/坏响应转空成功。JSON媒体/no-store/request-id、响应累计1MiB和10秒全请求预算均需验证；不暴露token/内部URL/owner异常。

D0后先Root精确授权现文件，再以真实函数/同源route RED→GREEN；当前机器契约不改，浏览器结果待Root后继验收。

<!-- END:T-K03.14-WEB-CATALOG-PACKAGE-DETAIL-API_CONTRACT-D0 -->

<!-- BEGIN:T-K03.14-WEB-SKILL-READ-CONTRACT-API_CONTRACT-D0 -->

## T-K03.14-WEB-SKILL-READ-CONTRACT D0：当前读取消费纠偏（2026-10-10；目标，待实施）

当前态为 Web main `2e69b3b63ad4ac935752e4ad0b69ee1ce964f564`；Root 正常浏览器 ListHubSkills/ListSkills HTTP200但严格解析失败。正式 BFF `939bf0e1da98a313233a923c6aa55481d06f5aca`、Public13.1机器契约不变（既有 canonical digest `418db9504b179d29113385f334628d304130491d4bbc86169e20c712cf2cd045`）。此片目标尚未实施/验收，下面既有设计前缀和 mixed 原正文全部逐字节保留；本片仅纠正现有 Skills 读取消费者，不增加 owner、协议、数据库或进程。

### 唯一事实源与可见性
完整读响应的唯一 owner schema 为上述 BFF commit 的 `src/http/skill-specification-schema.ts`（websiteHubResponseSchema、websiteListResponseSchema、websiteSkillSchema）；运行投影为 `src/application/skill-specification.ts`，HTTP envelope/下载 handle 由 `src/http/routes/platform-projection.ts` 发出。Web 现 `/api/skill.v1.SkillOptionalService/{ListHubSkills,ListSkills,GetSkill}` 与 `/api/skill.v1.SkillService/DownloadSkill` 仍是既有 browser-private adapter，不新建 public operation，不把消费 validator 当可编辑 owner 契约。

GetSkill metadata 切片（2026-10-25，已消费 BFF `21c85b5a6b3059ecb8924703a0065c966f480467` 的 Public25；canonical SHA256 `7261ac9ce2140555ba97ebff2bf0359533cc49dda014b08dcd6a6054a8d38b1c`）：现路径/series 请求不变，成功严格 `{skill}`，不带 `downloadInfo` 或读取包字节。独立 DownloadSkill 成功仍严格 `{skill,downloadInfo}`；两者复用相同 skill shape，但分别解析，未知字段和下载缺字段拒绝，不做旧协议 fallback。普通详情仅在受准 metadata 的 series/exact revision 与已选记录匹配后开放下载入口；点击独立请求真实句柄，并再次核其 series/version 和当前请求生命期后导航。下载失败、取消或错误版本不清 metadata，不生成 URL/文件名/到期时间，也不从列表快照推导下载权。

Web 严格承接完整 Hub item/icon/source/currentVersion/tags/tagOptions、完整 installed/official 嵌套对象和独立的 detail metadata／download 资格响应；按照 owner schema 的字段类型与可选性解析，identity 为读取必要条件且 Get/Download 必须与请求 skillId 匹配。各操作成功/envelope保持原 owner 形状，不用泛化 passthrough、不静默 strip owner 字段。未知字段、坏类型或资源错配失败闭合；错误形状与状态按当前操作和同源 adapter区分，坏响应不得变空目录或可下载成功。

Hub/tagOptions 支持正式第八类 SKILL_HUB_TAG_APPS，分类投影为 apps；不扩其它公开请求 schema。安装 membership/added 与 enabled 是不同事实，已安装但禁用仍 installed=true、enabled=false，official added 不覆盖本人 enabled。GET 封面 private exact `/api/hub/skills/{revision}/cover` 唯一映射正式 `/v1/skills/{revision}/cover`；revision 来自 BFF coverImage/current version 的精确 UID，不建立 series alias 或外部 URL 代理。coverImage 是可尝试的媒体资源定位而非存在性/CLEAN 保证；metadata absent cover 表示未内联媒体，图片成功加载才展示，加载/404/503/取消保原 fallback，不伪造源封面状态；媒体 GET 的完整事实与权限检查保持。未知路径/非GET/body/query/身份失败按闭集拒绝。

### 门禁
具名真实四响应、嵌套完整字段、unknown/type/identity负控、apps、图片字节/媒体/Origin/session/revision绑定测试；Root pin/artifact不变，五 mixed 仅新增此前缀之外原正文保留。Root 真实浏览器目录/详情/安装/下载/封面仍待后继验收，不以 HTTP200 或 unit fixture 称完成。

<!-- END:T-K03.14-WEB-SKILL-READ-CONTRACT-API_CONTRACT-D0 -->

<!-- BEGIN:T-K03.14-WEB-PUBLISH-API_CONTRACT-D0 -->

## T-K03.14-WEB-PUBLISH D0：固定 Public13 发布与恢复消费（2026-10-10；目标，未接线）

当前 Web commit `3c59071d8188f025b3d7b7683bb2d8560ceaa0fa` 消费 public8旧snapshot，strict ACK漏state_version，三写缺CAS、PUT丢版本、Complete缺对象版本、Validate旧zip-v2、Publish零body且route拒绝JSON。目标引用已批准BFF D0 `8889701`：正式public13.1.0，URL仍/v1；正式实现 SHA 与 canonical artifact digest 已由 Root 固定，见本前缀末正式 pin；不使用变化中的 worktree 充当已验收 current。本前缀只确定目标，原mixed正文保留，不宣称生成/部署/验收通过。

Browser business请求继续只走同源`/api/hub/self/skills/*`与已发布本人managed读取；BFF唯一维护public机器事实，Web snapshot原字节固定后只读。不能从release整包恢复替代Admin/契约或建立第二可编辑contract。变更同源route时去掉旧Publish零body专门限制，替换为已发布精确JSON请求解析；保Origin、Product Session、有限字节/时间、取消、request ID及全部非self/legacy路径拒绝，不放泛化/manage命令。

| 操作 | 目标请求/版本来源 | 成功消费 |
| --- | --- | --- |
| CreateDraft | 原正式metadata；无CAS，不从base推算 | exact owner resource，包括state_version与skill/series/revision/status/replayed |
| Get package-upload | 同本人skill，只读无mutation key | exact phase/attempt_epoch/可选attempt/upload/source_version_id与required state_version |
| Begin | 原filename/MIME/size/hash、mandatory expected_state_version，replacement可选真实旧attempt | required state_version、attempt/upload/epoch、短期PUT reference与replayed |
| PUT | 引用批准URL/method/required headers，原File；omit credentials、拒redirect、no-referrer、允许的HTTPS或既有loopback开发边界 | 实际响应x-amz-version-id；PUT不产生Skill CAS |
| Complete | 原attempt/upload/hash/size、required source_version_id与mandatory CAS=Begin ACK | exact uploaded/scan_state/hash/身份及required state_version |
| Validate | 原attempt_id、mandatory CAS=Complete ACK | valid/skill/series/content_digest、current skill-md-v1:sha256:[a-f0-9]{64}、replayed及state_version |
| Publish | strict JSON explicit audience=owner/tenant/catalog，required CAS=Validate ACK；其它字段严格按固定owner契约 | ACTIVE source_ref/revision/event_id/replayed/state_version；不保空body路径 |
| 本人managed list/detail | 正规本人资源，支持真实draft选择及权威恢复读回 | exact owner status/series/revision/product/state_version等完整当前shape，不用旧七字段ACTIVE或安装态代替 |

CAS/state_version为canonical positive decimal string，1..9223372036854775807；数字/null/0/leading-zero/溢出拒绝。attempt_epoch继续按owner unsigned64与none/epoch0单独解析，revision不是CAS。source_version_id只采用真实ACK/owner已完成readback，非空、非null字面值与字符/长度严格固定owner规则；缺header、不可见CORS header或畸形值不能继续Complete，不剥版本字段适配旧parser。

媒体/状态/headers/envelope/object均closed；成功/失败状态逐operation遵循固定owner error family，不能建立万能错误enum或strip额外字段。实测skill_forbidden/401/403必须保持owner授权拒绝语义；412 skill_precondition_failed、409冲突/in-progress与502坏owner/503依赖保持可区分，最终合法code/status组合以正式13artifact和owner当前runtime验证，不用未发布枚举替代事实。未知错误或坏ACK失败闭合、不得空列表/preview/成功；Web不降低IAM/BFF准入或添加token权限缓存。

每阶段首次发送冻结body/CAS/key及资源和身份代际；重试/ACK丢失只重放同body/CAS/key。GET最新CAS不准写回原intent；异body/CAS同key不能借本地更新绕owner冲突。未知Publish先本人managed权威核对；仍未确定时展示未知并仅显式原意图恢复，不自动换key或创造成功。刷新丢key不称旧重放；owned draft/upload事实可重建观察，用户显式新replacement用新key与真实当前CAS，uploaded/validated沿owner已完成身份事实核验，不把Get当原command receipt。

后继验证覆盖六类ACK版本、signed64边界、各mandatory字段、PUT真实版本与CORS缺失、source/attempt不匹配、current manifest、Publish显式JSON与audience/CAS、每阶段原body/key重放、刷新/撤权/取消/迟到；snapshot精确版本/commit/digest测试绑定最终发布，不修改原mixed大型OIDC test。此阶段只设计，无契约/Schema/test通过声明。

### 正式目标 pin 与本人读取闭集（2026-10-10）

正式 BFF public 13.1.0 为 `2f3678736287241bbe620e087ab3b0da95fd2fb8`，canonical OpenAPI SHA-256 `418db9504b179d29113385f334628d304130491d4bbc86169e20c712cf2cd045`，136 个 operation；URL 仍 `/v1`。本片消费者从该正式 commit blob 原字节生成只读 snapshot；13.1 仅补实际命令授权链 403 `skill_forbidden`，Get/managed 不扩该错误，授权路径不变。此为批准目标引用，不代替 Web 当前工程门、真实对象链或浏览器验收。

本人读取唯一 browser-private 路径为 `/api/hub/self/skills/managed?status=draft|active&limit=...&cursor=...` 与 `/api/hub/self/skills/managed/{skill_id}`，分别精确映射 `/v1/self/skills` 与 `/v1/self/skills/{skill_id}`；static managed 优先，GET-only、闭集 query、重复参数/未知参数拒绝，detail 禁 query。正式 owner 已移除旧 `/v1/skills` list/detail，故本片删除对应旧 private published 路由、旧七字段 wire/schema/ref；本人已发布读 managed `status=active`，草稿读 `status=draft`。目录 `/v1/skill.list` 独立，不能代替本人事实；无 alias/fallback。成功与错误严格保留 managed `meta.request_id`，同 header 绑定。没有 package phase/hash/receipt 的 managed read 必须继续 GET package-upload，不合成字段。

当前安装消费者同片精确对齐正式 SkillInstallation 19 properties / 16 required，list/get/三 mutation 复用严格当前 resource、optional publisher/update 与真实 product 字段，完整保留 installation/source 身份绑定、原 body/key、状态与错误 family；403 skill_forbidden 仅三 mutation，list/get 不扩。不得省字段、passthrough 或把 HTTP 安装回执当浏览器成功。

<!-- END:T-K03.14-WEB-PUBLISH-API_CONTRACT-D0 -->

## R256-ADMIN-01：当前管理员资格消费契约（目标，尚未接线）

Web 下一消费者固定 BFF `ac3cd1da4f13e9e22320efbd4dbf4009aa0a2e29`、public `8.0.0`、canonical OpenAPI SHA256 `cec91c36c836319af4acbb4e2cf372434b70dd0f52bdf266420e1957057ac4be`。`GET /v1/me` 成功 `data` 必须 strict包含 `tenant_id`、`user_id`、`platform_admin:boolean`；缺字段、额外字段、身份不一致、非JSON/错误media、无 `no-store`/request ID、错误状态或依赖不可用均失败闭合。普通用户的合法结果是 `platform_admin:false`，不是登录失败。

Web callback 与 refresh 只接受这一新完整 shape；不保留旧两字段 union/default false。正常页面每次资格判断从受信 Product Session 向BFF fresh读取，不接受 query/body/header/cookie/JWT/email/Team role 自报。Settings只在当前值严格为 `true` 时显示唯一 `/admin` 入口；匿名、`false`、pending、error、撤权或主体/代际变化隐藏。`/admin` 页面及管理 same-origin API独立重复server gate：匿名按现登录边界处理，已认证但无资格拒绝，owner依赖失败保持可区分且不可沿用旧 `true`。浏览器隐藏不构成权限证明。

后继 breaking 接收采用 owner immutable snapshot正规生成与pin，不手改generated。当前正常 IAM 有数据演进、BFF/Web strict消费者和服务切换必须同一受控窗口；不运行新IAM配旧消费者或反向混搭。真实验收包括普通false登录/callback/refresh、管理员true入口/直链、撤权后现页与新请求拒绝、A→B/null与迟到响应，以及各管理owner自身授权；仅页面准入不证明任何CRUD权限。

---

## R257-MCP-WEB-D0：本人 Connection browser-private 消费契约（2026-10-06；仅设计）

当前live Web读的是BFF `/v1/mcp/servers`的Server declaration。目标same-origin `GET /api/hub/self/mcp/connections`只转发到待发布BFF public 8.0.0同名GET；BFF目前只有D0 `d776194`，机器/source/immutable commit与digest待Root固定，故本节不是pin或发布声明。Browser不直连Platform，不接受Server旧shape兼容。

输入closed为可选且单值`connection_id/provider_key/limit/cursor`：connection_id匹配`^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$`；provider_key为1..191 code points；limit仅无符号十进制1..100；cursor为1..2048 opaque。未知、重复、空、越界、body、transfer-encoding或Idempotency-Key拒400且零BFF调用。filter变化丢弃cursor/page历史，从首页读取；Web不解析cursor。

200严格`{data:{connections:[...],next_cursor?:string}}`，所有object closed；每项required且只含：`connection_id`、`connector_id`、`server_id`、`provider_key`、`transport:"streamable_http"`、`status:"active"`。三个ID各自opaque，不能互代；不返回name、URL、declaration、secret、scope、token、proof或工具权限。多Connection可指向同Server且不得合并。terminal page省略next_cursor，不接受null/空串。

所有响应必须JSON、`Cache-Control`含no-store及合法`x-request-id`。错误只接BFF固定closed envelope；当前Session admission的401/403/429、输入400、owner-invalid 502、dependency 503各自保留，不透传内部detail，不把任何错误改empty/preview。browser伪造tenant/subject/service/request身份不转发；adapter只使用每次当前Product Session派生的server headers。

browser Hub client对此operation使用一次10秒总deadline与1MiB成功/error body cap，范围包含同源headers、body、fatal UTF-8、JSON和strict schema parse；超时、超限、取消、非法UTF-8或shape错误不得落入legacy宽松`readError`或无限`response.json()`等待。

组件消费完整六字段用于strict验证，但主界面保持简洁Card：主信息为provider与人类可读连接状态，opaque connection/connector/server ID只在次要详情，transport仅按需辅助；不把六字段机械排成debug表，不显示内部permission、declaration、secret或owner诊断。loading/error/empty/ready与显式前后页保留。当前actor/filter/cursor/generation共同绑定请求；取消、卸载、重试、翻页、filter或actor变化后旧结果退役。empty仅为当前本人读取事实，不表示未安装Server、无第三方权限、费用状态或连接命令成功。后台`/admin`资格与此本人读取无耦合。

机器事实源仍是未来固定的BFF `contract/openapi/v1/openapi.yaml`原字节；Web本地Zod是consumer narrowing，不成为第二public contract。固定pin、生成、源码与测试路径见TECH。当前tab11 Servers 200只证明wrong-resource RED，不是本契约正控。

<!-- R257-MCP-WEB-D0-API-END -->

## T-C01.R255-PRESET-RETIRE（06:12）：退役未发布目录消费者，不改公开 agent 字段

本前缀记录实施前的 D0 目标，冻结时生产仍发旧目录请求，现已完成本片源码静态退役；仅覆盖旧 preset 目录/选择说明，原 suffix、公开 agent 字段和 generated pin 保留。Root 已实际观察 workspace、Settings、hard refresh 零旧 agents 请求与 models 200 真空目录（不是模型可调用、切换保存用户链通过）；最终工程 65531 仍在运行，实际当前验收见 docs/CURRENT.md，不预报最终工程或整组 PASS。

### 唯一契约来源与当前缺口

继续固定现 BFF public 8.0.0 artifact：owner commit 45e67f0e783fb4bcdb086665a09b7c3c5fadbb6f，canonical contract/openapi/v1/openapi.yaml，blob 1b42d49388ca26eaaef7371daf23cbf1158d5fe6，SHA256 0802a31f9469a17cd8fc8b78e6d2326e0571bc93f3ac8d19811a42a1b185df95；Root 本地接收 ef2d306。Web src/generated/bff-public-openapi.yaml 与现 generator pin/派生物均不修改；本地 artifact 不等于 remote 发布或 normal activation。

D0 冻结时 handwritten catalog.ts 的 AgentCandidate{name,description,is_default} / agents 列表、agentCandidatesPath() 与 SessionClient.listAgents 不对应任何正式 BFF GET /v1/agents 或 Agent GET /agents。Root 裁决删除这组 Web browser-private 假定，不用空目录 200、fallback 或模型/Skill 映射掩盖 404。模型 GET /models 消费不变，信任上下文、通用 /api/session adapter、BFF routing 和任何 owner HTTP 路由都不在本片修改范围。

### 目标请求与保留合同

- 正常工作区、Settings 不再读旧 agents 目录；删除该客户端方法、路径、候选 schema、preview 目录响应及 UI 调用。
- Web composer 不再生产可选 agent：其消息继续包含 canonical idempotency_key/content/thinking/selected_skill_source_refs，按原规则附 model、project_ref；其他受信身份与既有合同不变。删除的仅是该 UI 的 preset 输入，不使 BFF 公开字段非法。
- src/contract/chat.ts 中 MessageCreate.agent 和 contract/api-contract.test.ts 原合法 agent 输入断言必须保留。后继在该既有测试补“不带 agent 的消息也被接受”，与 execution-adapter/engine 的“不再生产 agent”断言分层，禁止修改 owner OpenAPI、pin 或 generated 来制造绿灯。
- unknown-ACK 重试沿原 pendingSubmission，保同 key/完整 body 等值和有效模型、mode、Skill、project 参数；不在 retry 时重新读取偏好或重组意图。
- /app/agents 与 /api/agents/[...path] 的连接 setup 保留，后者仍消费正式 /v1/agents/connections/setup。现 tests/system/agent-route.test.ts 是独立路由保护，不因删除目录而删除；其 owner setup 404 未决不在本片关闭。

后继同步三个旧说明 docs/integration/business-bff-contract-v1.md、chat-bff-contract-v1.md、user-web-api-contract-v4.md 的目录/preset 声明，明确不再消费，不新建第二合同。Root 验收应分别核工作区和 Settings 零旧目录请求、模型仍可用、消息/重试 body、独立 setup 路由保留。测试仅使用明确 fixture；真实浏览器与真实 owner 组合分别记录，不拿 fixture 冒用户 E2E。本轮只写三 D0 前缀，未运行契约或工程门。

---

## T-P02.R255-WEB-NEXT：ScheduledTask recurrence/next 契约消费者（本地候选，normal 未激活）

固定前置为 BFF local immutable artifact：commit `45e67f0e783fb4bcdb086665a09b7c3c5fadbb6f`（源码父提交 `e603bd55`）、canonical `contract/openapi/v1/openapi.yaml`、Git blob `1b42d49388ca26eaaef7371daf23cbf1158d5fe6`、public `8.0.0`、全文 SHA256 `0802a31f9469a17cd8fc8b78e6d2326e0571bc93f3ac8d19811a42a1b185df95`。Root 本地交接 commit 为 `ef2d306`；该 artifact 尚未 remote push、registry 发布或 normal BFF/schema 激活，因此这里只记录本地发布接收与消费者候选，不冒称线上或当前正常服务已经生效。Web 冻结基线为 `97a79d45f93a6007fb0f37002372fd503cd0d373`。

`ScheduledTask` 必有 `id,title,prompt,frequency,time,timezone,next_run_at,auto_approve,enabled,status`；`next_run_at` 严格为 UTC `date-time` string 或 JSON null。字段缺失、offset 非 `Z`、date-only 与未知字段均失败封闭。null 表示 owner 当前没有已确认下次执行时间，Web 不合成日期；合法 string 原值映射到 `nextRun` 并仅用于既有显示和日历分组。

`CreateScheduledTaskRequest` 保持五个 required 字段 `title,prompt,frequency,time,timezone`，可选 `recurrence_anchor_at`，不再允许输入 `next_run_at`。`ScheduledTaskPatchRequest` 是 closed object，显式允许 `title,prompt,frequency,time,timezone,recurrence_anchor_at,expires_at,auto_approve,enabled,status`，均可选且不允许 `next_run_at`；`expires_at` 继续允许 null 清除。当前 editor 没有 anchor 控件，合法省略且不得计算代填；collection/path/idempotency/error envelope 不变。

唯一 snapshot、两 generator 与8个 whole-public pin 已切到上述 commit/digest；runtime contract、mapper及列表/日历 actual `Response` 反例已实现。当前辅助 focused 148项通过；正常 IAM/BFF 的真实响应与浏览器新建/暂停/恢复/hard-refresh 仍需 Root 在 normal source/schema 安全激活后验证。

---

## T-B03.R255-WEB-CREDIT：当前消费者源码候选（待Root集成与真实用户验收）

当前切片只消费个人可用余额/预占及owner journal，不再读by-model或推导Free、每日赠送、quota、低余额阈值。固定BFF `97a99d35c8c78e7ca6e1370fd16ba5d670766095` / public `8.0.0` / OpenAPI全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`，owner正式blob原字节复制，现两个generator正规派生；不双读旧wallet。

现 `/api/session/billing/summary` 与 `/api/session/billing/ledger` 复用可信session adapter。strict closed账户/流水data保十进制字符串、BigInt显示尺度10^6与owner UTC Z瞬时点（按用户locale/本地日历展示），disabled展示owner只读值；404/503是error而非零余额。每读10秒总预算覆盖headers/body/parse、真实abort及reader释放；mounted panel独立loading/error/ready，刷新撤旧投影，分页单flight、显式同cursor重试、null终页、重复cursor拒循环与journal去重。现主体marker仅退役结果，不赋权限、不建第二store。

Account与rail popover未知套餐均占位，保身份/订阅入口及原布局；preview仅显式fixture，不是live失败fallback。此节覆盖下方历史消费者状态，原mixed正文不修改。三面D0已批准、D1行为反例已由Root复跑；当前生产/测试候选待Root工程复验、独审与提交。真实Billing账户200、余额/流水翻页/刷新/跨主体浏览器验收尚未执行，正常503退出loading不证明资金旅程完成；70组台账不虚增。

---

## T-B03.R255-WEB-CREDIT-D0：个人余额与流水（Root批准设计前缀，生产未授权）

本节覆盖下方历史个人余额/quota/free/by-model消费者描述，不覆盖任务外mixed内容。阶段为D0三面设计收口，尚无生产、测试或生成修改许可，不以文档宣称页面完成。Web基线 `e8ff7599a62b045b0e7a3d20e8fd50894b31a099`；固定前置BFF正式commit `97a99d35c8c78e7ca6e1370fd16ba5d670766095`，public OpenAPI `8.0.0`，源 `contract/openapi/v1/openapi.yaml`，全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`。不可沿mutable main、旧f3c64d90 snapshot或旧wallet shape双读。

Root正常HTTP证据：正规IAM登录后 `/api/auth/session` 为200/authenticated；真实 `/api/session/billing/summary`、`/api/session/billing/ledger?limit=50` 均503 `billing_unavailable`、private/no-store且带request-id，当前Billing正常入口尚未启用。`/api/billing/me/*`不存在，其404不是缺账户业务证明。新合法200与旧Web schema不匹配属于已核静态消费者缺口，尚未取得真实账户200或Credits浏览器失败/成功证据。70组11通过/6失败/14待复测/38未验/1支付后置不虚增。

### 唯一browser-private读取契约

- `GET /api/session/billing/summary` 无body/query，映射 `/v1/billing/summary`。现adapter解包success data，DTO严格恰 `{credit_account_id:uuid,status:"active"|"disabled",available_micros,held_micros}`，两个micros为 `^(?:0|[1-9][0-9]*)$` decimal string。
- `GET /api/session/billing/ledger?limit=&cursor=` 无body，仅limit十进制整数1..100（缺省50）及opaque cursor长度1..2048，拒未知/重复/非法输入；映射 `/v1/billing/ledger`。HTTP参数转义后owner收到原cursor，浏览器不解码其业务结构/trim/重建。
- Ledger data严格 `{items:[{journal_id:uuid,sequence,delta_micros,balance_after_micros,source_kind,source_ref,created_at}],page:{next_cursor:string|null}}`；entry闭集。sequence/balance_after_micros canonical nonnegative integer string；delta_micros正式signed integer正则 `^-?(?:0|[1-9][0-9]*)$`。source_kind非空、source_ref非空且≤255；created_at为合法date-time UTC `Z`字符串，不旧epoch数值。page.next_cursor必有、null终页，字符串最长2048按正式schema，不私自换旧optional next_cursor。只有非空cursor继续取页，异常/重复cursor失败封闭，不循环。

summary/ledger data的schema只此一版：删除balance_micros/quota/period/plan/free/daily、entries/entry_id/reason/run/title/conversation_id与by-model旧消费者，不建立union/fallback。source_ref是owner业务引用，不是Conversation导航凭据，不能猜URL或补读其他owner。micros/sequence不Number化；BigInt显示移位10^6不是费用倍率/余额重算。disabled仍只读真实值，无默认active/free或合成总余额。

两读沿现Product Session/IAM admission，tenant/subject不从query/header/body自报；现session adapter保success unwrap、private no-store、合法x-request-id及稳定error。401/403、404 billing_account_not_found、429、502、503 billing_unavailable/invalid upstream等正式错误按code/status处理，不统一零余额/空流水。合法有账户零值与合法items=[]是ready，不存在账户/服务故障是error。浏览器不携Billing URL/SDK/service proof，保持同源API。现代码尚未改且本轮真实仅503，不以静态wire差异冒已有真实200 parse FAIL。

### 边界行为与阶段

client单GET10秒含headers/body/校验，abort/timeout/stale attempt不能准入结果；初读/刷新/分页失败明确退出loading并显式Retry同一读，无自动资金写或mutation重放。主体/准入/卸载变化先退役旧读取，严格header/media/data/schema拒绝，不能为新wire降request-id/no-store/权限。现session adapter正常路径不另造route。

Root随后授权测试actual Response证明新shape接受、旧shape拒绝与错误/取消，固定pin正常生成及既有contract门；真实正常IAM/BFF/Billing→Credits余额/预占/流水分页/刷新/错误与主体隔离才用户验收。现三D0均仅目标，未授权生产/生成；支付、赠送、usage定价及完整70组不因此关闭。

---

## R254-FOLDER-LISTS：专案嵌套与普通会话常驻（Root批准，2026-10-05）

Web只改变mounted view props与callback携带的固定来源scope/read identity，不改变BFF版本化公开/同源wire或generated。列表仍现owner GET，project_ref可空仍唯一归属，展开不创建Conversation/Run或发消息。普通组固定direct，expanded project组各自cursor；不得扫全量本地分组，不请求折叠组。

选行使用现canonical /app?conversation=ID 或 /app/project/P?conversation=ID；列表来源与正文当前scope不可混用。改名/删除/Move仍现SessionClient命令与closed ACK校验，来源scope来自group、tenant/subject来自已验证上下文；pending/unknown/timeout不伪删/搬行，不自动重发。matching ACK只按固定scope失效原索引并刷新已挂载source/target，折叠目标以后展开再读。scope/subject/实例fence禁止迟到数据串组或旧命令抢新选择。没有新API、契约owner、error envelope、idempotency语义或兼容alias。

本节仅R254目标；准入、权限、owner receipt及原网络契约仍现实现事实源。先现UI行为反例，再窄实现与Root真实owner/浏览器复验，不以辅助fixture绿称接口或整页闭环。

---

## R252 匿名首页输入回归修正（Root最窄补充裁决）

审查发现现stashPendingDraft把匿名首页提示混入未标主体的localStorage全draft map；首次verified准入清旧map会丢有效输入，直接保留未知map又会泄露旧主体草稿。选择保留原首页业务、分开显式用户本次登录输入：仅现use-draft的专用stash/consume与现landing开始动作创建一次性sessionStorage prompt handoff，不新增目录/认证cookie/URL参数/认证实体，不改Skills正常stash。现page-clients在verified identity/竞态fence成立后先清未知或跨subject旧map，再严格消费并仅预填__pending__；同subject保完整map但也消费本次显式输入，绝不自动提交。

handoff是closed [1, created_at_ms, trimmed_prompt]，300秒以内且非未来、非空、最大65536字符；这是本浏览器交接的新增有限输入防护，不冒现API已有限制。首页现Textarea同maxLength，空白开始也清旧handoff；consume先remove再strict校验，无效/过期不恢复、不fallback旧pending。恢复写必须严格storage set而非吞失败的persisted-store helper；任何storage失败不更新marker、不admit。普通tab隔离仅按sessionStorage语义，duplicate/window.open可能继承初始存储，不宣称防复制；无论如何只预填而不执行。权限仍来自正式session/BFF，不由prompt证明。

方案比较：淘汰废止首页草稿（有效业务回归）；淘汰marker-null保旧map（未知主体泄漏）；采用现draft职责内单次显式prompt交接。原9源之外仅追加现use-draft.ts、landing-page.tsx，现tests/ui/use-draft.test.tsx、landing-page.test.tsx及已准入page-clients测试；同仓原writer，Root三D0与Git独占。先现测试证明首次verified准入丢本次输入，再实施；所有旧actor数据/异步race/清理失败断言保留，最后独审与Root真实首页输入→登录→只预填验证。

## R252-WEB-AUTH-RETURN：browser-private返回意图（2026-10-05；Root批准D0）

仅Web /login GET新增可选单一return_to；无参数合法默认/app，有参数必须恰好一次且无额外query，单次解码后严格验证，畸形拒绝无导航。目标≤2048字符；path仅/app、现agents/plugins/scheduled/library/skills和canonical project_<loweruuid>，无encoded path/额外slash/absolute/protocol-relative/control/backslash/hash。不以“只pathname”丢会话或已选标签：/app和项目仅可选canonical conv_<loweruuid> conversation；scheduled可选tab=calendar|list及canonical project_id；Library保留现tab/type/q/view/favorites有限显示过滤（q≤512，view=grid|list、favorites=1，type按现UI真实枚举），其他页无query；重复/未知key或错误值拒绝。具体canonical serialization保持浏览器等价语义且MAC/消费一致；不恢复hash editor/自动mutation。

public /api/auth/signin/kokoro-iam仍仅form csrfToken；内部typed Context传经校验target，HTTP不能构造该字段，禁止私有header绕公开准入。现固定OIDC callback URL、scope/resource/issuer/code/queryexact/PKCE/nonce/三cookie/state/identity验证不变，target不发送IAM，不携tenant/subject/secret。所有验证成功才303 same-origin bounded target；Redis/签名/replay失败沿现稳定码及cleanup，不跳未验target。所有auth no-store/no-referrer、无target原值/query/token日志。角色与业务读写仍BFF/IAM current subject裁决，target不是授权。

## R251-WEB-SKILLS-V2：消费BFF public8.0（2026-10-05；实施准入）

唯一事实源是BFF正式f3c64d90f4a6fd7083252ff3d1646c5ad1dee292 OpenAPI8.0.0，digest278fc0a60516617d41c754b7957fadbcc77f9b6132fa9f1a8af9409464319d0f，仍/v1、91ops。仅版本和Validate manifest_identity严格zip-v2值域改变，其余五字段/请求/错误/权限/幂等不变；Web复制committed原字节snapshot，现两generator正规派生，手写六字段schema只V2。旧V1、坏digest、未知字段拒绝且零Publish；不改Hub严格header/media/admission，不以Validate当发布/安装成功。

本轮属已批准未上线clean-slate替换，不保旧snapshot/旧parser双轨；Team/failure生成pin精确更新，不手改输出。当前源码/生成未实施，真实整页Publish/Install未验。

## R186-W-SNAPSHOT-DEADLINE：browser-private读取预算（2026-10-04；tests-first）

同源snapshot请求及同一anchor的全部process-page请求共用固定10秒本地总预算，包含headers、body与严格schema解析；分页不得逐页获得新预算。耗尽是Web本地首次水合失败，显示现安全错误并只允许显式重读，不转换为owner error、Run terminal、空snapshot或partial成功，也不重发Message。scope/generation/dispose继续abort；公开BFF contract、请求参数、错误envelope与AG-UI stream wire均不变。

## R177-WEB-PRD-NO-INTERSTITIAL：无旧document Retry协议（2026-10-03；tests-first）

anonymous撤权后Web只发起一次固定`GET /login` document navigation；不新增本地错误envelope、ACK、轮询或重试command，也不把页面内beacon解释为commit。`/login`真正响应继续严格为空query/可信Host与Origin，成功只允许302到既有IAM authorize，预检/CSRF/signin失败为no-store受控503；旧App Runtime永不恢复。原R165的整页Retry期待与当前用户目标冲突，保留其失败证据，待新严格handoff成功链通过后由Root正式收敛验收而非skip。

## R175-WEB-ANONYMOUS：browser-private composition 不扩 wire（2026-10-03；tests-first）

不新增 API、header、cookie、redirect或readiness协议。可信 browser session `200 authenticated:false`仍立即撤销 Runtime，并由现固定 `/login` native document navigation接管；在该 navigation commit 前，已由server Product Session准入的旧document只允许显示无数据 booting壳，绝不显示旧Conversation/draft或发owner请求。现10秒watchdog仍存在但不构成navigation ACK；首次无cookie的server `307 /login`规则不变。测试用闭集fixture beacon只观察DOM安全不变量，不进入生产contract。

## R173-SERVER-ADMITTED-SHELL：内部 booting composition（2026-10-03；tests-first）

不新增 HTTP API、wire schema、cookie、header或公开错误。layout 成功验证 HttpOnly Product Session后只投影内部无 claims布尔 `serverAdmitted`；AppGate据此选择现 AppFrame 的 `booting` presentation，不把它解释为客户端 authenticated。真实 probe完成前不得创建 owner client state或发 BFF sessions/models/agents/Chat请求；首个401/503/坏响应进入现fail-closed UI，可信anonymous在native sign-in commit前保留同一data-free booting壳。只有可信200 authenticated与auth-index fence成功才首次mount Runtime。anonymous SSR redirect、trusted-origin/Redis failure、preview规则不变。

真实Next门包括：正式cookie的原始GET `/app` 返回200，HTML含实际main/composer且不含runtime/app-frame spinner；浏览器hold首个真实session probe时同一booting shell可见且owner请求为零，release可信200后Runtime首次mount并保持原R147 cold/reload oracle；首次unavailable不得展示旧Conversation。这不是旧document恢复证明。

## R170-W-MOVE-UI：内部调用与用户可见状态（2026-10-04；候选已实现，发布待 Root 集成）

本片不新增HTTP/API；只消费required `SessionClient.moveSession`。Engine冻结canonical `sessionId`、`targetProjectId|null`与一次`commandId`，同一显式retry复用三者。没有unknown intent时retry返回`null`且零owner调用；pending时重复同意图共享结果，不同target也返回rejected而不换key。只有validated matching 200 ACK返回confirmed；明确且终局的owner拒绝为rejected；network/deadline/abort/parse/adapter、503及409 `idempotency_in_progress`为unknown。UI不得从list差异推断成功、不得换key自动retry、不得在ACK前导航。

active confirmed导航为Project target `/app/project/<canonical>?conversation=<canonical>`，Direct target为`/app?conversation=<canonical>`；保Conversation ID。运行中Run不取消、不重发，target engine以正式scope snapshot/replay恢复。非active confirmed不导航。Project destination只在正式Project list状态ready时取owner-confirmed list并排除current；`projectHref`、preview或synthetic shortcut不能成为目的地，未知/不可见ID没有自由文本入口。TC-C05-UI01..08分别覆盖destination权限、ACK前保全、三方向导航、scope admission、owner rejection、unknown同key恢复及全部迟到fence。

matching confirmed receipt先确立durable outcome，再应用generation/view fence：旧UI projection不导航、不显示错误、不抢焦点，但同scope来源仍必须发起新的owner GET并按canonical membership移除已移动Conversation。该对账不新增HTTP字段、receipt、entity或binding事实，也不自动重发Move。R194-W1只覆盖当前scope；跨scope unknown/late ACK、route未dispose及blocked-storage硬刷新仍为W2 OPEN。

R195-W2仍不新增HTTP、cookie、header、error code或owner字段。页面单槽Move coordinator只在现可信session probe已admit的verified subject下调用required `SessionClient.moveSession`，冻结原`sessionId/targetProjectId/commandId`与由此产生的同一body；scope/route/view engine不是调用身份。matching 200 ACK即使原view已unmount也必须结算，并立即按source scope+sessionId精确驱逐现browser内存/持久Conversation索引，再递增source/target有界per-scope version以取得新的canonical GET；不保存可被连续Move覆盖的per-session待办，不阻止下一次Move，不插target假行。旧view不得导航、报错或抢焦点。network/abort/parse/adapter、任意503及409 `idempotency_in_progress`继续为unknown：mount、focus、canonical GET和scope切换都不得自动POST，只有同一verified subject的明确Retry可再发一次完全相同的`Idempotency-Key`与body。

可信anonymous、subject change、logout、pagehide或真正document coordinator teardown通过epoch-fenced revoke清除/abort冻结command；普通probe effect cleanup与StrictMode replay不构成revoke。新subject既看不到也不能重试旧subject command，revoke后的迟到resolve/reject不得恢复unknown、发布reconciliation或导航。session probe temporary unavailable只suspend start/retry，不把owner outcome分类为closed rejection；同subject、同epoch的pending ACK仍可结算，恢复只解冻现slot且不以新key/body自动重发。上述均为browser内部生命周期，不改变BFF 7.1 Move、same-origin route或10秒client预算。后继必须删除engine-owned intent/retry双轨，禁止同时从engine与coordinator发Move。

---

## R167-SERVER-FIRST：首文档认证边界（2026-10-03；待 tests-first）

`/app` 与所有 `/app/**` 是 Web browser-private 页面边界，不新增公开 API。首次 document GET 在渲染 client `AppGate` 前，以现 Product Session cookie、当前 Redis generation/tombstone 和 `accessExpiresAt` 作同一 owner admission：无 cookie、无效/过期 cookie、stale generation、tombstone 或过期 access 固定进入相对 `/login`。具体 wire 允许真实 Next 的非 streaming 3xx `Location: /login` 或 streaming 200 redirect 表达；不得预设 307，也不得在任一表达中输出 `runtime-loading`、claims、access credential、session id、subject、cookie或查询参数。

配置缺失、Redis超时/失败不是 anonymous，必须 fail closed 为有限 unavailable 首屏，不跳 `/login`、不触发第二 OIDC transaction。active session 继续渲染 AppGate，并保留 `GET /api/auth/session`、BFF adapter 与后续 revocation 的既有每请求检查。显式 preview 只沿用非 production 开关；production 不从失败降级 preview。无新 endpoint、error envelope、owner contract 或 query。本 D0 的真实 HTTP RED 只验证首文档边界；后继实现与 active/failure 矩阵通过前不称协议已发布，也不把它当原旧文档卡住的因果证明。

---

## R158-W-MOVE-D0：public 7.1 Move 消费合同（2026-10-04；候选已实现，发布待 Root 集成）

唯一 owner 机器事实是 BFF 已发布 public OpenAPI 7.1 canonical SHA-256 `784f77e2c350c43d4fc4bc32933eace136185204ba49ddd738413f9b4b5b4fb5`（文档 `5e119cd6fc007f4ad8ffae048a8fcef687d9a8dc`、源码 `6c5cee0ca5b64dd7e1a855eae1022290eb16cd9a`）的 `POST /v1/sessions/{id}/move`。Web 后继第一片增加 Session client，并在现 `/api/session/[...path]` 内增加仅限该 operation 的响应投影；不增加新的浏览器公开 API、独立 proxy、engine action 或 UI。

- path `id` 必须匹配 canonical `^conv_<uuid>$`；body 必须是 closed `{target_project_id}`，其值匹配 canonical `^project_<uuid>$` 或为 `null`。不接受 slug、alias、source Project、空串或额外字段。BFF public raw URL 的无 query 规则不变；Web browser-private 经 Next 规范化后，把没有实际参数的空尾 `?` 视为同一 canonical URI，但任何非空 query 都必须本地返回 `400 invalid_move_request` 且不向 BFF 发请求。
- `commandId` 是一次用户 Move 意图的稳定幂等身份，必须满足 owner 的 printable 1..128 边界并原样进入 `Idempotency-Key`；client 不 trim、合并、随机替换或自动重发。相同意图的显式恢复才可复用同一 key/body。
- 成功只认 HTTP 200 和 strict flat adapter ACK `{session_id,project_ref}`；`session_id` 必须等于请求 Conversation，`project_ref` 必须与请求 target（含 `null`）相等。owner ACK 没有 `command_id`，Web 不复制或臆造该字段。202、其它状态、bad/extra JSON、错 session/target 全部拒绝，不能提交本地归属。
- 400/401/403/404/409/429/503 沿现 typed client error；网络、abort、timeout 与 503 unknown 均不说明 Move 未发生，也不自动 retry或从列表猜成功。BFF 当前 IAM admission、permission `chat.session.update`、same-key replay/conflict及 `Cache-Control:no-store` 仍是 owner语义。
- Move 不取消当前 Run/stream，不改 Message、Share、AG-UI cursor 或 Artifact 关联；只影响后续 message/Run admission。Web 第一片不投影这些事实，后继 UI/engine 必须在严格 ACK 后才更新视图。

Web client公开的首片边界固定为 `moveSession(input: MoveSessionInput): Promise<MoveSessionReceipt>`；`MoveSessionInput` 是 readonly `{sessionId:string; targetProjectId:string|null; commandId:string; signal?:AbortSignal}`，`MoveSessionReceipt` 是 readonly `{session_id:string; project_ref:string|null}`。该方法是 `SessionClient` required member，不发布optional/feature-detection兼容轨。preview固定抛专属`ConversationMoveError`的`unsupported`分支，不得改变preview sessions或生成假ACK；这不是owner业务错误码。生产实现不得经过现 `postJson`，因为后者会trim/缺省生成key并接受任意`response.ok`，与Move的exact command identity和strict 200冲突。
当前候选已由R170 engine/UI消费此required方法；机器契约字段与owner语义不变，Web没有新增公开endpoint或第二归属协议。
caller传入的非法session ID、target或command key统一是专属`{kind:"parse"}`本地失败：不附owner status/code/retryable/requestId/retryAfter，不发fetch，也不写任何会话归属。

生产Move client自带不可配置的10秒总预算，起点在fetch前，终点在完整body读取、JSON解析与ACK关联校验后；不是只包response headers，也不继承Web→BFF 15秒上界。内部controller组合可选caller signal：已aborted signal不发请求；在途abort转发；timeout与caller abort都拒绝为本地`network` unknown，保原commandId且不自动重发或推断owner取消。所有路径finally清timer/abort listener。该预算只属于Move，不改变其它SessionClient HTTP行为。

Move client拒绝值只使用专属closed `ConversationMoveError.details`：成功校验过的owner error映为 `{kind:"owner",status,code,retryable,requestId,retryAfter}`，其中status/code组合必须属于7.1机器图，requestId来自合法`x-request-id`，Retry-After仅429可按已发布正则保存为string或null。fetch/abort映`network`；200 ACK/body/identity/target解析失败映`parse`；代理自有502、坏/缺owner error、坏/缺request-id或非法Retry-After映`adapter`；preview/fake映`unsupported`。后四类没有owner status/code/retryable/requestId/retryAfter字段。不得借此修改其它`SessionClientError`、建立泛型Error体系或让调用方用message字符串判定unknown。

现 generic catchall 的 JSON success 要求 `{data,meta.request_id}`，generic error也要求 `meta` 且不接受 owner Move 的 `retryable`；因此合法 Move 200 会被降为502、typed Move error会丢业务 code。第一片必须以 method/path/canonical ID 三重精确识别 `POST sessions/<conv>/move`：success只解析 owner `{data:{session_id,project_ref}}`，从必需 `x-request-id` header取得请求身份后向浏览器返回 flat ACK；error只允许 owner发布的 status/code/retryable组合，保原HTTP status、typed error、`x-request-id` 与可选 `Retry-After`。缺/坏 header、shape或status组合 fail closed；generic success/error schemas及其它 route一字不宽化。`tests/system/session-route-http.integration.test.ts` 只作mock-auth direct route门；正向反例必须在 `tests/system/oidc-rp-next-http.integration.test.ts` 复用真实Next、Redis与Product cookie fixture，fixture BFF只模拟owner响应而不冒充真BFF owner。现product-bff Next测试的dead-Redis负例与fetch mock都不能替代该正向门。

机器 pin 更新必须复制 owner committed blob 到 `src/generated/bff-public-openapi.yaml`，把现 Team 与 Agent-failure generator 的 version/commit/digest provenance 更新到 7.1/上述完整 digest，并正规再生/check `src/generated/bff-agent-failure.ts` 与 `src/generated/bff-team/**`。`contract/api-contract.test.ts` 必须新增 Move path/parameter/request/200/error graph并保现 Scheduled/collection断言；七个现 `tests/contract/bff-*-public.test.ts` 继续保护 Team、failure、Library、Project、Skills/MCP fragment，不因全 blob升级删除或放宽。

engine/UI的Move意图生命周期与用户journey已在R170候选实现，但仍不是机器字段或新公开合同；正式发布及真实owner环境启用待Root集成，不关闭原loading P0。

---

## R143-W 会话删除消费合同（2026-10-03；限定实现与完整工程门冻结，实际发布以 HEAD/Root gitlink 为准）

Web 只消费 BFF main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b` public `7.0.0` canonical OpenAPI（SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe`）的 `DELETE /v1/sessions/{id}`。请求必须携带一个 `Idempotency-Key`，并按当前 engine scope 精确携带 `scope=direct` 或非空 exact `project_ref`；session ID 不替代 actor/scope。浏览器仍经同源 adapter 使用受信 Product Session，tenant/subject 不从 body/header 自报。

成功仅是 HTTP 200 且严格 envelope 解包后的 `{status:"deleted"}`。现共享 receipt schema 为 strict object 但 `status` 仍是 string；删除 client 在该解析边界之后再做 literal `deleted` 双判，未扩大或复制 BFF wire。401/403/404/409/429/503、网络错误、超时、abort 和坏 200 均不提交本地删除。404 的 `session_not_found` 同时隐藏缺失/越权/错 scope，不能单独证明“已经删除”。public route 的 required idempotency header 不等于 Web 已获得可依赖的 durable delete replay；unknown 首片不自动换新 key或盲重发，也不把列表首页缺项解释为成功。

DELETE 200 是 BFF owner 事务完成后的 ACK：Conversation 软删、stream consumer fence、share 撤销及所需 cancellation outbox 都由该事务负责。Web 不在 DELETE 前另发 Run cancel；ACK 前保留 Conversation、draft、Run 与所有页面投影。严格 ACK 后才按现本地 fallback 切换并触发一次同 scope 列表刷新。

现真实 Next/Chromium/透明 HTTP barrier 已固定 direct exact URL/query、单请求、ACK 时点与 503 保全；未新增 mock/unit 文件、未注入身份/storage，也未用 preview 代替 owner。Project exact query与换 active 后晚 ACK 的完整 real-UI 仍是 P2；当前 IAB/真实 owner 未验。未决机器契约问题 0；本片未增加 reconcile API、Project 级联、兼容 alias 或第二 DELETE 路径。

---

## R137-E117 当前 consumer contract（2026-10-03；已验证候选待 Root Git）

Web 已固定 BFF main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b` / public `7.0.0` / canonical SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe` 的原始机器契约并正规生成。浏览器同源 catchall 解包 owner success envelope，client 严格解析裸 `RunProcessPage`；错误 envelope 保留 stable code。required nullable snapshot process、exact scope/W/cursor、safe CUSTOM 闭集、Todo/activity替换、全页耗尽后续流与有界410恢复均为当前候选行为，无 public6 fallback、raw alias 或第二协议。

Root 最终 Node22 `pnpm check` 实测 contract 256、architecture 50、2346 tests/0 skip 及 lint/typecheck/build 全通过；本地 preview 真实页面的桌面/移动六节点也全部通过，覆盖 safe process 与正文、TEXT START forming、HITL activity 终态可见性。preview transport 只发 public7 safe `activity.updated`，明确不恢复 raw `tool.returned`；这不是正式 IAM、provider、Billing、真实 BFF HTTP 或全部深层状态码矩阵证据。候选尚未 Git 发布，旧 raw core schema/type/reducer/projection/cancel 清理仍待下一窄切片。下方 R135 是已执行的历史目标合同。

---
## R135-WEB7-D0（历史设计门）：public7 execution process 消费合同（2026-10-03；目标态）

Web 当前仍固定 BFF public `6.0.0`；目标机器事实源已正式发布于 BFF main `a68cbe55cde709f9b21f3d5803bfbd3ca5d14e2b`，`contract/openapi/v1/openapi.yaml` public `7.0.0`，SHA-256 `76d524d731b10d1cd4b16db4dae957701bf5c5d82a3cd915a42bc57617746ebe`。后继只能复制该 committed canonical 原字节并正规生成；本文是消费者约束，不是第二份可编辑 contract。Browser 仍只经 `/api/session/[...path]` 到 BFF，身份/scope 来自现受信上下文，不直连 Agent/BFF、不 body 自报。

snapshot 的 `execution_process` 在 data 中 **required nullable**：null 是没有 durable START；非 null 的 `run_id,todos,activities,next_cursor` 全部 required。`todos:null` 与 `todos:[]` 不同；activities 是 anchor 下第一页而非全集。`execution_head` 与 process 可指不同 Run：A terminal、B queued 时 process 保持 A，直到 B durable START。Web 不从 head、receipt、Message 或 local active id 推导 process Run。

后继严格消费 `GET /v1/sessions/{id}/runs/{runId}/process?watermark=W&cursor=C&limit=N`，并原样携带现 direct/project scope。200 data 的 `run_id,todos,activities,next_cursor,event_watermark` 全部 required；每页 `run_id` 必须等于 path Run、watermark 必须逐字等于 W，cursor 是 opaque pagination identity，不能与 AG-UI `Last-Event-ID` 混用、解码、比较或合成。limit 仅每页 1..100；必须读至 null，不能把 100 项当总量。

Todo 是完整有序替换；CUSTOM 仅接 owner 的 `kokoro.todo.updated` 与 `kokoro.activity.updated`。activity union 仅为安全 tool/subagent/skill 字段：opaque ids、受控 status/display code 或 Skill source refs/preflight/phase/条件 error code。额外字段、未知 discriminator、旧 `subagent.started/finished`、raw name/args/result/error/path/stack 及兼容 alias 全帧拒绝且不推进 cursor。相同 activity 的后续值整体替换并保首次位置；schema 未发布 phase 单向迁移图，因此 Web 不附加一套。 Todo content 的 1..1024 按 Unicode 字符计数而非 JavaScript UTF-16 code unit；非 null Todo 每页最多100。Skill `source_refs` 保序、1..16、unique 且逐项匹配 owner regex；failed phase 必须有受控 `error_code`，其他 phase 必须缺席该键（`null` 也拒绝）。tool/subagent 的 `display_code` 分别固定，交叉值拒绝。snapshot `messages` 延续机器契约既有 optional 语义，不借 public7 顺便收紧。

分页全部成功校验并原子采用后，唯一 AG-UI stream 从同一 W strictly-after 续流；partial 页不成为完整过程事实，不并行开流覆盖。400/401/403/404/429/503 均 fail closed：400 依 exact stable code 区分 invalid query/cursor/scope，401 进入原认证恢复，403 保授权失败，404 保资源不可见/不存在，429 保原限流语义，503 保过程投影或通用服务不可用；不得降级为空数组或 public6 merge。200 响应的 schema、run 或 W 不匹配属于 Web 本地 parse 失败，不解释为 HTTP 400。provenance/compact/frame 完整性错误和 owner 过程页超预算均按正式现有 `process_projection_unavailable` 处理，不发明 `process_page_item_too_large`；1 MiB 是 owner 过程页预算，不是 Web 对含正文/Delivery 的整份 snapshot 附加上限。process 410 `process_cursor_expired` 必须丢弃旧 W 全部页，重新 snapshot 后有界重建；重复 410 终止并显示安全失败。session snapshot 的删除/不存在语义不与 process 410 合并。

每次 scope/dispose/new hydrate 真实 abort snapshot/page/stream，并以 generation 在 parse、append、adopt 三处复核；迟到 success/error/finally 不写新 scope。合法 Message 全文、Vercel `UIMessage` 映射、full HITL、Delivery、optimistic admission、failure 与连接引用计数不变。breaking 策略为 public7 单轨：没有 public6 optional fallback、旧 raw shape、双 reader 或第二 SSE。

精确后继 pin/generator/test/source 与 RED/GREEN 命令见 TECH R135；当前 D0 未更新 canonical snapshot、generated 或运行 contract tests。未决协议问题 0。

---
## R91-WEB-PUBLIC6：`GET /v1/sessions` 查询合同（2026-10-02；正规生成 GREEN）

固定 owner 为 BFF `bb610ea7262574772e1d8c309a6e03171d07d0a3` / OpenAPI `6.0.0` / SHA-256 `75ef9f7a3b28018d9c7a3ca5899f75afe561dd40b794e7f71b0e3d078b29c129`。机器事实源仍是 owner `contract/openapi/v1/openapi.yaml`；Web snapshot 现为该 canonical blob。更新前 public5 snapshot 已形成并保存 123 pass / 13 fail 的真实 RED。

- `GET /v1/sessions` 省略 `scope` 或传空 `scope` 时，返回 admitted tenant 与 subject 可见的全部 active Conversation；不表示 direct。
- 显式 `scope=direct` 只返回 `project_ref IS NULL`；非空 `project_ref` 只筛选该 owned Project。两者同时出现属于 `invalid_scope`，必须在 Project lookup 前返回 HTTP 400 `BadRequest`。
- filter 任一变化后，调用方必须丢弃旧 cursor 并从第一页开始；cursor 绑定原查询，Web 不比较、改写或跨 filter 复用 opaque cursor。
- `DirectScopeQuery` 只能是 `"" | "direct"`，没有默认值；`ProjectRefQuery` 为 optional、nonempty exact string。二者都不覆盖 admitted tenant/subject，资源路由保持原有 project-bound authorization。
- 当前 runtime 已显式表达意图：默认 `listSessions({ kind: "direct" })` 发 `scope=direct`，项目集合发 exact `project_ref`，同源 adapter relay 原 query。故本切片不新增 API 参数、alias、fallback 或 runtime 改动。

测试须固定 exact canonical bytes/version，并对 listSessions operation 的四个 parameter ref、400 response、描述语义及两个 component parameter schema 作机器断言；R76 Scheduled create graph、Safe12、ChatMessage fingerprint、Team9 与其余 operation graph原样保留。

---

## R79-WEB-PROJECT-D0：项目创建上下文的精确消费合同（2026-10-02；目标态，待 Root 门审）

与TECH/DATA R79一致，基线Web main `dc330a99332be28bb74a4fa2d2196ba8425f9dc5`；本轮只写五文档前缀，runtime仍缺项目字段与live创建上下文。固定已发布BFF owner `479d4e8b0aeb438d2ec9cb3d4472130fc1a29972` public5.0.0 / YAML SHA-256 `3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b` 不变；机器source仍是固定snapshot中的CreateScheduledTaskRequest、ScheduledTask和/v1/scheduled-tasks，不在本文复制整套字段/第二契约。下方旧方案仅历史，当前证据见CURRENT R79。

### Browser-private导航不是public参数

- 采用现Project卡→`/app/scheduled?project_id=<exact编码>#scheduled-tasks/new`→现独立Scheduled surface/editor。没有第二live项目编辑器，也不重新使用项目preview callback/合成任务。
- Query仅浏览器创建上下文：缺省personal；project_id存在时必须恰一精确非空、无首尾空白值。重复/空/非法解码/context错误fail closed，明确显示错误/禁保存；不trim、去重、strip、猜最近项目或转personal。URL编码/一次解码只负责传输，不改变原引用；owner允许ID或slug，其可见性只由BFF裁决。
- GET列表仍现个人授权全集，不追加项目筛选query、不把全集称为Project列表。tab/view变化保创建上下文；取消保query、移除editor hash/history标记；显式个人导航回无项目参数URL，旧上下文不泄漏。
- Browser POST固定 `/api/scheduled-tasks` 无query，同源adapter按现raw body→BFF `/v1/scheduled-tasks` 无query；关联只在body `project_id`。上游collection POST禁止query，包括重复/空参数；不能复制浏览器URL search到mutation URL。tenant/subject/admission/权限保持受信session/BFF来源，不由UI填写。

### Runtime narrowing与command语义

create请求与record消费新增owner已存在optional exact project_id，内部Draft/Record为projectId，mapper显式双向转换。个人create不包含该键，项目create保持exact值；不存在project_ref alias。既有五必填、UI auto_approve必填、日期/时区/strict未知key规则保留，不声称本片镜像所有owner可选输入。

PATCH为现任务字段更新，显式排除project_id：create新增字段不得被partial()继承到PATCH。Patch view model/serializer均不加projectId；编辑任务只用owner task ID，query不能变更归属。记录中的projectId是owner投影不是授权证明。创建enabled/status仍拒绝，现PATCH状态与expires null清除保持。

现Idempotency-Key与body fingerprint复用；新增项目字段参与fingerprint，个人/不同Project分离。unknown network/parse只能显式原body原key重试，HTTP404明确失败不自动重试或退为个人。BFF `project_not_found` 404经现adapter/client保存typed status/code；UI安全错误保草稿/编辑器，不reload、不假ACK/本地任务。不存在/不可见不作不同UI探测。成功严格解码owner record后仅当前实例GET权威列表，不直接插入create结果。

### 隔离、验证与breaking策略

上下文kind/精确Project引用/编辑task ID构成无碰撞实例key；context/记录切换清editing/prompt/opener并卸载旧content。异步旧结果的close/error/reload都要当前实例守卫，A→B→A、项目→个人与撤销重开不能复用旧实例；不能把浏览器导航当owner取消。现列表requestSequence与命令身份保护保留。

本片是public5已有能力的Web窄消费扩展，无public版本或机器契约变更、无dual-reader/legacy fallback。精确后继10源码/5测试与唯一已知href断言迁移见TECH R79；其余原assert保持。定向验证命令（后继获授后）：`pnpm exec vitest run tests/scheduled/contract-calendar.test.ts tests/scheduled/client.test.ts tests/scheduled/editor-history.test.tsx tests/ui/kokoro-project-workspace.test.tsx tests/ui/kokoro-scheduled-surface.test.tsx`，再 `pnpm contract`、`pnpm test:architecture`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（或现 `pnpm check`）。当前均未执行，不引用R77门作为新UI证据；Root负责实际owner/browser/e2e。无schema命令，无generated再生成或新contract文件。

---

## R76-WEB-PUBLIC5：唯一已发布 public 来源与消费边界（2026-10-02）

当前批准消费目标为 BFF public5.0.0，published main `479d4e8b0aeb438d2ec9cb3d4472130fc1a29972`；唯一 canonical `contract/openapi/v1/openapi.yaml` / SHA-256 `3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b`。Web 起始 main `28672f330df11cd55f7ff3f89f269acc3fe908cf` 已发布 public4消费者；本前缀覆盖旧版本现状，原 R65/其后历史正文不变。

沿原 exact-byte snapshot 与两个 generator，固定版本/commit/digest，不维护第二可编辑 OpenAPI、双轨、旧 owner alias 或 fallback。public5 仍只有 /v1；browser→同源→BFF 方向、受信身份、现 admission/opaque cursor/full pause/control/recovery、safe12/Message/Artifact 与 Team9 不变。BFF 上游 Product API public 与 Web browser-private 的可见性不混用。

public5 新的 Scheduled create 机器事实源是 owner `CreateScheduledTaskRequest` 及 `POST /v1/scheduled-tasks`：五必填、closed body、可选 exact project_id，删除创建 enabled/status；状态修改仍属于既有 PATCH，不发明创建状态默认来源。Project不存在/不可见由 owner404，参数和幂等由 owner边界处理。详细字段不在本文复制第二份；新增EOF机器图断言锁定required/closed/精确关联/POST404，原 Chat/R74 断言原字节保持。

现 Web 独立create builder 不发送被删字段，已经提供五必填，故本次无 scheduled源码迁移。新 project_id 关联没有 Web Draft/client/live项目创建入口，auto_approve 仍是当前 UI 投影必填；这不是全部public5输入均已由Web运行时schema表达的声明。关联新能力需另一个精确授权切片，不临时造 project_ref alias/透传未知字段。正规生成与门禁证据以 CURRENT R76 为准；真实owner/浏览器组合由 Root 验收。

---

## R65-WEB-PUBLIC4-D0：固定已发布 public4 的消费边界（目标态，仅文档）

本前缀与 TECHNICAL_DESIGN/DATA_MODEL 的 R65 是唯一当前目标；下方旧正文 byte-equal 保留历史，不据其实现 active_run、旧顶层 pending 或 decisions-only。本阶段仅四doc前缀，未改source/tests/pin/generated。当前 Web main06a1c86612d9557d83081bcb67e8fc539ae7eacb 仍消费public3；目标 BFF已发布main3c08a422f3a6aa3cf204c308716cfa64f6d61bb2，contract/openapi/v1/openapi.yaml public4.0.0 / SHA-256 5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6。完整machine是唯一API事实源；以下是consumer约束，不另建可编辑OpenAPI。

### 路径、身份与唯一 snapshot

Browser→现 /api/session/* adapter→BFF /v1/* 保持；session/run来自现路径，tenant/subject/session admission来自既有受信上下文，不body自报。GET /v1/sessions/{id} 的现 data/meta envelope、Message/Artifact/permission与event_watermark不改；data仅可缺失 execution_head，删除 active_run与顶层pending_pauses。无head字段缺失，不收null、空run或旧双字段。closed head required run_id/state/pending_pauses，state精确queued|active|waiting|resuming。

| head state | pending_pauses | UI与恢复 |
| --- | --- | --- |
| queued | [] | 等matching START，不从receipt猜已执行 |
| active | [] | UI streaming；无wire streaming alias |
| waiting | 恰一条phase=waiting完整PendingPause | 所有groups/items直接可见；等待全集决策 |
| resuming | 恰一条phase=resuming完整PendingPause | 保留全集、禁新key重复决定；不是已消费 |

head/最新full-state/Message/Artifact/watermark是BFF授权后同一RR读；Web只消费一次响应，不将多次请求拼成RR。event_watermark仍opaque agui_[0-9a-f]{32}或null，开流使用原Last-Event-ID，不从seq生成cursor。初读错误不是空成功；GC410仅event_cursor_expired允许现snapshot-first bounded恢复，其他错误保持connection unavailable而不是Run terminal。

### full-state、隐私与严格校验

PendingPause是owner完整ChatInteractionState的waiting/resuming投影：required interaction_revision/pause_revision/pause_ref/phase/groups/action_result，不是逐item暂停记录。interaction_revision正JS safe integer，pause_revision非负safe且<=interaction_revision；PendingPause pause_revision正、pause_ref非空。group_id/item_id全局唯一，groups/items原序；waiting/resuming groups非空，active/terminal明确[]。零pause revision对应null ref，正revision对应非空ref；active/terminal可保留历史正revision/ref，不强制归零。

InteractionItem仅required item_id/request_id/kind/allowed_decisions/display及optional nullable validation；kind为tool_approval|ask_user_question|result_review|input，allowed_decisions非空、唯一五类。display required name/description/editable/input_schema，optional nullable result_preview/truncated/source；字符串preview必须有boolean truncated和非空source。validation如存在仅owner json_schema_invalid/instance_path，不从私有args合成。闭合边界、integer范围及字段存在性以固定machine为准，任意业务input_schema/args/value字典不递归改写null。

action_result为null或command_id/pause_revision/kind；kind是accepted/native_consumed/validation_failed/unknown/cancelled。action.pause_revision<=当前pause；resuming必须accepted/unknown且精确当前pause。validation_failed的waiting携上一轮action revision，新的waiting非空action不代表已submitted。owner额外交叉约束由consumer contract向量及decoder验证，不凭nullable缺失默认化。

禁止公开/消费checkpoint locator、task/interrupt私有定位、原tool args、submitted decision value、risk/segment/checkpoint等旧字段；display/input_schema是明确公开数据，不据描述解析新wire。snapshot与CUSTOM共享同一consumer full-state校验，不维护第二协议。schema放既有control.ts，head/body在chat.ts，AG-UI frame在agui-events.ts；control不反向import后二者。

### AG-UI queued 与完整 interaction

GET /v1/sessions/{id}/events 继续durable AG-UI SSE，metadata/cursor/event_id及UTC timestamp沿现协议；不发opened/resolved逐项delta。

- CUSTOM kokoro.run.queued：strict value仅run_id、dispatch_sequence；dispatch_sequence正decimal string。此BFF专属metadata含source_owner=kokoro-bff、seq正decimal string、event_id/session_id/run_id/timestamp；run_id与value一致，source seq与dispatch sequence一致。复用现dispatch-error的精确字符串语义，不把任意CUSTOM开放成string/number union，不把BFF seq写入Agent numeric lastSeq或Number舍入。
- CUSTOM kokoro.interaction.state：value是完整六字段，包括active/terminal明确空groups；metadata为现Agent数值序列分支。先校验frame/full集合/当前run revision，再承认opaque cursor；map到现data-kokoro UIMessage part和内部projection，不另开SSE。
- 同revision同完整内容可no-op，omitted与null仍不同；倒退/同revision异内容fail closed。Web仅比较完整验证对象，不实现Agent control digest、BFF mutation fingerprint或owner interaction_digest。
- interaction phase terminal不是RUN_FINISHED/RUN_ERROR。真正matching Run terminal仅结束该Run；A terminal之后B queued仍必须drain，跨批/跨页不早关会话。最终无live head关闭idle stream；重连与Run状态分开。

### control 完整集合与 ACK

现 POST /v1/sessions/{id}/runs/{runId}/control、Idempotency-Key与receipt envelope保持。public三分支闭合，不接收session_id（该边界在旧BFF也已存在，不写成public4新增身份要求）：

| kind | required public body |
| --- | --- |
| run.cancel | kind |
| run.resume | kind、decisions、expected_pause_revision、pause_ref |
| run.steer | kind、message_id、content |

expected_pause_revision正safe integer，pause_ref非空；locators不optional、不default。五closed ResumeDecision都使用item_id：approve可选nullable object args；edit必需object args；reject可选nullable string reason；respond必需非空response；submit必需object value。submit不是request_id，其他分支不是tool_id，不保alias。decisions覆盖当前所有groups的item ID恰一次，按展示原序构造，重复/缺失/额外/disallowed整批拒绝，不能只补剩余项。UI以allowed_decisions为动作白名单，不从旧kind固定子集推断允许动作；edit另遵守display.editable，不从私有args预填。

冻结提交身份绑定当前session/run/pause_revision/ref，保key/body及完整业务null。HTTP202 receipt（即status=succeeded）仅admission/replay，不清卡、清groups、标rejected或转active；本地inflight防双发不能假冒owner resuming。只有durable accepted/unknown full-state进入resuming且全集保留；native_consumed下一完整revision空才active，非空为新waiting/re-pause；validation_failed显示新waiting与owner validation。普通tool returned/activity不解除pending；cancel ACK也不制造terminal。

结构错误400 invalid_run_control；不可见会话404 session_not_found，非当前/不存在Run404 run_not_found；stale pause/ref或非waiting且非合法同key recovery409 run_control_conflict。same key/different body保持409 idempotency_conflict、处理中idempotency_in_progress，不把后者当terminal或放弃unknown原意图。resuming只允许与当前action_result.command_id一致的原key恢复，不能换key重decide。网络unknown保留原key/body；新pause替换时旧ACK零写，snapshot-first对账而非本地猜清全集。Web不从receipt.request_digest重算owner摘要或私有request。

### 生成、消费者断言与后继门

准确机器消费、生成/七pin测试文件集及完整RED矩阵以同TECH R65为准；本轮不更新src/generated/bff-public-openapi.yaml。后继仅从已发布3c08a422 blob复制，固定version/digest，现failure/Team两generator正规--write/--check；safe12 failure fingerprint/九Teamoperation和其他owner语义不放宽，不手改generated、不新增Chat SDK generator。现contract/api-contract.test.ts对固定机器的ExecutionHead/ChatInteractionState/PendingPause/ResumeDecision/RunControlRequest图做独立closed/negative assertions，而不是只改版本让旧decoder静默接受。

首次public4用户激活必须snapshot/queued/完整pause/control/FIFO一片通过；无public3双读、HTTP4 terminal retry、retry_of_run_id或future P3B API。本D0未运行consumer RED、正式HTTP或浏览器；Root后继文档审→RED复验→source/pin/生成→contract/architecture/完整静态和行为门→正规owner组合验收。

---

# Kokoro User Web API 与协议契约

## WEB-PROJECT-READ-R42：指令历史复用已发布 wire（仅设计与 RED，2026-10-01）

独立审查发现原指令读取仍有未经 schema/boundary 校验的第二 GET，旧 data??payload 与 array assertion 不是当前 owner 协议。
本修补不变 public3.0.0/293dfe artifact acd92e pin，不新增 auth 字段、route、分页或 contract 版本。
现 GET /api/hub/projects/{id}/instruction-revisions 对应 GET /v1/projects/{projectId}/instruction-revisions，
operationId=listProjectInstructionRevisions，project.read，public/beta；路径 ProjectId 已由 owner 参数定义，当前无分页。
ProjectInstructionRevisionResponse 是 data.items + RequestMeta；每条 required id/instruction/updated_at/actor_name/current，
分别 string/string/date-time/string/boolean。consumer 在唯一 project.ts 校验开放 additive 字段与闭合 RequestMeta，
UI 映射 updated_at→updatedAt（瞬时点 epoch ms）、actor_name→actorName；不直接断言成 camelCase 数组。
现 PATCH /api/hub/projects/{id} 仍对应原 UpdateProjectInstructionRequest（instruction）与 ProjectResponse，原 Idempotency-Key 保留。
正式指令只消费已验证 Project detail/集合的 instruction，零额外 detail GET；历史 GET/PATCH 同读取边界、取消和 10 秒 deadline，
迟到旧身份响应不更新 UI，错误不制造空成功或正式历史记录。旧 fallback 删除但功能保留；本阶段尚未实施。

### R43 固定 wire 消费候选进度（2026-10-01）

现 project.ts 已验证 required revision snake_case 字段、data.items 与闭合 RequestMeta；开放 additive shape 保持。
GET history 与 PATCH 均用现同源路径、no-store/AbortSignal/10秒 fetch+body deadline，PATCH 原 instruction/Idempotency-Key 保持，
响应 ProjectResponse 的 id 必须匹配请求；当代 ACK 仅刷新正式 GET，不把请求正文或随机 revision 当持久事实。
正式 instruction 来自 validated current Project；无新 route/owner/version/pin/generated。固定生成物两项 --check exit0。

## WEB-PROJECT-READ-R40：固定 owner 读取已接入候选（2026-10-01）

Root 批准 D0 后，Web 用现 GET /api/hub/projects[/id] 接固定 public3.0.0 owner artifact；版本/commit/digest/generated 原字节未改。
共享 contract/project.ts 保留 Project 原字符串与 required/optional/date-time；Project/envelope 接受 additive 字段，RequestMeta 闭合且
request_id 长度 1–256。创建与读取共用唯一 ProjectResponse，旧创建 schema 路径删除；创建本地导航身份 guard 与原幂等不变。
读取无 body/身份 header/Idempotency-Key/分页；opaque id 仅 segment 编码，detail 回执 id 必须与请求一致。
每请求 GET/no-store/取消与 10 秒 deadline（含响应体）；取消/失败不是空成功，无自动重试或第二协议。
受信 subject 仅在页面的 Project 读取边界内保留；本地代际不上 wire，不替代 BFF 每次授权。401/403 及详情404 停用读取重试，
429/503/网络/JSON/shape 错误只给安全失败反馈与显式重试，不显示 upstream payload。

原创建和新 list/get consumer/owner-pin 断言已定点通过；完整门、真实登录浏览器与 owner 组合证据由 Root 后继验收。
下方 D0 保留为固定边界与历史阶段证据，禁止据候选宣称发布闭环。

## WEB-PROJECT-READ-D0-R39：固定正式 Project 读取边界（2026-10-01；仅文档候选）

本段是当前 Project read D0，替代历史 mock 描述的实施依据，不宣称已接通 consumer。事实源是 BFF
contract/openapi/v1/openapi.yaml；目录 v1 不等于 info 版本。当前发布 pin 为 public **3.0.0**，owner commit
`293dfe7638e5dea0df2bee6dfdd8483b53fc9df6`，整文件 SHA-256
`acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b`。
Web src/generated/bff-public-openapi.yaml、该 owner commit 的 blob 和当前 BFF main
`759bfe0a8c521946cae31a74b6426f43b063bae1` 的此契约实读原字节相同；当前 BFF 八项 dirty 不属于新发布事实。
现 tests/contract/bff-project-create-public.test.ts 与 scripts/generate-bff-agent-failure.mjs 已固定同 pin；本 D0 不更新 generated。

| 浏览器私有边界 | 正式 BFF owner 操作 | 机器响应/限制 |
| --- | --- | --- |
| GET /api/hub/projects | GET /v1/projects，listProjects，public/beta，project.read | ProjectListResponse；当前无 cursor/limit 参数，响应无 next_cursor，不能合成分页。 |
| GET /api/hub/projects/{id} | GET /v1/projects/{projectId}，getProject，public/beta，project.read | ProjectResponse；opaque id 按路径 segment 编码；不把 slug/品牌/会话标题当 id 或建立 UI alias。 |

同源 hub adapter 已经使用 admittedProductSession/productBffHeaders 转发上述路径；身份来自 Product Session/BFF admission，
浏览器不直连 owner，不提交 tenant/actor/header 身份。读取只有 GET、no-store、取消与有界 deadline；没有 mutation、
Idempotency-Key、第二协议或新 route。原创建 POST/同键意图、项目 SessionScope 与 AG-UI 不变。

后继共享 consumer schema 必须从该固定 Project、ProjectListResponse、ProjectResponse、RequestMeta 定义校验，
不从历史 mock 文档复制字段；保 required/optional、类型与 date-time 约束，id/name 原字值不 trim、重命名或派生。
Project 及其 envelope 的额外字段按机器定义的开放性处理，不擅自 strict 拒 additive 字段；RequestMeta 的
additionalProperties:false 与 RequestId 约束保持。consumer 不是第二可编辑公开 contract；create 与 read 共用唯一 shape。

错误保持分层：401/403 是身份/权限拒绝，清旧读取数据并停止使用；detail 404 是该项目不可见/不存在，不填空详情；
429/503/网络失败及无效 JSON/shape 为明确 error，可显式再 GET，但无自动无限重试或 fallback。GET 被取消不生成空成功，
响应是否写回由本地读取 generation、controller、当前 projectRef 与 authenticated boundary 共同裁决。
list 成功 projects=[] 才为 empty；当前无 continuation、无合并多页或“已加载全部分页”的声明。

后继扩现两个 project contract tests 核 list/get 的 path、ref、permission、无分页事实及完整 pin，并锁共享 schema 及创建回归；
UI 先 RED 再实现，Root 后跑 pnpm contract/test:architecture/lint/typecheck/test/build 与真实登录浏览器。
当前 /api/auth/session 已有 subject；只把其受信投影保留到本地 Project 读取代际，不新增 wire/token/tenant 字段。
身份 generation 的内部装配与四文档一致性待 Root 审查，未运行契约检查或浏览器验收。

## WEB-IDLE-TERMINAL-P1-R26：订阅生命周期不改变 wire（2026-10-01；源码候选）

本片不修改 public 3.0、同源 route、AG-UI frame、cursor、receipt、generated 或错误 envelope。BFF terminal ledger head 的
`200 text/event-stream` 后 EOF 是已发布终态收口；Web 对 settled snapshot 不发 events GET。新 message receipt 或 snapshot
`active_run` 提供 exact identity 后，Web 仍携带 snapshot watermark/最后确认 cursor 打开 events GET；active EOF 仍重连，终态 frame
仍关闭。410 snapshot-first、pre-receipt 原 key/body、late accepted receipt cancel 与真实 owner terminal 全部保持。

首次 snapshot 与 message create 并发时，即使 receipt 先返回，Web 也先等 snapshot：receipt 不触发额外 events GET。snapshot 已含该
receipt run 终态时不再订阅；snapshot 仍为旧 settled 视图或给出 active identity 时，才分别以 receipt/`active_run` 打开唯一订阅。
这是消费顺序约束，不新增 request、字段、状态或 fallback。

BFF 当前尚未为 reload 的准入后/RUN_STARTED 前窗口发布 queued identity；Web 不从 pending Message、正文或数组位置推导它。本片只
修复已证明 settled 的历史会话，不声称该 owner contract 缺口已闭环，也不建立第二协议或 idle polling。

## WEB-CONNECTION-R26：非 connected 写入边界（2026-10-01；源码候选）

本片仍是零 wire 变化。hydrated connection 为 reconnecting/unavailable 时，Web 不发送新的 message create 或 HITL resume；被拒动作不
换 idempotency key、不清 Composer draft 或既有 staged decision。Stop/cancel 仍沿已发布 run control 契约，显式 reconnect 仍只有
snapshot GET + watermark 后 events GET。空新会话默认 connected，首条正常 message create 契约不变。

reattach 本地等待窗口耗尽不会合成 `RUN_ERROR`、failed Message 或 terminal receipt；`timeout` 仅为 Web connection reason。最终
completed/failed 仍必须来自 owner snapshot/live/replay。首次 snapshot error、真实无身份 terminal 与 pre-receipt unknown 继续走既有
独立展示/恢复约定；本片不修改 AG-UI、browser-private route、generated、client typed error 或 public 3.0。

pre-receipt snapshot recovery 所保留的 optimistic user id 只存在 Web engine 内存，execution adapter 仍只序列化既有
`idempotency_key/content/thinking/model/agent/selected_skill_source_refs/project_ref`；不存在新增 JSON 字段或第二种 retry wire。

## WEB-CONNECTION-P1-R25：内部连接生命周期已落地（2026-10-01）

本片机器契约为零变更：public 3.0、同源 route、AG-UI frame、opaque cursor、错误 envelope、幂等字段与 generated pin 全部不变。
`onReconnecting`/`onConnected` 只是 transport→client→execution→engine 的 Web 内部生命周期 callback；429 等 hard HTTP 仍由既有
typed `network | http | parse` 类别 fail closed，不解析或展示 response body、URL、frame、cookie、token 或 provider 文本。

“重新连接”只发当前 conversation snapshot GET 和 watermark 后 events GET；不调用 message create、terminal retry 或 queued command，
不合成 `RUN_ERROR`/failed Message/receipt。owner snapshot/live 后续给出的 active、completed、failed 与无身份 terminal 仍按原严格
身份和 safe tuple 投影。首次 snapshot 失败与未获 create receipt 的同 key/body 恢复保持原契约；已获 receipt 后的 stream/replay
错误不再借用二者的 UI 或动作。

## WEB-CONNECTION-D0：连接状态不扩写 owner terminal（2026-10-01；仅设计门）

本目标不修改 public 3.0、browser-private route、AG-UI frame、opaque cursor、BFF envelope、幂等字段、generated artifact 或
版本 pin。BFF/Agent 发布的 Message/Run terminal 仍是失败事实唯一来源；Web 在 snapshot 已成功后遇到 stream/replay availability
错误，只能建立页面内存 connection 状态，不能合成 `RUN_ERROR`、failed Message、`failedRunId`、retry receipt 或新 user。

协议与动作边界固定如下：

- **exact terminal**：verified Agent/BFF `RUN_ERROR` 与 snapshot failed assistant 继续按既有 strict identity/safe tuple 进入相同
  run footer；无 `run_id` 的真实 failed assistant 继续独立显示 generic。connection 错误不得覆盖、移动、清除或复制这些事实。
- **pre-receipt**：create-message 尚未取得 receipt 的 transport-unknown 仍可用原 idempotency key 与冻结 body 恢复；取得 receipt 后的
  stream failure 不再借用该动作，也不得重新 POST 最后一条 user。
- **initial snapshot**：未得到可信 snapshot 的失败仍是会话读取失败；同源 adapter 与 owner status 保持 fail-loud，不回退 fixture。
- **transient stream**：网络 fetch 拒绝或正常 EOF 继续用最后接受的 opaque cursor 重连；内部 reconnecting/connected callback 只是
  Web transport 生命周期信号，不是新 wire。重复 cursor/frame 仍按既有规则去重。
- **hard stream/replay**：非 expired HTTP、`response.body === null`、非 SSE content-type、严格 frame parse error 或 expired-cursor snapshot recovery
  失败只产生 Web connection unavailable。坏 frame 必须 fail closed；不得尝试 reducer-shaped legacy envelope、第二协议或 preview fallback。
- **显式 reconnect**：Web 重新执行当前 conversation 的 snapshot-first 流程，并且只从返回 watermark 续流；不调用 message create、
  terminal retry 或 queued command。snapshot 的 active/terminal/pending 状态继续拥有恢复结果。

用户界面不得展示 upstream URL、query、response body、SSE frame、raw exception、cookie、token 或 provider 文本。若后继为了诊断扩展
内部 typed error，只允许稳定 `network | http | parse` 类别、受控 HTTP status、稳定 error code 与 request id；它们不是 Run failure
profile，也不得写入 Message/terminal projection。Root 当前尚未取得真实失败请求的 status/content-type/error category，因此本 D0
不把旧 BFF、503/502/429 或 parse drift 中任何一项写成已确认根因。

验收必须证明：旧 failure + 后来 completed + stream hard error 时仍只有旧 exact footer；active partial 在 transient reconnect 中不
terminal；parse hard error 显式恢复不产生 POST；pre-receipt、真实 unattributed terminal 与 initial snapshot error 均保持原语义；合法
410 只走 snapshot recovery；非法 frame 继续拒绝且无 fallback。全部变化是 Web internal API，机器 contract 检查预期零 diff。

## WEB-FAILURE-PLACEMENT-D0：public 3.0 exact run 归属（2026-10-01；仅设计门）

P1 候选只消费既有 identity：snapshot `run_id` 与 verified live event `run_id` 进入同一内存索引；没有 exact identity 的
generic 不归属。实现未修改 public 3.0 snapshot、AG-UI、同源 HTTP、generated pin 或幂等 contract；terminal footer 仍无 mutation，
pre-receipt 恢复仍只复用原 key/body。

本目标不新增 wire。BFF public 3.0 `ChatMessage` 仍提供 `status`、optional `run_id` 与现有 strict
`failure={source,code,retryable}`；failure presence guard 仍要求 assistant + failed + nonblank `run_id`。verified Agent
`RUN_ERROR` 与 BFF-owned dispatch `RUN_ERROR` 已分别携带通过 identity 校验的 exact run id。Web 只把这些已发布身份映射为
`failedRunId`，不得从 message text、空正文、数组尾项、`message_id` 或当前选中会话猜 run。

- snapshot：同一 `run_id` 的最终 owner-ordered assistant record 为 failed 时，Web 可建立该 run 的 compact failure footer；safe
  failure 存在则使用 strict tuple，不存在则为 generic。failed record 没有 `run_id` 时保留独立安全失败反馈，但不声称轮级归属。
- live/replay：Agent `RUN_ERROR` 只使用已校验 top-level/nested 相等的 run identity；dispatch 同样只使用其 canonical identity。
  profile/code/message/source 的既有严格规则不放宽，raw producer details 继续不进入 UI 状态。
- completed：canonical completion 只关闭相同 run。另一个 run 的终态、新 user、Project 切换或正文相同都不是清除/迁移历史
  failure 的协议信号；重复 `event_id` 不产生第二 footer。
- action：public 3.0 没有 terminal retry 或 queued command。owner terminal 的 `retryable` 是分类，不是 Web mutation capability；
  terminal footer没有重发动作。只有 create-message 未获 receipt 的 transport-unknown 意图可按现契约以原 key 和冻结 body 恢复，
  该动作不得创建新 user 来冒充 retry。Project、Conversation、Message、ScheduledTask 与 Run identity 继续相互独立。

因此后继实现不改 `src/contract/**`、`src/generated/**`、HTTP path、AG-UI frame、BFF envelope、幂等字段或版本 pin。若 owner
snapshot 对某一 generic failure 未给 nonblank `run_id`，consumer 只能显示不归属的安全反馈，不能发明 3.1 字段或 fallback。

## WEB-COMPOSER-P0：无网络契约变化（2026-10-01；候选）

`SessionEngine.submit` 的boolean是Web进程内调用结果，不是HTTP receipt或owner状态。false表示调用未进入既有create-message流程，
所以不得清除草稿、创建意图、改写项目conversation URL或发送请求；true仍使用已发布的同一消息端点与幂等键。运行中停止继续使用
既有cancel control，运行中输入继续使用现有create-message路径。本片不声明queued、terminal retry或新的steer契约。

## WEB-PROJECT-FLOW：Session list 正式空页（2026-10-01；已验证源码切片）

BFF public 3.0.0 `SessionListResponse.data`要求`required:[sessions,next_cursor]`：`sessions`是数组，`next_cursor`是
string或null，null唯一表示没有下一页。真实同源响应`{sessions:[],next_cursor:null}`合法；Web同源adapter仅从
成功envelope解包`data`并原样返回，不删除或改写null。

目标`sessionListSchema`接受required nullable，拒绝缺失/undefined、错误类型与额外键；空串作为已发布string原样保留，不保留optional旧shape，也不以
nullish兼容隐藏producer漂移。正式与preview transport使用同一flat browser-private DTO。分页view只在解析后显式将null映射为
内部无continuation。本片不改path、`project_ref`、BFF envelope、snapshot、AG-UI、failure、operation或retry合同。

## WEB-BFF-PUBLIC3：唯一 public 3.0.0 上游（2026-10-01；已验证源码基线）

当前源码已删除旧public 2.0 pin；机器来源为BFF owner commit
`293dfe7638e5dea0df2bee6dfdd8483b53fc9df6` 的 committed OpenAPI `3.0.0`，原字节 SHA-256
`acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b`。Web 将原字节固定到唯一
`src/generated/bff-public-openapi.yaml`。Team generator只锁固定digest，failure inspector另锁version与ChatMessage/failure语义；
owner commit provenance由Root核对该commit的committed blob与snapshot原字节相等。当前snapshot已复制该committed原字节，
failure artifact已再生为两角色且12tuple不变；Team15再生输出与旧基线逐字节相等。generated artifact不是第二份可编辑schema。

- `ChatMessage.role` 的 owner 闭集是 `user | assistant`；删除旧来源的 `system` 约束，不建兼容 parser、静默过滤或角色改写。
- `/v1` path 与全部 operation inventory 不变；Project、Team、Library、Skills/MCP 与 failure public测试只更换同一来源 pin。
- `ChatMessage.failure` 三键、10 code、12个合法 tuple、presence guard、verified Agent `RUN_ERROR`、BFF dispatch
  `RUN_ERROR`、取消与 Share 只读语义全部不变。
- Agent 4 / BFF public 3.1 retry command 尚未发布；owner terminal 没有 Web retry mutation。本片不以3.0角色收敛提前实现retry。

下方 WEB-FAILURE3 是 public 2.0 的历史实现记录；其 failure/dispatch 安全规则仍有效，但其中version、digest与system drift
描述已由本节取代。

## WEB-FAILURE3：BFF public 2.0 安全失败（2026-10-01；运行时候选）

唯一机器来源是 BFF `ccb8e144` 的 public OpenAPI `2.0.0`，SHA-256
`ba10f89baf0fdd8cd4da58947b0411da8c84294dfe77e278533aeda59a905773`。本候选已将该文件原字节固定到
`src/generated/bff-public-openapi.yaml`，并由独立 generator 导出带 exact provenance 的 failure tuple；该 generated artifact
不是第二份可编辑 schema，也不为旧 public 1.0 增加 alias/fallback。generator 的模块导入是 pure inspect/render，只有作为
真实入口执行时才接受固定的 `--write/--check`。HTTP 路径仍为 `/v1`；当前运行时候选已接入下述 Message 与 AG-UI
严格分支，不增加旧版 fallback 或第二协议，最终状态以 Root 对冻结源码的独立复验为准。

### Message safe profile

`GET /v1/sessions/{id}`、`GET /v1/sessions/{id}/messages` 与合法 `GET /v1/shared/{share_id}` 共用唯一
`ChatMessage.failure`：

```json
{"source":"agent","code":"model_unavailable","retryable":true}
```

对象必须恰有 `source/code/retryable`，`source` 恒为 `agent`。code 闭集是
`token_budget_exceeded | recursion_limit_exceeded | assembly_failed | enqueue_failed | dispatch_exhausted |
contract_incompatible | internal_error | model_unavailable | dependency_unavailable | model_access_denied`。
十码的 `false` 全合法；只有 `model_unavailable` 与 `dependency_unavailable` 还允许 `true`，故机器合法集合恰为 12 tuple。

failure 存在时 Message 必须同时满足 `role=assistant`、`status=failed`、`run_id` 存在且 trim 后非空。failure 缺失仍可表示
cancel/BFF dispatch/delete 等 failed assistant；缺失不是 `null`，Web 不补 `internal_error`。Web 不接收/展示
`payload_json`、provider message、exception、stack、owner status、`error_kind` 或额外键。

BFF public `ChatMessage.role` 还合法包含 `system`，但现 Web runtime/render 只支持 user/assistant。本片不静默丢弃或把 system
改写成 assistant，也不借 failure 工作扩展全部 chat rendering：generator/contract test 必须保留 owner 的 system 枚举并证明
system+failure 被 presence guard 拒绝；runtime 对无 failure 的 system 仍 fail-closed，列为独立 consumer follow-up。

### verified Agent `RUN_ERROR`

```json
{
  "type": "RUN_ERROR",
  "threadId": "CONVERSATION_ID",
  "runId": "RUN_ID",
  "code": "model_unavailable",
  "message": "Agent run failed",
  "metadata": {"kokoro": {
    "event_id": "EVENT_ID",
    "seq": 42,
    "session_id": "CONVERSATION_ID",
    "run_id": "RUN_ID",
    "timestamp": "2026-09-30T00:00:00.000Z",
    "failure": {"source":"agent","code":"model_unavailable","retryable":true}
  }}
}
```

Web 要求 top-level/nested code、thread/session 与 run identity 全部相等，message 精确为固定安全文本；顶层没有
`retryable`。解析成功后只传播 nested safe profile，不传播 `message`。snapshot 与 live 的 profile 是同一个业务值，reload
不得从 watermark 前事件补猜。

### BFF-owned dispatch `RUN_ERROR`

BFF permanent launch failure 仍是标准 AG-UI `RUN_ERROR`，但语义不是 Agent failure：metadata 带
`source_owner="kokoro-bff"`，`seq` 是 `^[1-9][0-9]*$` 十进制字符串且可能超过 JS safe integer，frame 没有
`metadata.kokoro.failure`；message 固定 `Agent launch could not be confirmed`，top-level code 是 BFF 本地 launch code。
该分支必须同时满足 `threadId===metadata.kokoro.session_id`、非空 `runId===metadata.kokoro.run_id`、top-level code
存在且为 nonblank opaque string，以及 message 精确匹配固定文本。Web 不枚举 BFF launch code。BFF durable payload 到 SSE
不重写这些字段。Web 只以 exact source owner/shape 识别内部 dispatch terminal，保留 string source sequence 作
identity/order metadata，不显示或分类其 code/message，不把它放进 Agent tuple 或 numeric `lastSeq`。不同的非空
thread/session、run identity、blank/missing code 或 message mismatch 都 fail-closed。

其他 RUN_ERROR 不通过 unknown fallback；取消继续使用既有 canonical cancellation 语义，不伪造成 failure。网络仍只有 AG-UI，
不新增 CUSTOM error、旧 envelope 或第二协议。

### 可见动作边界

public 2.0 没有 retry terminal command。`retryable` 只用于安全说明，不授权 Web 重新 POST 原 user；Agent 4/BFF 2.1 正式
发布前，snapshot/live/shared 的 Agent terminal、dispatch terminal 与无 profile generic terminal 都没有 retry mutation。
Web 仅对 create-message 尚未取得 receipt 的 transport-unknown 以原 idempotency key 和冻结 body 恢复，不能把该行为写成
Run retry。Share 永远只读。

## Failed snapshot hydration（历史 public 1.0 基线；由上节 public 2.0 目标后继）

本节记录 `WEB-FAILED-SNAPSHOT-RESTORE` 当时的窄恢复，不是当前 failure3 目标或正式 retry 依据。

BFF v1 snapshot 已合法提供 owner-ordered `messages[]`，每项包含闭集 `status`（含 `failed`）、role、content、created_at 与 optional run_id；现契约没有 terminal failure 的 code/message/retryable 字段。Web 只在数组最后一项为 failed assistant、`active_run` 缺失且没有 pending pause 时恢复本地通用 failed 状态，`runError=null`。该判定不改变请求、响应、watermark、SSE replay、schema 或生成物，也不把 BFF message status扩写成 Agent错误分类。

后续 user 或非 failed assistant 是更新的 owner 顺序事实，必须阻止旧失败恢复；active run 与 pending pause 分别表示在途执行/HITL，同样优先于历史 failed。具体错误文案继续只来自 live `RUN_ERROR`；刷新后在 Agent→BFF 发布安全 typed failure 契约前仅展示既有通用失败文案和手动 retry，不解析或展示上游原始异常。

## WEB-PERSONAL-CODE 历史候选（2026-09-30）

Web 基线49adb4b；本节只记录当时 client/schema/同源 route/UI 切片，不覆盖顶部 public 2.0 当前来源。
当时唯一 public snapshot 固定 BFF `67755d16ff0f40ea02d71a6dad7108507a04766a`，原字节 SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`，间接 Platform6519ae9a/v5.0.1。
Web 没有第二可编辑 public contract、内部 SDK 或 owner 摘要。

正式 `/api/hub/self/skill-installations` 五方法已具名严格映射唯一 `/v1/skill-installations`：Install/SetEnabled/Remove
保留原单个 key、body和200 receipt；List/Get无body/key，DELETE拒body而非吞掉。strict media/query/presence/尺寸、
请求身份由原 Product admission构造，浏览器 subject/token/Cookie 不透传为可信 owner metadata。
两边均验证九字段安全表示、uint64 decimal/UTC/removed disabled、receipt change/event/请求身份绑定和 operation-specific error。
所有有效 owner 响应保留 no-store/request ID，429仅合法 Retry-After；redirect/非200成功/额外字段/不匹配身份与code/status均拒绝。
无 public CAS 字段、自动mutation重试、旧name入口fallback或本地合成 ACK。

List使用唯一 top-level data array/optional meta.next_cursor，三态filter与opaque cursor保持。unknown同键恢复；
已确认receipt之后Get current，失败只重读，不重复命令。Publish与Install、安装管理与Run选择没有隐式调用。
取消沿既有有限transport传播，不宣称服务端回滚。实际代码门见CURRENT；当前文档不等于已激活或真实五方法浏览器链通过。

## WEB-PERSONAL：五本人安装 API 消费目标（2026-09-30；历史文档门）

Web 基线 `14a54b4b8da68b37d83a13402bc8abb87001574e` 当时尚未消费安装 API。当时唯一 public 机器源为 BFF
`67755d16ff0f40ea02d71a6dad7108507a04766a` 的 `contract/openapi/v1/openapi.yaml`，SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`；下列是 consumer 义务，不是第二可编辑 schema。
BFF 已固定 Platform `6519ae9a7dba63586474d2860f6725d3165b701e` v5.0.1；Web 不复制内部摘要、receipt codec、Proto 或 IAM metadata。
当前 Web snapshot 仍为571b51de；后续原字节 repin 与 strict runtime/UI 必须分别验证，文档不等于接通。

### 路径、身份与命令

browser-private 前缀 `/api/hub/self/skill-installations` 唯一映射 public `/v1/skill-installations`，无非 self alias。
五个 operationId 固定为 owner 的 installPersonalSkill、listPersonalSkillInstallations、getPersonalSkillInstallation、
setPersonalSkillInstallationEnabled、removePersonalSkillInstallation。除以下精确方法/路径外不经通用 fallback 透传。

| 请求 | consumer 义务 | 成功 |
| --- | --- | --- |
| POST 集合 | strict JSON 仅 exact source_ref；单个有效 Idempotency-Key；无 query | 200 `{data:mutation}` |
| GET 集合 | 可选 enabled/installed/limit/cursor，拒重复/未知 query、body 与 mutation key | 200 `{data:installation[],meta?:{next_cursor}}` |
| GET `/{installation_id}` | exact ID；无 query/body/key | 200 `{data:installation}` |
| PUT `/{installation_id}/enabled` | strict JSON 仅 required boolean enabled；单个 key；无 query | 200 `{data:mutation}` |
| DELETE `/{installation_id}` | 单个 key；零 body、无 query；不得吞掉入站 body 再转发 | 200 `{data:mutation}`，非204 |

Identity 沿现 Product Session/service 身份，浏览器只交业务 selector，不交 tenant/subject/target/proof/包字段。
BFF 每次含 replay 检查 current IAM；其内部 trusted subject 由 BFF 构造，不由 Web 转发浏览器自报头。
source_ref 仅一次 skill: 前缀与 canonical ID，exact、不 trim/按名称推导/补最新 revision；installation_id 不能替换成 source 或 series ID。
POST/PUT 原始 JSON ≤65,536 bytes；key 为 owner 的1–128可打印非逗号字符规则，unknown/null/boolean字符串拒绝。
public 没有 expected_revision、If-Match 或 generation 字段；CAS/fresh snapshot 是 Platform 内部行为，不新建 Web 前置协议。

### 安全响应与分页

- installation 按 owner schema 严格八个必填字段和可选 removed_at：installation_id/source_ref/series_id/revision、
  installed/enabled、installed_at/updated_at；不接 tenant、subject、asset/hash、manifest、signed URL 或内部 reason。
  revision 是1..2^64-1的十进制字符串，不转 JS Number；时间为合法 UTC RFC3339 Z，缺失不变 null/epoch。
  removed 态 installed=false、enabled=false、removed_at present；installed=true 无 removed_at；保持 owner 时间序约束。
- mutation 严格 installation/change/replayed 及可选 event_id，change 只允许 owner 七值。
  unchanged 必无 event_id；其他值必须有首个合法 event_id。不以 response.ok 或空 ACK 推导成功。
- List 不使用旧 Skill `{data:{skills,next_cursor}}` 或 legacy meta.request_id。
  next_cursor absent 时整个 meta absent；present 空串/null/未知字段拒绝。
  limit 省略50、合法1–100；cursor 非空且≤4096 UTF-8 bytes，opaque、不 trim/解码。
  installed/enabled 缺失表示不筛选（含 removed），false 与缺失不同；固定 installation_id ASC keyset、非 snapshot。
  cursor 绑定本人权限/filters/surface，筛选改变重置；每页重新授权，不将 cursor 当许可或在 Web 后过滤模拟 owner 分页。
- 所有成功与错误都核 JSON media、owner 专属状态、`Cache-Control: no-store`、有界 `x-request-id`。
  禁 redirect；只保留批准 header，429 的合法有界 Retry-After 可透出。
  现普通 Hub 改写 private,no-store/丢 request ID 的分支不适用于本操作组。

### 错误、取消与 unknown ACK

strict error-only `{error:{code,message,retryable}}` 按唯一 OpenAPI 的逐状态 code 校验：400输入，413超限，401 session，
403禁止，404本人不可见，409幂等冲突/进行中，412前置失败，429限流，502坏 owner 响应，503依赖/配置，504 deadline。
List 没有404/409/412成功恢复猜测；Get 与 mutation 按各 operation 专属错误集。分支不读 message；UI 只显示本地安全文案，
保留 code/retryable/request ID 供确定性处理。adapter 自身配置/准入/transport 错误也使用对应严格 envelope，不回旧字符串错误。
现请求有限 deadline 与 AbortSignal 继续贯穿，取消写请求不证明服务端回滚；不因20秒 BFF预算扩大所有 Hub timeout。

每个 mutation 冻结原 key、method/path/body。未知 ACK 只显式同键重试，不自动换键、使用旧服务或本地合成成功。
receipt replay 是历史提交结果而非当前 snapshot；取得合法 ACK 后 Get 当前 installation，当前读失败只显示待核，不重发已确认命令。
Install 未知且无 ID 仅同键重试；刷新丢 key 后只读取当前页，不由列表推造 receipt。401/403停止自动动作，409/412复核当前状态。
管理读无需 source 持续健康；false/remove 仍交 owner，Web 不先以公开 Skill 404或不健康阻止降权。
Publish 与安装、安装与 Run 选择无隐式调用；installed/enabled 不构成未来执行授权。

下一精确文件/RED与门禁见 TECHNICAL_DESIGN 同名节；本片只改四文档，没有 repin、运行消费或真实组合完成声明。

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
2026-10-16 的 Skills 示例选择接线承接上述 wire：当前可信身份下，详情/安装/精确 revision 绑定一致且已启用后，才创建目标工作区的新会话、预填可编辑文字并设置 exact source。callback 返回的成功只表示本地 handoff 已接纳，不表示消息已发送或 Agent 已执行。失败保留详情；版本不符不升级、不装入另一 source。preview 名称动作不进入此 wire；旧 `kokoro.web.pinned_skills` 不读取、不迁移、不作 fallback。

当前 Agent 已有非空 reader 的 resolve/load-package，不能继续用“未接 reader”描述现源码；正式模型发送、执行资格与真实 Run 仍需联合验收。浏览器内部 `installed_source_ref` 仅保存原安装版本，与 catalog current version 分离，不扩展 BFF owner wire 或代替授权。

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
## SET-05 个性化可靠保存（2026-10-13，候选已实现，待主控验收）

沿用唯一现有 browser-private `/api/hub/preferences/personalization` → BFF `/v1/preferences/personalization`，GET 返回 personalization(nullable)/revision，PUT 四字段与 expected_revision，冲突码 personalization_revision_conflict。不新增 owner API、公开版本、generated pin 或 alias。昵称128、职业256、about2000、instructions8000的Unicode码点上限保持；编辑与响应校验使用同一规则，不使用UTF-16 maxLength。snapshot revision为非负safe integer，null iff revision0；PUT ACK必须四字段匹配且revision精确expected+1，不能接受跳跃。client 接收 AbortSignal，10s总deadline涵盖fetch与body、响应限64KiB；超时仅取消当前request、迟到body清理，不取消编辑session或自动重试。取消/迟到结果不得推进当前草稿或显示保存成功。首次读取失败不具备写入基准，禁止 PUT；冲突必须显式恢复，未知写结果保原草稿及状态，不自动换revision重放。

## SET-07：本人资料 browser-private projection

唯一新Web入口GET /api/account/profile，不是新的公开Product或IAM业务API；禁止query/body，canonical Web请求，GET以外不提供动作。调用现BFF /v1/me在线准入与/iam/oauth2/userinfo；不直接访问IAM。成功仅{data:{subject,name,email,email_verified}}，后3字段可为null，姓名/邮箱缺scope不是匿名或伪造默认值；userinfo sub与Product subject必须一致。其他IAM字段不透传，包含token、credential、cookie、Location或原始error body均不得回浏览器。

所有响应private,no-store；无有效会话401、请求不合法400/403、依赖或登记未配置503、非法上游502，错误只用本片稳定安全类别，不显示原始异常。userinfo401/403失败关闭，429/5xx不得转成功空资料。单请求总5秒包含所有读取与body，上限16KiB，取消/迟到拒成功；身份校验与最终session复验同一原request，不由浏览器传subject/tenant。现IAM/BFF contract、generated pin和scope权限语义不变。
## SET54 More 键盘行为（2026-10-16）

仅现设置菜单浏览器交互；无新增或变更 API、请求资格、同源 adapter、生成物及 owner 契约。聚焦 Skills/连接器菜单项不调用其业务；禁用项始终不可选择。


Skills 目录重核修复仅改变 Web 内部展示/请求生命周期：不新增 HTTP 字段、endpoint 或授权协议。正常 session 重核期间私有 API client 按既有准入代际退休，详情 placeholder 不发送 owner 请求；恢复后仅使用本代列表与详情。安装仍为既有严格 typed command 和同键未知结果恢复，未增加个人原子升级或前端移除/重装旁路。

Custom API 创建恢复仅调整 Web 内部 client API：createCustomApi(input, key, signal?) 必须由调用者传合法 Idempotency-Key，取消每次调用隐式生成新 key。浏览器路径、body、header wire、BFF/Platform 固定 artifact 不变。未知结果重试同 key、同正文，按原 owner durable receipt 重放；GET 不作为 ACK。响应仍走既有严格 safe profile 校验并绑定原 name/instructions/environment names；结构或语义不符保留 unknown，而非重新创建。原 OAuth 原生协议不添加此 header。


MCP JSON创建恢复的本地client签名为importPrivateMcpJson(configJson, key, signal?)，与API创建一样显式caller key，无默认新key。原/v1 browser/BFF/Platform contract、header及config_json wire不变；完整原文冻结、同key恢复，ACK沿既有mcpPrivateJsonImportMatches绑定。原子导入不主动Prepare、不逐条Register，原生OAuth没有新增header。


私有 MCP 创建的本地 client 签名为 registerPrivateMcpServer(input, key, signal?) 与 preparePrivateMcpServer(serverId, expectedStateVersion, key, signal?)；均须显式合法 caller key，不再每次调用生成新 key。已有 GET /mcp/connectors/:id 补 Hub 读取入口并严格核对精确 connector ID，与 GET /mcp/servers/:id 配对，不新增 wire。Register/Prepare 响应沿既有结构与 mcpPrivateServerMatches 绑定；新 Prepare 用 fresh server CAS，未知 Prepare 恢复原 key/version，不能把 GET 或 popup 通知当 ACK。原生 OAuth Begin/Complete 协议没有新增幂等 header。


MCP 详情准备与创建共享 typed 原命令 holder，只调用既有 preparePrivateMcpServer(serverId, expectedStateVersion, key, signal?) 和原 wire；重开/重核不能按 fresh detail CAS 分配新 key 覆盖 unknown。确认响应额外核对原 connector ID，拒绝同 server 上不匹配的 connector ACK。确认断开/删除只退役相应精确目标，不把 GET 当 command receipt，不新增网络恢复协议。


Connector browser-private错误消费固定 BFF `d176e3d0cbbc2eab903dae2b2d969906ba5808fe` 的只读 `contract/connector-command-errors-v1.json`（SHA256 `24158f50a6f4dac1b34553797f0b1afcc8f99dbc79f36b916d03b56999a67a71`），独立snapshot与正规生成常量，不改变public14.8/139、HTTP路径/正文/header或成功契约。现MCP普通/私有/原生授权与Custom API同源adapter及Hub分别核严格tuple；新receipt未知/过期/ownership-lost的false retryable不能被旧“503总可重试”规则误拒，通用503仍true。错误profile只说明恢复分类，不授新key/自动请求/授权；当前阶段仅机器错误传递，原UI统一unknown提示仍待后继替换。


Connector恢复UX只消费已固定BFF browser-private profile的合法tuple，再映射为本地reason；不改HTTP/成功ACK、原幂等正文/CAS/预算或原生OAuth协议。policy同请求恢复仅显式执行；inspect_owner或配置原因不触发retry/new key，GET不作ACK。错误提示不回显owner message、内部metadata或凭据；原创建/详情网络请求仍全部经现Hub。


Custom API本地Hub updateCustomApi(profileId,input,key,signal?)、removeCustomApi(profileId,input,key,signal?)均要求caller合法Idempotency-Key，不保旧隐式随机入口。原wire不变；update严格核目标及明确写入字段/环境变量描述，remove核profile_id/deleted，不以GET/404结清命令。状态层保冻结operation/id/body/CAS/key，恢复只同请求，删除仍只承接原用户已确认意图。


MCP管理Hub五方法显式caller key（其后signal?），不保隐式随机key入口；原HTTP方法/body及发布契约不变。沿现mcpConnectorMatches/mcpPrivateServerMatches核精确locator、请求写入字段/安全header描述及删除/撤销ACK，管理index另核捕获connector/private server绑定。不把GET/404、popup或错误视作ACK，不改变原生OAuth协议。

### Installation exact content（2026-10-16，实施设计）

新增 browser-private `/api/hub/skill-installations/{id}/package` GET 与 `/api/hub/skill-installations/{id}/download` POST，分别固定转发已发布 BFF `/v1/skill-installations/{id}/package` 与 `/browser/v1/skill-installations/{id}/download`。GET 仅可有单个 file_path；POST 无 query、key 或非空 body。两者复用正式 Product Session 准入、同源 Origin、十秒预算、1 MiB 严格 JSON 边界；installation inspection 使用其专属 skill_package_* 错误，download 使用独立 download 错误矩阵。成功 source/revision 必须匹配本次权威 installation；文件路径/清单绑定原目录，下载只消费未过期受控 /skill-downloads 句柄，不接受对象存储 URL。目录与分享现有接口语义不变。


### 普通消息 MCP 消费发行物（实施中）

唯一canonical snapshot固定BFF f71a17901b4f0458d88521be2c37e94d0d863998 / Public24.0，SHA256 f4caf11f3cd9255d2cd9daf69b74ff9988505d640e31c686ce495e6d8a578b2c。原七生成器与在线Docs消费同一原件。messageCreate仅接受可选`selected_mcp_connection_ids`：有序唯一≤16、每项ASCII ID ≤191、JSON≤4096；缺省或[]不增加连接。旧`mcp_servers`输入已删，不读trace充当授权。浏览器内部idempotency_key继续按原adapter映射，未知提交使用冻结原body/key，不重新读取勾选。选项读取仍为原Hub正式GET，无新代理前缀或owner直连。

## Composer 当前草稿 Skill picker（2026-10-25）

本片没有新 wire/API/schema。已安装候选复用现 `listSkillPool`→Personal Skill installation 同源读及严格 actor lifetime；名称/summary 只作真实元数据展示，不读取包或下载句柄。enabled/active 且安装 pin、revision、source_ref 相符才可选择；无示例仍可使用。列表不是执行授权，发送继续由既有 message-create、BFF/owner guard 验证 exact refs。

选择只改变同 hook 管理的未来意图，不发送模型、不改变 installation enabled，不制造提示词或默认全选。Project 未选择仍省略、显式移除仍[]；Direct 默认[]；首次 Send 的同步草稿承接不扩展导航资格，未知提交继续复用原冻结请求。新增资源菜单及 action-time New task 校正均不放宽原 Send 的 canonical chatHref/actor/activeId 检查。


## Project resource item consumer (Public28.1 candidate)

`GET /api/hub/projects/{projectRef}/resources/{asset_id}`、`GET .../{asset_id}/download`、empty `DELETE .../{asset_id}`分别映射固定BFF三个具名操作。唯一snapshot与现有public generators正规更新；`src/generated/bff-project-resource.ts`从固定schema派生，`src/contract/project-resource.ts`只复用这些decoder，不成为第二editable wire源。metadata为`data.resource`且无created_at；DELETE200为exact asset_id/deleted_at/replayed及request meta，未知或不匹配不当成功。owner ErrorEnvelope无retryable字段，不添加虚构字段。

同源adapter沿当前Product Session/部署Domain/服务鉴别，拒query、self alias、非空正文/不支持framing与读命令头，DELETE仅透传原始key不制造tenant。Project下载只复用既有无授权的完整attachment字节传输：1GiB、准确Content-Length、原UTF8 Content-Disposition、no-referrer/nosniff、有限时间、取消与短流拒绝；不JSON解析bytes，不暴露Location/owner secret。BFF仍负责每次Project授权、完整spool SHA/size验证和二次owner核验。浏览器原生下载启动之后的完成/取消由浏览器管理，不宣称Web已观察EOF。

Web在上传body实际超过原1MiB且尚未发送BFF的413分支独占`x-kokoro-local-upload-validation: request-body-too-large`；generic owner响应转发不允许此header，client只在exact本地413 body+该marker同现时标localValidation。重新选同名文件只替换这种failed local-validation行，既有pending/unknown与owner拒绝不伪归本地、不丢原File/key。原大小政策不变；旧内存行若未观察到来源不凭状态/文案猜测其origin。
