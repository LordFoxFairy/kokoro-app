"use client"


import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LibraryArtifactDetail } from "./kokoro-library-artifact-detail"
import { LibraryHeader } from "./kokoro-library-header"
import { downloadFetchedFile } from "@/engine/file-fetch"
import { DIRECT_SESSION_SCOPE, type SessionScope } from "@/engine/session-scope"
import { useMemo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useT } from "@/i18n/context"

import { LibraryArtifactDeleteDialog, LibraryResults, LibraryToolbar } from "./kokoro-library-sections"
import {
  beginLibraryArtifactDownload, deleteLibraryArtifact, getLibraryArtifact, listLibraryArtifacts, matchesLibraryArtifact,
  setLibraryArtifactFavorite, type ArtifactDeletionOutcome, type LibraryArtifact, type LibraryArtifactClient, type LibraryArtifactDetailView,
} from "./kokoro-library-artifact-client"
import { KokoroLibraryFiles } from "./kokoro-library-files"
import { useLibraryFileUpload } from "./kokoro-library-file-upload-state"
import { DEFAULT_URL_STATE, FILTERS, artifactFilter, type LibraryFilter, type LibraryUrlState } from "./kokoro-library-model"
import {appendUniqueArtifacts, useLibraryArtifacts} from "./use-library-artifacts"
import styles from "./kokoro-library-surface.module.css"


type ArtifactDownloader = (artifact: LibraryArtifact, signal: AbortSignal) => Promise<void>
type ArtifactDeletion = { artifact: LibraryArtifact; phase: "confirm" } |
  { artifact: LibraryArtifact; key: string; phase: "pending" | Exclude<ArtifactDeletionOutcome, "confirmed"> }

export type KokoroLibrarySurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "onOpenSession" | "projectReadBoundary"> & {
  fixtureArtifacts?: readonly LibraryArtifact[]
  artifactClient?: LibraryArtifactClient
  downloadArtifact?: ArtifactDownloader
}

function artifactKey(artifact: LibraryArtifact): string {
  return JSON.stringify([artifact.conversationId, artifact.artifactId])
}

function artifactSessionScope(detail: LibraryArtifactDetailView): SessionScope | null {
  if (detail.projectRef === undefined) return null
  return detail.projectRef === null ? DIRECT_SESSION_SCOPE : { kind: "project", projectRef: detail.projectRef }
}

function readUrlState(): LibraryUrlState {
  if (typeof window === "undefined") return DEFAULT_URL_STATE
  const params = new URLSearchParams(window.location.search)
  const rawFilter = params.get("type")
  const filter = FILTERS.some((candidate) => candidate.value === rawFilter) ? rawFilter as LibraryFilter : "all"
  return {
    filter,
    query: params.get("q") ?? "",
    view: params.get("view") === "list" ? "list" : "grid",
    favoritesOnly: params.get("favorites") === "1",
  }
}

const DEFAULT_URL_SNAPSHOT = JSON.stringify(DEFAULT_URL_STATE)
const LIBRARY_URL_STATE_EVENT = "kokoro:library-url-state"

function subscribeUrlState(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const events = ["popstate", "kokoro:surface-navigation", LIBRARY_URL_STATE_EVENT] as const
  for (const event of events) window.addEventListener(event, onStoreChange)
  return () => {
    for (const event of events) window.removeEventListener(event, onStoreChange)
  }
}

function readUrlSnapshot(): string {
  return typeof window === "undefined" ? DEFAULT_URL_SNAPSHOT : JSON.stringify(readUrlState())
}

function readLibraryTab(): string {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "files"
    ? "files"
    : "artifacts"
}

function writeLibraryTab(tab: string): void {
  const url = new URL(window.location.href)
  if (tab === "files") url.searchParams.set("tab", "files")
  else url.searchParams.delete("tab")
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(LIBRARY_URL_STATE_EVENT))
}

function useLibraryUrlState(): LibraryUrlState {
  const snapshot = useSyncExternalStore(subscribeUrlState, readUrlSnapshot, () => DEFAULT_URL_SNAPSHOT)
  return useMemo(() => JSON.parse(snapshot) as LibraryUrlState, [snapshot])
}

function writeUrlState(state: LibraryUrlState): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (state.filter === "all") url.searchParams.delete("type")
  else url.searchParams.set("type", state.filter)
  if (state.query.trim() === "") url.searchParams.delete("q")
  else url.searchParams.set("q", state.query)
  if (state.view === "grid") url.searchParams.delete("view")
  else url.searchParams.set("view", "list")
  if (state.favoritesOnly) url.searchParams.set("favorites", "1")
  else url.searchParams.delete("favorites")
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(LIBRARY_URL_STATE_EVENT))
}

async function defaultDownloadArtifact(artifact: LibraryArtifact, signal: AbortSignal): Promise<void> {
  await beginLibraryArtifactDownload(artifact, signal)
}

async function previewDownloadArtifact(artifact: LibraryArtifact): Promise<void> {
  const body = [
    `Kokoro preview artifact: ${artifact.title}`,
    `artifact_id: ${artifact.artifactId}`,
    "This file is a local fixture for desktop interaction QA.",
  ].join("\n")
  await downloadFetchedFile(new Response(new Blob([body], { type: artifact.mimeType })), artifact.filename)
}

function KokoroArtifactLibrary({
  preview = false,
  projectReadBoundary,
  onPrompt,
  onOpenSession,
  fixtureArtifacts,
  artifactClient,
  downloadArtifact,
  sourceFocusRef,
}: KokoroLibrarySurfaceProps & {
  sourceFocusRef: React.RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  // Only an explicit preview selects synthetic transport. Development with a
  // native session admission remains live and must show an unavailable BFF as an error.
  const useFixtureTransport = preview && !artifactClient && !fixtureArtifacts
  const { filter, query, view, favoritesOnly } = useLibraryUrlState()
  const updateUrlState = useCallback((patch: Partial<LibraryUrlState>) => {
    writeUrlState({ ...readUrlState(), ...patch })
  }, [])
  const fixtureSnapshot = useMemo(
    () => fixtureArtifacts === undefined ? undefined : appendUniqueArtifacts([], fixtureArtifacts),
    [fixtureArtifacts],
  )
  const admitted = preview || projectReadBoundary === undefined || (projectReadBoundary.admitted && projectReadBoundary.subject !== null)
  const actor = useMemo(() => ({ subject: projectReadBoundary?.subject, tenant: projectReadBoundary?.tenant, invalidation: projectReadBoundary?.authInvalidationHint }),
    [projectReadBoundary?.subject, projectReadBoundary?.tenant, projectReadBoundary?.authInvalidationHint])
  const owner = useMemo(() => ({ ...actor, admitted, generation: projectReadBoundary?.generation ?? 0 }),
    [actor, admitted, projectReadBoundary?.generation])
  const ownerRef = useRef<typeof owner | null>(owner)
  const [detailIntent, setSelectedDetail] = useState<{ artifact: LibraryArtifact; href: string; actor: typeof actor } | null>(null)
  const selectedDetail = detailIntent?.actor === actor ? detailIntent : null
  const sourceReadRef = useRef<{ key: string; controller: AbortController } | null>(null)
  const [sourceResult, setSourceResult] = useState<{ owner: typeof owner; key: string; status: "loading" | "unavailable" | "error" } | null>(null)
  const retireSourceRead = useCallback(() => {
    sourceReadRef.current?.controller.abort()
    sourceReadRef.current = null
  }, [])
  const detailReturnFocusRef = useRef<HTMLElement | null>(null)
  const favoriteFlight = useRef<AbortController | null>(null)
  const [favoriteResult, setFavoriteResult] = useState<{ owner: typeof owner; key: string; status: "pending" | "error" } | null>(null)
  const deleteFlight = useRef<AbortController | null>(null)
  const [deleteRecord, setDeleteRecord] = useState<{ owner: typeof owner; intent: ArtifactDeletion } | null>(null)
  const deletion = deleteRecord?.owner === owner ? deleteRecord.intent : null
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteTrigger = useRef<HTMLButtonElement | null>(null)
  const retireWrites = useCallback(() => {
    favoriteFlight.current?.abort()
    favoriteFlight.current = null
    deleteFlight.current?.abort()
    deleteFlight.current = null
  }, [])
  const [downloadRecord, setDownloadRecord] = useState<{ owner: typeof owner; data: Record<string, "loading" | "error" | "started"> }>({ owner, data: {} })
  const downloadState = downloadRecord.owner === owner ? downloadRecord.data : {}
  const downloadAbortRef = useRef<Map<string, AbortController>>(new Map())
  useLayoutEffect(() => {
    ownerRef.current = owner
    const downloads = downloadAbortRef.current
    let href = window.location.href
    const unsubscribe = subscribeUrlState(() => {
      if (href === window.location.href) return
      const stillInArtifacts = new URL(href).pathname === window.location.pathname && readLibraryTab() === "artifacts"
      href = window.location.href
      retireSourceRead()
      retireWrites()
      setSourceResult(null)
      setSelectedDetail(null)
      setFavoriteResult(null)
      setDeleteOpen(false)
      setDeleteRecord(prior => {
        if (!stillInArtifacts || prior?.owner !== owner || !["pending", "unknown"].includes(prior.intent.phase)) return null
        return prior.intent.phase === "pending" ? { ...prior, intent: { ...prior.intent, phase: "unknown" } } : prior
      })
    })
    return () => {
      unsubscribe()
      retireSourceRead()
      retireWrites()
      if (ownerRef.current === owner) ownerRef.current = null
      for (const controller of downloads.values()) controller.abort()
      downloads.clear()
    }
  }, [owner, retireSourceRead, retireWrites])
  const client = useMemo<LibraryArtifactClient>(() => artifactClient ?? (useFixtureTransport
    ? { listArtifacts: async () => ({ items: [], nextCursor: null }) }
    : { listArtifacts: listLibraryArtifacts }), [artifactClient, useFixtureTransport])

  const readDetail = client.getArtifact ?? getLibraryArtifact
  const openSourceFromCard = async (artifact: LibraryArtifact) => {
    if (!onOpenSession || !owner.admitted || ownerRef.current !== owner) return
    const key = artifactKey(artifact)
    if (sourceReadRef.current?.key === key) return
    retireSourceRead()
    const href = window.location.href
    const controller = new AbortController()
    const read = { key, controller }
    sourceReadRef.current = read
    const isCurrent = () => sourceReadRef.current === read && !controller.signal.aborted &&
      ownerRef.current === owner && window.location.href === href
    setSourceResult({ owner, key, status: "loading" })
    try {
      const detail = await readDetail(artifact.conversationId, artifact.artifactId, controller.signal)
      if (!isCurrent()) return
      if (!matchesLibraryArtifact(artifact, detail)) throw Error("library_artifacts_invalid_response")
      const scope = artifactSessionScope(detail)
      if (!scope) {
        setSourceResult({ owner, key, status: "unavailable" })
        return
      }
      setSourceResult(null)
      onOpenSession(scope, detail.conversationId)
    } catch {
      if (isCurrent()) setSourceResult({ owner, key, status: "error" })
    } finally {
      if (sourceReadRef.current === read) sourceReadRef.current = null
    }
  }

  const normalizedQuery = query.trim().normalize("NFC").toLowerCase()
  // BFF validates the raw query length before normalization, which can expand Unicode.
  const search = useMemo(() => ({ query, type: filter, ...(favoritesOnly ? { favoritesOnly: true } : {}) }), [query, filter, favoritesOnly])
  const page = useLibraryArtifacts(owner,search,client,fixtureSnapshot)
  const {artifacts, nextCursor, loadingMore, loadMoreError, reload, loadMore} = page
  const isFixtureControlled = fixtureSnapshot!==undefined

  const filteredArtifacts = useMemo(() => {
    const normalized = normalizedQuery
    return artifacts.filter((artifact) => {
      const local = isFixtureControlled || useFixtureTransport
      const matchesFilter = !local || filter === "all" || artifactFilter(artifact.mimeType, artifact.title) === filter
      const matchesQuery = !local || normalized === "" || [artifact.title,artifact.filename].some(value=>value.normalize("NFC").toLowerCase().includes(normalized))
      return matchesFilter && matchesQuery && (!local || !favoritesOnly || artifact.favorited)
    })
  }, [artifacts, favoritesOnly, filter, normalizedQuery, isFixtureControlled, useFixtureTransport])

  const download = useCallback(async (artifact: LibraryArtifact) => {
    if (!owner.admitted || ownerRef.current !== owner) return
    const key = artifactKey(artifact)
    if (downloadAbortRef.current.has(key)) return
    const controller = new AbortController()
    downloadAbortRef.current.set(key, controller)
    setDownloadRecord(current => ({ owner, data: { ...(current.owner === owner ? current.data : {}), [key]: "loading" } }))
    try {
      await (downloadArtifact ?? (useFixtureTransport ? previewDownloadArtifact : defaultDownloadArtifact))(artifact, controller.signal)
      if (!controller.signal.aborted) setDownloadRecord(current => ({ owner, data: { ...(current.owner === owner ? current.data : {}), [key]: "started" } }))
    } catch {
      if (!controller.signal.aborted) setDownloadRecord(current => ({ owner, data: { ...(current.owner === owner ? current.data : {}), [key]: "error" } }))
    } finally {
      if (downloadAbortRef.current.get(key) === controller) downloadAbortRef.current.delete(key)
    }
  }, [downloadArtifact, useFixtureTransport, owner])

  const toggleFavorite = async (artifact: LibraryArtifact) => {
    if (preview || !owner.admitted || ownerRef.current !== owner || favoriteFlight.current !== null) return
    const key = artifactKey(artifact)
    const target = !artifact.favorited
    const href = window.location.href
    const controller = new AbortController()
    favoriteFlight.current = controller
    setFavoriteResult({ owner, key, status: "pending" })
    try {
      const confirmed = await setLibraryArtifactFavorite(artifact, target, controller.signal)
      if (favoriteFlight.current !== controller || controller.signal.aborted || ownerRef.current !== owner || window.location.href !== href) return
      if (confirmed) {
        page.acknowledge(artifact, target)
        setFavoriteResult(null)
      } else setFavoriteResult({ owner, key, status: "error" })
    } finally {
      if (favoriteFlight.current === controller) favoriteFlight.current = null
    }
  }

  const openDeletion = (artifact: LibraryArtifact, trigger: HTMLButtonElement) => {
    if (preview || !owner.admitted || ownerRef.current !== owner || deleteFlight.current !== null || deletion?.phase === "auth_required") return
    if (deletion?.phase === "unknown" && artifactKey(deletion.artifact) !== artifactKey(artifact)) return
    deleteTrigger.current = trigger
    if (deletion?.phase !== "unknown") setDeleteRecord({ owner, intent: { artifact, phase: "confirm" } })
    setDeleteOpen(true)
  }
  const closeDeletion = () => {
    if (deleteFlight.current !== null) return
    setDeleteOpen(false)
    if (deletion?.phase !== "unknown" && deletion?.phase !== "auth_required") setDeleteRecord(null)
  }
  const submitDeletion = async () => {
    if (!owner.admitted || ownerRef.current !== owner || !deleteOpen || deleteFlight.current !== null ||
      (deletion?.phase !== "confirm" && deletion?.phase !== "unknown")) return
    const href = window.location.href
    const command = { artifact: deletion.artifact, key: deletion.phase === "confirm" ? `library-artifact-delete:${crypto.randomUUID()}` : deletion.key }
    const controller = new AbortController()
    deleteFlight.current = controller
    setDeleteRecord({ owner, intent: { ...command, phase: "pending" } })
    try {
      const result = await deleteLibraryArtifact(command.artifact, command.key, controller.signal)
      if (deleteFlight.current !== controller || controller.signal.aborted || ownerRef.current !== owner || window.location.href !== href) return
      if (result === "confirmed") {
        page.acknowledge(command.artifact, null)
        setDeleteOpen(false)
        setDeleteRecord(null)
      } else setDeleteRecord({ owner, intent: { ...command, phase: result } })
    } finally {
      if (deleteFlight.current === controller) deleteFlight.current = null
    }
  }

  const lockedDeletionKey = deletion?.phase === "unknown" ? artifactKey(deletion.artifact) : null
  const retryOutsideResults = deletion?.phase === "unknown" && !deleteOpen &&
    (page.error || !filteredArtifacts.some(artifact => artifactKey(artifact) === lockedDeletionKey))

  const clearFilters = () => {
    updateUrlState({ filter: "all", query: "", favoritesOnly: false })
  }
  const showLoading = !owner.admitted || page.loading
  const showError = owner.admitted && page.error
  const showPagination = !isFixtureControlled && nextCursor !== null

  return (
    <>
      <LibraryHeader searching={page.queryPending} query={query} view={view} favoritesOnly={favoritesOnly} updateUrlState={updateUrlState} onOpenFiles={() => writeLibraryTab("files")} sourceFocusRef={sourceFocusRef} />
      <LibraryToolbar filter={filter} updateUrlState={updateUrlState} />
      {retryOutsideResults ? <div className={styles.toolbar}>
        <span className="min-w-0 break-words text-sm text-muted-foreground">{deletion.artifact.title}</span>
        <Button type="button" variant="outline" size="sm" onClick={event => openDeletion(deletion.artifact, event.currentTarget)}>{t("library.fileDeleteRetry")}</Button>
      </div> : null}
      <LibraryResults
        filteredArtifacts={filteredArtifacts}
        view={view}
        favoritesOnly={favoritesOnly}
        hasActiveContentFilter={filter !== "all" || query.trim() !== ""}
        downloadState={downloadState}
        favoriteState={favoriteResult?.owner === owner ? favoriteResult : null}
        lockedDeletionKey={lockedDeletionKey}
        deletionBlocked={deletion?.phase === "auth_required"}
        {...(preview ? {} : { toggleFavorite, onOpenDelete: openDeletion })}
        download={download}
        onOpenDetail={(artifact, trigger) => {
          if (!owner.admitted || ownerRef.current !== owner) return
          retireSourceRead()
          setSourceResult(null)
          detailReturnFocusRef.current = trigger
          setSelectedDetail({ artifact, href: window.location.href, actor })
        }}
        sourceState={sourceResult?.owner === owner ? sourceResult : null}
        showLoading={showLoading}
        showError={showError}
        queryPending={page.queryPending}
        showPagination={showPagination}
        loadMoreError={loadMoreError}
        loadingMore={loadingMore}
        reload={reload}
        loadMore={loadMore}
        clearFilters={clearFilters}
        {...(onPrompt === undefined ? {} : { onPrompt })}
        {...(onOpenSession === undefined ? {} : { onOpenSource: openSourceFromCard })}
      />
      {selectedDetail ? <LibraryArtifactDetail key={artifactKey(selectedDetail.artifact)} artifact={selectedDetail.artifact}
        read={readDetail} admitted={owner.admitted} generation={owner.generation} onClose={() => setSelectedDetail(null)} onReturnFocus={() => {
          const buttons = document.querySelector('[data-testid="library-page"]')?.querySelectorAll<HTMLElement>("[data-library-artifact-key]")
          const current = [...(buttons ?? [])].find(button => button.dataset.libraryArtifactKey === artifactKey(selectedDetail.artifact))
          const previous = detailReturnFocusRef.current
          const target = current ?? (previous?.isConnected ? previous : sourceFocusRef.current)
          target?.focus()
        }}
        onDownload={download} downloadState={downloadState[artifactKey(selectedDetail.artifact)]}
        {...(onOpenSession ? { onOpenSource: (detail: LibraryArtifactDetailView) => {
          if (!owner.admitted || ownerRef.current !== owner || selectedDetail.href !== window.location.href) return
          const scope = artifactSessionScope(detail)
          if (!scope) return
          setSelectedDetail(null)
          onOpenSession(scope, detail.conversationId)
        } } : {})} /> : null}
      <LibraryArtifactDeleteDialog open={deleteOpen && deletion !== null} title={deletion?.artifact.title ?? ""}
        phase={deletion?.phase} onClose={closeDeletion} onSubmit={submitDeletion} onReturnFocus={() => {
          if (ownerRef.current !== owner) return
          const trigger = deleteTrigger.current
          if (trigger?.isConnected && !trigger.disabled) trigger.focus()
          else sourceFocusRef.current?.focus()
        }} />
    </>
  )
}

export function KokoroLibrarySurface(props: KokoroLibrarySurfaceProps) {
  return <LibraryWorkspace key={JSON.stringify([props.preview, props.projectReadBoundary?.subject])} {...props} />
}

function LibraryWorkspace(props: KokoroLibrarySurfaceProps) {
  const t = useT()
  const activeTab = useSyncExternalStore(subscribeUrlState, readLibraryTab, () => "artifacts")
  const sourceFocusRef = useRef<HTMLButtonElement | null>(null)
  const previousSourceRef = useRef(activeTab)
  useEffect(() => {
    if (previousSourceRef.current !== activeTab) sourceFocusRef.current?.focus()
    previousSourceRef.current = activeTab
  }, [activeTab])
  const upload = useLibraryFileUpload()
  return <div className={styles.page} data-testid="library-page">
    {activeTab === "files" ? <>
      <header className={styles.header}>
        <Button ref={sourceFocusRef} type="button" variant="ghost" size="icon-sm" aria-label={t("library.artifactsTab")} onClick={() => writeLibraryTab("artifacts")}><ArrowLeft aria-hidden="true" /></Button>
        <h1>{t("library.filesTab")}</h1>
      </header>
      <KokoroLibraryFiles preview={props.preview === true} upload={upload} boundary={props.projectReadBoundary} />
    </> : <KokoroArtifactLibrary {...props} sourceFocusRef={sourceFocusRef} />}
  </div>
}
