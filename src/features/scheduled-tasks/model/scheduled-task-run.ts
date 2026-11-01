export type ScheduledTaskRunsQuery = Readonly<{ limit: number; taskId?: string; cursor?: string }>
export type ScheduledTaskRunState = "pending" | "admission_unknown" | "admitted" | "dispatch_failed" | "completed" | "cancelled" | "failed"
export type ScheduledTaskRun = Readonly<{
 taskId: string; title: string; projectRef: string | null; runId: string; triggerKind: "calendar" | "rss"; scheduledFor: string | null; observedAt?: string
 state: ScheduledTaskRunState; terminalEventAt: string | null
}>
export type ScheduledTaskRunPage = Readonly<{ items: readonly ScheduledTaskRun[]; nextCursor: string | null }>
export type ScheduledTaskRunsReader = (query: ScheduledTaskRunsQuery, signal: AbortSignal) => Promise<ScheduledTaskRunPage>
