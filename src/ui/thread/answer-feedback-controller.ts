import { sameAnswerActionTarget, type AnswerActionTarget } from "./answer-action-target"
export type AnswerFeedbackFact = Readonly<{ sessionId: string; messageId: string; value: "up" | "down" | null }>
type Context = Readonly<{ target: AnswerActionTarget; epoch: object }>
type State = { kind: "unread" | "reading" | "writing" | "unknown" | "failed" } | { kind: "ready"; value: AnswerFeedbackFact["value"] }
const UNREAD: State = { kind: "unread" }
/** Feature-local RAM control; ports must be supplied by the formal decoded adapter. */
export function createAnswerFeedbackController(deps: {
  current: () => Context | null
  read: (args: { target: AnswerActionTarget; signal: AbortSignal }) => Promise<AnswerFeedbackFact>
  write: (args: { target: AnswerActionTarget; value: AnswerFeedbackFact["value"]; signal: AbortSignal }) => Promise<AnswerFeedbackFact>
  changed?: () => void
}) {
  let bound: Context | null = null, state: State = UNREAD, controller: AbortController | null = null, generation = 0
  const same = (context: Context | null) => context !== null && bound !== null && context.epoch === bound.epoch && sameAnswerActionTarget(context.target, bound.target)
  const getState = (): State => same(deps.current()) ? state : UNREAD
  const set = (value: State) => { state = value; deps.changed?.() }
  const retire = () => { generation += 1; controller?.abort(); controller = null; bound = null; set(UNREAD) }
  async function operate(value?: AnswerFeedbackFact["value"]): Promise<boolean> {
    const context = deps.current()
    if (!context || (same(context) && state.kind === "writing")) return false
    const writing = value !== undefined
    if (writing && getState().kind !== "ready") return false
    controller?.abort(); controller = new AbortController(); generation += 1
    const token = generation, signal = controller.signal
    bound = { epoch: context.epoch, target: { ...context.target, scope: { ...context.target.scope } } }
    const target = bound.target
    const active = () => generation === token && !signal.aborted && same(deps.current())
    set({ kind: writing ? "writing" : "reading" })
    try {
      const result = writing ? await deps.write({ target, value, signal }) : await deps.read({ target, signal })
      if (!active()) return false
      if (result.sessionId !== target.sessionId || result.messageId !== target.messageId ||
        (result.value !== null && result.value !== "up" && result.value !== "down") || (writing && result.value !== value)) throw Error("feedback_binding_mismatch")
      set({ kind: "ready", value: result.value }); return true
    } catch {
      if (active()) set({ kind: writing ? "unknown" : "failed" })
      return false
    }
  }
  const suspend = () => {
    generation += 1; controller?.abort(); controller = null
    if (state.kind === "writing") set({ kind: "unknown" })
    else if (state.kind === "reading") set(UNREAD)
  }
  return { getState, suspend, read: () => operate(), write: (value: AnswerFeedbackFact["value"]) => operate(value), retire }
}
