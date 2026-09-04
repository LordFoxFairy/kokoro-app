"use client"


import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { artifactContentPath, type ArtifactList, type ArtifactRecord } from "@/contract/http"
import type { SessionClient } from "@/engine/client"
import { browserListClient } from "@/ui/shell/page-clients"
import { sessionBaseUrl } from "@/engine/config"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"
import { useMemo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useT } from "@/i18n/context"

import { LibraryResults, LibraryToolbar } from "./kokoro-library-sections"
import { DEFAULT_URL_STATE, FILTERS, artifactFilter, type LibraryFilter, type LibraryUrlState } from "./kokoro-library-model"
import styles from "./kokoro-library-surface.module.css"

type ArtifactClient = Pick<SessionClient, "listArtifacts">
type ArtifactDownloader = (artifact: ArtifactRecord) => Promise<boolean>

export type KokoroLibrarySurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "onOpenSession"> & {
  fixtureArtifacts?: readonly ArtifactRecord[]
  initialFavoriteHashes?: readonly string[]
  artifactClient?: ArtifactClient
  onFavoriteChange?: (artifact: ArtifactRecord, next: ReadonlySet<string>) => void
  downloadArtifact?: ArtifactDownloader
}

function appendUniqueArtifacts(current: readonly ArtifactRecord[], additions: readonly ArtifactRecord[]): ArtifactRecord[] {
  const byHash = new Map(current.map((artifact) => [artifact.content_hash, artifact]))
  for (const artifact of additions) byHash.set(artifact.content_hash, artifact)
  return [...byHash.values()]
}

function artifactUrl(contentHash: string): string {
  return `${sessionBaseUrl()}${artifactContentPath(contentHash)}`
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

async function defaultDownloadArtifact(artifact: ArtifactRecord): Promise<boolean> {
  return downloadFetchedFile(await fileFetch(artifactUrl(artifact.content_hash)), artifact.title)
}

async function previewDownloadArtifact(artifact: ArtifactRecord): Promise<boolean> {
  const body = [
    `Kokoro preview artifact: ${artifact.title}`,
    `content_hash: ${artifact.content_hash}`,
    "This file is a local fixture for desktop interaction QA.",
  ].join("\n")
  return downloadFetchedFile(
    new Response(new Blob([body], { type: artifact.mime })),
    artifact.title,
  )
}

export function KokoroLibrarySurface({
  preview = false,
  onPrompt,
  onOpenSession,
  fixtureArtifacts,
  initialFavoriteHashes = [],
  artifactClient,
  onFavoriteChange,
  downloadArtifact,
}: KokoroLibrarySurfaceProps) {
  const t = useT()
  // Local development can have an authenticated session before the library
  // BFF is deployed. Only an un-injected client uses the synthetic transport;
  // production and explicit client seams always retain live semantics.
  const fixtureMode = preview || process.env.NODE_ENV !== "production"
  const useFixtureTransport = fixtureMode && !artifactClient && !fixtureArtifacts
  const { filter, query, view, favoritesOnly } = useLibraryUrlState()
  const updateUrlState = useCallback((patch: Partial<LibraryUrlState>) => {
    writeUrlState({ ...readUrlState(), ...patch })
  }, [])
  const [favoriteHashes, setFavoriteHashes] = useState<ReadonlySet<string>>(() => new Set(initialFavoriteHashes))
  const fixtureSnapshot = useMemo(
    () => fixtureArtifacts === undefined ? undefined : appendUniqueArtifacts([], fixtureArtifacts),
    [fixtureArtifacts],
  )
  const [loadedArtifacts, setLoadedArtifacts] = useState<ArtifactRecord[]>(() => fixtureSnapshot ?? [])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [loading, setLoading] = useState(() => fixtureSnapshot === undefined)
  const [error, setError] = useState(false)
  const [downloadState, setDownloadState] = useState<Record<string, "loading" | "error">>({})
  const requestSeqRef = useRef(0)
  const loadedCursorsRef = useRef<Set<string>>(new Set())
  const inFlightCursorRef = useRef<string | undefined>(undefined)
  const client = useMemo<ArtifactClient>(() => artifactClient ?? browserListClient({ preview: useFixtureTransport }), [artifactClient, useFixtureTransport])

  const load = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current
    loadedCursorsRef.current.clear()
    inFlightCursorRef.current = undefined
    try {
      const page: ArtifactList = fixtureArtifacts
        ? { artifacts: [...fixtureArtifacts] }
        : await client.listArtifacts()
      if (requestSeq !== requestSeqRef.current) return
      setLoadedArtifacts(appendUniqueArtifacts([], page.artifacts))
      setNextCursor(page.next_cursor)
    } catch {
      if (requestSeq !== requestSeqRef.current) return
      // Only the explicit preview transport has an intentional empty result.
      // A live client failure must stay visible so an unavailable library is
      // never misread as a successful empty state in local development.
      if (useFixtureTransport) {
        setLoadedArtifacts([])
        setNextCursor(undefined)
      } else {
        setError(true)
      }
    } finally {
      if (requestSeq === requestSeqRef.current) setLoading(false)
    }
  }, [client, fixtureArtifacts, useFixtureTransport])

  const reload = useCallback(() => {
    setLoading(true)
    setError(false)
    setNextCursor(undefined)
    setLoadingMore(false)
    setLoadMoreError(false)
    void load()
  }, [load])

  const loadMore = useCallback(async () => {
    const cursor = nextCursor
    if (loadingMore || cursor === undefined) return
    if (inFlightCursorRef.current === cursor) return
    if (loadedCursorsRef.current.has(cursor)) {
      setNextCursor(undefined)
      return
    }

    const requestSeq = ++requestSeqRef.current
    inFlightCursorRef.current = cursor
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const page = await client.listArtifacts(cursor)
      if (requestSeq !== requestSeqRef.current) return
      loadedCursorsRef.current.add(cursor)
      setLoadedArtifacts((current) => appendUniqueArtifacts(current, page.artifacts))
      setNextCursor(page.next_cursor !== undefined && !loadedCursorsRef.current.has(page.next_cursor) ? page.next_cursor : undefined)
    } catch {
      if (requestSeq !== requestSeqRef.current) return
      setLoadMoreError(true)
    } finally {
      if (requestSeq === requestSeqRef.current) {
        inFlightCursorRef.current = undefined
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
      loadedCursorsRef.current.clear()
      inFlightCursorRef.current = undefined
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize local transport state with the controlled fixture boundary.
      setLoading(false)
      setError(false)
      setNextCursor(undefined)
      setLoadingMore(false)
      setLoadMoreError(false)
      return
    }

    // The loading state is initialized before mount; start the live/preview
    // transport from this effect without adding a frame or microtask gate.
    setLoading(true)
    setError(false)
    setNextCursor(undefined)
    setLoadingMore(false)
    setLoadMoreError(false)
    void load()
    return () => {
      requestSeqRef.current += 1
    }
  }, [fixtureSnapshot, isFixtureControlled, load])

  const filteredArtifacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return artifacts.filter((artifact) => {
      const matchesFilter = filter === "all" || artifactFilter(artifact.mime, artifact.title) === filter
      const matchesQuery = normalized === "" || artifact.title.toLocaleLowerCase().includes(normalized)
      const matchesFavorites = !favoritesOnly || favoriteHashes.has(artifact.content_hash)
      return matchesFilter && matchesQuery && matchesFavorites
    })
  }, [artifacts, favoriteHashes, favoritesOnly, filter, query])

  const download = useCallback(async (artifact: ArtifactRecord) => {
    const hash = artifact.content_hash
    if (downloadState[hash] === "loading") return
    setDownloadState((current) => ({ ...current, [hash]: "loading" }))
    try {
      const ok = await (downloadArtifact ?? (useFixtureTransport ? previewDownloadArtifact : defaultDownloadArtifact))(artifact)
      setDownloadState((current) => {
        const next = { ...current }
        if (ok) delete next[hash]
        else next[hash] = "error"
        return next
      })
    } catch {
      setDownloadState((current) => ({ ...current, [hash]: "error" }))
    }
  }, [downloadArtifact, downloadState, useFixtureTransport])

  const toggleFavorite = (artifact: ArtifactRecord) => {
    const next = new Set(favoriteHashes)
    if (next.has(artifact.content_hash)) next.delete(artifact.content_hash)
    else next.add(artifact.content_hash)
    setFavoriteHashes(next)
    onFavoriteChange?.(artifact, next)
  }

  const clearFilters = () => {
    updateUrlState({ filter: "all", query: "", favoritesOnly: false })
  }
  const showLoading = !isFixtureControlled && loading
  const showError = !isFixtureControlled && error
  const showPagination = !isFixtureControlled && nextCursor !== undefined

  return (
    <div className={styles.page} data-testid="library-page">
      <header className={styles.header}>
        <h1>{t("rail.navDatabase")}</h1>
      </header>

      <LibraryToolbar filter={filter} query={query} view={view} favoritesOnly={favoritesOnly} updateUrlState={updateUrlState} />
      <LibraryResults
        artifacts={artifacts}
        filteredArtifacts={filteredArtifacts}
        view={view}
        favoritesOnly={favoritesOnly}
        favoriteHashes={favoriteHashes}
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
    </div>
  )
}
