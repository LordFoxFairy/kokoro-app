// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

export const SESSION_RUN_ACTIVE = "session_run_active"
export const LAST_EVENT_ID_HEADER = "last-event-id"

// IDs and hashes are opaque path segments. Encode them at the shared contract
// boundary so a value containing `/`, `?`, `#`, or `%` cannot change the
// upstream route shape. Hierarchical file paths are encoded by their caller
// one segment at a time and remain intentionally separate from this helper.
function opaquePathSegment(value: string): string {
  return encodeURIComponent(value)
}

export function messagesPath(sessionId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/messages`
}
export function snapshotPath(sessionId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}`
}
export function eventsPath(sessionId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/events`
}
export function filePath(sessionId: string, path: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/files/${path}`
}
export function deliveryPath(sessionId: string, contentHash: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/deliveries/${opaquePathSegment(contentHash)}`
}
export function controlPath(sessionId: string, runId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/runs/${opaquePathSegment(runId)}/control`
}
export function controlReceiptPath(sessionId: string, runId: string, commandId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/runs/${opaquePathSegment(runId)}/control/${opaquePathSegment(commandId)}`
}
export function sessionsPath(): string {
  return `/sessions`
}
export function billingSummaryPath(): string {
  return `/billing/summary`
}
export function billingLedgerPath(): string {
  return `/billing/ledger`
}
export function billingByModelPath(): string {
  return `/billing/by-model`
}
export function modelCandidatesPath(): string {
  return `/models`
}
export function agentCandidatesPath(): string {
  return `/agents`
}
export function artifactsPath(): string {
  return `/artifacts`
}
export function artifactContentPath(contentHash: string): string {
  return `/artifacts/${opaquePathSegment(contentHash)}`
}
export function sharePath(sessionId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/share`
}
export function sharedSnapshotPath(shareId: string): string {
  return `/shared/${opaquePathSegment(shareId)}`
}
export function renameSessionPath(sessionId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/title`
}
export function scheduledTasksPath(): string {
  return "/api/scheduled-tasks"
}
export function scheduledTaskPath(taskId: string): string {
  return `/api/scheduled-tasks/${encodeURIComponent(taskId)}`
}
export function scheduledTaskRetryPath(taskId: string): string {
  return `${scheduledTaskPath(taskId)}/retry`
}
