import { type CSSProperties, type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject, type SVGProps } from "react"
import Link from "next/link"
import { ArrowUpRight, Bell, ChevronRight, ChevronsUpDown, CircleHelp, FileText, Folder, Grid2X2, Home, ListFilter, ListTodo, LogOut, MessageSquareMore, Pencil, Plus, Search, SlidersHorizontal, Sparkles, SquarePen, UserRound, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DEFAULT_BRAND } from "@/config/brand"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { formatCredits } from "@/billing/format"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BrandFallback, BrandMark } from "@/components/blocks/brand-mark/brand-mark"

import { useT } from "@/i18n/context"
import { browserBillingClient, browserTeamClient } from "@/ui/shell/page-clients"
import type { SettingsTab } from "@/ui/settings/settings-modal"

import { filterConversations, type ConversationSummary } from "@/ui/rail/rail-search"
import { RAIL_COLLAPSED_WIDTH } from "@/ui/rail/use-rail-resize"
import { cn } from "@/lib/utils"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"
import { isRuntimeNavigationEnabled, navigationIcon, registeredNavigationRoute } from "@/ui/navigation/runtime-navigation-registry"
import { WorkspaceInviteCard } from "./workspace-invite-card"
import styles from "./workspace-rail.module.css"
import notificationStyles from "@/ui/notifications/notification-panel.module.css"
import { NotificationPanel } from "@/ui/notifications/notification-panel"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

function markPointerFocus(event: PointerEvent<HTMLElement>): void {
  // Chromium can keep :focus-visible after a pointer navigation in a compact
  // rail. Preserve keyboard focus semantics, but mark pointer focus so the
  // rail can suppress that distracting outline while the route settles.
  const pointerType = event.pointerType as string
  if (pointerType !== "mouse" && pointerType !== "pen" && pointerType !== "") return
  const target = event.currentTarget
  target.dataset.pointerFocus = "true"
  target.addEventListener("blur", () => delete target.dataset.pointerFocus, { once: true })
}

function ComputerStatusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg data-slot="computer-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="4" width="16" height="12" rx="2" />
      <path d="M7 20h7.5M10.5 16v4" />
      <circle cx="19" cy="16" r="2.5" fill="var(--sidebar)" />
    </svg>
  )
}

export type WorkspaceRailProps = {
  // AppFrame owns the shadcn SidebarProvider. Standalone tests/embeds keep
  // the provider here so the rail remains a self-contained primitive.
  withinProvider?: boolean
  /** Narrow fine-pointer Web hides the rail track and uses the header menu. */
  compactDesktopRail?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onNewChat: () => void
  // 服务端按 host 解析的站点品牌名（SITE-REAL）；缺省回退硬编码 Kokoro。
  brandName?: string
  /** Site-owned mark/logo; the rail reserves the reference lockup slot. */
  brandMark?: string
  brandLogoUrl?: string
  /** Undefined means the site-owned default menu; [] is an intentional empty live menu. */
  navigation?: readonly RuntimeNavigationItem[]
  featureFlags?: readonly RuntimeFeatureFlag[]
  /** Site-owned route for the active conversation surface. */
  chatHref: string
  /** Site-owned project overview route. */
  projectHref?: string
  projectActive?: boolean
  /** Optional host action for the project-creation menu entry. */
  onCreateProject?: () => void
  /** Route-owned active state for direct and catalog destinations. */
  activeNavigationKey?: string
  conversations: ConversationSummary[]
  activeId: string | null
  // 待批会话 id 集（HITL-NOTIFY）：命中的条目上挂待批徽标（跨会话可见性）。
  awaitingIds: ReadonlySet<string>
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onRequestDelete?: (conversation: ConversationSummary) => void
  /** Stable desktop fallback after a destructive delete removes the opener row. */
  deleteDialogFallbackFocusRef?: RefObject<HTMLButtonElement | null>
  /** Shell-owned focus target for settings opened from the portaled account menu. */
  accountTriggerRef?: RefObject<HTMLButtonElement | null>
  // 会话重命名（CONV-UX）：提交非空新题；乐观更新 + 失败回滚由上层处理。
  onRenameConversation: (id: string, title: string) => void
  // 打开设置中心模态到指定 tab（WEB-FACE 面三）：管理入口不再整页导航,浮层叠在工作区之上。
  onOpenSettings: (tab: SettingsTab) => void
  /** Bottom utility action opens the floating notification center, not Settings. */
  onOpenNotifications?: (returnTarget?: HTMLElement | null) => void
  preview?: boolean
  // 清单服务端水合态（SESS-LIST）：加载/错误态与滚动翻页入口。
  listLoading: boolean
  listLoadingMore?: boolean
  listError: boolean
  onRetryList?: () => void
  hasMore: boolean
  onLoadMore: () => void
}

function WorkspaceRailContent({
  compactDesktopRail = false,
  onNewChat,
  brandName,
  brandMark,
  brandLogoUrl,
  navigation,
  featureFlags,
  chatHref,
  projectHref,
  projectActive = false,
  onCreateProject,
  activeNavigationKey,
  conversations,
  activeId,
  awaitingIds,
  onSelectConversation,
  onRequestDelete = () => {},
  deleteDialogFallbackFocusRef,
  onRenameConversation,
  onOpenSettings,
  onOpenNotifications,
  accountTriggerRef,
  preview = false,
  listLoading,
  listLoadingMore = false,
  listError,
  onRetryList,
  hasMore,
  onLoadMore,
}: WorkspaceRailProps) {
  const t = useT()
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar()
  const visualCollapsed = state === "collapsed"
  const compactDesktop = !isMobile && visualCollapsed
  // These desktop routes are committed by mounted-surface history projection,
  // so Next's default viewport/hover RSC prefetch is redundant work. Keep the
  // touch Sheet's native Link behavior unchanged.
  const mountedSurfacePrefetch = isMobile ? undefined : false
  // The narrow desktop shell removes the rail from layout altogether. Keep
  // only the header menu reachable in that state; the normal 52px rail still
  // owns its brand trigger on wide desktop.
  const showCollapsedBrand = compactDesktop && !compactDesktopRail
  const navigationExpanded = !compactDesktop

  // The compact brand remains mounted while the rail expands. Clear a pointer
  // handoff marker left on that node before a later keyboard collapse can
  // inherit stale styling; this is focus bookkeeping, not tooltip state.
  useEffect(() => {
    if (!isMobile && !compactDesktop) {
      const expandedBrand = railRootRef.current?.querySelector<HTMLElement>('[data-collapsed-brand="true"]')
      if (expandedBrand) delete expandedBrand.dataset.pointerFocus
    }
  }, [compactDesktop, isMobile])
  const closeNavigation = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])
  // Direct chat and project task creation are separate entry points. The
  // desktop shell is shared by both routes, so the route state, rather than
  // the Web skin marker, decides which label and intent to expose.
  // The global action is named by intent in the reference shell. Direct chats
  // remain a separate list below the project section, so this does not merge
  // the two scopes.
  const newSessionLabel = t("firstSite.newTask")
  // Runtime tenant marks and uploaded logos remain authoritative. The local
  // fallback is a neutral product glyph, not the old Manus-like hand or a
  // language-specific character, so the lockup works across site locales.
  const fallbackBrandMark = <BrandFallback mark={brandMark} className={styles.brandFallbackIcon} />
  const enabledNavigation = navigation?.filter((item) => isRuntimeNavigationEnabled(item, featureFlags))
  const workbenchNavigation = (enabledNavigation ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    // Keep the runtime keys aligned with the Manus desktop icon language:
    // Agent is the conversation/bubble stop, while Skills is the puzzle stop.
    // The icon is a visual contract, so it must not drift when labels are
    // localized or supplied by a live manifest.
    icon: navigationIcon(item.key),
    settingsTab: registeredNavigationRoute(item.key)?.settingsTab,
    href: registeredNavigationRoute(item.key)?.href,
  }))
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [taskOrder, setTaskOrder] = useState<"recent" | "name">("recent")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const railRootRef = useRef<HTMLDivElement | null>(null)
  const toggleFocusRef = useRef<{ mode: "collapsed" | "expanded"; pointer: boolean } | null>(null)
  const togglePointerRef = useRef(false)

  // Focus handoff belongs to the committed provider state, not to the click
  // event's pre-toggle DOM. This prevents expansion from focusing the hidden
  // compact trigger when React has not committed the new head yet.
  useLayoutEffect(() => {
    const targetMode = toggleFocusRef.current
    if (targetMode === null) return
    toggleFocusRef.current = null
    const target = targetMode.mode === "expanded"
      ? railRootRef.current?.querySelector<HTMLElement>('[data-rail-anchor="rail-toggle"]')
      : railRootRef.current?.querySelector<HTMLElement>('[data-collapsed-brand="true"]')
    if (!target || target.getAttribute("aria-hidden") === "true") return
    if (targetMode.mode === "collapsed" && targetMode.pointer) {
      target.dataset.pointerFocus = "true"
      target.addEventListener("blur", () => delete target.dataset.pointerFocus, { once: true })
    }
    target.focus({ preventScroll: true })
  }, [visualCollapsed])

  // 会话重命名内联编辑态（CONV-UX）：editingId 命中的条目以输入框替换标题。
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameReturnIdRef = useRef<string | null>(null)
  const renameRestoreFocusRef = useRef(false)

  // 打开搜索即聚焦输入框，省去一次额外点击。
  useEffect(() => {
    if (!searchOpen) {
      return
    }
    // Collapsed desktop search first asks the shadcn provider to expand the
    // rail. Focus after the layout commit, and repeat when visualCollapsed
    // changes, so the first focus attempt never gets stranded on a hidden
    // input during the width transition.
    searchInputRef.current?.focus()
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [searchOpen, visualCollapsed])

  // 进入编辑即聚焦并全选，改题一气呵成。
  useEffect(() => {
    if (editingId !== null) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [editingId])

  const startRename = (id: string, current: string) => {
    renameReturnIdRef.current = id
    renameRestoreFocusRef.current = false
    setEditingId(id)
    setDraftTitle(current)
  }
  const focusRenamedConversation = () => {
    const id = renameReturnIdRef.current
    if (!id) return
    window.requestAnimationFrame(() => {
      const target = [...(railRootRef.current?.querySelectorAll<HTMLElement>('[data-conversation-id]') ?? [])]
        .find((element) => element.dataset.conversationId === id)
      target?.focus()
    })
  }
  const cancelRename = (restoreFocus = false) => {
    // Keep a keyboard-submit handoff if removing the input emits a trailing
    // blur. A pointer blur alone never sets this flag and therefore does not
    // steal focus from the control the user moved to.
    renameRestoreFocusRef.current = restoreFocus || renameRestoreFocusRef.current
    setEditingId(null)
    setDraftTitle("")
    if (renameRestoreFocusRef.current) focusRenamedConversation()
  }
  // 提交：非空且与原题不同才上抛（空题/未改动直接收工，不触发请求）。
  const commitRename = (current: string, restoreFocus = false) => {
    const value = draftTitle.trim()
    if (editingId !== null && value !== "" && value !== current) {
      onRenameConversation(editingId, value)
    }
    cancelRename(restoreFocus)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery("")
    // Keep Escape and the explicit X close equally reversible: the next
    // keyboard action should continue from the search toggle, not disappear
    // into the rail container or document body.
    window.requestAnimationFrame(() => searchToggleRef.current?.focus())
  }

  // The collapsed desktop rail still exposes search as a first-class action.
  // Expand the shadcn sidebar before revealing the field so the control never
  // opens into an invisible panel or leaves the user in an ambiguous state.
  const openSearch = () => {
    if (compactDesktop) {
      setOpen(true)
    }
    setSearchOpen(true)
  }

  const openSettings = (tab: SettingsTab) => {
    onOpenSettings(tab)
  }

  const filtered = filterConversations(conversations, query)
  const ordered = taskOrder === "name"
    ? [...filtered].sort((left, right) => left.title.localeCompare(right.title))
    : filtered
  const hasConversations = conversations.length > 0

  return (
    <Sidebar
      side="left"
      collapsible="icon"
      className={styles.sidebar}
      data-desktop-web="true"
    >
      <div
        ref={railRootRef}
        className={styles.rail}
        aria-label={t("rail.railAria")}
        data-collapsed={visualCollapsed}
        data-active-navigation-key={activeNavigationKey ?? "none"}
        data-desktop-web="true"
        data-desktop-rail={!isMobile ? "true" : undefined}
      >
      <SidebarHeader className={styles.head}>
        <SidebarTrigger
          className={styles.collapsedBrand}
          data-collapsed-brand="true"
          data-rail-anchor="top-brand"
          type="button"
          aria-label={t("rail.expandAria")}
          title={t("rail.expandAria")}
          tabIndex={showCollapsedBrand ? 0 : -1}
          aria-hidden={!showCollapsedBrand}
          onPointerDown={(event) => {
            const pointerType = event.pointerType as string
            togglePointerRef.current = pointerType === "mouse" || pointerType === "pen" || pointerType === ""
            markPointerFocus(event)
          }}
          onClick={(event) => {
            const pointerActivation = togglePointerRef.current || event.detail > 0
            toggleFocusRef.current = { mode: "expanded", pointer: pointerActivation }
            togglePointerRef.current = false
          }}
        >
          <span className={styles.brandMark} aria-hidden="true">
            <BrandMark logoUrl={brandLogoUrl} imageClassName={styles.brandLogo} fallback={fallbackBrandMark} />
          </span>
        </SidebarTrigger>
        {!compactDesktop ? <Link
          className={styles.brand}
          href={chatHref}
          prefetch={mountedSurfacePrefetch}
          aria-label={brandName ?? "Workspace"}
          tabIndex={0}
          onClickCapture={(event) => interceptMountedSurfaceNavigation(event, chatHref)}
        >
          <span className={styles.brandMark} aria-hidden="true">
            <BrandMark logoUrl={brandLogoUrl} imageClassName={styles.brandLogo} fallback={fallbackBrandMark} />
          </span>
          <div className={styles.brandText}>
            <p className={styles.brandTitle}>{brandName ?? "Workspace"}</p>
          </div>
        </Link> : null}

        {!compactDesktop ? <div className={styles.headActions}>
          {/* 搜索切换：仅过滤本地「最近」列表，故收起态（列表已隐藏）不显此键。 */}
          <Button variant="ghost"
            size="icon-sm"
            className={cn(styles.headBtn, styles.searchToggle)}
            ref={searchToggleRef}
            type="button"
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
            aria-label={t("rail.searchAria")}
            aria-expanded={searchOpen}
            aria-pressed={searchOpen}
          >
            <Search className={styles.icon} />
          </Button>
          {/* The trigger already exposes its state through aria-label and the
              shadcn focus ring. Wrapping it in Tooltip makes the post-click
              focus handoff open a label over the page exactly when the rail
              collapses, obscuring the project identity. */}
          <SidebarTrigger
            size="icon-sm"
            className={styles.headBtn}
            type="button"
            data-rail-anchor="rail-toggle"
            data-web-navigation-trigger={!isMobile && (!compactDesktopRail || !compactDesktop) ? "true" : undefined}
            aria-hidden={compactDesktopRail && compactDesktop ? true : undefined}
            tabIndex={compactDesktopRail && compactDesktop ? -1 : undefined}
            aria-label={compactDesktop ? t("rail.expandAria") : t("rail.collapseAria")}
            aria-expanded={navigationExpanded}
            onPointerDown={(event) => {
              const pointerType = event.pointerType as string
              togglePointerRef.current = pointerType === "mouse" || pointerType === "pen" || pointerType === ""
              markPointerFocus(event)
            }}
            onClick={(event) => {
              const wasCollapsed = compactDesktop
              // Synthetic click tests and some browser automation omit
              // pointerdown but retain a non-zero click detail. Treat that
              // as the same pointer intent; keyboard activation has detail 0.
              const pointerActivation = togglePointerRef.current || event.detail > 0
              toggleFocusRef.current = { mode: wasCollapsed ? "expanded" : "collapsed", pointer: pointerActivation }
              togglePointerRef.current = false
              if (!compactDesktop && searchOpen) {
                // Collapsing the rail removes the search surface. Do not keep
                // a hidden query alive and reopen it on the next expansion.
                setSearchOpen(false)
                setQuery("")
              }
              // The trigger is replaced by a different header control after
              // the provider state flips. Return focus to the control that is
              // actually visible after that commit. Focusing the hidden
              // compact trigger while expanding leaves a stale focus ring and
              // can make a tooltip appear during the width handoff.
            }}
          />
        </div> : null}
      </SidebarHeader>

      {searchOpen ? (
        <div className={styles.searchBox}>
          <Search className={styles.searchGlyph} />
          <Input
            ref={searchInputRef}
            className={styles.searchInput}
            type="search"
            value={query}
            placeholder={t("rail.searchPlaceholder")}
            aria-label={t("rail.searchInputAria")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeSearch()
              }
            }}
          />
          <Button variant="ghost"
            size="icon-sm"
            className={styles.searchClose}
            type="button"
            aria-label={t("rail.searchClose")}
            onClick={closeSearch}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <SidebarContent className={styles.content}>
      <nav className={styles.nav} aria-label={t("rail.navAria")}>
        <SidebarMenu data-desktop-global-menu="true">
        {/* 新对话：带 ⇧⌘O 快捷键（AppFrame 已接入键盘）。 */}
        <SidebarMenuItem>
          <SidebarMenuButton ref={deleteDialogFallbackFocusRef} tooltip={newSessionLabel} aria-label={newSessionLabel} size="lg" className={cn(styles.navItem, "text-sidebar-primary font-semibold")} type="button" data-testid="rail-new-task" data-navigation-section="new-task" onPointerDown={markPointerFocus} onClick={() => { onNewChat(); closeNavigation() }}>
            <SquarePen className={styles.icon} />
            {navigationExpanded ? <span className={styles.navLabel}>{newSessionLabel}</span> : null}
            {navigationExpanded ? (
              <span className={styles.navShortcut} aria-hidden>
                {t("rail.newChatShortcut")}
              </span>
            ) : null}
          </SidebarMenuButton>
        </SidebarMenuItem>

        {/* Direct chats are the scoped inbox below the workbench, not a second
            message stop in the primary rail. Keeping a second desktop entry
            here made `/app` show two bubbles and inserted a row only while the
            rail was collapsed. The touch Sheet keeps the shortcut because its
            inbox has no compact icon counterpart. */}
        {isMobile ? (
          <SidebarMenuItem data-desktop-direct-chat="true">
            <SidebarMenuButton asChild tooltip={t("rail.directChats")} className={styles.navItem} isActive={activeNavigationKey === "chat"}>
              <Link
                href={chatHref}
                prefetch={mountedSurfacePrefetch}
                onClickCapture={(event) => interceptMountedSurfaceNavigation(event, chatHref)}
                onClick={closeNavigation}
                data-testid="rail-direct-chat"
                data-navigation-section="direct-chat"
                aria-current={activeNavigationKey === "chat" ? "page" : undefined}
              >
                <MessageSquareMore className={styles.icon} />
                {navigationExpanded ? <span className={styles.navLabel}>{t("rail.directChats")}</span> : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}

        </SidebarMenu>

        {workbenchNavigation.length > 0 ? <SidebarGroup className={styles.navGroup} data-desktop-workbench-nav="true">
          <SidebarGroupContent>
            <SidebarMenu>
              {workbenchNavigation.map(({ key, label, icon: Icon, settingsTab, href }) => {
                const canActivate = settingsTab !== undefined || href !== undefined
                if (href) {
                  return (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton asChild tooltip={label} className={styles.navItem} data-testid={`rail-${key}`} data-navigation-section={key} isActive={activeNavigationKey === key}>
                        <Link href={href} prefetch={mountedSurfacePrefetch} onPointerDown={markPointerFocus} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, href)} onClick={closeNavigation} aria-label={label} aria-current={activeNavigationKey === key ? "page" : undefined}>
                          <Icon className={styles.icon} />
                          {navigationExpanded ? <span className={styles.navLabel}>{label}</span> : null}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                }
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton
                      tooltip={settingsTab || canActivate ? label : `${label} · ${t("firstSite.unavailable")}`}
                      aria-label={label}
                      type="button"
                      className={styles.navItem}
                      data-testid={`rail-${key}`}
                      data-navigation-section={key}
                      disabled={!canActivate}
                      aria-disabled={!canActivate || undefined}
                      onPointerDown={markPointerFocus}
                      onClick={() => {
                        if (settingsTab) {
                          openSettings(settingsTab)
                          closeNavigation()
                        }
                      }}
                    >
                      <Icon className={styles.icon} />
                      {navigationExpanded ? <span className={styles.navLabel}>{label}</span> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup> : null}

        {projectHref ? <SidebarGroup className={cn(styles.navGroup, styles.projectGroup)} data-desktop-projects="true">
          {!compactDesktop ? <SidebarGroupLabel className={styles.navGroupLabel}>
            <span>{t("firstSite.projects")}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={styles.sectionAction}
                  aria-label={t("firstSite.newProject")}
                  data-testid="rail-new-project"
                >
                  <Plus aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className={styles.projectMenu}>
                <DropdownMenuItem onSelect={onCreateProject}>
                  <Folder aria-hidden="true" />
                  {t("firstSite.newProject")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                {compactDesktop ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton type="button" className={styles.navItem} isActive={projectActive} tooltip={t("firstSite.projects")} aria-label={t("firstSite.projects")} data-testid="rail-project" data-navigation-section="project" onPointerDown={markPointerFocus}>
                        <Folder className={styles.icon} />
                        {navigationExpanded ? <span className={styles.navLabel}>{brandName ?? DEFAULT_BRAND.name}</span> : null}
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" sideOffset={10} className={styles.projectMenu}>
                      <DropdownMenuItem asChild>
                        <Link href={projectHref} prefetch={mountedSurfacePrefetch} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, projectHref)} onClick={closeNavigation}>
                          <Folder aria-hidden="true" />
                          {brandName ?? DEFAULT_BRAND.name}
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <SidebarMenuButton asChild type="button" className={styles.navItem} isActive={projectActive} data-testid="rail-project" data-navigation-section="project">
                    <Link href={projectHref} prefetch={mountedSurfacePrefetch} onPointerDown={markPointerFocus} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, projectHref)} onClick={closeNavigation} aria-label={brandName ?? DEFAULT_BRAND.name} aria-current={projectActive ? "page" : undefined}>
                      <Folder className={styles.icon} />
                      {navigationExpanded ? <span className={styles.navLabel}>{brandName ?? DEFAULT_BRAND.name}</span> : null}
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild type="button" className={styles.navItem} data-testid="rail-project-task" data-navigation-section="project-task">
                  {projectActive ? (
                    <button
                      type="button"
                      aria-label={t("firstSite.tasks")}
                      onPointerDown={markPointerFocus}
                      onClick={() => { onNewChat(); closeNavigation() }}
                    >
                      <ListTodo className={styles.icon} />
                    </button>
                  ) : (
                    <Link
                      href={projectHref}
                      prefetch={mountedSurfacePrefetch}
                      aria-label={t("firstSite.tasks")}
                      onPointerDown={markPointerFocus}
                      onClickCapture={(event) => interceptMountedSurfaceNavigation(event, projectHref)}
                      onClick={closeNavigation}
                    >
                      <ListTodo className={styles.icon} />
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup> : null}

      </nav>

      {/*
       * A direct inbox remains a visible first-class section even before its
       * first conversation exists. Hiding it made an empty `/app` read as if
       * projects were the only place that could contain chat. The list itself
       * is still supplied by the route-scoped session query: direct chats and
       * project conversations never share a client-side collection.
       */}
      <nav
          className={cn(styles.list, !projectActive && !hasConversations && styles.emptyDirectList)}
          aria-label={projectActive ? t("firstSite.tasks") : t("rail.directChatsAria")}
          data-conversation-list={projectActive ? "project-conversation" : "direct"}
        >
        {!compactDesktop ? (
        <>
          <div className={styles.sectionRow}>
            {/* `conversations` is already scope-filtered by AppFrame. On a
                project route it therefore contains project conversations only; on
                `/app` it contains direct chats only. */}
            <p className={styles.section}>{projectActive ? t("firstSite.tasks") : t("rail.directChats")}</p>
            {projectActive ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" className={styles.sectionAction} aria-label={t("rail.taskSort")}>
                    <ListFilter aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4}>
                  <DropdownMenuLabel>{t("rail.taskSort")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={taskOrder}
                    onValueChange={(value) => {
                      if (value === "recent" || value === "name") setTaskOrder(value)
                    }}
                  >
                    <DropdownMenuRadioItem value="recent">{t("rail.sortRecent")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">{t("rail.sortName")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          {listError && !hasConversations ? (
            <div className={styles.listNotice} role="alert">
              <p className={styles.empty}>{t("rail.listError")}</p>
              {onRetryList ? (
              <Button variant="outline" size="sm" type="button" disabled={listLoading} aria-busy={listLoading} onClick={onRetryList}>
                  {listLoading ? <Spinner aria-hidden="true" /> : null}
                  {listLoading ? t("rail.listLoading") : t("rail.retryList")}
                </Button>
              ) : null}
            </div>
          ) : listLoading && !hasConversations ? (
            <p className={styles.empty} role="status" aria-label={t("rail.listLoading")}>{t("rail.listLoading")}</p>
          ) : ordered.length > 0 ? (
            <>
              {listError && onRetryList ? (
                <div className={styles.listNotice} role="alert">
                  <p className={styles.empty}>{t("rail.listError")}</p>
                  <Button variant="outline" size="sm" type="button" disabled={listLoading} aria-busy={listLoading} onClick={onRetryList}>
                    {listLoading ? <Spinner aria-hidden="true" /> : null}
                    {listLoading ? t("rail.listLoading") : t("rail.retryList")}
                  </Button>
                </div>
              ) : null}
              <SidebarMenu>
              {ordered.map((conversation) => {
                const title = conversation.title || t("rail.newChat")
                const editing = conversation.id === editingId
                return (
                    <SidebarMenuItem
                    key={conversation.id}
                    className={styles.item}
                    data-active={conversation.id === activeId ? "true" : "false"}
                    data-editing={editing ? "true" : "false"}
                    >
                    {editing ? (
                      <Input
                        ref={renameInputRef}
                        className={styles.itemRenameInput}
                        value={draftTitle}
                        maxLength={256}
                        aria-label={t("rail.renamePlaceholder")}
                        placeholder={t("rail.renamePlaceholder")}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onBlur={() => commitRename(conversation.title)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            commitRename(conversation.title, true)
                          } else if (event.key === "Escape") {
                            event.preventDefault()
                            cancelRename(true)
                          }
                        }}
                      />
                    ) : (
                      <>
                        {/* 双击标题或使用悬停编辑按钮进入内联改题。 */}
                        <SidebarMenuButton
                          isActive={conversation.id === activeId}
                          className={styles.itemSelect}
                          type="button"
                          data-conversation-id={conversation.id}
                          onClick={() => { onSelectConversation(conversation.id); closeNavigation() }}
                          onDoubleClick={() => startRename(conversation.id, conversation.title)}
                          aria-pressed={conversation.id === activeId}
                        >
                          {/* 待批徽标（HITL-NOTIFY）：琥珀点提示该会话有待你决定的审批，跨会话可见。 */}
                          {awaitingIds.has(conversation.id) ? (
                            <span
                              className={styles.itemAwaiting}
                              aria-label={t("hitl.awaitingApproval")}
                            />
                          ) : null}
                          <span className={styles.itemTitle}>{title}</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          showOnHover
                          className={styles.itemRename}
                          type="button"
                          aria-label={t("rail.renameChat", { title })}
                          onClick={() => startRename(conversation.id, conversation.title)}
                        >
                          <Pencil aria-hidden="true" />
                        </SidebarMenuAction>
                        <SidebarMenuAction
                          showOnHover
                          className={cn(styles.itemDelete, styles.itemDeleteAction)}
                          type="button"
                          aria-label={t("rail.deleteChat", { title })}
                          onClick={() => {
                            onRequestDelete(conversation)
                          }}
                        >
                          <X aria-hidden="true" />
                        </SidebarMenuAction>
                      </>
                    )}
                    </SidebarMenuItem>
                )
              })}
              </SidebarMenu>
              {/* 滚动到底翻页（SESS-LIST 复合游标）：搜索过滤时不出翻页（仅过滤已载入项）。 */}
              {hasMore && query === "" ? (
                <Button
                  variant="outline"
                  className={styles.loadMore}
                  type="button"
                  disabled={listLoadingMore}
                  aria-busy={listLoadingMore}
                  onClick={onLoadMore}
                >
                  {listLoadingMore ? <Spinner aria-hidden="true" /> : null}
                  {t("rail.loadMore")}
                </Button>
              ) : null}
            </>
          ) : projectActive ? null : (
            <p className={styles.empty}>{t(searchOpen ? "rail.emptyResult" : "rail.emptyChats")}</p>
          )}
        </>
        ) : null}
      </nav>
      </SidebarContent>

      <SidebarFooter className={styles.footer}>
        {!compactDesktop && !isMobile ? (
          <div className={styles.footerInvite} data-desktop-invite="true">
            <WorkspaceInviteCard
              brandName={brandName ?? "Workspace"}
              onOpen={() => openSettings("team")}
            />
          </div>
        ) : null}
        <UserCard
          brandName={brandName}
          preview={preview}
          compactDesktop={compactDesktop}
          onOpenSettings={openSettings}
          onOpenNotifications={onOpenNotifications}
          accountTriggerRef={accountTriggerRef}
        />
      </SidebarFooter>
      </div>
    </Sidebar>
  )
}

export function WorkspaceRail(props: WorkspaceRailProps) {
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null)
  const deleteDialogFallbackFocusRef = useRef<HTMLButtonElement | null>(null)
  const deleteDialogFocusRef = useRef<HTMLElement | null>(null)
  const { onDeleteConversation } = props

  const requestDelete = (conversation: ConversationSummary) => {
    const active = document.activeElement
    const activeElement = active instanceof HTMLElement && active !== document.body ? active : null
    deleteDialogFocusRef.current = activeElement
    setDeleteTarget(conversation)
  }

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      onDeleteConversation(deleteTarget.id)
      setDeleteTarget(null)
    }
  }, [deleteTarget, onDeleteConversation])

  const content = (
    <WorkspaceRailContent
      {...props}
      deleteDialogFallbackFocusRef={deleteDialogFallbackFocusRef}
      onRequestDelete={requestDelete}
    />
  )
  const dialog = (
    <WorkspaceDeleteDialog
      target={deleteTarget}
      onClose={() => {
        setDeleteTarget(null)
      }}
      onConfirm={confirmDelete}
      returnFocusRef={deleteDialogFocusRef}
      fallbackFocusRef={deleteDialogFallbackFocusRef}
    />
  )
  if (props.withinProvider) return <>{content}{dialog}</>
  return (
    <SidebarProvider
      className={styles.provider}
      forceDesktop
      // The official Sidebar owns its gap/container geometry. Standalone
      // embeds inherit the same live width contract as the full shell.
      style={{
        "--sidebar-width": "var(--rail-width, 20rem)",
        "--sidebar-width-icon": `${RAIL_COLLAPSED_WIDTH}px`,
      } as CSSProperties}
      open={!props.collapsed}
      onOpenChange={() => {
        props.onToggleCollapse()
      }}
    >
      {content}
      {dialog}
    </SidebarProvider>
  )
}

function WorkspaceDeleteDialog({
  target,
  onClose,
  onConfirm,
  returnFocusRef,
  fallbackFocusRef,
}: {
  target: ConversationSummary | null
  onClose: () => void
  onConfirm: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  fallbackFocusRef?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  const focusRef = useRef<RefObject<HTMLElement | null> | undefined>(returnFocusRef)
  useEffect(() => {
    if (returnFocusRef) {
      focusRef.current = returnFocusRef
    }
  }, [returnFocusRef])
  const closeAndRestoreFocus = () => {
    onClose()
    scheduleFocusRestore()
  }
  const wasOpenRef = useRef(target !== null)
  const confirmedRef = useRef(false)

  const scheduleFocusRestore = useCallback(() => {
    const opener = confirmedRef.current
      ? fallbackFocusRef?.current
      : focusRef.current?.current
    if (!opener || !opener.isConnected || opener.hasAttribute("disabled") || opener.getAttribute("aria-hidden") === "true") {
      return
    }
    window.setTimeout(() => {
      if (opener.isConnected && !opener.hasAttribute("disabled") && opener.getAttribute("aria-hidden") !== "true") {
        opener.focus()
      }
    }, 0)
  }, [fallbackFocusRef])

  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = target !== null
    if (target !== null) {
      confirmedRef.current = false
    }
    if (!wasOpen || target !== null) {
      return
    }
    // The trigger lived inside the Sheet and is gone by the time the
    // AlertDialog closes. Restore focus on the stable mobile header after
    // Radix has completed its own close cycle.
    scheduleFocusRestore()
  }, [scheduleFocusRestore, target])

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
          if (!open) {
            onClose()
            scheduleFocusRestore()
        }
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const opener = confirmedRef.current
            ? fallbackFocusRef?.current
            : focusRef.current?.current
          // Radix's default restoration targets the last focused dialog
          // control. That is correct for a trigger-owned dialog, but here the
          // opener can be removed after deletion or can live behind a closing
          // mobile Sheet. Always own this handoff and resolve it from the
          // captured opener/fallback instead of allowing focus to fall to body.
          if (!opener || !opener.isConnected || opener.hasAttribute("disabled") || opener.getAttribute("aria-hidden") === "true") {
            return
          }
          event.preventDefault()
          scheduleFocusRestore()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("rail.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {target ? t("rail.deleteConfirmDescription", { title: target.title || t("rail.newChat") }) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={closeAndRestoreFocus}>{t("rail.deleteCancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              confirmedRef.current = true
              onConfirm()
            }}
          >
            {t("rail.deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// rail 底部用户区：团队/空间身份（首字母头像 + 团队名）+ 设置入口。主题/语言已收归设置页
// 外观分区（单一真源），此处不再重复摆放切换器。
function useTeamName(preview: boolean): string | null | undefined {
  // undefined=未取，null=预览/无信封，string=已解析团队名（与 settings AccountCard 同源逻辑）。
  const [name, setName] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const namespace = await browserTeamClient({ preview }).currentNamespace()
        if (namespace === null) {
          if (live) setName(null)
          return
        }
        const teams = await browserTeamClient({ preview }).listMyTeams()
        if (live) setName(teams.find((entry) => entry.team.id === namespace)?.team.name ?? null)
      } catch {
        if (live) setName(null)
      }
    })()
    return () => {
      live = false
    }
  }, [preview])
  return name
}

function UserCard({
  brandName,
  preview = false,
  compactDesktop,
  onOpenSettings,
  onOpenNotifications,
  accountTriggerRef,
}: {
  brandName?: string
  preview?: boolean
  compactDesktop: boolean
  onOpenSettings: (tab: SettingsTab) => void
  onOpenNotifications?: (returnTarget?: HTMLElement | null) => void
  accountTriggerRef?: RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  const teamName = useTeamName(preview)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [creditBalance, setCreditBalance] = useState("—")
  const accountSettingsFrameRef = useRef<number | null>(null)
  // Preview TeamClient data must not replace the site's product brand.
  const display = preview
    ? brandName ?? "Workspace"
    : teamName === undefined
      ? brandName ?? "Workspace"
      : teamName ?? brandName ?? "Workspace"
  const initial = (display.trim().charAt(0) || "K").toUpperCase()
  const accountCard = (
    <>
      <div className={styles.userAvatar} aria-hidden>{initial}</div>
      {!compactDesktop ? <div className={styles.userText}>
        <p className={styles.userName}>{display}</p>
        <p className={styles.userMeta}>{t("rail.userScope")}</p>
      </div> : null}
    </>
  )

  useEffect(() => () => {
    if (accountSettingsFrameRef.current !== null) {
      window.cancelAnimationFrame(accountSettingsFrameRef.current)
    }
  }, [])

  useEffect(() => {
    let live = true
    void browserBillingClient({ preview }).summary()
      .then((summary) => { if (live) setCreditBalance(formatCredits(summary.balance_micros)) })
      .catch(() => { if (live) setCreditBalance("—") })
    return () => { live = false }
  }, [preview])

  const openSettingsFromAccount = (tab: SettingsTab) => {
    if (accountSettingsFrameRef.current !== null) {
      window.cancelAnimationFrame(accountSettingsFrameRef.current)
    }
    // Close the DropdownMenu before mounting Settings. One animation frame is
    // enough for Radix to release its focus scope; the old 180ms timeout made
    // every account-menu action feel stalled even though no network request
    // was involved.
    setAccountMenuOpen(false)
    accountSettingsFrameRef.current = window.requestAnimationFrame(() => {
      accountSettingsFrameRef.current = null
      onOpenSettings(tab)
    })
  }

  const handleAccountMenuOpenChange = (open: boolean) => {
    if (open && accountSettingsFrameRef.current !== null) {
      window.cancelAnimationFrame(accountSettingsFrameRef.current)
      accountSettingsFrameRef.current = null
    }
    setAccountMenuOpen(open)
  }

  return (
    <div className={styles.userCard}>
      <DropdownMenu open={accountMenuOpen} onOpenChange={handleAccountMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={accountTriggerRef}
            variant="ghost"
            size="sm"
            type="button"
            className={styles.userTrigger}
            data-testid="rail-utility-account"
            data-rail-anchor="account"
            aria-label={`${display}, ${t("rail.userScope")}`}
            data-settings-return-target="account"
          >
            {accountCard}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className={styles.accountMenu}>
          <DropdownMenuLabel className={styles.accountSummary}>
            <span className={styles.accountLargeAvatar} aria-hidden>{initial}</span>
            <span><strong>{display}</strong><small>{t("rail.userMenuScope")}</small></span>
            <ChevronsUpDown className={styles.accountSwitcher} aria-hidden="true" />
          </DropdownMenuLabel>
          <div className={styles.accountPlanGroup}>
            <div className={styles.accountPlan}>
              <span><strong>{t("billing.freeTier")}</strong></span>
              <Button
                variant="default"
                size="sm"
                type="button"
                className={styles.accountUpgrade}
                onClick={() => openSettingsFromAccount("subscription")}
              >
                {t("firstSite.upgrade")}
              </Button>
            </div>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("credits")}>
              <Sparkles aria-hidden="true" />
              <span className={styles.accountCreditLabel}>{t("settings.creditsMenu")}<CircleHelp aria-hidden="true" /></span>
              <DropdownMenuShortcut className={styles.accountCreditValue}>{creditBalance}<ChevronRight aria-hidden="true" /></DropdownMenuShortcut>
            </DropdownMenuItem>
          </div>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("account")}><UserRound aria-hidden="true" />{t("settings.accountTitle")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("personalization")}><Grid2X2 aria-hidden="true" />{t("settings.personalizationTitle")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("appearance")}><SlidersHorizontal aria-hidden="true" />{t("settings.title")}<DropdownMenuShortcut>⌘⇧,</DropdownMenuShortcut></DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link
            href="/app"
            prefetch={false}
            onClickCapture={(event) => interceptMountedSurfaceNavigation(event, "/app")}
          ><Home aria-hidden="true" />{t("rail.accountHome")}<ArrowUpRight className={styles.accountLinkArrow} aria-hidden="true" /></Link></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/docs"><CircleHelp aria-hidden="true" />{t("rail.accountHelp")}<ArrowUpRight className={styles.accountLinkArrow} aria-hidden="true" /></a></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/docs"><FileText aria-hidden="true" />{t("rail.accountDocs")}<ArrowUpRight className={styles.accountLinkArrow} aria-hidden="true" /></a></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.assign("/") })}>
            <LogOut aria-hidden="true" />{t("settings.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className={styles.accountStatus}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={styles.utilityAction}
          data-testid="rail-utility-device"
          data-rail-anchor="utility"
          aria-label={t("settings.computerTitle")}
          onClick={() => onOpenSettings("computer")}
        >
          <ComputerStatusIcon className={styles.icon} aria-hidden="true" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={styles.utilityAction}
              data-testid="rail-utility-notifications"
              data-rail-anchor="utility"
              aria-label={t("notifications.open")}
              onClick={(event) => onOpenNotifications?.(event.currentTarget)}
            >
              <Bell className={styles.icon} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="end"
            sideOffset={8}
            className={notificationStyles.notificationsPopover}
            aria-label={t("notifications.title")}
          >
            <NotificationPanel />
          </PopoverContent>
        </Popover>
      </span>
    </div>
  )
}
