HMR RAM：页面Engine可沿用旧thread；纯normalizer仅将旧cancelledRuns中已确认true迁为cancelled并退休旧字段。新读容忍缺map，写入口一次规范后幂等；不由textState/runStatus补成功，不改消息/草稿或持久状态。

取消投影：只有真实 run.completed(cancelled) 或私有 MessageRead 显式 terminal_status=cancelled 进入唯一 exact runTerminalsById（completed/cancelled/failed），不与cancelmap并存；真实Run完成/失败与可信snapshot status写该索引；TEXT_END不写。失败空正文／无profile不推断取消，本地 markRunCancelled 只收工具，不造远端终态。取消不改变文字／ordered parts完整性。

<!-- Ordered messages: nullable private descriptors keep an owner marker + per-Message unread/loading/partial/changed state. mergeMessageParts restores scalar text slots and safe activities at exact decimal public ledger positions, then replays newer publicSequence events. Agent seq and opaque SSE resumeCursor are separate coordinates. -->
# core — 纯状态模型与事件折叠（零 I/O 零 React）

## 职责

web 的领域核心：会话线程状态、事件折叠 reducer、渲染投影、snapshot 水合、
多会话列表索引与其落盘 schema。全部纯函数，词汇直接取自 contract（z.infer 即领域类型）。

## 公开 API

- `state.ts`：`SessionStreamState`（messages/todos/executionProcess/stepsByRun/runStatus/runError/
  activeRunId/lastSeq/resumeCursor/files/deliveries/meta + seenEventIds 内存去重集）、`createSessionStreamState`；
  `executionProcess` 是 public7 selected Run 的 Todo 与 safe activity 视图，`SessionMessage`/`SessionDelivery`
  分别承载正文与成果（成果以 conversationId + artifactId 标识）
  及契约派生类型别名；`RunFailure` 是 agent safe profile / dispatch / generic 的 closed union，不保存 raw error）。
- `reducer.ts`
  - `applyChatProjectionEvents(state, events)`：批量折叠——event_id 幂等去重、整批一次顶层快照、
    可变草稿逐事件折叠（修 replay O(n²)）；全部重复时原样返回入参（引用相等表达幂等）。
  - `applyChatProjectionEvent`：单事件包装。
  - 本地命令（非事件折叠）：`appendUserMessage`（本地 echo，usr_ 前缀 id）、
    `markToolRejected`（拒绝乐观置位，防回流翻绿勾）、`markRunCancelled`（停止本地收口）。
- `projections.ts`：`buildThreadItems`（连续同 runId assistant 归并为 turn；safe process 可在首 token 前建立 turn；纯派生，
  渲染层唯一读取模型）、`groupSegments`/`Segment`（live safe activity 与正文按真实步骤顺序交错，连续相邻活动合组；
  没有首次位置锚点的旧 snapshot activity 保原 opaque segment fallback，不猜历史顺序）、
  `currentRunProgressTodos`（只派生 exact 当前非 queued head 对应 selected process 的计划；终态/历史计划不冒 active 进度，不改原 Todo 状态）。
- `hydration.ts`：`stateFromSnapshot`——从 BFF 同一事务 snapshot 水合
  messages/pending pauses/meta/files/deliveries/activeRunId，并保存 `event_watermark` 为
  `resumeCursor`；尾部 settled failed assistant 在无 active/HITL 时按 Message.failure 恢复 agent 或 generic safe failure，
  随后只续 watermark 之后的 AG-UI ledger frame。`deliveryFromSnapshot`——
  snapshot delivery 的 snake→camel 投影（engine run 收尾对账复用）。
- `conversations.ts`：`ConversationStore` 列表索引纯操作（add/touch/select/remove/
  setActiveMode/sortedConversations/conversationTitle）；`AgentMode`（纯 UI 偏好，不上 wire）。
- `persistence.ts`：`parseStoredConversationStore`——落盘 zod schema，只存 UI 偏好与
  列表索引（消息/run/暂停点真源在服务端）；旧形状判脏重建。

## 关键协作者

- 上游消费：`engine/machine.ts`（唯一编排者）、渲染组件（经 projections 读取）。
- 下游依赖：仅 `@/contract/*` 类型；无 React、无 fetch、无 storage。

## 运行时约束

- 折叠幂等靠内部 projection `event_id`（即 AG-UI frame cursor）；`lastSeq` 只维护内部
  Agent numeric source 顺序，BFF dispatch 的十进制 string `sourceSequence` 不进入 `lastSeq`；网络续流只使用不可解析的
  `resumeCursor`。
- 终态 runStatus/runError 是单槽投影：仅在无在途锚点或终态属在途 run 时写——
  reattach 全量回放里历史 run 的终态不得覆写在途 run。
- selected process activity 以 activity_id 替换完整值并保留首次位置；Todo 每帧有序全值替换，`null` 与 `[]` 不合并。
- 新观察的 live safe activity 同时记录 `SessionStep.activity` 的首次真实 `event.seq`；同 activity_id 后续更新原槽，
  不移动、不重复。旧 snapshot 已有但无锚点的活动更新不伪造首次位置；正文 item 是合组边界，所有公开正文保持常显。
  本片不改 hydration/wire、不将同一 text segment 后继 delta 拆成新 message，也不声明历史 timeline 或 final phase 已恢复。

## 扩展规则

- 新 ChatProjectionEvent kind：reducer 的 switch 有 never 穷尽守卫，必须显式接收（哪怕不投影）。
- 新派生视图放 projections.ts，不在组件里手写归组。
- 本目录禁止引入 I/O、React、副作用；一切编排归 engine。

## 当前陷阱

- message.user 三态吸收（id 命中更新 / 本地 echo 就地改 id / 新建）：SSE 常跑赢 HTTP 回执。
- delivery.created 以 `(conversationId, artifactId)` 幂等（非 hash）；同 hash 的不同成果保留两件。
- snapshot 最近 100 件与 `deliveriesHasMore` 一并水合；完整历史由 Library 分页读取。

CHAT-1：ConversationEntry可选literal localDraft，activeIsLocalDraft/retireLocalDraft只操作UI来源，不表示owner存在；索引元数据不能撤销独立提交退休标记。

CHAT-ORDER empty boundaries: groupSegments accepts the current messagesById; only a completed whole-body fact with exact empty content is invisible between activity slots. Body-less END and incomplete/unread text never establish empty completion. SessionMessage.textState is internal provenance from full message.completed, complete owner parts, or inline completed body, not a new wire/Run phase.
