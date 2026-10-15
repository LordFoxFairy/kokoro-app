"use client"

import Image from "next/image"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react"
import { ArrowLeftRight, Check, LoaderCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { parseGithubRepository } from "@/hub/client"
import { createSkillGithubImportClient } from "@/hub/skill-github-import-client"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import { createSkillInstallationClient } from "@/hub/client"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useT } from "@/i18n/context"
import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"
import { createPersonalSkillGithubImportFlow, type GithubImported } from "./personal-skill-github-import-flow"
import styles from "./github-import-dialog.module.css"
export { parseGithubRepository } from "@/hub/client"

const clients = { github: createSkillGithubImportClient(), publish: createSkillPublishClient(), installation: createSkillInstallationClient() }
type Props = { readBoundary: ProjectReadBoundary; open: boolean; onOpenChange: (open: boolean) => void; onImported?: (result: GithubImported) => void; returnFocusRef?: RefObject<HTMLElement | null> }
export function GithubImportDialog({ readBoundary: boundary, open, onOpenChange, onImported, returnFocusRef }: Props) {
  const t = useT()
  const flow = useMemo(() => createPersonalSkillGithubImportFlow({ ...clients, subject: boundary.subject ?? "" }), [boundary.subject])
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot)
  const [value, setValue] = useState(""), [invalid, setInvalid] = useState(false)
  const completed = useRef<unknown>(null), callback = useRef(onImported)
  useEffect(() => { callback.current = onImported }, [onImported])
  useLayoutEffect(() => { flow.setAdmitted(boundary.admitted && Boolean(boundary.subject)); return () => flow.cancel() }, [flow, boundary.admitted, boundary.subject, boundary.generation])
  useEffect(() => { if (boundary.subject === null) flow.retire() }, [boundary.subject, flow])
  useEffect(() => () => flow.retire(), [flow])
  useLayoutEffect(() => { if (!open) { flow.cancel(); flow.finishCompleted() } }, [open, flow])
  useEffect(() => { if (open && boundary.admitted && state.kind === "completed" && state.result && completed.current !== state.result) { completed.current = state.result; callback.current?.(state.result) } }, [open, boundary.admitted, state])
  const stageLabel = state.stage === "preview" ? t("skills.githubStagePreview") : state.stage === "import" ? t("skills.githubStageImport") : state.stage === "read" ? t("skills.githubStageRead") : state.stage === "publish" ? t("skills.githubStagePublish") : t("skills.githubStageInstall")
  const busy = state.kind === "running", authorized = boundary.admitted && Boolean(boundary.subject)
  const submit = () => { const parsed = parseGithubRepository(value); if (!parsed) { setInvalid(true); return } setInvalid(false); void flow.preview(parsed.canonical) }
  const close = (next: boolean) => { if (!next) { flow.cancel(); if (state.kind === "completed") { flow.finishCompleted(); setValue("") } } onOpenChange(next) }
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className={styles.dialog} overlayClassName={styles.dialogOverlay ?? ""} closeLabel={t("skills.githubClose")} data-testid="github-import-dialog" onCloseAutoFocus={event => { const target = returnFocusRef?.current; if (!target?.isConnected || target.hasAttribute("disabled")) return; event.preventDefault(); window.requestAnimationFrame(() => target.focus({ preventScroll: true })) }}>
      <DialogHeader className={styles.header}><div className={styles.brandFlow} aria-hidden="true"><span className={styles.brandIcon}><Image src="/assets/connectors/github.webp" alt="" width={20} height={20} /></span><ArrowLeftRight className={styles.transferIcon} /><span className={styles.brandIcon}><BrandFallback className={styles.kokoroIcon ?? ""} /></span></div><DialogTitle>{t("skills.importGithub")}</DialogTitle><DialogDescription>{t("skills.githubDescription")}</DialogDescription></DialogHeader>
      <div className={styles.body}>
        <div className={styles.form} data-invalid={invalid || state.kind === "failed" || state.kind === "unknown" || undefined}>
          <label className={styles.label} htmlFor="github-repository-url">{t("skills.githubRepositoryLabel")}</label>
          <Input id="github-repository-url" data-testid="github-repository-input" value={value} placeholder={t("skills.githubRepositoryPlaceholder")} autoComplete="url" disabled={busy || state.kind !== "idle" && !(state.kind === "failed" && state.stage === "preview")} aria-invalid={invalid} aria-describedby={invalid ? "github-repository-help github-repository-error" : "github-repository-help"} onChange={event => { setValue(event.target.value); setInvalid(false) }} onBlur={() => { if (value.trim() && !parseGithubRepository(value)) setInvalid(true) }} onKeyDown={event => { if (event.key === "Enter" && !busy && (state.kind === "idle" || state.stage === "preview" && state.kind === "failed")) { event.preventDefault(); submit() } }} />
          <p id="github-repository-help" className="sr-only">{t("skills.githubDescription")}</p>
          {invalid ? <Alert id="github-repository-error" role="alert" variant="destructive" className={styles.error}><AlertDescription>{t("skills.githubInvalid")}</AlertDescription></Alert> : null}
          {busy ? <p role="status" data-testid="github-import-status">{stageLabel}</p> : null}
          {state.kind === "select" ? <fieldset className={styles.paths}><legend>{t("skills.githubChoosePath")}</legend>{state.paths?.map(path => <Button key={path} type="button" variant="outline" disabled={!authorized} onClick={() => flow.select(path)}>{path || "/"}</Button>)}</fieldset> : null}
          {state.kind === "ready" ? <p>{state.name ?? t("skills.githubSelectedPath")}<span data-testid="github-selected-path">{state.path || "/"}</span><span className={styles.commit}>{state.commit}</span></p> : null}
          {state.kind === "failed" || state.kind === "unknown" ? <Alert role="alert" variant="destructive" className={styles.error}><AlertDescription>{t(state.kind === "unknown" ? "skills.githubUnknown" : "skills.githubImportFailed")}</AlertDescription>{state.code ? <p>{state.code}</p> : null}{state.skillId ? <p>{state.skillId}</p> : null}</Alert> : null}
          {state.kind === "completed" ? <div className={styles.result} data-testid="github-import-complete" role="status"><p className={styles.success}><Check aria-hidden="true" />{t("skills.githubImported")}</p><p>{state.result?.name}</p></div> : null}
        </div>
      </div>
      <DialogFooter className={styles.footer}>
        {state.kind === "completed" ? <Button onClick={() => close(false)} data-testid="github-import-done">{t("skills.githubDone")}</Button> : state.kind === "ready" ? <Button disabled={!authorized} onClick={() => void flow.confirm()}>{t("skills.githubConfirmOwner")}</Button> : state.kind === "unknown" || state.kind === "failed" && state.stage !== "preview" ? <Button disabled={!authorized || busy} onClick={() => void flow.retry()}>{t("skills.retry")}</Button> : <Button disabled={!authorized || busy || !parseGithubRepository(value) || state.kind === "select"} aria-busy={busy} onClick={submit} data-testid="github-import-submit">{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}{t("skills.githubPreview")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
