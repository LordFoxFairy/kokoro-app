"use client"

import type { GithubImported } from "@/ui/skills/personal-skill-github-import-flow"

import Image from "next/image"
import { useCallback, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, LoaderCircle, Plus, Search, SlidersHorizontal, SquarePen, Upload, X } from "lucide-react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { createSkillInstallationClient } from "@/hub/client"
import type { SkillCatalog, SkillCatalogCard, CatalogSkillCategory, PersonalInstallation } from "@/hub/schemas"
import { browserHubClient } from "@/ui/shell/page-clients"
import { invalidate, useResource } from "@/lib/query"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"
import { cn } from "@/lib/utils"
import { GithubImportDialog } from "@/ui/skills/github-import-dialog"
import { SkillUploadDialog } from "@/ui/skills/skill-upload-dialog"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import { createManusSkillHubClient, SKILL_CATALOG_RESOURCE_KEY } from "@/ui/skills/manus-skill-client"
import { stashPendingDraft } from "@/ui/shell/use-draft"
import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"

import styles from "./kokoro-skills-surface.module.css"

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
type InstallationIntent = Readonly<{ seriesId: string; sourceRef: string; key: string; installationId?: string }>


function skillCategories(skill: Pick<SkillCatalogCard, "categories">): Exclude<SkillCategory, "all">[] {
  return [...new Set(skill.categories ?? [])]
}

function mergeCatalogPages(pages: readonly SkillCatalog[]): SkillCatalog {
  const byKey = new Map<string, SkillCatalog["skills"][number]>()
  for (const page of pages) {
    for (const skill of page.skills) byKey.set(skill.skill_id ?? `${skill.scope}/${skill.name}`, skill)
  }
  return { skills: [...byKey.values()], next_cursor: pages.at(-1)?.next_cursor ?? null }
}

function formatUsage(value: string): string {
  const count = BigInt(value)
  if (count < BigInt(1000)) return value
  const compact = Number(count) / 1000
  return `${compact >= 100 ? Math.round(compact) : compact.toFixed(1).replace(/\.0$/u, "")}k`
}

type KokoroSkillsSurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "brandName" | "onOpenSettings" | "onCreateSkillWithAi" | "onTrySkill">

export function KokoroSkillsSurface(props: KokoroSkillsSurfaceProps) {
  return <PreviewKokoroSkillsSurface {...props} />
}

function PreviewKokoroSkillsSurface({ preview = true, onPrompt, brandName = "Kokoro", onOpenSettings, onCreateSkillWithAi, onTrySkill }: KokoroSkillsSurfaceProps) {
  const t = useT()
  const publisherLabel = (skill: Pick<SkillCatalogCard, "scope">) => skill.scope === "third_party" ? t("skills.community") : brandName
  const categoryLabel = (value: CatalogSkillCategory) => t(CATEGORIES.find((item) => item.value === value)?.key ?? "skills.categoryCoding")
  const client = useMemo(() => {
    const base = browserHubClient({ preview })
    return preview ? base : createManusSkillHubClient(base)
  }, [preview])
  const catalog = useResource<SkillCatalog>(
    `${SKILL_CATALOG_RESOURCE_KEY}/${preview ? "preview" : "live"}`,
    useCallback(() => client.listSkillCatalog(), [client]),
    { revalidateOnSubscribe: false },
  )
  const [pageState, setPageState] = useState<Readonly<{ base: SkillCatalog | undefined; pages: readonly SkillCatalog[] }>>({ base: undefined, pages: [] })
  const [loadingMoreFor, setLoadingMoreFor] = useState<SkillCatalog | undefined>()
  const [loadMoreFailedFor, setLoadMoreFailedFor] = useState<SkillCatalog | undefined>()
  const loadingMoreRef = useRef(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<SkillCategory>("all")
  const [githubOpen, setGithubOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailSkill, setDetailSkill] = useState<SkillCatalogCard | null>(null)
  const [importNotice, setImportNotice] = useState<GithubImported | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [lastAddedSkill, setLastAddedSkill] = useState<string | null>(null)
  const [installationFacts, setInstallationFacts] = useState<Readonly<Record<string, { catalog: SkillCatalog | undefined; installed: boolean; enabled: boolean }>>>({})
  const installationIntents = useRef(new Map<string, InstallationIntent>())
  const submittingInstallation = useRef(false)
  const createRef = useRef<HTMLButtonElement | null>(null)
  const githubRef = useRef<HTMLElement | null>(null)
  const uploadRef = useRef<HTMLElement | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)

  // Manus lists a single cursor page on entry. Pages are tied to the exact
  // first-page snapshot, so a background refresh immediately ignores old
  // append state instead of flashing it while an effect resets local state.
  const additionalPages = useMemo(() => pageState.base === catalog.data ? pageState.pages : [], [catalog.data, pageState])
  const displayedCatalog = useMemo(() => catalog.data === undefined ? undefined : mergeCatalogPages([catalog.data, ...additionalPages]), [additionalPages, catalog.data])
  const loadingMore = loadingMoreFor === catalog.data
  const loadMoreFailed = loadMoreFailedFor === catalog.data
  const loadMore = useCallback(async () => {
    const cursor = displayedCatalog?.next_cursor
    const base = catalog.data
    if (!cursor || base === undefined || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMoreFor(base)
    setLoadMoreFailedFor(undefined)
    try {
      const page = await client.listSkillCatalog({ cursor })
      if (page.next_cursor === cursor) throw new Error("skill catalog cursor did not advance")
      setPageState((current) => ({ base, pages: current.base === base ? [...current.pages, page] : [page] }))
    } catch {
      setLoadMoreFailedFor(base)
    } finally {
      loadingMoreRef.current = false
      setLoadingMoreFor(undefined)
    }
  }, [catalog.data, client, displayedCatalog?.next_cursor])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return (displayedCatalog?.skills ?? []).map((skill) => {
      const facts = skill.skill_id === undefined ? undefined : installationFacts[skill.skill_id]
      return facts === undefined || facts.catalog !== catalog.data ? skill : { ...skill, installed: facts.installed, enabled: facts.enabled }
    }).filter((skill) => {
      const matchesCategory = category === "all" || skillCategories(skill).includes(category)
      const matchesQuery = normalized === ""
        || skill.name.toLocaleLowerCase().includes(normalized)
        || skill.description.toLocaleLowerCase().includes(normalized)
      return matchesCategory && matchesQuery
    })
  }, [catalog.data, category, displayedCatalog?.skills, installationFacts, query])

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

  const setEnabled = useCallback(async (skill: SkillCatalogCard) => {
    const stateKey = actionIdentity(skill)
    if (submittingInstallation.current || skill.installed && skill.enabled) return
    submittingInstallation.current = true
    setBusy(stateKey)
    setErrorName(null)
    try {
      if (!skill.skill_id) throw new Error("skill identity is unavailable")
      const installationClient = createSkillInstallationClient()
      let intent = installationIntents.current.get(stateKey)
      if (intent === undefined) {
        if (skill.installed) {
          const matches: PersonalInstallation[] = []
          const cursors = new Set<string>()
          const ids = new Set<string>()
          let cursor: string | undefined
          for (let page = 0; ; page += 1) {
            const result = await installationClient.list({ installed: true, limit: 100, ...(cursor === undefined ? {} : { cursor }) })
            for (const installation of result.data) {
              if (ids.has(installation.installation_id)) throw new Error("duplicate installation identity")
              ids.add(installation.installation_id)
              if (installation.installed && installation.series_id === skill.skill_id) matches.push(installation)
            }
            const next = result.meta?.next_cursor
            if (next === undefined) break
            if (page >= 99 || cursors.has(next)) throw new Error("installation pagination exceeded its boundary")
            cursors.add(next); cursor = next
          }
          if (matches.length !== 1) throw new Error("installation identity is not unique")
          const installation = matches[0]!
          intent = Object.freeze({ seriesId: skill.skill_id, sourceRef: installation.source_ref, installationId: installation.installation_id, key: crypto.randomUUID() })
        } else {
          if (!skill.revision_skill_id) throw new Error("skill revision is unavailable")
          intent = Object.freeze({ seriesId: skill.skill_id, sourceRef: `skill:${skill.revision_skill_id}`, key: crypto.randomUUID() })
        }
        // Retain the original command identity for an unknown ACK; retries
        // never re-resolve another installation or replace its source/key.
        installationIntents.current.set(stateKey, intent)
      }
      const receipt = intent.installationId === undefined
        ? await installationClient.install(intent.sourceRef, intent.key)
        : await installationClient.setEnabled(intent.installationId, true, intent.key)
      const installation = receipt.installation
      if (installation.source_ref !== intent.sourceRef || installation.series_id !== intent.seriesId
        || !installation.installed || !installation.enabled) throw new Error("installation ACK does not match the command")
      installationIntents.current.delete(stateKey)
      const facts = { installed: installation.installed, enabled: installation.enabled }
      setInstallationFacts((current) => ({ ...current, [intent.seriesId]: { catalog: catalog.data, ...facts } }))
      setDetailSkill((current) => current !== null && actionIdentity(current) === stateKey ? { ...current, ...facts } : current)
      setLastAddedSkill(skill.name)
      invalidate(`${SKILL_CATALOG_RESOURCE_KEY}/${preview ? "preview" : "live"}`)
    } catch {
      setErrorName(stateKey)
    } finally {
      submittingInstallation.current = false
      setBusy(null)
    }
  }, [preview, catalog.data])

  const handleImported = (result: GithubImported) => {
    setImportNotice(result)
    invalidate(`${SKILL_CATALOG_RESOURCE_KEY}/${preview ? "preview" : "live"}`)
  }


  // Keep the selected revision/reader context, but use exactly the same
  // current installation facts for both presentation and action execution.
  const currentDetailSkill = detailSkill === null ? null : (() => {
    const facts = detailSkill.skill_id === undefined ? undefined : installationFacts[detailSkill.skill_id]
    const current = facts !== undefined && facts.catalog === catalog.data ? facts
      : catalog.data?.skills.find((skill) => skill.skill_id === detailSkill.skill_id) ?? detailSkill
    return { ...detailSkill, installed: current.installed === true, enabled: current.enabled === true }
  })()

  return (
    <div className={styles.surface} data-testid="skills-surface" data-web-skin="kokoro">
      <header className={styles.header}>
        <h1>{t("skills.title")}</h1>
        <div className={styles.headerTools}>
          <label className={styles.searchField}>
            <Search aria-hidden="true" />
            <Input type="search" value={query} aria-label={t("skills.searchPlaceholder")} placeholder={t("skills.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
            {query ? <Button type="button" variant="ghost" size="icon-xs" aria-label={t("skills.clearSearch")} onClick={() => setQuery("")}><X aria-hidden="true" /></Button> : null}
          </label>
          <div className={styles.headerActions}>
            <Button type="button" variant="outline" className={styles.mySkillsButton} onClick={(event) => onOpenSettings?.("skills", event.currentTarget)}>{t("skills.mySkills")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={createRef} type="button" variant="outline" className={styles.createButton}>{t("skills.create")}<ChevronDown aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={styles.createMenu}>
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => onCreateSkillWithAi ? onCreateSkillWithAi() : startChat(t("skills.createPrompt"))}><span className={styles.createMenuIcon}><SquarePen aria-hidden="true" /></span>{t("skills.createWithBrand", { brand: brandName })}</DropdownMenuItem>
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
          <div className={styles.filterRow}>
            <div className={styles.compactFilter}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.filterButton}
                    aria-label={`${t("skills.categoryAria")}：${t(CATEGORIES.find((item) => item.value === category)?.key ?? "skills.categoryAll")}`}
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    {t(CATEGORIES.find((item) => item.value === category)?.key ?? "skills.categoryAll")}
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={styles.filterMenu}>
                  <DropdownMenuGroup>
                    {CATEGORIES.map(({ value, key }) => <DropdownMenuItem key={value} data-active={category === value || undefined} onSelect={() => setCategory(value)}>{t(key)}</DropdownMenuItem>)}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {importNotice ? (
            <Alert className={styles.importNotice} role="status" aria-live="polite">
              <AlertDescription>{t("skills.githubImportNotice", { name: importNotice.name })}<span>{importNotice.repository}</span></AlertDescription>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.dismissImportNotice")} onClick={() => setImportNotice(null)}><X aria-hidden="true" /></Button>
            </Alert>
          ) : null}

          {catalog.data !== undefined && catalog.error !== undefined ? <div className={styles.errorState} role="alert"><p>{t("skills.loadError")}</p><Button type="button" variant="outline" onClick={catalog.refetch} disabled={catalog.loading}>{t("skills.retry")}</Button></div> : null}
          {catalog.data === undefined && catalog.error === undefined ? (
            <div className={styles.grid} data-testid="skills-loading">
              {Array.from({ length: 6 }, (_, index) => <Card key={index} className={styles.card}><Skeleton className={styles.artSkeleton} /><CardContent className={styles.cardBody}><Skeleton className={styles.titleSkeleton} /><Skeleton className={styles.lineSkeleton} /></CardContent></Card>)}
            </div>
          ) : catalog.error !== undefined && catalog.data === undefined ? (
            <div className={styles.errorState} role="alert"><p>{t("skills.loadError")}</p><Button type="button" variant="outline" onClick={catalog.refetch} disabled={catalog.loading}>{catalog.loading ? <Spinner aria-hidden="true" /> : null}{t("skills.retry")}</Button></div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState} data-testid="skills-catalog-empty"><Search aria-hidden="true" /><p>{t("skills.noMatch")}</p></div>
          ) : (
            <>
              <div className={styles.grid} data-testid="skills-catalog-grid">
                {filtered.map((skill) => {
                const stateKey = actionIdentity(skill)
                const enabled = skill.enabled
                const installed = skill.installed
                const actionPending = busy === stateKey
                const categoryValues = skillCategories(skill)
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
                      {skill.cover_image ? <Image src={skill.cover_image} alt="" fill sizes="(max-width: 42rem) 100vw, 30rem" unoptimized /> : <span className={styles.coverUnavailable} aria-hidden="true"><BrandFallback /></span>}
                    </button>
                    <CardContent className={styles.cardBody}>
                      <button type="button" className={styles.cardTitle} onClick={(event) => { detailRef.current = event.currentTarget; setDetailSkill(skill) }}>{skill.name}</button>
                      <p className={styles.cardDescription}>{skill.description}</p>
                      <div className={styles.cardMeta}>
                        <span className={cn(styles.metaPill, styles.owner)}><BrandFallback aria-hidden="true" /><span>{publisherLabel(skill)}</span></span>
                        {categoryValues.map((value) => <span className={styles.metaPill} key={value}>{categoryLabel(value)}</span>)}
                      </div>
                      <div className={styles.cardFooter}>
                        {skill.usage_count === undefined ? <span /> : <span>{t("skills.usedCount", { count: formatUsage(skill.usage_count) })}</span>}
                        <Button type="button" variant="outline" size="icon-sm" aria-label={`${installed && enabled ? t("skills.added") : t("skills.add")} ${skill.name}`} data-installed={installed || undefined} disabled={actionPending || (installed && enabled)} aria-busy={actionPending} onClick={() => void setEnabled(skill)}>
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
                  {loadMoreFailed ? <p role="alert">{t("skills.loadError")}</p> : null}
                  <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore} aria-busy={loadingMore}>
                    {loadingMore ? <Spinner aria-hidden="true" /> : null}{t("rail.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>

      <GithubImportDialog open={githubOpen} onOpenChange={setGithubOpen} returnFocusRef={githubRef} onImported={handleImported} />
      <SkillUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} returnFocusRef={uploadRef} onPublished={() => invalidate(`${SKILL_CATALOG_RESOURCE_KEY}/${preview ? "preview" : "live"}`)} />
      <ManusSkillDetailDialog
        key={detailSkill?.skill_id ?? "closed"}
        skill={currentDetailSkill}
        publisherLabel={detailSkill === null ? "" : publisherLabel(detailSkill)}
        categoryLabels={detailSkill === null ? [] : skillCategories(detailSkill).map(categoryLabel)}
        open={detailSkill !== null}
        busy={detailSkill !== null && busy === actionIdentity(detailSkill)}
        {...(currentDetailSkill === null ? {} : { installationState: { installed: currentDetailSkill.installed, enabled: currentDetailSkill.enabled } })}
        actionFailed={detailSkill !== null && errorName === actionIdentity(detailSkill)}
        onOpenChange={(open) => { if (!open) setDetailSkill(null) }}
        returnFocusRef={detailRef}
        onAdd={(skill) => void setEnabled(skill)}
        onTry={(prompt) => {
          setDetailSkill(null)
          if (onTrySkill) onTrySkill({ name: detailSkill?.name ?? "", description: detailSkill?.description ?? "", content_hash: detailSkill?.content_hash ?? "", scope: detailSkill?.scope ?? "official", enabled: true }, prompt)
          else startChat(prompt)
        }}
      />
    </div>
  )
}
