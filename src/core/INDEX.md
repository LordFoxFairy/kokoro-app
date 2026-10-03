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
  渲染层唯一读取模型）、`groupSegments`/`Segment`（正文锚点与 public7 safe activity 按 opaque segment 聚合）。
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

## 扩展规则

- 新 ChatProjectionEvent kind：reducer 的 switch 有 never 穷尽守卫，必须显式接收（哪怕不投影）。
- 新派生视图放 projections.ts，不在组件里手写归组。
- 本目录禁止引入 I/O、React、副作用；一切编排归 engine。

## 当前陷阱

- message.user 三态吸收（id 命中更新 / 本地 echo 就地改 id / 新建）：SSE 常跑赢 HTTP 回执。
- delivery.created 以 `(conversationId, artifactId)` 幂等（非 hash）；同 hash 的不同成果保留两件。
- snapshot 最近 100 件与 `deliveriesHasMore` 一并水合；完整历史由 Library 分页读取。
