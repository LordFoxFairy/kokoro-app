"use client"

import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { HubClientError } from "@/hub/client"
import { downloadManagedSkillArchive } from "@/hub/personal-skill-archive"
import { managedPersonalSkillSchema, skillPublicationPreconditionSchema, type SkillPublicationPrecondition } from "@/hub/schemas"
import type { PersonalSkillHistoryVersion } from "@/hub/personal-skill-history.schema"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { useT } from "@/i18n/context"
import { createPersonalSkillRestoreSession, runPersonalSkillPublishSession, SkillPublishPending, SkillPublishRestartRequired, SkillPublishUncertain, type PersonalSkillPublishSession } from "./personal-skill-publish-flow"

type Status = "idle" | "running" | "error" | "auth" | "pending" | "unknown" | "conflict"
/** One confirmed historical version, original ZIP and publication fence; retries reuse the existing publish session. */
export function PersonalSkillRestoreDialog({ version, seriesId, publication, client, open, admitted, onClose, onStarted, onRestored, onStartOver, returnFocusRef, hash }: {
  version: PersonalSkillHistoryVersion; seriesId: string; publication: NonNullable<SkillPublicationPrecondition>
  client: SkillPublishClient; open: boolean; admitted: boolean
  onClose: (retainIntent: boolean) => void; onStarted: () => void; onRestored: () => void; onStartOver: () => void
  returnFocusRef: RefObject<HTMLElement | null>; hash?: (file: File) => Promise<string>
}) {
  const t = useT()
  const [confirmed] = useState(() => ({ version: Object.freeze({...version}), seriesId, publication: Object.freeze(skillPublicationPreconditionSchema.parse(publication)!) }))
  const [status, setStatus] = useState<Status>("idle")
  const [started, setStarted] = useState(false)
  const session = useRef<PersonalSkillPublishSession | null>(null), active = useRef<AbortController | null>(null)
  useLayoutEffect(() => { if ((!admitted || !open) && active.current) { active.current.abort(); setStatus("error") } }, [admitted, open])
  useLayoutEffect(() => () => active.current?.abort(), [])
  const close = () => { active.current?.abort(); if (active.current) setStatus("error"); onClose(session.current !== null) }
  const restore = () => {
    if (!admitted || !open || active.current || status === "conflict") return
    const controller = new AbortController(); active.current = controller
    setStarted(true); setStatus("running")
    void (async () => {
      if (session.current === null) {
        const target = confirmed.version
        const base = managedPersonalSkillSchema.parse(await client.getManaged(target.skill_id, controller.signal))
        controller.signal.throwIfAborted()
        if (base.skill_id !== target.skill_id || base.source_ref !== `skill:${target.skill_id}` || base.series_id !== confirmed.seriesId || base.revision !== target.revision || base.name !== target.name || base.summary !== target.summary || base.product.source_kind !== "personal" || !["active", "disabled", "withdrawn"].includes(base.status)) throw new SkillPublishRestartRequired()
        const file = await downloadManagedSkillArchive(target, controller.signal)
        controller.signal.throwIfAborted()
        session.current = createPersonalSkillRestoreSession(base, file, confirmed.publication)
        onStarted()
      }
      await runPersonalSkillPublishSession(client, session.current, {signal:controller.signal, ...(hash === undefined ? {} : {hash})})
      controller.signal.throwIfAborted()
      onRestored()
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (error instanceof SkillPublishPending) setStatus("pending")
      else if (error instanceof SkillPublishUncertain) setStatus("unknown")
      else if (error instanceof SkillPublishRestartRequired || error instanceof HubClientError && [409,412].includes(error.status ?? 0) && error.code !== "skill_command_in_progress" && !session.current?.draftUncertain) setStatus("conflict")
      else if (error instanceof HubClientError && [401,403].includes(error.status ?? 0)) setStatus("auth")
      else setStatus("error")
    }).finally(() => { if (active.current === controller) active.current = null })
  }
  return <Dialog open={admitted && open} onOpenChange={next => {if (!next) close()}}>
    <DialogContent closeLabel={t("skills.publishClose")} data-testid="personal-skill-restore-dialog" className="max-w-md" onCloseAutoFocus={event => {event.preventDefault();if (admitted && returnFocusRef.current?.isConnected) returnFocusRef.current.focus()}}>
      <DialogTitle>{t("skills.history.restoreTitle")}</DialogTitle>
      <DialogDescription>{t("skills.history.restoreDescription")}</DialogDescription>
      <p className="break-words text-sm">{confirmed.version.name} · {t("skills.history.revision")} {confirmed.version.revision}</p>
      {status !== "idle" && status !== "running" ? <p role="alert" className="text-sm">{t(status === "pending" ? "skills.publishPending" : status === "unknown" ? "skills.publishUnknown" : status === "auth" ? "skills.publishAuth" : status === "conflict" ? "skills.publishRestart" : "skills.publishError")}</p> : null}
      <div className="flex justify-end gap-2" aria-busy={status === "running"}>
        <Button variant="outline" onClick={close}>{t(started ? "skills.publishClose" : "skills.cancel")}</Button>
        {status === "conflict" ? <Button onClick={onStartOver}>{t("skills.publishStartOver")}</Button> : <Button disabled={!admitted || status === "running"} onClick={restore}>{t(started ? "skills.publishRetry" : "skills.history.restore")}</Button>}
      </div>
    </DialogContent>
  </Dialog>
}
