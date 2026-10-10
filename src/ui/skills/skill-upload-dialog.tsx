"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type RefObject } from "react"
import { ExternalLink, FileArchive } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { createSkillLocalImportClient } from "@/hub/skill-local-import-client"
import { useSessionProbe } from "@/ui/auth/use-session-state"
import { useT } from "@/i18n/context"
import { createPersonalSkillImportFlow } from "./personal-skill-import-flow"
import styles from "./skill-upload-dialog.module.css"

const defaultClient = createSkillLocalImportClient()
type Props = { open: boolean; onOpenChange: (open: boolean) => void; onPublished?: () => void; returnFocusRef?: RefObject<HTMLElement | null>; importClient?: ReturnType<typeof createSkillLocalImportClient> }

/** Ordinary local import: the owner parses SKILL.md and commits installation. */
export function SkillUploadDialog({ open, onOpenChange, onPublished, returnFocusRef, importClient = defaultClient }: Props) {
  const t = useT()
  const probe = useSessionProbe()
  const boundary = probe.projectReadBoundary
  const flow = useMemo(() => {
    let storage: Storage | undefined
    try { storage = typeof window === "undefined" ? undefined : window.sessionStorage } catch { /* Optional locator. */ }
    return createPersonalSkillImportFlow({ client: importClient, subject: boundary.subject ?? "", ...(storage ? { storage } : {}) })
  }, [importClient, boundary.subject])
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot)
  const input = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const completed = useRef<unknown>(null)
  const onPublishedRef = useRef(onPublished)
  useEffect(() => { onPublishedRef.current = onPublished }, [onPublished])
  useEffect(() => { flow.setAdmitted(boundary.admitted && boundary.subject !== null); return () => flow.cancel() }, [flow, boundary.admitted, boundary.subject, boundary.generation])
  useEffect(() => { if (probe.state === "anonymous") flow.retire(true) }, [flow, probe.state])
  useEffect(() => () => flow.retire(false), [flow])
  useEffect(() => { if (!open) flow.cancel() }, [open, flow])
  useEffect(() => { if (state.kind === "completed" && state !== completed.current) { completed.current = state; onPublishedRef.current?.() } }, [state])
  const handleOpenChange = (next: boolean) => { if (!next) flow.cancel(); onOpenChange(next) }
  const select = (file?: File) => { if (file && boundary.admitted && boundary.subject) void flow.select(file) }
  const drop = (event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length === 1) select(event.dataTransfer.files[0]) }
  const idle = state.kind === "idle" || state.kind === "reselect" && state.intentId === undefined
  const busy = state.kind === "running"
  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogContent className={styles.dialog} overlayClassName={styles.dialogOverlay ?? ""} closeLabel={t("skills.uploadClose")} data-testid="skill-upload-dialog" data-state-kind={state.kind} onCloseAutoFocus={(event) => {
      const target = returnFocusRef?.current
      if (!target || !target.isConnected || target.hasAttribute("disabled")) return
      event.preventDefault(); window.requestAnimationFrame(() => target.focus({ preventScroll: true }))
    }}>
      <DialogHeader className={styles.header}><DialogTitle>{t("skills.uploadTitle")}</DialogTitle><DialogDescription className="sr-only">{t("skills.localImport.hint")}</DialogDescription></DialogHeader>
      {!boundary.admitted || !boundary.subject ? <Alert role="alert" className={styles.error}><AlertDescription>{t("skills.localImport.session")}</AlertDescription></Alert> : null}
      {idle ? <>
        <input ref={input} type="file" accept=".zip,.skill,application/zip,application/octet-stream" className={styles.input} data-testid="skill-upload-input" tabIndex={-1} aria-hidden="true" disabled={!boundary.admitted || !boundary.subject} onChange={(event) => { const files = event.target.files; const file = files?.length === 1 ? files[0] : undefined; event.currentTarget.value = ""; select(file) }} />
        <Button type="button" variant="ghost" className={styles.dropzone} disabled={!boundary.admitted || !boundary.subject} data-dragging={dragging || undefined} onClick={() => input.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { event.preventDefault(); setDragging(false) }} onDrop={drop}><FileArchive aria-hidden="true" /><span>{t("skills.uploadDrop")}</span></Button>
        {state.kind === "reselect" ? <Alert role="alert" variant="destructive" className={styles.error}><AlertDescription>{t("skills.uploadError")}</AlertDescription></Alert> : null}
        <section className={styles.requirements} aria-labelledby="skill-upload-requirements"><h3 id="skill-upload-requirements">{t("skills.uploadRequirements")}</h3><ul><li>{t("skills.uploadRequirementZip")}</li><li>{t("skills.uploadRequirementYaml")}</li></ul><p className={styles.learn}><ExternalLink aria-hidden="true" /><a href="https://agentskills.io/what-are-skills" target="_blank" rel="noreferrer">{t("skills.uploadLearn")}</a><span aria-hidden="true">{t("skills.uploadOr")}</span><a href="https://agentskills.io/" target="_blank" rel="noreferrer">{t("skills.uploadExample")}</a></p></section>
      </> : null}
      {busy ? <div className={styles.progress} role="status" aria-live="polite"><Spinner aria-hidden="true" /><span>{t("skills.localImport.processing")}</span></div> : null}
      {["unknown", "rejected", "recoverable", "reselect", "expired"].includes(state.kind) && !idle ? <Alert role="alert" className={styles.error}><AlertDescription>{t(state.kind === "unknown" ? "skills.localImport.unknown" : state.kind === "recoverable" ? "skills.localImport.recoverable" : state.kind === "reselect" ? "skills.localImport.reselect" : state.kind === "expired" ? "skills.localImport.expired" : "skills.uploadError")}</AlertDescription>{state.code ? <p>{state.code}</p> : null}</Alert> : null}
      {state.kind === "completed" ? <div className={styles.done} role="status"><FileArchive aria-hidden="true" /><strong>{state.skill?.name}</strong><p>{t(state.installed ? "skills.localImport.complete" : "skills.localImport.installationUnconfirmed")}</p></div> : null}
      <DialogFooter className={styles.footer}>
        {busy ? <Button variant="outline" onClick={() => flow.cancel()}>{t("skills.cancel")}</Button> : null}
        {state.kind === "unknown" || state.kind === "rejected" && state.stage !== "get" ? <Button disabled={!boundary.admitted} onClick={() => void flow.retry()}>{t("skills.retry")}</Button> : null}
        {state.intentId && ["unknown", "rejected", "recoverable"].includes(state.kind) ? <Button variant="outline" disabled={!boundary.admitted} onClick={() => void flow.restore()}>{t("skills.localImport.check")}</Button> : null}
        {state.kind === "recoverable" && state.stage ? <Button disabled={!boundary.admitted} onClick={() => void flow.continue()}>{t("skills.localImport.continue")}</Button> : null}
        {!busy && ["rejected", "reselect", "expired", "completed"].includes(state.kind) ? <Button variant="outline" onClick={() => flow.replace()}>{t("skills.localImport.replace")}</Button> : null}
        {state.kind === "completed" ? <Button onClick={() => handleOpenChange(false)}>{t("skills.uploadDone")}</Button> : null}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
