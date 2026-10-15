"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, FileText, Folder, MessageCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { createSkillInstallationClient, HubClientError, type HubClient } from "@/hub/client"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import type { ManagedPersonalSkill, InstallationPage, PersonalInstallation } from "@/hub/schemas"
import { invalidate } from "@/lib/query"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { stashPendingDraft } from "@/ui/shell/use-draft"
import { SKILL_CATALOG_RESOURCE_KEY } from "@/ui/skills/manus-skill-client"
import { useSessionProbe } from "@/ui/auth/use-session-state"
import { PersonalSkillWithdrawDialog } from "./personal-skill-withdraw-dialog"
import { useT } from "@/i18n/context"
import { SkillUploadDialog } from "./skill-upload-dialog"
import { PersonalSkillPublishDialog } from "./personal-skill-publish-dialog"
import { getManusSkillPackage } from "./manus-skill-client"
import { SkillPackageDocument } from "./skill-package-document"
import styles from "./personal-skills-read.module.css"
import readerStyles from "./manus-skill-detail-dialog.module.css"
import type { CatalogPackageData } from "@/hub/schemas"

type PageState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; page: Awaited<ReturnType<typeof publishClient.listPublished>> }
type DetailState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; skill: ManagedPersonalSkill } | null
const publishClient = createSkillPublishClient()
const installationClient = createSkillInstallationClient()
type InstallationMutation = Readonly<{ operation: "install" | "setEnabled" | "remove"; resource: string; key: string; enabled?: boolean }>
type InstallationIntent = InstallationMutation | Readonly<{ operation: "get"; resource: string }>
type InstallationState = { kind: "loading" } | { kind: "error"; status: number | null } | { kind: "ready"; page: InstallationPage }
type ActionState = { kind: "idle" } | { kind: "busy" | "unknown" | "rejected" | "confirmed" | "ready"; intent: InstallationIntent; id?: string; current?: PersonalInstallation; status?: number | null }
type ActiveAction = { controller: AbortController; intent: InstallationIntent; id: string | null }

/**
 * The owner publishes immutable revisions, so the managed projection may
 * contain several active records for one series. The personal directory is a
 * management surface, not a revision history: present its current revision
 * once and keep the exact revision identity for detail/update/withdraw.
 */
function latestRevisionPerSeries(skills: readonly ManagedPersonalSkill[]): ManagedPersonalSkill[] {
  const latest = new Map<string, ManagedPersonalSkill>()
  for (const skill of skills) {
    const current = latest.get(skill.series_id)
    if (current === undefined || BigInt(skill.revision) > BigInt(current.revision)) latest.set(skill.series_id, skill)
  }
  return skills.filter((skill) => latest.get(skill.series_id)?.skill_id === skill.skill_id)
}


export function PersonalSkillsRead(props: {
  client: HubClient
  embedded?: boolean
  onOpenSettings?: (section: "skills", trigger: HTMLElement) => void
  onBack?: () => void
}) {
  const boundary = useSessionProbe().projectReadBoundary
  return <PersonalSkillsReadScope key={boundary.subject ?? "anonymous"} {...props} boundary={boundary} />
}

function PersonalSkillsReadScope({ client, embedded = false, onOpenSettings, onBack, boundary }: {
  client: HubClient
  embedded?: boolean
  onOpenSettings?: (section: "skills", trigger: HTMLElement) => void
  onBack?: () => void
  boundary: import("@/ui/auth/use-session-state").ProjectReadBoundary
}) {
  const t = useT()
  const admitted = boundary.admitted && boundary.subject !== null
  const [withdrawTarget, setWithdrawTarget] = useState<ManagedPersonalSkill | null>(null)
  const [lifecycleSubject, setLifecycleSubject] = useState<string | null>(null)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [view, setView] = useState<"published" | "installations" | "drafts">("published")
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
  const [packageReaderOpen, setPackageReaderOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [resumeBase, setResumeBase] = useState<ManagedPersonalSkill | null>(null)
  const [draftPage, setDraftPage] = useState<Awaited<ReturnType<typeof publishClient.listDrafts>> | null>(null)
  const [draftError, setDraftError] = useState(false)
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
        invalidate(SKILL_CATALOG_RESOURCE_KEY)
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
    if (next === "published") {
      setPageState({ kind: "loading" })
      if (view === "drafts") { setCursor(null); setHistory([]) }
    }
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
      (page) => { if (current) setPageState(page.skills.some((skill) => skill.status !== "active") || page.next_cursor !== null && (page.next_cursor === cursor || history.includes(page.next_cursor)) ? { kind: "error" } : { kind: "ready", page }) },
      () => { if (current) setPageState({ kind: "error" }) },
    )
    return () => { current = false; controller.abort() }
  }, [client, cursor, generation, view, history])

  useEffect(() => {
    if (view !== "drafts") return
    let current = true
    const controller = new AbortController()
    void publishClient.listDrafts(cursor ?? undefined, controller.signal).then((page) => {
      if (!current) return
      if (page.skills.some((skill) => skill.status !== "draft") || page.next_cursor !== null && (page.next_cursor === cursor || history.includes(page.next_cursor))) { setDraftError(true); return }
      setDraftPage(page)
    }, () => { if (current) setDraftError(true) })
    return () => { current = false; controller.abort() }
  }, [view, cursor, generation, history])

  const openDetail = (sourceRef: string) => {
    const id = sourceRef.slice("skill:".length)
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    const request = ++detailRequest.current
    setPackageReaderOpen(false)
    setDetail({ kind: "loading" })
    void client.getPublishedPersonalSkill(id, controller.signal).then(
      (skill) => { if (request === detailRequest.current) setDetail(skill.source_ref === sourceRef ? { kind: "ready", skill } : { kind: "error" }) },
      () => { if (request === detailRequest.current) setDetail({ kind: "error" }) },
    )
  }

  const startExample = (prompt: string) => {
    // Keep examples on the shared composer instead of creating a second chat transport.
    stashPendingDraft(prompt)
    detailController.current?.abort()
    detailRequest.current += 1
    setDetail(null)
    navigateMountedSurface("/app")
  }

  const page = pageState.kind === "ready" ? pageState.page : null
  return (
    <section className={styles.surface} data-testid="personal-skills-read">
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>{t("skills.mySkills")}</p><h1>{t("skills.title")}</h1></div>
        <div className={styles.headerActions}>
          <Button type="button" className={styles.primaryAction} onClick={() => setImportOpen(true)}>{t("skills.uploadSkill")}</Button>
          {onBack ? <Button type="button" variant="outline" className={styles.secondaryAction} onClick={onBack}>{t("skills.browse")}</Button> : null}
          {!embedded && onOpenSettings ? <Button type="button" variant="outline" className={styles.secondaryAction} onClick={(event) => onOpenSettings("skills", event.currentTarget)}>{t("skills.mySkills")}</Button> : null}
        </div>
      </header>
      <nav className={styles.tabs} aria-label={t("skills.title")}>
        <Button type="button" variant={view === "published" ? "default" : "outline"} className={styles.tab} aria-pressed={view === "published"} onClick={() => changeView("published")}>{t("skills.personal.published")}</Button>
        <Button type="button" variant={view === "installations" ? "default" : "outline"} className={styles.tab} aria-pressed={view === "installations"} onClick={() => changeView("installations")}>{t("skills.personal.installations")}</Button>
      </nav>
      {action.kind !== "idle" ? <Alert role={action.kind === "unknown" || action.kind === "rejected" || action.kind === "confirmed" ? "alert" : "status"}>
        <AlertDescription>{action.kind === "busy" ? t("skills.loading") : action.kind === "unknown" ? t("skills.personal.unknown") : action.kind === "confirmed" ? t(action.intent.operation === "get" ? "skills.personal.rejected" : "skills.personal.confirmed") : action.kind === "rejected" ? errorLabel(action.status) : t("skills.personal.currentConfirmed")}</AlertDescription>
        {action.kind === "unknown" && [401, 403, 409, 412].includes(action.status ?? 0) ? <p>{errorLabel(action.status)}</p> : null}
        {action.kind === "busy" ? <Button type="button" variant="outline" onClick={cancelAction}>{t("skills.cancel")}</Button> : null}
        {action.kind === "unknown" ? <Button type="button" variant="outline" onClick={() => void perform(action.intent, undefined, true)}>{t("skills.retry")}</Button> : null}
        {action.kind === "confirmed" && action.id ? <Button type="button" variant="outline" onClick={() => void perform(action.intent, action.id)}>{t("skills.personal.checkCurrent")}</Button> : null}
        {action.kind === "rejected" && action.intent.operation !== "install" ? <Button type="button" variant="outline" onClick={() => void perform(action.intent, action.intent.resource)}>{t("skills.personal.checkCurrent")}</Button> : null}
        {action.current ? <p data-testid="installation-current">{action.current.installed ? t("skills.personal.installed") : t("skills.personal.removed")} · {action.current.enabled ? t("skills.personal.enabled") : t("skills.personal.disabled")}</p> : null}
      </Alert> : null}
      <Button type="button" variant="outline" className={styles.draftAction} onClick={() => { setCursor(null); setHistory([]); setDraftPage(null); setDraftError(false); setView("drafts") }}>{t("skills.publishDrafts")}</Button>
      {view === "published" ? <>
      {pageState.kind === "loading" ? <div role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />{t("skills.loading")}</div> : null}
      {pageState.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={() => { setPageState({ kind: "loading" }); setGeneration((value) => value + 1) }}>{t("skills.retry")}</Button></Alert> : null}
      {page?.skills.length === 0 ? <p className={styles.empty}>{t("skills.noMatch")}</p> : null}
      {page ? <div className={styles.grid} data-testid="personal-skills-grid">{latestRevisionPerSeries(page.skills).map((skill) => (
        <Card key={skill.source_ref} className={styles.card}>
          <CardContent className={styles.cardContent}>
            <Button type="button" variant="ghost" className={styles.skillName} onClick={() => openDetail(skill.source_ref)}>{skill.name}</Button>
            <p className={styles.summary}>{skill.summary}</p>
            <time className={styles.metadata} dateTime={skill.skill_updated_at}>{t("skills.updatedAt", { date: skill.skill_updated_at.slice(0, 10) })}</time>
            <div className={styles.tags} aria-label={t("skills.tagsLabel")}>{skill.category_keys.map((category) => <Badge key={category} variant="secondary">{category}</Badge>)}</div>

            <Button type="button" variant="outline" className={styles.installAction} disabled={actionLocked} onClick={() => startAction("install", skill.source_ref)}>{t("skills.personal.install")}</Button>
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
      </> : view === "drafts" ? <section data-testid="personal-skill-drafts" className="space-y-3">
        {draftError ? <Alert role="alert" variant="destructive"><AlertDescription>{t("skills.loadError")}</AlertDescription><Button onClick={() => { setDraftError(false); setDraftPage(null); setGeneration((value) => value + 1) }}>{t("skills.retry")}</Button></Alert> : !draftPage ? <p role="status">{t("skills.loading")}</p> : <>
          {draftPage.skills.length === 0 ? <p>{t("skills.noMatch")}</p> : draftPage.skills.map((draft) => <Card key={draft.skill_id}><CardContent className="space-y-2 p-4"><h2>{draft.name}</h2><p>{draft.summary}</p><Button onClick={() => { setResumeBase(draft); setPublishOpen(true) }}>{t("skills.publishResumeDraft")}</Button></CardContent></Card>)}
          <nav className="flex gap-2" aria-label={t("skills.publishDrafts")}><Button disabled={!history.length} onClick={() => { setCursor(history.at(-1) ?? null); setHistory((values) => values.slice(0, -1)); setDraftPage(null) }}>{t("plugins.previous")}</Button><Button disabled={!draftPage.next_cursor} onClick={() => { setHistory((values) => [...values, cursor]); setCursor(draftPage.next_cursor); setDraftPage(null) }}>{t("plugins.next")}</Button></nav>
        </>}
      </section> : <section className="space-y-3" data-testid="personal-installations">
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
            <p className="font-medium">{item.display_name}</p>
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
      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) { detailController.current?.abort(); detailRequest.current += 1; setPackageReaderOpen(false); setDetail(null) } }}>
        <DialogContent className={packageReaderOpen ? `${styles.detailDialog} ${readerStyles.readerDialog}` : styles.detailDialog} overlayClassName={styles.detailOverlay ?? ""} data-detail-layout="manus" data-testid="personal-skill-detail">
          {detail?.kind === "ready" && packageReaderOpen ? <PersonalSkillPackageReader key={detail.skill.skill_id} skillId={detail.skill.skill_id} title={detail.skill.name} onBack={() => setPackageReaderOpen(false)} /> : detail?.kind === "ready" ? <>
            <header className={styles.detailHero}>
              <div className={styles.detailCopy}>
                {detail.skill.category_keys.length > 0 ? <div className={styles.detailCategories}>{detail.skill.category_keys.slice(0, 2).map((category) => <Badge key={category} variant="secondary">{category}</Badge>)}</div> : null}
                <DialogTitle>{detail.skill.name}</DialogTitle>
                <DialogDescription className={styles.detailMeta}>
                  <span>{detail.skill.publisher_profile?.status === "found" ? detail.skill.publisher_profile.display_name : t("skills.own")}</span>
                  <span aria-hidden="true">|</span>
                  <time dateTime={detail.skill.skill_updated_at}>{t("skills.updatedAt", { date: detail.skill.skill_updated_at.slice(0, 10) })}</time>
                </DialogDescription>
                {admitted && detail.skill.product.source_kind === "personal" && ["active", "disabled"].includes(detail.skill.status) ? <div className={styles.detailActions}>
                  <Button type="button" disabled={withdrawTarget !== null} onClick={() => { setLifecycleSubject(boundary.subject); setResumeBase(detail.skill); setDetail(null); setPublishOpen(true) }}>{t("skills.lifecycle.update")}</Button>
                  <Button type="button" variant="outline" disabled={withdrawTarget !== null && withdrawTarget.skill_id !== detail.skill.skill_id} onClick={() => { setLifecycleSubject(boundary.subject); setWithdrawTarget(current => lifecycleSubject === boundary.subject ? current ?? detail.skill : detail.skill); setWithdrawOpen(true) }}>{t("skills.lifecycle.withdraw")}</Button>
                </div> : null}
                <Button type="button" variant="outline" className={styles.detailReaderAction} onClick={() => setPackageReaderOpen(true)}><FileText aria-hidden="true" />{t("skills.packageViewDetails")}</Button>
              </div>
            </header>
            <section className={styles.detailBody}>
              <p className={styles.detailSummary}>{detail.skill.summary}</p>
              {detail.skill.example_prompts.length > 0 ? <div className={styles.detailExamples}>{detail.skill.example_prompts.map((prompt) => <button key={prompt} type="button" onClick={() => startExample(prompt)}><MessageCircle aria-hidden="true" /><span>{prompt}</span></button>)}</div> : null}
              {detail.skill.tags.length > 0 ? <div className={styles.detailTags} aria-label={t("skills.tagsLabel")}>{detail.skill.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : null}
            </section>
          </> : detail?.kind === "error" ? <Alert className={styles.detailState} variant="destructive" role="alert"><AlertDescription>{t("skills.loadError")}</AlertDescription></Alert> : <p className={styles.detailState} role="status">{t("skills.loading")}</p>}
        </DialogContent>
      </Dialog>
      {withdrawTarget ? <PersonalSkillWithdrawDialog key={`${lifecycleSubject}:${withdrawTarget.skill_id}`} skill={withdrawTarget} client={publishClient} admitted={admitted && lifecycleSubject === boundary.subject} open={withdrawOpen && lifecycleSubject === boundary.subject} onOpenChange={setWithdrawOpen} onReadCurrent={() => { setWithdrawTarget(null); setWithdrawOpen(false); setDetail(null); setPageState({ kind: "loading" }); setGeneration(value => value + 1); setInstallationGeneration(value => value + 1) }} onConfirmed={() => { setWithdrawTarget(null); setWithdrawOpen(false); invalidate(SKILL_CATALOG_RESOURCE_KEY); setDetail(null); setPageState({ kind: "loading" }); setGeneration(value => value + 1); setInstallationGeneration(value => value + 1) }} /> : null}
      <SkillUploadDialog readBoundary={boundary} open={importOpen} onOpenChange={setImportOpen} onPublished={() => { invalidate(SKILL_CATALOG_RESOURCE_KEY); setView("published"); setCursor(null); setHistory([]); setPageState({ kind: "loading" }); setGeneration((value) => value + 1); setInstallationGeneration((value) => value + 1) }} />
      <PersonalSkillPublishDialog key={`${boundary.subject}:${resumeBase?.skill_id ?? "new"}`} {...(resumeBase ? { base: resumeBase } : {})} open={publishOpen} admitted={admitted && (!resumeBase || resumeBase.status === "draft" || lifecycleSubject === boundary.subject)} onOpenChange={setPublishOpen} client={publishClient} onPublished={() => { setView("published"); setCursor(null); setHistory([]); setPageState({ kind: "loading" }); setGeneration((value) => value + 1) }} />
    </section>
  )
}

/** The personal owner surface opens the same authenticated package inspector as
 * the catalog detail. The directory and every text byte are returned by the
 * admitted BFF endpoint; folder nodes are only presentation prefixes. */
function PersonalSkillPackageReader({ skillId, title, onBack }: { skillId: string; title: string; onBack: () => void }) {
  const t = useT()
  const [directory, setDirectory] = useState<CatalogPackageData | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<CatalogPackageData["selected_file"]>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const controller = new AbortController()
    void getManusSkillPackage(skillId, undefined, controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setDirectory(value)
      const initialPath = value.files.some((file) => file.path === "SKILL.md") ? "SKILL.md" : value.files[0]?.path ?? null
      setSelectedPath(initialPath)
      setSelectedFile(null)
      setLoading(initialPath !== null)
    }).catch(() => {
      if (!controller.signal.aborted) { setFailed(true); setLoading(false) }
    })
    return () => controller.abort()
  }, [skillId, attempt])

  useEffect(() => {
    if (directory === null || selectedPath === null) return
    const controller = new AbortController()
    void getManusSkillPackage(skillId, selectedPath, controller.signal, directory).then((value) => {
      if (controller.signal.aborted) return
      setSelectedFile(value.selected_file)
      setLoading(false)
    }).catch(() => {
      if (!controller.signal.aborted) { setFailed(true); setLoading(false) }
    })
    return () => controller.abort()
  }, [directory, selectedPath, skillId])

  const selectFile = (path: string) => {
    if (path === selectedPath) return
    setSelectedPath(path)
    setSelectedFile(null)
    setLoading(true)
    setFailed(false)
  }

  const retry = () => {
    setDirectory(null)
    setSelectedPath(null)
    setSelectedFile(null)
    setLoading(true)
    setFailed(false)
    setAttempt((value) => value + 1)
  }

  const renderFiles = (prefix: string): ReactNode => {
    const entries = new Map<string, { path: string; folder: boolean }>()
    for (const file of directory?.files ?? []) {
      if (!file.path.startsWith(prefix)) continue
      const remainder = file.path.slice(prefix.length)
      const name = remainder.split("/")[0]!
      entries.set(name, { path: `${prefix}${name}`, folder: remainder.includes("/") })
    }
    return [...entries].map(([name, entry]) => {
      if (!entry.folder) return <li key={entry.path}><button type="button" aria-label={entry.path} aria-pressed={entry.path === selectedPath} onClick={() => selectFile(entry.path)}><FileText aria-hidden="true" /><span>{name}</span></button></li>
      const expanded = !collapsedFolders.has(entry.path)
      return <li key={entry.path}>
        <button type="button" aria-label={name} aria-expanded={expanded} onClick={() => setCollapsedFolders((current) => { const next = new Set(current); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next })}>{expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<Folder aria-hidden="true" /><span>{name}</span></button>
        {expanded ? <ul>{renderFiles(`${entry.path}/`)}</ul> : null}
      </li>
    })
  }

  return <>
    <header className={readerStyles.readerHeader}>
      <Button type="button" variant="ghost" onClick={onBack}><ChevronRight className={readerStyles.backIcon} aria-hidden="true" />{t("skills.packageBack")}</Button>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription className="sr-only">{t("skills.packageReader")}</DialogDescription>
    </header>
    <section className={readerStyles.reader} aria-label={t("skills.packageReader")}>
      <nav className={readerStyles.fileList} aria-label={t("skills.detailFiles")}><ul>{renderFiles("")}</ul></nav>
      <div className={readerStyles.fileContent} aria-busy={loading}>
        {selectedPath !== null ? <div className={readerStyles.fileHeading}><FileText aria-hidden="true" /><span>{selectedPath}</span></div> : null}
        {loading ? <p role="status">{t("skills.packageLoading")}</p> : null}
        {failed ? <div role="alert"><p>{t("skills.packageUnavailable")}</p><Button type="button" variant="outline" onClick={retry}>{t("skills.packageRetry")}</Button></div> : null}
        {!loading && !failed && directory?.files.length === 0 ? <p>{t("skills.packageEmpty")}</p> : null}
        {!loading && !failed && directory !== null && directory.files.length > 0 && selectedPath === null ? <p>{t("skills.packageNoMarkdown")}</p> : null}
        {!loading && !failed && selectedFile !== null ? selectedFile.path.toLowerCase().endsWith(".md")
          ? <SkillPackageDocument text={selectedFile.text} />
          : <pre>{selectedFile.text}</pre> : null}
      </div>
    </section>
  </>
}
