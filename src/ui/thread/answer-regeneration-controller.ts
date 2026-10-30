import { SessionClientError } from "@/engine/client-error"
import { sameAnswerActionTarget, type AnswerActionTarget } from "./answer-action-target"
export type AnswerRegenerationReceipt = Readonly<{ runId: string; assistantMessageId: string; originalUserMessageId: string; sourceMessageId: string }>
type Context = Readonly<{ target: AnswerActionTarget; epoch: object; eligible: boolean; evidence?: object }>
type Intent = Readonly<{ target: AnswerActionTarget; epoch: object; key: string; evidence?: object }>
type State = { kind: "rejected"; intent: Intent; code: string } | { kind: "idle" } | { kind: "pending" | "unknown"; intent: Intent } | { kind: "accepted"; intent: Intent; receipt: AnswerRegenerationReceipt }
const IDLE: State = { kind: "idle" }
export function createAnswerRegenerationController(deps: {
  current: () => Context | null
  request: (args: { target: AnswerActionTarget; key: string; signal: AbortSignal }) => Promise<AnswerRegenerationReceipt>
  newKey: () => string
  changed?: () => void
}) {
  let state: State = IDLE, controller: AbortController | null = null, generation = 0
  const sameAuthority = (context: Context | null, intent: Intent) => context !== null && context.epoch === intent.epoch &&
    sameAnswerActionTarget({ ...context.target, runId: intent.target.runId, messageId: intent.target.messageId }, intent.target)
  const same = (context: Context | null, intent: Intent) => sameAuthority(context, intent) && sameAnswerActionTarget(context?.target ?? null, intent.target)
  // One controller belongs to one answer source. A new head may change only
  // eligibility; a different Message never inherits this intent's visible state.
  const getState = (): State => state.kind === "idle" || same(deps.current(), state.intent) ? state : IDLE
  const set = (value: State) => { state = value; deps.changed?.() }
  const retire = () => { generation += 1; controller?.abort(); controller = null; set(IDLE) }
  async function run(): Promise<AnswerRegenerationReceipt | null> {
    const context = deps.current()
    if (!context) return null
    if (state.kind !== "idle" && sameAuthority(context, state.intent) && !same(context, state.intent)) return null
    const held = getState()
    if (held.kind === "pending" || held.kind === "accepted" || (held.kind === "rejected" && held.intent.evidence === context.evidence)) return null
    let intent: Intent
    if (held.kind === "unknown") {
      if (!same(context, held.intent)) return null
      intent = held.intent // Current no-active eligibility is deliberately not replay admission.
    } else {
      if (!context.eligible) return null
      const key = deps.newKey(); if (!key) return null
      intent = { target: { ...context.target, scope: { ...context.target.scope } }, epoch: context.epoch, key, ...(context.evidence === undefined ? {} : { evidence: context.evidence }) }
    }
    controller?.abort(); controller = new AbortController(); generation += 1
    const token = generation, signal = controller.signal
    const active = () => token === generation && !signal.aborted && same(deps.current(), intent)
    set({ kind: "pending", intent })
    try {
      const receipt = await deps.request({ target: intent.target, key: intent.key, signal })
      if (!active()) return null
      if (receipt.sourceMessageId !== intent.target.messageId || receipt.runId === intent.target.runId || receipt.assistantMessageId === intent.target.messageId ||
        ![receipt.runId, receipt.assistantMessageId, receipt.originalUserMessageId].every((value) => typeof value === "string" && value.trim().length > 0)) throw Error("regeneration_binding_mismatch")
      set({ kind: "accepted", intent, receipt }); return receipt
    } catch (error) {
      const definite = held.kind !== "unknown" && error instanceof SessionClientError && error.reason === "http" &&
        ((error.status === 400 && error.code === "message_regeneration_request_invalid") ||
          (error.status === 409 && (error.code === "message_regeneration_not_ready" || error.code === "idempotency_conflict")))
      if (active()) set(definite ? { kind: "rejected", intent, code: error.code! } : { kind: "unknown", intent })
      return null
    }
  }
  const suspend = () => {
    generation += 1; controller?.abort(); controller = null
    if (state.kind === "pending") set({ kind: "unknown", intent: state.intent })
  }
  return { getState, run, retire, suspend }
}
