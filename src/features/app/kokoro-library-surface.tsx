"use client"


import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { downloadFetchedFile } from "@/engine/file-fetch"
import { useMemo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useT } from "@/i18n/context"

import { LibraryResults, LibraryToolbar } from "./kokoro-library-sections"
import { beginLibraryArtifactDownload, listLibraryArtifacts, type LibraryArtifact, type LibraryArtifactPage } from "./kokoro-library-artifact-client"
import { KokoroLibraryFiles } from "./kokoro-library-files"
import { useLibraryFileUpload } from "./kokoro-library-file-upload-state"
import { DEFAULT_URL_STATE, FILTERS, artifactFilter, type LibraryFilter, type LibraryUrlState } from "./kokoro-library-model"
import styles from "./kokoro-library-surface.module.css"

type ArtifactClient = { listArtifacts: (cursor: string | null, signal: AbortSignal) => Promise<LibraryArtifactPage> }
type ArtifactDownloader = (artifact: LibraryArtifact, signal: AbortSignal) => Promise<void>

export type KokoroLibrarySurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "onOpenSession"> & {
  fixtureArtifacts?: readonly LibraryArtifact[]
  initialFavoriteIds?: readonly string[]
  artifactClient?: ArtifactClient
  onFavoriteChange?: (artifact: LibraryArtifact, next: ReadonlySet<string>) => void
  downloadArtifact?: ArtifactDownloader
}

function artifactKey(artifact: LibraryArtifact): string {
  return JSON.stringify([artifact.conversationId, artifact.artifactId])
}

function appendUniqueArtifacts(current: readonly LibraryArtifact[], additions: readonly LibraryArtifact[]): LibraryArtifact[] {
  const byId = new Map(current.map((artifact) => [artifactKey(artifact), artifact]))
  for (const artifact of additions) byId.set(artifactKey(artifact), artifact)
  return [...byId.values()]
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
  else url.searchParams.set("q", state.query.trim())
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
  onPrompt,
  onOpenSession,
  fixtureArtifacts,
  favoriteIds,
  setFavoriteIds,
  artifactClient,
  onFavoriteChange,
  downloadArtifact,
}: KokoroLibrarySurfaceProps & {
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
  const [loadedArtifacts, setLoadedArtifacts] = useState<LibraryArtifact[]>(() => fixtureSnapshot ?? [])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [loading, setLoading] = useState(() => fixtureSnapshot === undefined)
  const [error, setError] = useState(false)
  const [downloadState, setDownloadState] = useState<Record<string, "loading" | "error" | "started">>({})
  const requestSeqRef = useRef(0)
  const listAbortRef = useRef<AbortController | null>(null)
  const downloadAbortRef = useRef<Map<string, AbortController>>(new Map())
  const loadedCursorsRef = useRef<Set<string>>(new Set())
  const inFlightCursorRef = useRef<string | undefined>(undefined)
  const client = useMemo<ArtifactClient>(() => artifactClient ?? (useFixtureTransport
    ? { listArtifacts: async () => ({ items: [], nextCursor: null }) }
    : { listArtifacts: listLibraryArtifacts }), [artifactClient, useFixtureTransport])

  const load = useCallback(async () => {
    listAbortRef.current?.abort()
    const controller = new AbortController()
    listAbortRef.current = controller
    const requestSeq = ++requestSeqRef.current
    loadedCursorsRef.current.clear()
    inFlightCursorRef.current = undefined
    try {
      const page: LibraryArtifactPage = fixtureArtifacts
        ? { items: [...fixtureArtifacts], nextCursor: null }
        : await client.listArtifacts(null, controller.signal)
      if (requestSeq !== requestSeqRef.current) return
      setLoadedArtifacts(appendUniqueArtifacts([], page.items))
      setNextCursor(page.nextCursor)
    } catch {
      if (requestSeq !== requestSeqRef.current) return
      // Only the explicit preview transport has an intentional empty result.
      // A live client failure must stay visible so an unavailable library is
      // never misread as a successful empty state in local development.
      if (useFixtureTransport) {
        setLoadedArtifacts([])
        setNextCursor(null)
      } else {
        setError(true)
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        listAbortRef.current = null
        setLoading(false)
      }
    }
  }, [client, fixtureArtifacts, useFixtureTransport])

  const reload = useCallback(() => {
    setLoading(true)
    setError(false)
    setNextCursor(null)
    setLoadingMore(false)
    setLoadMoreError(false)
    void load()
  }, [load])

  const loadMore = useCallback(async () => {
    const cursor = nextCursor
    if (loadingMore || cursor === null) return
    if (inFlightCursorRef.current === cursor) return
    if (loadedCursorsRef.current.has(cursor)) {
      setNextCursor(null)
      return
    }

    const requestSeq = ++requestSeqRef.current
    const controller = new AbortController()
    listAbortRef.current = controller
    inFlightCursorRef.current = cursor
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const page = await client.listArtifacts(cursor, controller.signal)
      if (requestSeq !== requestSeqRef.current) return
      loadedCursorsRef.current.add(cursor)
      setLoadedArtifacts((current) => appendUniqueArtifacts(current, page.items))
      setNextCursor(page.nextCursor !== null && !loadedCursorsRef.current.has(page.nextCursor) ? page.nextCursor : null)
    } catch {
      if (requestSeq !== requestSeqRef.current) return
      setLoadMoreError(true)
    } finally {
      if (requestSeq === requestSeqRef.current) {
        inFlightCursorRef.current = undefined
        listAbortRef.current = null
        setLoadingMore(false)
      }
    }
  }, [client, loadingMore, nextCursor])

  // Controlled fixture props are the source of truth when a host changes them
  // after mount; fetched data remains stateful for live/preview transport.
  const artifacts = fixtureSnapshot ?? loadedArtifacts
  const isFixtureControlled = fixtureSnapshot !== undefined

  useEffect(() => {
    if (isFixtureControlled) {
      // A fixture transition supersedes every live request, including a page
      // request. Clear its transport state so stale pagination and errors do
      // not leak into the controlled projection.
      requestSeqRef.current += 1
      listAbortRef.current?.abort()
      loadedCursorsRef.current.clear()
      inFlightCursorRef.current = undefined
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize local transport state with the controlled fixture boundary.
      setLoading(false)
      setError(false)
      setNextCursor(null)
      setLoadingMore(false)
      setLoadMoreError(false)
      return
    }

    // The loading state is initialized before mount; start the live/preview
    // transport from this effect without adding a frame or microtask gate.
    setLoading(true)
    setError(false)
    setNextCursor(null)
    setLoadingMore(false)
    setLoadMoreError(false)
    void load()
    const activeDownloads = downloadAbortRef.current
    return () => {
      requestSeqRef.current += 1
      listAbortRef.current?.abort()
      for (const controller of activeDownloads.values()) controller.abort()
      activeDownloads.clear()
    }
  }, [fixtureSnapshot, isFixtureControlled, load])

  const filteredArtifacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return artifacts.filter((artifact) => {
      const matchesFilter = filter === "all" || artifactFilter(artifact.mimeType, artifact.title) === filter
      const matchesQuery = normalized === "" || artifact.title.toLocaleLowerCase().includes(normalized)
      const matchesFavorites = !favoritesOnly || favoriteIds.has(artifactKey(artifact))
      return matchesFilter && matchesQuery && matchesFavorites
    })
  }, [artifacts, favoriteIds, favoritesOnly, filter, query])

  const download = useCallback(async (artifact: LibraryArtifact) => {
    const key = artifactKey(artifact)
    if (downloadAbortRef.current.has(key)) return
    const controller = new AbortController()
    downloadAbortRef.current.set(key, controller)
    setDownloadState((current) => ({ ...current, [key]: "loading" }))
    try {
      await (downloadArtifact ?? (useFixtureTransport ? previewDownloadArtifact : defaultDownloadArtifact))(artifact, controller.signal)
      if (!controller.signal.aborted) setDownloadState((current) => ({ ...current, [key]: "started" }))
    } catch {
      if (!controller.signal.aborted) setDownloadState((current) => ({ ...current, [key]: "error" }))
    } finally {
      downloadAbortRef.current.delete(key)
    }
  }, [downloadArtifact, useFixtureTransport])

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
  const showLoading = !isFixtureControlled && loading
  const showError = !isFixtureControlled && error
  const showPagination = !isFixtureControlled && nextCursor !== null

  return (
    <>
      <LibraryToolbar filter={filter} query={query} view={view} favoritesOnly={favoritesOnly} updateUrlState={updateUrlState} />
      <LibraryResults
        artifacts={artifacts}
        filteredArtifacts={filteredArtifacts}
        view={view}
        favoritesOnly={favoritesOnly}
        favoriteIds={favoriteIds}
        hasActiveContentFilter={filter !== "all" || query.trim() !== ""}
        downloadState={downloadState}
        toggleFavorite={toggleFavorite}
        download={download}
        showLoading={showLoading}
        showError={showError}
        showPagination={showPagination}
        loadMoreError={loadMoreError}
        loadingMore={loadingMore}
        reload={reload}
        loadMore={loadMore}
        clearFilters={clearFilters}
        {...(onPrompt === undefined ? {} : { onPrompt })}
        {...(onOpenSession === undefined ? {} : { onOpenSession })}
      />
    </>
  )
}

export function KokoroLibrarySurface(props: KokoroLibrarySurfaceProps) {
  const t = useT()
  const upload = useLibraryFileUpload()
  // Keep local favorites for the lifetime of this Library page, without
  // mounting or fetching Agent artifacts while the Files tab is active.
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(() => new Set(props.initialFavoriteIds))
  return <div className={styles.page} data-testid="library-page">
    <header className={styles.header}><h1>{t("rail.navDatabase")}</h1></header>
    <Tabs defaultValue="files" className={styles.libraryTabs}>
      <TabsList aria-label={t("rail.navDatabase")} className={styles.libraryTabsList}>
        <TabsTrigger value="files">{t("library.filesTab")}</TabsTrigger>
        <TabsTrigger value="artifacts">{t("library.artifactsTab")}</TabsTrigger>
      </TabsList>
      <TabsContent value="files" className={styles.libraryTabPanel}><KokoroLibraryFiles preview={props.preview === true} upload={upload} /></TabsContent>
      <TabsContent value="artifacts" className={styles.libraryTabPanel}><KokoroArtifactLibrary {...props} favoriteIds={favoriteIds} setFavoriteIds={setFavoriteIds} /></TabsContent>
    </Tabs>
  </div>
}
