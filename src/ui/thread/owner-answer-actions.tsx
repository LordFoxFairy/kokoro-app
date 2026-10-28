import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { AnswerActions } from "./answer-actions"
import type { AnswerActionBoundary } from "./answer-action-scope"
import { canRegenerateAnswer } from "./answer-action-scope"
import { createAnswerFeedbackController } from "./answer-feedback-controller"
import { createAnswerRegenerationController } from "./answer-regeneration-controller"
function createOwnerControls(boundary: AnswerActionBoundary, target: import("./answer-action-target").AnswerActionTarget, changed: (update: (value: number) => number) => void) {
    const lifetime = { mounted: true }
    const notify = () => { if (lifetime.mounted) { changed(value => value + 1); boundary.changed() } }
    const context = () => boundary.isCurrent() ? { target, epoch: boundary.epoch } : null
    const feedback = createAnswerFeedbackController({ current: () => boundary.isCurrent() ? { target, epoch: boundary.epoch } : null, changed: notify,
      read: async ({ target, signal }) => { const fact = await boundary.client.readFeedback(target, signal); return { sessionId: fact.session_id, messageId: fact.message_id, value: fact.feedback } },
      write: async ({ target, value, signal }) => { const fact = await boundary.client.setFeedback(target, value, signal); return { sessionId: fact.session_id, messageId: fact.message_id, value: fact.feedback } },
    })
    const regenerate = createAnswerRegenerationController({ current: () => {
      const owned = context(); return owned === null ? null : { ...owned, eligible: canRegenerateAnswer(boundary, target, false), evidence: boundary.engine.getSnapshot().thread }
    }, newKey: () => `regenerate:${crypto.randomUUID()}`, changed: notify,
      request: async ({ target, key, signal }) => {
        if (!boundary.engine.regenerateAnswer) throw Error("regeneration_unavailable")
        const fact = await boundary.engine.regenerateAnswer({ sourceMessageId: target.messageId, sourceRunId: target.runId, key, signal })
        return { runId: fact.run_id, assistantMessageId: fact.assistant_message_id, originalUserMessageId: fact.user_message_id, sourceMessageId: fact.regenerated_from_message_id }
      },
    })
    return { feedback, regenerate, activate: () => { lifetime.mounted = true }, retire: () => { lifetime.mounted = false; feedback.retire(); regenerate.retire() } }
}
export function OwnerAnswerActions({ boundary, runId, messageId, text }: {
  boundary: AnswerActionBoundary; runId: string; messageId: string; text: string
}) {
  const t = useT(), [, changed] = useState(0)
  const target = useMemo(() => ({ actorId: boundary.actorId, sessionId: boundary.sessionId, scope: boundary.scope, runId, messageId }), [boundary, runId, messageId])
  const controls = useMemo(() => createOwnerControls(boundary, target, changed), [boundary, target])
  useLayoutEffect(() => {
    controls.activate()
    boundary.regenerations.add(controls.regenerate)
    return () => {
      boundary.regenerations.delete(controls.regenerate)
      controls.retire()
    }
  }, [boundary, controls])
  const readEpoch = boundary.readEpoch ?? boundary.epoch
  useLayoutEffect(() => { if (!boundary.isCurrent()) { controls.feedback.suspend(); controls.regenerate.suspend() } })
  useEffect(() => { if (boundary.isCurrent() && controls.feedback.getState().kind !== "unknown") void controls.feedback.read() }, [boundary, controls, readEpoch])
  const feedback = controls.feedback.getState(), regeneration = controls.regenerate.getState()
  const owned = boundary.isCurrent()
  return <>
    <AnswerActions text={text} regenerate={{ label: t("thread.regenerateAnswer"), onClick: () => { if (regeneration.kind === "unknown" || canRegenerateAnswer(boundary, target)) void controls.regenerate.run() },
      disabled: !owned || (regeneration.kind !== "unknown" && !canRegenerateAnswer(boundary, target)) || regeneration.kind === "pending" || regeneration.kind === "accepted" || (regeneration.kind === "rejected" && regeneration.intent.evidence === boundary.engine.getSnapshot().thread) }}
      feedback={{ positiveLabel: t("thread.positiveFeedback"), negativeLabel: t("thread.negativeFeedback"), onChange: value => { void controls.feedback.write(value) },
        ...(feedback.kind === "ready" && owned ? { value: feedback.value } : { value: undefined, disabled: true as const }) }} />
    {regeneration.kind === "unknown" ? <p role="status" className="text-xs text-muted-foreground">{t("thread.regenerationUnconfirmed")}</p> : null}
    {regeneration.kind === "rejected" ? <p className="text-xs text-muted-foreground"><span role="status">{t("thread.regenerationNotReady")}</span>
      <Button type="button" variant="ghost" disabled={!owned} onClick={() => boundary.engine.reconnect()}>{t("thread.readSessionState")}</Button></p> : null}
    {feedback.kind === "unknown" || feedback.kind === "failed" ? <p className="text-xs text-muted-foreground">
      {feedback.kind === "unknown" ? <span role="status">{t("thread.feedbackUnconfirmed")}</span> : null}
      <Button type="button" variant="ghost" onClick={() => { void controls.feedback.read() }}>{t("thread.readFeedback")}</Button>
    </p> : null}
  </>
}
