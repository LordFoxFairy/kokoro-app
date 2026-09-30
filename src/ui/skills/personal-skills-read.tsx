"use client"

import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { createSkillInstallationClient, HubClientError, type HubClient } from "@/hub/client"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import type { PersonalSkillPage, PublishedPersonalSkill, InstallationPage, PersonalInstallation } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import { PersonalSkillPublishDialog } from "./personal-skill-publish-dialog"

type PageState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; page: PersonalSkillPage }
type DetailState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; skill: PublishedPersonalSkill } | null
const publishClient = createSkillPublishClient()
const installationClient = createSkillInstallationClient()
type InstallationMutation = Readonly<{ operation: "install" | "setEnabled" | "remove"; resource: string; key: string; enabled?: boolean }>
type InstallationIntent = InstallationMutation | Readonly<{ operation: "get"; resource: string }>
type InstallationState = { kind: "loading" } | { kind: "error"; status: number | null } | { kind: "ready"; page: InstallationPage }
type ActionState = { kind: "idle" } | { kind: "busy" | "unknown" | "rejected" | "confirmed" | "ready"; intent: InstallationIntent; id?: string; current?: PersonalInstallation; status?: number | null }
type ActiveAction = { controller: AbortController; intent: InstallationIntent; id: string | null }


export function PersonalSkillsRead({ client, embedded = false, onOpenSettings }: {
  client: HubClient
  embedded?: boolean
  onOpenSettings?: (section: "skills", trigger: HTMLElement) => void
}) {
  const t = useT()
  const [view, setView] = useState<"published" | "installations">("published")
  const [installedFilter, setInstalledFilter] = useState("true")
  const [enabledFilter, setEnabledFilter] = useState("all")
  const [installationCursor, setInstallationCursor] = useState<string | null>(null)
  const [installationHistory, setInstallationHistory] = useState<Array<string | null>>([])
  const [installationGeneration, setInstallationGeneration] = useState(0)
  const [installations, setInstallations] = useState<InstallationState>({ kind: "loading" })
  const [action, setAction] = useState<ActionState>({ kind: "idle" })
  const activeAction = useRef<ActiveAction | null>(null)
  const detailController = useRef<AbortController | null>(null)
  const actionLocked = ["busy", "unknown", "confirmed"].includes(action.kind)

  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<string | null>>([])
  const [generation, setGeneration] = useState(0)
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" })
  const [detail, setDetail] = useState<DetailState>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const detailRequest = useRef(0)

  useEffect(() => () => {
    detailRequest.current += 1
    detailController.current?.abort()
    activeAction.current?.controller.abort()
    activeAction.current = null
  }, [])

  useEffect(() => {
    if (view !== "installations") return
    const controller = new AbortController()
    let current = true
    void installationClient.list({ installed: installedFilter === "all" ? undefined : installedFilter === "true", enabled: enabledFilter === "all" ? undefined : enabledFilter === "true", limit: 50, ...(installationCursor === null ? {} : { cursor: installationCursor }) }, controller.signal).then(
      (page) => {
        if (!current) return
        const next = page.meta?.next_cursor
        setInstallations(next !== undefined && (next === installationCursor || installationHistory.includes(next))
          ? { kind: "error", status: null } : { kind: "ready", page })
      },
      (error: unknown) => { if (current) setInstallations({ kind: "error", status: error instanceof HubClientError ? error.status : null }) },
    )
    return () => { current = false; controller.abort() }
  }, [view, installedFilter, enabledFilter, installationCursor, installationGeneration, installationHistory])

  const cancelAction = () => {
    const running = activeAction.current
    if (!running) return
    activeAction.current = null
    running.controller.abort()
    setAction(running.id === null ? { kind: "unknown", intent: running.intent } : { kind: "confirmed", intent: running.intent, id: running.id })
  }
  const perform = async (intent: InstallationIntent, confirmedId?: string, recovering = false) => {
    if (activeAction.current) return
    const running: ActiveAction = { controller: new AbortController(), intent, id: confirmedId ?? (intent.operation === "get" ? intent.resource : null) }
    activeAction.current = running
    setAction({ kind: "busy", intent, ...(confirmedId === undefined ? {} : { id: confirmedId }) })
    const signal = running.controller.signal
    try {
      if (running.id === null && intent.operation !== "get") {
        const receipt = intent.operation === "install" ? await installationClient.install(intent.resource, intent.key, signal)
          : intent.operation === "remove" ? await installationClient.remove(intent.resource, intent.key, signal)
            : await installationClient.setEnabled(intent.resource, intent.enabled === true, intent.key, signal)
        if (activeAction.current !== running) return
        running.id = receipt.installation.installation_id
      }
      const current = await installationClient.get(running.id ?? intent.resource, signal)
      if (activeAction.current !== running) return
      setAction({ kind: "ready", intent, id: running.id ?? intent.resource, current })
      setInstallationCursor(null)
      setInstallationHistory([])
      setInstallations({ kind: "loading" })
      setInstallationGeneration((value) => value + 1)
    } catch (error) {
      if (activeAction.current !== running) return
      if (running.id !== null) setAction({ kind: "confirmed", intent, id: running.id })
      else if (!recovering && error instanceof HubClientError && error.reason === "http" && [400, 401, 403, 404, 409, 412, 413].includes(error.status ?? 0) && error.code !== "skill_installation_command_in_progress") {
        setAction({ kind: "rejected", intent, status: error.status })
      } else setAction({ kind: "unknown", intent, status: error instanceof HubClientError ? error.status : null })
    } finally {
      if (activeAction.current === running) activeAction.current = null
    }
  }
  const startAction = (operation: InstallationMutation["operation"], resource: string, enabled?: boolean) => {
    if (activeAction.current || actionLocked) return
    void perform(Object.freeze({ operation, resource, key: crypto.randomUUID(), ...(enabled === undefined ? {} : { enabled }) }))
  }
  const changeView = (next: "published" | "installations") => {
    if (next === view) return
    cancelAction()
    if (next === "published") setPageState({ kind: "loading" })
    detailController.current?.abort()
    detailRequest.current += 1
    setDetail(null)
    setView(next)
    setInstallations({ kind: "loading" })
  }
  const resetInstallationPage = () => {
    cancelAction()
    setInstallationCursor(null)
    setInstallationHistory([])
    setInstallations({ kind: "loading" })
    setInstallationGeneration((value) => value + 1)
  }
  const errorLabel = (status: number | null | undefined) => status === 401 || status === 403 ? t("skills.personal.forbidden") : status === 409 || status === 412 ? t("skills.personal.conflict") : t("skills.personal.rejected")


  useEffect(() => {
    if (view !== "published") return
    let current = true
    const controller = new AbortController()
    void client.listPersonalSkills(cursor ?? undefined, controller.signal).then(
      (page) => { if (current) setPageState({ kind: "ready", page }) },
      () => { if (current) setPageState({ kind: "error" }) },
    )
    return () => { current = false; controller.abort() }
  }, [client, cursor, generation, view])

  const openDetail = (sourceRef: string) => {
    const id = sourceRef.slice("skill:".length)
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    const request = ++detailRequest.current
    setDetail({ kind: "loading" })
    void client.getPublishedPersonalSkill(id, controller.signal).then(
      (skill) => { if (request === detailRequest.current) setDetail(skill.source_ref === sourceRef ? { kind: "ready", skill } : { kind: "error" }) },
      () => { if (request === detailRequest.current) setDetail({ kind: "error" }) },
    )
  }

  const page = pageState.kind === "ready" ? pageState.page : null
  return (
    <section className="space-y-4" data-testid="personal-skills-read">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("skills.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setPublishOpen(true)}>{t("skills.publishTitle")}</Button>
          {!embedded && onOpenSettings ? <Button type="button" variant="outline" onClick={(event) => onOpenSettings("skills", event.currentTarget)}>{t("skills.mySkills")}</Button> : null}
        </div>
      </header>
      <nav className="flex gap-2" aria-label={t("skills.title")}>
        <Button type="button" variant={view === "published" ? "default" : "outline"} aria-pressed={view === "published"} onClick={() => changeView("published")}>{t("skills.personal.published")}</Button>
        <Button type="button" variant={view === "installations" ? "default" : "outline"} aria-pressed={view === "installations"} onClick={() => changeView("installations")}>{t("skills.personal.installations")}</Button>
      </nav>
      {action.kind !== "idle" ? <Alert role={action.kind === "unknown" || action.kind === "rejected" || action.kind === "confirmed" ? "alert" : "status"}>
        <AlertDescription>{action.kind === "busy" ? t("skills.loading") : action.kind === "unknown" ? t("skills.personal.unknown") : action.kind === "confirmed" ? t(action.intent.operation === "get" ? "skills.personal.rejected" : "skills.personal.confirmed") : action.kind === "rejected" ? errorLabel(action.status) : t("skills.personal.currentConfirmed")}</AlertDescription>
        {action.kind === "unknown" && [401, 403, 409, 412].includes(action.status ?? 0) ? <p>{errorLabel(action.status)}</p> : null}
        {action.kind === "busy" ? <Button type="button" variant="outline" onClick={cancelAction}>{t("skills.cancel")}</Button> : null}
        {action.kind === "unknown" ? <Button type="button" variant="outline" onClick={() => void perform(action.intent, undefined, true)}>{t("skills.retry")}</Button> : null}
        {action.kind === "confirmed" && action.id ? <Button type="button" variant="outline" onClick={() => void perform(action.intent, action.id)}>{t("skills.personal.checkCurrent")}</Button> : null}
        {action.kind === "rejected" && action.intent.operation !== "install" ? <Button type="button" variant="outline" onClick={() => void perform(action.intent, action.intent.resource)}>{t("skills.personal.checkCurrent")}</Button> : null}
        {action.current ? <p data-testid="installation-current">{action.current.source_ref} · {action.current.revision} · {action.current.installed ? t("skills.personal.installed") : t("skills.personal.removed")} · {action.current.enabled ? t("skills.personal.enabled") : t("skills.personal.disabled")}</p> : null}
      </Alert> : null}
      {view === "published" ? <>
      {pageState.kind === "loading" ? <div role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />{t("skills.loading")}</div> : null}
      {pageState.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={() => { setPageState({ kind: "loading" }); setGeneration((value) => value + 1) }}>{t("skills.retry")}</Button></Alert> : null}
      {page?.skills.length === 0 ? <p className="text-muted-foreground">{t("skills.noMatch")}</p> : null}
      {page ? <div className="grid gap-3 sm:grid-cols-2" data-testid="personal-skills-grid">{page.skills.map((skill) => (
        <Card key={skill.source_ref}>
          <CardContent className="space-y-2 p-4">
            <Button type="button" variant="ghost" className="h-auto px-0 text-left font-semibold" onClick={() => openDetail(skill.source_ref)}>{skill.name}</Button>
            <p className="text-sm text-muted-foreground">{skill.description}</p>
            <p className="text-xs text-muted-foreground" data-testid="personal-skill-provenance">{skill.source_ref} · {skill.revision}</p>
            <Button type="button" variant="outline" disabled={actionLocked} onClick={() => startAction("install", skill.source_ref)}>{t("skills.personal.install")}</Button>
          </CardContent>
        </Card>
      ))}</div> : null}
      {page ? <nav className="flex gap-2" aria-label="Skill pages">
        <Button type="button" variant="outline" disabled={history.length === 0} onClick={() => {
          const previous = history.at(-1) ?? null
          setPageState({ kind: "loading" })
          setHistory((items) => items.slice(0, -1))
          setCursor(previous)
        }}>{t("plugins.previous")}</Button>
        <Button type="button" variant="outline" disabled={!page.next_cursor} onClick={() => {
          if (!page.next_cursor) return
          setPageState({ kind: "loading" })
          setHistory((items) => [...items, cursor])
          setCursor(page.next_cursor ?? null)
        }}>{t("plugins.next")}</Button>
      </nav> : null}
      </> : <section className="space-y-3" data-testid="personal-installations">
        <div className="flex flex-wrap gap-4">
          <div><span>{t("skills.personal.installedFilter")}</span><Select value={installedFilter} onValueChange={(value) => { setInstalledFilter(value); resetInstallationPage() }}>
            <SelectTrigger aria-label={t("skills.personal.installedFilter")}><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">{t("skills.personal.all")}</SelectItem><SelectItem value="true">{t("skills.personal.installed")}</SelectItem><SelectItem value="false">{t("skills.personal.removed")}</SelectItem>
            </SelectContent>
          </Select></div>
          <div><span>{t("skills.personal.enabledFilter")}</span><Select value={enabledFilter} onValueChange={(value) => { setEnabledFilter(value); resetInstallationPage() }}>
            <SelectTrigger aria-label={t("skills.personal.enabledFilter")}><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">{t("skills.personal.all")}</SelectItem><SelectItem value="true">{t("skills.personal.enabled")}</SelectItem><SelectItem value="false">{t("skills.personal.disabled")}</SelectItem>
            </SelectContent>
          </Select></div>
        </div>
        {installations.kind === "loading" ? <p role="status">{t("skills.loading")}</p> : null}
        {installations.kind === "error" ? <Alert role="alert"><AlertDescription>{errorLabel(installations.status)}</AlertDescription><Button type="button" onClick={resetInstallationPage}>{t("skills.retry")}</Button></Alert> : null}
        {installations.kind === "ready" ? <>
          {installations.page.data.length === 0 ? <p>{t("skills.personal.empty")}</p> : null}
          {installations.page.data.map((item) => <Card key={item.installation_id}><CardContent className="space-y-2 p-4">
            <p>{item.source_ref} · {item.revision}</p>
            <p>{item.installed ? t("skills.personal.installed") : t("skills.personal.removed")} · {item.enabled ? t("skills.personal.enabled") : t("skills.personal.disabled")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={actionLocked} onClick={() => void perform({ operation: "get", resource: item.installation_id }, item.installation_id)}>{t("skills.personal.checkCurrent")}</Button>
              <Button type="button" variant="outline" disabled={actionLocked || !item.installed} onClick={() => startAction("setEnabled", item.installation_id, !item.enabled)}>{item.enabled ? t("skills.disable") : t("skills.enable")}</Button>
              <Button type="button" variant="outline" disabled={actionLocked || !item.installed} onClick={() => startAction("remove", item.installation_id)}>{t("skills.personal.remove")}</Button>
            </div>
          </CardContent></Card>)}
          <nav className="flex gap-2" aria-label={t("skills.personal.installations")}>
            <Button type="button" variant="outline" disabled={installationHistory.length === 0} onClick={() => { cancelAction(); setInstallations({ kind: "loading" }); setInstallationCursor(installationHistory.at(-1) ?? null); setInstallationHistory((items) => items.slice(0, -1)) }}>{t("plugins.previous")}</Button>
            <Button type="button" variant="outline" disabled={!installations.page.meta?.next_cursor} onClick={() => { const next = installations.page.meta?.next_cursor; if (next) { cancelAction(); setInstallations({ kind: "loading" }); setInstallationHistory((items) => [...items, installationCursor]); setInstallationCursor(next) } }}>{t("plugins.next")}</Button>
          </nav>
        </> : null}
      </section>}
      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) { detailController.current?.abort(); detailRequest.current += 1; setDetail(null) } }}>
        <DialogContent data-testid="personal-skill-detail">
          <DialogTitle>{detail?.kind === "ready" ? detail.skill.name : t("skills.title")}</DialogTitle>
          <DialogDescription>{detail?.kind === "ready" ? detail.skill.summary : t("skills.loading")}</DialogDescription>
          {detail?.kind === "ready" ? <div className="space-y-2 text-sm">
            <p>{detail.skill.source_ref} · {detail.skill.revision}</p>
            <p>{detail.skill.status}</p>
            <p>{detail.skill.tags.join(", ")}</p>
          </div> : null}
          {detail?.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.loadError")}</AlertDescription></Alert> : null}
        </DialogContent>
      </Dialog>
      <PersonalSkillPublishDialog open={publishOpen} onOpenChange={setPublishOpen} client={publishClient} onPublished={() => { setCursor(null); setHistory([]); setPageState({ kind: "loading" }); setGeneration((value) => value + 1) }} />
    </section>
  )
}
