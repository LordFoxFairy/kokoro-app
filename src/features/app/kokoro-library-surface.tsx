"use client"


import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LibraryArtifactDetail } from "./kokoro-library-artifact-detail"
import { LibraryHeader } from "./kokoro-library-header"
import { downloadFetchedFile } from "@/engine/file-fetch"
import { useMemo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useT } from "@/i18n/context"

import { LibraryResults, LibraryToolbar } from "./kokoro-library-sections"
import { beginLibraryArtifactDownload, getLibraryArtifact, listLibraryArtifacts, type LibraryArtifact, type LibraryArtifactClient } from "./kokoro-library-artifact-client"
import { KokoroLibraryFiles } from "./kokoro-library-files"
import { useLibraryFileUpload } from "./kokoro-library-file-upload-state"
import { DEFAULT_URL_STATE, FILTERS, artifactFilter, type LibraryFilter, type LibraryUrlState } from "./kokoro-library-model"
import {appendUniqueArtifacts, useLibraryArtifacts} from "./use-library-artifacts"
import styles from "./kokoro-library-surface.module.css"


type ArtifactDownloader = (artifact: LibraryArtifact, signal: AbortSignal) => Promise<void>

export type KokoroLibrarySurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "onOpenSession" | "projectReadBoundary"> & {
  fixtureArtifacts?: readonly LibraryArtifact[]
  initialFavoriteIds?: readonly string[]
  artifactClient?: LibraryArtifactClient
  onFavoriteChange?: (artifact: LibraryArtifact, next: ReadonlySet<string>) => void
  downloadArtifact?: ArtifactDownloader
}

function artifactKey(artifact: LibraryArtifact): string {
  return JSON.stringify([artifact.conversationId, artifact.artifactId])
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
  favoriteIds,
  setFavoriteIds,
  artifactClient,
  onFavoriteChange,
  downloadArtifact,
  sourceFocusRef,
}: KokoroLibrarySurfaceProps & {
  sourceFocusRef: React.RefObject<HTMLButtonElement | null>
  favoriteIds: ReadonlySet<string>
  setFavoriteIds: (next: ReadonlySet<string>) => void
}) {
  // Only an explicit preview selects synthetic transport. Development with a
  // Product Session remains live and must show an unavailable BFF as an error.
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
  const owner = useMemo(() => ({ admitted, subject: projectReadBoundary?.subject, generation: projectReadBoundary?.generation ?? 0 }),
    [admitted, projectReadBoundary?.subject, projectReadBoundary?.generation])
  const ownerRef = useRef<typeof owner | null>(owner)
  const [selectedArtifact, setSelectedArtifact] = useState<LibraryArtifact | null>(null)
  const detailReturnFocusRef = useRef<HTMLElement | null>(null)
  const [downloadRecord, setDownloadRecord] = useState<{ owner: typeof owner; data: Record<string, "loading" | "error" | "started"> }>({ owner, data: {} })
  const downloadState = downloadRecord.owner === owner ? downloadRecord.data : {}
  const downloadAbortRef = useRef<Map<string, AbortController>>(new Map())
  useLayoutEffect(() => {
    ownerRef.current = owner
    const downloads = downloadAbortRef.current
    return () => {
      if (ownerRef.current === owner) ownerRef.current = null
      for (const controller of downloads.values()) controller.abort()
      downloads.clear()
    }
  }, [owner])
  const client = useMemo<LibraryArtifactClient>(() => artifactClient ?? (useFixtureTransport
    ? { listArtifacts: async () => ({ items: [], nextCursor: null }) }
    : { listArtifacts: listLibraryArtifacts }), [artifactClient, useFixtureTransport])

  const normalizedQuery = query.trim().normalize("NFC").toLowerCase()
  // BFF validates the raw query length before normalization, which can expand Unicode.
  const search = useMemo(()=>({query,type:filter}),[query,filter])
  const page = useLibraryArtifacts(owner,search,client,fixtureSnapshot)
  const {artifacts, nextCursor, loadingMore, loadMoreError, reload, loadMore} = page
  const isFixtureControlled = fixtureSnapshot!==undefined

  const filteredArtifacts = useMemo(() => {
    const normalized = normalizedQuery
    return artifacts.filter((artifact) => {
      const local = isFixtureControlled || useFixtureTransport
      const matchesFilter = !local || filter === "all" || artifactFilter(artifact.mimeType, artifact.title) === filter
      const matchesQuery = !local || normalized === "" || [artifact.title,artifact.filename].some(value=>value.normalize("NFC").toLowerCase().includes(normalized))
      const matchesFavorites = !favoritesOnly || favoriteIds.has(artifactKey(artifact))
      return matchesFilter && matchesQuery && matchesFavorites
    })
  }, [artifacts, favoriteIds, favoritesOnly, filter, normalizedQuery, isFixtureControlled, useFixtureTransport])

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

  const toggleFavorite = (artifact: LibraryArtifact) => {
    const next = new Set(favoriteIds)
    const key = artifactKey(artifact)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFavoriteIds(next)
    onFavoriteChange?.(artifact, next)
  }

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
      <LibraryResults
        filteredArtifacts={filteredArtifacts}
        view={view}
        favoritesOnly={favoritesOnly}
        favoriteIds={favoriteIds}
        hasActiveContentFilter={filter !== "all" || query.trim() !== ""}
        downloadState={downloadState}
        toggleFavorite={toggleFavorite}
        download={download}
        onOpenDetail={(artifact, trigger) => { if (!owner.admitted || ownerRef.current !== owner) return; detailReturnFocusRef.current = trigger; setSelectedArtifact(artifact) }}
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
        {...(onOpenSession === undefined ? {} : { onOpenSession })}
      />
      {selectedArtifact ? <LibraryArtifactDetail key={artifactKey(selectedArtifact)} artifact={selectedArtifact}
        read={client.getArtifact ?? getLibraryArtifact} admitted={owner.admitted} generation={owner.generation} onClose={() => setSelectedArtifact(null)} onReturnFocus={() => {
          const buttons = document.querySelector('[data-testid="library-page"]')?.querySelectorAll<HTMLElement>("[data-library-artifact-key]")
          const current = [...(buttons ?? [])].find(button => button.dataset.libraryArtifactKey === artifactKey(selectedArtifact))
          const previous = detailReturnFocusRef.current
          const target = current ?? (previous?.isConnected ? previous : sourceFocusRef.current)
          target?.focus()
        }}
        onDownload={download} downloadState={downloadState[artifactKey(selectedArtifact)]}
        {...(onOpenSession ? { onOpenSession } : {})} /> : null}
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
  // Keep local favorites for the lifetime of this Library page, without
  // mounting or fetching the inactive data source.
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(() => new Set(props.initialFavoriteIds))
  return <div className={styles.page} data-testid="library-page">
    {activeTab === "files" ? <>
      <header className={styles.header}>
        <Button ref={sourceFocusRef} type="button" variant="ghost" size="icon-sm" aria-label={t("library.artifactsTab")} onClick={() => writeLibraryTab("artifacts")}><ArrowLeft aria-hidden="true" /></Button>
        <h1>{t("library.filesTab")}</h1>
      </header>
      <KokoroLibraryFiles preview={props.preview === true} upload={upload} />
    </> : <KokoroArtifactLibrary {...props} sourceFocusRef={sourceFocusRef} favoriteIds={favoriteIds} setFavoriteIds={setFavoriteIds} />}
  </div>
}
