"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Download, FileText, Search, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useLocale, useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"

import { useLibraryFiles } from "./kokoro-library-file-state"
import { deletePersonalLibraryFile, downloadPersonalLibraryFile, isLibraryFileSearchQuery, LibraryFileDeleteError, readPersonalLibraryFilePreview, type LibraryFile, type LibraryFileType } from "./kokoro-library-file-client"
import { KokoroLibraryFileUpload } from "./kokoro-library-file-upload"
import { LibraryTextPreview } from "./kokoro-library-text-preview"
import { isLibraryTextPreviewSupported } from "./kokoro-library-preview-content"
import type { LibraryUploadIntent } from "./kokoro-library-file-upload-state"
import styles from "./kokoro-library-surface.module.css"


type FileUrlState = { query: string; filter: LibraryFileType }
const FILE_URL_EVENT = "kokoro:library-file-url-state"
const DEFAULT_FILE_URL_STATE: FileUrlState = { query: "", filter: "all" }

function readFileUrlState(): FileUrlState {
  if (typeof window === "undefined") return DEFAULT_FILE_URL_STATE
  const params = new URLSearchParams(window.location.search)
  const rawFilter = params.get("file_type")
  const filter: LibraryFileType = rawFilter === "documents" || rawFilter === "images" || rawFilter === "media" || rawFilter === "other" ? rawFilter : "all"
  return { filter, query: params.get("file_q") ?? "" }
}

function subscribeFileUrlState(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  for (const event of ["popstate", FILE_URL_EVENT] as const) window.addEventListener(event, onStoreChange)
  return () => {
    for (const event of ["popstate", FILE_URL_EVENT] as const) window.removeEventListener(event, onStoreChange)
  }
}

function writeFileUrlState(patch: Partial<FileUrlState>): void {
  if (typeof window === "undefined") return
  const state = { ...readFileUrlState(), ...patch }
  const url = new URL(window.location.href)
  if (state.query.trim() === "" && isLibraryFileSearchQuery(state.query)) url.searchParams.delete("file_q")
  else url.searchParams.set("file_q", state.query)
  if (state.filter === "all") url.searchParams.delete("file_type")
  else url.searchParams.set("file_type", state.filter)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(FILE_URL_EVENT))
}

function useFileUrlState(): FileUrlState {
  const snapshot = useSyncExternalStore(subscribeFileUrlState, () => JSON.stringify(readFileUrlState()), () => JSON.stringify(DEFAULT_FILE_URL_STATE))
  return useMemo(() => JSON.parse(snapshot) as FileUrlState, [snapshot])
}

type UploadProps = {
  intent: LibraryUploadIntent | null
  select: (file: File) => void
  submit: () => void
  refreshRevision: number
}

function FileEmpty() {
  const t = useT()
  return <section className={styles.stateRegion} data-testid="library-files-empty"><Empty className={styles.empty}><EmptyHeader><EmptyMedia variant="default" className={styles.emptyMedia}><FileText aria-hidden="true" /></EmptyMedia><EmptyTitle className={styles.emptyTitle}>{t("library.filesEmpty")}</EmptyTitle><EmptyDescription className={styles.emptyDescription}>{t("library.filesEmptyDescription")}</EmptyDescription></EmptyHeader></Empty></section>
}

type DownloadPhase = "idle" | "loading" | "not_found" | "auth_required" | "failed"
type FileDeletion = { file: LibraryFile; phase: "confirm" } |
  { file: LibraryFile; key: string; phase: "pending" | "unknown" | "rejected" | "auth_required" }

function FileCard({ file, locale, boundary, deleteDisabled, onDelete }: {
  file: LibraryFile; locale: string; boundary: ProjectReadBoundary | undefined
  deleteDisabled: boolean; onDelete: (file: LibraryFile, trigger: HTMLButtonElement) => void
}) {
  const t = useT()
  const filenameId = useId()
  const [previewOpen, setPreviewOpen] = useState(false)
  const { assetId, mimeType, sizeBytes, contentSha256 } = file
  const readPreview = useCallback((signal: AbortSignal) => readPersonalLibraryFilePreview({
    assetId, mimeType, sizeBytes, contentSha256,
  }, signal), [assetId, mimeType, sizeBytes, contentSha256])
  const [downloadPhase, setDownloadPhase] = useState<DownloadPhase>("idle")
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => { controllerRef.current?.abort() }, [])

  const cancel = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setDownloadPhase("idle")
  }
  const download = () => {
    if (controllerRef.current !== null) return
    const controller = new AbortController()
    controllerRef.current = controller
    setDownloadPhase("loading")
    void downloadPersonalLibraryFile(file, controller.signal).then(() => {
      if (!controller.signal.aborted) setDownloadPhase("idle")
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      const code = error instanceof Error ? error.message : ""
      setDownloadPhase(code === "library_file_not_found" ? "not_found" : code === "library_file_auth_required" ? "auth_required" : "failed")
    }).finally(() => {
      if (controllerRef.current === controller) controllerRef.current = null
    })
  }

  const hasError = downloadPhase === "not_found" || downloadPhase === "auth_required" || downloadPhase === "failed"
  return <Card role="listitem" className={styles.artifactCard} data-asset-id={file.assetId}>
    <CardContent className={`${styles.artifactMain} ${styles.fileCardMain}`}>
      <span className={styles.typeIcon}><FileText aria-hidden="true" /></span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle} id={filenameId}>{file.filename}</span>
        <span className={styles.meta}>{file.mimeType} · {new Intl.NumberFormat(locale).format(BigInt(file.sizeBytes))} B · {formatDeliveryTime(file.createdAt, locale)}</span>
      </span>
      <span className={styles.fileDownloadControls}>
        {boundary?.admitted && boundary.subject && isLibraryTextPreviewSupported(mimeType, sizeBytes) ? (
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-describedby={filenameId}>
                {t("canvas.previewTab")}
              </Button>
            </DialogTrigger>
            <DialogContent className={styles.artifactDetail} closeLabel={t("canvas.close")}>
              <DialogHeader>
                <DialogTitle>{t("canvas.previewTab")}</DialogTitle>
                <DialogDescription className="break-words">{file.filename}</DialogDescription>
              </DialogHeader>
              {previewOpen ? <LibraryTextPreview boundary={boundary} read={readPreview} /> : null}
            </DialogContent>
          </Dialog>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="library-file-download"
          aria-label={t(hasError ? "library.retryDownloadAria" : "library.downloadAria", { title: file.filename })}
          disabled={downloadPhase === "loading"}
          onClick={download}
        >
          <Download aria-hidden="true" />
          {downloadPhase === "loading" ? t("library.downloading") : hasError ? t("library.fileRetryDownload") : t("library.fileDownload")}
        </Button>
        {downloadPhase === "loading" ? <Button type="button" variant="ghost" size="sm" onClick={cancel}>{t("library.cancelDownload")}</Button> : null}
        <Button type="button" variant="ghost" size="icon-sm" disabled={deleteDisabled}
          aria-label={t("library.fileDeleteAria", { title: file.filename })} onClick={(event) => onDelete(file, event.currentTarget)}>
          <Trash2 aria-hidden="true" />
        </Button>
      </span>
    </CardContent>
    {hasError ? <div role="alert" className={styles.fileDownloadError}>
      {downloadPhase === "not_found" ? t("library.fileNotFound") : downloadPhase === "auth_required" ? t("library.fileAuthRequired") : t("library.fileDownloadFailed")}
    </div> : null}
  </Card>
}

function LiveFiles({ upload, boundary }: { upload: UploadProps; boundary: ProjectReadBoundary | undefined }) {
  const t = useT()
  const { locale } = useLocale()
  const { query, filter } = useFileUrlState()
  const { items, nextCursor, phase, validQuery, reload, loadMore, acknowledgeDeletion } = useLibraryFiles(upload.refreshRevision, query, filter)
  const [rejectedQuery, setRejectedQuery] = useState(false)
  const [deletion, setDeletion] = useState<FileDeletion | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteFlight = useRef<AbortController | null>(null)
  const deleteTrigger = useRef<HTMLButtonElement | null>(null)
  const search = useRef<HTMLInputElement | null>(null)
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
      deleteFlight.current?.abort()
      deleteFlight.current = null
    }
  }, [])
  const openDeletion = (file: LibraryFile, trigger: HTMLButtonElement) => {
    if (!active.current || deleteFlight.current !== null || deletion?.phase === "auth_required") return
    if (deletion?.phase === "unknown" && deletion.file.assetId !== file.assetId) return
    deleteTrigger.current = trigger
    if (deletion?.phase !== "unknown") setDeletion({ file, phase: "confirm" })
    setDeleteOpen(true)
  }
  const closeDeletion = () => {
    if (deleteFlight.current !== null) return
    setDeleteOpen(false)
    if (deletion?.phase !== "unknown" && deletion?.phase !== "auth_required") setDeletion(null)
  }
  const submitDeletion = async () => {
    if (!active.current || !deleteOpen || deleteFlight.current !== null ||
      (deletion?.phase !== "confirm" && deletion?.phase !== "unknown")) return
    const command = { file: deletion.file, key: deletion.phase === "confirm" ? `library-file-delete:${crypto.randomUUID()}` : deletion.key }
    const controller = new AbortController()
    deleteFlight.current = controller
    setDeletion({ ...command, phase: "pending" })
    try {
      await deletePersonalLibraryFile(command.file.assetId, command.key, controller.signal)
      if (deleteFlight.current !== controller || controller.signal.aborted) return
      acknowledgeDeletion(command.file.assetId)
      setDeleteOpen(false)
      setDeletion(null)
    } catch (error) {
      if (deleteFlight.current !== controller || controller.signal.aborted) return
      setDeletion({ ...command, phase: error instanceof LibraryFileDeleteError ? error.kind : "unknown" })
    } finally {
      if (deleteFlight.current === controller) deleteFlight.current = null
    }
  }
  const retryOutsideResults = deletion?.phase === "unknown" && !deleteOpen && !items.some((file) => file.assetId === deletion.file.assetId)
  const queryFeedback = rejectedQuery || !validQuery

  return <>
    <div className={styles.toolbar} data-testid="library-file-filters">
      <label className={styles.search}>
        <Search aria-hidden="true" />
        <Input ref={search} value={query} aria-label={t("library.search")} placeholder={t("library.search")}
          aria-invalid={!validQuery || undefined} aria-describedby={queryFeedback ? "library-file-search-validation" : undefined}
          onChange={(event) => {
            const next = event.target.value
            if (!isLibraryFileSearchQuery(next)) { setRejectedQuery(true); return }
            setRejectedQuery(false)
            writeFileUrlState({ query: next })
          }} onKeyDown={(event) => {
          if (event.key === "Escape" && (query !== "" || rejectedQuery)) {
            event.preventDefault()
            setRejectedQuery(false)
            writeFileUrlState({ query: "" })
          }
        }} />
      </label>
      <select className={styles.fileFilter} aria-label={t("library.fileFilterAria")} value={filter} onChange={(event) => writeFileUrlState({ filter: event.target.value as LibraryFileType })}>
        <option value="all">{t("library.filterAll")}</option>
        <option value="documents">{t("library.filterDocuments")}</option>
        <option value="images">{t("library.filterImages")}</option>
        <option value="media">{t("library.filterMedia")}</option>
        <option value="other">{t("library.filterOther")}</option>
      </select>
    </div>
    {queryFeedback ? <p id="library-file-search-validation" role="alert" className="text-sm text-destructive">{t("library.fileSearchInvalid")}</p> : null}
    {retryOutsideResults ? <div className={styles.toolbar}>
      <span className="min-w-0 break-words text-sm text-muted-foreground">{deletion.file.filename}</span>
      <Button type="button" variant="outline" size="sm" onClick={(event) => openDeletion(deletion.file, event.currentTarget)}>{t("library.fileDeleteRetry")}</Button>
    </div> : null}
    <KokoroLibraryFileUpload intent={upload.intent} onSelect={upload.select} onSubmit={upload.submit} />
    {validQuery && phase === "loading" ? <div className={styles.stateRegion} role="status">{t("library.filesLoading")}</div> : null}
    {phase === "error" ? <div className={styles.stateRegion}><Alert variant="destructive" className={styles.errorState}><AlertDescription><span>{t("library.filesLoadError")}</span><Button type="button" variant="outline" size="sm" onClick={reload}>{t("library.filesRetry")}</Button></AlertDescription></Alert></div> : null}
    {phase === "ready" && items.length === 0 ? <FileEmpty /> : null}
    {phase !== "loading" && phase !== "error" && items.length > 0 ? <div className={styles.list} data-testid="library-files" role="list" aria-label={t("library.filesTab")}>{items.map((file) => <FileCard key={file.assetId} file={file} locale={locale} boundary={boundary}
      deleteDisabled={deletion?.phase === "auth_required" || (deletion?.phase === "unknown" && deletion.file.assetId !== file.assetId)} onDelete={openDeletion} />)}</div> : null}
    {phase !== "loading" && phase !== "error" && nextCursor !== null ? <div className={styles.pagination}>{phase === "moreError" ? <Alert variant="destructive" className={styles.loadMoreError}><AlertDescription><span>{t("library.filesLoadMoreError")}</span><Button type="button" variant="outline" size="sm" onClick={loadMore}>{t("library.filesRetryMore")}</Button></AlertDescription></Alert> : <Button type="button" variant="outline" size="sm" disabled={phase === "loadingMore"} onClick={loadMore}>{phase === "loadingMore" ? t("library.filesLoading") : t("library.filesLoadMore")}</Button>}</div> : null}
    <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!open) closeDeletion() }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (deleteFlight.current !== null) event.preventDefault() }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (!active.current) return
          const trigger = deleteTrigger.current
          if (trigger?.isConnected && !trigger.disabled) trigger.focus()
          else search.current?.focus()
        }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("library.fileDeleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">{t("library.fileDeleteDescription", { title: deletion?.file.filename ?? "" })}</AlertDialogDescription>
        </AlertDialogHeader>
        {deletion?.phase === "pending" ? <p role="status">{t("library.fileDeleting")}</p> : null}
        {deletion && ["unknown", "rejected", "auth_required"].includes(deletion.phase) ? <p role="alert">
          {t(deletion.phase === "unknown" ? "library.fileDeleteUnknown" : deletion.phase === "auth_required" ? "library.fileAuthRequired" : "library.fileDeleteRejected")}
        </p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletion?.phase === "pending"}>
            {t(deletion?.phase === "confirm" ? "firstSite.cancel" : "library.fileDeleteClose")}
          </AlertDialogCancel>
          <Button variant="destructive" type="button" disabled={deletion?.phase !== "confirm" && deletion?.phase !== "unknown"}
            onClick={() => void submitDeletion()}>
            {t(deletion?.phase === "unknown" ? "library.fileDeleteRetry" : "library.fileDeleteTitle")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}

/** Explicit preview stays local; live file pages never silently become an empty fixture. */
export function KokoroLibraryFiles({ preview, upload, boundary }: { preview: boolean; upload: UploadProps; boundary?: ProjectReadBoundary | undefined }) {
  const t = useT()
  if (preview) return <FileEmpty />
  if (boundary !== undefined && (!boundary.admitted || boundary.subject === null))
    return <div className={styles.stateRegion} role="status">{t("library.filesLoading")}</div>
  return <LiveFiles key={JSON.stringify([boundary?.tenant, boundary?.subject, boundary?.generation, boundary?.authInvalidationHint])} upload={upload} boundary={boundary} />
}
