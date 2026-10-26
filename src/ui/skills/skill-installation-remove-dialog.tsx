"use client"

import { useEffect, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { SkillInstallationRemoveFlow, SkillRemoveState } from "./skill-installation-remove-flow"

export function SkillInstallationRemoveDialog({ flow, state, boundary, open, onOpenChange, returnFocusRef, fallbackFocusRef }: {
  flow: SkillInstallationRemoveFlow
  state: SkillRemoveState
  boundary: ProjectReadBoundary
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLElement | null>
  fallbackFocusRef: RefObject<HTMLElement | null>
}) {
  const t = useT()
  const admitted = boundary.admitted && boundary.subject !== null && flow.matches(boundary)
  const busy = state.kind === "running"
  useEffect(() => {
    if (open && admitted) void flow.readCurrent(boundary)
  }, [open, admitted, boundary, flow])
  const close = () => {
    flow.cancel(boundary)
    flow.reset(boundary) // Unknown and ACK-known/read-needed intents refuse reset.
    onOpenChange(false)
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) close() }}>
    <DialogContent className="sm:max-w-md" closeLabel={t("skills.publishClose")} aria-busy={admitted && busy}
      onCloseAutoFocus={event => {
        const trigger = returnFocusRef.current
        const target = trigger?.isConnected && !trigger.matches(":disabled") ? trigger : fallbackFocusRef.current
        if (admitted && target?.isConnected) { event.preventDefault(); target.focus({ preventScroll: true }) }
      }}>
      <DialogHeader><DialogTitle>{t("skills.personal.remove")}</DialogTitle>
        <DialogDescription>{t("skills.personal.removeDescription")}</DialogDescription></DialogHeader>
      {admitted && state.current ? <div className="min-w-0 break-words space-y-2">
        <strong>{state.current.display_name}</strong>
        <p>{t("skills.history.revision")} {state.current.revision}</p>
        <p>{t(state.current.installed ? "skills.personal.installed" : "skills.personal.removed")}</p>
      </div> : <div className="h-16 rounded-lg bg-muted" aria-hidden="true" />}
      {admitted && state.kind === "unknown" ? <p role="alert">{t("skills.personal.unknown")}</p> : null}
      {admitted && state.acknowledged && state.kind !== "completed" ? <p role="status">{t("skills.personal.confirmed")}</p> : null}
      {admitted && (state.kind === "unavailable" || state.kind === "read_failed" && !state.acknowledged)
        ? <p role="alert">{t("skills.update.checkFailed")}</p> : null}
      {admitted && state.kind === "completed" ? <p role="status">{t("skills.personal.currentConfirmed")}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>{t(state.kind === "completed" ? "skills.update.done" : "skills.cancel")}</Button>
        {admitted && !busy && ["unknown", "read_failed", "unavailable", "read_needed"].includes(state.kind)
          ? <Button type="button" variant="outline" onClick={() => void flow.readCurrent(boundary)}>{t("skills.personal.checkCurrent")}</Button> : null}
        {admitted && !busy && (state.kind === "unknown" || state.kind === "selected")
          ? <Button type="button" variant="destructive" disabled={state.kind === "selected" && !state.current}
            onClick={() => void flow.confirm(boundary)}>{t(state.kind === "unknown" ? "skills.retry" : "skills.personal.remove")}</Button> : null}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
