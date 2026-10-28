具名回答再生成：regenerateAnswer接正式ACK／exact source，不经submit或human ID对账；late ACK保head/cursor/普通followup，良性历史parts变化经一次原bounded snapshot发现accepted。page-clients注入独立answer-actions-client；缺新方法的旧HMR实例不伪装可用。

取消恢复：202不结束Run；同页未知取消保存原commandId/run.cancel，显式重试复用它。每次响应后仅一次现snapshot读取，exact session/run/代际及cursor守卫通过且owner真终态才接管；SSE保持，真实取消后可重新读原有bounded parts，不建poller。

<!-- Ordered private Message reads: message-parts-reader.ts is the sole bounded continuation reader; machine owns its context retirement and read-only retryMessageParts. It never retries commands or advances resumeCursor. -->
<!-- A typed page GET401 may await the existing ProductReadRecheck once, using the captured subject/data epoch and the original10s episode; only trusted same-subject readmission permits the exact same scope/cursor GET. Abort/retirement,409 and subsequent401 do not replay. -->
CHAT-1当前：`ownerConfirmedSessionId`只投影当前视图的正向snapshot/create ACK，内存保存，不由乐观正文或浏览器索引推断；供归档读取资格使用，不授权或改变原提交恢复。

## CHAT-1 未决提交刷新恢复（2026-10-24，候选）

`submission-recovery.ts`只定义浏览器恢复意图/adapter，`machine.ts`在首发前确认保存、snapshot-first恢复并保原key/options；明确New/取消须确认退休。精确ACK本地写失败保RAM receipt，下次只补本地写，不重发已接收命令。owner运行相位与未决admission分开，终态后可恢复exact receipt而不复活Run。浏览器I/O在ui/shell，网络协议不变；见三面设计及CURRENT。

PROJECT-1（2026-10-24）：EngineSnapshot.missingSessionId 是本 active 的权威缺席观察，不是本地创建或持久状态。new／switch／hydrate／accepted create 清退；同 session pending/unknown、本页新建及非空正文不因 null 改缺失。openConversation 对当前 missing ID 允许原 ID 只读 Retry；null 与 exact deferred receipt 竞态采用 ACK、零重复 POST，GC 原驱逐保持。

<!-- SET47 archive consumer: 2026-10-15 -->
SET47：可选EngineSnapshot.locallyCreatedSessionId仅证明当前engine尚未确认持久化的本地创建任务。首次submit/newConversation同步产生；历史打开、外部store、dispose、subject/logout、owner snapshot/message receipt与当前列表/状态/归档ACK证明后退休。retireLocalCreationProvenance只清证明并通知，不清线程或取消Run。归档请求由页面hook持有，engine不新增归档数据库/网络真源。

## SET21 停止分享回执

`SessionClient.revokeShare` 接受正式平面 `ShareReceipt`（share_id），与 createShare 使用相同回执形状；旧 ok:true 不再表示成功。该方法可接收 AbortSignal，让设置页停止分享和完整重读共用一次总预算。ShareButton 原交互以及其他会话、移动、SSE 方法保持各自既有职责。

<!-- SET16：task-notification.ts 只认本页MessageCreateReceipt或validated active execution_head及其nullable event_watermark；machine直接逐事件subscribeTaskNotifications，不用React快照充当消息队列。retireTaskNotifications使旧receipt/snapshot代际失效；view-only注入engine可无订阅，正式engine总接线。 -->
# engine — 会话引擎（状态机 + 浏览器 I/O 唯一编排者）

## R141 会话列表读取边界

`client.ts` 的 `listSessions` 使用单一 10 秒预算覆盖 fetch、成功 body 与错误 body 的读取，超时 abort 后按既有 network failure 交由 rail 显式显示并等待人工 Retry。该边界只属于会话列表 GET；snapshot、分页以外的其它 GET、POST 与 SSE 不由本切片改变。rail 仅在列表已成功加载、无错误且为空时隐藏 direct 空列表，loading/error/Retry 必须可见。

## 职责

显式会话状态机与 framework-free 引擎：snapshot-first 水合、SSE 流句柄、HITL 决策暂存、
重连/超时收口、多 tab 同步。React 只经 `use-session-engine` 一个接缝订阅快照。

## 公开 API

- `machine.ts`
  - `createSessionEngine(deps) → SessionEngine`：唯一的引擎编排入口；submit（运行中插话转
    现 create-message 路径、不动状态机；同步返回本地是否接纳，供调用方在拒绝时保留草稿）/ retry（未回执重试复用首发 key 与完整 options 快照，保持同 digest）/ cancelRun /
    stageToolDecision / selectConversation / newConversation / deleteConversation /
    reconcileConversationCache（只驱逐本地Conversation索引，不调用owner DELETE）/ setMode / dispose。
  - 从 `machine-state.ts` 与 `engine-types.ts` re-export 原有公共入口，保持下游 import 契约。
- `machine-state.ts`
  - `transition(state, event)` 与 `MachineState`：纯状态机（idle/submitting/streaming/
    reattaching/awaiting-hitl/error）；非法迁移返回入参 state（引用相等=被守卫拒绝），
    runId 锚定——只有本轮 run 的事件能推动相位。
- `event-reducer.ts`
  - `reduceProjectionEvents`：把一批已校验的 AG-UI 投影事件交给 core reducer，并返回
    本轮终态收束标记；`reconcileUserMessageId`：对齐本地 echo 与服务端回执。
- `execution-adapter.ts`
  - 集中构造 message/control wire；管理流句柄、代际守卫和微任务批处理，向 machine 只交付
    cursor、事件批次和错误。
- `engine-types.ts`
  - `EngineSnapshot`、`SERVER_ENGINE_SNAPSHOT`、`SessionEngine`、`EngineDeps`（SSR 首帧和
    引擎依赖契约）；`canRetryPendingSubmission` 只暴露同会话、未获 create receipt 且仍处于合法 error 相位的恢复能力；
    `canSubmitMessage` 与 submit 共用唯一同步接纳规则；SSR 为 false，UI 只组合非空草稿，不把它当 owner 回执。
    瞬态通知发 i18n key 不落文案。
- `client.ts`：`createSessionClient({baseUrl}) → SessionClient`——全部入站过
  contract zod，失败以 `SessionClientError`（network/http/parse）上抛零静默降级；
  baseUrl+path 直接拼接（非 new URL，保住 `/api/session` 前缀）；AUTH-P0 起客户端不持
  token，鉴权由同源 BFF 代理注入 Bearer、httpOnly 信封 cookie 同源自动携带；
  MessageCreate 的内部 `idempotency_key` 只映射到 `Idempotency-Key` header，strict schema 在
  fetch 前拒绝非法字段/缺失 key，JSON 只含 BFF 允许的业务字段；
  `openEvents` 只委托 `AgUiChatTransport`；`fetchSnapshot` 404/410 返 null（空线程即真态）。
- `agui-chat-transport.ts`：仓内唯一 AG-UI network adapter，实现 Vercel AI SDK
  `ChatTransport<KokoroUiMessage>`；负责 SSE framing、严格 runtime schema、opaque
  `Last-Event-ID`、断线重连与 frame cursor 去重，拒绝 reducer-shaped legacy wire；
  同一 chat 的同一 UIMessage id/content 重送复用 key，新 id 或内容变化换 key。
- `agui-event-mapper.ts`：把已校验 AG-UI frame 分别映射成 AI SDK `UIMessageChunk` 与
  `ChatProjectionEvent`；BFF 终帧的 cancelled status 与工具结果的 isError 保留到两种本地视图；
  verified Agent RUN_ERROR 只传播 safe profile，BFF dispatch RUN_ERROR 独立保存 string sourceSequence；两者都不把 raw
  message/code 送入 core/UI model。
- `session-scope.ts`：`SessionScope` 将用户直接会话与一个 opaque `projectRef` 的专案任务
  分开。浏览器仅发送 `scope=direct` 或 `project_ref`；部署上下文一律由 BFF 从服务端
  `KOKORO_DOMAIN` 生成的受信 `Forwarded` 与 httpOnly 信封派生。每个 scope 使用独立引擎与
  localStorage 索引，首条专案消息携带
  `project_ref`。
- `hitl-staging.ts`：`stageDecision`/`buildResumeDecisions`（按契约 pending_tool_ids
  凑齐同帧才产出，未凑齐 null）/`rejectedToolIds`/`pendingToolIdsOf`；`ToolDecision`。
- `reattach.ts`：`reattachPlanFromSnapshot`（在途 run 权威判据；有 pending 暂停直接落
  awaiting-hitl 不设时限）、`REATTACH_TIMEOUT_MS`（90s 兜底）。
- `config.ts`：`sessionBaseUrl()`——同源 BFF 代理前缀 `/api/session`（AUTH-P0）；浏览器不再
  直连 Web 同源 BFF 的 Chat projection，真实业务服务地址留服务端代理，`SESSION_PROXY_BASE` 常量。
- `file-fetch.ts`（client 组件）：`fileFetch`/`useFileBlob` 仅供 workspace File 小对象及隔离 preview；
  正式 Delivery 复用 Library 二元详情/浏览器原生 attachment，不经 `/api/session` hash/Blob。
- `use-session-engine.ts`（client 组件）：`useSessionEngine(engine|null)`——全仓唯一
  React 接缝（useSyncExternalStore）。

## 关键协作者

- 下游依赖：`core/*`（reducer/state/hydration/conversations）、`contract/*`（zod 真源）、
  `lib/persisted-store`（跨 tab storage 事件）。
- 上游：页面装配层持有 engine 实例（页面级、仅浏览器创建）。

## 运行时约束

- 三重代际守卫（stream/hydrate/filesSync）：关流/切会话后迟到回调一律丢弃。
- 已观察终态后，仅当前 session/generation 的成功权威快照在无 successor、无新 live 进度时关闭旧流并恢复 connected；活动或 successor 重连、缺失/失败快照仍不放行提交。
- run 收尾对账吸收 snapshot.files、snapshot.deliveries/has_more；以二元 ID 合并同步期间晚到 live，
  避免旧快照抹掉新成果。仅稳定 `event_cursor_expired` HTTP 410 重快照再续 watermark。
- 事件微任务窗口批量折叠一次（replay 洪峰不逐事件快照）。
- control body 不携带旧的 `decision_id`；cancel/resume/steer 均通过 `Idempotency-Key` 传递
  稳定 command identity。resume 重试不得换新 command id；body 保持
  `{kind, session_id, decisions}`（cancel 为 `{kind, session_id}`，steer 另带 message/content）。
- control 撞 STALE 冲突码（run_not_active/no_pending_pause/session_deleted）→ 清暂存 +
  snapshot 对账重水合，绝不把用户卡死在 awaiting-hitl。
- awaiting-hitl 与已见 live 事件的 streaming 撤 90s 兜底；仅 reattaching 持 TIMEOUT 计时。

## 扩展规则

- 新用户动作 = 引擎新方法 + 状态机新事件（先在 transition 补迁移，规格测试主战场）。
- 浏览器 I/O 一律进 engine/client，不得散落进组件；组件只消费 EngineSnapshot。

## 项目技能选择意图

`setSelectedSkillSourceRefs(undefined)`恢复作用域默认（Project省略继承、Direct为[]），[]明确不选，非空refs显式覆盖。execution adapter只构造wire，machine负责新会话/切换退休与未知提交冻结；重试不重新读取当前偏好。

- `EngineSnapshot.hasPendingSubmission` 只读投影原冻结 create 是否仍未获回执，供浏览器 scope 租约保护使用；不同于仅在合法 error 相位为真的 `canRetryPendingSubmission`。不作为服务端成功或授权证明，不落盘。

- `client.listModels` 只聚合正式 `feature_key=chat` 目录：逐页传递 opaque cursor，整次读取共用 10 秒预算和 caller 取消；重复 cursor/业务标签、非 chat 候选或超过 100 页均失败，不以部分列表冒完整成功。返回完整列表与 `next_cursor: null`，wire 本身不变。

当前会话MCP：`setSelectedMcpConnectionIds`只接受正式有界唯一ID并复制/冻结，`selectedMcpConnectionIds`快照可供选择器订阅；new/select/外部退休/dispose清空，首次本地会话准入保留。adapter仅非空时发送`selected_mcp_connection_ids`；pending options复制首发数组，同key unknown/retry不随之后选择变化，未选原wire不变；无持久化或trace推导。

CHAT-1：可选draftLifecycle显式注入浏览器来源退休I/O；无adapter不持久恢复New证明。New保持原conv ID，首次POST/retry先确认独立退休标记，失败保输入和原pending key/body。正向localDraft仅在未退休时恢复，历史无字段/读取故障仍走owner，不按404猜draft。

## Route-owned ordered body reads

`engine-types.ts` declares the narrow `MessagePartsReadTarget` (exact scope + conversation) and optional injected-view port; canonical `machine.ts` always implements it. Browser factories seed a target or explicit null before eager metadata hydration. Only parts/body reads are gated: snapshot/execution_head, pending/unknown journal keys and owned SSE/stop remain unchanged. Route retirement aborts and queues unfinished reads with their original cursor/fresh intent and bounded live suffix journal; matching reentry resumes, while foreign scope/ID and late pages remain fenced. No new transport or persisted state.

- `client.listModels` 的 429 专用 `ModelCatalogReadError` 保留原 HTTP status/code 与有界 `retryAfterMs`：仅接受 0–86400 的十进制 delta-seconds，0 最小冷却 1 秒；缺失、畸形或超界使用 30 秒。此元数据只供目录 GET 的后续前台唤醒使用，客户端不自动重发，其他 HTTP 错误消费者不变；同一完整目录原 10 秒预算、分页与取消保持。
