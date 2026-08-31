"use client"

import Image from "next/image"
import { useCallback, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Code2, Database, FileCode2, Image as ImageIcon, LoaderCircle, Palette, Plus, Search, Sparkles, SquarePen, Upload, Workflow, X } from "lucide-react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { HubClient } from "@/hub/client"
import type { GithubImportResult, SkillCard, SkillCatalog, SkillCatalogCard, SkillCategory as CatalogSkillCategory } from "@/hub/schemas"
import { browserHubClient } from "@/ui/shell/page-clients"
import { invalidate, useResource } from "@/lib/query"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"
import { cn } from "@/lib/utils"
import { GithubImportDialog } from "@/ui/skills/github-import-dialog"
import { SkillUploadDialog } from "@/ui/skills/skill-upload-dialog"
import { SkillDetailDialog } from "@/ui/skills/skill-detail-dialog"
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
]

const CATALOG_KEY = "hub/skills/standalone-catalog"

function skillCategories(skill: Pick<SkillCatalogCard, "name" | "description" | "categories">): Exclude<SkillCategory, "all">[] {
  if (skill.categories?.length) return [...new Set(skill.categories)]
  const text = `${skill.name} ${skill.description}`.toLocaleLowerCase()
  const categories: Exclude<SkillCategory, "all">[] = []
  if (/website|traffic|similarweb|excel|stock|finance|财务|股票|数据|csv|分析/.test(text)) categories.push("data")
  if (/business|商业|商务|营销|shopify|excel|finance|财务|股票/.test(text)) categories.push("business")
  if (/design|palette|颜色|设计|figma|品牌/.test(text)) categories.push("design")
  if (/video|动画|影片|媒体|image|图像/.test(text)) categories.push("media")
  if (/automation|workflow|自动化|流程|notion/.test(text)) categories.push("automation")
  if (/content|writing|editor|research|内容|写作|润色|研究|seo/.test(text)) categories.push("content")
  if (categories.length === 0) categories.push("coding")
  return categories
}

async function listAllCatalog(client: HubClient): Promise<SkillCatalog> {
  const pages = await Promise.all([
    loadCatalogScope(client, "official"),
    loadCatalogScope(client, "third_party"),
  ])
  const byKey = new Map<string, SkillCatalog["skills"][number]>()
  for (const page of pages.flat()) {
    for (const skill of page.skills) byKey.set(`${skill.scope}/${skill.name}`, skill)
  }
  return { skills: [...byKey.values()], next_cursor: null }
}

async function loadCatalogScope(client: HubClient, scope: "official" | "third_party"): Promise<SkillCatalog[]> {
  const pages: SkillCatalog[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; ; page += 1) {
    const result = await client.listSkillCatalog({ scope, cursor })
    pages.push(result)
    const next = result.next_cursor
    if (!next || cursors.has(next)) return pages
    if (page >= 99) throw new Error("skill catalog pagination exceeded the supported page limit")
    cursors.add(next)
    cursor = next
  }
}

function artIcon(category: SkillCategory) {
  switch (category) {
    case "coding": return Code2
    case "data": return Database
    case "automation": return Workflow
    case "business": return Sparkles
    case "design": return Palette
    case "media": return ImageIcon
    case "content": return FileCode2
    default: return Sparkles
  }
}

function asSkillCard(skill: SkillCatalogCard): SkillCard {
  return {
    name: skill.name,
    description: skill.description,
    content_hash: skill.content_hash,
    scope: skill.scope,
    enabled: skill.enabled,
    updated_at: skill.updated_at,
  }
}

function formatUsage(index: number, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const count = [96, 30.3, 221.2, 29.1, 107.2, 9.8, 76.7, 46.1][index % 8]
  return t("skills.usedCount", { count: count >= 100 ? `${count.toFixed(1)}k` : `${count}k` })
}

type KokoroSkillsSurfaceProps = Pick<EmptyStateProps, "preview" | "onPrompt" | "brandName" | "onOpenSettings">

export function KokoroSkillsSurface({ preview = false, onPrompt, brandName = "Kokoro", onOpenSettings }: KokoroSkillsSurfaceProps) {
  const t = useT()
  const client = useMemo(() => browserHubClient({ preview }), [preview])
  const catalog = useResource<SkillCatalog>(`${CATALOG_KEY}/${preview ? "preview" : "live"}`, useCallback(() => listAllCatalog(client), [client]))
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<SkillCategory>("all")
  const [githubOpen, setGithubOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailSkill, setDetailSkill] = useState<SkillCatalogCard | null>(null)
  const [importNotice, setImportNotice] = useState<GithubImportResult | null>(null)
  const [importedSkills, setImportedSkills] = useState<SkillCatalogCard[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [lastAddedSkill, setLastAddedSkill] = useState<string | null>(null)
  const createRef = useRef<HTMLButtonElement | null>(null)
  const githubRef = useRef<HTMLElement | null>(null)
  const uploadRef = useRef<HTMLElement | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return [...importedSkills, ...(catalog.data?.skills ?? [])].filter((skill) => {
      const matchesCategory = category === "all" || skillCategories(skill).includes(category)
      const matchesQuery = normalized === ""
        || skill.name.toLocaleLowerCase().includes(normalized)
        || skill.description.toLocaleLowerCase().includes(normalized)
      return matchesCategory && matchesQuery
    })
  }, [catalog.data?.skills, category, importedSkills, query])

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
    const stateKey = `${skill.scope}/${skill.name}`
    if (busy !== null) return
    setBusy(stateKey)
    setErrorName(null)
    try {
      await client.setSkillEnabled(skill.name, true, skill.scope)
      setLastAddedSkill(skill.name)
      invalidate(`${CATALOG_KEY}/${preview ? "preview" : "live"}`)
    } catch {
      setErrorName(stateKey)
    } finally {
      setBusy(null)
    }
  }, [busy, client, preview])

  const handleImported = (result: GithubImportResult) => {
    setImportNotice(result)
    setImportedSkills((current) => [
      {
        name: result.skill.name,
        description: result.skill.description ?? "",
        content_hash: `github:${result.repository}`,
        scope: "personal",
        installed: true,
        enabled: true,
      },
      ...current.filter((skill) => !(skill.scope === "personal" && skill.name === result.skill.name)),
    ])
    invalidate(`${CATALOG_KEY}/${preview ? "preview" : "live"}`)
  }

  const detailCard = detailSkill ? asSkillCard(detailSkill) : null

  return (
    <div className={styles.surface} data-testid="skills-surface" data-web-skin="kokoro">
      <header className={styles.header}>
        <h1>{t("skills.title")}</h1>
        <div className={styles.headerActions}>
          <Button type="button" variant="outline" className={styles.mySkillsButton} onClick={(event) => onOpenSettings?.("skills", event.currentTarget)}>{t("skills.mySkills")}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={createRef} type="button" variant="outline" className={styles.createButton}>{t("skills.createPersonal")}<ChevronDown aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={styles.createMenu}>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => startChat(t("skills.createPrompt"))}><span className={styles.createMenuIcon}><SquarePen aria-hidden="true" /></span>{t("skills.createWithBrand", { brand: brandName })}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { uploadRef.current = createRef.current; setUploadOpen(true) }}><span className={styles.createMenuIcon}><Upload aria-hidden="true" /></span>{t("skills.uploadSkill")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { githubRef.current = createRef.current; setGithubOpen(true) }}><span className={styles.createMenuIcon}><Image src="/assets/connectors/github.webp" alt="" width={16} height={16} /></span>{t("skills.importGithub")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className={styles.scroller}>
        {lastAddedSkill ? (
          <span className="sr-only" role="status" aria-live="polite" data-testid="skills-action-status">
            {t("skills.added")} {lastAddedSkill}
          </span>
        ) : null}
        <div className={styles.content}>
          <label className={styles.searchField}>
            <Search aria-hidden="true" />
            <Input type="search" value={query} aria-label={t("skills.searchPlaceholder")} placeholder={t("skills.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
            {query ? <Button type="button" variant="ghost" size="icon-xs" aria-label={t("skills.clearSearch")} onClick={() => setQuery("")}><X aria-hidden="true" /></Button> : null}
          </label>

          <nav className={styles.categories} aria-label={t("skills.categoryAria")}>
            {CATEGORIES.map(({ value, key }) => (
              <Button key={value} type="button" variant="ghost" className={styles.category} data-active={category === value || undefined} aria-pressed={category === value} onClick={() => setCategory(value)}>{t(key)}</Button>
            ))}
          </nav>

          {importNotice ? (
            <Alert className={styles.importNotice} role="status" aria-live="polite">
              <AlertDescription>{t("skills.githubImportNotice", { name: importNotice.skill.name })}<span>{importNotice.repository}</span></AlertDescription>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.dismissImportNotice")} onClick={() => setImportNotice(null)}><X aria-hidden="true" /></Button>
            </Alert>
          ) : null}

          {catalog.data === undefined && catalog.error === undefined ? (
            <div className={styles.grid} data-testid="skills-loading">
              {Array.from({ length: 6 }, (_, index) => <Card key={index} className={styles.card}><Skeleton className={styles.artSkeleton} /><CardContent className={styles.cardBody}><Skeleton className={styles.titleSkeleton} /><Skeleton className={styles.lineSkeleton} /></CardContent></Card>)}
            </div>
          ) : catalog.error !== undefined && catalog.data === undefined ? (
            <div className={styles.errorState} role="alert"><p>{t("skills.loadError")}</p><Button type="button" variant="outline" onClick={catalog.refetch} disabled={catalog.loading}>{catalog.loading ? <Spinner aria-hidden="true" /> : null}{t("skills.retry")}</Button></div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState} data-testid="skills-catalog-empty"><Search aria-hidden="true" /><p>{t("skills.noMatch")}</p></div>
          ) : (
            <div className={styles.grid} data-testid="skills-catalog-grid">
              {filtered.map((skill, index) => {
                const stateKey = `${skill.scope}/${skill.name}`
                const enabled = skill.enabled
                const installed = skill.installed
                const actionPending = busy === stateKey
                const categoryValues = skillCategories(skill)
                const categoryValue = categoryValues[0]
                const Icon = artIcon(categoryValue)
                return (
                  <Card className={styles.card} key={stateKey}>
                    <button type="button" className={cn(styles.cardArt, styles[`art${index % 6}` as keyof typeof styles])} onClick={(event) => { detailRef.current = event.currentTarget; setDetailSkill(skill) }} aria-label={`${t("skills.viewDetails")} ${skill.name}`}>
                      <span className={styles.cardCover} aria-hidden="true">
                        <Icon className={styles.cardCoverIcon} />
                        <span>{skill.name}</span>
                      </span>
                    </button>
                    <CardContent className={styles.cardBody}>
                      <button type="button" className={styles.cardTitle} onClick={(event) => { detailRef.current = event.currentTarget; setDetailSkill(skill) }}>{skill.name}</button>
                      <p className={styles.cardDescription}>{skill.description}</p>
                      <div className={styles.cardMeta}>
                        <span className={cn(styles.metaPill, styles.owner)}><BrandFallback aria-hidden="true" /><span>{skill.scope === "third_party" ? t("skills.community") : brandName}</span></span>
                        {categoryValues.map((value) => <span className={styles.metaPill} key={value}>{t(CATEGORIES.find((item) => item.value === value)?.key ?? "skills.categoryCoding")}</span>)}
                      </div>
                      <div className={styles.cardFooter}>
                        <span>{formatUsage(index, t)}</span>
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
          )}
        </div>
      </main>

      <GithubImportDialog client={client} open={githubOpen} onOpenChange={setGithubOpen} returnFocusRef={githubRef} onImported={handleImported} />
      <SkillUploadDialog client={client} open={uploadOpen} onOpenChange={setUploadOpen} returnFocusRef={uploadRef} onPublished={() => invalidate(`${CATALOG_KEY}/${preview ? "preview" : "live"}`)} />
      <SkillDetailDialog skill={detailCard} brandName={brandName} open={detailCard !== null} onOpenChange={(open) => { if (!open) setDetailSkill(null) }} returnFocusRef={detailRef} onTry={(skill, prompt) => { setDetailSkill(null); startChat(prompt ?? t("skills.tryPrompt", { brand: brandName, name: skill.name })) }} />
    </div>
  )
}
