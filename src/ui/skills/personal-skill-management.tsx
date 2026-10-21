"use client"

import { PersonalSkillHistoryDialog } from "./personal-skill-history-dialog"

import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { HubClientError } from "@/hub/client"
import type { ManagedPersonalSkill, PersonalInstallation } from "@/hub/schemas"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import { useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { PersonalSkillOperation } from "./personal-skill-actions"
import { PersonalSkillPublishDialog } from "./personal-skill-publish-dialog"
import { PersonalSkillWithdrawDialog } from "./personal-skill-withdraw-dialog"

export type PersonalSkillSelection = Pick<PersonalInstallation, "source_ref" | "series_id" | "revision"> & { operation: PersonalSkillOperation }

/** The installation locates a revision; only the self-managed read admits its publisher. */
export function PersonalSkillManagement({ selection, boundary, onReleased, onConfirmed, onSelectPublished, returnFocusRef }: {
  selection: PersonalSkillSelection
  boundary: ProjectReadBoundary
  onReleased: () => void
  onConfirmed: () => void
  onSelectPublished: (selection: PersonalSkillSelection) => void
  returnFocusRef: RefObject<HTMLInputElement | null>
}) {
  const t = useT()
  const [client] = useState(createSkillPublishClient)
  const [open, setOpen] = useState(true)
  const [readAttempt, setReadAttempt] = useState(0)
  const [read, setRead] = useState<{ generation: number; attempt: number; skill?: ManagedPersonalSkill; error?: unknown } | null>(null)
  // Keep the original form/CAS mounted across a same-actor recheck. A fresh
  // managed read gates access, never rewrites an uncertain command's payload.
  const [base, setBase] = useState<ManagedPersonalSkill | null>(null)
  const pending = useRef(false)
  const admitted = boundary.admitted && boundary.subject !== null
  const { generation, subject } = boundary
  useLayoutEffect(() => {
    if (!admitted) return
    const controller = new AbortController()
    void client.getManaged(selection.source_ref.slice("skill:".length), controller.signal).then(skill => {
      if (controller.signal.aborted) return
      if (skill.source_ref !== selection.source_ref || skill.skill_id !== selection.source_ref.slice("skill:".length)
        || skill.series_id !== selection.series_id || skill.revision !== selection.revision) {
        throw new Error("Managed revision does not match the selected installation")
      }
      setRead({ generation, attempt: readAttempt, skill })
      setBase(current => current ?? skill)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ generation, attempt: readAttempt, error })
    })
    return () => controller.abort()
  }, [admitted, subject, generation, selection, readAttempt, client])

  const current = admitted && read?.generation === generation && read.attempt === readAttempt ? read : null
  const ready = current?.skill !== undefined && base !== null && (selection.operation === "history" || ["active", "disabled"].includes(base.status))
  const close = (_open: boolean, retainIntent = pending.current) => {
    pending.current = retainIntent
    setOpen(false)
    if (!retainIntent) onReleased()
  }
  const confirmed = () => { pending.current = false; onConfirmed() }
  const restoreFocus = (event: Event) => { event.preventDefault(); if (admitted) returnFocusRef.current?.focus() }
  return <>
    {admitted && !open ? <div role="status" className="flex items-center gap-2 text-sm">
      <span>{t("skills.lifecycle.pending")}</span><Button type="button" variant="outline" onClick={() => setOpen(true)}>{t("skills.lifecycle.resume")}</Button>
    </div> : null}
    <Dialog open={admitted && open && !ready} onOpenChange={close}>
      <DialogContent onCloseAutoFocus={restoreFocus}>
        <DialogTitle>{t(selection.operation === "history" ? "skills.history.title" : selection.operation === "update" ? "skills.lifecycle.update" : "skills.lifecycle.withdraw")}</DialogTitle>
        <DialogDescription>{t("skills.personal.checkCurrent")}</DialogDescription>
        {current ? <><p role="alert">{t(current.error instanceof HubClientError && [401, 403].includes(current.error.status ?? 0) ? "skills.personal.forbidden" : "skills.personal.rejected")}</p>
          <Button type="button" onClick={() => setReadAttempt(value => value + 1)}>{t("skills.retry")}</Button></>
          : <div aria-busy="true" className="h-16 rounded-lg bg-muted" />}
        <Button type="button" variant="outline" onClick={() => close(false)}>{t("skills.cancel")}</Button>
      </DialogContent>
    </Dialog>
    {ready && current?.skill && selection.operation === "history" ? <PersonalSkillHistoryDialog key={`${generation}:${subject}`} base={current.skill} client={client} open={open} onOpenChange={close} returnFocusRef={returnFocusRef}/> : null}
    {base !== null && selection.operation === "update" ? <PersonalSkillPublishDialog
      base={base} client={client} admitted={ready} open={ready && open} onOpenChange={close}
      onIntentStarted={() => { pending.current = true }} onPublished={confirmed} returnFocusRef={returnFocusRef}
      onManagePublished={(operation, receipt) => { if (ready) onSelectPublished({ operation, series_id: selection.series_id, ...receipt }) }}
    /> : null}
    {base !== null && selection.operation === "withdraw" ? <PersonalSkillWithdrawDialog
      skill={base} client={client} admitted={ready} open={ready && open} onOpenChange={close}
      onIntentStarted={() => { pending.current = true }} onConfirmed={confirmed} returnFocusRef={returnFocusRef}
    /> : null}
  </>
}
