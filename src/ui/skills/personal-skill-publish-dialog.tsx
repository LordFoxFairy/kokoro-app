"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { useT } from "@/i18n/context"

import { publishPersonalSkill, SkillPublishUncertain, type PublishStage } from "./personal-skill-publish-flow"

type Status = { kind: "idle" } | { kind: "running"; stage: PublishStage } | { kind: "error" } | { kind: "uncertain"; skillId: string } | { kind: "success"; sourceRef: string; revision: string }

export function PersonalSkillPublishDialog({ open, onOpenChange, client, onPublished }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: SkillPublishClient
  onPublished: () => void
}) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [summary, setSummary] = useState("")
  const [tags, setTags] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => { active.current?.abort() }, [])

  const close = () => {
    active.current?.abort()
    active.current = null
    setStatus({ kind: "idle" })
    setFile(null)
    setName("")
    setSummary("")
    setTags("")
    onOpenChange(false)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!file || status.kind === "running") return
    const controller = new AbortController()
    active.current = controller
    setStatus({ kind: "running", stage: "hashing" })
    void publishPersonalSkill(client, {
      file, display_name: name, summary, tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
    }, { signal: controller.signal, onStage: (stage) => { if (!controller.signal.aborted) setStatus({ kind: "running", stage }) } }).then(
      (receipt) => {
        if (controller.signal.aborted) return
        setStatus({ kind: "success", sourceRef: receipt.source_ref, revision: receipt.revision })
        onPublished()
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setStatus(error instanceof SkillPublishUncertain ? { kind: "uncertain", skillId: error.skillId } : { kind: "error" })
      },
    ).finally(() => { if (active.current === controller) active.current = null })
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
    <DialogContent data-testid="personal-skill-publish-dialog" closeLabel={t("skills.publishClose")}>
      <DialogTitle>{t("skills.publishTitle")}</DialogTitle>
      <DialogDescription>{t("skills.publishDescription")}</DialogDescription>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-zip">{t("skills.publishFile")}</label>
        <Input id="personal-skill-zip" type="file" accept=".zip,application/zip" required disabled={status.kind === "running"} onChange={(event) => {
          setFile(event.target.files?.[0] ?? null)
        }} />
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-name">{t("skills.publishName")}</label>
        <Input id="personal-skill-name" required maxLength={255} value={name} disabled={status.kind === "running"} onChange={(event) => setName(event.target.value)} />
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-summary">{t("skills.publishSummary")}</label>
        <Textarea id="personal-skill-summary" maxLength={65535} value={summary} disabled={status.kind === "running"} onChange={(event) => setSummary(event.target.value)} />
        <label className="block space-y-1 text-sm font-medium" htmlFor="personal-skill-tags">{t("skills.publishTags")}</label>
        <Input id="personal-skill-tags" value={tags} disabled={status.kind === "running"} onChange={(event) => setTags(event.target.value)} />
        {status.kind === "running" ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t(`skills.publishStage.${status.stage}`)}</p> : null}
        {status.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.publishError")}</AlertDescription></Alert> : null}
        {status.kind === "uncertain" ? <Alert role="alert"><AlertDescription>{t("skills.publishUnknown")} ({status.skillId})</AlertDescription></Alert> : null}
        {status.kind === "success" ? <p role="status" className="text-sm text-foreground">{t("skills.publishSuccess")} · {status.sourceRef} · {status.revision}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>{status.kind === "running" ? t("skills.publishCancel") : t("skills.publishClose")}</Button>
          <Button type="submit" disabled={!file || !name.trim() || status.kind !== "idle"}>{t("skills.publishAction")}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
