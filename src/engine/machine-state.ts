// Owner execution state and transport availability are independent.
import type { ChatProjectionEventKind } from "@/core/chat-projection-event"
import type { InteractionState } from "@/contract/control"
import type { ExecutionHead } from "@/contract/chat"
export type MachinePhase = "idle" | "submitting" | "queued" | "streaming" | "waiting" | "resuming" | "cancelling" | "error"
export type MachineState = { phase: MachinePhase; runId: string | null; error: string | null }
export const IDLE_MACHINE: MachineState = { phase: "idle", runId: null, error: null }
export type MachineEvent =
  | { type: "SUBMIT" }
  | { type: "RECEIPT"; runId: string }
  | { type: "REATTACH"; runId: string; state: ExecutionHead["state"] }
  | { type: "STREAM_EVENT"; runId: string; kind: ChatProjectionEventKind; interactionPhase?: InteractionState["phase"] }
  | { type: "RESUME_SENT" }
  | { type: "CANCEL" }
  | { type: "CONTROL_FAILED"; error: string }
  | { type: "RESET" } | { type: "TIMEOUT" } | { type: "FAIL"; error: string }
export function transition(state: MachineState, event: MachineEvent): MachineState {
  switch (event.type) {
    case "SUBMIT": return state.phase === "idle" || state.phase === "error" ? { phase: "submitting", runId: null, error: null } : state
    case "RECEIPT": return state.phase === "submitting" ? { phase: "queued", runId: event.runId, error: null } : state
    case "REATTACH": return state.phase === "idle" || state.phase === "error" ? { phase: event.state === "active" ? "streaming" : event.state, runId: event.runId, error: null } : state
    case "STREAM_EVENT": {
      const admission = event.kind === "run.queued" || event.kind === "run.created" || event.kind === "interaction.state"
      if (event.runId !== state.runId && !(admission && (state.phase === "idle" || state.phase === "error"))) return state
      if (event.kind === "run.completed" || event.kind === "run.failed" || event.kind === "run.dispatch_failed") return { ...IDLE_MACHINE }
      if (state.phase === "cancelling") return state
      if (event.kind === "interaction.state" && event.interactionPhase) {
        const phase = event.interactionPhase === "active" || event.interactionPhase === "terminal" ? "streaming" : event.interactionPhase
        return state.phase === phase && state.runId === event.runId && state.error === null ? state : { phase, runId: event.runId, error: null }
      }
      if (event.kind === "run.created" && (state.phase === "queued" || state.phase === "idle")) return { phase: "streaming", runId: event.runId, error: null }
      if (event.kind === "run.queued" && (state.phase === "idle" || state.phase === "queued")) return { phase: "queued", runId: event.runId, error: null }
      return state
    }
    // HTTP admission is not native execution evidence.
    case "RESUME_SENT": return state
    case "CANCEL": return state.runId && state.phase !== "cancelling" ? { ...state, phase: "cancelling" } : state
    case "CONTROL_FAILED": return { ...state, error: event.error }
    case "RESET": return state.phase === "idle" && state.runId === null && state.error === null ? state : { ...IDLE_MACHINE }
    case "TIMEOUT": return state
    case "FAIL": return { phase: "error", runId: null, error: event.error }
  }
}
