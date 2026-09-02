"use client"

// 设置中心(WEB-FACE 面三):浮在工作区之上的模态卡片面板——左 tab 竖导航 + 右内容区,一次显一个 tab。
// 打开不再导航离开(语境原地保留),关闭走 shadcn Dialog 背幕/Esc/右上 ×。所有管理功能(账户/外观/对话/订阅/
// 技能/连接/作品/团队)统一此处 tab 切换,不再跳独立弹窗或整页。tab 内部自持(initialTab 决定初值,
// onTabChange 上抛给 shell 同步 URL `?settings=`),shell 重开切 tab 时 initialTab 变化即重置。
// 会话态由 AppFrame 保证（仅在信封有效时渲染），本组件不再自持匿名闸。
// 分区内容:账户/外观/对话复用 settings-sections;订阅/技能/连接/作品/团队复用 XxxContent。

import { Fragment, forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react"
import type { LucideIcon, LucideProps } from "lucide-react"
import { cn } from "@/lib/utils"

import { useLocale } from "@/i18n/context"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Cable, Check, ChevronRight, ChevronsUpDown, CircleHelp, CreditCard, Globe, Keyboard, Monitor, MoreHorizontal, Plug, Puzzle, Search, Settings2, Shapes, Sparkles, UserRound, Users } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  browserBillingClient,
  browserEngine,
  browserHubClient,
  browserPricingClient,
  browserTeamClient,
} from "@/ui/shell/page-clients"
import { togglePinned, usePinnedSkills } from "@/ui/shell/use-pinned-skills"
import type { SessionEngine } from "@/engine/machine"
import { SkillsContent } from "@/ui/skills/skills-panel"
import type { SkillCard } from "@/hub/schemas"
import { McpContent } from "@/ui/mcp/mcp-panel"
import { BillingContent } from "@/ui/billing/billing-panel"
import { PricingContent } from "@/ui/billing/pricing-panel"
import { TeamContent } from "@/ui/team/team-panel"

import { AccountCard, AppearanceCard, ChatPrefsCard, DeploymentSettingsCard, IntegrationSettingsCard, MyComputerCard, PersonalizationCard, ShortcutsCard } from "./settings-sections"
import styles from "./settings-modal.module.css"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

const DeploymentNavIcon = forwardRef<SVGSVGElement, LucideProps>(function DeploymentNavIcon(
  props,
  ref,
) {
  const { size, absoluteStrokeWidth, ...svgProps } = props
  void size
  void absoluteStrokeWidth
  return (
    <svg ref={ref} viewBox="0 0 13.333 14.667" fill="currentColor" aria-hidden="true" {...svgProps}>
      <path d="M6.667 6A.667.667 0 0 0 6 5.333H2A.667.667 0 0 0 1.333 6v6.667c0 .368.299.666.667.666h4a.667.667 0 0 0 .667-.666V6ZM12 12.667V2a.667.667 0 0 0-.667-.667h-8A.667.667 0 0 0 2.667 2 .667.667 0 0 1-1.334 0c0-.53.211-1.039.586-1.414A1.999 1.999 0 0 1 3.333 0h8c.53 0 1.039.211 1.414.586.375.375.586.883.586 1.414v10.667c0 .53-.211 1.039-.586 1.414a1.999 1.999 0 0 1-1.414.586h-1.6a.667.667 0 0 1 0-1.334h1.6a.667.667 0 0 0 .667-.666ZM4.007 10.667a.667.667 0 1 1-.007 1.333.667.667 0 0 1 .007-1.333ZM8 12.667a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6.667Z" />
    </svg>
  )
})

export type SettingsTab =
  | "account"
  | "appearance"
  | "personalization"
  | "computer"
  | "deployment"
  | "integration"
  | "chat"
  | "shortcuts"
  | "credits"
  | "subscription"
  | "skills"
  | "mcp"
  | "team"

const SETTINGS_TABS: readonly SettingsTab[] = [
  "account",
  "appearance",
  "personalization",
  "computer",
  "deployment",
  "integration",
  "chat",
  "shortcuts",
  "credits",
  "subscription",
  "skills",
  "mcp",
  "team",
]

type SettingsNavKey = SettingsTab | "help"
type SettingsIntegrationId = "zapier" | "slack" | "telegram" | "line"

const SETTINGS_INTEGRATIONS: readonly SettingsIntegrationId[] = ["zapier", "slack", "telegram", "line"]

function integrationIdFromLocation(): SettingsIntegrationId | null {
  if (typeof window === "undefined") return null
  const match = window.location.hash.match(/^#\/account\/settings\/integration\/([^/?#]+)$/)
  const value = match?.[1]
  return SETTINGS_INTEGRATIONS.find((id) => id === value) ?? null
}

function isFocusTargetAvailable(target: HTMLElement | null): target is HTMLElement {
  if (!target || !target.isConnected || target.hasAttribute("disabled")) {
    return false
  }
  // The shell marks its stable return controls explicitly. During a portal
  // close their computed style can be empty for one frame, but they remain
  // the correct focus destination.
  if (target.hasAttribute("data-settings-return-target")) {
    return true
  }
  // A hidden trigger is not a useful focus target after a shell transition.
  if (target.matches('[data-sidebar="trigger"], [data-slot="sidebar-trigger"]')) {
    const rect = target.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const style = window.getComputedStyle(target)
  return style.display !== "none" && style.visibility !== "hidden"
}

// 外部值(URL `?settings=`)归一到已知 tab。Manus 的公开深链使用
// `general`，而 User Web 内部面板名是 `appearance`；两者必须落到同一
// 个面板，不能因为复制 URL 后回退到「账户」。
export function normalizeSettingsTab(value: string | null | undefined): SettingsTab {
  if (value === "general") {
    return "appearance"
  }
  return SETTINGS_TABS.find((key) => key === value) ?? "account"
}

type SettingsModalProps = {
  /** Reuse the shell's scope-owned engine; project settings must not create a direct-chat engine. */
  engine?: SessionEngine | null
  // 服务端按 host 解析的站点品牌名(SITE-REAL);缺省回退 Kokoro。
  brandName?: string
  preview?: boolean
  // 打开时的初始 tab(shell 从入口/URL 传入);变化即重置内部 tab(支持重开切 tab)。
  initialTab: SettingsTab
  onClose: () => void
  /** Controlled Dialogs have no trigger in the shell; return focus to the invoking control. */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Optional shell scope for fallback focus recovery when multiple sites are embedded. */
  focusScopeRef?: RefObject<HTMLElement | null>
  // 内部切 tab 时上抛,供 shell 同步 URL `?settings=`(刷新/深链/可分享)。
  onTabChange?: (tab: SettingsTab) => void
  onStartDeployment?: (kind: "website" | "app") => void
  onCreateSkillWithAi?: () => void
  onTrySkill?: (skill: SkillCard) => void
}

export function SettingsModal({
  engine,
  brandName,
  preview = false,
  initialTab,
  onClose,
  onTabChange,
  returnFocusRef,
  focusScopeRef,
  onStartDeployment,
  onCreateSkillWithAi,
  onTrySkill,
}: SettingsModalProps) {
  const { t } = useLocale()
  // 内部自持选中 tab,初值取 initialTab。shell 主动开到不同 tab 时以 key 重挂载本组件重置初值
  // (故此处无需 effect 同步 initialTab);内部切 tab 不改 shell 态、不重挂,选中态自然保持。
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [navQuery, setNavQuery] = useState("")
  const [integrationId, setIntegrationId] = useState<SettingsIntegrationId | null>(() => initialTab === "integration" ? integrationIdFromLocation() : null)
  const [accountLoginMethods, setAccountLoginMethods] = useState(false)
  const [domainUpgradeOpen, setDomainUpgradeOpen] = useState(false)
  const domainUpgradeReturnRef = useRef<HTMLElement | null>(null)
  const domainUpgradeWasOpenRef = useRef(false)
  const [navScrollbar, setNavScrollbar] = useState({ height: 0, top: 2 })
  const { open, requestClose } = useOverlayClose(onClose)
  const activeTabRef = useRef<HTMLButtonElement | null>(null)
  const tabListRef = useRef<HTMLDivElement | null>(null)
  // Keep one injected Hub client for the lifetime of the settings surface.
  // Besides avoiding duplicate providers in one render, this makes the
  // resource cache's client scope stable when a test/site supplies a factory
  // instead of a process singleton.
  const hubClient = useMemo(() => browserHubClient({ preview }), [preview])
  // 团队切换器高亮当前 namespace:undefined=未取,null=预览/无信封,string=当前 team id。
  const [teamNs, setTeamNs] = useState<string | null | undefined>(undefined)
  const pinnedSkillsEngine = useMemo(
    () => engine === undefined ? browserEngine({ preview }) : engine,
    [engine, preview],
  )
  const pinnedSkills = usePinnedSkills(pinnedSkillsEngine)

  useEffect(() => {
    const wasOpen = domainUpgradeWasOpenRef.current
    domainUpgradeWasOpenRef.current = domainUpgradeOpen
    if (!wasOpen || domainUpgradeOpen) return
    // The nested Radix focus scope restores the parent dialog first. Handoff
    // after its close animation so the deployment action, not the first rail
    // tab, becomes the final keyboard destination.
    const timer = window.setTimeout(() => domainUpgradeReturnRef.current?.focus({ preventScroll: true }), 220)
    return () => window.clearTimeout(timer)
  }, [domainUpgradeOpen])

  // 进入团队 tab 且 ns 未取时拉当前 namespace(切 tab 走 selectTab 会置回 undefined 触发重取)。
  useEffect(() => {
    if (tab !== "team" || teamNs !== undefined) {
      return
    }
    let live = true
    void browserTeamClient({ preview })
      .currentNamespace()
      .then((ns) => live && setTeamNs(ns))
      .catch(() => live && setTeamNs(null))
    return () => {
      live = false
    }
  }, [preview, tab, teamNs])

  const selectTab = (next: SettingsTab): void => {
    setTab(next)
    if (next === "team") {
      setTeamNs(undefined) // 每次进团队重取 ns(切换后回来反映新态)。
    }
    if (next !== "integration") setIntegrationId(null)
    if (next !== "account") setAccountLoginMethods(false)
    onTabChange?.(next)
  }

  const selectIntegration = (next: SettingsIntegrationId | null): void => {
    setIntegrationId(next)
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.delete("settings")
    url.hash = next === null
      ? "#/account/settings/integration"
      : `#/account/settings/integration/${next}`
    window.history.replaceState(window.history.state, "", url)
  }

  const nav: { key: SettingsNavKey; label: string; icon: LucideIcon; available?: boolean }[] = [
    { key: "appearance", label: t("settings.generalTitle"), icon: Settings2 },
    { key: "account", label: t("settings.accountTitle"), icon: UserRound },
    // Match Manus' settings icon language: usage is a sparkle/points surface
    // and the keyboard shortcut surface uses a keyboard glyph, while the
    // underlying Kokoro routes remain the existing typed SettingsTab values.
    { key: "credits", label: t("settings.creditsTitle"), icon: Sparkles },
    { key: "shortcuts", label: t("settings.shortcutsNavTitle"), icon: Keyboard },
    // Kokoro-specific conversation defaults stay available from More so the
    // primary rail preserves Manus' general/account/usage/shortcut rhythm.
    { key: "chat", label: t("settings.chatTitle"), icon: Keyboard },
    { key: "personalization", label: t("settings.personalizationTitle"), icon: Shapes },
    { key: "subscription", label: t("settings.subTitle"), icon: CreditCard },
    { key: "mcp", label: t("connectorCatalog.title"), icon: Cable },
    { key: "skills", label: t("rail.navSkills"), icon: Puzzle },
    { key: "computer", label: t("settings.computerTitle"), icon: Monitor },
    { key: "deployment", label: t("settings.deploymentTitle"), icon: DeploymentNavIcon },
    { key: "integration", label: t("settings.integrationTitle"), icon: Plug },
    { key: "team", label: t("rail.navTeams"), icon: Users },
    { key: "help", label: t("settings.helpTitle"), icon: CircleHelp, available: false },
  ]
  const normalizedNavQuery = navQuery.trim().toLocaleLowerCase()
  const visibleNav = normalizedNavQuery.length === 0
    ? nav
    : nav.filter((entry) => entry.key === tab || entry.label.toLocaleLowerCase().includes(normalizedNavQuery))
  const renderedNav = visibleNav
  const compactTabs: readonly SettingsNavKey[] = ["appearance", "account", "credits", "shortcuts", "personalization", "mcp"]

  const syncNavScrollbar = (list: HTMLDivElement): void => {
    const maxScroll = list.scrollHeight - list.clientHeight
    if (maxScroll <= 0 || list.clientHeight <= 0) {
      setNavScrollbar({ height: 0, top: 2 })
      return
    }
    const height = Math.floor((list.clientHeight - 6) * (list.clientHeight / list.scrollHeight))
    const travel = list.clientHeight - 4 - height
    const top = 2 + Math.round((list.scrollTop / maxScroll) * travel)
    setNavScrollbar({ height, top })
  }

  // Keep the rail scrollable while preventing stale focus scroll from
  // leaving the first row underneath its clipping boundary.
  useLayoutEffect(() => {
    const list = tabListRef.current
    const active = activeTabRef.current
    if (!list || !active) return

    if (tab === "appearance") {
      list.scrollTop = 0
      syncNavScrollbar(list)
      return
    }

    const listRect = list.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    list.scrollTop += activeRect.top + activeRect.height / 2 - (listRect.top + listRect.height / 2)
    syncNavScrollbar(list)
  }, [tab, normalizedNavQuery])

  useEffect(() => {
    let frame = 0
    const alignSelectedTab = () => {
      const list = tabListRef.current
      const active = activeTabRef.current
      if (!list || !active) return
      if (tab === "appearance") {
        list.scrollTop = 0
        syncNavScrollbar(list)
        return
      }
      const listRect = list.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      list.scrollTop += activeRect.top + activeRect.height / 2 - (listRect.top + listRect.height / 2)
      syncNavScrollbar(list)
    }
    frame = window.requestAnimationFrame(alignSelectedTab)
    return () => window.cancelAnimationFrame(frame)
  }, [tab, normalizedNavQuery])

  // A general-settings deep link can mount before Radix has forwarded the
  // active trigger ref used above. Resize correction must therefore depend
  // only on the stable list ref, otherwise browser zoom can preserve a stale
  // half-row scroll position until the user switches tabs.
  useEffect(() => {
    if (tab !== "appearance") return
    let frame = 0
    const resetGeneralRail = () => {
      const list = tabListRef.current
      if (!list) return
      list.scrollTop = 0
      syncNavScrollbar(list)
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        list.scrollTop = 0
        syncNavScrollbar(list)
      })
    }
    resetGeneralRail()
    window.addEventListener("resize", resetGeneralRail)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", resetGeneralRail)
    }
  }, [tab])

  const renderPanel = (panelTab: SettingsTab) => (
    <>
      {panelTab === "account" ? <AccountCard brandName={brandName} preview={preview} loginMethodsOpen={accountLoginMethods} onLoginMethodsChange={setAccountLoginMethods} /> : null}
      {panelTab === "appearance" ? <AppearanceCard brandName={brandName} /> : null}
      {panelTab === "personalization" ? <PersonalizationCard preview={preview} /> : null}
      {panelTab === "computer" ? <MyComputerCard brandName={brandName} preview={preview} /> : null}
      {panelTab === "deployment" ? (
        <DeploymentSettingsCard
          onStart={onStartDeployment}
          onBuyDomain={() => {
            domainUpgradeReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            setDomainUpgradeOpen(true)
          }}
        />
      ) : null}
      {panelTab === "integration" ? <IntegrationSettingsCard brandName={brandName} preview={preview} selected={integrationId} onSelect={selectIntegration} /> : null}
      {panelTab === "chat" ? <ChatPrefsCard preview={preview} /> : null}
      {panelTab === "shortcuts" ? <ShortcutsCard /> : null}
      {panelTab === "credits" ? (
        <BillingContent
          client={browserBillingClient({ preview })}
          onOpenPricing={() => selectTab("subscription")}
          embedded
        />
      ) : null}
      {panelTab === "subscription" ? <PricingContent client={browserPricingClient({ preview })} embedded /> : null}
      {panelTab === "skills" ? (
        <SkillsContent
          client={hubClient}
          brandName={brandName}
          pinned={pinnedSkills}
          onTogglePin={togglePinned}
          onTrySkill={onTrySkill}
          onCreateWithAi={onCreateSkillWithAi}
          embedded
        />
      ) : null}
      {panelTab === "mcp" ? <McpContent client={hubClient} embedded brandName={brandName} /> : null}
      {panelTab === "team" ? (
        <TeamContent
          client={browserTeamClient({ preview })}
          currentNamespace={teamNs ?? null}
          onSwitched={() => window.location.reload()}
          embedded
        />
      ) : null}
    </>
  )

  return (
    <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.dialogContent, "p-0 box-border")}
        data-testid="settings-modal"
        closeLabel={t("settings.close")}
        closeButtonTestId="settings-close"
        overlayClassName={styles.settingsOverlay}
        onPointerDownOutside={(event) => {
          // Skills, connector and import dialogs are portalled outside this
          // content. Treat their content/overlay as an owned nested surface;
          // otherwise Radix bubbles the pointer as an outside click and
          // closes Settings when a nested action is merely being confirmed.
          const target = event.target
          if (target instanceof Element && (
            target.closest('[data-slot="dialog-content"]') !== null
            // DropdownMenu content is portalled to document.body. Without
            // treating it as an owned child surface, selecting Skills →
            // Create → GitHub is seen as an outside click and the Settings
            // dialog unmounts before the repository dialog can open.
            || target.closest('[data-slot="dropdown-menu-content"]') !== null
            || (target.closest('[data-slot="dialog-overlay"]') !== null
              && document.querySelectorAll('[data-slot="dialog-content"][data-state="open"]').length > 1)
          )) {
            event.preventDefault()
          } else if (document.querySelector('[data-slot="dropdown-menu-content"][data-state="open"]') !== null) {
            // Radix can report a portalled menu item's pointer event with the
            // trigger/content boundary as the outside target. The open-menu
            // check is the stable guard: selecting an item must not tear down
            // Settings before its handoff callback opens the next surface.
            event.preventDefault()
          }
        }}
        onOpenAutoFocus={(event) => {
          // This controlled Dialog has no DialogTrigger for Radix to infer a
          // useful entry point from. Start keyboard users on the selected tab
          // instead of leaving focus on the rail trigger/body.
          event.preventDefault()
          activeTabRef.current?.focus({ preventScroll: true })
          window.requestAnimationFrame(() => {
            activeTabRef.current?.focus({ preventScroll: true })
            if (tab === "appearance") {
              const list = tabListRef.current
              if (list) list.scrollTop = 0
            }
          })
        }}
        onCloseAutoFocus={(event) => {
          const scope = focusScopeRef?.current ?? document
          const fallback = scope.querySelector<HTMLElement>(
            '[data-settings-return-target="composer"]:not([disabled])',
          )
          const rememberedTarget = returnFocusRef?.current ?? null
          const target = isFocusTargetAvailable(rememberedTarget) ? rememberedTarget : fallback
          if (!target) {
            return
          }
          event.preventDefault()
          target.focus({ preventScroll: true })
        }}
      >
        <DialogTitle className={styles.desktopTitle}>{t("settings.title")}</DialogTitle>
      <Tabs
        // Settings is one horizontal tab model; it does not switch layout
        // modes as the browser viewport changes.
        orientation="horizontal"
        value={tab}
        onValueChange={(value) => selectTab(value as SettingsTab)}
        className={styles.tabs}
      >
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label={t("settings.title")}>
          <div className={styles.brand}>
            <div className={styles.brandIdentity}>
              <Avatar className={styles.brandAvatar}>
                <AvatarFallback>{(brandName ?? "K").trim().charAt(0).toUpperCase() || "K"}</AvatarFallback>
              </Avatar>
              <div className={styles.brandCopy}>
                <p className={styles.brandName}>{brandName ?? "Workspace"}</p>
                <span className={styles.brandMeta}>{t("rail.userMenuScope")}</span>
              </div>
              <ChevronsUpDown className={styles.brandSwitcher} aria-hidden="true" />
            </div>
          </div>
          <label className={styles.settingsSearch}>
            <Search aria-hidden="true" />
            <Input
              value={navQuery}
              aria-label={t("settings.search")}
              placeholder={t("settings.search")}
              onChange={(event) => setNavQuery(event.target.value)}
            />
          </label>
          <div className={styles.tabRail}>
            <TabsList ref={tabListRef} className={styles.tabList} variant="line" onScroll={(event) => syncNavScrollbar(event.currentTarget)}>
                {renderedNav.map((entry) => {
                  const { key, label, icon: Icon } = entry
                  const groupLabel = key === "appearance"
                    ? t("settings.groupGeneral")
                    : key === "personalization"
                      ? t("settings.groupFeatures")
                    : null
                  return (
                    <Fragment key={key}>
                      {groupLabel ? <div className={styles.sectionLabel} aria-hidden="true">{groupLabel}</div> : null}
                      <TabsTrigger
                        value={key}
                        className={styles.tab}
                        disabled={entry.available === false}
                        ref={key === tab ? activeTabRef : undefined}
                        id={`settings-tab-${key}`}
                        data-testid={`settings-tab-${key}`}
                        data-desktop-secondary={compactTabs.includes(key) || normalizedNavQuery.length > 0 ? undefined : "true"}
                        data-settings-help={key === "help" ? "true" : undefined}
                        data-settings-chat={key === "chat" ? "true" : undefined}
                        data-settings-team={key === "team" ? "true" : undefined}
                        data-settings-subscription={key === "subscription" ? "true" : undefined}
                        data-settings-integration={key === "integration" ? "true" : undefined}
                      >
                        <Icon aria-hidden="true" />
                        <span className={styles.tabLabel}>{label}</span>
                      </TabsTrigger>
                    </Fragment>
                  )
                })}
              </TabsList>
              <span
                className={styles.navScrollbar}
                data-testid="settings-nav-scrollbar"
                data-visible={navScrollbar.height > 0 || undefined}
                style={{
                  height: `${navScrollbar.height}px`,
                  transform: `translateY(${navScrollbar.top}px)`,
                } as CSSProperties}
                aria-hidden="true"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={styles.moreTrigger}
                    aria-label={t("settings.moreSections")}
                    data-testid="settings-more"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className={styles.moreMenu}>
                  {nav.filter(({ key, available = true }) => !compactTabs.includes(key) && available).map(({ key, label }) => (
                    <DropdownMenuItem key={key} onSelect={() => selectTab(key as SettingsTab)}>
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </nav>

        {SETTINGS_TABS.map((panelTab) => (
          <TabsContent
            key={panelTab}
            value={panelTab}
            className={styles.content}
            data-testid={`settings-panel-${panelTab}`}
          >
            {panelTab === tab ? (
              <ScrollArea
                key={panelTab}
                className={cn(
                  styles.contentBody,
                  panelTab === "shortcuts" && styles.shortcutsBody,
                  panelTab === "mcp" && styles.mcpBody,
                )}
                tabIndex={0}
              >
                <div className={styles.contentColumn}>
                  <header
                    className={styles.panelHeader}
                    data-panel={panelTab}
                    data-with-description={panelTab === "shortcuts" || panelTab === "personalization" || (panelTab === "integration" && integrationId === null) || undefined}
                  >
                    <h1 className={styles.panelTitle}>
                      {panelTab === "account" && accountLoginMethods ? (
                        <>
                          <button type="button" className={styles.panelBack} onClick={() => setAccountLoginMethods(false)} aria-label={t("settings.loginMethod") }>
                            <ChevronRight aria-hidden="true" />
                          </button>
                          <span>{t("settings.loginMethod")}</span>
                        </>
                      ) : panelTab === "integration" && integrationId !== null ? (
                        <>
                          <button type="button" className={styles.panelBack} onClick={() => selectIntegration(null)} aria-label={t("settings.integrationBack")}>
                            <ChevronRight aria-hidden="true" />
                          </button>
                          <span>{integrationId === "line" ? "LINE" : t(`settings.integration.${integrationId}.name`)}</span>
                        </>
                      ) : panelTab === "mcp"
                        ? t("mcp.title")
                        : panelTab === "appearance"
                          ? t("settings.generalTitle")
                          : panelTab === "shortcuts"
                            ? t("settings.shortcutsTitle")
                          : panelTab === "skills"
                            ? t("skills.addedTitle")
                        : nav.find((entry) => entry.key === panelTab)?.label
                          ?? (panelTab === "subscription" ? t("settings.subTitle") : "")}
                    </h1>
                    {panelTab === "shortcuts" ? (
                      <p className={styles.panelDescription}>{t("settings.shortcutsDescription")}</p>
                    ) : panelTab === "personalization" ? (
                      <p className={styles.panelDescription}>{t("settings.personalizationDescription")}</p>
                    ) : panelTab === "integration" && integrationId === null ? (
                      <p className={styles.panelDescription}>{t("settings.integrationDescription")}</p>
                    ) : null}
                  </header>
                  {renderPanel(panelTab)}
                </div>
              </ScrollArea>
            ) : null}
          </TabsContent>
        ))}
      </div>
      </Tabs>
      </DialogContent>
    </Dialog>
    <Dialog open={domainUpgradeOpen} onOpenChange={setDomainUpgradeOpen}>
      {domainUpgradeOpen ? (
        <DialogPortal>
          <div className={styles.domainUpgradeToast} data-testid="domain-upgrade-toast" role="status">
            <Check aria-hidden="true" />
            <span>{t("settings.upgradeRequired")}</span>
          </div>
        </DialogPortal>
      ) : null}
      <DialogContent
        className={styles.domainUpgradeDialog}
        overlayClassName={styles.domainUpgradeOverlay}
        closeLabel={t("shell.closeDialog")}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
        }}
      >
        <Globe className={styles.domainUpgradeIcon} aria-hidden="true" />
        <div className={styles.domainUpgradeCopy}>
          <DialogTitle>{t("settings.domainUpgradeTitle")}</DialogTitle>
          <DialogDescription>{t("settings.domainUpgradeDescription", { brand: brandName ?? "Kokoro" })}</DialogDescription>
        </div>
        <DialogFooter className={styles.domainUpgradeActions}>
          <DialogClose asChild>
            <Button type="button" variant="ghost">{t("firstSite.cancel")}</Button>
          </DialogClose>
          <Button
            type="button"
            onClick={() => {
              setDomainUpgradeOpen(false)
              selectTab("subscription")
            }}
          >
            {t("settings.upgradeNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
