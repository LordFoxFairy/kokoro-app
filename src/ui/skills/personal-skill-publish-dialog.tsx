"use client"

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { ManagedPersonalSkill, SkillPublishRequest } from "@/hub/schemas"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { HubClientError } from "@/hub/client"
import { useT } from "@/i18n/context"

import { createPersonalSkillVersionSession, createPersonalSkillPublishSession, createResumedSkillPublishSession, runPersonalSkillPublishSession, SkillPublishPending, SkillPublishRestartRequired, SkillPublishUncertain, type PersonalSkillPublishSession, type PublishStage, type PublishReceipt } from "./personal-skill-publish-flow"
import { PersonalSkillActions, type PersonalSkillOperation } from "./personal-skill-actions"

type Status = { kind: "idle" } | { kind: "running"; stage: PublishStage } | { kind: "pending" } | { kind: "error" } | { kind: "invalidFile" } | { kind: "tooLarge" } | { kind: "auth" } | { kind: "restart" } | { kind: "uncertain"; skillId: string } | { kind: "success"; sourceRef: string; revision: string }

export function PersonalSkillPublishDialog({ open, onOpenChange, client, onPublished, onManagePublished, hash, base, admitted = true, returnFocusRef, onIntentStarted }: {
  open: boolean
  onOpenChange: (open: boolean, retainIntent?: boolean) => void
  returnFocusRef?: RefObject<HTMLElement | null>
  onIntentStarted?: () => void
  client: SkillPublishClient
  onPublished: () => void
  onManagePublished?: (operation: PersonalSkillOperation, receipt: PublishReceipt) => void
  hash?: (file: File) => Promise<string>
  admitted?: boolean
  base?: ManagedPersonalSkill
}) {
  const t = useT()
  const updating = base !== undefined && ["active", "disabled"].includes(base.status)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(base?.name ?? "")
  const [summary, setSummary] = useState(base?.summary ?? "")
  const [tags, setTags] = useState(base?.tags.join(",") ?? "")
  const [examples, setExamples] = useState(base?.example_prompts.join("\n") ?? "")
  const [audience, setAudience] = useState<SkillPublishRequest["audience"] | "">(updating ? "owner" : "")
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const active = useRef<AbortController | null>(null)
  const [session, setSession] = useState<PersonalSkillPublishSession | null>(null)
  const [lastFlight, setLastFlight] = useState<AbortController | null>(null)
  const visibleStatus: Status = status.kind === "running" && lastFlight?.signal.aborted ? { kind: "error" } : status
  useEffect(() => () => { active.current?.abort() }, [])
  useEffect(() => { if (!admitted || !open) active.current?.abort() }, [admitted, open])

  const close = () => {
    active.current?.abort()
    active.current = null
    if (status.kind === "success") {
      setSession(null)
      setStatus({ kind: "idle" })
      setFile(null)
      setName("")
      setSummary("")
      setTags("")
    } else if (status.kind === "running") setStatus({ kind: "error" })
    onOpenChange(false, session !== null && status.kind !== "success")
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!admitted || visibleStatus.kind === "running" || status.kind === "restart" || status.kind === "success") return
    let currentSession = session
    if (currentSession === null) {
      if ((!file && (!base || updating)) || !audience) return
      try {
        currentSession = updating ? createPersonalSkillVersionSession(base!, { file: file!, display_name: name, summary, tags: tags.split(",").map(item => item.trim()).filter(Boolean), example_prompts: examples === base!.example_prompts.join("\n") ? base!.example_prompts : examples === "" ? [] : examples.split("\n"), category_keys: base!.category_keys, audience: "owner" }) : base ? createResumedSkillPublishSession(base, audience, file ?? undefined) : createPersonalSkillPublishSession({ file: file!, display_name: name, summary, tags: tags.split(",").map((item) => item.trim()).filter(Boolean), audience })
        setSession(currentSession)
        onIntentStarted?.()
      } catch (error) {
        if (error instanceof HubClientError && error.code === "request_body_too_large") setStatus({ kind: "tooLarge" })
        else if (error instanceof HubClientError && error.code === "invalid_skill_request") setStatus({ kind: "invalidFile" })
        else setStatus({ kind: "error" })
        return
      }
    }
    const controller = new AbortController()
    active.current = controller
    setLastFlight(controller)
    setStatus({ kind: "running", stage: "hashing" })
    void runPersonalSkillPublishSession(client, currentSession, { signal: controller.signal, ...(hash === undefined ? {} : { hash }), onStage: (stage) => { if (!controller.signal.aborted) setStatus({ kind: "running", stage }) } }).then(
      (receipt) => {
        if (controller.signal.aborted) return
        setStatus({ kind: "success", sourceRef: receipt.source_ref, revision: receipt.revision })
        onPublished()
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof SkillPublishUncertain) setStatus({ kind: "uncertain", skillId: error.skillId })
        else if (error instanceof SkillPublishPending) setStatus({ kind: "pending" })
        else if (error instanceof SkillPublishRestartRequired) setStatus({ kind: "restart" })
        else if (error instanceof HubClientError && [401, 403].includes(error.status ?? 0)) setStatus({ kind: "auth" })
        else if (error instanceof HubClientError && [409, 412].includes(error.status ?? 0) && error.code !== "skill_command_in_progress" && !currentSession.draftUncertain) setStatus({ kind: "restart" })
        else setStatus({ kind: "error" })
      },
    ).finally(() => { if (active.current === controller) active.current = null })
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
    <DialogContent data-testid="personal-skill-publish-dialog" closeLabel={t("skills.publishClose")} onCloseAutoFocus={event => { if (returnFocusRef) { event.preventDefault(); if (admitted) returnFocusRef.current?.focus() } }}>
      <DialogTitle>{t(updating ? "skills.lifecycle.update" : "skills.publishTitle")}</DialogTitle>
      <DialogDescription>{t("skills.publishDescription")}</DialogDescription>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-zip">{t(base ? "skills.publishReplaceUpload" : "skills.publishFile")}</label>
        <Input id="personal-skill-zip" type="file" accept=".zip,application/zip" required={session === null && !base} disabled={session !== null || visibleStatus.kind === "running"} onChange={(event) => {
          setFile(event.target.files?.[0] ?? null)
        }} />
        {session ? <p className="text-xs text-muted-foreground">{session.input.file?.name ?? base?.name}</p> : null}
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-name">{t("skills.publishName")}</label>
        <Input id="personal-skill-name" required maxLength={255} value={name} disabled={base !== undefined && !updating || session !== null || visibleStatus.kind === "running"} onChange={(event) => setName(event.target.value)} />
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-summary">{t("skills.publishSummary")}</label>
        <Textarea id="personal-skill-summary" maxLength={65535} value={summary} disabled={base !== undefined && !updating || session !== null || visibleStatus.kind === "running"} onChange={(event) => setSummary(event.target.value)} />
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-tags">{t("skills.publishTags")}</label>
        <Input id="personal-skill-tags" value={tags} disabled={base !== undefined && !updating || session !== null || visibleStatus.kind === "running"} onChange={(event) => setTags(event.target.value)} />
        {updating ? <><label htmlFor="personal-skill-examples">{t("skills.lifecycle.examples")}</label><Textarea id="personal-skill-examples" value={examples} disabled={session !== null || visibleStatus.kind === "running"} onChange={event => setExamples(event.target.value)} /></> : null}
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-audience">{t("skills.publishAudience")}</label>
        <select id="personal-skill-audience" className="w-full rounded-md border border-input bg-background p-2 text-sm" value={audience} required disabled={session !== null || visibleStatus.kind === "running"} onChange={(event) => setAudience(event.target.value as SkillPublishRequest["audience"])}>
          <option value="" disabled>{t("skills.publishChooseAudience")}</option>
          <option value="owner">{t("skills.publishAudienceOwner")}</option>
          {!updating ? <option value="tenant">{t("skills.publishAudienceTenant")}</option> : null}
          {!updating ? <option value="catalog">{t("skills.publishAudienceCatalog")}</option> : null}
        </select>
        {visibleStatus.kind === "running" ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t(`skills.publishStage.${visibleStatus.stage}`)}</p> : null}
        {visibleStatus.kind === "pending" ? <Alert role="status"><AlertDescription>{t("skills.publishPending")}</AlertDescription></Alert> : null}
        {visibleStatus.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.publishError")}</AlertDescription></Alert> : null}
        {visibleStatus.kind === "invalidFile" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.publishInvalidFile")}</AlertDescription></Alert> : null}
        {visibleStatus.kind === "tooLarge" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.publishMetadataTooLarge")}</AlertDescription></Alert> : null}
        {visibleStatus.kind === "auth" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.publishAuth")}</AlertDescription></Alert> : null}
        {visibleStatus.kind === "restart" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.publishRestart")}</AlertDescription></Alert> : null}
        {visibleStatus.kind === "uncertain" ? <Alert role="alert"><AlertDescription>{t("skills.publishUnknown")} ({visibleStatus.skillId})</AlertDescription></Alert> : null}
        {visibleStatus.kind === "success" ? <div className="flex items-center gap-2">
          <p role="status" className="min-w-0 flex-1 break-words text-sm text-foreground">{t("skills.publishSuccess")} · {visibleStatus.sourceRef} · {visibleStatus.revision}</p>
          {onManagePublished ? <PersonalSkillActions disabled={!admitted} onSelect={operation => onManagePublished(operation, { source_ref: visibleStatus.sourceRef, revision: visibleStatus.revision })} /> : null}
        </div> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>{visibleStatus.kind === "running" ? t("skills.publishCancel") : t("skills.publishClose")}</Button>
          {visibleStatus.kind === "restart" ? <Button type="button" onClick={() => { setSession(null); setStatus({ kind: "idle" }); setFile(null); setName(base?.name ?? ""); setSummary(base?.summary ?? ""); setTags(base?.tags.join(",") ?? ""); setExamples(base?.example_prompts.join("\n") ?? "") }}>{t("skills.publishStartOver")}</Button>
            : <Button type="submit" disabled={!admitted || session === null && ((!file && (!base || updating)) || !name.trim() || !audience) || visibleStatus.kind === "running" || visibleStatus.kind === "success"}>{visibleStatus.kind === "pending" ? t("skills.publishCheckAgain") : visibleStatus.kind === "uncertain" ? t("skills.publishRecheck") : session ? t("skills.publishRetry") : t(updating ? "skills.lifecycle.update" : "skills.publishAction")}</Button>}
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
