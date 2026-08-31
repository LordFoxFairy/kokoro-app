"use client"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

// 技能面板（WEB-SKILLS）：hub self 面的池列表/启停/配额/版本历史 + 上传 preview→confirm 两段。
// scope 恒由 BFF 从信封 namespace 派生，前端不碰身份轴。池只含「有效可用」项（official 上架∧
// 用户未关 + 自有包）；required 官方技能拒关由 hub 409 hub.skill_required 反射为锁定态。

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Check, ChevronDown, Plus, Search, ShieldCheck, SquarePen, Upload, X } from "lucide-react"

import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { invalidate, useAsyncAction, useResource } from "@/lib/query"
import type { HubClient } from "@/hub/client"
import { isRequiredLockError } from "@/hub/rules"
import type { GithubImportResult, SkillCard, SkillCatalog, SkillQuota, SkillRevision } from "@/hub/schemas"

import styles from "./skills-panel.module.css"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"
import { GithubImportDialog } from "./github-import-dialog"
import { SkillUploadDialog } from "./skill-upload-dialog"
import { SkillDetailDialog } from "./skill-detail-dialog"

function isNestedOverlayPointerEvent(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  if (target.closest('[data-slot="dialog-content"]')) return true
  if (target.closest('[data-slot="dropdown-menu-content"]')) return true
  if (document.querySelector('[data-slot="dropdown-menu-content"][data-state="open"]')) return true
  return target.closest('[data-slot="dialog-overlay"]') !== null
    && document.querySelectorAll('[data-slot="dialog-content"][data-state="open"]').length > 1
}

const OFFICIAL_SCOPE = "official"
// hub 技能池查询键：启停/发布成功后 invalidate 此前缀重取（含配额，池取数合并读）。
const SKILLS_KEY = "hub/skills"
const SKILLS_CATALOG_KEY = "hub/skills/catalog"
const clientResourceIds = new WeakMap<object, number>()
let nextClientResourceId = 1

// The shared store is module-scoped so a Settings surface can reuse a warm
// response. Scope that cache by the injected client as well: preview clients,
// live clients, and two site fixtures must never render one another's skill
// pool while sharing a browser tab.
function skillResourceKey(prefix: string, client: HubClient, suffix = ""): string {
  let id = clientResourceIds.get(client)
  if (id === undefined) {
    id = nextClientResourceId++
    clientResourceIds.set(client, id)
  }
  return `${prefix}/${id}${suffix ? `/${suffix}` : ""}`
}

function skillStateKey(scope: string, name: string): string {
  return `${scope}/${name}`
}

type Pool = { skills: SkillCard[]; quota: SkillQuota | null }

type SkillsPanelProps = {
  client: HubClient
  brandName?: string
  onClose: () => void
  pinned: readonly string[]
  onTogglePin: (name: string) => void
  onTrySkill?: (skill: SkillCard, prompt?: string) => void
}

export function SkillsPanel({ client, brandName, onClose, pinned, onTogglePin, onTrySkill }: SkillsPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="skills-panel"
        closeLabel={t("skills.close")}
        closeButtonTestId="skills-close"
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={(event) => {
          // Catalog/GitHub dialogs are portalled siblings of this content.
          // Radix otherwise reports their clicks as outside the parent and a
          // confirm/close action unexpectedly tears down the whole Settings
          // surface instead of returning to the skill list.
          if (isNestedOverlayPointerEvent(event)) {
            event.preventDefault()
            return
          }
          event.preventDefault()
          requestClose()
        }}
      >
        <DialogTitle className="sr-only">{t("skills.title")}</DialogTitle>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{t("skills.title")}</h2>
            <p className={styles.subtitle}>{t("skills.subtitle")}</p>
          </div>
        </header>
        <SkillsContent client={client} brandName={brandName} pinned={pinned} onTogglePin={onTogglePin} onTrySkill={onTrySkill} />
      </DialogContent>
    </Dialog>
  )
}

type SkillsContentProps = {
  client: HubClient
  brandName?: string
  pinned: readonly string[]
  onTogglePin: (name: string) => void
  onTrySkill?: (skill: SkillCard, prompt?: string) => void
  embedded?: boolean
  /** Opens the shared direct-chat Composer with the skill-creator prompt. */
  onCreateWithAi?: () => void
}

export function SkillsContent({ client, brandName, pinned, onTogglePin, onTrySkill, embedded = false, onCreateWithAi }: SkillsContentProps) {
  const [githubOpen, setGithubOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const githubReturnFocusRef = useRef<HTMLElement | null>(null)
  const uploadReturnFocusRef = useRef<HTMLElement | null>(null)
  const detailReturnFocusRef = useRef<HTMLElement | null>(null)
  const [detailSkill, setDetailSkill] = useState<SkillCard | null>(null)
  const [githubImportNotice, setGithubImportNotice] = useState<GithubImportResult | null>(null)
  const [recentSkillKey, setRecentSkillKey] = useState<string | null>(null)
  const poolCreateTriggerRef = useRef<HTMLButtonElement | null>(null)
  const invalidateSkills = useCallback(() => {
    // An imported/uploaded skill can also change the catalog's installed
    // projection. Refresh both surfaces so reopening Browse never shows a
    // stale Add action after the pool has already been updated.
    invalidate(skillResourceKey(SKILLS_KEY, client))
    invalidate(skillResourceKey(SKILLS_CATALOG_KEY, client))
  }, [client])
  const handleGithubImported = useCallback((result: GithubImportResult) => {
    invalidateSkills()
    // Keep the just-imported skill discoverable after the dialog closes. The
    // list may contain many cards and the imported personal card is otherwise
    // appended below the fold, which makes a successful import look like a
    // no-op to the user.
    setRecentSkillKey(`personal/${result.skill.name}`)
    setGithubImportNotice(result)
  }, [invalidateSkills])
  // 池 + 配额合并读经查询层（模块缓存/去重/失活）：池只含「有效可用」项，配额缺失回退 null。
  const pool = useResource<Pool>(
    skillResourceKey(SKILLS_KEY, client),
    useCallback(async (): Promise<Pool> => {
      const [skills, quota] = await Promise.all([
        client.listSkillPool(),
        client.skillQuota().catch(() => null),
      ])
      return { skills, quota }
    }, [client]),
  )
  // required 锁定集合：某技能 disable 撞 409 hub.skill_required 后记入，UI 据此锁 toggle。
  const [locked, setLocked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [disableError, setDisableError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(() => new Map())
  const [installedOverrides, setInstalledOverrides] = useState<Map<string, boolean>>(() => new Map())
  const mutationBusyRef = useRef(false)
  const mutationAttemptRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => () => {
    mountedRef.current = false
    mutationAttemptRef.current += 1
  }, [])

  const enabledAction = useAsyncAction(({ name, enabled, scope }: { name: string; enabled: boolean; scope?: string }) => client.setSkillEnabled(name, enabled, scope))
  const onSetEnabled = useCallback(
    async (name: string, enabled: boolean, stateKey = name, scope?: string) => {
      // One mutation owns the shared hub action slot. State is for rendering;
      // the ref closes the same-frame double-click window before React commits
      // the busy state.
      if (mutationBusyRef.current) return
      mutationBusyRef.current = true
      const attempt = ++mutationAttemptRef.current
      // 池内项恒为「已启用」：唯一动作是停用（停用后离池）。required 撞 409 → 锁定回滚。
      setBusy(stateKey)
      setDisableError(null)
      const outcome = await enabledAction.run({ name, enabled, scope })
      if (!mountedRef.current || attempt !== mutationAttemptRef.current) return
      setBusy(null)
      if (outcome.ok) {
        setEnabledOverrides((current) => new Map(current).set(stateKey, enabled))
        if (enabled) {
          setInstalledOverrides((current) => new Map(current).set(stateKey, true))
        }
        invalidate(skillResourceKey(SKILLS_KEY, client)) // 成功→失活重取池（离池 + 配额回收）。
        invalidate(skillResourceKey(SKILLS_CATALOG_KEY, client))
      } else if (!enabled && isRequiredLockError(outcome.error)) {
        setLocked((prev) => new Set(prev).add(stateKey))
      } else {
        setDisableError(stateKey)
      }
      mutationBusyRef.current = false
    },
    [client, enabledAction],
  )

  return (
    <>
      <div className={cn(styles.tabs, embedded && styles.embeddedTabs)}>
        <div className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
          <PoolTab
            pool={pool.data ?? null}
            loading={pool.loading}
            failed={pool.error !== undefined && pool.data === undefined}
            refreshFailed={pool.error !== undefined && pool.data !== undefined}
            pinned={pinned}
            locked={locked}
            busy={busy}
            expanded={expanded}
            client={client}
            onRetry={pool.refetch}
            onDisable={(name, stateKey, scope) => onSetEnabled(name, false, stateKey, scope)}
            onSetEnabled={onSetEnabled}
            enabledOverrides={enabledOverrides}
            installedOverrides={installedOverrides}
            onTogglePin={onTogglePin}
            disableError={disableError}
            onToggleExpand={(stateKey) => setExpanded((prev) => (prev === stateKey ? null : stateKey))}
            embedded={embedded}
            onOpenUpload={(returnFocusRef) => {
              uploadReturnFocusRef.current = returnFocusRef?.current ?? poolCreateTriggerRef.current
              setUploadOpen(true)
            }}
            createTriggerRef={poolCreateTriggerRef}
            onOpenGithub={(returnFocusRef) => {
              githubReturnFocusRef.current = returnFocusRef?.current ?? poolCreateTriggerRef.current
              setGithubOpen(true)
            }}
            githubImportNotice={githubImportNotice}
            recentSkillKey={recentSkillKey}
            onDismissGithubImportNotice={() => setGithubImportNotice(null)}
            onCreateWithAi={onCreateWithAi}
            onOpenDetail={(skill, source) => {
              detailReturnFocusRef.current = source
              setDetailSkill(skill)
            }}
          />
        </div>
      </div>
      <GithubImportDialog
        key={githubOpen ? "github-import-open" : "github-import-closed"}
        client={client}
        open={githubOpen}
        onOpenChange={setGithubOpen}
        returnFocusRef={githubReturnFocusRef}
        onImported={handleGithubImported}
      />
      <SkillUploadDialog
        key={uploadOpen ? "skill-upload-open" : "skill-upload-closed"}
        client={client}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        returnFocusRef={uploadReturnFocusRef}
        onPublished={invalidateSkills}
      />
      <SkillDetailDialog
        skill={detailSkill}
        brandName={brandName}
        open={detailSkill !== null}
        onOpenChange={(open) => { if (!open) setDetailSkill(null) }}
        returnFocusRef={detailReturnFocusRef}
        onTry={(skill, prompt) => {
          if (onTrySkill) {
            // Keep the existing one-argument Try callback shape intact. Only
            // prompt cards add their visible text as a second argument.
            if (prompt === undefined) onTrySkill(skill)
            else onTrySkill(skill, prompt)
          } else if (!pinned.includes(skill.name)) {
            onTogglePin(skill.name)
          }
          setDetailSkill(null)
        }}
      />
    </>
  )
}

type ScopeFilter = "all" | "personal" | "official" | "thirdParty"

type SkillScope = Exclude<ScopeFilter, "all">

function skillScope(scope: string): SkillScope {
  if (scope === OFFICIAL_SCOPE) return "official"
  if (scope === "third_party" || scope === "third-party") return "thirdParty"
  return "personal"
}

function PoolTab({
  pool,
  loading,
  failed,
  refreshFailed,
  pinned,
  locked,
  busy,
  expanded,
  client,
  onRetry,
  onDisable,
  onSetEnabled,
  enabledOverrides,
  installedOverrides,
  onTogglePin,
  disableError,
  onToggleExpand,
  embedded = false,
  onOpenUpload,
  onOpenGithub,
  createTriggerRef,
  githubImportNotice,
  recentSkillKey,
  onDismissGithubImportNotice,
  onCreateWithAi,
  onOpenDetail,
}: {
  pool: Pool | null
  loading: boolean
  failed: boolean
  refreshFailed: boolean
  pinned: readonly string[]
  locked: Set<string>
  busy: string | null
  expanded: string | null
  client: HubClient
  onRetry: () => void
  onDisable: (name: string, stateKey: string, scope: string) => void
  onSetEnabled: (name: string, enabled: boolean, stateKey?: string, scope?: string) => void
  enabledOverrides: ReadonlyMap<string, boolean>
  installedOverrides: ReadonlyMap<string, boolean>
  onTogglePin: (name: string) => void
  disableError: string | null
  onToggleExpand: (stateKey: string) => void
  embedded?: boolean
  onOpenUpload: (returnFocusRef?: RefObject<HTMLElement | null>) => void
  onOpenGithub: (returnFocusRef?: RefObject<HTMLElement | null>) => void
  createTriggerRef: RefObject<HTMLButtonElement | null>
  githubImportNotice: GithubImportResult | null
  recentSkillKey: string | null
  onDismissGithubImportNotice: () => void
  onCreateWithAi?: () => void
  onOpenDetail: (skill: SkillCard, source: HTMLElement) => void
}) {
  const t = useT()
  // 视图态:搜索词 / 范围筛选 / 停用二次确认(停用是破坏性——离池,先确认)。
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<ScopeFilter>("all")
  const [confirming, setConfirming] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createActionHandledRef = useRef(false)
  const catalogHandoffRef = useRef<(() => void) | null>(null)
  const catalogHandoffTimerRef = useRef<number | null>(null)
  const disableTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const confirmDisableRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const searchRef = useRef<HTMLInputElement | null>(null)
  const catalogTriggerRef = useRef<HTMLButtonElement | null>(null)

  const selectCreateAction = (action: () => void, event?: Event) => {
    // Radix closes a controlled menu after onSelect. Run the destination
    // transition in the same event so keyboard and click users get immediate
    // feedback, while the controlled `open=false` prevents a stale menu from
    // surviving beside the next surface.
    event?.preventDefault()
    if (createActionHandledRef.current) return
    createActionHandledRef.current = true
    setCreateMenuOpen(false)
    action()
    queueMicrotask(() => { createActionHandledRef.current = false })
  }

  const restoreCatalogTriggerFocus = useCallback((event: Event) => {
    if (catalogTriggerRef.current === null) return
    event.preventDefault()
    window.requestAnimationFrame(() => catalogTriggerRef.current?.focus())
  }, [])

  const finishCatalogHandoff = useCallback(() => {
    if (catalogHandoffTimerRef.current !== null) {
      window.clearTimeout(catalogHandoffTimerRef.current)
      catalogHandoffTimerRef.current = null
    }
    const handoff = catalogHandoffRef.current
    catalogHandoffRef.current = null
    handoff?.()
  }, [])

  const queueCatalogHandoff = useCallback((handoff: () => void) => {
    if (catalogHandoffTimerRef.current !== null) {
      window.clearTimeout(catalogHandoffTimerRef.current)
    }
    catalogHandoffRef.current = handoff
    setCatalogOpen(false)
    // Radix normally calls onCloseAutoFocus after the catalog's focus scope
    // exits. A controlled, trigger-less dialog can skip that callback in a
    // jsdom/animation-disabled environment, so retain a post-exit fallback.
    // The 240ms guard is longer than the shared 200ms Dialog exit duration;
    // it never opens the child in the same commit as the catalog close.
    catalogHandoffTimerRef.current = window.setTimeout(finishCatalogHandoff, 240)
  }, [finishCatalogHandoff])

  useEffect(() => () => {
    if (catalogHandoffTimerRef.current !== null) window.clearTimeout(catalogHandoffTimerRef.current)
  }, [])

  const handleCatalogCloseAutoFocus = (event: Event) => {
    const handoff = catalogHandoffRef.current
    if (handoff !== null) {
      event.preventDefault()
      // Radix invokes this callback from the source dialog's focus-scope
      // unmount. Starting the child here, rather than in the menu item's
      // event, keeps the two controlled modal lifecycles in separate stages.
      finishCatalogHandoff()
      return
    }
    restoreCatalogTriggerFocus(event)
  }

  // The destructive action is replaced inline. Explicitly move focus to the
  // confirmation control so the scroll viewport never becomes the active
  // element during the row re-render.
  useEffect(() => {
    if (confirming === null) return
    const frame = window.requestAnimationFrame(() => {
      confirmDisableRefs.current[confirming]?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [confirming])

  // 有数据即渲染（含后台刷新期，缓存不闪空）；无数据时失败优先于 loading。
  if (pool === null) {
    if (failed) {
      return (
        <Alert variant="destructive" className={styles.feedback}>
          <AlertDescription>
            <p>{t("skills.loadError")}</p>
            <Button variant="outline" type="button" className={styles.retry} disabled={loading} aria-busy={loading} onClick={onRetry}>
              {loading ? <Spinner aria-hidden="true" /> : null}
              {loading ? t("skills.loading") : t("skills.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )
    }
    return (
      <div className={styles.loadingState} role="status" aria-label={t("skills.loading")}>
        <Skeleton className={styles.loadingLine} />
        <Skeleton className={styles.loadingLine} />
        <Skeleton className={styles.loadingLineShort} />
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const filtered = pool.skills.filter((skill) => {
    if (scope !== "all" && skillScope(skill.scope) !== scope) return false
    if (q !== "" && !(skill.name.toLowerCase().includes(q) || (skill.description ?? "").toLowerCase().includes(q))) {
      return false
    }
    return true
  })
  // Put the last successful GitHub import first without disturbing the
  // server's stable ordering for every other skill.
  if (recentSkillKey !== null) {
    filtered.sort((left, right) => {
      const leftRecent = skillStateKey(left.scope, left.name) === recentSkillKey
      const rightRecent = skillStateKey(right.scope, right.name) === recentSkillKey
      return Number(rightRecent) - Number(leftRecent)
    })
  }
  const hasSkills = pool.skills.length > 0
  const scopeFilters: ScopeFilter[] = ["all", "personal", "official", "thirdParty"]
  const scopeLabel: Record<ScopeFilter, string> = {
    all: t("skills.filterAll"),
    personal: t("skills.filterPersonal"),
    official: t("skills.filterOfficial"),
    thirdParty: t("skills.filterThirdParty"),
  }

  return (
    <>
      {!embedded && pool.quota ? (
        <div className={styles.quota} data-testid="skills-quota">
          <span>{t("skills.quotaPackages", { used: pool.quota.package_count, max: pool.quota.max_packages })}</span>
          <span>
            {t("skills.quotaBytes", {
              used: formatBytes(pool.quota.package_bytes),
              max: formatBytes(pool.quota.max_bytes),
            })}
          </span>
        </div>
      ) : null}

      {githubImportNotice ? (
        <Alert className={styles.importNotice} data-testid="github-import-notice" role="status" aria-live="polite">
          <AlertDescription>
            {t("skills.githubImportNotice", { name: githubImportNotice.skill.name })}
            <span className={styles.importNoticeRepository}>{githubImportNotice.repository}</span>
          </AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.importNoticeDismiss}
            aria-label={t("skills.dismissImportNotice")}
            onClick={onDismissGithubImportNotice}
          >
            <X aria-hidden="true" />
          </Button>
        </Alert>
      ) : null}

      {/* Keep entry points mounted for empty pools too, including standalone. */}
      <div className={cn(styles.filterBar, embedded && styles.embeddedFilterLayout)}>
        <label className={cn(styles.searchField, embedded && styles.embeddedSearchField)}>
          {embedded ? <Search aria-hidden="true" /> : null}
          <Input
            ref={searchRef}
            type="search"
            className={styles.search}
            value={query}
            placeholder={t("skills.searchPlaceholder")}
            aria-label={t("skills.searchPlaceholder")}
            disabled={!hasSkills}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.embeddedSkillActions}>
          <Button
            ref={catalogTriggerRef}
            variant="outline"
            type="button"
            className={styles.embeddedBrowse}
            onClick={() => setCatalogOpen(true)}
          >
            {t("skills.browse")}
          </Button>
          <DropdownMenu modal open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                ref={createTriggerRef}
                variant="outline"
                type="button"
                className={styles.embeddedCreate}
              >
                {t("skills.create")}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={styles.createMenuContent}>
              <DropdownMenuGroup>
                {onCreateWithAi ? (
                  <DropdownMenuItem onSelect={(event) => selectCreateAction(onCreateWithAi, event)}><SquarePen aria-hidden="true" />{t("skills.createWithAi")}</DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={(event) => selectCreateAction(() => { setCatalogOpen(false); onOpenUpload(createTriggerRef) }, event)}><Upload aria-hidden="true" />{t("skills.uploadSkill")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={(event) => selectCreateAction(() => { setCatalogOpen(false); onOpenGithub(createTriggerRef) }, event)}><Image src="/assets/connectors/github.webp" alt="" width={16} height={16} />{t("skills.importGithub")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={(event) => selectCreateAction(() => { setScope("official"); setCatalogOpen(true) }, event)}><ShieldCheck aria-hidden="true" />{t("skills.addOfficial")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(value) => { if (value) setScope(value as ScopeFilter) }}
          className={cn(styles.filterSeg, embedded && styles.embeddedFilterSeg)}
          variant="outline"
          aria-label={t("skills.filterAria")}
        >
          {scopeFilters.map((value) => (
            <ToggleGroupItem key={value} value={value} className={styles.filterBtn} disabled={!hasSkills}>
              {scopeLabel[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {refreshFailed ? (
        <Alert variant="destructive" className={styles.refreshFeedback} data-testid="skills-refresh-error">
          <AlertDescription>
            <span>{t("skills.refreshError")}</span>
            <Button variant="outline" type="button" disabled={loading} aria-busy={loading} onClick={onRetry}>
              {loading ? <Spinner aria-hidden="true" /> : null}
              {loading ? t("skills.loading") : t("skills.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!hasSkills ? (
        <Empty className={styles.emptyState} data-testid="skills-empty">
          <EmptyHeader>
            <EmptyTitle>{t("skills.empty")}</EmptyTitle>
            <EmptyDescription>{t("skills.emptyGuide")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty className={styles.noMatch}>
          <EmptyDescription>{t("skills.noMatch")}</EmptyDescription>
        </Empty>
      ) : (
        <ul className={styles.list}>
          {filtered.map((skill) => {
            const isOfficial = skill.scope === OFFICIAL_SCOPE
            const isThirdParty = skillScope(skill.scope) === "thirdParty"
            const stateKey = skillStateKey(skill.scope, skill.name)
            const isLocked = locked.has(stateKey)
            const isPinned = pinned.includes(skill.name)
            const isConfirming = confirming === stateKey
            // The scope/name pair is the view identity. Do not fall back to
            // a bare name: an imported personal skill may share a name with
            // an official card and must not inherit its toggle state.
            const isEnabled = enabledOverrides.get(stateKey) ?? skill.enabled !== false
            if (embedded) {
              return (
                <li key={`${skill.scope}/${skill.name}`}>
                  <InstalledSkillCard
                    skill={skill}
                    enabled={isEnabled}
                    busy={busy !== null}
                    pending={busy === stateKey}
                    locked={isLocked}
                    error={disableError === stateKey ? t("skills.disableError") : null}
                    onEnabledChange={(enabled) => onSetEnabled(skill.name, enabled, stateKey, skill.scope)}
                    onOpenDetail={(source) => onOpenDetail(skill, source)}
                  />
                </li>
              )
            }
            return (
              <li key={`${skill.scope}/${skill.name}`}>
                <Collapsible
                  className={styles.itemDisclosure}
                  open={expanded === stateKey}
                  onOpenChange={(open) => {
                    if (open !== (expanded === stateKey)) {
                      onToggleExpand(stateKey)
                    }
                  }}
                >
                <Card className={styles.item}>
                <CardContent className={styles.itemContent}>
                <div className={styles.itemMain}>
                  <div className={styles.itemHead}>
                    <Button
                      variant="ghost"
                      type="button"
                      className={cn(styles.name, styles.detailTrigger)}
                      title={skill.name}
                      onClick={(event) => onOpenDetail(skill, event.currentTarget)}
                    >
                      {skill.name}
                    </Button>
                    <Badge variant="outline" className={styles.badge} data-scope={isOfficial ? "official" : isThirdParty ? "third-party" : "own"}>
                      {isOfficial ? t("skills.official") : isThirdParty ? t("skills.thirdParty") : t("skills.own")}
                    </Badge>
                    {isLocked ? (
                      <Badge variant="outline" className={styles.badge} data-scope="required" title={t("skills.requiredTip")}>
                        {t("skills.requiredLock")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className={styles.desc}>{skill.description}</p>
                </div>
                <div className={cn(styles.itemActions, embedded && styles.embeddedItemActions)}>
                  <Button
                    variant="outline"
                    type="button"
                    className={styles.pin}
                    data-active={isPinned}
                    aria-pressed={isPinned}
                    aria-label={`${isPinned ? t("skills.unpin") : t("skills.pin")} ${skill.name}`}
                    onClick={() => onTogglePin(skill.name)}
                  >
                    {isPinned ? t("skills.unpin") : t("skills.pin")}
                  </Button>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      type="button"
                      className={styles.ver}
                      aria-label={`${t("skills.revisions")} ${skill.name}`}
                    >
                      {t("skills.revisions")}
                    </Button>
                  </CollapsibleTrigger>
                  {/* 停用二次确认:首点入确认态,再点才真停用(破坏性——离池)。 */}
                  {isConfirming ? (
                    <span className={styles.confirmRow}>
                      <Button
                        variant="destructive"
                        type="button"
                        className={styles.confirmYes}
                        ref={(element) => { confirmDisableRefs.current[stateKey] = element }}
                        aria-label={`${t("skills.confirmDisable")} ${skill.name}`}
                        disabled={busy !== null}
                        aria-busy={busy === stateKey}
                        onClick={() => {
                          setConfirming(null)
                          onDisable(skill.name, stateKey, skill.scope)
                          window.requestAnimationFrame(() => searchRef.current?.focus())
                        }}
                      >
                        {busy === stateKey ? <><Spinner aria-hidden="true" />{t("skills.confirmDisable")}</> : t("skills.confirmDisable")}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        className={styles.confirmNo}
                        aria-label={`${t("skills.cancel")} ${skill.name}`}
                        onClick={() => {
                          setConfirming(null)
                          window.requestAnimationFrame(() => disableTriggerRefs.current[stateKey]?.focus())
                        }}
                      >
                        {t("skills.cancel")}
                      </Button>
                    </span>
                  ) : (
                    <Button variant="outline"
                      type="button"
                      className={styles.toggle}
                      ref={(element) => { disableTriggerRefs.current[stateKey] = element }}
                      disabled={isLocked || busy !== null}
                      aria-busy={busy === stateKey}
                      aria-label={`${isLocked ? t("skills.requiredLock") : t("skills.disable")} ${skill.name}`}
                      onClick={() => setConfirming(stateKey)}
                    >
                      {busy === stateKey ? <Spinner aria-hidden="true" /> : null}
                      {isLocked ? t("skills.requiredLock") : t("skills.disable")}
                    </Button>
                  )}
                </div>
                {disableError === stateKey ? (
                  <Alert variant="destructive" className={styles.itemError}>
                    <AlertDescription>{t("skills.disableError")}</AlertDescription>
                  </Alert>
                ) : null}
                <CollapsibleContent className={styles.revisionContent}>
                  <Revisions client={client} scope={skill.scope} name={skill.name} />
                </CollapsibleContent>
                </CardContent>
                </Card>
                </Collapsible>
              </li>
            )
          })}
        </ul>
      )}
      <SkillCatalogDialog
        open={catalogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCatalogOpen(false)
        }}
        onCloseAutoFocus={handleCatalogCloseAutoFocus}
        client={client}
        enabledOverrides={enabledOverrides}
        installedOverrides={installedOverrides}
        busy={busy}
        errorName={disableError}
        onOpenUpload={(returnFocusRef) => {
          const focusRef = catalogOpen ? catalogTriggerRef : returnFocusRef ?? catalogTriggerRef
          queueCatalogHandoff(() => onOpenUpload(focusRef))
        }}
        onOpenGithub={(returnFocusRef) => {
          const focusRef = catalogOpen ? catalogTriggerRef : returnFocusRef ?? catalogTriggerRef
          queueCatalogHandoff(() => onOpenGithub(focusRef))
        }}
        onSetEnabled={onSetEnabled}
      />
    </>
  )
}

function InstalledSkillCard({
  skill,
  enabled,
  busy,
  pending,
  locked,
  error,
  onEnabledChange,
  onOpenDetail,
}: {
  skill: SkillCard
  enabled: boolean
  busy: boolean
  pending: boolean
  locked: boolean
  error: string | null
  onEnabledChange: (enabled: boolean) => void
  onOpenDetail: (source: HTMLElement) => void
}) {
  const t = useT()
  return (
    <Card className={cn(styles.installedCard, error ? styles.installedCardWithError : undefined)}>
      <CardContent className={styles.installedCardContent}>
        <div className={styles.installedCardHead}>
          <div className={styles.installedCardIdentity}>
            <Button
              variant="ghost"
              type="button"
              className={styles.installedCardName}
              title={skill.name}
              onClick={(event) => onOpenDetail(event.currentTarget)}
            >
              {skill.name}
            </Button>
            {locked ? <Badge variant="outline" title={t("skills.requiredTip")}>{t("skills.requiredLock")}</Badge> : null}
          </div>
          <Switch
            size="sm"
            checked={enabled}
            disabled={locked || busy}
            aria-busy={pending}
            aria-label={`${enabled ? t("skills.disable") : t("skills.enable")} ${skill.name}`}
            onCheckedChange={onEnabledChange}
          />
        </div>
        <p className={styles.installedCardDescription}>{skill.description}</p>
        {skill.updated_at ? (
          <p className={styles.installedCardMeta}>
            <ShieldCheck aria-hidden="true" />
            {t("skills.updatedAt", { date: formatSkillDate(skill.updated_at) })}
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive" className={styles.installedCardError}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SkillCatalogDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  client,
  enabledOverrides,
  installedOverrides,
  busy,
  errorName,
  onOpenUpload,
  onOpenGithub,
  onSetEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
  client: HubClient
  enabledOverrides: ReadonlyMap<string, boolean>
  installedOverrides: ReadonlyMap<string, boolean>
  busy: string | null
  errorName: string | null
  onOpenUpload: (returnFocusRef?: RefObject<HTMLElement | null>) => void
  onOpenGithub: (returnFocusRef?: RefObject<HTMLElement | null>) => void
  onSetEnabled: (name: string, enabled: boolean, stateKey?: string, scope?: string) => void
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<"official" | "third_party">("official")
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createActionHandledRef = useRef(false)
  const catalogSearchRef = useRef<HTMLInputElement | null>(null)
  const catalogCreateTriggerRef = useRef<HTMLButtonElement | null>(null)
  const catalogKey = `${SKILLS_CATALOG_KEY}/${scope}/${query.trim().toLocaleLowerCase()}`
  const catalog = useResource<SkillCatalog>(
    skillResourceKey(SKILLS_CATALOG_KEY, client, catalogKey.slice(`${SKILLS_CATALOG_KEY}/`.length)),
    useCallback(async () => {
      // The catalog is cursor-paginated by Hub. The dialog owns one stable
      // scroll surface, so hydrate all bounded pages into that surface rather
      // than making the user discover a second invisible pagination control.
      // Stop on a repeated cursor defensively: a malformed upstream page must
      // never spin the browser forever.
      const pages: SkillCatalog[] = []
      let cursor: string | undefined
      const seenCursors = new Set<string>()
      for (let page = 0; ; page += 1) {
        const current = await client.listSkillCatalog({ scope, query, cursor })
        pages.push(current)
        const next = current.next_cursor ?? null
        if (next === null || seenCursors.has(next)) break
        // A cursor loop is already guarded above. Keep a finite upper bound
        // only as a failed-request guard, rather than silently rendering a
        // partial catalog after an arbitrary twentieth page. A server that
        // legitimately exceeds this fixture-safe bound should surface the
        // normal catalog error and be fixed at the transport boundary.
        if (page >= 99) {
          throw new Error("skill catalog pagination exceeded the supported page limit")
        }
        seenCursors.add(next)
        cursor = next
      }
      const skillsByKey = new Map<string, SkillCatalog["skills"][number]>()
      for (const page of pages) {
        for (const skill of page.skills) {
          skillsByKey.set(`${skill.scope}/${skill.name}`, skill)
        }
      }
      return { skills: [...skillsByKey.values()], next_cursor: null }
    }, [client, query, scope]),
  )
  const selectCreateAction = (action: () => void, event?: Event) => {
    event?.preventDefault()
    if (createActionHandledRef.current) return
    createActionHandledRef.current = true
    setCreateMenuOpen(false)
    action()
    queueMicrotask(() => { createActionHandledRef.current = false })
  }

  const focusCatalogSearch = (event: Event) => {
    event.preventDefault()
    window.requestAnimationFrame(() => catalogSearchRef.current?.focus({ preventScroll: true }))
  }
  const normalized = query.trim().toLocaleLowerCase()
  const skills = catalog.data?.skills ?? []
  const filtered = skills.filter((skill) => {
    const scopeMatches = skillScope(skill.scope) === (scope === "third_party" ? "thirdParty" : "official")
    return scopeMatches && (normalized === "" || skill.name.toLocaleLowerCase().includes(normalized) || skill.description.toLocaleLowerCase().includes(normalized))
  })
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCreateMenuOpen(false)
      setQuery("")
      setScope("official")
    }
    onOpenChange(nextOpen)
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(styles.catalogDialog, "p-0 box-border")}
        closeLabel={t("skills.closeCatalog")}
        onOpenAutoFocus={focusCatalogSearch}
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={(event) => {
          // The catalog's Create menu is also portalled. Keep the catalog
          // mounted while the user chooses Upload or GitHub from that menu.
          if (
            (event.target instanceof Element && event.target.closest('[data-slot="dropdown-menu-content"]'))
            || document.querySelector('[data-slot="dropdown-menu-content"][data-state="open"]')
          ) {
            event.preventDefault()
          }
        }}
      >
        <DialogTitle className={styles.catalogTitle}>{t("skills.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("skills.subtitle")}</DialogDescription>
        <label className={styles.catalogSearch}>
          <Search aria-hidden="true" />
          <Input ref={catalogSearchRef} value={query} type="search" aria-label={t("skills.searchPlaceholder")} placeholder={t("skills.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className={styles.catalogToolbar}>
          <div className={styles.catalogScope}>
            <Button type="button" variant="ghost" data-active={scope === "official"} onClick={() => setScope("official")}>{t("skills.filterOfficial")}</Button>
            <Button type="button" variant="ghost" data-active={scope === "third_party"} onClick={() => setScope("third_party")}>{t("skills.filterThirdParty")}</Button>
          </div>
          <DropdownMenu modal={false} open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                type="button"
                className={styles.catalogCreate}
                ref={catalogCreateTriggerRef}
              >
                {t("skills.create")}<ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={(event) => selectCreateAction(() => onOpenUpload(catalogCreateTriggerRef), event)}><Upload aria-hidden="true" />{t("skills.uploadSkill")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={(event) => selectCreateAction(() => onOpenGithub(catalogCreateTriggerRef), event)}><Image src="/assets/connectors/github.webp" alt="" width={16} height={16} />{t("skills.importGithub")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
          {errorName ? (
            <Alert variant="destructive" className={styles.catalogFeedback}>
              <AlertDescription>{t("skills.addError")}</AlertDescription>
            </Alert>
          ) : null}
          <div className={styles.catalogGrid} data-testid="skills-catalog-scroll">
          {catalog.data === undefined && catalog.error === undefined ? (
            Array.from({ length: 4 }, (_, index) => (
              <Card className={styles.catalogCard} key={`catalog-loading-${index}`} aria-hidden="true">
                <CardContent className={styles.catalogCardContent}>
                  <Skeleton className={styles.catalogSkeletonTitle} />
                  <Skeleton className={styles.catalogSkeletonDescription} />
                  <Skeleton className={styles.catalogSkeletonMeta} />
                </CardContent>
              </Card>
            ))
          ) : catalog.error !== undefined && catalog.data === undefined ? (
            <div className={styles.catalogLoadError} role="alert">
              <p>{t("skills.loadError")}</p>
              <Button type="button" variant="outline" onClick={catalog.refetch} disabled={catalog.loading} aria-busy={catalog.loading}>
                {catalog.loading ? <Spinner aria-hidden="true" /> : null}
                {catalog.loading ? t("skills.loading") : t("skills.retry")}
              </Button>
            </div>
          ) : filtered.length > 0 ? filtered.map((skill) => {
              const stateKey = skillStateKey(skill.scope, skill.name)
              // The scope/name pair is the view identity. Do not fall back to
              // a bare name: an imported personal skill may share a name with
              // an official card and must not inherit its toggle state.
              const enabledOverride = enabledOverrides.get(stateKey)
              const installedOverride = installedOverrides.get(stateKey)
              // `installed` and `enabled` are different projections. A local
              // false override means the user disabled the skill; it must not
              // permanently turn the catalog action into a disabled Added
              // button.
              const enabled = enabledOverride ?? skill.enabled
              const installed = installedOverride ?? skill.installed
              const actionLabel = installed ? (enabled ? t("skills.added") : t("skills.enable")) : t("skills.add")
              const pending = busy === stateKey
              return (
                <Card className={styles.catalogCard} key={`${skill.scope}/${skill.name}`}>
                  <CardContent className={styles.catalogCardContent}>
                    <div className={styles.catalogCardHead}>
                      <p>{skill.name}</p>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`${actionLabel} ${skill.name}`}
                        data-installed={installed || undefined}
                        disabled={busy !== null || (installed && enabled)}
                        aria-busy={pending}
                        type="button"
                        onClick={() => onSetEnabled(skill.name, true, stateKey, skill.scope)}
                      >
                        {pending ? <Spinner aria-hidden="true" /> : enabled ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      </Button>
                    </div>
                    {errorName === stateKey ? (
                      <Alert variant="destructive" className={styles.catalogCardError}>
                        <AlertDescription>{t("skills.addError")}</AlertDescription>
                      </Alert>
                    ) : null}
                    <p className={styles.catalogCardDescription}>{skill.description}</p>
                    {skill.updated_at ? <p className={styles.installedCardMeta}><ShieldCheck aria-hidden="true" />{t("skills.updatedAt", { date: formatSkillDate(skill.updated_at) })}</p> : null}
                  </CardContent>
                </Card>
              )
            }) : (
              <Empty className={styles.catalogEmpty} data-testid="skills-catalog-empty">
                <EmptyHeader>
                  <EmptyTitle>{t("skills.noMatch")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Revisions({ client, scope, name }: { client: HubClient; scope: string; name: string }) {
  const t = useT()
  // 版本历史按技能名各存一份缓存键（展开即取，收起不失活——重展开即刻见旧值）。
  const revisions = useResource<SkillRevision[]>(
    skillResourceKey("hub/skill-revisions", client, `${scope}/${name}`),
    useCallback(() => client.skillRevisions(name, scope), [client, name, scope]),
  )
  if (revisions.data === undefined) {
    if (revisions.error !== undefined) {
      return <p className={styles.revHint}>{t("skills.loadError")}</p>
    }
    return <p className={styles.revHint}>{t("skills.loading")}</p>
  }
  if (revisions.data.length === 0) {
    return <p className={styles.revHint}>{t("skills.revEmpty")}</p>
  }
  return (
    <ul className={styles.revList}>
      {revisions.data.map((rev) => (
        <li key={rev.revision} className={styles.revRow}>
          <span>{t("skills.revLabel", { revision: rev.revision })}</span>
          <span className={styles.revMeta}>
            {rev.source} · {formatBytes(rev.package_size)}
          </span>
        </li>
      ))}
    </ul>
  )
}


function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSkillDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(timestamp)
}
