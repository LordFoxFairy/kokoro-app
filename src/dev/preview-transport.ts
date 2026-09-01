// 显式开发模式假流：与 SessionClient 同接口，只经 env 开关注入，永不作运行时兜底。

import {
  parseSessionEvent,
  RUN_FAILURE_CODES,
  type RunFailureCode,
  type SessionEvent,
} from "@/contract/session-events"
import type { SessionSnapshot } from "@/contract/http"
import type {
  EventStreamHandle,
  OpenEventsArgs,
  SessionClient,
} from "@/engine/client"

// 仅当显式设置 NEXT_PUBLIC_SESSION_PREVIEW=1 时提供假流客户端；否则返回 null（走真实链路）。
// 单例缓存：清单客户端与引擎客户端共享同一份内存会话（否则各持一份 Map，侧栏永远看不到已开会话）。
let previewSingleton: SessionClient | null = null
export function previewClientFromEnv(): SessionClient | null {
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SESSION_PREVIEW !== "1") {
    return null
  }
  if (!previewSingleton) {
    previewSingleton = createPreviewClient()
  }
  return previewSingleton
}

type PreviewSession = {
  seq: number
  started: boolean
  queued: SessionEvent[]
  history: SessionEvent[]
  subscriber: { generation: number; onEvent: OpenEventsArgs["onEvent"] } | null
  streamGeneration: number
  // 清单展示用：首条消息内容充当标题 + 最近活动时间（切走后会话仍留在侧栏，供 HITL 徽标走查）。
  title: string
  updatedAt: string
  projectRef: string | null
}

const PREVIEW_STORAGE_KEY = "kokoro.preview.sessions.v1"

type PersistedPreviewSession = Pick<PreviewSession, "seq" | "started" | "history" | "title" | "updatedAt" | "projectRef">

function previewStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readPersistedSessions(): Map<string, PersistedPreviewSession> {
  const storage = previewStorage()
  if (!storage) return new Map()
  try {
    const raw: unknown = JSON.parse(storage.getItem(PREVIEW_STORAGE_KEY) ?? "null")
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return new Map()
    const restored = new Map<string, PersistedPreviewSession>()
    for (const [sessionId, value] of Object.entries(raw)) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) continue
      const candidate = value as Partial<PersistedPreviewSession>
      const history = Array.isArray(candidate.history)
        ? candidate.history.flatMap((event) => {
            try {
              return [parseSessionEvent(event)]
            } catch {
              return []
            }
          })
        : []
      const seq = Math.max(
        typeof candidate.seq === "number" && Number.isInteger(candidate.seq) ? candidate.seq : 0,
        ...history.map((event) => event.seq),
      )
      const title = typeof candidate.title === "string" ? candidate.title : ""
      const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString()
      const projectRef = typeof candidate.projectRef === "string" ? candidate.projectRef : null
      const started = candidate.started === true || history.some((event) => event.kind === "session.created")
      if (started && history.length > 0) {
        restored.set(sessionId, { seq, started, history, title, updatedAt, projectRef })
      }
    }
    return restored
  } catch {
    return new Map()
  }
}

const PREVIEW_TODOS = [
  { content: "理解任务范围", status: "completed" as const },
  { content: "整理执行步骤", status: "in_progress" as const },
  { content: "检查结果", status: "pending" as const },
  { content: "交付完成", status: "pending" as const },
]
const COMPLETED_PREVIEW_TODOS = PREVIEW_TODOS.map((todo) => ({
  ...todo,
  status: "completed" as const,
}))

// Keep the local catalogue small and deterministic, while still projecting
// the model affordances visible in Manus' creation workflows. The site shell
// decides which workflow can show this list; the transport only owns the API
// shape and fixture data.
const PREVIEW_MODELS = [
  { provider: "kokoro", name: "standard-new", is_default: true, display_name: "标准 新" },
  { provider: "openai", name: "gpt-image-2", is_default: false, display_name: "GPT Image 2" },
] as const

export function createPreviewClient(options?: { stepMs?: number }): SessionClient {
  const stepMs = options?.stepMs ?? 40
  // Constructing the browser client happens during AppFrame render. Do not
  // synchronously parse the complete preview event log there: a long local
  // history would block the first shell paint and make a refresh look like a
  // stalled workspace. Transport operations await this one shared restore,
  // so persistence remains deterministic without making construction costly.
  const sessions = new Map<string, PreviewSession>()
  let restored = false
  let restorePromise: Promise<void> | null = null
  const restoreSessions = (): void => {
    for (const [sessionId, persisted] of readPersistedSessions()) {
      if (sessions.has(sessionId)) continue
      sessions.set(sessionId, {
        ...persisted,
        queued: [],
        subscriber: null,
        streamGeneration: 0,
      })
    }
    restored = true
  }
  const ensureRestored = (): Promise<void> => {
    if (restored) return Promise.resolve()
    if (restorePromise) return restorePromise
    restorePromise = new Promise<void>((resolve) => {
      const run = (): void => {
        restoreSessions()
        resolve()
      }
      if (typeof window === "undefined") {
        queueMicrotask(run)
      } else {
        // Give the browser a paint opportunity before parsing a potentially
        // large localStorage event log. All transport calls share the same
        // scheduled work and therefore never parse it more than once.
        window.setTimeout(run, 0)
      }
    })
    return restorePromise
  }
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let runCounter = 0
  let persistScheduled = false

  const persistSessions = (): void => {
    const storage = previewStorage()
    if (!storage) return
    try {
      const payload: Record<string, PersistedPreviewSession> = {}
      for (const [sessionId, session] of sessions) {
        payload[sessionId] = {
          seq: session.seq,
          started: session.started,
          history: session.history,
          title: session.title,
          updatedAt: session.updatedAt,
          projectRef: session.projectRef,
        }
      }
      storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Preview remains usable when storage is unavailable or quota-limited.
    }
  }

  const schedulePersistSessions = (): void => {
    if (persistScheduled) return
    persistScheduled = true
    // A single submission appends session.created, message.user and the run
    // batch in separate reducer-shaped calls. Coalesce those writes so a
    // growing preview history is serialized once per turn rather than once
    // per event batch on the main thread.
    queueMicrotask(() => {
      persistScheduled = false
      persistSessions()
    })
  }

  const sessionFor = (sessionId: string): PreviewSession => {
    const existing = sessions.get(sessionId)
    if (existing) {
      return existing
    }
    const created: PreviewSession = {
      seq: 0,
      started: false,
      queued: [],
      history: [],
      subscriber: null,
      streamGeneration: 0,
      title: "",
      updatedAt: new Date().toISOString(),
      projectRef: null,
    }
    sessions.set(sessionId, created)
    return created
  }

  const drain = (session: PreviewSession, generation: number): void => {
    const subscriber = session.subscriber
    if (!subscriber || subscriber.generation !== generation || session.queued.length === 0) {
      return
    }
    const event = session.queued.shift()
    if (event) {
      subscriber.onEvent(event)
    }
    const timer = setTimeout(() => {
      timers.delete(timer)
      drain(session, generation)
    }, stepMs)
    timers.add(timer)
  }

  const drainActive = (session: PreviewSession): void => {
    const generation = session.subscriber?.generation
    if (generation === undefined) return
    drain(session, generation)
  }

  const queueEvents = (session: PreviewSession, events: SessionEvent[]): void => {
    session.history.push(...events)
    session.queued.push(...events)
    schedulePersistSessions()
  }

  const makeEnvelope = (sessionId: string, runId: string) => {
    return (kind: SessionEvent["kind"], payload: unknown): SessionEvent => {
      const session = sessionFor(sessionId)
      session.seq += 1
      // 假流同样过契约 parse：既保证 preview 与真实 wire 同形，也免去任何类型断言。
      return parseSessionEvent({
        // 事件可能分批生成（例如 HITL 决策后的续流），因此不能让每次
        // makeEnvelope 都从 1 开始，否则续流会被 seenEventIds 当成首批事件去重。
        event_id: `${runId}:${session.seq}`,
        seq: session.seq,
        session_id: sessionId,
        run_id: runId,
        timestamp: new Date().toISOString(),
        kind,
        payload,
      })
    }
  }

  const enqueueRun = (sessionId: string, runId: string, content: string, projectRef?: string): void => {
    const session = sessionFor(sessionId)
    const envelope = makeEnvelope(sessionId, runId)
    const segmentId = `${runId}:seg_1`
    // 记账清单元数据：首条消息内容作标题，每轮刷新活动时间。
    if (session.title === "") {
      session.title = content
    }
    session.updatedAt = new Date().toISOString()
    if (projectRef !== undefined) session.projectRef = projectRef
    // The preview fixture carries the same four-step progress projection as
    // the desktop workbench. This keeps the local shell honest to the real
    // contract instead of leaving TodoBar untested until System is connected.
    if (!session.started) {
      // 与 session 合成语义对齐：首个 run 携带 session.created（sessions 集合元数据）。
      session.started = true
      queueEvents(session, [envelope("session.created", { title: content, owner_id: "local-user" })])
    }
    // Persist the user turn as a normal wire event. It is absorbed by the
    // optimistic echo during the live run and reconstructs the user bubble when
    // a refreshed preview page replays the event history.
    queueEvents(session, [envelope("message.user", { message_id: `${runId}:user`, content })])
    // 预览待批态演练：消息以 `!hitl` 起头则合成 tool.awaiting_approval 并停在待批（不发 run.completed），
    // 供 HITL-NOTIFY 跨会话徽标/通知人工走查。仅 dev 假流内可达，不影响真实链路。
    if (content.trim().startsWith("!hitl")) {
      const toolId = `${runId}:tool_1`
      const args = { command: "rm -rf /tmp/preview-demo" }
      queueEvents(session, [
        envelope("run.created", { run_id: runId }),
        envelope("todo.updated", { todos: PREVIEW_TODOS }),
        envelope("thinking.delta", { segment_id: segmentId, delta: "正在准备一次工具调用。" }),
        envelope("tool.invoked", { segment_id: segmentId, tool_id: toolId, name: "shell", args }),
        envelope("tool.awaiting_approval", {
          segment_id: segmentId,
          tool_id: toolId,
          name: "shell",
          args,
          description: "预览：这次工具调用正在等待你的批准。",
          allowed_decisions: ["approve", "reject"],
          kind: "tool_approval",
          editable: false,
          pending_tool_ids: [toolId],
        }),
      ])
      drainActive(session)
      return
    }
    // Long-answer fixture: keeps desktop visual QA grounded in the real
    // reducer/stream/render path instead of a separate static mock route.
    if (content.trim().startsWith("!long")) {
      const longAnswer = [
        "## 网站需求梳理",
        "我先把这个任务拆成可执行的四个阶段：明确目标、整理内容、确定页面结构，以及在交付前完成体验检查。",
        "### 建议的第一步",
        "请补充目标用户、核心转化动作和已有素材。拿到这些信息后，Kokoro 会先产出站点地图与首页内容提纲，再进入视觉和实现细化。",
        "### 交付清单",
        "- 首页信息架构与主要行动入口\n- 页面与模块优先级\n- 内容和素材缺口\n- 上线前体验检查项",
      ].join("\n\n")
      queueEvents(session, [
        envelope("run.created", { run_id: runId }),
        envelope("todo.updated", { todos: PREVIEW_TODOS }),
        envelope("thinking.delta", { segment_id: segmentId, delta: "正在整理网站需求结构。" }),
        envelope("message.completed", { segment_id: segmentId, content: longAnswer }),
        envelope("todo.updated", { todos: COMPLETED_PREVIEW_TODOS }),
        envelope("run.completed", { status: "completed" }),
      ])
      drainActive(session)
      return
    }
    // 预览失败态演练：消息以 `!fail:<code>` 起头则合成对应 run.failed，供 ERROR-UX 卡片人工走查。
    // 仅 dev 假流内可达（NEXT_PUBLIC_SESSION_PREVIEW=1），不影响真实链路。
    // Preview Canvas fixture: exercise the delivery card and Canvas shell
    // locally without a BFF or a fake file endpoint.
    if (content.trim().startsWith("!delivery")) {
      queueEvents(session, [
        envelope("run.created", { run_id: runId }),
        envelope("todo.updated", { todos: PREVIEW_TODOS }),
        envelope("thinking.delta", { segment_id: segmentId, delta: "正在整理一份预览成果。" }),
        envelope("message.completed", { segment_id: segmentId, content: "预览成果已准备好。" }),
        envelope("delivery.created", {
          path: "out/preview-report.pdf",
          title: "预览调研报告",
          mime: "application/pdf",
          size: 24_576,
          content_hash: "preview-delivery-report",
          note: "这是本地预览成果，用于检查 Canvas 布局与操作状态。",
        }),
        envelope("run.completed", { status: "completed" }),
      ])
      drainActive(session)
      return
    }
    const failMatch = /^!fail:([a-z_]+)/.exec(content.trim())
    if (failMatch) {
      const requestedCode = failMatch[1]
      // Keep the preview command forgiving: a typo must exercise the normal
      // error card, not throw from parseSessionEvent inside a timer callback.
      // Real SSE payloads remain strict and are rejected by engine/client.ts.
      const code: RunFailureCode = RUN_FAILURE_CODES.includes(requestedCode as RunFailureCode)
        ? requestedCode as RunFailureCode
        : "internal_error"
      queueEvents(session, [
        envelope("run.created", { run_id: runId }),
        envelope("todo.updated", { todos: PREVIEW_TODOS }),
        envelope("thinking.delta", { segment_id: segmentId, delta: "正在整理预览回复。" }),
        envelope("run.failed", {
          code,
          error_kind: "PreviewSyntheticError",
          message: `Synthetic failure for preview: ${requestedCode}${code === requestedCode ? "" : " (using internal_error)"}\n  at previewTransport.enqueueRun (dev harness)`,
        }),
      ])
      drainActive(session)
      return
    }
    queueEvents(session, [
      envelope("run.created", { run_id: runId }),
      envelope("todo.updated", { todos: PREVIEW_TODOS }),
      envelope("thinking.delta", { segment_id: segmentId, delta: "正在整理预览回复。" }),
      envelope("message.delta", { segment_id: segmentId, delta: "预览模式：已收到「" }),
      envelope("message.delta", { segment_id: segmentId, delta: `${content}」。` }),
      envelope("message.completed", {
        segment_id: segmentId,
        content: `预览模式：已收到「${content}」。`,
      }),
      envelope("todo.updated", { todos: COMPLETED_PREVIEW_TODOS }),
      envelope("run.completed", { status: "completed" }),
    ])
    drainActive(session)
  }

  return {
    // Preview metadata and event history are persisted locally so a refresh or
    // route remount does not turn an existing project Chat URL into an empty
    // shell. The values are synthetic fixtures only; production never enters
    // this client.
    listSessions: async (_cursor, scope = { kind: "direct" }) => {
      await ensureRestored()
      return {
        sessions: [...sessions.entries()]
          .filter(([, s]) => s.started && (scope.kind === "project" ? s.projectRef === scope.projectRef : s.projectRef === null))
          .map(([id, s]) => ({ session_id: id, title: s.title || id, updated_at: s.updatedAt }))
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
      }
    },

    // The preview catalog mirrors the two creation-specific model labels used
    // by the desktop reference. Neutral/Website/App states hide this control
    // at the shell boundary, so the catalogue never adds toolbar noise there.
    listModels: () => Promise.resolve({ models: [...PREVIEW_MODELS] }),

    // 预览档无 namespace profile 源：agent 候选恒为空（输入框据此隐藏 agent 选择器）。
    listAgents: () => Promise.resolve({ agents: [] }),

    // The live Manus baseline is an empty library for a new workspace. Keep
    // the route-level preview honest instead of inventing tenant artifacts;
    // interaction tests inject explicit fixtureArtifacts when they need cards.
    listArtifacts: () => Promise.resolve({ artifacts: [] }),
    createShare: () => Promise.resolve({ share_id: "shr_preview_0000000000000000000000000000" }),
    revokeShare: () => Promise.resolve({ ok: true }),

    createMessage: async (sessionId, body) => {
      await ensureRestored()
      runCounter += 1
      const runId = `run_preview_${runCounter}`
      enqueueRun(sessionId, runId, body.content, body.project_ref)
      return {
        run_id: runId,
        user_message_id: `${runId}:user`,
        assistant_message_id: `${runId}:assistant`,
      }
    },

    fetchSnapshot: async (sessionId): Promise<SessionSnapshot | null> => {
      await ensureRestored()
      const session = sessions.get(sessionId)
      if (!session?.started) return null
      const firstEvent = session.history[0]
      let activeRunId: string | null = null
      for (const event of session.history) {
        if (event.kind === "run.created") activeRunId = event.payload.run_id
        if (event.kind === "run.completed" || event.kind === "run.failed") activeRunId = null
      }
      return {
        session: {
          session_id: sessionId,
          title: session.title || sessionId,
          owner_id: "local-user",
          created_at: firstEvent?.timestamp ?? session.updatedAt,
          updated_at: session.updatedAt,
        },
        ...(activeRunId !== null ? { active_run: { run_id: activeRunId, status: "running" } } : {}),
        pending_pauses: [],
        files: [],
        deliveries: [],
        event_watermark: session.seq,
      }
    },

    // The preview transport must close the same loop as the real session
    // service. Keeping HITL at "已记录你的决定…" forever made the visual
    // fixture look like a UI deadlock and prevented auditing the settled
    // approval/rejection states. Emit the normal post-control event sequence
    // through the existing SSE queue so the engine exercises its real reducer.
    sendControl: async (sessionId, runId, body) => {
      await ensureRestored()
      const session = sessionFor(sessionId)
      const envelope = makeEnvelope(sessionId, runId)
      const segmentId = `${runId}:seg_1`
      if (body.kind === "run.cancel") {
        queueEvents(session, [
          envelope("run.completed", { status: "cancelled" }),
        ])
      } else if (body.kind === "run.resume") {
        const decision = body.decisions[0]
        const rejected = decision?.type === "reject"
        queueEvents(session, [
          envelope("todo.updated", { todos: COMPLETED_PREVIEW_TODOS }),
          envelope("tool.returned", {
            segment_id: segmentId,
            tool_id: `${runId}:tool_1`,
            name: "shell",
            result: rejected ? "预览工具已拒绝。" : "预览工具已执行。",
            is_error: rejected,
          }),
          envelope("message.completed", {
            segment_id: `${runId}:seg_2`,
            content: rejected ? "已拒绝这次工具调用。" : "工具调用已完成。",
          }),
          envelope("run.completed", { status: "completed" }),
        ])
      }
      drainActive(session)
      return { ok: true }
    },
    deleteSession: () => Promise.resolve({ status: "deleted" }),
    renameSession: () => Promise.resolve({ ok: true as const }),

    openEvents: ({ sessionId, lastEventId = 0, onEvent }): EventStreamHandle => {
      let closed = false
      let session: PreviewSession | null = null
      let generation: number | null = null
      void ensureRestored().then(() => {
        if (closed) return
        session = sessionFor(sessionId)
        generation = session.streamGeneration + 1
        session.streamGeneration = generation
        session.subscriber = { generation, onEvent }
        // Rebuild pending delivery from persisted history. This lets a refreshed
        // project deep link replay the same reducer path instead of rendering an
        // empty shell after the in-memory preview client was recreated. The
        // cursor is local to this stream: returning to a previous conversation
        // must honor that call's Last-Event-ID rather than a stale cursor from a
        // different conversation or an earlier stream.
        session.queued = session.history.filter((event) => event.seq > lastEventId)
        drain(session, generation)
      })
      return {
        close: () => {
          closed = true
          if (session !== null && generation !== null && session.subscriber?.generation === generation) {
            session.subscriber = null
            session.queued = []
          }
        },
      }
    },
  }
}
