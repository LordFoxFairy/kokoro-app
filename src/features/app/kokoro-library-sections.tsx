import { Archive, Download, Grid2X2, List, Search, SquarePen, Star } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ArtifactRecord } from "@/contract/http"
import { useLocale, useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"
import { formatBytes } from "@/ui/thread/artifact-card"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"

import { artifactFilter, artifactIcon, FILTERS, type LibraryFilter, type LibraryUrlState } from "./kokoro-library-model"
import styles from "./kokoro-library-surface.module.css"

const FILTER_SCROLL_STEP = 192
const SCROLL_EDGE_EPSILON = 1

type ToolbarProps = {
  filter: LibraryFilter
  query: string
  view: LibraryUrlState["view"]
  favoritesOnly: boolean
  updateUrlState: (patch: Partial<LibraryUrlState>) => void
}

export function LibraryToolbar({ filter, query, view, favoritesOnly, updateUrlState }: ToolbarProps) {
  const t = useT()
  const [filterScrollState, setFilterScrollState] = useState({ left: false, right: false })
  const filterViewportRef = useRef<HTMLDivElement | null>(null)
  const filterScrollTargetRef = useRef<number | null>(null)

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
    if (event.target !== event.currentTarget) return
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    if (event.key === "Home") setFilterScrollPosition(0)
    else if (event.key === "End") {
      const viewport = filterViewportRef.current
      setFilterScrollPosition(viewport ? viewport.scrollWidth - viewport.clientWidth : 0)
    } else scrollFilters(event.key === "ArrowRight" ? "forward" : "backward")
  }, [scrollFilters, setFilterScrollPosition])

  useResizeObserver(filterViewportRef, updateFilterScrollState)

  return (
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
        <ToggleGroup type="single" value={filter} onValueChange={(value) => { if (value) updateUrlState({ filter: value as LibraryFilter }) }} className={styles.filters} id="library-filter-options" aria-label={t("library.filterAria")} aria-orientation="horizontal">
          {FILTERS.map(({ value, key }) => <ToggleGroupItem key={value} value={value} className={styles.filter}>{t(key)}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <div className={styles.tools}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <Input value={query} aria-label={t("library.search")} placeholder={t("library.search")} onChange={(event) => updateUrlState({ query: event.target.value })} onKeyDown={(event) => {
            if (event.key === "Escape" && query !== "") { event.preventDefault(); updateUrlState({ query: "" }) }
          }} />
        </label>
        <Button type="button" variant="outline" size="icon-sm" className={styles.favorite} aria-label={t("library.favorites")} aria-pressed={favoritesOnly} data-state={favoritesOnly ? "on" : "off"} onClick={() => updateUrlState({ favoritesOnly: !favoritesOnly })}>
          <Star aria-hidden="true" />
        </Button>
        <ToggleGroup type="single" value={view} onValueChange={(value) => { if (value) updateUrlState({ view: value as LibraryUrlState["view"] }) }} className={styles.viewToggle} aria-label={t("library.viewAria")}>
          <ToggleGroupItem value="grid" className={styles.viewButton} aria-label={t("library.gridView")}><Grid2X2 aria-hidden="true" /></ToggleGroupItem>
          <ToggleGroupItem value="list" className={styles.viewButton} aria-label={t("library.listView")}><List aria-hidden="true" /></ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}

type ResultsProps = {
  onPrompt?: EmptyStateProps["onPrompt"]
  onOpenSession?: EmptyStateProps["onOpenSession"]
  artifacts: readonly ArtifactRecord[]
  filteredArtifacts: readonly ArtifactRecord[]
  view: LibraryUrlState["view"]
  favoritesOnly: boolean
  favoriteHashes: ReadonlySet<string>
  hasActiveContentFilter: boolean
  downloadState: Record<string, "loading" | "error">
  toggleFavorite: (artifact: ArtifactRecord) => void
  download: (artifact: ArtifactRecord) => Promise<void>
  showLoading: boolean
  showError: boolean
  showPagination: boolean
  loadMoreError: boolean
  loadingMore: boolean
  reload: () => void
  loadMore: () => Promise<void>
  clearFilters: () => void
}

export function LibraryResults({ artifacts, filteredArtifacts, view, favoritesOnly, favoriteHashes, hasActiveContentFilter, downloadState, toggleFavorite, download, showLoading, showError, showPagination, loadMoreError, loadingMore, reload, loadMore, clearFilters, onPrompt, onOpenSession }: ResultsProps) {
  const t = useT()
  const { locale } = useLocale()
  const noMatch = artifacts.length > 0 && filteredArtifacts.length === 0 && hasActiveContentFilter
  const canClearEmptyStateFilters = noMatch || favoritesOnly
  const emptyTitle = noMatch ? t("library.noMatchTitle") : favoritesOnly ? t("library.noFavoritesTitle") : t("library.directEmptyTitle")
  const emptyDescription = noMatch ? t("library.noMatchDescription") : t("library.directEmptyDescription")
  const contentLabel = filteredArtifacts.length > 0 ? t("library.title") : emptyTitle

  return <>
    {showLoading ? <div className={cn(styles.stateRegion, styles.loadingRegion)} role="status" aria-label={t("library.loading")}><div className={styles.loadingState} aria-hidden="true">{[0, 1].map((group) => <section key={group} className={styles.loadingGroup} data-testid="library-loading-group"><div className={styles.loadingGroupHeading}><Skeleton className={styles.loadingGroupLabel} /><Skeleton className={styles.loadingGroupAction} /></div><div className={styles.loadingGrid}>{[0, 1, 2].map((card) => <div key={card} className={styles.loadingCard} data-testid="library-loading-card"><div className={styles.loadingCardHeader}><Skeleton className={styles.loadingIcon} /><Skeleton className={styles.loadingTitle} /></div><Skeleton className={styles.loadingPreview} /></div>)}</div></section>)}</div></div> : null}
    {showError ? <div className={styles.stateRegion}><Alert variant="destructive" className={styles.errorState}><AlertDescription><span>{t("library.loadError")}</span><Button type="button" variant="outline" size="sm" onClick={reload}>{t("library.retry")}</Button></AlertDescription></Alert></div> : null}
    {!showLoading && !showError && filteredArtifacts.length === 0 ? <section className={styles.stateRegion} aria-labelledby="library-empty-title"><Empty className={styles.empty} data-testid="library-empty-state"><EmptyHeader><EmptyMedia variant="default" className={styles.emptyMedia}><Archive aria-hidden="true" /></EmptyMedia><EmptyTitle id="library-empty-title" className={styles.emptyTitle}>{emptyTitle}</EmptyTitle><EmptyDescription className={styles.emptyDescription}>{emptyDescription}</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" className={styles.newTask} onClick={canClearEmptyStateFilters ? clearFilters : () => { navigateMountedSurface("/app"); window.requestAnimationFrame(() => onPrompt?.("")) }}>{canClearEmptyStateFilters ? null : <SquarePen data-icon="inline-start" aria-hidden="true" />}{canClearEmptyStateFilters ? t("library.clearFilters") : t("library.directNewTask")}</Button></EmptyContent></Empty></section> : null}
    {!showLoading && !showError && filteredArtifacts.length > 0 ? <section className={view === "grid" ? styles.grid : styles.list} data-testid="library-artifacts" data-view={view} role="list" aria-label={contentLabel}>{filteredArtifacts.map((artifact) => { const kind = artifactFilter(artifact.mime, artifact.title); const Icon = artifactIcon(kind); const state = downloadState[artifact.content_hash]; const isFavorite = favoriteHashes.has(artifact.content_hash); return <Card key={artifact.content_hash} className={cn(styles.artifactCard, "gap-0 p-0")} role="listitem" data-artifact-type={kind}><CardContent className={cn(styles.cardContent, "p-0")}><div className={styles.cardActionRow}><Button type="button" variant="ghost" className={styles.artifactMain} onClick={() => void download(artifact)} disabled={state === "loading"} aria-label={t(state === "error" ? "library.retryDownloadAria" : "library.downloadAria", { title: artifact.title })} aria-busy={state === "loading"}><span className={styles.typeIcon} aria-hidden="true"><Icon /></span><span className={styles.cardBody}><span className={styles.cardTitle}>{artifact.title}</span><span className={styles.meta}>{t(FILTERS.find((candidate) => candidate.value === kind)?.key ?? "library.filterOther")} · {formatBytes(artifact.size)} · {formatDeliveryTime(artifact.created_at, locale)}</span>{state === "loading" ? <span className={styles.downloadStatus}>{t("library.downloading")}</span> : null}{state === "error" ? <span className={styles.downloadError} role="alert">{t("library.downloadFailed")}</span> : null}</span><Download className={styles.downloadIcon} aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon-sm" className={styles.favoriteCard} aria-label={`${t("library.favorites")}: ${artifact.title}`} aria-pressed={isFavorite} data-state={isFavorite ? "on" : "off"} onClick={() => toggleFavorite(artifact)}><Star aria-hidden="true" /></Button></div></CardContent>{onOpenSession ? <CardFooter className={cn(styles.cardFooter, "p-0")}><Button type="button" variant="link" className={styles.source} onClick={() => onOpenSession(artifact.session_id)}>{t("library.openSource")}</Button></CardFooter> : null}</Card> })}</section> : null}
    {!showLoading && !showError && showPagination ? <div className={styles.pagination} data-testid="library-pagination">{loadMoreError ? <Alert variant="destructive" className={cn(styles.errorState, styles.loadMoreError)}><AlertDescription><span>{t("library.loadMoreError")}</span><Button type="button" variant="outline" size="sm" disabled={loadingMore} aria-busy={loadingMore} onClick={() => void loadMore()}>{t("library.retryLoadMore")}</Button></AlertDescription></Alert> : <Button type="button" variant="outline" size="sm" disabled={loadingMore} aria-busy={loadingMore} onClick={() => void loadMore()}>{loadingMore ? t("library.loading") : t("library.loadMore")}</Button>}</div> : null}
  </>
}

function useResizeObserver(ref: React.RefObject<HTMLElement | null>, callback: () => void): void {
  useEffect(() => {
    const viewport = ref.current
    if (!viewport) return
    callback()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(callback)
    observer?.observe(viewport)
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild)
    return () => observer?.disconnect()
  }, [callback, ref])
}
