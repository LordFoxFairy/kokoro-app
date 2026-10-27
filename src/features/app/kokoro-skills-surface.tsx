"use client"

import type { GithubImported } from "@/ui/skills/personal-skill-github-import-flow"

import Image from "next/image"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, CircleDot, ChevronDown, ListFilterPlus, LoaderCircle, Plus, Search, SquarePen, Upload, X } from "lucide-react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { SkillCatalog, SkillCatalogCard, CatalogSkillCategory } from "@/hub/schemas"
import { browserHubClient } from "@/ui/shell/page-clients"
import { invalidate, useResource } from "@/lib/query"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"
import { cn } from "@/lib/utils"
import { GithubImportDialog } from "@/ui/skills/github-import-dialog"
import { SkillUploadDialog } from "@/ui/skills/skill-upload-dialog"
import { mergeSkillCatalogPages } from "@/ui/skills/skills-pool-model"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import { createManusSkillHubClient, SKILL_CATALOG_RESOURCE_KEY } from "@/ui/skills/manus-skill-client"
import { skillResourceKey } from "@/ui/skills/skills-resource-cache"
import { SkillCoverMedia } from "@/ui/skills/skill-cover-media"
import { stashPendingDraft } from "@/ui/shell/use-draft"
import { toSkillActionCard } from "@/ui/skills/skills-card-model"
import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"

import styles from "./kokoro-skills-surface.module.css"
import { useCatalogSkillInstallation } from "./use-catalog-skill-installation"

type SkillCategory = "all" | CatalogSkillCategory

const CATEGORIES: readonly { value: SkillCategory; key: MessageKey }[] = [
  { value: "all", key: "skills.categoryAll" },
  { value: "coding", key: "skills.categoryCoding" },
  { value: "data", key: "skills.categoryData" },
  { value: "automation", key: "skills.categoryAutomation" },
  { value: "business", key: "skills.categoryBusiness" },
  { value: "design", key: "skills.categoryDesign" },
  { value: "media", key: "skills.categoryMedia" },
  { value: "content", key: "skills.categoryContent" },
  { value: "apps", key: "skills.categoryApps" },
]

const actionIdentity = (skill: Pick<SkillCatalogCard, "skill_id" | "revision_skill_id" | "scope" | "name" | "content_hash">) => JSON.stringify([
  skill.skill_id ?? `${skill.scope}:${skill.name}`,
  skill.revision_skill_id ?? skill.content_hash,
])


function skillCategories(skill: Pick<SkillCatalogCard, "categories">): Exclude<SkillCategory, "all">[] {
  return [...new Set(skill.categories ?? [])]
}

function formatUsage(value: string): string {
  const count = BigInt(value)
  if (count < BigInt(1000)) return value
  const compact = Number(count) / 1000
  return `${compact >= 100 ? Math.round(compact) : compact.toFixed(1).replace(/\.0$/u, "")}k`
}

type KokoroSkillsSurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "brandName" | "onOpenSettings" | "onCreateSkillWithAi" | "onTrySkill" | "projectReadBoundary">

export function KokoroSkillsSurface(props: KokoroSkillsSurfaceProps) {
  const boundary = props.projectReadBoundary
  return <PreviewKokoroSkillsSurface key={JSON.stringify([props.preview ?? true, boundary?.subject ?? null])} {...props} />
}

function PreviewKokoroSkillsSurface({ preview = true, onPrompt, brandName = "Kokoro", onOpenSettings, onCreateSkillWithAi, onTrySkill, projectReadBoundary }: KokoroSkillsSurfaceProps) {
  const t = useT()
  const readBoundary = useMemo(() => projectReadBoundary ?? { admitted: preview, subject: preview ? "preview" : null, generation: 0 }, [preview, projectReadBoundary])
  const publisherLabel = (skill: Pick<SkillCatalogCard, "scope">) => skill.scope === "official" ? brandName : skill.scope === "third_party" ? t("skills.community") : undefined
  const categoryLabel = (value: CatalogSkillCategory) => t(CATEGORIES.find((item) => item.value === value)?.key ?? "skills.categoryCoding")
  // The standalone page and the embedded Settings page must consume the same
  // owner-backed Skills projection.  The generic Hub client still addresses
  // the retired `/self/skills/catalog` route, which the BFF deliberately
  // rejects; leaving it here made the outer Skills page fail while Settings
  // appeared healthy.  Keep one typed read adapter for both entry points so
  // a tab switch never turns into a different data contract or an error card.
  const client = useMemo(
    () => preview ? browserHubClient({ preview }) : createManusSkillHubClient(browserHubClient({ preview }), readBoundary),
    [preview, readBoundary],
  )
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<SkillCategory>("all")
  const [compactCategories, setCompactCategories] = useState(false)
  const categoryNavRef = useRef<HTMLElement | null>(null)
  const categoryMeasureRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const nav = categoryNavRef.current
    const labels = categoryMeasureRef.current
    if (!nav || !labels) return
    let available = nav.getBoundingClientRect().width
    let required = labels.getBoundingClientRect().width
    const update = () => {
      if (available > 0 && required > 0) setCompactCategories(required > available)
    }
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === nav) available = entry.contentRect.width
        if (entry.target === labels) required = entry.contentRect.width
      }
      update()
    })
    observer.observe(nav)
    observer.observe(labels)
    update()
    return () => observer.disconnect()
  }, [])
  const [committedQuery, setCommittedQuery] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setCommittedQuery(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  const catalogFilters = useMemo(() => ({
    pageSize: 9,
    ...(committedQuery ? { query: committedQuery } : {}),
    ...(category === "all" ? {} : { category }),
  }), [category, committedQuery])
  // Paging policy belongs to this surface, not the shared client. Keep its
  // nine-card random first page separate from other consumers' cached pages.
  const catalogNamespace = skillResourceKey(SKILL_CATALOG_RESOURCE_KEY, client)
  const catalogKey = skillResourceKey(SKILL_CATALOG_RESOURCE_KEY, client,
    JSON.stringify(["marketplace", 9, committedQuery, category]))
  const resource = useResource<SkillCatalog>(
    catalogKey,
    useCallback(() => client.listSkillCatalog({
      ...catalogFilters,
      ...(catalogFilters.query === undefined && catalogFilters.category === undefined ? { shuffle: true } : {}),
    }), [catalogFilters, client]),
    { revalidateOnSubscribe: false },
  )
  const catalog = readBoundary.admitted && readBoundary.subject !== null ? resource : { ...resource, data: undefined, error: undefined, loading: true }
  const [pageState, setPageState] = useState<Readonly<{ base: SkillCatalog | undefined; pages: readonly SkillCatalog[] }>>({ base: undefined, pages: [] })
  const [loadingMoreFor, setLoadingMoreFor] = useState<{ base: SkillCatalog; controller: AbortController }>()
  const [loadMoreFailedFor, setLoadMoreFailedFor] = useState<SkillCatalog | undefined>()
  const loadingMoreRef = useRef<{ controller: AbortController } | null>(null)
  useEffect(() => () => {
    loadingMoreRef.current?.controller.abort()
    loadingMoreRef.current = null
  }, [catalogKey, catalog.data])
  const [githubOpen, setGithubOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const setDetailSkill = useCallback((skill: SkillCatalogCard | null) => setDetailKey(skill ? actionIdentity(skill) : null), [])
  const [notice, setNotice] = useState<{ catalogKey: string; value: GithubImported } | null>(null)
  const importNotice = notice?.catalogKey === catalogKey ? notice.value : null
  const { busy, errorName, lastAddedSkill, installationFacts, setEnabled, isCurrent } = useCatalogSkillInstallation(readBoundary, catalog.data, catalogNamespace, actionIdentity)
  const createRef = useRef<HTMLButtonElement | null>(null)
  const githubRef = useRef<HTMLElement | null>(null)
  const uploadRef = useRef<HTMLElement | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  useLayoutEffect(() => { if (detailKey && !detailRef.current?.isConnected) detailRef.current = searchRef.current }, [catalog.data, detailKey])

  // Manus lists a single cursor page on entry. Pages are tied to the exact
  // first-page snapshot, so a background refresh immediately ignores old
  // append state instead of flashing it while an effect resets local state.
  const additionalPages = useMemo(() => pageState.base === catalog.data ? pageState.pages : [], [catalog.data, pageState])
  const freshCatalog = useMemo(() => catalog.data === undefined ? undefined : mergeSkillCatalogPages([catalog.data, ...additionalPages]), [additionalPages, catalog.data])
  // Retain this admitted client's confirmed cursor pages during a filter
  // read, keeping matching triggers mounted. Commands and detail facts
  // still require the fresh catalog below.
  const [confirmedCatalog, setConfirmedCatalog] = useState<{ client: typeof client; data: SkillCatalog } | null>(null)
  if (freshCatalog !== undefined && (confirmedCatalog?.client !== client || confirmedCatalog.data !== freshCatalog)) setConfirmedCatalog({ client, data: freshCatalog })
  const displayedCatalog = freshCatalog ?? (readBoundary.admitted && readBoundary.subject !== null && confirmedCatalog?.client === client ? confirmedCatalog.data : undefined)
  const loadingMore = loadingMoreFor !== undefined && loadingMoreFor.base === catalog.data && !loadingMoreFor.controller.signal.aborted
  const loadMoreFailed = loadMoreFailedFor !== undefined && loadMoreFailedFor === catalog.data
  const loadMore = useCallback(async () => {
    const cursor = displayedCatalog?.next_cursor
    const base = catalog.data
    if (!cursor || base === undefined || loadingMoreRef.current !== null) return
    const pending = { base, controller: new AbortController() }
    loadingMoreRef.current = pending
    setLoadingMoreFor(pending)
    setLoadMoreFailedFor(undefined)
    try {
      const page = await client.listSkillCatalog({ ...catalogFilters, cursor, signal: pending.controller.signal })
      if (pending.controller.signal.aborted) return
      if (page.next_cursor === cursor) throw new Error("skill catalog cursor did not advance")
      setPageState((current) => ({ base, pages: current.base === base ? [...current.pages, page] : [page] }))
    } catch {
      if (!pending.controller.signal.aborted) setLoadMoreFailedFor(base)
    } finally {
      if (loadingMoreRef.current === pending) {
        loadingMoreRef.current = null
        setLoadingMoreFor(undefined)
      }
    }
  }, [catalog.data, catalogFilters, client, displayedCatalog?.next_cursor])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return (displayedCatalog?.skills ?? []).map((skill) => {
      const facts = skill.skill_id === undefined ? undefined : installationFacts[skill.skill_id]
      return facts === undefined || facts.catalog !== catalog.data ? skill : { ...skill, installed: facts.installed, enabled: facts.enabled, installed_source_ref: facts.installed_source_ref }
    }).filter((skill) => {
      const matchesCategory = category === "all" || skillCategories(skill).includes(category)
      const matchesQuery = normalized === ""
        || skill.name.toLocaleLowerCase().includes(normalized)
        || skill.description.toLocaleLowerCase().includes(normalized)
      // Confirmed live results come from the owner query. Only preview and
      // retained cards awaiting the new query use local matching.
      return (!preview && catalog.data !== undefined) || (matchesCategory && matchesQuery)
    })
  }, [catalog.data, category, displayedCatalog?.skills, installationFacts, preview, query])

  const startChat = useCallback((prompt: string) => {
    // When the catalog is mounted inside the app shell, hand the prompt to
    // the shared Composer first. Writing only the pending-draft key leaves an
    // active conversation looking empty because its draft is keyed by id.
    if (onPrompt) {
      onPrompt(prompt)
    } else if (typeof window !== "undefined") {
      // The standalone/SSR fallback has no Composer callback, so preserve the
      // prompt across the route transition using the existing draft store.
      stashPendingDraft(prompt)
    }
    if (typeof window !== "undefined") {
      navigateMountedSurface("/app")
      // The mounted AppFrame owns the draft controller. The navigation event
      // commits the chat surface synchronously; no full document reload or
      // loading gate is needed for a Try action from the catalog.
    } else {
      onPrompt?.(prompt)
    }
  }, [onPrompt])

  const handleImported = (result: GithubImported) => {
    if (!isCurrent()) return
    setNotice({ catalogKey, value: result })
    invalidate(catalogNamespace)
  }


  // Keep the selected revision/reader context, but use exactly the same
  // current installation facts for both presentation and action execution.
  const detailSkill = catalog.data === undefined ? null : displayedCatalog?.skills.find(skill => actionIdentity(skill) === detailKey) ?? null
  const currentDetailSkill = detailSkill === null ? null : (() => {
    const facts = detailSkill.skill_id === undefined ? undefined : installationFacts[detailSkill.skill_id]
    return facts !== undefined && facts.catalog === catalog.data ? { ...detailSkill, installed: facts.installed, enabled: facts.enabled, installed_source_ref: facts.installed_source_ref } : detailSkill
  })()
  const detailPublisher = currentDetailSkill === null ? undefined : publisherLabel(currentDetailSkill)

  return (
    <div className={styles.surface} data-testid="skills-surface" data-web-skin="kokoro">
      <header className={styles.header}>
        <h1>{t("skills.title")}</h1>
        <div className={styles.headerTools}>
          <label className={styles.searchField}>
            <Search aria-hidden="true" />
            <Input ref={searchRef} type="search" value={query} aria-label={t("skills.searchPlaceholder")} placeholder={t("skills.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
            {query ? <Button type="button" variant="ghost" size="icon-xs" aria-label={t("skills.clearSearch")} onClick={() => setQuery("")}><X aria-hidden="true" /></Button> : null}
          </label>
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="outline"
              className={styles.mySkillsButton}
              onClick={(event) => onOpenSettings?.("skills", event.currentTarget, { skillsScope: "personal" })}
            >{t("skills.mySkills")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={createRef} type="button" variant="outline" className={styles.createButton}>{t("skills.createMarketplace")}<ChevronDown aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={styles.createMenu}>
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => onCreateSkillWithAi ? onCreateSkillWithAi() : startChat(t("skills.createPrompt"))}><span className={styles.createMenuIcon}><SquarePen aria-hidden="true" /></span>{t("skills.createWithBrand", { brand: brandName })}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onCreateSkillWithAi ? onCreateSkillWithAi(t("skills.recordPrompt")) : startChat(t("skills.recordPrompt"))}><span className={styles.createMenuIcon}><CircleDot aria-hidden="true" /></span>{t("skills.recordSkill")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { uploadRef.current = createRef.current; setUploadOpen(true) }}><span className={styles.createMenuIcon}><Upload aria-hidden="true" /></span>{t("skills.uploadSkill")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { githubRef.current = createRef.current; setGithubOpen(true) }}><span className={styles.createMenuIcon}><Image src="/assets/connectors/github.webp" alt="" width={16} height={16} /></span>{t("skills.importGithub")}</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className={styles.scroller}>
        {lastAddedSkill ? (
          <span className="sr-only" role="status" aria-live="polite" data-testid="skills-action-status">
            {t("skills.added")} {lastAddedSkill}
          </span>
        ) : null}
        <div className={styles.content}>
          <nav ref={categoryNavRef} className={styles.categoryFilter} aria-label={t("skills.categoryAria")}>
            {/* Measure labels, not a second hidden set of interactive controls.
                The current locale and available canvas decide which one UI fits. */}
            <div className={styles.categoryMeasurement} aria-hidden="true"><div ref={categoryMeasureRef} className={styles.categoryMeasureRow}>{CATEGORIES.map(({ value, key }) => <span key={value}>{t(key)}</span>)}</div></div>
            {compactCategories ? <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" className={styles.categoryTrigger}><ListFilterPlus aria-hidden="true" /><span>{t(CATEGORIES.find(item => item.value === category)!.key)}</span><ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={styles.categoryMenu} aria-label={t("skills.categoryAria")}>
                <DropdownMenuRadioGroup value={category} onValueChange={value => {
                  const selected = CATEGORIES.find(item => item.value === value)
                  if (selected) setCategory(selected.value)
                }}>
                  {CATEGORIES.map(({ value, key }) => <DropdownMenuRadioItem className={styles.categoryMenuItem} key={value} value={value}>{t(key)}{category === value ? <Check aria-hidden="true" /> : null}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu> : <div className={styles.compactCategoryTabs} role="group" aria-label={t("skills.categoryAria")}>
              {CATEGORIES.map(({ value, key }) => (
                <button
                  key={value}
                  type="button"
                  data-active={category === value || undefined}
                  aria-pressed={category === value}
                  onClick={() => setCategory(value)}
                >
                  {t(key)}
                </button>
              ))}
            </div>}
          </nav>

          {importNotice ? (
            <Alert className={styles.importNotice} role="status" aria-live="polite">
              <AlertDescription>{t("skills.githubImportNotice", { name: importNotice.name })}<span>{importNotice.repository}</span></AlertDescription>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.dismissImportNotice")} onClick={() => setNotice(null)}><X aria-hidden="true" /></Button>
            </Alert>
          ) : null}

          {displayedCatalog !== undefined && catalog.error !== undefined ? <span className="sr-only" role="status">{t("skills.loadError")}</span> : null}
          {displayedCatalog === undefined || catalog.data === undefined && filtered.length === 0 ? (
            <div className={styles.grid} data-testid="skills-catalog-grid" aria-busy={catalog.loading || undefined}>
              <span className="sr-only" role="status">{t(catalog.error === undefined ? "skills.loading" : "skills.loadError")}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState} data-testid="skills-catalog-empty">
              <Search aria-hidden="true" />
              {displayedCatalog?.skills.length === 0 && query.trim() === "" && category === "all" ? (
                <>
                  <p>{t("skills.empty")}</p>
                  <span>{t("skills.emptyGuide")}</span>
                </>
              ) : (
                <p>{t("skills.noMatch")}</p>
              )}
            </div>
          ) : (
            <>
              <div className={styles.grid} data-testid="skills-catalog-grid">
                {filtered.map((skill) => {
                const stateKey = actionIdentity(skill)
                const enabled = skill.enabled
                const installed = skill.installed
                const actionPending = busy === stateKey
                const categoryValues = skillCategories(skill)
                const publisher = publisherLabel(skill)
                return (
                  <Card
                    className={styles.card}
                    key={stateKey}
                    onClick={(event) => {
                      // The reference directory opens its preview from the
                      // card surface. Keep the explicit artwork/title/add
                      // controls independent so their native semantics and
                      // focus order are unchanged.
                      if (event.target instanceof Element && event.target.closest("button")) return
                      detailRef.current = event.currentTarget
                      setDetailSkill(skill)
                    }}
                  >
                    <button type="button" className={styles.cardArt} onClick={(event) => { detailRef.current = event.currentTarget; setDetailSkill(skill) }} aria-label={`${t("skills.viewDetails")} ${skill.name}`}>
                      <span className={styles.bookCover}>
                        <SkillCoverMedia src={skill.cover_image} identity={skillResourceKey("hub/skills/cover", client)} sizes="(max-width: 42rem) 7.5rem, 7.5rem" fallback={<span className={styles.coverUnavailable} aria-hidden="true"><BrandFallback /></span>} />
                      </span>
                    </button>
                    <CardContent className={styles.cardBody}>
                      <button ref={element => { if (stateKey === detailKey && element) detailRef.current = element }} type="button" className={styles.cardTitle} onClick={(event) => { detailRef.current = event.currentTarget; setDetailSkill(skill) }}>{skill.name}</button>
                      <p className={styles.cardDescription}>{skill.description}</p>
                      <div className={styles.cardMeta}>
                        {publisher === undefined ? null : <span className={cn(styles.metaPill, styles.owner)}><BrandFallback aria-hidden="true" /><span>{publisher}</span></span>}
                        {categoryValues.map((value) => <span className={styles.metaPill} key={value}>{categoryLabel(value)}</span>)}
                      </div>
                      <div className={styles.cardFooter}>
                        {skill.usage_count === undefined ? <span /> : <span>{t("skills.usedCount", { count: formatUsage(skill.usage_count) })}</span>}
                        <Button type="button" variant="outline" size="icon-sm" aria-label={`${installed && enabled ? t("skills.added") : t("skills.add")} ${skill.name}`} data-installed={installed || undefined} disabled={catalog.data === undefined || actionPending || (installed && enabled)} aria-busy={actionPending} onClick={() => void setEnabled(skill)}>
                          {actionPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : installed && enabled ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                        </Button>
                      </div>
                      {errorName === stateKey ? <p className={styles.cardError} role="alert">{t("skills.addError")}</p> : null}
                    </CardContent>
                  </Card>
                )
                })}
              </div>
              {displayedCatalog?.next_cursor ? (
                <div className={styles.loadMore}>
                  {loadMoreFailed ? <span className="sr-only" role="status">{t("skills.loadError")}</span> : null}
                  <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={catalog.data === undefined || loadingMore} aria-busy={loadingMore}>
                    {t("rail.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>

      <GithubImportDialog readBoundary={readBoundary} open={githubOpen} onOpenChange={setGithubOpen} returnFocusRef={githubRef} onImported={handleImported} />
      <SkillUploadDialog readBoundary={readBoundary} open={uploadOpen} onOpenChange={setUploadOpen} returnFocusRef={uploadRef} onPublished={() => { if (isCurrent()) invalidate(catalogNamespace) }} />
      <ManusSkillDetailDialog
        preview={preview}
        readBoundary={readBoundary}
        key={detailKey ?? "closed"}
        skill={currentDetailSkill}
        {...(detailPublisher === undefined ? {} : { publisherLabel: detailPublisher })}
        categoryLabels={detailSkill === null ? [] : skillCategories(detailSkill).map(categoryLabel)}
        open={detailKey !== null}
        pending={detailKey !== null && currentDetailSkill === null}
        pendingFailed={loadMoreFailed || catalog.error !== undefined || catalog.data !== undefined && !displayedCatalog?.next_cursor}
        pendingBusy={catalog.loading || loadingMore}
        onRetryPending={readBoundary.admitted && readBoundary.subject !== null ? catalog.refetch : undefined}
        {...(displayedCatalog?.next_cursor ? { onLoadMore: () => void loadMore() } : {})}
        busy={detailSkill !== null && busy === actionIdentity(detailSkill)}
        {...(currentDetailSkill === null ? {} : { installationState: { installed: currentDetailSkill.installed, enabled: currentDetailSkill.enabled } })}
        actionFailed={detailSkill !== null && errorName === actionIdentity(detailSkill)}
        onOpenChange={(open) => { if (!open) setDetailKey(current => current === detailKey ? null : current) }}
        returnFocusRef={detailRef}
        onAdd={(skill) => void setEnabled(skill)}
        onTry={(prompt) => {
          if (onTrySkill && currentDetailSkill && onTrySkill(toSkillActionCard(currentDetailSkill), prompt)) { setDetailSkill(null); return true }
          if (preview && !onTrySkill) { startChat(prompt); setDetailSkill(null); return true }
          return false
        }}
      />
    </div>
  )
}
