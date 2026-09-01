"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  Archive,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Globe2,
  Grid2X2,
  List,
  Presentation,
  Search,
  SquarePen,
  Star,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { artifactContentPath, type ArtifactList, type ArtifactRecord } from "@/contract/http"
import type { SessionClient } from "@/engine/client"
import { browserListClient } from "@/ui/shell/page-clients"
import { sessionBaseUrl } from "@/engine/config"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"
import { useLocale, useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/ui/thread/artifact-card"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"

import styles from "./kokoro-library-surface.module.css"

type LibraryFilter = "all" | "slides" | "websites" | "documents" | "spreadsheets" | "images" | "media" | "other"

const FILTERS: readonly { value: LibraryFilter; key: MessageKey }[] = [
  { value: "all", key: "library.filterAll" },
  { value: "slides", key: "library.filterSlides" },
  { value: "websites", key: "library.filterWebsites" },
  { value: "documents", key: "library.filterDocuments" },
  { value: "spreadsheets", key: "library.filterSpreadsheets" },
  { value: "images", key: "library.filterImages" },
  { value: "media", key: "library.filterMedia" },
  { value: "other", key: "library.filterOther" },
]

type LibraryUrlState = {
  filter: LibraryFilter
  query: string
  view: "grid" | "list"
  favoritesOnly: boolean
}

const DEFAULT_URL_STATE: LibraryUrlState = { filter: "all", query: "", view: "grid", favoritesOnly: false }
const FILTER_SCROLL_STEP = 192
const SCROLL_EDGE_EPSILON = 1
type ArtifactClient = Pick<SessionClient, "listArtifacts">
type ArtifactDownloader = (artifact: ArtifactRecord) => Promise<boolean>

export type KokoroLibrarySurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "onOpenSession"> & {
  /** Deterministic local list fixture for desktop visual and interaction coverage. */
  fixtureArtifacts?: readonly ArtifactRecord[]
  /** Hashes marked as favorites in the fixture; the card buttons remain locally interactive. */
  initialFavoriteHashes?: readonly string[]
  artifactClient?: ArtifactClient
  onFavoriteChange?: (artifact: ArtifactRecord, next: ReadonlySet<string>) => void
  /** Test seam for download errors; production uses the authenticated blob flow. */
  downloadArtifact?: ArtifactDownloader
}

function artifactFilter(mime: string, title: string): Exclude<LibraryFilter, "all"> {
  const value = `${mime} ${title}`.toLocaleLowerCase()
  if (value.includes("presentation") || value.includes("powerpoint") || /\b(slides|deck|投影片)\b/.test(value)) return "slides"
  if (value.includes("html") || value.includes("website") || value.includes("网页") || value.includes("網站")) return "websites"
  if (value.includes("spreadsheet") || value.includes("excel") || value.includes("csv") || value.includes("试算表") || value.includes("試算表")) return "spreadsheets"
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(title)) return "images"
  if (mime.startsWith("audio/") || mime.startsWith("video/") || /\.(mp3|mp4|mov|wav)$/i.test(title)) return "media"
  if (mime.includes("text") || mime.includes("pdf") || mime.includes("document") || /\.(docx?|pdf|txt|md)$/i.test(title)) return "documents"
  return "other"
}

function artifactIcon(kind: LibraryFilter): LucideIcon {
  switch (kind) {
    case "slides": return Presentation
    case "websites": return Globe2
    case "documents": return FileText
    case "spreadsheets": return FileSpreadsheet
    case "images": return FileImage
    case "media": return Film
    default: return File
  }
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
  const { locale } = useLocale()
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
  const [filterScrollState, setFilterScrollState] = useState({ left: false, right: false })
  const filterViewportRef = useRef<HTMLDivElement | null>(null)
  // Native smooth scrolling is asynchronous. Keep the last requested target
  // so rapid keyboard presses advance from the pending position instead of
  // repeatedly starting the same animation.
  const filterScrollTargetRef = useRef<number | null>(null)
  const requestSeqRef = useRef(0)
  const loadedCursorsRef = useRef<Set<string>>(new Set())
  const inFlightCursorRef = useRef<string | undefined>(undefined)
  const client = useMemo<ArtifactClient>(() => artifactClient ?? browserListClient({ preview: useFixtureTransport }), [artifactClient, useFixtureTransport])

  const updateFilterScrollState = useCallback(() => {
    const viewport = filterViewportRef.current
    if (!viewport) return
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const next = {
      left: max > SCROLL_EDGE_EPSILON && viewport.scrollLeft > SCROLL_EDGE_EPSILON,
      right: max > SCROLL_EDGE_EPSILON && viewport.scrollLeft < max - SCROLL_EDGE_EPSILON,
    }
    setFilterScrollState((current) => current.left === next.left && current.right === next.right ? current : next)
  }, [])

  const setFilterScrollPosition = useCallback((position: number) => {
    const viewport = filterViewportRef.current
    if (!viewport) return
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const next = Math.max(0, Math.min(max, position))
    filterScrollTargetRef.current = next
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    viewport.scrollTo({ left: next, behavior: prefersReducedMotion ? "auto" : "smooth" })
    updateFilterScrollState()
  }, [updateFilterScrollState])

  const scrollFilters = useCallback((direction: "forward" | "backward") => {
    const viewport = filterViewportRef.current
    if (!viewport) return
    const base = filterScrollTargetRef.current ?? viewport.scrollLeft
    setFilterScrollPosition(base + (direction === "forward" ? FILTER_SCROLL_STEP : -FILTER_SCROLL_STEP))
  }, [setFilterScrollPosition])

  const handleFilterKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    // Leave the ToggleGroup's roving keyboard navigation intact. The region
    // itself owns the explicit scroll shortcuts when it has focus.
    if (event.target !== event.currentTarget) return
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    if (event.key === "Home") setFilterScrollPosition(0)
    else if (event.key === "End") {
      const viewport = filterViewportRef.current
      setFilterScrollPosition(viewport ? viewport.scrollWidth - viewport.clientWidth : 0)
    } else {
      scrollFilters(event.key === "ArrowRight" ? "forward" : "backward")
    }
  }, [scrollFilters, setFilterScrollPosition])

  useEffect(() => {
    const viewport = filterViewportRef.current
    if (!viewport) return
    updateFilterScrollState()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateFilterScrollState)
    observer?.observe(viewport)
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild)
    return () => observer?.disconnect()
  }, [updateFilterScrollState])

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

  const hasActiveContentFilter = filter !== "all" || query.trim() !== ""
  const noMatch = artifacts.length > 0 && filteredArtifacts.length === 0 && hasActiveContentFilter
  const canClearEmptyStateFilters = noMatch || favoritesOnly
  const emptyTitle = noMatch
    ? t("library.noMatchTitle")
    : favoritesOnly
      ? t("library.noFavoritesTitle")
      : t("library.directEmptyTitle")
  const emptyDescription = noMatch ? t("library.noMatchDescription") : t("library.directEmptyDescription")
  const contentLabel = filteredArtifacts.length > 0 ? t("library.title") : emptyTitle
  const showLoading = !isFixtureControlled && loading
  const showError = !isFixtureControlled && error
  const showPagination = !isFixtureControlled && nextCursor !== undefined

  const clearFilters = () => {
    updateUrlState({ filter: "all", query: "", favoritesOnly: false })
  }

  return (
    <div className={styles.page} data-testid="library-page">
      <header className={styles.header}>
        <h1>{t("rail.navDatabase")}</h1>
      </header>

      <div className={styles.toolbar} data-testid="library-toolbar">
        <div
          ref={filterViewportRef}
          className={styles.filterViewport}
          data-testid="library-filter-scroll"
          data-overflow-left={filterScrollState.left || undefined}
          data-overflow-right={filterScrollState.right || undefined}
          id="library-filter-scroll"
          role="region"
          aria-label={t("library.filterAria")}
          aria-controls="library-filter-options"
          tabIndex={0}
          onPointerDown={() => { filterScrollTargetRef.current = null }}
          onTouchStart={() => { filterScrollTargetRef.current = null }}
          onWheel={() => { filterScrollTargetRef.current = null }}
          onKeyDown={handleFilterKeyDown}
          onScroll={updateFilterScrollState}
        >
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) => { if (value) updateUrlState({ filter: value as LibraryFilter }) }}
            className={styles.filters}
            id="library-filter-options"
            aria-label={t("library.filterAria")}
            aria-orientation="horizontal"
          >
            {FILTERS.map(({ value, key }) => <ToggleGroupItem key={value} value={value} className={styles.filter}>{t(key)}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <div className={styles.tools}>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <Input
              value={query}
              aria-label={t("library.search")}
              placeholder={t("library.search")}
              onChange={(event) => updateUrlState({ query: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query !== "") {
                  event.preventDefault()
                  updateUrlState({ query: "" })
                }
              }}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={styles.favorite}
            aria-label={t("library.favorites")}
            aria-pressed={favoritesOnly}
            data-state={favoritesOnly ? "on" : "off"}
            onClick={() => updateUrlState({ favoritesOnly: !favoritesOnly })}
          >
            <Star aria-hidden="true" />
          </Button>
          <ToggleGroup type="single" value={view} onValueChange={(value) => { if (value) updateUrlState({ view: value as "grid" | "list" }) }} className={styles.viewToggle} aria-label={t("library.viewAria")}>
            <ToggleGroupItem value="grid" className={styles.viewButton} aria-label={t("library.gridView")}><Grid2X2 aria-hidden="true" /></ToggleGroupItem>
            <ToggleGroupItem value="list" className={styles.viewButton} aria-label={t("library.listView")}><List aria-hidden="true" /></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {showLoading ? (
        <div className={cn(styles.stateRegion, styles.loadingRegion)} role="status" aria-label={t("library.loading")}>
          <div className={styles.loadingState} aria-hidden="true">
            {[0, 1].map((group) => (
              <section key={group} className={styles.loadingGroup} data-testid="library-loading-group">
                <div className={styles.loadingGroupHeading}>
                  <Skeleton className={styles.loadingGroupLabel} />
                  <Skeleton className={styles.loadingGroupAction} />
                </div>
                <div className={styles.loadingGrid}>
                  {[0, 1, 2].map((card) => (
                    <div key={card} className={styles.loadingCard} data-testid="library-loading-card">
                      <div className={styles.loadingCardHeader}>
                        <Skeleton className={styles.loadingIcon} />
                        <Skeleton className={styles.loadingTitle} />
                      </div>
                      <Skeleton className={styles.loadingPreview} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
      {showError ? (
        <div className={styles.stateRegion}>
          <Alert variant="destructive" className={styles.errorState}>
            <AlertDescription>
              <span>{t("library.loadError")}</span>
              <Button type="button" variant="outline" size="sm" onClick={reload}>{t("library.retry")}</Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {!showLoading && !showError && filteredArtifacts.length === 0 ? (
        <section className={styles.stateRegion} aria-labelledby="library-empty-title">
          <Empty className={styles.empty} data-testid="library-empty-state">
            <EmptyHeader>
              <EmptyMedia variant="default" className={styles.emptyMedia}><Archive aria-hidden="true" /></EmptyMedia>
              <EmptyTitle id="library-empty-title" className={styles.emptyTitle}>{emptyTitle}</EmptyTitle>
              <EmptyDescription className={styles.emptyDescription}>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                className={styles.newTask}
                onClick={canClearEmptyStateFilters ? clearFilters : () => { navigateMountedSurface("/app"); window.requestAnimationFrame(() => onPrompt("")) }}
              >
                {canClearEmptyStateFilters ? null : <SquarePen data-icon="inline-start" aria-hidden="true" />}
                {canClearEmptyStateFilters ? t("library.clearFilters") : t("library.directNewTask")}
              </Button>
            </EmptyContent>
          </Empty>
        </section>
      ) : null}
      {!showLoading && !showError && filteredArtifacts.length > 0 ? (
        <section className={view === "grid" ? styles.grid : styles.list} data-testid="library-artifacts" data-view={view} role="list" aria-label={contentLabel}>
          {filteredArtifacts.map((artifact) => {
            const kind = artifactFilter(artifact.mime, artifact.title)
            const Icon = artifactIcon(kind)
            const state = downloadState[artifact.content_hash]
            const isFavorite = favoriteHashes.has(artifact.content_hash)
            return (
              <Card key={artifact.content_hash} className={cn(styles.artifactCard, "gap-0 p-0")} role="listitem" data-artifact-type={kind}>
                <CardContent className={cn(styles.cardContent, "p-0")}>
                  <div className={styles.cardActionRow}>
                    <Button
                      type="button"
                      variant="ghost"
                      className={styles.artifactMain}
                      onClick={() => void download(artifact)}
                      disabled={state === "loading"}
                      aria-label={t(state === "error" ? "library.retryDownloadAria" : "library.downloadAria", { title: artifact.title })}
                      aria-busy={state === "loading"}
                    >
                      <span className={styles.typeIcon} aria-hidden="true"><Icon /></span>
                      <span className={styles.cardBody}>
                        <span className={styles.cardTitle}>{artifact.title}</span>
                        <span className={styles.meta}>{t(FILTERS.find((candidate) => candidate.value === kind)?.key ?? "library.filterOther")} · {formatBytes(artifact.size)} · {formatDeliveryTime(artifact.created_at, locale)}</span>
                        {state === "loading" ? <span className={styles.downloadStatus}>{t("library.downloading")}</span> : null}
                        {state === "error" ? <span className={styles.downloadError} role="alert">{t("library.downloadFailed")}</span> : null}
                      </span>
                      <Download className={styles.downloadIcon} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={styles.favoriteCard}
                      aria-label={`${t("library.favorites")}: ${artifact.title}`}
                      aria-pressed={isFavorite}
                      data-state={isFavorite ? "on" : "off"}
                      onClick={() => toggleFavorite(artifact)}
                    >
                      <Star aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
                {onOpenSession ? (
                  <CardFooter className={cn(styles.cardFooter, "p-0")}>
                    <Button type="button" variant="link" className={styles.source} onClick={() => onOpenSession(artifact.session_id)}>{t("library.openSource")}</Button>
                  </CardFooter>
                ) : null}
              </Card>
            )
          })}
        </section>
      ) : null}
      {!showLoading && !showError && showPagination ? (
        <div className={styles.pagination} data-testid="library-pagination">
          {loadMoreError ? (
            <Alert variant="destructive" className={cn(styles.errorState, styles.loadMoreError)}>
              <AlertDescription>
                <span>{t("library.loadMoreError")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {t("library.retryLoadMore")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={loadingMore} aria-busy={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? t("library.loading") : t("library.loadMore")}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
