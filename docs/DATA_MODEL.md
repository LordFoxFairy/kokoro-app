## PREPARE-OUTCOME：退休与成功的原子互斥（2026-10-27，consumer候选）

沿下方已交付 journal-v2 的 active 原格式／retired_intents／subject_server 稳定 seek，版本仍2，无新字段、store、index、owner表。退休 record 仍闭合 schema_version2、subject、target(serverId/connectorId/version)、key、disposition、policy_ref、immutable retired_at；policy_ref 从正式 BFF394a outcomes1.0 原件 SHA `5169cbf5e431cc71a23e2717bda9b51c77f08bed82cae149667532511b3afe72` 与 profile/version 正规生成，不从 UI 输入授结果权限。definite_rejected 来自方法专属 typed rejected；unknown_fenced 仍未知且仅显式结束等待。

本节精确覆盖存储阶段“complete原样保持”停止线：complete 现在同一 readwrite 事务锁 intents＋retired_intents，先按原 subject/server/key/CAS 查询 exact retired primary key，有 history（含换connector）即 abort，不清 active、不返回成功。否则保持原 exact active 比较／delete与 missing 无history幂等。与 retireWaiting 双store事务形成一次串行选择：archive 赢则晚 ACK 拒绝；strict成功 clear 赢则后续 archive 缺active而拒绝，不能伪造history。普通有效晚 ACK 未本地退休时仍沿原语义结算 captured actor。

commands 对捕获旧 K 的 success／failure／400清理／管理清理按 exact entry 与 durable history 围栏，不能晚到清 K2、复活 completion locator 或污染全局 recoveryError。退休历史与新 K2 独立，reserve 已有active先合并、无active拒同K/CAS退休tuple重启不变；不同CAS重用旧key的全局防错仍由新 cryptoK 和 owner 原 key/CAS 守卫负责。

RAM 仅保窗口／原attempt引用、严格 ACK 后 completion.via、从 committed history 得来的显示与有界历史查询结果。历史完成ACK不成为Current、不写回 active/history/权限，不发新Prepare。新连接须独立点击 fresh Current/manage/CAS 与新key；无额外持久状态、平行 journal 或通用 command 状态。只读历史显示记录时间，不把 primary-key 首项称最近。

## PREPARE-JOURNAL-V2：精确 codec／additive 迁移（2026-10-27，Root 已核引用槽；存储候选）

仅同源本 feature `kokoro-mcp-preparation` IndexedDB 从1升2；无 SQL、后端 owner 表、其它 journal、通用 command 状态或 raw owner facts。现 `intents` store、`subject` index、key=`JSON.stringify([subject,serverId])` 与 active closed `{subject,target:{serverId,connectorId,version},key,failure?}` 原格式／值保持，不在升级时读改或推断旧行。旧有效版本／key validator 不收紧。

```ts
type McpRetiredPreparationRecord = Readonly<{
  schema_version: 2;
  subject: string;
  target: McpPreparationTarget; // 原 serverId／connectorId／version，不重基
  key: string;
  disposition: "unknown_fenced" | "definite_rejected";
  policy_ref: Readonly<{ artifact_sha256: string; profile: string; version: string }>;
  retired_at: string; // adapter 首次实际归档时生成 UTC ISO，仅本地展示
}>;
```

新增 `retired_intents` store，primary key=`JSON.stringify([subject,target.serverId,key,target.version])`，新增非 unique compound index `subject_server`，keyPath=`["subject","target.serverId"]`。record、target、policy_ref 和 cursor 均 strict closed；subject／target／key 复用原 validator；schema_version 固定2，disposition 为上述本地域闭集，retired_at 是 UTC ISO。policy_ref 格式见 [API 设计](API_CONTRACT.md) 本节：它是正式 consumer 未来填充的引用槽，不猜发布字段或把它视为证明。无 URL、headers、secret、cipher、raw ACK/error、Current／权限快照；disposition 已承载具名本地退休理由，不复制尚未交付的 wire reason enum。

**迁移方法。** `indexedDB.open(name,2)` 的 onupgradeneeded 只在缺失时建原 store/index（fresh DB），并新增 retired store/index；升级 v1 不遍历／重写／退休任何 active row。错误或 blocked 拒绝本次 open，复位 opened promise；已拒请求之后迟到 onsuccess 必须立即 close，不让失败操作复活。各版本连接 onversionchange 主动 close＋清 opened；旧 open(name,1) 在 v2 后 VersionError，禁止 fallback 删除、降级或重建。回滚只用后继兼容 reader 的 roll-forward，不清 v2 数据；本片不实施自动历史清理。

**retireWaiting 原子性。** 校验入参及未 abort 后，一个 readwrite transaction 同时覆盖 intents＋retired_intents；重读 active，exact 比较 subject／server／connector／原 version／key。历史不存在且 active exact 时插入新 closed 历史、删除 exact active；只在 tx.oncomplete resolve，任一错误／存储失败／signal abort 全回滚。存储方法只识别 signal，不自行发网络或解释 owner outcome；未来 feature caller 负责当前 actor／generation／window 并将退休同步成 abort。commit 已完成后的迟到取消不恢复旧 active，也不自动驱动新窗。

历史已存在时仅验证原 identity、disposition、policy_ref 均 exact 后返回原记录，保首次 retired_at，绝不覆盖历史或删除别的 K2；若历史已存在却 active 仍是同 K，按不可能半态拒绝。无历史且 active 缺失／被替换、历史冲突／坏 codec 一律 abort，不能凭缺失猜已退休。readonly history 验 stored primary key 与值一致，按 subject_server 有界续页；restore/list/current/reserve 仍只读 active。成功 `complete` 继续只清 exact active，不归档、不删 history，保 missing 的旧幂等语义；reason4／5 以后只走独立退休 port，不借 complete/onConfirmed。未来 consumer 在旧 K 退休后须核 exact entry／retired 身份再处理晚 ACK；不能借 complete missing 成功把已退休 K 复活为 completed locator 或清后继 K2，本存储片不改 commands。reserve 在同一双 store readwrite 事务先保已有 active 合并；无 active 才查本次 exact retired primary key，存在即拒绝重建（包括换 connector），避免 adapter 自造上述半态。不同 CAS 重用旧 key 的全局防错仍归后继不同 crypto K 和 owner 原 key/CAS 守卫，不加泛 key 索引；新 K2 的另次显式 fresh/manage 资格仍不是本 port 的授权职责。

**真实 IDB 验收。** 自有临时 origin／一 context 两 page：fresh v2 和原生 v1 行原值保留；配合 versionchange／不配合 blocked／迟到 success close／旧 v1 VersionError；history 插入后或 active delete 后注入 tx.abort 均双 store 回滚；并发 duplicate 与 K／K2、bad codec／key绑定、abort前后、不可变时间与 bounded pagination、跨 subject 隔离及 reload 仅恢复 active。原 successful complete 与 query1 native fixture 继续通过。端口替身或 fixture ACK 不称真实 owner 集成；正常浏览器、登录／IDB、服务与 Git 仍由 Root 独占。

## Prepare completed 只读恢复 D0（2026-10-27，无新增 Schema）

本节替代旧“日志恢复后 fresh 核验并授权原 POST 重放”的生命周期，其余非秘密 Prepare journal 与 owner 边界保留。Platform 拥有原 completed receipt；App 不存 owner事实镜像、成功缓存或 negative 终态，不新增 SQL、Redis、数据库、浏览器 store、版本迁移或 pending/resuming 实体。正式私有 artifact 的固定 commit/digest 与生成入口见 API_CONTRACT；原 failure codec 及 journal Schema 不变。

- 原 IndexedDB `kokoro-mcp-preparation` v1／`intents`／subject index不变，key=`JSON.stringify([verifiedSubject,serverId])`；record仍 closed `{subject,target:{serverId,connectorId,version},key,failure?}`。version是冻结原CAS，不是最近GET或配置保存后的版本。未知没有自动TTL清退，旧failed marker查不到completed也不清。
- 首次明确连接仍先原子reserve并commit后才POST；已有record／reload只恢复unknown。Prepare entry仅RAM单调记“后续只查询”，restored或unknown必为真，首次execute开始即封闭后续POST；不持久化该flag，因为重载一律query-only。无secret、URL、headers、OAuth／工具原文或receipt正文入日志。
- 查询前和可信结果清退前核当前actor/admission/generation/window/signal、原entry及 `samePreparationRecord`；跨tab当前K变成K2时旧K不得采用K2、改原CAS、覆盖failure或清退K2。clear事务仍比较subject/server/connector/version/key，缺失只沿既有幂等清退语义处理，不由缺失本身证明业务完成。
- exact completed ACK先严格验证，再 `recovery.complete(originalRecord)`；只有事务commit成功才经原ConnectorCommand完成，finish只收口该原entry。clear失败保unknown／原key/body/CAS，后续显式恢复仍GET；取消／真正owner退休保原未知日志，旧请求不关闭新窗。
- 原failure只按正式profile单调收紧；same_command不降低query-only，missing／expired／旧failed也不变成“确定没执行”。删除旧inspection proof/window授权POST的结构，不保双恢复日志或别名。
- 严格原 POST ACK／receipt ACK 且 clear 成功后只保 RAM 非秘密 server/connector/provider locator，服务显式 Done 定位，不保 receipt 正文或授权限。provider 冲突不因后继读失败抹去；entry／actor／K2 围栏阻断旧定位，clear 失败不暴露 locator。
- 历史receipt不写当前Server/Connector投影，不改变其state_version、权限或availability；只触发原reader独立fresh重读。首次明确拒绝且从未不确定的原安全清退语义保留，不将其扩大到unknown后的错误。

验收复用真实IDB／跨tab事务入口，覆盖completed与clear原子收口、clear失败／损坏存储、K→K2／迟到原ACK、无自动POST、原failed日志保持及reload恢复。设计门与正式 artifact 已交付；正常资源与Git仍由Root独占，源码／隔离验证不代表正常恢复已验收。

## 2026-10-27 Public28.3：仅展示闭集，无存储模型变化

当前消费者固定正式BFF `b2b9eb1eac4a3f0b0cd4099ed59cbf756f14124c`／Public28.3.0／192操作，完整 canonical SHA256 `85a1b51cd151581b51d7ea7992d85e04462c03fafb36d0527e1df352dd85223a`。两项文件工具类别沿既有activity/segment身份、status、ordered坐标及恢复规则保存与呈现，不新增表、字段、浏览器存储或第二套wire；旧generic历史不改写。闭集由同一generated tuple消费，不复制业务DTO，三个独立私有pin保持。

## PROJECT-MCP-RECOMMENDATIONS-CONSUMER-D1（2026-10-27，独立消费者候选）

固定正式BFF `21c6447316aefcd8189f7dcedbb522d91a8e6cf5`／Public28.2／192操作、canonical全文SHA256 `e0bb74069c65fb8d414a6a3cb0d6f4c8d9bcb40bb693c2409a9cbe051b8bac53`，只从Git blob取得唯一完整snapshot，九条原public生成链统一正规更新，独立MCP私有pin不变；新增具名窄generator从同一snapshot导出三种refs、请求/响应和status/code/retryable闭集，生成物不手改。test-only exact28.2→28.1先验完整新旧全文，保原历史hash／fixture与证明链。在线Docs固定同一正式版本，不另建wire事实源。

standalone `src/hub/project-mcp-recommendations-client.ts`只GET/PUT当前Project推荐配置；不改HubClient、不接任何组件／Composer／locale。PUT自然幂等无key/receipt/journal，闭合原expected CAS+完整refs，ACK精确project、canonical引用集合、state_version为expected或expected+1（各自有界）；未知不自动PUT，后继GET只证明当前配置。三种ref仅偏好，私有引用不变成他人配置／执行授权，CustomAPI运行缺口仍OPEN。

`src/lib/server/project-mcp-recommendations.ts`经现Hub catchall精确两方法入口进入BFF同尾`/v1`，ProductSession是唯一用户身份，PUT沿现same-origin；拒query/body身份/command key及坏framing。16KiB请求/64KiB响应，从body/admission到响应EOF同10秒绝对预算，fatalUTF8、重复JSON键、closed shape、headers/status tuple与绑定均验证；取消/超时/迟到不冒成功、不换key重发。上游PUT只发送已完整有界读取的原bytes，显式可信Content-Length，不允许TE；浏览器响应复用private/no-store/zero-age策略，client沿既有hasHubNoStoreDirective接受正式扩展directive，不误认必须exact no-store。Web不直连Platform、不存业务数据或secret。

验证先正式pin/wire RED，再纯生成两次确定性/check、client边界/取消/慢body总预算、真实HTTP loopback薄桥（Session显式替身；真实CL/EOF/不透传caller身份），并跑相关contract/lint/types/build。运行／正常服务／App UI接线、Git index/提交均不在本片；Root与picker其他writer文件严格排除。

**本worker交付事实。** App基线已由Root前进到 `9fa5c289865d3d7f0daee219d01f63a46147b67f`；本片仅wire／generated／proxy／contract／Docs，不接并行UI文件。完整正式pin与历史父证明、100份生成物再次正规重出字节一致；真实HTTP薄桥与standalone取消／ACK／方法专属fault闭集已验。在线Docs由陈旧Public24固定到同一28.2：只按精确节点承接原Public27两项公开扩展，natural仅具名新PUT，nested local JSON-pointer链接所属顶层schema且保完整ref解析；原private route过滤／秘密扫描／header allowlist不放宽。首次失败日志与最终命令日志在本地ignored测试收据，未提交运行材料。正常服务／配置／库与Git index、提交、push均由Root负责，本worker未操作；CustomAPI运行绑定仍缺，不以推荐保存冒执行可用。


## 2026-10-26 MCP 列表 icon 媒体边界

无 Schema、SQL、Redis、浏览器持久存储或新增 owner 字段。现 `server_id` 仅定位独立媒体 GET；列表不缓存 Storage URL、签名或绑定事实。图片加载成功/失败只属于当前主体/准入代及 server_id + connector state_version 的组件寿命；Connector CAS 或既有 confirmed-write projection revision 变化即重新读取，旧图片/迟到事件退休；后者不等待列表刷新成功，也不保存 ACK 缓存。媒体失败不证明图标为空，也不改变 Connector 可用性或授权。blob URL 只引用当前组件已验证媒体字节，退休 revoke、请求 abort/迟到丢弃；不保存到 storage、全局缓存、列表 DTO 或 owner 绑定，原同 URI 图像解码缓存不作为显示来源。

## 2026-10-25 项目定义发布的浏览器原意图日志（候选）

本地 IndexedDB `kokoro-mcp-project-publication` version 1 / `intents`，key=`JSON.stringify([verifiedSubject])`，每 actor 一个未决发布命令；不是 Platform revision/pin 的事实副本。闭合 versioned envelope 保存 subject、target(serverId/connectorId/providerKey)、完整 original(server/connector/source CAS/有序项目与 pin CAS)、key、已发布闭合 failure tuple 及是否已记录失败。没有 URL、密钥、Headers、OAuth 数据或工具内容。首次写必须 commit 后才发送；刷新仅恢复 unknown，显式动作经当前 session/generation 重新准入，无自动 POST。

reserve 原子保旧，failure 只单调收紧、晚到400/412不清掉 unknown 历史；原 typed ACK compareClear按exact原命令，首次明确拒绝改意图另用firstRejectionOnly原子条件并核当前精确tuple。取消/退出不删除未决日志，不以 TTL 丢未知请求。损坏/存储拒绝失败闭合；真实 IndexedDB 与跨tab刷新浏览器验收由最终集成执行。无新增后端表、owner或公共协议。

## 2026-10-24 图标选择草稿

无新增业务数据库／本地持久事实。组件草稿只保存当前actor/window的原命令key/body/CAS、未绑定intent与瞬时preview；引用不入日志／IndexedDB／localStorage。保存提交即锁住所选intent，确认后移交owner绑定；结果未知保持原选择／原命令，关闭不误取消可能已绑定的intent。已知未绑定遗留可显式cancel，关页中断和未知Begin无ID由Platform到期清理，不以Get冒取消完成。

## 2026-10-24 Prepare 原请求恢复（既有JSON卡，设计门）

**存储验证边界：** failure codec只接受正式profile的分类（例如`replay_expired`而非虚构`expired`）；同key标记只收紧，不被乱序回调降级。首次确定未执行的400拒绝与exact ACK分别compare-by-key退休，不清理unknown后的400。核验proof/window token不持久化，不保存owner ready/成功facts；旧浏览器从未持久化的意图不由新日志追认。

**跨tab约束（独审补齐）：** failure存写也核exact subject/server/connector/key，且同key乱序回调不能把inspect_owner/expired/conflict降回undefined或same_command；invalid只可收紧为其它不可恢复分类。已恢复RAM K在核验前后及POST前须与日志原子重核；另一tab已清退K并reserve K2时，旧窗口不得采用K2、沿用K的核验凭证、覆盖其failure或清退K2。保守锁旧窗口并重新加载，不改owner/回执协议。

**问题/基线：** 长metadata已由BFF14bb159/App c3f301e修正且正常GET200；原502 invalid仍按browser-private profile1.0 inspect_owner锁定，旧tab消失证明RAM不能作为关闭/重开的恢复保证。当前主体/同实体ready只证当前状态，不证原命令receipt。

**取舍/边界：** 保留通用错误语义，增加Prepare专属“核验后显式原命令重放”政策；不把所有invalid改same_command，也不新建Platform receipt查询RPC/事实镜像。BFF code-first profile1.1新增独立prepare_inspection_recovery，原错误tuple/recovery、automatic_retries=false、new_command_authorized=false与Public24完整原件不变。条件为operation=prepareServer、failure=invalid、当前主体、精确server+connector可信读及原server版本不倒退；授权只允许原key/body/CAS显式重放，不授权新命令。其它inspect_owner错误不变。

**失败/验证：** 核验零POST，读取失败/错ID/错关联/旧版本/取消/身份或generation变化均不授恢复；核验不是成功、不是receipt。重放仍由owner当前授权/CAS/幂等回执裁决，完整exact ACK到达才收口。保过期/身份冲突锁定及迟到ACK、秘密清退、管理与Prepare互锁；固定消费者由正式提交及digest正规生成。先行为RED→窄修→相关门→正常同一实体与原请求验收；不以GET200称原Prepare恢复。

**App状态/恢复落点：** 沿mcp-preparation-commands与原ConnectorCommandProvider，仅Prepare增加非秘密恢复日志；新mcp-preparation-recovery.ts负责浏览器IndexedDB原子reserve、严格codec、失败标记与exact ACK后的compare-by-key清退，不保存headers、URL、OAuth/令牌、工具原文或业务成功facts。使用IndexedDB读写事务串行化跨tab同actor/server的首次命令，而非localStorage覆盖竞争或仅sessionStorage丢tab；无新依赖/服务/后端表。原generic connector command仅增加显式unknown bootstrap及Prepare专属mayResume钩子，默认行为不变；不将其它Create/Update秘密写入日志。

**本地数据模型：** IndexedDB `kokoro-mcp-preparation` version1，`intents` object store，key为JSON.stringify([verifiedSubject,serverId])，subject index；record closed `{subject,target:{serverId,connectorId,version},key,failure?}`，严格复用当前ID/CAS/key及已发布failure分类。首次POST前reserve事务必须commit；已存在则采用原target/key，绝不分配替代命令。初始化/重开只恢复unknown，不发POST、不把存储当主体证明或owner事实；同actor当前Session准入后才能读，跨actor不展示/不恢复。日志不自动TTL清掉未知意图；过期由owner明确返回后封锁。浏览器存储不可用/坏记录失败闭合且允许显式重新读取，不降级RAM后发送。

**生命周期：** 页面/弹窗关闭和reload保持日志；新实例恢复后需重新可信核验，再显式重放；核验凭证只在当前actor+generation有效，取消/重验/一次重放即退休。原请求body/key/CAS不可被当前owner新版本改写。完整client ACK且exact connector绑定通过后才compare-by-key删除日志；删除失败保未知，不置假成功；不同新key不可被迟到清退。旧actor实例退休只取消内存，非秘密日志留给原actor再次真实准入恢复，不授权新actor。恢复加载/失败与业务owner读取分别呈现，未完成恢复读取时阻止新Prepare/试用/同实体变更；管理清理仍沿既有owner语义。

**测试/正常验收：** 存储port测试reserve先于POST、跨实例恢复、原key/body/CAS、错actor/identity/generation、损坏/不可用/提交及清退失败、迟到ACK及新key保护；正常浏览器验证真实IndexedDB事务与reload，不把测试port替身称真实存储。UI核验按钮只GET，核验后显式原请求POST与完整回执，再刷新同ID；不重建连接、不清failure绕过政策。复用原最小组件与错误文案，不新建恢复中心。

## 2026-10-24 MCP注册拒绝的局部投影

`registrationRejection`仅是当前MCP创建流程的可空UI拒绝分类，内容不包含URL或秘密，不进入业务表、浏览器持久化或传输契约。只在首个精确确定拒绝时标识URL重复；新显式提交/清退清空。原未知提交仍由不可变注册意图保留key/body，不因重放返回重复URL而替换。

## 2026-10-24 MCP试用局部状态

不新增持久业务事实或Schema。Try只创建现浏览器草稿、写入现草稿提示词并设置engine瞬态exact Connection选择；不写账号enabled或替owner创建连接/授权。草稿文本沿既有持久策略，选择沿既有New/select/主体退休规则，不声称刷新后仍持久选中。route/subject/generation动作寿命只用于拒绝迟到回调，非第二套授权或任务状态机。

## CHAT-1：浏览器未决提交记录（2026-10-24，实施设计）

新增仅App-owned同标签sessionStorage恢复数据；独立前缀按已验证subject、direct/project scope及conv分键。版本化严格记录保原session、optimistic ID、原idempotency key及唯一builder产出的冻结请求；pending可带公开失败码，ACK保存exact receipt，明确放弃保存退休态。主体由原Product Session准入授予、marker只核变更；无服务端身份/会话/Run/账本真源。单记录1MiB，超限/配额/读写拒绝不截断、不腾空他人数据、不发送。

ACK/退休按原key比较更新，不擦后继意图；没有精确回执时不按正文或404判成功/未执行。主体切换清理当前tab恢复前缀，scope独立，普通dispose保留；tab关闭遵循sessionStorage寿命，无跨设备承诺。损坏记录闭锁而不是空记录；ACK持久化失败不能伪造恢复成功。原Conversation索引、localDraft退休键及BFF durable ledger保持唯一职责，无SQL/Schema/owner变化。

## CHAT-1：本地New来源与不可回退的来源退休（2026-10-24）

ConversationEntry仅增可选localDraft:true，现严格Zod literal；缺省仍历史索引。另由现page-clients按scope写独立`kokoro.web.conversations.draft-retired.<scope>.<encoded session>`键，值为固定版本1；存在/异常即不授予草稿证明，不是会话存在或提交成功事实。主体准入/清理沿原索引前缀，不写secret或正文，无消息/Run/幂等请求副本。New/首次发送保同一ID，原模式/Skills/MCP/模型及composer键不变。首次POST先确证退休键写入，否则保输入与原key/body且零POST；刷新不补发。退休键不做自动过期，只在现主体索引清理或用户浏览器数据重置时清理；配额失败显式可重试，不删其它资料。

## 2026-10-24 普通会话 MCP 精确选择（App 实施中，正常未激活）

不新增数据库、后台账号偏好或另一份owner状态。本次最小合理默认只在原engine的当前会话草稿状态保存所选Connection ID，发送时复制进原pending submission，原key/body的未知恢复不受后来的勾选变化影响。切主体/新会话/准入退休清退；旧Run的重试/恢复从原冻结输入继承，不拿当前缓存重建。未观察的跨刷新草稿保留及账号默认开关语义不实现，不擅自新建全局设置或以未答复暂停当前切片。

## AUTH-1：Web登录表单短期引用（2026-10-23，正常已加载）

复用受管Web Redis，新临时键`kokoro:web:iam-signin-flow:<origin-sha256>:<random-flow>`；闭集v1值只有原始签名query、独立browser proof SHA256及绝对expires_at。flow为18随机字节base64url，独立proof为32随机字节，后者仅HttpOnly、SameSite=Lax、Path=/auth/sign-in cookie持有；query、邮箱、密码、用户token不放flow cookie。SET NX，TTL取原exp剩余与300秒较小值；读/刷新不续期，丢失重新正式登录，不承载身份durable truth。

读取/退休核精确flow、origin、唯一cookie、proof和闭集记录；退休原值CAS删除，错误proof不删。CSRF仍独立一次消费，signin cookie保持每render独立并绑定flow，刷新只CAS退休本请求已观察并验证归属的旧proof，缺失nonce只回收已观察且精确匹配flow/token的cookie名，不删除其他记录；consent/invitation不动；feedback保加密且按flow隔离。成功清本flow cookie，不清其他交易。无SQL、新服务、旧格式兼容读取或共享Redis清理；正常App已加载；实际旅程证据见登录指南。

## AUTH-1：服务端cookie的issuer Session绑定（2026-10-22）

ProductClaims在现id／generation／subject／access及期限旁新增必填issuerSessionId，值来自原生已验签ID token sid；有界合法Unicode、不含控制字符，不能从user ID／Product Session ID推导。仅加密HttpOnly cookie持有，不增加Redis记录字段／表／业务owner。现refresh-at-rest／AAD／双CAS／tombstone保持。refresh后原sid不变；缺失／错签名／异sid闭锁原待定会话，旧无sid cookie直接失效，无兼容填充。本片只约束浏览器登录／续期，不给Run增加用户token或额外Billing grant。

## AGENT-1／MODEL-1：精确模型绑定同源消费者（2026-10-22，本地已验）

最终1142输入无漂移，完整App七门／4749 PASS、preview108及独立Docs45测试／54HTML17941链接通过，四MCP SHA恢复，独审Approved。正常激活和实际Agent资金链仍待，详见CURRENT首节。

沿Root唯一主链和Billing rate2已批决定，主方唯一writer，App基线bc0c8c3；固定BFFa77276b35b07eb65df8a0af2e41b461b393afb12／Public23.0.0／34ea71e0aa56256ca00fc5b3c40abd4d142bea82e664a6871190b8547ec2b9e6。唯一snapshot增加MeteringRate required model_revision{id,content_digest}，原七窄生成器正规重出；不为透明桥创建重复validator。原三具名计价通路、Product Session、1MiB/12层、原充值16KiB和10秒／原body-key-time恢复语义不变，无新路由／服务／表／运行fallback。

写区为固定snapshot、七生成器和原派生／直接契约与薄桥fixture、App在线Docs catalog和指南／相邻当前文档；原四MCP WIP按既有精确保护，不覆盖或夹带提交。先原contract新required pair行为RED，再仅pair/version delta的test-only完整22.5逆证承接原历史门，业务网络协议不变。在线Docs同步解释精确修订而非模型显示名／Key推价；发布配置不是消费许可。完整App工程、preview和Docs门停写验收，正常配对／实际Agent资金链后继，不称一比一全站或正常结算已验。

## AGENT-1／CREDIT-1：计价配置不属于App（2026-10-22）

无App表、价格缓存、预算副本或提交receipt。Billing唯一持有不可变rate/policy、整积分预算及审计／幂等；BFF拥有可信租户和管理员准入。App只在现同源桥转一次已准入命令及有限回包，不猜有效价、不取整、不扣款，也不把GET latest/null作为未知提交未发生的依据。

## CREDIT-1 薄adapter不拥有资金数据（2026-10-22）

无新增表、账户、充值意图或余额缓存。Product session仍按原Redis/cookie owner；当前tenant/actor来自受信会话及BFF。Admin持有同tab原命令，Billing拥有唯一账户／grant／journal／audit/幂等回执，App不持久化、换算或补偿余额，不把读取失败合成0。

## MODEL-1 上游发现不新增App事实（2026-10-22）

App同源Admin桥只短暂转发已准入请求与有限响应，provider/credential/候选模型事实归System/BFF，选择候选的局部UI归独立Admin。无SQL、缓存、表、Key存储、持久化状态或自动发布/价格推测；response不能成为App可编辑模型目录。配置Domain与Product Session是既有可信边界，浏览器tenant/actor不建立事实。

## 2026-10-22 公开Skill list adapter候选

固定GET公开入口仅读取BFF正式public投影，当前User API Key／普通或trusted OAuth App资格与项目授权全归IAM/BFF/Platform。App不新建身份事实、Session、缓存、数据库、Storage或应用绑定，不将外部Bearer换成Product access或把客户端service/tenant头当事实。生成validator仅是固定owner artifact消费者；数字时间戳按JSON number验证，响应原样返回，私有cookie与服务凭据不公开。

## 2026-10-21 个人系列删除消费者候选

最终消费者配对Public22.1 / 180候选，尚未正常生效。Web不新增数据库、Redis、Storage写入或持久化命令。删除Dialog仅持本主体的确认锚点CAS、明确publication、深冻结body/key与未知状态；关闭保原意图，准入取消等待，主体切换整体退休。deleted是owner保留installation的来源状态，不代表物理字节删除、不合成uninstalled或空publication。全部修订终态、迟到发布防复活与durable receipt仍由Platform/BFF拥有；正常写旅程和物理保留期限不由App测试推断。

## 2026-10-21 发布确认消费者配对（实施中）

不新增Web持久化／表／缓存；现内存发布session增加确认publication的冻结副本，原draft/upload/receipt与幂等key保持。重试原body/key，不合并较新publication；关闭保留未决意图，身份退休沿既有宿主取消／卸载。新系列明确null，已有系列必须由正式历史读取证明；不按选中旧版本、revision或可用性猜当前。

## 2026-10-21 Skills 历史仅保存弹窗临时读状态

无新业务表、持久化、localStorage或全局缓存。版本行、publication、游标和精确包文件均来自BFF/Platform；Web只保当代弹窗列表、选中版本及读取状态。相同当前指针不推出最大revision或执行可用性；不改原安装pin、旧消息引用、发布回执或未决写意图。关闭/身份退休清理读状态，写入恢复仍归原publish/withdraw宿主。

## 2026-10-21 退出展示无新增持久状态

本片仅App固定确认/失败展示与现native relay导航投影；不新增表、Redis交易、身份cookie或确认receipt。原issuer签名确认cookie仍由IAM拥有，原Path、期限、当前Session/client/redirect绑定及正式撤销原样；页面status只选择展示，不证明退出成功或恢复Product会话。见TECHNICAL_DESIGN本日窄修。

## 2026-10-20 对话偏好版本退役

仅现本地UI默认偏好改用 `kokoro.web.chat-prefs.v2` 保存 raw label key；旧key不读取、不删除、不拆分/迁移，不清其他localStorage。新key可保存合法含冒号label。已冻结未知请求的body/key及会话恢复记录原样保留，不自动重发；无owner持久事实变化。

## 2026-10-20 MC-02A 模型消费不新增事实

Web只保存当前已读候选及选中的稳定label name，不将显示别名、上游request_model或provider名字转成另一个身份。精确model/revision/provider引用来自BFF/System事实，本片无持久化、SQL、receipt、模型连接/Key存储或新缓存。现selector/engine生命周期保持；preview/test夹具仅配对新wire，不冒真实模型或执行成功。

## 2026-10-20 Admin模型桥不新增业务事实

本片仅透传Product会话准入与BFF正式模型管理请求，无Web数据库、receipt、连接配置或额外token持久化；不读取System数据库，不保存secret值，不放行模型、工具或扣费。模型目录和路由事实仍归System；未知命令恢复由Admin页面冻结意图承担，而非Product桥自动重试。

## 设置视觉与主线状态组合（2026-10-20）

保留主线知识 owner 数据及原 KnowledgeSession/Provider 的读取、写入、核实和准入退休语义；视觉增量不增加知识存储或第二份会话。账户详情和资产创建前表单仍为本地导航/临时草稿，知识 preview 草稿不冒充正式 owner 事实。

## 设置内部页的局部状态（视觉增量范围）

Web 不拥有邮箱、号码、钱包、知识、API key、Webhook、账单或授权持久化事实。本次无数据库、schema、迁移或新的 localStorage 持久化。

账户详情和管理内页仅保存所属组件的导航枚举；各表单保存未提交草稿，取消、离页和既有身份边界变化后清理。静态电话/钱包说明不保存业务输入，只按主体隔离。偏好仍走既有正式资料读取/保存，未接通的知识开关不能用 false 代表实际设置。

账户积分只消费正式 summary，金额为十进制 micros 字符串；UI 不创建账户、余额或套餐事实。Team 校验提示属于表单，client 替换及身份代际变化后退休。分享 review 仅代表最近一次完整重读成功，不能在后续失败读取后沿用。

## 2026-10-19 收尾集成候选：完整既有分支与固定 Public19

只集成 main d42fe1d2、PR37 的原生浏览器登录回归、PR38 的六页设置与完整 local362a9b7；保真实 merge ancestry，不按功能片继续开 PR。知识/记忆等其余混合工作保持原位，不在本次顺手接通。唯一 BFF snapshot 固定已合 owner08a2120ea85b6cad5cf6e839ef14dbf83d908b92、Public19.0.0/165、SHA256955412b680bf7a2529c4c35f553ff272d7361769ea95bb441ba820b552ffc564；六个既有窄 generator 正规配对，connector-command-errors 独立 profile 不换 pin。

复用原测试历史逆证，在原 Public16→15.4→15.3 前增加显式 Public19→两个完整 Public16 父版本的逆 delta，保原全文 hash/语义与退役 MCP 写入口负控，不在生产兼容旧协议。接入已经交付并在正常开发环境配对过的 calendar consumer：来源逐路径绑定既有 app-public18 冻结证据，使用每周多星期、每月多日期、一次性 local_date、IANA timezone 和 owner next_run_at；不再消费已退役 recurrence_anchor_at。仅接收该既有切片所需源码、字典及测试，不 wholesale 导入混合工作树。

主干 archive receipt/权限/账户/分享与本地单一 per-scope Reader registry、MCP command provider/受控 Skills scope/刷新及 callback 围栏按语义并集。archive revision/receipt 进入原 Reader host，不再启动第二读者；稳定现 archive retry callback，展示层只接实际使用的归档操作和 busy，不保无消费者字段。旧测试 fixture 接真实 keyed Reader hosts，保原退休/真实 GET/归档断言；未弱化浏览器 Origin:null/CSRF/nonce/CSP/第二次登录。无新 owner、API、DB/Redis schema、网关或认证旁路。

所有验证尚待最终冻结全门；本段是当前集成范围，不声称已合并、页面已对齐或正常服务已重载。正常数据库/配置/服务与已有混合工作均保留，模型、实际工具与扣费仍暂停。

## SET51 登录回归范围（2026-10-16）

仅验证现有 `/login` 浏览器表单和原 Product/OIDC/issuer 生命周期；GET 的 CSRF cookie 与后续 provider POST 的 state cookie 分阶段产生，测试保留该区分。无数据库、Redis schema、业务存储、cookie 格式或会话寿命变化；测试只清理自身 fixture 数据，原运行实例及用户事实保留。
## 个人资料输入反馈（2026-10-16）

新增内存仅为当前资料表单各字段的拒绝输入标志，不保存被拒绝文本；随身份代际变化退休。计数由当前已接受值派生。BFF仍拥有资料与revision；不增加SQL、Redis、浏览器存储、资料字段或写入路径。

## 个性化内页与数据管理排版（2026-10-16；设计边界）

依据本轮实际 Manus 界面：个性化含个人资料/知识页签、名称/使用时机/内容知识弹窗，以及复制提示词/粘贴内容的记忆导入弹窗。当前 BFF 只有四项资料字段，没有知识存取或记忆解析契约。本片只补浏览界面和本机复制；资料继续沿既有可信读取/CAS保存，不新增业务请求。知识和导入最终保存动作保持禁用并展示原因，绝不虚构空知识列表或成功导入。数据管理保留真实分享/归档读取、分页、确认和恢复，仅补三行管理用途及排版。

Owner 为现 Web 设置模块：扩展 personalization-card 负责页签和既有资料；同级 personalization-knowledge-panel 负责知识浏览/草稿弹窗，memory-import-dialog 负责导入说明/复制/临时文本；沿现 sections CSS、九语言、现组件和浏览器测试。选择同级具名组件而非全塞资料卡（避免不同弹窗职责混合），不建新目录或全局状态层。弹窗复用原 Radix Dialog，支持键盘/焦点返回/窄屏；关闭即卸载文本草稿，不写 localStorage、API、账户资料或服务器。复制失败明确反馈，未完成复制不显示成功；不从其他网站自动采集用户记忆。

验证：原资料字段保存与全部旧业务断言保留，明确迁移旧“入口禁用”断言为“可浏览但不可提交”；验证页签/两弹窗/复制失败与重开清空、嵌套 Escape 和手机布局，随后组件、lint/typecheck/build、contract及architecture。Skills/MCP/连接器、generated、依赖、owner协议及数据库均排除。

## 设置页面内部排版（2026-10-16）

本次六个服务页面内部排版及个人资料简体文案无持久化变化；页面不写资产、密钥、支付或账户事实。

## SET53 页面状态与资产事实（2026-10-16）

Web 无新增持久化 owner、SQL/schema、cookie、Redis 或 localStorage 键。Mail 设置/收件箱及开发者密钥/Webhooks 的页签仅存组件内存；导航复用原设置 URL。没有后端权威数据时显示尚未接通，绝不生成邮箱地址/电话号码/余额/账单/API 密钥/授权发件人，不把 Manus 当前账户数据复制为 Kokoro 数据。原运行实例和用户数据保留。

## SET49 整合的数据边界（2026-10-16）

无Web数据库、schema、迁移、cookie或持久化键新增。账户/个性化/余额/归档请求继续绑定准入与代际；主线项目链接不建立私有子任务reader。正常服务与业务事实保持，验证仅使用自有隔离fixture并复用现基础设施。

## SET47 无Web归档持久化owner（2026-10-15；候选实现）

SET47传输边界补充：WHATWG会规范化单独的`.`/`..`段及其percentencoded形式；BFF保持原始HTTP的exact encodeURIComponent契约。Web对仅这两个历史ID在任何fetch前拒绝并将动作禁用、解释不可用；不使用双重解码/替代API，也不宣称任意历史ID浏览器皆可操作。其余合法Unicode ID不限制为conv UUID。依据：[URL Standard](https://url.spec.whatwg.org/#single-dot-url-path-segment)。

BFF Conversation新增archived_at nullable TIMESTAMPTZ(3)，active/deleted不扩展；Web无SQL/schema/migration，不持久化归档列表/真假状态。归档只整理列表，不删除消息、撤销分享、取消Run或清当前engine；Project删除仍处理已归档子项，tombstone不可恢复，父归属和幂等由BFF事务裁决。machine契约及owner schema不在Web重复维护。

Web内存仅保存当前身份代际的分页列表、四字段投影、cursor/顺序检查、mutation busy/unknown/review、active archive三态和独立archive revision。不同身份/代际/scope/client/engine请求不得互相复用结果；archive ACK优先于更早请求与synthetic row，GET当前状态用于刷新后校准。unknown保留当前工作区但阻止冒出正常任务行和自动写重试；用户在产品内重读确认后继续。无新localStorage archive真源。

可选EngineSnapshot.locallyCreatedSessionId仅本实例创建当前ID的provenance，不是服务端存在/未归档证明；赋值、匹配投影、打开历史/外部store/dispose/真实身份切换退休见TECHNICAL_DESIGN。只认当前可信准入且无更新归档事实的本地新任务404例外；同主体admission暂停不销毁证明。page-clients现engine key不含subject，清browser index同时同步退休证明，防止旧实例在新主体恢复资格。旧SSR与注入snapshot缺字段不授资格。当前列表/状态GET/成功ACK或owner snapshot证明持久化后同步退休现证明，后续404不合成已删除任务；无持久化证明的真正本地draft仍保留首次404例外。

Root保留现正常3311全部事实和session。候选使用正式launcher新owned临时fixture DB/namespace，仍只复用现PG/Redis服务器，不改旧DB，不往正常列表插假任务。空态CUA、真实PG隔离并发/分页/归档恢复、Web渲染与真实Next边界各自报告，不混称完整Agent执行验收。

## SET43 已移除会话的账户资料读取（2026-10-15；D0，先真实HTTP负控）

测试夹具补充：GET不执行的Auth.js agent factory因server-only导入需空stub；身份准入与requestWithDomain仍是真实HTTP。前两轮仅collection失败，不算行为RED。

无owner/schema/SQL/Redis键或cookie清理变化。会话撤销仍IAM，Web仅区分已确认失效与依赖不可用，不删其他会话或伪造identity。正常测试仅创建并清理本轮自有会话，原有会话保留。

## SET42 任务发送行窄屏排版（2026-10-15；D0）

仅CSS及现E2E追加，无数据owner、schema、持久化键值或默认行为变化。

<!-- SET41 V2 D0: V2仍仅现CSS布局，无数据模型、存储、授权及owner变化。 -->

## SET41 主题选项窄屏可达性（2026-10-15；D0）

仅CSS布局；无服务持久化owner、SQL、schema、localStorage键或值语义变化。测试只使用隔离浏览器既有主题偏好。

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

仅现localStorage快捷键map新增可缺省输入copyTaskLink，旧三required值保持、统一输出严格四项，旧读零写/稳定缓存；新默认碰撞只禁新增项，不新增key/持久化owner。

## SET35 十四个实际设置日文提示（2026-10-15；D0，仅现locale）

基线Web 3f97368ef38c9cea4c88d53ad29e61b83a8716eb，939 tracked clean；runtime_audit唯一writer仅现src/i18n/ja.ts，931保护/Root7。Root设计/docs/独审/Git/资源与实际回归；全部tests与其它locale/产品逻辑字节保护。

无schema/持久化变化；十四个既有MessageKey补日文值，原语言解析与回退语义不变。

## SET34 到期日期测试按实际时区验日末（2026-10-15；D0，仅现测试）

基线Web fd627496a6f860c7ed3e1afef51c65fbc3bcca57，939 tracked clean；runtime_audit唯一writer仅现tests/ui/kokoro-scheduled-surface.test.tsx，932保护/Root6。Root设计/docs/独审/Git/实际复核；全product source与其它全部测试字节保护。

不改持久化/schema/数据转换，仅测试读取已有提交值并独立验当地日期日末。

## SET33 两条原生withdraw测试的就绪前置（2026-10-15；D0，仅现测试）

基线Web d7f5d5d41ce4740de219480ccd6d7bf7d9166d40，939 tracked clean；runtime_audit唯一writer仅现native测试，931保护/Root7。Root资源/Git/docs/独审/正常运行；全部product source及原计数/安全assert/timeout/mock/cleanup仍保护。

只读既有fixture计数，不写业务持久化/DB/Redis；复用原资源及清理，无schema/数据模型变化。

## SET32 原生登录请求顺序诊断（2026-10-15；D0，仅现测试）

基线Web 52b535789b93ebac740db7aa8e5296c82b6622b6，939 tracked clean；runtime_audit唯一writer仅tests/system/oidc-rp-next-http.integration.test.ts，931保护/Root7。Root设计/docs/独审/资源/Git与正常实例。现runtime修补已接收，终态20focused/3987PASS7旧FAIL/Playwright20PASS4原SKIP；不能据此认定R175/R177旧native多请求根因。

仅测试进程闭集事件记录，不持久化业务数据，无数据库/Redis/schema变化。复用既有隔离fixture和原清理，不新增服务进程。

## SET31 runtime请求退休（2026-10-15；D0，先tests-only）

基线Web dc26502bfa47ba0c22422623118b455d46644be0，939 tracked clean；runtime_audit唯一writer，1既有hook/1既有test/930最终保护/Root7，先仅tests其余931保护。Root设计/docs/独审/资源/Git/正常激活/CUA。AppGate及原生R175/R177全部源码/oracle保护；不扩大trusted admission接口，不把hook负控冒称原生多请求根因。

仅request及模式/attempt内存投影退休；无持久化、schema/Redis/账户/资金数据写。原manifest schema、tenant呈现值校验保持。

## SET30 未接通菜单与账户操作说明（2026-10-15；正式D0）

基线Web 0ab7bfaedf7425332049f5f867bcec79fccd285c，939 tracked clean；runtime_audit唯一writer，12既有source/920保护/Root7。所有tests原字节保护；Root设计、docs、独审、资源、Git、正常激活/CUA。实际Manus菜单已有对应本地入口，七个placeholder及三账户按钮仍按能力不可用，不引入owner/contract/API/deps或新source。

说明和ID只属本地呈现；无持久化owner、数据读写、资金操作或schema/Redis变更。原账户身份及恢复状态仍由原owner负责。

## SET29 侧栏账户余额可信读取（2026-10-15；D0，先tests-only）

Web基线2d31cd502db44b5b0ad74e52321cba755624896f，939 tracked clean；runtime_audit唯一writer本片4既有source+1既有rail测试，927最终保护/Root7；先仅测试准入，其余931字节保护。Root管设计/docs/Git/资源/正式激活/CUA，Skills/连接器业务排除。

Web不持久化余额；原formatCredits BigInt、missing-account/失败显示—、卸载取消、preview和marker撤回原语义保留。有效可信boundary只准许读取，不从marker伪造subject。原所有rail行为保护，无schema/数据库/Redis/资金写。

## SET28 Web阅读轴滚动槽修补（2026-10-15；正式D0）

正式Web基线7e062cd5e69847bfb34181b6674cb998c4cc50f1，939 tracked clean。runtime_audit唯一writer仅app-frame-main.module.css；931保护/Root7。Root设计/docs/Git/资源/正常激活/CUA。既有精确E2E已多次真实RED，无新tests-only或新增镜像测试；全部tests/阈值/mock/skip/等待保持字节。

无数据事实/持久化/状态机变化；仅阅读区视觉宽度。旧48rem cap、各宽度/rail布局与精确<=1px业务oracle保持。当前证据覆盖工程现Chromium门，不冒称额外浏览器通过。

## SET27 个性化未接通入口（2026-10-15；正式D0）

Web基线91fb1aee87df9e6dc0acadcdda4db5375623a13a，939 tracked clean；runtime_audit现Web唯一writer，12具名路径/920保护/Root7。Root设计/文档/Git/资源/运行/CUA。独立候选审查无确定P1/P2；原SET26已接收，本轮只个人资料呈现，不混入余额/支付/阅读轴。

没有知识/记忆导入持久化事实；不可展示假空、假导入成功或步骤。九locale唯一新增settings.personalizationMemoryUnavailable，中文“知识与记忆导入暂未接通。”；复用personalProfile/knowledge/importFromAi/importMemory标题，现中文匯入字形与其他旧keys/value保护。旧knowledgeHint/importMemoryDescription暗示可操作，不无条件显示。

## SET26 用量与套餐可信读取（2026-10-15；正式D0，先tests-only）

正式Web基线a9183585ab403797f79b522aedb120de562a64e9、939 tracked clean。仅现Web Billing/Pricing/settings消费接缝，runtime_audit唯一writer，17具名路径/914保护/Root8；Root独占设计/docs/Git/资源/正常运行/CUA。候选独审无确定阻断P1/P2。Skills/连接器、owner契约/SQL/generated/依赖、checkout源码与全局QueryStore保护；无新源文件/模块/owner。

Web无新增持久化owner/schema；原owner摘要/流水/目录与金额wire保持。新scope/client投影只在各已挂载页面内存，不跨preview/live或被撤销generation复用；auth-index不是授权事实。暂停不造0/empty/missing-account，失败不造套餐。唯一locale新key九语言settings.billingRequiresIdentity：zh“登录状态确认后才能加载用量和套餐。”，既有read retry/error文案保持。

## SET25 浏览器测试就绪边界窄准入（2026-10-15）

仅现tests/e2e/web-governance.spec.ts原65/107/267/405/470五个初始/app goto覆盖六例：networkidle改DOMContentLoaded后准确Chat input可见/启用/可编辑web断言。原229及其余goto保持。已有实际六desktop等待超时证据及只读独审无确定P1/P2；官方Playwright建议测试以web断言判断ready。原logout POST/issuer、reading轴/长markdown/stream/HITL所有业务oracle、mock、skip、timeout、route保持，R137观察器仍先于首次发送。不能以输入就绪冒称业务通过，也不宣定位具体网络请求根因。无Product源码/fixture/权限改动；沿runtime_audit同一writer，SET25扩为13writer/919保护/Root7，仅本项追加范围，其余原边界保持。最终正规E2E运行仍待验。

## SET25 原有模型偏好深链可靠性（2026-10-15；正式D0，先tests-only）

Web既有chat-prefs/ChatPreferencesSection/旧chat深链局部修补；正式基线6921a1cbffd723fc37c4cc64342bb3a6f89369a1，939 tracked clean，12writer/920保护/Root7绑定。唯一writer runtime_audit，Root设计/文档/Git/资源/运行/CUA；候选独审无确定P1/P2。Manus General实为任务发送偏好，现TaskDelivery已对应，不加General模型/左栏入口，更正旧卡注释。无新源文件/模块/owner/依赖/CSS，通用store/client/API/generated/Skills/连接器保护。

无业务DB/owner/SQL/schema/迁移。保原kokoro.web.chat-prefs、strict schema与{model:string|null}JSON；null不发model字段。直接setItem成功后store.read检测raw变化重解析；失败不更新cache/raw，同raw成功有效，无需广播。草稿/保存失败/目录epoch/status仅组件内存，重挂读持久值；不承诺其他tab不能更新。退役只目录观察/timer，不新建目录缓存或transport。

## SET24 账户退出失败恢复（2026-10-15；正式D0，先tests-only）

Web现有AccountCard退出交互的局部修补；基线03fc794403116f93c318eeec3534ae0d199cb690，939 tracked clean。Root绑定921原保护，唯一writer runtime_audit；Root独占三设计/CURRENT/相邻INDEX与Git/资源/运行/浏览器，storage_platform_audit只读审查。Skills/连接器、Product auth client源码、API/contract/generated/lock/依赖/CSS及其他owner排除。独立D0审查无确定P1/P2。

无数据库/持久化owner/SQL/schema/迁移/浏览器存储变更。pending/failed与controller/deadline/operation只驻当前AccountCard scope内存，退役/卸载清自有timer/listener、主动abort。取消仅停止浏览器观察，不表示可能已提交的退出事务回滚；不保存token、receipt、凭据或新logout缓存。

## SET23 通用语言与主题保存失败反馈（2026-10-15；D0与Root真实RED通过，具名source准入）

归属Web现有浏览器偏好Provider和General AppearanceCard，是现文件局部修补，不新增模块、API、owner、依赖或存储框架。正式基线293ac84d7b2b6562b73e46c56436aadc4c1c2e3b，939 tracked clean已绑定；原主题/语言即时生效，setItem失败无提示，不能说整体不可用。候选独审无确定P1/P2。

无业务数据库/持久化owner/schema/迁移；沿原kokoro.theme和现Locale storage key/值。failure仅本次Provider内存，无新store、receipt、缓存或同步框架。写失败仍即时应用，但旧持久值原样，刷新/真正Provider重挂可回旧值；成功重试存当前选择，新Provider应恢复新值。关闭重开Modal不是Provider重挂。

SET21分享浏览器接缝准入澄清：现 engine/client.ts 仅 createShare/revokeShare 两方法可共用具名有界分享调用，createShare 增可选 AbortSignal，原 POST {}、idempotency key/value、路径编码和 flat ShareReceipt 保持。两分享操作各浏览器单10s覆盖 fetch/headers/body/strict ACK，停止分享外部单10s同时涵盖写与完整重读；不扩大 generic postJson、其他会话/SSE/Move 方法或 ShareButton 源，不新文件/框架/依赖。现 client-artifact-share 测试可沿这两个方法补具名 deadline/abort/坏ACK负控，原 oracle 保持。现 lint/type 通过是阶段输出，终态仍须重新冻结和复验。

SET21/22阶段更新：两冻结原client/modal入口由Root实际复现4FAIL/47PASS，現沿CURRENT具名source/正常正式生成实施；D0预算/身份/closed ACK/恢复和当前同页Data结构不变。历史tests-only文字不再表示当前无source权限。

SET21/22正式消费前置：BFF eec3244645d5129407147774ecb07e03848420c4，public15.3.0/146全文SHA256 694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5；当前只授CURRENT具名两现tests-only真RED，source/机器等待Root复现。旧15.2消费pin仅待正规整包原字节与正常窄生成更新，不手改生成。

SET21/22参考页面澄清（Root实际CUA）：Manus Data为同页依次“已分享任务”“已分享文件”“已归档任务”三段，不是页内三个tab；其下授权应用、云浏览器数据、已购买域名各有管理入口。Web只新增Data/Help两导航tab，Data内容沿同页三段及三管理行。现只任务分享具备真实owner，其他段保不可用说明/禁用管理，不制造“暂无”的假空事实。Help为侧栏底部本产品帮助入口，不能复用Manus客服。

## SET-21/22 Data/Help无Web持久化（2026-10-15；D0独审通过）

Conversation/Share/Project有效性与撤销事实仅BFF持有；Web无新数据库/schema/SQL/cache/localStorage/receipt/share capability副本。build-time单正规public artifact不作为业务存储。Data当前admitted subject/generation内存仅保存安全四字段列表/cursor/页状态/选中确认目标/未知意图/写栅栏；layout retirement立即清scope并取消迟到工作。Help为静态真实产品说明，无客服消息/授权应用/云数据表。

unknown或成功ACK后权威读取失败不能本地删行冒撤销；显式全量重读固定limit100/最多20页2000条/单10s，从首屏至next=null且各页无重复才形成一次完整观察，仍不称跨页事务快照。成功后显式“继续操作”才可解除锁；分页/不完整/失败/已退休scope不能清锁。无share_id或URL进入列表、cursor、草稿、日志；正规ACK必要share_id只当次有界解析。正常Chat-off不seed数据制造正向验收。

## SET-20 团队视图不拥有持久化（2026-10-15；V2冻结独审通过，Root集成验收中）

Membership/Invitation/Role/Audit与LastOwner事务继续唯一IAM owner；BFF只正式Product adapter，Web没有业务表、跨owner SQL、cache或新receipt。Team snapshot、invite/role draft、pending意图、confirmation及reconciliationRequired只存在当次可信subject/generation/admitted生命周期的内存，真实scope退役清除且取消迟到结果。不将部分权限页或failed GET制造为空团队、邀请成功或新权限。

unknown及可能已提交的401/5xx保意图锁写；完整成功重读actor/全roles/合法首屏之后仍由用户显式决定再操作。owner ACK后的权威重读失败同样锁写，分页不清栅栏。最大20页/2000条只读预算失败保错误，不新增数据owner或索引。leave经已有IAM事实与已有Product注销，preview无auth写；客户端新增signal只退休异步，不宣称owner事务回滚。

无SQL/schema/依赖/lock/Redis业务事实/normal资源改动，真实测试只由Root创建和清理自己的disposable fixture；不创建对真实第三人的邀请/授权、不会发送外部邮件。三设计一致且独审后才授源码。当前正常姓名CUA因旧标签data协议阻塞待用户恢复，不影响本片设计推进，也不宣称整个设置完成。

## SET-19 姓名保存无Web持久化（2026-10-15；源码已接收，正常浏览器待验）

唯一User.name、原值CAS和Audit事实由IAM拥有，Web/BFF不增姓名数据库、Redis事实、schema/SQL、receipt或localStorage缓存。HttpOnly Product Session现存凭据/opaqueID/generation和两expiry边界保持，browser看不到Bearer；姓名来自正规userinfo，expected_name逐字保存原值，不能由当前输入、ID token旧claim、preview或跨身份缓存合成。

草稿、提交原值、pending/冲突/unknown恢复状态仅当前admitted subject/generation的编辑器内存；关闭/身份变化/unmount主动退役，迟到response不得写新身份。ACK证明owner已提交而非永久最新值；显示profile仍来自权威GET，unknown锁再次写直到成功重读并显式选择，重读失败保留草稿与错误，不以本地状态冒成功/回滚。长旧name≤16384 UTF16和JSON escaping有有限读取预算；缺失/null name不产生可用CAS基准。

正式BFF a88e710d2201342200017f44c2bc34325937b5d0/public15.2.0单artifact（SHA256 3214e32d273fbc514db1c1f2307f7855b623f1f613fb1da710cc51d23c41f453）与窄generated是build-time合同消费，不是数据库镜像。旧single pin退休而非双读；scope16只新authorize，不修改旧session/refresh角色或权限记录。三设计已独审、上游已正式发行，现准入源码；源码独审/正常浏览器保存刷新仍待，Skills/连接器事实不变。

## SET-18 登录设备仅安全会话投影（2026-10-14；源码已接收）

正式前置已接收：IAM284bfd8fea91d57dae18fa2b7c772d75c7b6dcd9/internal0.12/f6f3588d；BFF53996400e4100ed5940b104f0dce139d44fec383/public15.1.0/canonical与inventory144/SHA2565972f7be07a0117d8ee036fa4e742da7942b3c864d009c2847e70e69112a747d。Root沿SET18-Web任务卡授billing_scheduler_audit唯一源码writer；D0同一sessionID/generation/subject/access与session寿命最终复核规则保持。实现已冻结、独审并由Root接收，正常运行/browser尚未完成。Web实际OIDC_SCOPE按现原十三项严格顺序append账户read/revoke两scope，以正规fresh authorize取得；不得用旧refresh/machine提升。

独审后继规则：未知DELETE结果设独立reconciliationRequired写栅栏，hook与移除确认共同守卫；分页读取、分页失败或首屏读取失败不得清除，只有成功首屏relist核对权威目标状态后恢复合法写入。提示notice不是写资格。原分页/身份取消/正常ACK读回规则不变。

Web无本片业务数据库、Redis事实、device表、receipt、UA/IP采集或localStorage会话副本。现HttpOnly Product Session存储仍只为Web登录必要寿命与凭据边界，UI拿不到access/refresh/issuer cookie；现chat Session与登录Session不混用。IAM独占登录Session/凭据/撤销/Audit，BFF只发布非持久projection。

列表/cursor/current sid/选中other/confirm/pending/error仅驻dialog的当前subject+admitted generation内存，关闭/身份退役/preview/unmount清空并主动取消；分页失败保已读部分且明确未完整，不写假空。current同owner安全记录，created/expires保持UTCinstant，UI按locale显示，不将创建时间伪造last-active/在线时间，未知设备信息直说未知。

移除only提交ACK匹配后确认；unknown先重读核目标是否仍active，不能因本地删除一行冒owner撤权，也不能把404冒200。权威expired Session tombstone与关联凭据处理/清理均在IAM，Web无恢复、批量全部退出或永久成功receipt。检查old online admission必须依真实owner资格；不保证在途已准入工作回滚或所有token生成立刻停止。

只换单一正规BFF artifact与生成消费物，不修改scope/client/resource/Member/Role正常数据；fresh login/provisioning只在Root具名自有测试组合正式完成。i18n新device文案不构建共享设置存储，也不触Skills/连接器键/组件。当前候选已实现，未正常资源/浏览器验收。

## SET-17 目录可读、交易不构造事实（2026-10-14，目标待验）

Web不拥有商品/订单/支付/团队业务持久化，schema、SQL、Redis、资金及owner资源均不变。真实商品、金额、积分仅展示目录GET返回；非空不授予支付能力。旧模拟收银台不再维护paid/paying/retry或合成到账事实，不把URL参数当owner订单。现固定Team资源和角色权限保持，导航名称只描述已提供的成员管理。没有seed产品、开户、资金写或创建团队；真实非空目录/实际支付均不能由UI受控测试替代。

## SET-16 通用通知与声音：无业务持久化owner（2026-10-13，实现候选）

2026-10-14 修正：同主体 readBoundary 重验只关闭同步投递门，不清内存 run 锚、终态去重、待批徽标或已解锁音频；门关闭期间不排队、不补播。真实主体/logout/preview/engine/scope/dispose 才清相应资源。偏好仍以 subject 分区，设置异步授权以 generation 防迟到，音频以独立 unlock attempt fence 防旧尝试清理新尝试；无新增持久事实。

Web不新增SQL/Redis、任务、权限或营销订阅事实。新的subject隔离localStorage只保存browser_notifications/sound_notifications浏览器偏好，营销字段恒false；不保存认证凭证、任务正文或推送地址。旧全局kokoro.communication-preferences不继承到不同身份，不自动迁移/删旧字节。subject用于缓存分区，不能成为认证依据。稳定SSR默认false，setItem失败不更新可见值/广播；storage事件按当前subject重读，不称跨设备同步或数据库事务。

run/pause去重与音频手势资格只在现引擎/页面生命周期内存中；scope/session及真实subject/页面资源退役时清理，不因同主体read generation重验清理。快照水合的已有pause仅作基线，terminal快照不投递；没有持久化通知队列或离线补播。Notification实例和AudioContext只由其创建者关闭，刷新需重新手势解锁音频。原会话/账户/Team/Skills/连接器数据不变。

实现补充：active execution_head搭配合法null watermark亦可锚定未来live事件，null不被解释为历史完成；快照自身不投递。引擎receipt/snapshot捕获通知代际，身份退役后迟到事实不能重授通知资格。Audio create/resume由手势同步启动，resume单次3s预算，超时/拒绝/退役关闭owned context并拒绝late复活；无自动resume或补播。任务观察者逐事件隔离异常；切会话/身份/scope关闭owned投递，声音刷新/退役后需再次手势。无新契约、SQL、依赖、营销订阅或Skills/连接器改动。

V2实现补充（2026-10-14）：同subject临时失准入只更新layout投递门，长期observer/audio及engine锚保持；门内终态仍被正规引擎消费，不缓存或补播。真实资源替换仅退役旧engine，保留新engine已经合法锚定的owner head。AppFrame awaiting身份不含read generation，旧主体未变化的waiting投影不在退休后立即重登记。现page-clients engine lease在StrictMode重新取得时取消延迟release，真正无owner时正规engine.dispose清锚和listeners；hook关闭owned Notification/Audio并取消订阅，不增加第二个dispose owner。每次Audio unlock递增独立attempt fence，旧resolve/reject/timeout不得关闭同subject后发有效context；Settings组件仍以当次admission/generation取消迟到许可和保存。

## SET-SHORTCUTS：原浏览器偏好格式保留

继续使用kokoro.web.keyboard-shortcuts，三个newTask/search/sidebar对象的key/primary/shift/alt形状不变。无Web业务数据库owner、无schema/服务端事实。旧数据不自动迁移或覆盖，primary按当前平台解释；坏JSON/schema按原规则读默认但不写回，旧重复组合不触发歧义动作。编辑/清空/重设须setItem成功后发布变化，失败保持原盘值；跨标签页重读及写前重读不声称数据库级并发事务。

## SET-13 Team权限视图不保存事实（2026-10-13）

Role/Permission/Membership/Invitation与授权审计仍归IAM，public projection归BFF；Web没有业务数据库、权限缓存、团队/计划owner或新Redis/session事实。TeamRole八域仅用于完整可见目录及权限超集UI提示，当前mutation仍由IAM在线权威决定。唯一generated snapshot/provenance属于build-time固定依赖，不是业务持久化。原字节替换与正规生成遵守TECH/API的15.0.0开发配对裁决，旧pin不并存。

## RP 临时proof保留（2026-10-19）

不新增cookie、Redis key、格式或Schema。state/PKCE/nonce共享proof不由callback删除，沿锁定Auth.js签名及默认15分钟Expires；Web state记录仍300秒TTL和一次GETDEL。成功只签原HttpOnly Product cookie，proof保留不赋予身份或重放权。无浏览器latest-login索引，不承诺并发成功会话的最后启动优先。

## 2026-10-16 SKILLS-UPDATE U4（本地实现，正常产品链待验）

本片没有 Web 数据表、owner Schema 或新的持久事实。复用现个人 installation 的 available_update 与 pin；Web 仅有 actor-scoped 冻结命令（installation ID、series ID、旧/新 source_ref、目标 revision、原 key）及 ACK 后的回读阶段。没有 localStorage 业务记录、自动重试、双写或移除重装。重核清私有读事实；unknown 保原命令，换 actor 丢弃，完整页面刷新后不凭 GET 冒认旧命令 receipt。

<!-- BEGIN:T-K03.13-WEB-MCP-PERSONAL-READ-D0 -->

## T-K03.13 Web 本人 MCP 读取 D0（目标，尚未实施）

Web 无持久业务 owner，无 SQL/Redis/store 新增。本人 connector/connection 事实只读正式 BFF 投影，身份来自现 HttpOnly Product session，并由 BFF 正规 IAM/owner 准入裁决；不复制 owner 数据，不与静态推荐或 active connections 混用，不合成连接成功。

取消、到期或身份变化不转成授权，不持久 credential/owner 记录，不自动重试。每次请求总 10s/1MiB UTF-8 边界保持；四读与原 active 投影分离。三设计原 mixed 全文 suffix 与两 mixed tests 逐字节保护，Root 按新前缀选择性接收；此读取片不缩小后继本人 CRUD、授权 connection 与原 Admin 管理目标。

<!-- END:T-K03.13-WEB-MCP-PERSONAL-READ-D0 -->

<!-- BEGIN:T-K03.14-WEB-PERSONAL-LIFECYCLE-D0 -->

## T-K03.14-WEB-PERSONAL-LIFECYCLE D0（目标，未实施）
Web无持久业务owner、无SQL/Redis新增。Platform拥有series/revision/package/state_version及withdraw事实；例子和skill_updated_at取managed真实投影，不合成用量/日期/例子、不改旧revision/安装pin。
新版本metadata冻结真实现值及用户编辑结果；example_prompts/category_keys显式传送，省略会导致owner默认空数组，清空采用[]。例子遵现正式10项/Unicode scalar/16KiB总UTF8闭集，保原顺序和重复。CreateVersion201记录真实新UID/series/revision/初始CAS，包phase none；不推导CAS、不复用旧revision包proof。
浏览器仅内存阶段意图（原body/key/CAS/File/真实PUT ACK）；unknown保原意图等待显式重试，刷新不声称恢复已丢key。既有draft权威GET恢复保持原限制；撤回须真实expectedCAS和原因，ACK后重读权威事实。401/403失准入关闭私有显示/动作，主体或资源改变使旧ACK失效；不新增credential或secret持久化。

<!-- END:T-K03.14-WEB-PERSONAL-LIFECYCLE-D0 -->

<!-- BEGIN:T-K03.14-WEB-SHARE-D0 -->

## T-K03.14-WEB-SHARE D0（目标，尚未实施）
Web无持久化owner，不增SQL/Redis/store；固定消费BFF正式 `e1769b56aefa2e00e6460195c049cea81a9eea3b` / public `13.3.0` / 137 operations / canonical SHA256 `0a9683b38cfd30534931dd0cd7821e3ccded94d6d15613a711cebc1f1e83a209`；Platform `91bc3655ebd3648cb8f8ccddfacb5628bdeb1c5c`。 BFF Share与Platform精确revision事实不复制。

本片仅内存Create意图及ACK、copy状态、share_id/source_ref/真实summary、真实installation结果与原写body/key；账户失准入立即取消，anonymous/换主体清除，迟到ACK不污染其它资源。POST无幂等，不因超时/刷新/clipboard失败自动Create；clipboard失败复用已验证ACK，未知明确新意图才可再次创建。

Resolve六字段不是摘要或安装事实；nested summary不是current、不是安装收据；skill_id是真实revision UID，series_id另列，revision为owner decimal。显示模型不造content_hash/installed/brand/usage/例子/封面。安装列表必须完整分页并绑定真实source/series，已存在不同pin保留原ID/版本，不自动升级；未知安装只重放原冻结key/body，refresh丢key不称原重放，权威GET成功也不合成原ACK。

reader库存与selected_file来自现revision package API，source_ref/decimalrevision/选path绑定原目录；只UTF8文本，不执行HTML/script、不自动请求Markdown外部资源。真实下载资格来自已发布 BFF share-download browser-private POST，非 summary 内嵌字段、非新 owner 能力。仅内存保已核 source_ref/decimal revision/handle/filename/expiry；不存包或 transfer locator、不造 ZIP。BFF 句柄在传包前后重核同分享/主体/exact source与真实 SHA/大小，Web 只流式传原字节；资源/主体退役取消，未知资格不自动重发，不借 series current。

<!-- END:T-K03.14-WEB-SHARE-D0 -->

<!-- BEGIN:T-K03.14-WEB-GITHUB-IMPORT-D0 -->

## T-K03.14-WEB-GITHUB-IMPORT D0（2026-10-10；目标，尚未实施）

当前Web `745f273` 保留已验收local-import、独立真实包reader和revision安装；GitHub仍为self伪路径、旧URL直接Import及合成installed卡片。Root正常浏览器已证旧Import404，未创建draft/install。目标消费正式BFF `486ec7e80e834471878dd031553571d7f16c03bd` / public `13.2.0` / canonical OpenAPI SHA256 `3e4dd272fa8180b8f2a2bacc88d37f99ed5c77eaba05ef03e858ab766f891206`，Platform `4f7501b`；以下为批准设计，不表示代码、generated pin或浏览器已接通。只加此前缀，下面原mixed全文逐字节保留。

### 无Web持久owner与恢复约束
Web无业务SQL/Redis/新store；不复制owner draft/安装/receipt。内存按可信session subject隔离，只有admitted可开始或继续，失去admitted先abort等待，匿名/换主体清本片意图，generation仅等待取消代数而非持久授权。每阶段独立保存冻结selector/body/key及真实ACK，迟到结果绑定原主体/资源，不污染新弹窗。

Import冻结原四selector/key；Publish冻结真实draft ID、Import ACK CAS、owner audience/body/key；Install冻结真实revision source_ref/key。unknown只重放原body/key/CAS，不get最新CAS后偷换同key。关闭取消等待不声称owner回滚，原阶段内存可在同主体显式继续；修改repository/path须显式新意图而非改原命令。

刷新丢内存key/body不称原重放，不持久化凭证、命令key/body或伪receipt。若已知真实draft ID，可用既有managed/package读取权威事实并由用户显式新后续意图；Import未知且没有skill ID时缺少原命令恢复身份，明确边界，不新建重复draft冒恢复。Import ACK仅validated draft，Publish仅active/owner，只有真实installation ACK/权威安装读才显示安装；不得构造content_hash卡片或假installed/enabled。成功invalidate并重读现目录/个人资源，不合成metadata、示例、文件树。原local-import locator/流程及已有安装pin职责不改。

<!-- END:T-K03.14-WEB-GITHUB-IMPORT-D0 -->

<!-- BEGIN:T-K03.14-WEB-LOCAL-IMPORT-DATA_MODEL-D0 -->

## T-K03.14-WEB-LOCAL-IMPORT D0（2026-10-10；目标，尚未实施）

当前 Web main `3d2b419f971aaa3478b22d7f4e96f34190dff79b` 已有真实目录/包reader/安装动作；普通目录上传仍调用旧preview/confirm，个人设置的新建仍手填个人publish元数据，两者尚未消费正规local-import。事实源为正式BFF `939bf0e1da98a313233a923c6aa55481d06f5aca` 与Platform `32666c1c18360e707048a1104efe6b50e375002f`；既有协议已足够，不新增owner API/RPC/SQL/依赖。此D0仅新增本具名前缀，下面原mixed全文逐字节保留，不表示实现或浏览器验收通过。

### 唯一数据owner与浏览器状态
Web无业务SQL/Redis/数据库schema，不新建store或复制Platform导入意图/命令receipt/Storage对象表。Platform状态为intent→upload_pending→uploaded→completed/rejected/expired；terminal不逆转，Get公开projection不含内部intent阶段或命令receipt。Finalize在owner事务内建立个人active revision和安装；Web只显示返回事实，不自行“发布官方”或填安装状态。

当前页内存持有File、原size/hash、Begin/Complete/Finalize各被冻结的body/key、真实transfer与PUT source_version_id、当前intent/阶段和已核验owner ACK。未知操作不改body/key，异步generation隔离关闭/切账号/重选文件后的旧响应；取消浏览器等待不删除owner对象，不清理共享数据。

sessionStorage仅非secret intent_id locator及过期定位信息，具名前缀kokoro.skills.local-import.v1，绑定既有可信session subject；它是UI定位而非业务事实/权限缓存。凭证、body/key/File/transfer/proof不得持久化。过期、匿名/换账号清旧locator，恢复每次fresh GET且401/403终止；storage不可用/locator丢失/未知Begin尚无intent_id时明确刷新恢复边界，不声称找回原命令。

恢复uploaded的proof只来自真实owner；没有PUT ACK或owner proof时不编source_version_id。upload_pending GET无transfer/upload_id，缺原Begin/File需用户显式重新选择新意图，不自动造新intent或复用不相关文件。uploaded无scan_state，不显示“扫描clean”；completed必有skill但允许无installation，只显示实际完成/安装事实。当前目录统一SKILL_CATALOG_RESOURCE_KEY与个人settings相应权威重读，在实际Finalize/Get完成事实后才刷新，不插合成catalog卡片/示例。

旧个人draft/publish状态继续归owner，已有draft恢复/更新、安装启停与Admin版本链保留；普通新建移到local-import，不混CAS包阶段或复制数据库。D0仅三前缀；所有原mixed正文、两mixed tests与任务外tracked字节受保护，Root精准index/提交，实施后真实owner与浏览器门另验。

<!-- END:T-K03.14-WEB-LOCAL-IMPORT-DATA_MODEL-D0 -->

<!-- BEGIN:T-K03.14-WEB-CATALOG-PACKAGE-DETAIL-DATA_MODEL-D0 -->

## T-K03.14-WEB-CATALOG-PACKAGE-DETAIL D0：真实目录包详情目标（2026-10-10；待实施）

当前 Web main `d2545a34cc2f9bbc4aa991b93fde773db555e2d5` 已显示真实目录/摘要，品牌与分类一致；“查看详情”包 reader 尚未接通，同源目录 package 读取仍404。本前缀定义待实施目标，不作为业务已生效/浏览器验收证据。BFF正式 `939bf0e1da98a313233a923c6aa55481d06f5aca` 已有 public `GET /v1/skills/{skill_id}/package`（getSkillPackageDirectory），经 `publishedSkillPackageInspectionRoute` 调 `ProductSkillReadService.InspectSkillPackage`；Platform物理 `apps/kokoro-capability` 正式 `32666c1c18360e707048a1104efe6b50e375002f`。不新增 owner API/RPC、依赖或持久化。下面原 mixed 全文逐字节保留。

### 浏览器状态与身份
Web仍无业务SQL、Redis表或持久owner，不建store/localStorage包缓存。BFF/Platform/Storage拥有publication、authorization、package与对象/扫描事实；Web仅保留当前页面选定series、revision Skill ID、reader开闭/所选file_path、请求状态和已核验目录/文本。

series来自Hub skillId；URL与source_ref绑定Hub currentVersion.versionUid（或已与该值核对的GetSkill.version）。成功data.revision是独立正uint64十进制owner版本，不混同Skill ID、CAS或checksum。目录→文件必须绑定同一source_ref/decimal revision；资源改变清旧文本并取消旧请求，不把上一包响应显示为下一包。刷新从owner重新读，不跨刷新持久化资格。

files只包含真实owner认可的UTF8可读成员；size_bytes与所选原text的UTF8编码长度一致，空文本保留为空，不补示例/SKILL.md/scripts/references，不声称展示全部binary。缺SKILL.md、目录为空、不可预览、权限拒绝均显示相应真实状态，不合成内容或绕资格；Markdown HTML/脚本不执行，引用的外部图片/资源不自动加载。

后继只扩既有consumer内存projection/schema与现reader组件，不改owner数据库/扫描状态/发布/安装事务，不新增API/RPC。Root负责D0精准前缀提交、代码授权与最终验收；下面原三文档mixed正文和两mixed测试保持原bytes，不入本片提交。

<!-- END:T-K03.14-WEB-CATALOG-PACKAGE-DETAIL-DATA_MODEL-D0 -->

<!-- BEGIN:T-K03.14-WEB-SKILL-READ-CONTRACT-DATA_MODEL-D0 -->

## T-K03.14-WEB-SKILL-READ-CONTRACT D0：当前读取消费纠偏（2026-10-10；目标，待实施）

当前态为 Web main `2e69b3b63ad4ac935752e4ad0b69ee1ce964f564`；Root 正常浏览器 ListHubSkills/ListSkills HTTP200但严格解析失败。正式 BFF `939bf0e1da98a313233a923c6aa55481d06f5aca`、Public13.1机器契约不变（既有 canonical digest `418db9504b179d29113385f334628d304130491d4bbc86169e20c712cf2cd045`）。此片目标尚未实施/验收，下面既有设计前缀和 mixed 原正文全部逐字节保留；本片仅纠正现有 Skills 读取消费者，不增加 owner、协议、数据库或进程。

Web 无业务持久 owner，无新 SQL/schema/Redis/业务缓存/存储表；此次仍只是现目录与安装读投影。Skill series/revision/product/publication、安装 membership/enabled、owner tags、封面对象及短期 download handle 由既有 owner 管理。新增读取字段仅进入现页面内存 view model，未呈现的合法 metadata 仅参与 validator，不伪造字段/版本/发布者/使用次数。

Hub skillId 是 series identity，currentVersion.versionUid/详情 version 是 owner 当前 revision；两者不互换。封面 URI 来自 owner 且与当前 revision 比对，缺失时不发合成请求。downloadInfo 是已授权短期 handle，不持久化、不作为永久下载权限；GetSkill/DownloadSkill 返回 skill.id 须匹配请求 series，原 onAdd/onTry 和下载动作语义保留。

安装记录存在/added 与 enabled 分开表达：禁用不等于未安装，official 目录 added 不能覆盖本人禁用事实；任何缺失/矛盾 identity 或类型不被浏览器补造。apps 为目录当前 owner 分类之一，不借目录读取扩大 mutation 输入或授权。所有观察跟现页面生命周期，刷新仍重新取 owner 响应，不新增 localStorage/数据库/权限缓存。

本片新前缀之外原 mixed 正文逐字节保存，原两 mixed 测试不动；纯门、真实浏览器、系统全门由 Root 分别记录，目标不冒称实测。

<!-- END:T-K03.14-WEB-SKILL-READ-CONTRACT-DATA_MODEL-D0 -->

<!-- BEGIN:T-K03.14-WEB-PUBLISH-DATA_MODEL-D0 -->

## T-K03.14-WEB-PUBLISH D0：版本观察、冻结意图与刷新恢复（2026-10-10；目标，无新增持久owner）

当前Web `3c59071d8188f025b3d7b7683bb2d8560ceaa0fa` 发布Dialog只在React生命周期保File/key与阶段ACK，刷新丢失；无CAS/对象版本完整消费。目标承接BFF批准设计 `8889701` 的public13 mandatory完整链；正式实现SHA/artifact digest尚待Root固定，目标尚未实施。此前缀覆盖本发布/恢复目标的旧零body/七字段/恢复描述，原三mixed正文逐字节保留，不据旧设计宣称当前能力。

| 事实/状态 | 唯一owner与生命周期 |
| --- | --- |
| Skill/series/revision/status/publication audience、state_version、attempt/epoch、validation/manifest、幂等receipt/锁内CAS/event | Platform唯一持久writer；BFF当次IAM授权与精确public投影。Web不复制业务表或授权事实。 |
| 原ZIP/SKILL.md字节、Upload/Asset/ObjectVersion、扫描/对象健康 | Storage/ObjectStore owner；source_version_id来源只为实际PUT ACK或正规owner已完成readback。hash/ETag/upload ID不替代版本。 |
| 当前观察 | Web当前页面内存保存owner ACK/Get的真实state_version及资源身份；signed64 CAS与unsigned64 epoch分离，不自行递增/从revision推算，不成为持久事实。 |
| 单阶段命令意图 | 首次发送前独立冻结完整原body/CAS/key、resource/attempt/upload/hash/source version与可信subject/admission generation；当前mounted session内存保存，不因后续GET/ACK变化重建旧请求。 |
| File/短期PUT reference/版本ACK | 仅当前页面意图内存；离开/刷新不持久signed URL/原bytes/对象凭据，不跨主体移用。 |
| 发布UI结果 | 只依据严格ACTIVE ACK或当前本人managed权威读核验同资源/版本/发布意图；uploaded/clean/validated、安装状态与旧catalog均非发布证明。 |

无Web业务SQL、canonical schema、migration、索引/事务、业务Redis key/namespace、receipt/outbox、CAS/权限缓存、跨owner JOIN；现HttpOnly Product Session身份边界不变。不给localStorage/IndexedDB/sessionStorage保存signed URL、secret/bearer、File bytes、对象凭据或第二业务状态机。恢复不新增Web持久owner，仍由owner持久draft/attempt/receipt状态重新观察。

### 原意图未知与页面刷新必须分开

当前页面未知ACK保原阶段body/CAS/key，当前IAM重验后再交owner重放；GET版本前进只说明可能已提交，不许可原key更新CAS。cancel/timeout/坏ACK/迟到不表示owner回滚；subject/generation切换退役所有旧回调写权，恢复读取/PUT也有界可取消，旧结果不触发新命令。收到并严格核验的成功ACK才成为下一独立意图的版本依据。

刷新后通过本人managed draft list/detail选择真实持久draft，再读package-upload，核对skill/series/revision/phase/attempt/epoch/state_version与所有已公布证明。uploaded/validated沿owner已完成事实核验，只有具备该阶段真实资格才继续后继新意图；不能把Get合成为原Validate/Complete ACK。丢原key/body时不宣称重放、不自动创建新Draft或Publish key。丢Publish ACK/key先权威managed读取判断ACTIVE，未知显示未知。

intent/upload_pending缺原PUT证明不可盲续短期URL；用户显式重选File、重算hash/size并观察真实当前attempt后，才建立新的replacement意图、新key、冻结当前CAS与replaces_attempt_id。对象version不能用时间/随机值/null/current对象猜测补齐；uploaded/validated能使用的版本只来自owner正规已完成读回。刷新新观察、同页原intent重放、显式新replacement分别建模，后者不伪装前者。

本D0不迁移/重置PG、Redis、MinIO，不恢复旧数据，不整包复制分叉release c9b02b6，不改变原Admin基座。后继代码/测试需证明缺/坏CAS、异body同key、未知ACK与撤权/取消、缺PUT版本、refresh owner-state恢复、explicit replacement和ACTIVE判定；零schema diff只证明无持久化变更，不替代真实发布/浏览器验收。当前阶段未执行应用门、schema或服务命令。

### 正式目标 pin 与本人读取闭集（2026-10-10）

正式 BFF public 13.1.0 为 `2f3678736287241bbe620e087ab3b0da95fd2fb8`，canonical OpenAPI SHA-256 `418db9504b179d29113385f334628d304130491d4bbc86169e20c712cf2cd045`，136 个 operation；URL 仍 `/v1`。本片消费者从该正式 commit blob 原字节生成只读 snapshot；13.1 仅补实际命令授权链 403 `skill_forbidden`，Get/managed 不扩该错误，授权路径不变。此为批准目标引用，不代替 Web 当前工程门、真实对象链或浏览器验收。

本人读取唯一 browser-private 路径为 `/api/hub/self/skills/managed?status=draft|active&limit=...&cursor=...` 与 `/api/hub/self/skills/managed/{skill_id}`，分别精确映射 `/v1/self/skills` 与 `/v1/self/skills/{skill_id}`；static managed 优先，GET-only、闭集 query、重复参数/未知参数拒绝，detail 禁 query。正式 owner 已移除旧 `/v1/skills` list/detail，故本片删除对应旧 private published 路由、旧七字段 wire/schema/ref；本人已发布读 managed `status=active`，草稿读 `status=draft`。目录 `/v1/skill.list` 独立，不能代替本人事实；无 alias/fallback。成功与错误严格保留 managed `meta.request_id`，同 header 绑定。没有 package phase/hash/receipt 的 managed read 必须继续 GET package-upload，不合成字段。

当前安装消费者同片精确对齐正式 SkillInstallation 19 properties / 16 required，list/get/三 mutation 复用严格当前 resource、optional publisher/update 与真实 product 字段，完整保留 installation/source 身份绑定、原 body/key、状态与错误 family；403 skill_forbidden 仅三 mutation，list/get 不扩。不得省字段、passthrough 或把 HTTP 安装回执当浏览器成功。

<!-- END:T-K03.14-WEB-PUBLISH-DATA_MODEL-D0 -->

## R256-ADMIN-01：Web 管理员投影数据边界（目标，尚未实施）

Web不拥有管理员资格表、grant、版本或Audit事实，也不新增数据库、localStorage、cookie、Redis字段或全局浏览器store。IAM User是 `platform_admin` 的唯一持久owner；BFF `/v1/me`只发布当前受信投影；Web只在一次受控读取生命周期内持有 `{ tenant_id, user_id, platform_admin }`，并把 subject/generation/admission 与该结果绑定。

`false` 是普通用户合法当前事实；pending/error不得伪装成false后开放后台。撤权、Session重核、退出、A→B/null、generation变化或读取失败立即清除旧true与私有页面数据，迟到ACK不能复活。刷新后重新fresh读取，不从旧页面、JWT/email、Team角色或缓存恢复。Web normal切换必须等待IAM两列的正规有数据演进与三仓strict版本同步；不得通过reset、临时ALTER、默认管理员或兼容双读补洞。

因此本切片无canonical schema、事务、索引、retention或跨owner SQL变化。后继测试的数据oracle是“普通用户零后台读取/写入、管理员仅在server gate后发起已授权owner请求、撤权后零新私有读取且旧投影退役”；页面隐藏和fixture true都不算owner授权或用户E2E。

---

## R257-MCP-WEB-D0：本人 Connection 页面无持久化事实（2026-10-06；仅设计）

Platform独占Connector、Connection、current authorization与Server；BFF只发布当前本人投影。Web不新增数据库、表、SQL、Redis、localStorage、IndexedDB、cookie字段、离线cache、receipt、outbox或同步store，也不复制owner eligibility。Server declaration不是本人Connection，旧Server read/shape不得保留为fallback。

唯一瞬时状态为当前已准入actor marker下的filter tuple、opaque cursor历史、当前page及loading/error generation。filter、actor、Session admission、重试、卸载变化会取消/退役旧读；不得跨actor复用page、empty、cursor或错误。浏览器刷新必须从BFF/Platform重读current事实；多页不是跨请求数据库snapshot，撤权可使后页或刷新变化。

六字段只用于strict传输投影，不要求六字段全部成为主视觉内容；主Card只显示provider与人类可读连接状态，opaque ID仅为次要详情。Web不持久保存URL、secret、headers、provider credential、scope、proof、工具清单、permission、declaration或授权缓存。active只描述owner本次合格投影，不证明Agent invoke权限、第三方帐号、计费或后台管理员资格。创建/授权/enable/invoke/revoke仍是独立owner命令与验收，本D0不创建其本地状态。browser client的10秒总deadline与1MiB body cap只约束单次内存读取，不形成缓存或持久事实。

本片不改任何source/schema/机器快照。未来固定BFF artifact后，contract/client/adapter/component测试证明消费边界；最终Root用正常Session A/B及owner真实Connection/撤销/分页/硬刷新验收。只有empty而无合法positive不能关闭用户连接旅程。

<!-- R257-MCP-WEB-D0-DATA-END -->

## T-C01.R255-PRESET-RETIRE（06:12）：唯一 model-only 浏览器偏好目标

本前缀记录实施前的 D0 收口：冻结时源码仍为 model+agent strict 偏好，下述是当时裁决的实现边界，现已完成 model-only 源码静态退役，原数据模型全文保留。Root 已实际观察 workspace、Settings、hard refresh 零旧 agents 请求与 models 200 真空目录（不是模型可调用、切换保存用户链通过）；最终工程 65531 仍在运行，实际当前验收见 docs/CURRENT.md，不预报最终工程或整组 PASS。

### 持久化 owner 与零数据库影响

Web 无 SQL 持久化 owner。本片没有数据库、表、索引、migration、跨 owner 查询、事务、权限、token、HttpOnly cookie 或 service identity 变化；BFF durable Message/idempotency/trace 与 Agent Run/Feature 事实均不迁移。公开 MessageCreate.agent 仍属于 BFF 合同，本片不删除其历史 durable 内容。

唯一受影响对象是现 src/ui/settings/chat-prefs.ts 的非机密本地 UI 偏好，继续使用 key kokoro.web.chat-prefs 与现 createPersistedStore；不新 key、不扩公共 store。目标唯一 schema 为 z.object({ model: z.string().nullable().optional() }).strict()，仅 model 可选字符串/null，省略或 null 按现规则跟随空间默认。

### 无旧数据兼容的确定语义

1. 删除 agent 字段、readChatAgent/writeChatAgent 及全部 preset 状态/生产者；不建立 legacy schema、alias、双读或自动迁移。
2. 旧 JSON 即使含合法 model，只要同时有 agent（含 null）或其他未知键，就整体 strict 失败；现 store.read() 返回 null，模型偏好回默认。这是用户明确接受的失效重置边界，不承诺挽救旧对象里的 model，取代 0522 调查的清理兼容建议。
3. 失效重置指消费结果为默认，不要求额外 removeItem 或后台改写旧 raw；下次用户正规选择模型由现 writeChatModel 写入唯一合法 model-only 对象。没有“读旧 model 再修复”的隐性迁移。
4. 正常新 model-only 对象继续保存、刷新读取、null/缺省默认；坏 JSON、非对象、错误 model 类型、未知键按现 store 校验失败语义处理。不会因删除 preset 而禁用或清空合法新模型偏好。
5. 不清理其他浏览器数据、draft、conversation index、rail preference、Skill 或 MCP 状态；不改变已确认主体边界。新提交不发 agent，已有进行中 pendingSubmission 的冻结及 unknown-ACK 重试机制保持，不引入持久请求迁移。

### 后继数据与用户验收

在现 settings-modal / app-frame.smoke 测试补旧 {model,agent}（含 agent:null）整体回默认、新 model-only 选存/重新挂载读回、写出对象精确只有 model；保原模型保存反馈。engine / execution-adapter 保有效字段和同 key/body 重试全等，不把原有效 retry 断言删除。公共 MessageCreate 可选 agent 的接受断言仍在现 contract/api-contract.test.ts。

Root 正常浏览器：打开工作区与 Settings 无旧目录请求；新模型偏好保存后 hard reload 仍读回，旧形状明确回默认；单独核模型/Skill/mode 与重试 body，Agent connection setup 入口/独立合同不被误删。这里没有真实模型、资金或完整 Agent setup 验收结论。本轮没有生产/测试/Schema 写入或执行门禁，后续由 Root 按阶段准入。

---

## T-P02.R255-WEB-NEXT：ScheduledTask next 投影模型（源码候选；无 Web 持久化 owner）

固定前置为 BFF local immutable artifact：commit `45e67f0e783fb4bcdb086665a09b7c3c5fadbb6f`（源码父提交 `e603bd55`）、canonical `contract/openapi/v1/openapi.yaml`、Git blob `1b42d49388ca26eaaef7371daf23cbf1158d5fe6`、public `8.0.0`、全文 SHA256 `0802a31f9469a17cd8fc8b78e6d2326e0571bc93f3ac8d19811a42a1b185df95`。Root 本地交接 commit 为 `ef2d306`；该 artifact 尚未 remote push、registry 发布或 normal BFF/schema 激活，因此这里只记录本地发布接收与消费者候选，不冒称线上或当前正常服务已经生效。Web 冻结基线为 `97a79d45f93a6007fb0f37002372fd503cd0d373`。

Web 不拥有 ScheduledTask、Schedule、Occurrence 或 recurrence anchor 的持久化事实，不新增 SQL、Redis、cookie、storage schema 或第二任务模型。BFF wire `next_run_at` 必有且为 `string | null`；其余 owner required 字段也在 wire schema 必有。Web live mapper 总是建立 `nextRun: string | null`，而 preview/controlled record 为维持现生命周期仍允许 optional；字段缺失是 contract parse failure，null 是合法 owner 状态，string 是已确认 UTC instant。

映射只在 strict parse 成功后建立：null 原样保留，列表无 `<time>`，`scheduledDateKey` 接受 null 并使日历跳过；string 原样保留并由既有 formatter/grouping 读取。页面不从 frequency/time/timezone/当前日期重算 next；`nextPreviewRun` 只属于未保存 preview。`recurrence_anchor_at` 是 create/PATCH 可选 wire 输入，不是页面显示事实；现 editor 无显式输入，故省略且不新建 draft/store 字段。

恢复边界仍是 owner 再次返回 string 后才恢复列表时间与日历 event；paused/null 不保留推算 event，缺字段不降级成 null。无 DB/schema/cache/事务变化；正常服务与真实页面刷新链尚未验。

---

## T-B03.R255-WEB-CREDIT：当前消费者源码候选（待Root集成与真实用户验收）

当前切片只消费个人可用余额/预占及owner journal，不再读by-model或推导Free、每日赠送、quota、低余额阈值。固定BFF `97a99d35c8c78e7ca6e1370fd16ba5d670766095` / public `8.0.0` / OpenAPI全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`，owner正式blob原字节复制，现两个generator正规派生；不双读旧wallet。

现 `/api/session/billing/summary` 与 `/api/session/billing/ledger` 复用可信session adapter。strict closed账户/流水data保十进制字符串、BigInt显示尺度10^6与owner UTC Z瞬时点（按用户locale/本地日历展示），disabled展示owner只读值；404/503是error而非零余额。每读10秒总预算覆盖headers/body/parse、真实abort及reader释放；mounted panel独立loading/error/ready，刷新撤旧投影，分页单flight、显式同cursor重试、null终页、重复cursor拒循环与journal去重。现主体marker仅退役结果，不赋权限、不建第二store。

Account与rail popover未知套餐均占位，保身份/订阅入口及原布局；preview仅显式fixture，不是live失败fallback。此节覆盖下方历史消费者状态，原mixed正文不修改。三面D0已批准、D1行为反例已由Root复跑；当前生产/测试候选待Root工程复验、独审与提交。真实Billing账户200、余额/流水翻页/刷新/跨主体浏览器验收尚未执行，正常503退出loading不证明资金旅程完成；70组台账不虚增。

---

## T-B03.R255-WEB-CREDIT-D0：个人余额与流水（Root批准设计前缀，生产未授权）

本节覆盖下方历史个人余额/quota/free/by-model消费者描述，不覆盖任务外mixed内容。阶段为D0三面设计收口，尚无生产、测试或生成修改许可，不以文档宣称页面完成。Web基线 `e8ff7599a62b045b0e7a3d20e8fd50894b31a099`；固定前置BFF正式commit `97a99d35c8c78e7ca6e1370fd16ba5d670766095`，public OpenAPI `8.0.0`，源 `contract/openapi/v1/openapi.yaml`，全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`。不可沿mutable main、旧f3c64d90 snapshot或旧wallet shape双读。

Root正常HTTP证据：正规IAM登录后 `/api/auth/session` 为200/authenticated；真实 `/api/session/billing/summary`、`/api/session/billing/ledger?limit=50` 均503 `billing_unavailable`、private/no-store且带request-id，当前Billing正常入口尚未启用。`/api/billing/me/*`不存在，其404不是缺账户业务证明。新合法200与旧Web schema不匹配属于已核静态消费者缺口，尚未取得真实账户200或Credits浏览器失败/成功证据。70组11通过/6失败/14待复测/38未验/1支付后置不虚增。

### 事实owner与瞬时视图

Billing唯一拥有CreditAccount/Ledger/Metering与持久资金事实，BFF只固定本人projection，Web没有SQL、账本副本、新cookie/Redis/认证store或余额写入。现HttpOnly Product Session/IAM仍唯一身份准入；现browser主体marker只作异步结果退役判断，不能成为权限证明或传给owner自报主体。

目标个人余额/流水只mounted ephemeral状态：controller/attempt序列、初读/刷新状态、已验items、opaque下一cursor/分页错误与单flight。退出固定module SUMMARY_KEY/BY_MODEL_KEY个人余额cache以隔离preview/live/新主体，不新第二钱包cache或通用generation框架；卸载、主体改变、撤准入和新attempt使旧读取与迟到completion失效，不向新主体写或展示数据。未知身份不使用旧缓存，storage访问异常沿现准入fail closed，不新认证fallback。旧本地draft/Conversation/Run事实不因账务错误修改。

### 金额/序号/时间/分页规则

- available_micros与held_micros分别来自owner完整原值，不相加造total，不按余额反推免费额度、可用资格或owner策略。disabled可读真实值；缺账户404与合法0余额不同，无ensure/refresh/grant副作用。
- journal_id作显示身份；items保owner顺序，sequence精确decimal string不可浮点排序。页边界重复项不重复累计；重复/无效cursor进入明确分页错误，null终止，不把owner cursor拆解或造第二cursor。只已验页进入UI，失败保原已验页/原cursor可显式重读；新refresh从首页重新读，late页不追加到新数据。
- 金额显示沿BigInt/十进制移位：1Credit=1000000micros，one-micro/大数/负delta正确；购买币种minor formatter不与Credit混算。历史趋势Number仅几何，按日net BigInt仅已读ledger显示汇总，不能代表全账本/重新计算available或费用。
- created_at保ownerUTC Z瞬时点；展示按用户locale/本地日历分组，不将wire改epoch-ms或乘1000。source_kind/source_ref安全显示，不创建Conversation/run/title映射或绑定实体。

不持久化quota/free/daily/默认Free/by-model衍生事实，不新增SQL/schema/storage/API字段。固定public snapshot及现正规generator来自已发布BFF commit/version/full digest，不能手改generated或新建Billing SDK；三文档原mixed全文作为suffix精确保留。

### 阶段与恢复验收

当前D0前缀而已，生产与测试/生成另等Root授权；后继有效parse/组件RED→Root重跑→局部实现/生成/独审/工程门→真实正常IAM/BFF/Billing用户余额/流水。初读timeout/body坏shape/取消和账号切换零旧数据、刷新失败非旧ready、分页Retry同cursor/无自动写均有有效行为反例及实际浏览器验收。真实非空账户/journal必须既有正式owner授权入口建立，不能SQL注资或虚构fixture充页面成功。HTTP session200/two reads503只证明当前正常source路径和未启用Billing状态，不是整页PASS。原70组/费用/模型/支付与赠送状态保持。

---

## R254-FOLDER-LISTS：专案嵌套与普通会话常驻（Root批准，2026-10-05）

没有新增SQL/schema/关系表/Redis/browser storage/缓存事实。项目与会话归属仍BFF Conversation nullable project_ref；未发送local草稿不伪持久会话。mounted展开Set、组list状态与分页generation仅UI实例生命周期，身份变化退役；折叠卸载后再展开重新读第一页，不承诺记住页码或持久化目录树。

现browser Conversation索引只有ACK后按来源scope精确退役的投影，不是真实归属。复用既有coordinator单槽意图与scopeVersion，不复制operation/receipt/owner表，不预取折叠目标。各组verified subject/admission/scope/实例及page cursor隔离，撤权及时隐藏旧私有行；延迟GET/分页/rename/delete/Move不得写入新主体或scope。列表渲染无模型调用/费用操作/新Run，原草稿、消息、Run、checkpoint与存储生命周期不变。当前只有目标D0，尚无R254源码实施或页面PASS。

---

## R252 匿名首页输入回归修正（Root最窄补充裁决）

审查发现现stashPendingDraft把匿名首页提示混入未标主体的localStorage全draft map；首次verified准入清旧map会丢有效输入，直接保留未知map又会泄露旧主体草稿。选择保留原首页业务、分开显式用户本次登录输入：仅现use-draft的专用stash/consume与现landing开始动作创建一次性sessionStorage prompt handoff，不新增目录/认证cookie/URL参数/认证实体，不改Skills正常stash。现page-clients在verified identity/竞态fence成立后先清未知或跨subject旧map，再严格消费并仅预填__pending__；同subject保完整map但也消费本次显式输入，绝不自动提交。

handoff是closed [1, created_at_ms, trimmed_prompt]，300秒以内且非未来、非空、最大65536字符；这是本浏览器交接的新增有限输入防护，不冒现API已有限制。首页现Textarea同maxLength，空白开始也清旧handoff；consume先remove再strict校验，无效/过期不恢复、不fallback旧pending。恢复写必须严格storage set而非吞失败的persisted-store helper；任何storage失败不更新marker、不admit。普通tab隔离仅按sessionStorage语义，duplicate/window.open可能继承初始存储，不宣称防复制；无论如何只预填而不执行。权限仍来自正式session/BFF，不由prompt证明。

方案比较：淘汰废止首页草稿（有效业务回归）；淘汰marker-null保旧map（未知主体泄漏）；采用现draft职责内单次显式prompt交接。原9源之外仅追加现use-draft.ts、landing-page.tsx，现tests/ui/use-draft.test.tsx、landing-page.test.tsx及已准入page-clients测试；同仓原writer，Root三D0与Git独占。先现测试证明首次verified准入丢本次输入，再实施；所有旧actor数据/异步race/清理失败断言保留，最后独审与Root真实首页输入→登录→只预填验证。

## R252-WEB-AUTH-RETURN：既有事务绑定目标（2026-10-05；Root批准D0）

Web不新增SQL/实体/角色/cookie。现origin+state digest Redis key仍NX/TTL300/GETDEL，record收敛唯一新closed version tuple包含validated target、原cookie绑定及authSecret HMAC（固定provider/callback/绑定/target整体）；严格长度/字段/target验证与constant-time比较。consume成功返回target，其他null；无旧digest fallback、无state双读/额外mapping，未完成旧flow正常拒绝后由用户正规登录，不清共享Redis。

现browser verified-subject fence仍唯一marker owner，不把明文subject写入state或draft新key；在确认subjectchange且runtime admission之前同步清localStorage kokoro.web.drafts、sessionStorage kokoro.web.pending-project-draft:*及kokoro.web.pending-creation-intent，同subject刷新保持。若storage异常，保守不admit，不跨账号暴露草稿。原四mixed全文仍保护；实现/真实用户验收尚未完成。

## R251-WEB-SKILLS-V2：无新增事实（2026-10-05；实施准入）

仅消费者wire identity值域与固定contract provenance改变。Web无SQL/Redis/cookie/localStorage/IndexedDB/新receipt或ZIP身份映射；manifest、scan、draft、release/install仍属于Platform/Storage/BFF既有owner。现一次File/key/attempt/unknown意图仅瞬时UI，账户切换fence和ACK后权威GET保持。不复制owner ZIP解析，不持久化旧新映射、不后台造包，不改auth return/业务归属。当前三D0只prefix，原mixed全文保留；实现与用户验收待后继。

## R186-W-SNAPSHOT-DEADLINE：仅mounted读取生命周期（2026-10-04；tests-first）

10秒snapshot总预算、AbortController、开始时刻与分页累积仅属于当前mounted engine generation，不持久化。完整snapshot与全部process页严格校验前不写thread、cursor、Run、Message或Conversation事实；timeout/dispose/scope切换丢弃临时累积及迟到回调。草稿与本地Conversation索引不因超时删除，显式Retry仍从owner snapshot重建。无localStorage/IndexedDB/SQL/Redis/schema或retention变化。

## R177-WEB-PRD-NO-INTERSTITIAL：删除临时导航失败状态（2026-10-03；tests-first）

目标态删除mounted `anonymousNavigationFailed`、10秒timer与可见Retry投影；只保留当前component instance的一次性native navigation guard，不持久化、不跨document。data-free booting、Product Session、OIDC state与IAM登录事实owner均不变；测试beacon只保存于隔离fixture内并只含phase/boolean，不成为应用receipt或第二身份事实。

## R175-WEB-ANONYMOUS：无新增数据事实（2026-10-03；tests-first）

anonymous时复用的booting composition仍只存在于当前React树，不保存subject、session、claims、Conversation、draft或navigation receipt，不写cookie、Redis、localStorage/IndexedDB。browser probe仍是撤权事实源；serverAdmitted只允许选择安全壳，不能恢复Runtime权限。测试beacon是隔离fixture的闭集观测，不是应用数据或新协议。

## R173-SERVER-ADMITTED-SHELL：无新增事实（2026-10-03；tests-first）

`serverAdmitted`与`booting`只存在于单次RSC/render composition，不写数据库、Redis、cookie、localStorage/IndexedDB、server cache、receipt或auth index，不跨reload恢复。booting subtree不mount任何data controller，因此不能读取旧Conversation/draft或创建owner请求；Product Session、subject、generation/tombstone与expiry仍由现owner及正式probe拥有。probe成功才mount Runtime；unavailable销毁booting presentation，anonymous撤权则保留无数据booting presentation等待native sign-in，二者都不采纳旧主体投影。

## R170-W-MOVE-UI：仅mounted intent（2026-10-04；候选已实现，发布待 Root 集成）

Web不新增schema、Redis、localStorage/IndexedDB、receipt或Conversation归属缓存。唯一新增内存值是mounted engine的nullable frozen Move intent：canonical session、target Project或null、稳定command identity、`pending|unknown`。它不跨reload恢复，不成为owner事实；confirmed/rejected释放，unknown只供用户显式同值重试；无intent retry返回null，不制造空session/target/key记录。ACK前及失败时ConversationStore、draft、thread、Run、Message、cursor和scope均不改；ACK后target membership仍通过owner snapshot/list读取，不把receipt写成假列表项。

旧scope stream释放不产生cancel；已准入Run继续由owner事实与target-scope replay观察。matching ACK先把当前意图结算为durable confirmed，再由generation/view fence限制导航、错误和焦点投影；同scope来源owner GET不受旧UI projection否决，并以canonical membership更新view cache。503与409 `idempotency_in_progress`不代表未执行，保留同一`sessionId/targetProjectId/commandId`为unknown供人工恢复。全程不保存target副本、不创建第二binding truth、不改变Conversation/Message身份。cache storage/observer异常仍fail-contained。跨scope unknown/late ACK、route未dispose与blocked-storage硬刷新归W2 OPEN。

R195-W2把上述瞬时intent改为当前document内、verified subject绑定的单槽Move command，而不是mounted engine字段。槽只含subject、epoch/slot identity、canonical session、target Project或null、稳定commandId/body、`pending|unknown`及必要的Promise/AbortController/subscriber；不保存owner binding、Project membership、Conversation/Message副本或第二receipt。scope engine dispose只移除subscriber，不能清槽或中断仍在10秒client预算内的请求。matching ACK当下按source scope+sessionId精确evict已有内存/持久browser Conversation索引并释放command；随后只保留source/target有界per-scope version，version与实际request generation共同保证不采用pre-ACK inflight。不存在等待GET消费的per-session token、队列、map或journal，因此连续confirmed Move不会覆盖遗漏前一session；target membership仍只来自fresh owner GET，其他scope缓存不变。

unknown不设后台timer、轮询、自动POST或无限队列，只能由原verified subject显式同key/bodyRetry。可信anonymous、subject change、logout、pagehide和document teardown先递增epoch，再清槽/subscribers并abort pending；所有迟到callback须匹配slot/epoch/subject，abort rejection不得复活状态或invalidation。普通effect cleanup/StrictMode replay不清槽；temporary unavailable只suspend start/retry，同subject pending可结算，恢复不自动重发。command槽与per-scope version不写新的localStorage/IndexedDB/Redis/SQL事实、不跨reload恢复；既有browser索引的best-effort写失败仍保持confirmed，当前document内存eviction继续隐藏source，blocked-storage硬刷新仍无恢复保证。后继实现必须删除engine内旧Move intent/retry/confirmedActiveMove双轨；machine只保不含target/command的通用local cache reconcile，不能把page槽与engine槽并存，也不能park engine冒充operation保留。

---

## R167-SERVER-FIRST：无新增数据 owner（2026-10-03；待 tests-first）

首文档 gate 不新增 Web 数据库、schema、migration、Redis key、browser storage、server cache、receipt或第二 session。它只读取现 HttpOnly Product Session 与现 Redis generation/tombstone，并检查 cookie claim 的 `accessExpiresAt`；可信事实和 retention 仍由现 Product Session owner路径维护。null/stale/tombstoned/expired 只驱动固定 `/login` redirect，不把 anonymous 写成持久状态；配置/Redis失败只形成当前请求的 fail-closed unavailable 输出。任何 claims/access/id/subject 均不得进入 RSC/client props、HTML、日志或 URL。

成功后的 AppGate probe、browser auth-index marker 与 Conversation cache 边界保持不变；后者不是认证事实。layout 的首次 document 判定也不是后续 client navigation、focus revocation 或 BFF admission 的缓存。旧 IAB 文档卡住与新文档真实恢复并存，本片不新增诊断数据推断旧文档根因。

---

## R158-W-MOVE-D0：Move client 瞬时数据边界（2026-10-04；候选已实现，发布待 Root 集成）

Conversation 的 current Project/direct 归属、Move idempotency receipt 与事务始终由 BFF 持久拥有。Web 第一片不新增数据库、schema、migration、Redis、localStorage/IndexedDB、server cache、第二 receipt或归属表；只在一次 client调用与operation-scoped同源投影中传递并校验：canonical `conversationId`、canonical `targetProjectId | null`、稳定 `commandId`，strict ACK 的 `session_id/project_ref`，以及 typed error的 owner code/retryable。请求身份只从 owner必需 `x-request-id` header投影，不伪造 `meta`。

`commandId` 绑定同一用户意图和 exact target；unknown 保留这组调用方意图才可能由后继显式恢复，本 client 不持久化、不自动重发、不轮换 key。只有 200 ACK 同时通过 closed schema、session identity 与 target equality 才向上返回 confirmed；202、非 200、错误/多余字段、错 identity/target、网络/timeout/abort 都不写 ConversationStore 或 project list，也不清 Run/Message/draft/stream。`null` 是正式 direct target，不等于缺失、空串或未知。

私有10秒预算与caller abort只终止本地等待：即使发生在headers后slow body或ACK parse期间，也保留同一`conversationId/targetProjectId/commandId`语义为unknown，不写本地取消事实。timer与listener只是单次调用资源，finally释放，不进入页面状态、storage或后继重放身份。
非法caller session ID、target或command key在owner调用前以专属`parse`失败结束，不携带owner字段、零fetch且不产生任何归属写入。

required `SessionClient.moveSession` 的 preview与通用engine fake只允许显式typed rejection，不创建receipt、修改preview `projectRef` 或提供optional fallback。当前候选已有R170 UI/engine调用该方法；调用参数与ACK只活在当前Promise/AbortSignal生命周期，unknown后的同键恢复仍由单意图状态机负责，owner binding仍只有BFF一份。

失败投影也不持久化：只有专属`ConversationMoveError`的`owner`分支携带完整validated status/code/retryable/requestId/retryAfter；network、parse、adapter、unsupported均为互斥本地分类且没有owner字段。下一片可据此把可确认owner拒绝与结果unknown分开，但不得把network/adapter失败推断为“未执行”或据retryable自动重发。

现同源catchall adapter只转发受信身份和owner wire，不拥有Move数据；R170候选的single intent、generation/dispose guard与来源view-cache失效也不持久化归属。原用户 `conv_ffd7` loading P0 与本数据切片独立保持开放。

---

## R143-W 会话删除页面内存边界（2026-10-03；限定实现与完整工程门冻结，实际发布以 HEAD/Root gitlink 为准）

Web 不新增数据库、canonical schema、migration、事务、Redis、receipt 或浏览器业务缓存。BFF 继续唯一持久拥有 Conversation 删除、share/stream 收口和 cancellation outbox；Web 只在 mounted engine 内保存一个瞬时 delete intent：exact `targetId`、当前 `SessionScope`、generation、pending 与安全 failure/unknown 状态。该意图不是 owner receipt，也不跨 reload 恢复。

ACK 前不改 `ConversationStore`，不清 active draft/thread/Run/staging，不标本地 cancelled，不刷新列表；明确失败或 unknown 释放 busy 但保留全部原事实并允许用户显式恢复操作。首片不以404或含混集合 read推断删除完成，也不自动重发。严格 200 `deleted` 后才调用现 `removeConversation`：非 active 删除保持当前 active，active 删除选择剩余第一项，删空创建当前 scope 的本地空会话；随后一次同 scope owner list刷新，不创建 Project 级联或跨 scope tombstone。

dispose、engine scope变化或较新 delete generation 立即撤销旧回调的本地写权；迟到 success/error/finally 均不得移除/刷新新页。若同一 engine 已切到别的 active，原 target 成功 ACK 只更新 ConversationStore 列表，不重建新 active 的 thread/draft/Run。single-flight 阻止同一 mounted engine 的重复删除。BFF ACK 后的 durable Run取消由 owner事务收敛，Web不保存 cancellation副本或发第二 cancel。当前 direct fixture 已验 ACK/503 边界；Project 与晚 ACK 的完整 real-UI、当前 IAB/真实 owner 仍待后继。

---

## R139 会话 UI 缓存边界（2026-10-03；Root 工程与限定系统验证通过，待 Git）

Web 仍无数据库、SQL、Redis 或业务事实 owner。`kokoro.web.auth-index-subject` 只是浏览器 UI 缓存失效 marker，不是 Product Session、actor、授权证明或跨设备事实；可信 `/api/auth/session` 结果才可驱动比较。相同 subject 的新文档保留 `kokoro.web.conversations.` 索引；不同 subject 清该 Web 自有前缀并更新 marker 后硬刷新。探针开始后的 marker 竞态或 storage 失败均 fail closed 并等待人工重试，不把新主体采纳进旧树。

该 marker 与索引操作不是原子的跨进程锁；多文档并发切换及既有 draft 跨主体暂态仍需真实系统验收。本切片不新增 schema、migration、API、事务、owner 数据或兼容轨。

---

## R137-E117 当前页面内存模型（2026-10-03；已验证候选待 Root Git）

当前候选已实现独立 `executionHead` 与 selected `executionProcess`：process 保存 exact run、`todos: null | ordered list` 与有序 safe activities；activity 按 identity 保首次位置并全值替换，Todo 全表替换，分页 cursor 仅存在于单次私有 hydrate 协调。snapshot adopt 不再合并旧内存 non-text process；scope/new hydrate/dispose 真实 abort 并以 generation 隔离迟到结果。Web 仍无数据库、schema、Redis 或浏览器业务持久缓存。

页面投影现分别选择最后真实 Message 正文与最后 safe process 作为 live 锚；空 TEXT START 已建立 Message identity 但正文仍为空时继续显示 forming，首 token 后才转 streaming。HITL preview 对同一 opaque activity identity 从 running 全值替换为 completed/failed，不把 raw 工具结果写回页面内存。Root Node22 `pnpm check` 最终全绿，且本地 preview 真实页面桌面/移动六节点全过；后者不证明正式 IAM、provider、Billing、真实 BFF HTTP 或所有用户能力闭环。候选尚未提交发布，旧 raw core schema/type/reducer/projection/cancel 数据形状清理仍待下一窄切片。下方 R135 是实现前历史数据设计。

---
## R135-WEB7-D0（历史设计门）：execution process 页面内存模型（2026-10-03；目标态）

BFF 继续唯一持久拥有 Conversation、Message、durable AG-UI ledger、snapshot/process projection；Agent 继续拥有 Run、Todo/activity source 与执行证据。Web 不新增数据库、canonical schema、migration、事务、Redis namespace、localStorage/IndexedDB 业务缓存、server cache、retention 或跨设备过程事实；因此无 `db:apply-schema`/fresh-install 变化。

Web 只在当前 conversation+project scope+hydrate generation 内保存两个独立投影：`executionHead` 和 selected `executionProcess`。process 由 exact `runId`、`todos: null | ordered list`、ordered safe activities、分页加载状态/安全失败组成；owner `next_cursor` 只在一次 hydrate 的临时协调中存在，不持久化，也不充当 AG-UI resume cursor。`null` process、`todos:null`、`todos:[]` 三者严格不同。

activity identity 是 `(runId, activityId)`，首次出现决定顺序，后续 source 值整体替换；不在浏览器拼 raw tool/subagent 数据、不保留旧字段、不构造 phase 状态机。terminal A 的 process 与 queued B head 可以并存；B START 后 owner 更新才整体选择 B。Todo 每次全列表替换，`[]` 清空；不会跨 Run/global merge。Message/UIMessage 文本、HITL、Delivery、failure、optimistic admission 与 process 分离。

hydrate 临时累积绑定 exact session、scope、run、watermark、generation；只在所有 anchor 页耗尽且严格校验后一次采用。401/404/400/503 不写空成功；410 删除整份旧 anchor 累积后重新 snapshot，有界失败。new hydrate、scope/conversation 变化、dispose 立即 abort 并清临时页；generation 检查使迟到成功、失败、finally 均无写权。reload 从 owner snapshot 重建，不以先前 live 非 text steps、localStorage 展开偏好或 preview fixture 恢复业务事实。

这与 TECH/API R135 一致：只有现内存 type/reducer/hydration/engine/UI 变化，条件性私有 `src/engine/hydrate-process.ts` 也只协调生命周期；无新 owner/API/schema。旧 raw tool/subagent shape、aliases 与 non-text merge 经引用证明后删除；纯 disclosure 展开偏好可保留但不得存 Todo/activity/cursor。当前仍是 public6 实现，后继 tests-first 才迁移。未决数据问题 0。

---
## R91-WEB-PUBLIC6：Conversation scope 数据边界（2026-10-02；正规生成 GREEN）

Web 没有 Conversation、Project 或 cursor 的持久化 owner，也不创建数据库 schema。BFF commit `bb610ea7262574772e1d8c309a6e03171d07d0a3` 的 public6（SHA-256 `75ef9f7a3b28018d9c7a3ca5899f75afe561dd40b794e7f71b0e3d078b29c129`）拥有 Conversation 与 nullable `project_ref` 关系、tenant/subject 可见性和集合分页事实。

- direct 是 owner 条件 `project_ref IS NULL`，只能由显式 `scope=direct` 请求；省略或空 `scope` 是全部 authorized active Conversations。
- 非空 `project_ref` 是 exact owned Project filter；它与 `scope=direct` 互斥，冲突先返回 `invalid_scope`/400，不用 Project 存在性改变错误优先级。
- cursor 是绑定原 filter 的 opaque owner 值。scope、project_ref 或其他 filter 改变时丢弃 cursor，从第一页重取；Web 不本地推导归属、拼接游标或缓存成第二事实源。
- resource route 的 project-bound authorization 保持原义；本轮没有 SQL、事务、幂等、缓存、retention 或 generated data model 变更。

---

## R79-WEB-PROJECT-D0：无持久化 owner 的创建上下文（2026-10-02；目标态，待 Root 门审）

与TECH/API R79一致，Web main `dc330a99332be28bb74a4fa2d2196ba8425f9dc5` 已发布public5消费者但未实现本片关联UI。本阶段仅五文档前缀，原正文及全部运行投影保持。固定BFF `479d4e8b0aeb438d2ec9cb3d4472130fc1a29972` / public5.0.0 / SHA-256 `3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b`，无新schema、数据库、事务或缓存owner。

### 唯一事实与暂态生命周期

| 对象 | owner/生命周期与约束 |
| --- | --- |
| Project、ScheduledTask及可选归属 | BFF唯一持久化writer；Scheduler拥有调度、Agent拥有Run。Web不写表、不跨owner SQL/JOIN、不复制关系表或BusinessStore。 |
| 创建上下文 | 现浏览器URL /app/scheduled?project_id=<exact编码>#scheduled-tasks/new；只表达personal/project/invalid创建意图，不是授权/Project列表/Conversation scope。缺省personal，重复/空/无效不fallback；query不进入上游POST。 |
| Draft/Record | 内部optional projectId，create body/owner wire optional exact project_id。草稿引用不证明项目存在；Record关联只从strict owner回执/读取映射，个人不存在该键。保持strict与无alias/no trim。 |
| 编辑目标 | owner task ID＋实例身份；Patch不含projectId/project_id，不能因URL上下文更改归属。新增create schema字段必须显式从派生PATCH排除。 |
| editor实例 | 上下文kind/exact引用/editing task ID或new的元组key；仅当前实例草稿、错误、保存状态、opener。切换清外层editing/prompt/opener，key卸载旧content；A→B→A或关闭重开均新生命周期。 |
| mutation intent | 现client内存Idempotency-Key/body fingerprint；项目字段参与身份。unknown显式原body同key恢复，网络结果不写持久缓存、不自动POST，不把导航视为owner撤销。 |
| owner列表读取 | 仍个人授权任务全集；成功且原实例仍当前时才GET。旧Promise不触发新context reload/loading/error/close，不本地插入任务。GET继续现requestSequence保护；404保草稿不reload。 |

不把项目关联、草稿、回执或command identity写入localStorage/IndexedDB/sessionStorage、新server cache、Redis、关系store或日志；既有preview fixture只显式preview，不迁入live。浏览器URL可保非敏感exact引用，身份仍由受信session/BFF决定；个人导航不继承最近项目。close保query及host history，只移除本editor hash/history标记；重新打开是新实例草稿。

### 删除/保护与验收

后继替换缺字段/漏位置身份/无项目创建上下文；不恢复Project preview合成ID，不做第二liveeditor、关系猜测、project_ref alias、双轨或旧数据迁移。R74 execution head/full-state/水位/receipt/control/FIFO、safe12/fingerprint、Team15/9、依赖/SQL/owner仓与Chat scope全部保持；新关联不是聊天Scope变更，也不声明Project专属任务过滤。

无Web持久化owner，故不存在本片canonical database schema、db:apply-schema/fresh install或跨仓事务门；不为D0创建空schema。机器契约已由owner发布且字节不变；运行时关联校验/mapper/PATCH与实例生命周期由TECH R79原15文件的真实RED→GREEN证明，当前尚未执行。Root独立门审及后继真实owner/browser/e2e验收仍未决；文档与hash保护不是功能完成证据。精确范围见TECH，actual当前阶段见CURRENT。

---

## R76-WEB-PUBLIC5：无持久化 owner，当前投影保持（2026-10-02）

Web main `28672f330df11cd55f7ff3f89f269acc3fe908cf` 的已发布 public4 会话/审批投影保持；本轮目标只消费已发布 BFF `479d4e8b0aeb438d2ec9cb3d4472130fc1a29972` / public5.0.0 / canonical SHA-256 `3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b`。原 R65/历史正文 byte-equal，版本现状以本节与 CURRENT R76 为准。

Web仍无业务数据库/SQL/canonical schema/migration/事务/Redis事实 owner，不建立空schema、跨owner JOIN或browser持久缓存。ScheduledTask/可选Project关联由 BFF 持久拥有，Schedule由Scheduler、Run由Agent拥有；public5的optional exact project_id不改变这些边界，也不等于Web会话scope/project_ref。现独立create Draft及UI没有project关联字段，本轮未新增该运行能力，不把generated pin当新业务writer。

现 execution_head、full interaction、普通process/Message、exact optimistic admissions、frozen control intent、connection/cancellation、opaque watermark/source position、安全失败与Artifact二元身份的内存生命周期完全保留 R74实现；本轮不编辑这些source/tests。公共 schema4→5 diff 仅 Scheduled create与版本，原 ChatMessage fingerprint、安全12 tuple及Team9保持。四当前设计面共同约束既有生成器和consumer graph tests；root资源/e2e未验不能由fixture GREEN替代。实际命令、文件集、未决能力和冻结证据见 CURRENT R76。

---

## R65-WEB-PUBLIC4-D0：无持久化 owner 的完整暂停与水位投影（目标态，仅文档）

本前缀与TECH/API R65构成同一方案；下方历史数据正文byte-equal保留，不作为旧active_run/逐工具暂停实施依据。Web main06a1c86612d9557d83081bcb67e8fc539ae7eacb仍旧public3 consumer；目标BFF已发布3c08a422f3a6aa3cf204c308716cfa64f6d61bb2/public4.0.0，OpenAPI SHA-256 5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6。本轮仅四doc前缀，source/tests/pin/generated/存储未改。

### Owner 与生命周期

Web无业务持久化owner：不建SQL/canonical schema/migration、不访问owner数据库或Redis、不把完整pause、groups、decisions、原args放localStorage/IndexedDB/服务端cache。BFF拥有授权RR head/最新full interaction/Message/Artifact/event_watermark，Agent拥有pause/消费/terminal；浏览器刷新只按owner snapshot重建，不从storage重播决策。现会话索引/偏好/路由生命周期保持，不能作为head/pause权威。

| 内存对象 | 归属与精确用途 |
| --- | --- |
| execution head view | 当前session的可缺失runId/state；仅源自validated snapshot/queued/START/full-state/terminal对账。queued不代表started，receipt不能把B替换A head；无head不制造空run。 |
| latest full interaction | 独立于SessionToolCall，保存run绑定六字段与完整groups/items/action_result、optional存在性；新interaction_revision整体替换，原序不merge。仅有active snapshot时不得伪造未知revision。 |
| ordinary steps/messages | 既有tool/thinking/subagent/正文事实保留；普通tool返回不能消费暂停，HITL不能伪造args/segment来塞进ToolCall。partial snapshot正文prefix与durable identity保持。 |
| decision staging | session/run/pause_revision/pause_ref身份下按item_id暂存；全集原序、五payload、allowed_decisions校验。新pause/集合变更清旧暂存；同run新pause也不继承旧项。 |
| frozen control intent | 原command key＋immutable完整body＋pause身份，网络unknown及合法same-key recovery保留；本地inflight仅防双发。ACK不删owner全集，不表示native consumption。决策value仅当前页操作内存，不日志/持久化。 |
| connection/cancellation | reconnecting/unavailable与Run phase独立；保partial、draft、Stop。当前会话cancelling待owner terminal；导航本地abandon与旧Run best-effort cancel分开，旧ACK不恢复新会话。 |
| cursor/source position | opaque resumeCursor独立于Agent numeric lastSeq；queued/dispatch BFF decimal sourceSequence保字符串。validated frame及revision guard成功才更新cursor；不由seq拼resume点。 |
| terminal/failure/artifact | 按exact run保safe12与unattributed历史失败，binary Artifact二元身份不改。interaction terminal不释放Run；Run terminal只收确切Run，新head不继承A pause。 |

session/run/generation共同保护late snapshot/control/stream callbacks；pause locator再保护同Run新pause。array顺序与字段presence参与完整state结构一致性；same revision同内容no-op，异内容/倒退拒绝，不能用JSON序列化丢undefined/presence或control optional-null规则冒充state等值。Web不产生第二control/state摘要协议。

### 一致性、恢复与隐私

- snapshot head/最新fullpause/Message/Artifact/watermark同一授权RR是BFF事务事实；Web一次成功响应整体水合，响应之间不宣称同RR。foreign/damaged/不一致JSONfail closed，不把parser失败补[]或改unknown为成功。
- waiting/resuming恰一完整PendingPause，queued/active无pending；resuming保所有groups，accepted/unknown只禁新key重复decision。waiting即使有上一轮action_result也不是已submitted。
- receipt ACK、普通工具返回或local timeout都不清pause；只有下一完整owner revision整体替换。native_consumed后非空仍waiting，空才active；validation_failed的新waiting显示owner安全code/path。
- 重连带当前已知full state作为decoder revision基线；解析/交叉约束/同revision一致性成功后承认cursor。坏帧不能推进已接受cursor；GC410 bounded snapshot-first重建四态，从非零event_watermark续接，不重POST用户/决定。
- A terminal与下一B queued跨批也继续drain；后继validated source或snapshot裁决新head。无head已结算会话关idle SSE；historical terminal只影响其Run，不能清当前B的groups/正文/cursor。
- full display只用name/description/editable/input_schema与optional preview/truncated/source/validation；不补旧private args/question/choices/risk/原submitted值。展示preview仍保source/truncation，不以请求摘要可见为由复制私有payload。
- 每次新/换/删会话、scope变化、dispose清当前浏览器pause/staging，禁止old ACK写新session；Direct/Project原scope/project_ref、Skill选择及pre-create-receipt冻结恢复不变。public4未给terminal retry，不持久化未来retry定位。

### 删除与验证范围

后继删除旧snapshot fields、逐工具pause_id/status/segment/risk/args投影、pending_tool_ids、decision tool_id/request_id alias、ACK本地rejected/清卡及runId-only intent；保普通tool日志、合法scope/隐私/失败/Message/Artifact能力。control.ts旧Agent RuntimeConfig/RunRequest等无人消费定义经引用证明才删，不凭“旧”删有效职责。

所有实际source/test/pin/generated文件及阶段命令以TECH R65精确枚举为准；不新增表/目录/持久化缓存。无Web db:apply-schema步骤，不能为文档门创建空schema。后继至少两group/多kind的完整决策、ACK→accepted/unknown→消费空/重暂停/validation、新pause迟到ACK、presence/null、bad revision零cursor写、非零reload/GC、A→B FIFO及Project/direct隔离，与原safe failure/partial/binary断言一起验。当前仅正文保护/hash/diff证明，不构成SQL、HTTP、真实Agent或浏览器GREEN。

---

# Kokoro User Web 数据模型与 Owner

## WEB-PROJECT-READ-R42：指令历史同代际收敛（仅设计与 RED，2026-10-01）

R40 原指令/历史局部 state 尚按 projectRef 隔离，未按身份读取代际隔离，且旧 PATCH 可在新身份 append 本地历史；这是未闭环 P1，
不是新的数据 owner。Project.instruction 与 instruction revisions 仍由 BFF 唯一持久拥有；不新增 SQL/缓存/浏览器持久数据。
后继正式指令复用当前 validated Project，历史是同 auth generation + projectRef 的独立 loading/ready/error 投影。
每次核验开始、身份/项目变化、登出及卸载即时清空并取消；detail/history/controller 与保存意图的旧结果均不得写回新代际。
保存 ACK 后当前仍有效才触发正式 GET 刷新；不以本地 Date.now/“You”合成历史 owner 事实。UI wire 映射只转换时间/字段命名。
现编辑器、历史 dialog 的本地输入/选择/错误/saving 属于相同 Project context，旧保存 finally 也不能清掉新身份 saving；
保留现编辑/历史/资源能力，不重挂 Chat。preview 本地记录继续在显式边界内，不能成为正式失败回退。
本阶段两个真实 AppFrame RED 与 canonical history fixture 保持原测试断言；源码待 Root 授权。

### R43 页面内投影候选进度（2026-10-01）

history/detail 共享 read key 并各持 controller；auth generation/subject/admitted/projectRef/preview 与不可用态决定 editor context。
换代同步隐藏旧指令/历史，取消旧 GET/PATCH；旧保存 scope 的 ACK 与旧 editor setter 均不能写新 context。
保存成功只 refresh 当代 GET，正式历史不合成；preview 的明确本地存储仍保留。没有 SQL/schema/事务/Redis/cache 或 owner 变化。
当前是 worker 源码候选，未据此宣称生产资源或浏览器隔离已验收。

## WEB-PROJECT-READ-R40：页面读取投影已实现候选（2026-10-01）

BFF 仍是唯一 Project 持久 owner；Web 没有数据库/新持久缓存。collection/detail 只保在现页面 hook 内，
分别控制请求，读取身份代际与每次刷新共同裁决写回；详情选择另有对象代际，A→B→A 不复用旧 A。
每次 session 核验开始立即撤销 admitted、换代、隐藏并清旧投影及取消请求；同 subject 再核验也重读；失败/登出/卸载清理。
成功 projects=[] 才是空态，错误/取消/未获身份不是空；canonical name/time 供正式详情，不合成作者或“今天更新”。
已有完整集合可复用详情，未在集合的深链才读取 detail；改 conversation title 不改 Project 身份。
创建成功只触发正式读取刷新；原冻结创建 key/name/draft、一次 handoff、SessionScope 与会话 rename 保持。
preview 不读取或继承正式投影。无 SQL/schema/Redis/localStorage/IndexedDB、新 auth wire 或分页事实。

生命周期与创建/会话回归已定点验证，候选待 Root 集成；下方 D0 保留为批准设计与历史阶段状态。

## WEB-PROJECT-READ-D0-R39：项目集合与详情只读投影（2026-10-01；未实施）

BFF 唯一持久拥有 Project 的 id/name/slug/description/instruction/时间事实；Web 只消费 public 3.0.0 固定 pin
（owner 293dfe7638e5dea0df2bee6dfdd8483b53fc9df6，SHA-256 acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b）。
Project、Conversation、ScheduledTask 身份独立；改会话标题、品牌、排序或草稿不会更新 Project。
本 D0 没有 SQL/schema/事务/Redis/持久缓存/localStorage/IndexedDB/新 auth wire；后继 plain files 见 TECHNICAL_DESIGN 同片。

| 页面内投影 | 生命周期与约束 |
| --- | --- |
| Project collection | loading → ready（非空/空）或 error。只有当代已校验 GET 成功才写入；不从 projectHref、会话清单、创建意图或 preview 合成行。当前 owner List 没有 cursor，零分页状态。 |
| 当前 Project detail | 按当前 canonical projectRef 与独立请求代际选择；集合已有完整 Project 时可复用，缺项的深链才 GET detail。A→B 立即取消/隐藏 A 详情，迟到回执不污染 B；404/403 不填品牌/通用名。 |
| 读取身份边界 | 唯一 AppGate 现在线 session probe 的受信 subject 与本地 generation/admitted，只决定页面读取生命周期，不作权限证据，不上项目请求 body/query。每次重新核验开始递增代际并清空项目投影，成功后重新读，失败/登出/卸载同样清空；同 subject 也不复用旧代际。 |
| 创建意图 | 继续现 use-app-frame-project 冻结 key/name/draft、同键重试与一次草稿 handoff。成功仅触发只读刷新；创建 ACK 不是已加载全集，不把未获 GET 的临时项目插进集合。 |
| 会话清单/草稿 | 继续现 direct/project SessionScope、generation 和 useDraft 分键；读取 Project 不重挂 Chat engine，不改变首条会话创建、URL handoff 或会话重命名。 |

不设跨用户/模块级 Project cache；controller 与内存数组都归本页面读取 hook，分别取消 collection/detail。
no-store、有界 deadline 与 generation 检查共同防止取消、重试、身份核验及切项目后的旧响应写回；授权仍由 BFF 每次在线验证。
现 useSessionProbe 丢弃 /api/auth/session 的 subject，只有布尔 pass，尚不能证明旧用户读取隔离；后继内部投影/装配必须补齐且经测试，
不能仅按 projectRef 当用户缓存 key。正式失败/loading 不回退 preview；preview 数据有显式 preview 边界，不持有正式 owner 身份。

待验断言：合法空集合不等于失败；错误不保留可操作旧项目；A/B detail 乱序隔离；身份代际变化时取消且清空，两次同 subject 核验
也不得接纳旧响应；会话 rename 不改变项目名称；创建 draft/key/handoff 与会话 scope 原回归保持。当前只有文档候选，无资源/浏览器证据。

## WEB-IDLE-TERMINAL-P1-R26：settled subscription 生命周期（2026-10-01；源码候选）

没有新增持久化事实。snapshot `active_run` 与本页 receipt run id 仍是 Web 可消费的可信 active identity；只有 identity 存在时才持有
页面内 events subscription。settled snapshot 的 Message、failure footer、watermark 与 copy 均保留，但连接视图为 connected 且没有
空闲 SSE 句柄。新 receipt 建立 run identity 后重新订阅，terminal frame 后释放。

queued reload 缺失 active identity 是 BFF 后继 owner 门；Web 不把 pending/streaming Message、正文、cursor 或 terminal marker 派生为
queued Run。无 SQL、Redis、localStorage、IndexedDB、schema、retention 或跨设备事实变化。

initial hydrate 与 create 并发期间的 pending submission、optimistic user 与 deferred exact receipt 仍仅是页面内存状态。snapshot
canonical user 以 receipt `user_message_id` 对账；snapshot 已含 receipt run 终态时 owner 投影优先，不把 deferred receipt 重写为 active。

## WEB-CONNECTION-R26：本地 timeout 与写闸（2026-10-01；源码候选）

`EngineSnapshot.connection` 的 unavailable reason 在 Web 内存中扩为 `network | http | parse | timeout`；`timeout` 只描述 reattach
观察窗耗尽，不是 Message/Run 状态，也不写 terminal map、machine error、持久 store 或 owner cursor。非 connected 是 engine 写闸输入：
拒绝新 message/resume，但不删除 draft、staged decision、partial、active run identity 或 cancel 能力。

切 conversation 重置为该新页面视图的 connected 初值并递增 hydration generation；旧 snapshot/control/create callback 不得写回。
snapshot-first reconnect 后只以 owner active/terminal/read model 更新线程。无 SQL、Redis、localStorage、IndexedDB、schema、migration、
retention 或跨设备事实变化。

未获 receipt 的 `pendingSubmission` 在同一页面生命周期额外持有 optimistic user id，只用于 owner snapshot 替换期间恢复 exact local
message，并在 receipt 后换成 canonical message id；它不持久化、不跨 conversation、不进入 wire，也不按 content 推断 owner identity。

## WEB-CONNECTION-P1-R25：实际页面内存模型（2026-10-01）

`EngineSnapshot.connection` 已实现为不落盘判别联合：`{status:"connected"}`、`{status:"reconnecting"}` 或
`{status:"unavailable", reason:"network"|"http"|"parse"}`。切换/新建 conversation 重置页面连接视图；snapshot-first 恢复受既有
session/generation 守卫保护。该字段不进入 Message、Run、`runFailuresById`、`unattributedFailure`、Conversation store、localStorage、
IndexedDB、SQL、Redis 或 server cache；reload 仍由 owner snapshot 重建业务事实。

reconnecting/unavailable 不改变最后可信 `thread`、owner watermark、active run identity、pending submission 或 terminal map。显式恢复成功
才用 owner snapshot 对账 thread，并只从其 watermark 续流；恢复失败保留 read model。没有 schema、migration、事务、索引、retention、
跨设备状态或 canonical data owner 变化。

## WEB-CONNECTION-D0：页面生命周期 connection availability（2026-10-01；仅设计门）

BFF 继续持久拥有 Conversation、Message、durable AG-UI ledger 与 snapshot，Agent/BFF 继续拥有 Run terminal。Web 只新增当前页面
生命周期的 connection availability；它不是 Message/Run 状态，不进入 `runFailuresById`、`unattributedFailure`、`runStatus`、
localStorage、IndexedDB、SQL、Redis、server cache 或跨设备事实。reload 后仍先从 owner snapshot 重建全部业务事实。

目标内存值使用现 engine snapshot 承载，具体类型名由代码审查收敛，但语义闭集固定：

| 输入/阶段 | 页面内存 connection 视图 | 不变量 |
| --- | --- | --- |
| snapshot 成功且 stream 已接通 | `connected` | 不改变 owner watermark、messages、terminal map 或 active identity。 |
| fetch 拒绝、EOF 后 transport 正按最后 cursor 恢复 | `reconnecting` | 是暂态 availability，不是 failed/terminal；保留 partial、Stop 与 copy。 |
| 非 expired HTTP、非 SSE、严格 parse rejection | `unavailable` + 安全 reason 类别 | 不保存 raw URL/body/frame/exception，不生成 generic Run failure。 |
| `event_cursor_expired` 后 snapshot recovery 在途 | `reconnecting`/recovering | 禁止提交沿现有守卫保持；owner snapshot 返回后整体替换 read model并续新 watermark。 |
| cursor recovery snapshot 失败 | `unavailable` | 保留最后已确认 hydrated read model；不把旧 terminal 移到尾部，不把 active run本地判失败。 |
| 显式 snapshot-first reconnect 成功 | `connected` | generation/session 守卫丢弃迟到结果；不创建 Message、Run、receipt 或新 idempotency key。 |

connection 状态与三类现有失败并列而不合并：

1. `runFailuresById[failedRunId]`：exact owner terminal；
2. `unattributedFailure`：真实但无 exact run identity 的 owner terminal；
3. `pendingSubmission`：未获 create receipt 的原提交意图/key/body；
4. connection availability：snapshot 成功后的 stream/replay 可用性。

只有第 3 类允许现有同键恢复；第 4 类的显式恢复只执行 snapshot/read/stream，不重新提交 user。第 4 类不得按消息文本、尾项、
`runStatus`、machine error 文案或历史 failure 推导 `failedRunId`。连接恢复也不得清理第 1/2 类；owner 后续 canonical completed/failed
仍按 exact run 更新 terminal map。若 unavailable 时 active run 仍存在，active identity 与 Stop 保留，最终状态等待 owner snapshot/frame。

安全诊断字段若获 Root 批准，只能是页面内存中的稳定类别、受控 status/code/request id；不得保存 response body、SSE data、cursor、
cookie、token、provider message、stack 或完整 URL。当前真实 HTTP/parse 子类未知，文档不预填值。无 canonical schema、migration、事务、
索引、retention 或数据库 fresh-install 变化。

## WEB-FAILURE-PLACEMENT-D0：页面生命周期的 run failure 索引（2026-10-01；仅设计门）

P1 候选已按本节建立纯内存 `runFailuresById` 与独立 `unattributedFailure`：前者只由 exact owner run identity 写入并按同 key
completed 清除，后者只保留无法归属的真实 generic。旧 `runError` terminal 单槽已删除，不双写；新 user/其他 run 不移动或清除
历史 exact failure。仍无 Web SQL/Redis/browser storage。

BFF 仍持久拥有 Conversation/Message/Project 归属与 snapshot，Agent/BFF ledger 仍拥有 Run terminal 事件。Web 没有数据库，且本目标
不新增 canonical schema、SQL/migration、事务、Redis、localStorage、IndexedDB 或 server cache。目标 `runFailuresById` 只是当前
页面的纯内存 read model，reload 时从 owner snapshot 重建，不能作为 owner receipt、授权或跨设备事实。

| 输入事实 | 页面内存投影 | 生命周期/禁止推导 |
| --- | --- | --- |
| final assistant record = failed，nonblank `run_id`，strict failure | `runFailuresById[run_id]={failedRunId:run_id, kind:"agent", profile}` | 从 snapshot 重建；不保存 raw message/stack，不从 code 字符串补 tuple。 |
| final assistant record = failed，nonblank `run_id`，无 failure | 同 key 的 `generic` | 只表示已确认失败；不猜 cancel/dispatch/provider 原因或 retryability。 |
| verified Agent/BFF dispatch live terminal | exact event run key 的 `agent` / `dispatch` | replay 同 event 幂等；不按当前轮、正文或尾项改挂。 |
| 同 run canonical completed | 删除该 run 的 failure | 只影响 exact key；不得清另一个历史失败。 |
| failed assistant 无 `run_id` | 独立安全失败投影 | 不用 `message_id`、数组位置或 UI item id 伪造 `failedRunId`。 |
| 未获 create receipt 的 frozen submission | 既有 pending intent/key/body | 与 terminal map 分离；同键恢复不是 Run retry。 |

同 run 多段 assistant 以该 run 最后一条 owner-ordered assistant record 决定 snapshot terminal view；因此早期 completed 段不会覆盖
后续 failed 段，后续 completed 也不会遗留旧 footer。partial/full/empty `content` 都只是正文，不参与失败判定。新 user 或新 active run
不删除已确认历史项；Thread 仅以 `failedRunId === turn.runId` 放置。Conversation 切换用新 snapshot 替换整个页面 read model，不跨会话
携带；Project 归属、ScheduledTask 与 Run 仍是独立资源，不建猜测关系。

安全值继续沿现有 closed `agent | dispatch | generic` 与 generated strict tuples。当前 `runStatus` 可保留为机器当前相位，但不再作为
历史 footer 的归属事实。没有发布 terminal retry/queued 模型，也不建立本地 retry queue、parent run、synthetic user 或假 receipt。

## WEB-COMPOSER-P0：仅浏览器瞬时接纳结果（2026-10-01；候选）

同步accepted boolean不持久化、不进入snapshot、localStorage、IndexedDB、SQL或Redis；它仅决定当前事件处理是否消费受控草稿与
创建/路由意图。拒绝路径保留原React草稿，接纳路径沿既有草稿清理和owner请求。没有新增队列、receipt、Message或Run事实。

## WEB-PROJECT-FLOW：空页cursor与项目状态投影（2026-10-01；已验证源码切片）

BFF持久拥有项目会话清单与opaque cursor；Web不保存第二份清单事实。正式wire是
`{sessions: SessionListItem[], next_cursor: string | null}`且两键必填。解析后仅在页面生命周期view中把owner null显式映射为
内部`cursor=undefined/hasMore=false`；string原样用于下一页请求，不解码、不合成、不持久化。合法空页是
`entries=[]/error=false/hasMore=false`，只有解析或取数失败才进入error。

项目conversation route、list loading/error与welcome均是内存UI状态：loading/error优先，成功且settled才允许empty welcome。
本片没有SQL schema、migration、事务、索引、Redis、localStorage/IndexedDB新增项或跨owner JOIN；preview只实现同一正式wire。

## WEB-BFF-PUBLIC3：无持久化变化的两角色消费（2026-10-01；已验证源码基线）

当前源码已把旧public 2.0 snapshot替换为BFF owner commit
`293dfe7638e5dea0df2bee6dfdd8483b53fc9df6` 的 public `3.0.0` 原字节（SHA-256
`acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b`）。唯一数据语义变化是上游
`ChatMessage.role` 来源闭集正式成为 `user | assistant`，与现 Web 内存消息模型一致；不保存、过滤或改写 system Message。

本片没有 SQL canonical schema、migration、表、索引、事务、Redis namespace、browser storage或跨owner JOIN；BFF仍是
Conversation/Message持久事实owner，Web只持有页面生命周期投影。failure 12 tuple、operation、AG-UI projection、cursor、
idempotency与取消语义都不变。Agent 4 / BFF public 3.1 retry尚未发布，因此不新增retry queue、receipt或terminal mutation状态。
下方 WEB-FAILURE3 是旧public 2.0来源下的历史实现记录；其内存failure模型保留，但旧pin/system drift不再代表当前目标。

## WEB-FAILURE3：安全失败内存模型（2026-10-01；运行时候选）

Web 不新增 SQL、Redis、IndexedDB、localStorage、receipt 或 failure 持久副本。BFF Message 与 AG-UI ledger 仍是唯一持久
事实；本候选已固定 BFF `ccb8e144` public `2.0.0` 原字节（SHA-256
`ba10f89baf0fdd8cd4da58947b0411da8c84294dfe77e278533aeda59a905773`）并生成唯一 12 tuple，当前运行时候选只维护页面生命周期
投影。generated tuple 是 owner schema 的派生物，不是 Web 持久事实或第二码表；pure generator import 不写 artifact 或任何
浏览器/服务端状态，只有显式固定 CLI 模式更新或核对该派生文件。

| 输入事实 | Web 内存投影 | 禁止推导 |
| --- | --- | --- |
| Message.failure 三键 + assistant/failed/nonblank run | `{kind:"agent",profile}`，snapshot/reload/share 同值 | 不从 failed、空正文、run_id 或 code string 补 profile |
| Agent RUN_ERROR exact nested profile | 同一 `{kind:"agent",profile}` | 不保存/展示 top-level message、error_kind、raw payload；不 unknown→internal_error |
| BFF dispatch RUN_ERROR，source_owner + decimal string seq，无 failure | `{kind:"dispatch"}`，sourceSequence 保持 string | 不转 Number、不写 numeric lastSeq、不使用 BFF launch code 作为 Agent code |
| failed Message 无 failure | `{kind:"generic"}` | 不猜 cancel/dispatch/delete 的具体原因，不造 retryability |
| completed/cancelled/active/HITL | 既有状态 | 不因历史 failure 污染 newer user/active run/pending pause |

`runStatus` 继续表示 settled/active UI 相位；新的 closed terminal failure union 取代旧 raw `runError`。所有十码 false 与
availability 两码 true 共 12 tuple 由 pinned OpenAPI 生成常量，runtime snapshot/live schema 复用；不存在第二手写码表。
`seenEventIds` 继续按 event_id 去重。Agent numeric seq 继续参与原步骤排序/`lastSeq`；BFF dispatch 的任意精度十进制
sourceSequence 只作该 source identity，不与 Agent 序列比较。

tail restore 仍须满足：最后 owner-ordered Message 为 failed assistant、无 active_run、无 pending pause。若有 profile 则精确
恢复 agent；若没有只恢复 generic。SharedThread 只读取相同 helper，不复制另一套 failure 归类。AG-UI frame GC 后，
snapshot/list/Share 仍从 Message.failure 得到安全 profile；GC 不清 Message 事实。

BFF public 合法的无 failure system Message 仍是现 Web user/assistant render 边界之外的已知 public consumer drift。本片不
丢弃或改写它，也不为通过 failure 门扩建第三种消息 UI；runtime 继续 fail-closed，后继独立切片必须决定 system 的可见语义。

`retryable` 不落本地 command queue，也不是 mutation capability。Agent/dispatch/generic terminal 在 public 2.0 下均无 Web
retry command；create-message receipt 未知时保留的原 key/body 是提交幂等恢复，不是 terminal retry。正式 retry 的 parent、
新 run、旧 user identity 与 fence 由尚未发布的 Agent 4/BFF 2.1 另行拥有，本节不提前建模。

## Failed snapshot 的本地派生状态（历史 public 1.0 基线）

本节记录旧 snapshot 只有 status 时的派生；当前 public 2.0 failure 目标以上节为准。

Web 不新增持久化事实、表、缓存或 localStorage 字段。输入事实仍是一次 BFF snapshot 中按 owner 顺序排列的 `messages`、optional `active_run`、`pending_pauses` 与 `event_watermark`。本地派生函数为：

```text
restoreFailed = last(messages).role == assistant
             && last(messages).status == failed
             && active_run is absent
             && pending_pauses has no status=pending
```

`restoreFailed=true` 只生成内存 `runStatus=failed, runError=null`；messages、steps、files、deliveries、cursor 和 run identity 原样水合。数组为空、尾部新 user、尾部 assistant 为 completed/pending/streaming、存在 active run 或未决 pause时为 false。Web 不保存或合成 failure code/message；精确失败分类仍等待 Agent owner机器事实经 BFF安全投影。

## WEB-PERSONAL-CODE 历史内存状态（2026-09-30）

基线49adb4b，当时固定BFF67755d16/OpenAPI SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`，间接Platform6519ae9a/v5.0.1。
下节“尚无安装状态机”是历史设计基线，当前候选已实施以下纯浏览器状态；没有新增持久化owner。

`PersonalSkillsRead` 分别保存已发布页与安装页、filter/cursor/history、generation/AbortController、冻结意图与动作状态。
动作idle/busy/unknown/rejected/confirmed/ready区分未确认结果、明确拒绝与“ACK确认但current读失败”。
同 mounted surface 串行动作；unknown保持原key，即使随后恢复请求被401/403拒绝也不释放成新意图。
ACK成功只作为历史receipt，Get返回的current才更新显示；已确认后读失败/取消保留installation_id，重试只Get。
List/Get不创建mutation key；取消/卸载通过controller与当前请求身份fence忽略迟到结果。

filter缺失/true/false保持独立；默认installed=true/limit50，cursor仅当前页导航、不解码或缓存授权。
重复continuation进入error；空页不是失败fallback。removed仍可Get，不从公开source缺失阻止降权。
整页卸载丢失内存key后只读当前事实，不制造receipt恢复或自动补写；无SQL/Redis/localStorage/IndexedDB安装记录。
Platform的CAS/receipt/outbox和BFF的current IAM/public投影仍唯一；发布不安装，安装不启动/选择Run，Chat refs原有语义未改。
真实并发/撤权/浏览器验收由Root后验，当前纯测试不证明owner事务或产品激活。

## WEB-PERSONAL：安装管理状态归属（2026-09-30；历史目标文档门）

Web 基线 `14a54b4b8da68b37d83a13402bc8abb87001574e`，当时目标固定 BFF
`67755d16ff0f40ea02d71a6dad7108507a04766a` public OpenAPI SHA-256
`40578534da44dff8fcb7bb6812d43753542528b379d684a19100c35a62c60114`；其 Platform 固定
`6519ae9a7dba63586474d2860f6725d3165b701e` v5.0.1。当前 Web 尚无安装状态机，旧 snapshot 571b51de/preview installed 不证明消费。

| 事实/临时状态 | 唯一归属与生命周期 |
| --- | --- |
| Skill/Draft/发布 | Platform 持久 owner；当前本人 ACTIVE 列表可作为显式 Install 的 source selector，不等于已安装。 |
| installation/current generation/启停/removed | Platform 唯一持久 owner；Web 只保存最新 Get/List 的九字段安全投影（其中 removed_at 可选）。无第二安装表/store。 |
| 原命令 ACK/幂等/CAS/outbox | Platform receipt、事务与事件 owner；BFF public 投影。Web 不复制摘要或将 request ID/event ID 当 mutation key。 |
| tenant/subject/权限 | current IAM 与 BFF trusted context；Web 内存记录、cursor、source_ref 与 installed/enabled 均不是授权。 |
| 已发布页/安装页 | 组件内两个独立状态，含 loading/error/ready、当前筛选与 opaque cursor/history；安装默认显式 installed=true、limit50。筛选改变重置翻页，不抓全量后自行分页。 |
| 进行中的意图 | 当前 mounted 组件内冻结 method/resource/body/key、请求 generation/AbortController、busy/unknown/acknowledged/refresh-error。每个 installation 本视图串行；非跨页签互斥。 |

无 SQL canonical schema、migration、索引、业务 Redis key、安装 localStorage/IndexedDB、server cache 或跨 owner JOIN。
现 session/CSRF Redis 生命周期不变。本片无 fresh-install 数据门，不创建空 schema。

### 内存转换与丢失边界

1. idle → submitting：新明确意图生成一次 key，冻结 exact 参数；冲突控件 disabled。
2. 网络/超时/取消 → unknown：取消网络不等于取消已提交业务。保留原 key/参数供显式同键重试；
   不乐观落安装/启用/移除成功，不生成第二意图绕过未知结果。
3. strict 200 receipt → acknowledged → refreshing：历史 ACK 的 change/event/replayed 是原提交结果，
   不覆盖 current read。Get/List 成功才更新当前视图；Get 失败是“命令已确认、当前状态待核”，不是 mutation 失败重发。
4. receipt replay 后当前 installation 可能已 disabled/removed/升级，以新 Get 为准；读失败不回填旧 ACK 当当前事实。
   Install 未知且无 ID 时只同键重试，不按 source_ref 猜安装 ID。
5. 弹窗关闭/重开保留当前父组件生命周期内的未知意图；卸载/整页刷新丢失它，只读取 owner 当前状态。
   不用列表匹配证明历史命令已执行、不自动新 key 补写。组件卸载/换页 abort 且 generation fence 拒迟到结果。
6. 401/403停止动作；404不泄露存在性；409/412展示明确冲突/前置失败并允许读取当前状态，
   不制造 expected_revision/If-Match。不同页签/同用户并发的正确性仍由 Platform CAS/receipt 保证。

安装管理表示按 installation_id 键控；source_ref 是固定 Skill 引用，series_id/revision 不充当 installation ID。
启停/移除不依赖名称或公开 source 详情成功；removed 始终 disabled，读到 removed 是管理状态而非消失。
List 的 optional meta.next_cursor 保持 absence，不变 null/空串；默认不筛选时包括 removed，false不等于缺失。

发布流程既有 File/attempt/原 key 状态保持独立：Publish 不建立安装；安装不选择或启动 Run。
Chat 有序 exact selected_skill_source_refs 与每 Run 冻结逻辑完全不改，未来执行仍由 Agent/Platform重新授权。
下一切片文件表与验证见 TECHNICAL_DESIGN；本节没有声明实现、持久化或端到端通过。

## WEB-PRODUCT-IA-CODE 当前内存状态（2026-09-30；待 Root 验收）

基线 `7087225`。正式 Project scheduled 初始项为空且不显示 preview 选择器/编辑器；样例与合成 ID 仅在显式 preview 夹具内，
保存路径也核 preview。正式任务事实只来自现独立 live surface/owner client，不从 Conversation 生成或以 title/time 合成。
`projectConversation` 只表达专案内会话的 UI 布局，Conversation ID/Project ID/ScheduledTask ID/Run ID 保持独立。
对应 Conversation DOM/CSS/组件也使用同一语义，不保留 task 命名 alias；纯文件重命名不迁移任何 owner 数据。
已知项目 route shortcut 显示“当前专案”，未读全集/名称不填品牌或固定 kokoro；正式创建后仍使用 owner ID。
welcome 默认正式、仅显式 preview 才允许本地 preview project 生成；正式新建是具名 callback，不传 sentinel。
无新增持久层、缓存、关系表或迁移；原草稿与单意图重试机制保留。下节是实施前文档基线，后继 Project 全集与专属任务缺口不变。

## WEB-PRODUCT-IA：资源身份与内存投影（2026-09-30；仅文档）

基线 Web `79f19df`。本门和目标首片均无新持久化 owner、SQL/schema/migration、Redis namespace、业务缓存或 store。
现 Product Session/CSRF 与 Chat durable replay 边界不变。

| 事实 | 唯一 owner / Web 投影约束 |
| --- | --- |
| Conversation 与可选 Project 归属 | BFF；Web 仅保存 active ID、列表页与当前 project_ref 过滤上下文。专案内会话仍是会话，其排序/草稿不成为 ScheduledTask。 |
| Project | BFF；独立 opaque ID、详情、资源与指令。Web 仅经现 owner 请求读写；品牌/标题/preview ID 不作主键。创建中冻结 key/body 与草稿是暂态意图，成功后保存 owner ID 供导航重试。 |
| ScheduledTask | BFF 产品定义；Scheduler 是其调度基础设施 owner，Agent Run 是执行 owner。列表/创建回执身份来自 BFF，Web 不按 title/time 合成 ID，不按 Conversation 数量重建任务。 |
| Run | Agent；Web 经 BFF AG-UI 显示当前执行/终态，不把一次 Run 和长期 ScheduledTask 或 Conversation 混为同一资源。 |
| 首页与 Composer | 品牌由站点上下文，能力可见性来自已接通正式入口；草稿/焦点/高度是浏览器交互，不是集成状态、部署或任务成功事实。 |

当前 Project 组件无条件载入 `previewScheduledTasks`，可选 callback 后合成 scheduled ID/linked ID；目标首片删除正式路径这些事实伪造，
preview fixtures 只在显式 preview 内；正式空态是无已确认资源，不是“每日简报”样本。当前 ScheduledTask client 未保留 project_id、
Project rail 未接 typed 全集，不在内存建立猜测关系表或用 localStorage 弥补。独立任务 live 页继续用既有 owner 列表/命令；
项目专属任务关系和完整 Project 集合是后继消费者切片，不能宣称首片已有其完整视图。

资源切换时清掉不再匹配的显示暂态、抑制迟到响应；已确认数据失败时可保留并显式报错，不将错误写为空成功。
历史 preview/alias 不迁移、不双读，正式页面不读其数据当业务事实。本片不改变 owner receipt、幂等保存周期或数据库事务。
技术放置/首片文件与失败门见同片 TECHNICAL_DESIGN；网络唯一来源见 API_CONTRACT，三者不引入新契约。

## W3 Chat Skill 选择：当前/目标（2026-09-29）

旧全局 `localStorage` key `kokoro.web.pinned_skills` 曾保存名称并由 `usePinnedSkills` 注入正式 engine；该 hook/store 与正式 name wire 已删除，
遗留 key 不读取、不迁移，也不是 Skill、安装或用户授权事实。当前只在 Web 会话内存持有有序、唯一的 exact `source_ref`（最多 16 项、单项最长
197 个字符、数组 compact UTF-8 JSON 最多 4096 字节），显示名与 revision 只是当次个人列表投影。提交开始后把选择复制进 pending submission；未知响应重试复用冻结副本，
不得从当前 UI 或旧 browser key 重采样。刷新可丢失未提交选择，不建立 localStorage、Redis、SQL、receipt 或跨设备恢复。
active conversation identity 变化即清空选择；删除非 active 会话不改变当前选择，pending submission 已冻结的未知 ACK 重试仍保留原序。

Platform 仍唯一拥有 Skill/Source/Installation/Enablement，BFF 拥有 public Chat request/outbox，Agent 拥有 Run 与执行前解析。
Web 的选择不证明可执行；当前 Agent 非空 reader 未接，完整选择执行链仍未完成。旧 key 不迁移、不双读；显式 preview
fixture 可保留名称动作，但不得写入正式 engine 或 `selected_skill_source_refs`。

## W3 第二阶段 B：上传意图只在浏览器内存（2026-09-29）

Web 仅在当前 Skills 页面组件生命周期保存 File、metadata、SHA-256、AbortController、当前阶段及单意图 mutation key/body；关闭并重开 Dialog 不产生新 key，整页刷新才丢失临时引用。不把草稿、attempt、scan、receipt、签名 URL、ZIP bytes 写进 SQL/Redis/localStorage/IndexedDB。Platform 是 Skill/attempt/幂等/ACTIVE 事实 owner，Storage/ObjectStore 是原字节/scan owner，BFF 是 IAM 准入与 public 投影 owner。Complete 的 pending/unknown 是 partial；继续前复核 owner 当前 attempt，已替换则要求明确重开。刷新后不能按旧 attempt 猜可续传或按 CLEAN/validated 猜发布；未知 Publish ACK 首轮 by-ID 404 不证明完成，后续显式再查仍 404 才同键重发零 body；401/403 原码保留。Draft 字段各自允许的组合仍受 owner 65,536 原始字节限额，Web 前置预检不保存额外事实。旧 preview fixture 数据无授权/发布语义。Web 无 canonical schema、事务、迁移、索引或 fresh-install 数据门。六项写候选仍 default-off；Root 真 owner 组合与 CORS/感染/撤权验收独立。

## W3-WEB-SKILL-CONSUMER 第二阶段 A：只读浏览器投影（2026-09-29）

Web 只持内存中的个人 Skill/MCP 页、opaque cursor、详情请求状态；BFF/Platform 仍分别拥有 public projection 与 Skill/MCP 持久事实。个人 Skill `source_ref/revision`、本人 ACTIVE by-ID 七字段只来自当次 BFF 读回，MCP 仅六 owner-native 字段；旧 pool/catalog、URL/secret/revision/allowed_tools 和 preview confirm 不是发布事实。错误不写入空页，不缓存为授权；组件卸载/详情关闭使迟到结果失效。无新增 Web schema、事务、Redis key、receipt、对象字节或第二 owner。单 ZIP 上传状态机、批准 origin PUT 与 ACTIVE Publish ACK 尚未实施，六项写候选仍关闭；下节第一阶段描述仅是历史基线。

## W3-WEB-SKILL-CONSUMER 第一阶段：Skill/MCP 无 Web 业务事实（2026-09-29）

当前 Web `main 74dcc101f6c457d10db4511365e6898f44f0e625` 的旧 `SkillUploadDialog` 仅保存 preview namespace/candidates/selected 与 confirm 显示，不是 Platform Skill 发布事实；旧 MCP URL/secret/revision 视图也不是新 BFF owner-native 投影。BFF `62daba37fc0267830d73590bb5a3499807d46fc6` public OpenAPI 已按 SHA-256 `5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923` 固定到 Web generated snapshot，但运行 UI 尚未切换，六项写候选 default-off、Platform v4 inactive。

| 事实 / 生命周期 | 唯一 owner；Web 目标投影 |
| --- | --- |
| Skill 草稿、revision、当前 attempt/epoch/phase、validated package、PERSONAL/ACTIVE 发布、幂等 receipt 与 `skill.published` outbox | Platform 唯一持久 writer；BFF 当次 IAM admission 和 public 投影；Web 只保存当前 React 交互状态。个人列表 `scope_kind=personal` 保留 `source_ref/revision`，本人 by-ID 七安全字段可作为丢 Publish ACK 后的 ACTIVE 权威读回。 |
| MCP 注册、声明、状态 | Platform owner；BFF public 只投影 `server_id/provider_key/server_identity/transport/declaration_digest/status`，Web 不从 URL、secret_ref、allowed_tools 或旧 revision 重建 owner 事实，也不据此提供无效启停/删除控件。 |
| ZIP 原字节、签名 PUT 与 scan/object health | Storage/ObjectStore owner；原 File、大小、SHA-256、Begin descriptor、各命令 key/body 只在当前浏览器交互生命周期内；Web/BFF 不持久化 signed URL、字节或对象凭据。 |
| 发布可见状态 | 严格 ACTIVE Publish 回执，或丢 key/ACK 后本人 by-ID 当前 ACTIVE；Get package-upload 的 current draft attempt、uploaded/CLEAN、validated 或旧 Hub catalog 均不构成发布事实。 |

刷新后丢失 Begin key/reference 时，`intent`/`upload_pending` 不能续用原 PUT；`uploaded` 可重选原 File、重算 hash/size 后让 owner 验当前 attempt/upload 绑定。丢 Publish key/ACK 时 UI 必须先显示状态未知，使用本人 by-ID 权威核对，不能自动用新 key Publish。Web 不新增 canonical SQL schema、Redis 业务 key、索引、事务、receipt、retention 或跨 owner JOIN；没有 Web fresh-install 数据门。下一阶段才移除正式旧 preview/confirm、namespace/candidates、`.skill`、`official|third_party` 和 MCP 假字段/控件，本阶段只改文档/机器 pin/契约负例。Root 独立真 Chromium/CORS/Storage 组合未由本片证明。

## S9-WEB-CODE 浏览器投影状态（待 Root 验收）

当前工作树 `SessionDelivery` 使用 `(conversationId,artifactId)` 身份及 BFF 九字段投影；
`deliveriesHasMore` 为页面截断标记，复合键去重而非 hash 去重。Web 仍无 Artifact 表、SQL、Redis
或持久字节事实；Canvas/卡片只持 metadata 与取消中的二元详情请求，内容交由浏览器原生 attachment。
下节 S9-WEB-DOC 为代码前历史基线，本仓测试不代表 Root 真链验收。

## S9-WEB-DOC：Chat Delivery 浏览器投影（2026-09-28；仅文档）

Web main `102033e34be89ba0e9958447e4d4021fcbf257b7` 的 Library 已用二元作品身份，
Chat 的 `SessionDelivery`、快照 Zod、live reducer、Canvas 引用、下载仍使用旧 `contentHash/path`。
Web generated BFF public 快照仍为 SHA-256
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`；
BFF main `bd1f794e7b1115d96965aa03d8a3a83a33c42fd7` 的新机器源 SHA-256
`a224b186813615467b6c045d3be83082d3e164e140d6da9722bf3f8d7e33b219`
已经提供同事务最近 100 件、`deliveries_has_more` 和 event watermark，但 Web 尚未消费。

目标 `SessionDelivery` 只是页面内投影：`conversationId + artifactId` 为稳定复合键，另保留
`assetId`、八值 `artifactKind`、`title`、`mime`、`size`、`runId`、`createdAt` 展示信息；
live/replay 先验证完整 Agent payload，snapshot 验证独立九必填字段，然后归一到同一形状。
`content_hash`、path、MIME、`asset_id`、文件名均不是身份/授权/去重键；同 hash 的两个 Artifact 必须
成为两项。`deliveriesHasMore` 与最多 100 件仅是当前 Conversation 视图上限，完整历史归 BFF
分页 Library，不能把省略/false 作为同一语义。`eventWatermark` 只供增量 replay；410 过期后丢弃
旧水位重新读取快照。终态同步在内存中按水位/代际和二元 ID 与 live 对账，不能让较早快照删除较晚
live 项，也不能把缓存过的 Canvas 二元引用在权限失效后视为仍可下载。

Web 不保存新的 Artifact/Delivery/Download 表、schema、migration、SQL、Redis、IndexedDB 或
localStorage 权威事实；不持有内容 Blob/iframe URL 或 Storage 签名 URL。Chat 卡/Canvas 只保留当前
React 生命周期的 metadata、选择项、发起下载/失败状态与 AbortController；浏览器原生 attachment
仅报告发起，BFF 每次详情/内容 GET 重新准入。BFF 唯一保存 Conversation↔Artifact 与 AG-UI
ledger，Storage 唯一保存 FINAL/CLEAN 对象和字节；个人 File 独立 `asset_id` 模型不混入作品。
预览样本可在显式 local/test fixture 隔离保留，不填正式失败空白。代码门另行实施并验证，本门不改变持久事实。

## W2-WEB-AGENT-ARTIFACT-F2-CODE 数据边界历史基线（2026-09-28）

正式作品页仅在 React 生命周期保存 BFF `kind=artifact` 页项、opaque cursor、加载/错误、
AbortController、二元 `(conversation_id,artifact_id)` 收藏键及下载“已发起”提示；刷新重读
owner，不把 cursor、`asset_id`、hash、文件名或详情预检当权限。原生同源 attachment
不生成 1 GiB JS Blob/Object URL；Web server 只持有请求生命周期的有界流，不落磁盘。
BFF 拥有 Conversation↔Artifact 关联与 Product 本人准入，Storage 拥有 FINAL/CLEAN Artifact、
Asset/Blob/Scan 和原字节。Web 无新增 SQL/Redis/schema、持久缓存、receipt、签名 URL 或授权事实；
Product Session/CSRF Redis 不变。个人 File 继续独立 `asset_id`/1 MiB 模型。
Chat live strict schema、snapshot/replay 与 Canvas 仍保留旧 hash 数据链，不因 Library
二元身份而迁移；BFF live 已有新 ID，但 snapshot `deliveries: []` 尚非可恢复作品视图。

## W2-WEB-AGENT-ARTIFACT-F2 数据设计基线（2026-09-28；代码前）

Web main `eaa7ebd56502cf05b6b402a8a013973c1904b8aa` 的正式作品页仍把
`ArtifactRecord(content_hash,session_id,...)` 作为列表/下载/收藏键，来自旧 `/api/session/artifacts`；
这不是 BFF main `55d3c9cd55386d9dcc074e893cc388924dd94c13` 已发布的 Product Artifact 身份。
目标作品页只保存当前 React 生命周期的 BFF `kind=artifact` 页投影：
`(conversation_id,artifact_id)` 是列表/详情/下载与跨页去重的二元身份；`asset_id`、`content_sha256`、
`source_run_id`、标题、文件名、大小、`delivered_at` 均为经校验的显示/完整性字段，不提供授权。
个人 File 仍用独立 `asset_id`/CLEAN ASSET 模型，不和作品拼为可选字段或按 MIME/hash 推断 kind。
本次页级 `oneOf` 使空页可携带非空 cursor；已确认项、opaque cursor、请求代次、loading/partial/error、
AbortController 仅在组件内存中，翻页失败保留原 cursor/已确认项，切页或身份变化丢弃迟到结果；
刷新重新向 BFF 读取，不把 cursor 当快照/权限。收藏如保留仅属 Web 本地 UI 偏好，须从 hash 改成
二元 ID 键；不可把收藏或下载成功持久化成 Artifact 可见性。显式 preview/fixture 与正式 owner 页分离。

BFF 唯一保存 Conversation↔Artifact 关联并按当前本人 active Conversation/Storage FINAL CLEAN 重验；
Storage 唯一保存 Artifact/Asset/Blob/Scan 事实与对象字节。Web 无 Artifact/Download 表、schema、migration、
ORM、跨 owner SQL、事务、receipt、持久 cursor、签名 URL 副本或新 Redis key；现有 Product Session/CSRF
Redis 生命周期不变。Web server 不落地 1 GiB 字节或持久临时文件，精确同源下载仅在请求生命周期持有
有界流与取消状态；浏览器采用同源原生 attachment/下载管理器，不创建最大 1 GiB 的 JS Blob/Object URL，也不写
localStorage/IndexedDB/Cache API 作为作品事实。页面只保留“已发起”交互状态，不能从导航推断磁盘保存成功；上游短字节、超限或断流由专用传输边界终止。

Agent live `delivery.created` 已含作品 ID，但 Web strict Chat schema 仍拒该 payload；BFF chat snapshot
`deliveries: []`，所以 Library Product 读取不能填补 Chat delivery/canvas 的恢复模型。先只替换作品页正式
旧 hash 读取/下载；Chat/Canvas 二元身份、snapshot/replay 与各自旧路径删除需独立协同门。此四文档设计门
不改生成文件、React 状态、数据库或正式运行链；固定来源与验收见同切片 API/技术/CURRENT。

## W2 个人文件下载当前数据边界（2026-09-28；个人下载真纵切已验收）

下载只在个人文件卡的 React 生命周期持有请求、`AbortController`、错误与临时 Blob URL；成功保存后释放 URL，
取消或卸载中止请求。列表仍由 BFF 本人 GET 返回，下载由 BFF 每次重新授权并读取 Storage owner 的 CLEAN
Asset 原字节。Web 不创建 SQL/Redis/schema/本地持久副本，不保存签名 URL、Blob、下载许可或新业务事实；
Agent Artifact 模型与下载保持独立。本仓代码与直接测试已通过；Root 固定 `44ee670f` 真浏览器原字节/他人404通过，测试自有 PG/Redis/对象/进程余量为0。

## W2 个人文件下载数据边界历史设计（2026-09-28；代码前）

BFF main `d5c868f8ab8b8a33750e1286e9d020ca72895641` 已拥有
`GET /v1/library/files/{asset_id}/content` 的个人授权与完整原字节返回；Storage 仍是 Asset/Scan/对象的唯一
持久 owner。Web 文件卡只持有已校验个人 GET 项的 `asset_id`/显示名，以及 React 生命周期内当前卡的
下载中/失败/取消状态、`AbortController` 和临时 Blob URL。Blob URL 在下载后或组件清理时释放；
页面切换取消在途读取，刷新后从 owner GET 重新读取列表。不把 Blob、签名 URL、下载引用、文件名或
下载成功状态写入 SQL、Redis、localStorage、IndexedDB、Cache API 或 Web 服务器磁盘。

Web 无新增 Asset/Download/Artifact 事实、schema、migration、索引、事务、幂等 receipt、缓存或
跨 owner JOIN；现有 Product Session/CSRF Redis 生命周期不变。文件 `asset_id` 只作请求定位，不能
从它、内容 hash 或 Blob URL 推断授权；同租户不同成员的个人文件仍由 BFF/Storage 拒绝。
Agent 作品 `content_hash/session_id` 模型及原下载状态保持独立，不能和个人 Asset 混存或共用许可。
本门不修改生成契约/代码，后续 Web consumer 与 Root 真浏览器验收见对应技术/API 设计。

## W2 个人文件可见上传数据边界（2026-09-28；历史切片，已由 Root 验收）

代码前 Web main `29673babe37d01a2fbf7d0347f99d8e04c22da16` 只有个人文件只读页签及已限额的同源 POST adapter；BFF `8a90fdd9ec3809000924229bfc7b986ba8ba1522` 的新个人 Product POST OpenAPI 原字节 SHA-256 是
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`。当前工作树上传控件只拥有浏览器一次交互的 `File`、该文件意图的稳定 `Idempotency-Key`、提交/待确认/可重试/终态错误状态和个人 GET 读取状态；待确认 File/key 在 Library feature 内存中跨页签切换保留，不依赖文件页签是否挂载。不创建 Web Asset、Upload、Scan、receipt、cursor、SQL、Redis、localStorage 或 IndexedDB 事实。用户换文件须建新意图；未知结果下原 File/key 只在当前页面内保留供显式同键重试，不承诺刷新浏览器后的文件恢复。

BFF 从当前 Product Session 派生受信 tenant/subject 并持久化幂等 receipt；Storage 唯一写个人 Upload/Asset/Scan。Web 不从文件名、内容 hash、`asset_id`、幂等 key 或 POST 回执推断授权/持久可见性；严格 CLEAN 200 后重新读个人 GET，只有 owner 返回的本人 CLEAN ASSET 才进入列表。GET 失败保留可见错误，不写乐观假文件；同租户其他成员不共享个人文件。感染/冲突/中止不写假成功，可恢复未知结果保持同键；无跨 owner 事务、缓存失效任务或双写。整段 multipart 1 MiB 是传输约束而非新增持久数据。个人下载和 Agent Artifact F2 不在本片，作品 `content_hash/session_id` 生命周期不变。

## W2 Library 文件/作品分离（2026-09-28；已发布的只读基线）

Agent 作品 React 状态仍为 `ArtifactRecord(content_hash,session_id,title,...)`，正式来源是
`/api/session/artifacts`；个人文件来自 BFF `kind=file` 的
Storage CLEAN ASSET 投影，以 `asset_id` 为唯一列表身份；Agent 作品保留独立 `content_hash`/
`session_id` 模型，不能用类型断言、可选字段或哈希下载动作合并两者。文件 `content_sha256`
仅作 wire 边界校验，不作为列表身份或下载许可。

文件页签只在 React 生命周期保存已确认页面、opaque cursor、loading/error 与当前页签状态；
切换页签/卸载取消在途读取，刷新后重新向 BFF GET。无新增 Web SQL、Redis、localStorage、
Asset/Artifact 副本、跨 owner join、上传 receipt 或持久 cursor。个人 POST public 契约现已由 BFF 发布，
上节可见上传控件已发布并由 Root 验收；BFF 下载 public 契约已发布，但 Web 下载 consumer 未实施，不从 Project 上传、Artifact 下载或显式 preview 样本推造个人文件事实。

## W2 项目资源读取数据边界（2026-09-28）

Web 不新增 schema、表、Redis key、持久缓存、receipt 或对象副本。BFF 拥有项目资源列表权限与 cursor，
Storage 拥有 Asset/CLEAN metadata；Web 只在 React 生命周期内保存当前页、opaque cursor、
loading/error 和上传重试 File+key。切换项目或卸载时取消读取并清理 view state，迟到请求不能写回其他
项目；页面刷新重新向 BFF GET，不能从本地 preview 或 POST 回执虚构持久列表。公开字段只用
asset_id、filename、mime_type、size_bytes、created_at 的显示投影，内容哈希仅边界校验不展示。

## W1D-WEB-IAM-DIRECT-CUT 当前数据边界（2026-09-26，Root 集成待验）

### 切片前事实与当前结果

切片前正式 Product Session 与旧 envelope 是两套不同数据路径；当前旧路径已删除：

| 数据 | 切片前 owner/用途 | 当前结果 |
| --- | --- | --- |
| `kokoro_session` | Web 旧 AES-256-GCM sealed cookie；载有 runtime credential、refresh、user/namespace 与 expiry，只供旧 `/api/auth/logout|session-state` 及 `auth.ts` helper | 已连同 `session-envelope.ts`、旧 route 与配置/测试引用删除；不迁移为 Product Session，不保留读兼容或 tombstone |
| `kokoro_auth_nonce` | 旧 magic-link nonce 常量/helper；两个 browser magic-link route 已先行删除，当前正式登录不签发或消费 | 已连同旧 `auth.ts` 删除；不建立替代字段或 Redis record |
| Auth.js RP transaction cookie | Web 正式 OIDC state/nonce/PKCE 临时数据 | 保留，生命周期与一次消费不变 |
| Product Session cookie | Web 正式 HttpOnly 加密 session ID、generation、server-only access 与必要退出提示，不含 refresh | 保留，字段、TTL、Secure/SameSite 与公开 projection 不变 |
| Product Session Redis record/tombstone | Web 隔离 namespace 中的在线 generation、双阶段 refresh CAS、加密当前 refresh 与撤销阻断 | 保留，key/value、TTL、并发和失败恢复不变 |

旧 `kokoro_session` 的删除不创建迁移事务：旧 cookie 即使仍在浏览器也没有 route/helper 消费，随浏览器现有
生命周期自然淘汰；它不被导入 Product Session、Redis 或 localStorage。旧 URL 由 Auth.js catch-all 显式返回 404，不能据旧 cookie
恢复身份。用户通过正式 `/login` 建立 Product Session；退出只走 Auth.js `/api/auth/signout` 及既有
tombstone/issuer confirmation 状态机。

### 不变的数据与失败边界

`sameOriginOk` 从 `auth.ts` 搬到 `same-origin.ts` 是无状态代码归属调整：不读取/写入 cookie、Redis、SQL、
browser storage 或 owner payload，不产生 retention、删除、索引、事务或审计事实。六个现有业务 route 仅更换
import，仍从在线 Product Session 取得唯一 Bearer；不恢复旧 namespace/principal/runtime credential。

Web 当前与目标都没有 PostgreSQL、schema、migration、ORM、跨 owner SQL 或 fresh-install 数据门。本片也不
增加 Redis key、logical DB、缓存、队列、receipt、锁或补偿任务；已有 Product Session/RP/交互 CSRF Redis
事实保持原样。Redis 丢失、pending refresh、旧 generation、logout ACK 未知与远端 revoke 未确认继续按现有
fail-closed/TTL 回收路径处理，删除旧 envelope 不提供 fallback。身份、issuer token、成员资格和审计仍由
IAM 持有，Web 只经 BFF 契约消费。

本文件与 `TECHNICAL_DESIGN.md`、`API_CONTRACT.md` 对 owner、删除项、零新数据事实和失败恢复一致；
活动代码删除与 architecture RED→GREEN 已完成，Web SQL/Schema、Product Session Redis 与 owner 机器契约未变。
Root 固定 SHA 的真三仓 Product Session 登录/退出仍待集成验收。

## 当前 W1E IAM relay 来源与邀请数据边界（2026-09-26）

Web 当前只读固定 BFF `1105553cfc24d4f44a90f626132bc30323a77946` 的 relay policy
`8f7d4f4cb6fa0ec34d2cce8702d8882d3270a316a6cbdb2d8bdaccefb9c6b4a1`，IAM owner 为
`a4c2b61467f1fc1772d6b6d8e98f081c090289fb`。IAM 继续唯一拥有角色、权限、邀请、用户与 issuer Session；
Web 不建立 SQL、缓存或权限副本，现有 Product Session/CSRF Redis 数据生命周期不变。

## W1D IAM relay 来源与邀请数据边界（历史验收）

Web 邀请入口已实现，但没有 Invitation、Member、User 的持久化事实或 SQL schema；这些仍由 IAM
`6a55ffb4c22f0b155ddb83157735c0ace766701d` 唯一拥有。Web 当前消费 BFF
`bc45632b8654db7e06eb9878bb4d7a609d12dc7b` policy `2.1.0`，SHA-256
`b18a559d162509c3029908b2e1c77ee7e59ed6af61b82e18be6b2e7669a0ef0c`。本次仅来源重钉，
不修改 Web Redis CSRF、Product Session、API/事务或数据生命周期；下节“尚未实现”是原设计门历史基线。

## R5-INVITE-WEB-ENTRY：邀请流程数据边界（目标态，尚未实现）

Web main `63aca94f93095722425340a0a95985e8796a5b33` 尚无独立邀请入口，仍固定 BFF policy `2.0.0`；目标来源是
BFF `d6dc8a0ea5a3fee7a4f54f01fefdeff0e28892e7` 的 `2.1.0`、IAM
`ac94f152daffa2293801ea4f56f98b3ae59452d7`。IAM 唯一保存 Invitation/recipient、User、issuer Session、Member、
Role、过期和审计；BFF 不落邀请事实，Web 更不创建邀请表、tenant/member/role 副本、SQL schema、migration、ORM、
事务或跨 owner JOIN。固定 `KOKORO_TENANT_ID` 只是 server-only 部署约束，不是浏览器可选事实；Web 只有经 BFF/IAM
校验后的单次请求 context UI 投影，页面不持久化邀请资料、邮箱验证 token、密码或 owner 错误正文。

Web 只扩现有隔离 Redis `kokoro:web:iam-csrf:<Web-origin-hash>:<token-sha256>` 的短 TTL 一次性记录：绑定固定 Web
origin、静态邀请 path、canonical ID、POST 动作；已登录 accept/reject 另绑定 issuer Cookie 摘要，匿名注册/登录不假设有
issuer Cookie。浏览器只持有 HttpOnly CSRF cookie 与隐藏 token，Redis `SET NX`/`GETDEL` 保证单次消费，值不含姓名、邮件、
邀请预览、密码或明文 Cookie。Redis 故障 fail closed；只清理测试自有精确 key。已有 Product Session Redis record 与
Auth.js RP 事务不因邀请预览/注册/邮箱验证而建立；**accept 200 后**才可经 `/login` 的正常 OIDC 流建立 Product Session。
reject 200 不建 Member 或 Product Session。accept/reject 无 Web/BFF receipt 或跨仓事务，不把未知网络结果写成成功；
context 终态 404 不证明之前的写入方向。邮箱验证 JWT 的核验/状态仍由 IAM 负责，Web 对它只执行严格同源传输与安全
Location 校验。`no-store`/`no-referrer` 覆盖预览、表单、验证回跳、完成与本地错误，避免敏感信息落入浏览器缓存或 Referer。

R5-Web-Team-Product 前置 scope 切片仅增加 OAuth user-delegated `iam:member.write`、
`iam:invitation.write` 的固定申请与严格校验；不增加 Web SQL/Redis key、tenant 或成员/邀请副本。
IAM `ad5224a` 仍是 Member/Invitation/Role 唯一 writer，BFF `da03b76` 是 Product Team
投影 owner；Web 旧 Team 管理路径尚待替换，本切片不改变其数据流。

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
| UI preference | `kokoro.theme`、`kokoro.locale`、`kokoro.web.chat-prefs` | 本浏览器偏好，可清除、可重建；`kokoro.web.pinned_skills` 是待删除且不得再读取/迁移的旧名称通道 |
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
- `kokoro.web.drafts` 中无会话的 Direct Chat 使用 `__pending__`；无会话项目使用 `__project__:{projectRef}`。后者只是本地编辑态，不是 BFF Project/Message 事实；显式 handoff 消费一次，避免创建 A 时随后编辑的 Direct B 草稿被覆盖。
- URL/query/hash 承载可导航 surface、project/conversation 引用和非敏感筛选状态。
- 旧 magic-link 申请/回调 route 已删除，Web 不再生成带 token 的旧 callback URL；固定 OIDC callback 使用独立的 `code/state/iss` 流程。
- runtime JWT、refresh token、internal secret、tenant/site 不进入 URL。

### 2.4 内存状态

React state、query resource store、Chat engine 和 optimistic receipt projection 都是进程内/标签页内状态。
刷新后必须从 URL、browser preference 或 BFF snapshot/event 恢复，不能把未持久化内存状态当成功事实。
正式 Project 创建意图（一次点击的 key/name/draft、进行中和失败状态）仅在当前 app-frame 内存中用于防多击与同键显式重试；它不是 Project 记录。成功仅使用 BFF 回执的 canonical id，失败不写 URL 或 Project fixture。preview project sequence 与 sessionStorage 草稿 handoff 不进入正式 Project owner 数据。

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
## SET-05 个性化可靠保存（2026-10-13，候选已实现，待主控验收）

Web 无新增持久业务数据/SQL/Redis；BFF personalization 唯一持久化 owner 与CAS revision保持。组件仅持 last acknowledged snapshot、当前草稿和待保存状态。preview 的浏览器测试数据与 live 完全分离，不将 localStorage 当本人服务器资料。冲突恢复保原草稿但必须由用户明确决定采用当前服务器资料或在新基准上保存，不能把旧草稿自动覆盖当前 owner 记录。

## SET-07：账户资料数据边界

无新增数据库、表、schema、Redis键、profile缓存或localStorage；IAM现User是唯一资料owner。Product session沿现有id/generation/subject与server-only access，Web不回传credential。资料只在当前已admitted身份的UI内存显示，换主体/失准入/卸载清理旧请求与旧显示，刷新重新经owner读。preview示例与live严格隔离，不用示例填补真实字段、计划、余额或登录方式。此片只读，不改姓名/邮箱、凭据、授权范围、账户删除或支付事实；后继写入分别按现owner能力实现，不以此读取片冒称整个账户设置完成。
## SET54 More 键盘行为（2026-10-16）

无持久化 owner、schema或存储变更。打开/关闭及首末键盘焦点只属于既有菜单组件生命周期，不写浏览器偏好或服务端事实。


## Skills 试用的临时显示绑定（2026-10-16）

不新增 SQL/Redis/browser storage。Skill 卡片的内部 `installed_source_ref` 来自已验证安装投影的精确 source（目录 join 使用安装的 version UID），和目录 current source 分开；缺失时不合成。它不是新增 owner wire 字段，亦非可执行授权。

试用选择仅在内存持有 name/sourceRef、engine、实际 conversation ID 与 admission owner；名称只用于标签，只有 exact source ref 进入既有消息数组。第一次离开该会话/身份即退役，不因返回相同 ID 复活，不从旧 pinned name 或持久草稿恢复隐含选择。原消息提交冻结集合及幂等重试保持。

目录搜索/筛选/详情 locator 是 actor 所属的内存展示意图，不包含名称、描述、安装权限、包文本或执行能力；代际变化保留意图，不保留过期私有事实。分页 cursor 仍属于本代实际页，不随 locator 迁移。未知安装命令的 source/key 是冻结意图而非确认状态；跨 actor 整体退休，无新 browser storage 或 owner schema。

Custom API 创建恢复状态只在稳定 actor/client 的 App 内存 holder 中存在：冻结请求及 key 不写 localStorage/sessionStorage/IndexedDB、URL、日志或数据库；环境变量原文仅为恢复原请求而暂存，确认后或 actor/provider 退休时清理。公开 snapshot 不包含请求正文、key 或 secret，只含状态及用户输入的名称。无新 owner Schema、缓存事实或业务记录；完成提示不是可执行授权。


JSON创建与API创建在同一稳定actor/client provider拥有两个明确且互相隔离的内存槽；共享纯生命周期不维护额外profile/server投影。原始JSON可能含header secret，故只在当前actor RAM保存未知请求，ACK清原文及body，换actor/真正卸载清理；无browser持久存储、URL或日志，没有新owner Schema。


Custom/URL 共用同一明确的私有 MCP actor/client 创建槽，独立于 API/JSON 单命令槽。未知 Register 原正文（可含 header/OAuth secret）与 Prepare 原 server/version/key 只在 RAM；确认后清注册正文/实际 secret 草稿，仅保精确 server/connector locator。准入或窗口退休立即清 owner facts，换 actor/真正卸载清全部意图；fresh GET 只形成当代显示事实，不覆盖未知原命令。无 browser 持久存储、日志、数据库或新 Schema。


MCP Prepare 的临时意图现只有一个 typed actor/client owner：按精确 server/connector 保存原 CAS/key，创建 flow 不再复制 Prepare intent，详情读出的新 CAS 不替换 unknown 正文。内存快照仅资源 locator/命令状态；不同资源独立，确认完成或断开/删除清条目，actor/client/真正卸载清全部。Provider 上移至 AppFrameRuntime 覆盖页面和 overlays，无新 owner Schema、browser storage、SQL 或跨服务数据访问。


Connector恢复错误固定消费仅新增只读generated机器profile与provenance，Hub/adapter不保存owner异常或receipt副本，不新增SQL/Redis/browser持久化、字段或写入边界。仅严格校验现安全错误体并交付既有HubClientError；actor命令RAM生命周期本阶段不改，错误不是资源事实或执行授权。


Connector命令快照只增加可选非敏感失败reason，原正文/key仍仅actor RAM；不持久化、不新增owner receipt副本。准入退休保原失败限制且清私有投影，actor/client退休清意图；晚ACK继续仅原主体确认失活，不借错误或读取结清未知写。


Custom API管理pending意图只在当前actor/client RAM，以profile ID索引一个typed update/remove命令。snapshot仅ID/operation/kind/failure，不含正文、key、owner事实或secret；原env写值仅为未决原请求短存，ACK或actor退休清除。没有browser持久化/SQL/Redis或额外receipt事实源，列表缺资源不证明命令完成。


MCP管理按actor/client、connector locator保存五项typed原命令，仅未决body/key/CAS在RAM；summary仅operation/locator/kind/failure，无owner事实/header值。现Prepare仍独立typed槽并与管理互锁，清理ACK精确退休Prepare；关闭/重核保原命令、actor退休/ACK清正文，列表缺行不生成事实或本地完成。无SQL/Redis/browser持久化或owner schema变化。

### Installation exact content（2026-10-16，实施设计）

无 Web 持久模型。已安装详情只在当前 subject/admission generation/resource 生命周期持有权威 PersonalInstallation 与精确 package directory；不把 catalog current 元数据覆写安装 pin，不解析 SKILL.md 冒充 owner metadata。安装源变化只失效本次读取并请求用户刷新，不自动更新安装、不合成 download 权限。


实施中：选择在engine只读内存快照与原pending options，composer控制器缓存仅归当前subject/准入generation/engine；URL、localStorage、数据库与后台enabled均不持有本选择。不得将菜单占位、读失败或历史trace合成可用Connection。正常未激活/联合旅程未验，不新增资金或恢复事实。
