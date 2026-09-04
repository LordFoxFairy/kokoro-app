# engine — 会话引擎（状态机 + 浏览器 I/O 唯一编排者）

## 职责

显式会话状态机与 framework-free 引擎：snapshot-first 水合、SSE 流句柄、HITL 决策暂存、
重连/超时收口、多 tab 同步。React 只经 `use-session-engine` 一个接缝订阅快照。

## 公开 API

- `machine.ts`
  - `createSessionEngine(deps) → SessionEngine`：唯一的引擎编排入口；submit（运行中插话转
    steer POST，不动状态机）/ retry（未回执重试复用 idempotency_key）/ cancelRun /
    stageToolDecision / selectConversation / newConversation / deleteConversation / setMode /
    dispose。
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
    引擎依赖契约）；瞬态通知发 i18n key 不落文案。
- `client.ts`：`createSessionClient({baseUrl}) → SessionClient`——全部入站过
  contract zod，失败以 `SessionClientError`（network/http/parse）上抛零静默降级；
  baseUrl+path 直接拼接（非 new URL，保住 `/api/session` 前缀）；AUTH-P0 起客户端不持
  token，鉴权由同源 BFF 代理注入 Bearer、httpOnly 信封 cookie 同源自动携带；
  `openEvents` 只委托 `AgUiChatTransport`；`fetchSnapshot` 404/410 返 null（空线程即真态）。
- `agui-chat-transport.ts`：仓内唯一 AG-UI network adapter，实现 Vercel AI SDK
  `ChatTransport<KokoroUiMessage>`；负责 SSE framing、严格 runtime schema、opaque
  `Last-Event-ID`、断线重连与 frame cursor 去重，拒绝 reducer-shaped legacy wire。
- `agui-event-mapper.ts`：把已校验 AG-UI frame 分别映射成 AI SDK `UIMessageChunk` 与
  `ChatProjectionEvent`；wire DTO 不进入 core/UI model。
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
- `file-fetch.ts`（client 组件）：`fileFetch`/`useFileBlob`——files/deliveries 走同源
  `/api/session` 代理，鉴权由 httpOnly 信封 cookie 自动携带（前端不持 token）；仍 fetch→blob
  →object URL 供预览/下载（结果被替换/卸载即 revoke；loading 为键控派生，无 effect 同步 setState）。
- `use-session-engine.ts`（client 组件）：`useSessionEngine(engine|null)`——全仓唯一
  React 接缝（useSyncExternalStore）。

## 关键协作者

- 下游依赖：`core/*`（reducer/state/hydration/conversations）、`contract/*`（zod 真源）、
  `lib/persisted-store`（跨 tab storage 事件）。
- 上游：页面装配层持有 engine 实例（页面级、仅浏览器创建）。

## 运行时约束

- 三重代际守卫（stream/hydrate/filesSync）：关流/切会话后迟到回调一律丢弃。
- run 收尾对账吸收 snapshot.files 与 snapshot.deliveries（成果整表替换，contentHash 同形）。
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
