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
