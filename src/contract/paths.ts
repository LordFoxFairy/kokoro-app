// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

export const SESSION_RUN_ACTIVE = "session_run_active"
export const LAST_EVENT_ID_HEADER = "last-event-id"

// IDs and hashes are opaque path segments. Encode them at the shared contract
// boundary so a value containing `/`, `?`, `#`, or `%` cannot change the
// upstream route shape. Virtual file paths are display only.
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
export function workspaceOutputContentPath(sessionId: string, runId: string, versionId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/runs/${opaquePathSegment(runId)}/workspace-outputs/${opaquePathSegment(versionId)}/content`
}
export function controlPath(sessionId: string, runId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/runs/${opaquePathSegment(runId)}/control`
}
export function runProcessPath(sessionId: string, runId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/runs/${opaquePathSegment(runId)}/process`
}
export function sessionsPath(): string {
  return `/sessions`
}
export function billingCreditAccountPath(): string {
  return `/billing/credit-account`
}
export function billingSummaryPath(): string {
  return `/billing/summary`
}
export function billingLedgerPath(): string {
  return `/billing/ledger`
}
export function modelCandidatesPath(): string {
  return `/models`
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
export function moveSessionPath(sessionId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/move`
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

export function scheduledTaskExecutionsPath(): string {
  return `${scheduledTasksPath()}/executions`
}

export function messagePartsPath(sessionId: string, messageId: string): string {
  return `/sessions/${opaquePathSegment(sessionId)}/messages/${opaquePathSegment(messageId)}/parts`
}
