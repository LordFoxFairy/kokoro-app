"use client"

import Image from "next/image"
import { useMemo, useRef, useState } from "react"
import { Braces, Check, ChevronDown, ChevronLeft, ChevronRight, Globe, KeyRound, Plus, Search, Server } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { APP_CONNECTORS, DATA_SOURCE_CONNECTORS, type ConnectorCatalogItem } from "@/ui/mcp/connector-catalog-data"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"

import styles from "./kokoro-plugins-surface.module.css"

const FEATURED_DESCRIPTION_KEYS: Readonly<Record<string, MessageKey>> = {
  browser: "plugins.featuredBrowserDescription",
  gmail: "plugins.featuredGmailDescription",
  notion: "plugins.featuredNotionDescription",
  meta: "plugins.featuredMetaDescription",
}

const FEATURED_SCROLL_STEP = 296
const SCROLL_EDGE_EPSILON = 1

type CatalogSectionProps = {
  title: string
  description: string
  items: readonly ConnectorCatalogItem[]
  added: ReadonlySet<string>
  onToggle: (id: string) => void
}

function ConnectorIcon({ item, featured = false }: { item: ConnectorCatalogItem; featured?: boolean }) {
  const className = featured ? styles.featuredIcon : styles.itemIcon
  return (
    <span className={className}>
      {item.iconUrl
        ? <Image src={item.iconUrl} alt={item.name} width={28} height={28} />
        : <span className={styles.iconText} role="img" aria-label={item.name}>{item.iconText ?? item.name.slice(0, 2)}</span>}
    </span>
  )
}

function CatalogSection({ title, description, items, added, onToggle }: CatalogSectionProps) {
  const t = useT()
  const [page, setPage] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  // Filtering can reduce the number of pages while this section is already
  // on a later page. Clamp the derived page instead of briefly rendering an
  // empty grid until a second state update catches up.
  const currentPage = Math.min(page, pageCount - 1)
  const visibleItems = showAll ? items : items.slice(currentPage * pageSize, currentPage * pageSize + pageSize)

  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <div><h2>{title}</h2><p>{description}</p></div>
        <div className={styles.sectionActions}>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("plugins.previous")} disabled={currentPage === 0 || showAll} onClick={() => setPage((value) => Math.max(0, Math.min(value, pageCount - 1) - 1))}><ChevronLeft /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("plugins.next")} disabled={currentPage >= pageCount - 1 || showAll} onClick={() => setPage((value) => Math.min(pageCount - 1, Math.min(value, pageCount - 1) + 1))}><ChevronRight /></Button>
          <Button type="button" variant="ghost" className={styles.viewAll} onClick={() => { setShowAll((value) => !value); setPage(0) }}>{showAll ? t("plugins.showLess") : t("plugins.viewAll")}</Button>
        </div>
      </header>
      <div className={styles.catalogGrid}>
        {visibleItems.length > 0
          ? visibleItems.map((item) => {
            const isAdded = added.has(item.id)
            return (
              <article className={styles.catalogItem} key={item.id}>
                <ConnectorIcon item={item} />
                <div className={styles.itemCopy}><strong>{item.name}</strong><p>{t(item.description)}</p></div>
                <Button type="button" variant="outline" size="icon-sm" aria-label={isAdded ? t("plugins.removeConnector", { name: item.name }) : t("plugins.addConnector", { name: item.name })} data-added={isAdded || undefined} onClick={() => onToggle(item.id)}>{isAdded ? <Check /> : <Plus />}</Button>
              </article>
            )
          })
          : <Empty className={styles.sectionEmpty} data-testid="plugins-section-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon" aria-hidden="true"><Search /></EmptyMedia>
              <EmptyTitle>{t("mcp.noMatch")}</EmptyTitle>
            </EmptyHeader>
          </Empty>}
      </div>
    </section>
  )
}

export function KokoroPluginsSurface({ onOpenSettings, onCreateMcp, onCreateCustomApi }: EmptyStateProps) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [added, setAdded] = useState<Set<string>>(() => new Set())
  const [featuredAtEnd, setFeaturedAtEnd] = useState(false)
  const createRef = useRef<HTMLButtonElement | null>(null)
  const featuredViewportRef = useRef<HTMLDivElement | null>(null)
  // Native smooth scrolling is asynchronous. Keep the last requested target
  // separately from scrollLeft so rapid clicks advance from the pending
  // position rather than repeatedly starting the same animation.
  const featuredTargetRef = useRef<number | null>(null)
  const normalized = query.trim().toLocaleLowerCase()
  const apps = useMemo(() => APP_CONNECTORS.filter((item) => normalized === ""
    || item.name.toLocaleLowerCase().includes(normalized)
    || t(item.description).toLocaleLowerCase().includes(normalized)), [normalized, t])
  const sources = useMemo(() => DATA_SOURCE_CONNECTORS.filter((item) => normalized === ""
    || item.name.toLocaleLowerCase().includes(normalized)
    || t(item.description).toLocaleLowerCase().includes(normalized)), [normalized, t])
  const featuredIds = ["browser", "gmail", "notion", "meta"]
  const featured = featuredIds.flatMap((id) => APP_CONNECTORS.find((item) => item.id === id) ?? [])
  const setFeaturedPosition = (viewport: HTMLDivElement, position: number, max: number) => {
    const next = Math.max(0, Math.min(max, position))
    featuredTargetRef.current = next
    setFeaturedAtEnd(max === 0 || next >= max - SCROLL_EDGE_EPSILON)
    viewport.scrollTo({ left: next, behavior: "smooth" })
  }
  const scrollFeatured = (direction: "forward" | "backward", wrapAtEnd = false) => {
    const viewport = featuredViewportRef.current
    if (!viewport) return
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const base = featuredTargetRef.current ?? viewport.scrollLeft
    const atEnd = max === 0 || base >= max - SCROLL_EDGE_EPSILON
    const next = direction === "backward"
      ? (wrapAtEnd && atEnd ? 0 : base - FEATURED_SCROLL_STEP)
      : (wrapAtEnd && atEnd ? 0 : base + FEATURED_SCROLL_STEP)
    setFeaturedPosition(viewport, next, max)
  }
  const handleFeaturedButtonClick = () => {
    const viewport = featuredViewportRef.current
    if (!viewport) return
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const base = featuredTargetRef.current ?? viewport.scrollLeft
    const atEnd = max === 0 || base >= max - SCROLL_EDGE_EPSILON
    scrollFeatured(atEnd ? "backward" : "forward", true)
  }
  const cancelFeaturedTarget = () => {
    featuredTargetRef.current = null
  }
  const handleFeaturedKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") {
      event.preventDefault()
      cancelFeaturedTarget()
      const viewport = featuredViewportRef.current
      if (!viewport) return
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      if (event.key === "Home") setFeaturedPosition(viewport, 0, max)
      else if (event.key === "End") setFeaturedPosition(viewport, max, max)
      else scrollFeatured(event.key === "ArrowRight" ? "forward" : "backward")
    }
  }
  const toggle = (id: string) => setAdded((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <div className={styles.page} data-testid="plugins-page">
      <header className={styles.pageHeader}>
        <h1>{t("rail.navPlugins")}</h1>
        <div>
          <Button type="button" variant="ghost" className={styles.manageAction} onClick={(event) => onOpenSettings?.("mcp", event.currentTarget)}>{t("plugins.manageConnectors")}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button ref={createRef} type="button" variant="ghost" className={styles.createAction}>{t("plugins.create")}<ChevronDown /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className={styles.createMenu}>
              <DropdownMenuLabel className={styles.createMenuLabel}>{t("connectorCatalog.title")}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onCreateCustomApi?.(createRef.current)}><span className={styles.createMenuIcon}><KeyRound aria-hidden="true" /></span>{t("connectorCatalog.customApi")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreateMcp?.("form", createRef.current)}><span className={styles.createMenuIcon}><Server aria-hidden="true" /></span>{t("connectorCatalog.customMcp")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreateMcp?.("json", createRef.current)}><span className={styles.createMenuIcon}><Braces aria-hidden="true" /></span>{t("connectorCatalog.importMcpJson")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreateMcp?.("url", createRef.current)}>
                <span className={styles.createMenuIcon}><Globe aria-hidden="true" /></span>
                <span className={styles.createMenuCopy}>{t("connectorCatalog.addMcpUrl")}<span className={styles.betaBadge}>{t("connectorCatalog.beta")}</span></span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.featuredCarousel}>
          <div
            ref={featuredViewportRef}
            className={styles.featuredViewport}
            id="plugins-featured-carousel"
            data-testid="plugins-featured-viewport"
            role="region"
            aria-label={t("plugins.connectors")}
            aria-roledescription="carousel"
            tabIndex={0}
            onPointerDown={cancelFeaturedTarget}
            onTouchStart={cancelFeaturedTarget}
            onWheel={cancelFeaturedTarget}
            onKeyDown={handleFeaturedKeyDown}
            onScroll={(event) => {
              const viewport = event.currentTarget
              const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
              setFeaturedAtEnd(max === 0 || viewport.scrollLeft >= max - SCROLL_EDGE_EPSILON)
            }}
          >
            <div className={styles.featuredTrack}>
              {featured.map((item) => <article className={styles.featuredCard} key={item.id}><ConnectorIcon item={item} featured /><p>{t(FEATURED_DESCRIPTION_KEYS[item.id] ?? item.description)}</p></article>)}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={styles.featuredScroll}
            aria-label={t(featuredAtEnd ? "plugins.scrollBackward" : "plugins.scrollForward")}
            aria-controls="plugins-featured-carousel"
            onClick={handleFeaturedButtonClick}
          >
            {featuredAtEnd ? <ChevronLeft /> : <ChevronRight />}
          </Button>
        </div>

        <label className={styles.search}><Search aria-hidden="true" /><Input type="search" value={query} aria-label={t("plugins.search")} placeholder={t("plugins.search")} onChange={(event) => setQuery(event.target.value)} /></label>

        {apps.length === 0 && sources.length === 0
          ? <Empty className={styles.noResults} data-testid="plugins-no-results">
            <EmptyHeader>
              <EmptyMedia variant="icon" aria-hidden="true"><Search /></EmptyMedia>
              <EmptyTitle>{t("mcp.noMatch")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
          : <>
            <CatalogSection title={t("plugins.connectors")} description={t("plugins.connectorsDescription")} items={apps} added={added} onToggle={toggle} />
            <CatalogSection title={t("plugins.dataSources")} description={t("plugins.dataSourcesDescription")} items={sources} added={added} onToggle={toggle} />
          </>}
      </div>
    </div>
  )
}
