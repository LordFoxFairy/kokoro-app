// Notification eligibility is local to this engine, not a second task fact source.
import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import type { MessageCreateReceipt, SessionSnapshot } from "@/contract/http"

export type TaskNotification = Readonly<{ kind: "awaiting" | "completed"; sessionId: string; runId: string }>

export function createTaskNotifications() {
  let sessionId: string | null = null
  let disposed = false
  let generation = 0
  const anchors = new Set<string>()
  const terminal = new Set<string>()
  const pauses = new Map<string, Set<string>>()
  const revisions = new Map<string, number>()
  const listeners = new Set<(signal: TaskNotification) => void>()
  function select(next: string | null): void {
    if (sessionId === next) return
    generation += 1
    sessionId = next
    anchors.clear(); terminal.clear(); pauses.clear(); revisions.clear()
  }
  function anchorReceipt(session: string, receipt: MessageCreateReceipt, epoch = generation): void {
    if (!disposed && epoch === generation && session === sessionId && !terminal.has(receipt.run_id)) anchors.add(receipt.run_id)
  }
  function anchorSnapshot(session: string, snapshot: SessionSnapshot, epoch = generation): void {
    if (disposed || epoch !== generation || session !== sessionId || snapshot.session.session_id !== session) return
    const head = snapshot.execution_head
    for (const message of snapshot.messages ?? []) {
      if (message.role === "assistant" && message.run_id && message.run_id !== head?.run_id &&
        (message.status === "completed" || message.status === "failed")) {
        terminal.add(message.run_id); anchors.delete(message.run_id)
      }
    }
    if (!head) { anchors.clear(); return }
    if (terminal.has(head.run_id)) return
    anchors.add(head.run_id)
    for (const pause of head.pending_pauses) {
      const known = pauses.get(head.run_id) ?? new Set<string>()
      known.add(JSON.stringify([pause.pause_ref, pause.pause_revision]))
      pauses.set(head.run_id, known)
      revisions.set(head.run_id, Math.max(revisions.get(head.run_id) ?? -1, pause.interaction_revision))
    }
  }
  function emit(kind: TaskNotification["kind"], runId: string): void {
    if (sessionId === null) return
    const signal = { kind, sessionId, runId }
    for (const listener of listeners) {
      try { listener(signal) } catch { /* Observers must not break projection or their peers. */ }
    }
  }
  function observe(events: readonly ChatProjectionEvent[]): void {
    if (disposed || sessionId === null) return
    for (const event of events) {
      if (event.session_id !== sessionId) continue
      const run = event.run_id
      if (event.kind === "run.completed" || event.kind === "run.failed" || event.kind === "run.dispatch_failed") {
        if (terminal.has(run)) continue
        terminal.add(run)
        const admitted = anchors.delete(run)
        if (admitted && event.kind === "run.completed" && event.payload.status === "completed") emit("completed", run)
      } else if (event.kind === "interaction.state" && anchors.has(run) && !terminal.has(run)) {
        const interaction = event.payload
        if (interaction.interaction_revision <= (revisions.get(run) ?? -1)) continue
        revisions.set(run, interaction.interaction_revision)
        if (interaction.phase !== "waiting") continue
        const key = JSON.stringify([interaction.pause_ref, interaction.pause_revision])
        const known = pauses.get(run) ?? new Set<string>()
        if (known.has(key)) continue
        known.add(key); pauses.set(run, known)
        emit("awaiting", run)
      }
    }
  }
  return {
    select, anchorReceipt, anchorSnapshot, observe,
    generation: () => generation,
    retire() { generation += 1; anchors.clear(); terminal.clear(); pauses.clear(); revisions.clear() },
    subscribe(listener: (signal: TaskNotification) => void) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() { select(null); disposed = true; listeners.clear() },
  }
}
