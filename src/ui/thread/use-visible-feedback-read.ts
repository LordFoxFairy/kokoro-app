import { useEffect, type RefObject } from "react"
import type { AnswerActionBoundary } from "./answer-action-scope"
import { createAnswerFeedbackController } from "./answer-feedback-controller"

// History can mount hundreds of answers in several tabs. Reading every vote on
// mount amplifies admission traffic even when the user never sees those actions.
export function useVisibleFeedbackRead(
  root: RefObject<HTMLDivElement | null>,
  boundary: AnswerActionBoundary,
  feedback: ReturnType<typeof createAnswerFeedbackController>,
  readEpoch: object,
) {
  useEffect(() => {
    let active = true, requested = false
    let visible = typeof IntersectionObserver === "undefined"
    const read = () => {
      if (!active || requested || !visible || document.visibilityState === "hidden" || !boundary.isCurrent()) return
      if (feedback.getState().kind === "unknown") return
      requested = true
      // The first StrictMode effect is retired before this microtask. Do not
      // start an obsolete request that would already reach the server.
      queueMicrotask(() => { if (active && boundary.isCurrent()) void feedback.read() })
    }
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting)
      read()
    })
    if (root.current) observer?.observe(root.current)
    document.addEventListener("visibilitychange", read)
    read()
    return () => { active = false; observer?.disconnect(); document.removeEventListener("visibilitychange", read) }
  }, [root, boundary, feedback, readEpoch])
}
