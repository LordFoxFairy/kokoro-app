"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { selectedResourceRefsSchema, type SelectedResourceRef } from "@/contract/chat"
import { listLibraryFiles } from "@/features/app/kokoro-library-file-client"
import { listLibraryArtifacts } from "@/features/app/kokoro-library-artifact-client"
import { LibraryFileUploadError, uploadLibraryFile } from "@/features/app/kokoro-library-file-upload-client"
import { listProjectResources } from "@/features/app/project-resource-list"
import { ProjectResourceUploadError, uploadProjectResource } from "@/features/app/project-resource-upload"
import { useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import styles from "./composer-resource-picker.module.css"

export type ComposerResourceSource = "upload" | "library" | "recent"
export type ComposerResources = Readonly<{
  boundary: ProjectReadBoundary
  scopeKey: object | string
  projectRef?: string
  selectable: boolean
  selected: readonly SelectedResourceRef[]
  onChange: (refs: readonly SelectedResourceRef[]) => void
  recentTasks: readonly { id: string; title: string }[]
}>
type Candidate = { ref: SelectedResourceRef; label: string; conversationId?: string }
type Catalog = { view: object; items: Candidate[]; cursor: string | null; status: "loading" | "ready" | "error" }
type Upload = { scope: object; file: File; key: string; status: "selected" | "uploading" | "unknown" | "rejected"; error?: string }
const route = () => `${window.location.pathname}${window.location.search}${window.location.hash}`
const key = (ref: SelectedResourceRef) => `${ref.kind}:${ref.resource_id}`
function markerMatches(subject: string | null): boolean {
  try { return subject !== null && window.localStorage.getItem("kokoro.web.auth-index-subject") === subject } catch { return false }
}

/** All bytes remain in the existing upload boundary; selection carries only opaque intent. */
export function ComposerResourcePicker({ controller, source, onClose, returnTarget }: {
  controller: ComposerResources; source: ComposerResourceSource | null; onClose: () => void; returnTarget?: RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  const { boundary, projectRef, scopeKey, selectable } = controller
  const scope = useMemo(() => ({ scopeKey, projectRef, subject: boundary.subject, tenant: boundary.tenant, generation: boundary.generation, hint: boundary.authInvalidationHint, admitted: boundary.admitted }),
    [scopeKey, projectRef, boundary.subject, boundary.tenant, boundary.generation, boundary.authInvalidationHint, boundary.admitted])
  const [navigation, setNavigation] = useState<{ scope: object; tab: "files" | "artifacts"; task: string | null; query: string }>({ scope, tab: "files", task: null, query: "" })
  const currentNavigation = navigation.scope === scope ? navigation : { scope, tab: "files" as const, task: null, query: "" }
  const { tab, task, query } = currentNavigation
  const setTab = (tab: "files" | "artifacts") => setNavigation({ ...currentNavigation, tab, query: "" })
  const setTask = (task: string | null) => setNavigation({ ...currentNavigation, task, query: "" })
  const setQuery = (query: string) => setNavigation(previous => ({ ...(previous.scope === scope ? previous : currentNavigation), query }))
  const view = useMemo(() => ({ scope, source, tab, task }), [scope, source, tab, task])
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [labels, setLabels] = useState<{ scope: object; values: Record<string, string> }>({ scope, values: {} })
  const [upload, setUpload] = useState<Upload | null>(null)
  const [limitError, setLimitError] = useState(false)
  const [retired, setRetired] = useState<object | null>(null)
  const latest = useRef(controller)
  const active = useRef<{ scope: object; view: object; route: string; live: boolean } | null>(null)
  const request = useRef<AbortController | null>(null)
  const uploadFlight = useRef<AbortController | null>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => { latest.current = controller; close.current = onClose })
  useLayoutEffect(() => {
    const owner = { scope, view, route: route(), live: true }
    active.current = owner
    const retire = () => {
      if (owner.route === route() && markerMatches(scope.subject)) return
      owner.live = false
      request.current?.abort(); uploadFlight.current?.abort()
      setRetired(scope)
      close.current()
    }
    const hide = () => { owner.live = false; request.current?.abort(); uploadFlight.current?.abort(); setRetired(scope); close.current() }
    window.addEventListener("storage", retire)
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    window.addEventListener("pagehide", hide)
    return () => {
      owner.live = false
      request.current?.abort(); uploadFlight.current?.abort()
      window.removeEventListener("storage", retire); window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire); window.removeEventListener("pagehide", hide)
    }
  }, [scope, view])
  const available = boundary.admitted && boundary.subject !== null && retired !== scope
  const current = useCallback(() => active.current?.scope === scope && active.current.view === view && active.current.live && active.current.route === route() && markerMatches(scope.subject)
    && latest.current.selectable && latest.current.boundary.admitted, [scope, view])
  const select = (item: Candidate) => {
    if (!current()) return false
    const refs = latest.current.selected
    if (refs.some(ref => key(ref) === key(item.ref))) return true
    const parsed = selectedResourceRefsSchema.safeParse([...refs, item.ref])
    if (!parsed.success) { setLimitError(true); return false }
    latest.current.onChange(parsed.data)
    setLabels(previous => ({ scope, values: { ...(previous.scope === scope ? previous.values : {}), [key(item.ref)]: item.label } }))
    setLimitError(false)
    return true
  }
  const read = useCallback(async (cursor: string | null, append = false) => {
    if (!current() || source === null || source === "upload" || source === "recent" && task === null) return
    request.current?.abort()
    const abort = new AbortController(); request.current = abort
    setCatalog(previous => ({ view, items: append && previous?.view === view ? previous.items : [], cursor, status: "loading" }))
    try {
      let items: Candidate[], nextCursor: string | null
      if (source === "library" && tab === "files") {
        const page = projectRef ? await listProjectResources(projectRef, cursor, abort.signal) : await listLibraryFiles(cursor, abort.signal)
        items = page.items.map(item => ({ ref: { kind: "asset", resource_id: item.assetId }, label: item.filename }))
        nextCursor = page.nextCursor
      } else {
        const page = await listLibraryArtifacts(cursor, abort.signal, { query: "", type: "all" })
        const projectTasks = new Set(latest.current.recentTasks.map(item => item.id))
        items = page.items.filter(item => !projectRef || projectTasks.has(item.conversationId)).map(item => ({
          ref: { kind: "artifact", resource_id: item.artifactId }, label: item.filename, conversationId: item.conversationId,
        }))
        nextCursor = page.nextCursor
      }
      if (abort.signal.aborted || request.current !== abort || !current()) return
      setCatalog(previous => {
        const combined = [...(append && previous?.view === view ? previous.items : []), ...items]
        return { view, items: combined.filter((item, index) => combined.findIndex(other => key(other.ref) === key(item.ref)) === index), cursor: nextCursor, status: "ready" }
      })
    } catch {
      if (!abort.signal.aborted && request.current === abort && current()) setCatalog(previous => ({ view, items: previous?.view === view ? previous.items : [], cursor, status: "error" }))
    }
  }, [current, projectRef, source, tab, task, view])
  useEffect(() => {
    let live = true
    queueMicrotask(() => { if (live) void read(null) })
    return () => { live = false; request.current?.abort() }
  }, [read])
  useEffect(() => {
    if (source !== null && selectable) return
    request.current?.abort(); uploadFlight.current?.abort()
  }, [source, selectable])
  const sendUpload = async () => {
    if (!current() || !upload || upload.scope !== scope || uploadFlight.current !== null || upload.status === "rejected") return
    const intent = upload
    const abort = new AbortController(); uploadFlight.current = abort
    setUpload({ ...intent, status: "uploading" })
    try {
      const assetId = projectRef
        ? (await uploadProjectResource(projectRef, intent.file, intent.key, abort.signal)).assetId
        : await uploadLibraryFile(intent.file, intent.key, abort.signal)
      if (!abort.signal.aborted && uploadFlight.current === abort && current()) {
        if (select({ ref: { kind: "asset", resource_id: assetId }, label: intent.file.name })) {
          setUpload(null)
          close.current()
        }
      }
    } catch (error: unknown) {
      if (!abort.signal.aborted && uploadFlight.current === abort && current()) {
        const known = error instanceof LibraryFileUploadError || error instanceof ProjectResourceUploadError ? error : null
        setUpload({ ...intent, status: known?.retryable !== false ? "unknown" : "rejected", ...(known ? { error: known.code } : {}) })
      }
    } finally {
      if (uploadFlight.current === abort) uploadFlight.current = null
      if (abort.signal.aborted) setUpload(previous => previous?.scope === scope && previous.key === intent.key && previous.status === "uploading" ? { ...previous, status: "unknown" } : previous)
    }
  }
  const page = catalog?.view === view ? catalog : null
  const choices = (page?.items ?? []).filter(item => (source !== "recent" || item.conversationId === task) && item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const selectedKeys = new Set(controller.selected.map(key))
  const uploadIntent = upload?.scope === scope ? upload : null
  const selectedLabels = labels.scope === scope ? labels.values : {}
  const open = source !== null && available && selectable
  return <>
    {available && controller.selected.length > 0 ? <ul className={styles.selected} aria-label={t("composer.resourcesSelected")}>{controller.selected.map(ref => <li key={key(ref)}>
      <FileText aria-hidden="true" /><span>{selectedLabels[key(ref)] ?? t("composer.resourceAttachment")}</span>
      <Button type="button" variant="ghost" size="icon-sm" disabled={!selectable} aria-label={t("composer.resourceRemove", { name: selectedLabels[key(ref)] ?? t("composer.resourceAttachment") })} onClick={() => { if (current()) { latest.current.onChange(latest.current.selected.filter(item => key(item) !== key(ref))); setLimitError(false) } }}><X aria-hidden="true" /></Button>
    </li>)}</ul> : null}
    <Dialog open={open} onOpenChange={next => { if (!next) { request.current?.abort(); uploadFlight.current?.abort(); onClose() } }}>
      <DialogContent className={styles.dialog} closeLabel={t("canvas.close")} onCloseAutoFocus={event => {
        event.preventDefault()
        if (active.current?.scope === scope && active.current.live && active.current.route === route() && markerMatches(scope.subject) && latest.current.selectable) returnTarget?.current?.focus({ preventScroll: true })
      }}>
        <DialogHeader><DialogTitle>{t(source === "upload" ? "firstSite.addLocalFile" : source === "recent" ? "composer.resourcesRecent" : "composer.resourcesLibrary")}</DialogTitle>
          <DialogDescription>{t("composer.resourceHint")}</DialogDescription></DialogHeader>
        {source === "upload" ? <>
          <Input type="file" aria-label={t("composer.resourceChoose")} disabled={uploadIntent?.status === "uploading"} onChange={event => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""
            if (file && current()) setUpload({ scope, file, key: `composer-file:${crypto.randomUUID()}`, status: "selected" })
          }} />
          {uploadIntent ? <p className={styles.hint}>{uploadIntent.file.name}</p> : null}
          {uploadIntent?.status === "unknown" ? <p role="alert">{t("library.uploadUnknown")}</p> : null}
          {uploadIntent?.status === "rejected" ? <p role="alert">{t(uploadIntent.error === "request_body_too_large" ? "library.uploadTooLarge" : "library.uploadFailed")}</p> : null}
          <p className={styles.hint}>{t("library.uploadHint")}</p>
          <Button type="button" disabled={!uploadIntent || uploadIntent.status === "uploading" || uploadIntent.status === "rejected" || controller.selected.length >= 16} onClick={() => void sendUpload()}>{t(uploadIntent?.status === "uploading" ? "composer.resourceUploading" : uploadIntent?.status === "unknown" ? "composer.resourceRetryUpload" : "composer.resourceUpload")}</Button>
        </> : <>
          {source === "library" ? <div className={styles.tabs} role="group" aria-label={t("composer.resourcesLibrary")}>
            <Button type="button" variant="ghost" aria-pressed={tab === "files"} onClick={() => { setTab("files") }}>{t("library.filesTab")}</Button>
            <Button type="button" variant="ghost" aria-pressed={tab === "artifacts"} onClick={() => { setTab("artifacts") }}>{t("library.artifactsTab")}</Button>
          </div> : null}
          <Input aria-label={t("firstSite.searchResources")} placeholder={t("firstSite.searchResources")} value={query} onChange={event => setQuery(event.currentTarget.value)} />
          {source === "recent" && task === null ? <div className={styles.list}>
            {controller.recentTasks.filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item => <Button type="button" variant="ghost" key={item.id} onClick={() => { setTask(item.id) }}>{item.title}</Button>)}
            {controller.recentTasks.length === 0 ? <p className={styles.hint}>{t("composer.resourcesNoTasks")}</p> : null}
          </div> : <>
            {source === "recent" ? <Button type="button" variant="ghost" onClick={() => { setTask(null) }}>{t("composer.resourcesBack")}</Button> : null}
            <div className={styles.list} aria-busy={page?.status === "loading"}>
              {page?.status === "loading" ? <p role="status">{t("composer.resourcesLoading")}</p> : null}
              {choices.map(item => <Button type="button" variant="ghost" key={key(item.ref)} disabled={selectedKeys.has(key(item.ref)) || controller.selected.length >= 16} onClick={() => select(item)}><FileText aria-hidden="true" /><span>{item.label}</span>{selectedKeys.has(key(item.ref)) ? <span>{t("composer.resourceAdded")}</span> : null}</Button>)}
              {page?.status === "ready" && choices.length === 0 ? <p className={styles.hint}>{t("composer.resourcesEmptyPage")}</p> : null}
            </div>
            {page?.status === "error" ? <div role="alert"><p>{t("composer.resourcesError")}</p><Button type="button" variant="ghost" onClick={() => void read(page.cursor, page.items.length > 0)}>{t("skills.retry")}</Button></div> : null}
            {page?.cursor && page.status !== "error" ? <Button type="button" variant="ghost" disabled={page.status === "loading"} onClick={() => void read(page.cursor, true)}>{t("composer.resourcesMore")}</Button> : null}
          </>}
          {source === "recent" ? <p className={styles.hint}>{t("composer.resourcesAnswersUnavailable")}</p> : null}
        </>}
        {limitError || controller.selected.length >= 16 ? <p role="status">{t("composer.resourcesLimit")}</p> : null}
        <Button type="button" variant="ghost" onClick={() => { request.current?.abort(); uploadFlight.current?.abort(); onClose() }}>{t("canvas.close")}</Button>
      </DialogContent>
    </Dialog>
  </>
}
