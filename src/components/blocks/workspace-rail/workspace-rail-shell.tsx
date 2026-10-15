"use client"

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"
import { ChevronDown, Ellipsis, ListFilter, SquarePen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar"
import { useT } from "@/i18n/context"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import { DIRECT_SESSION_SCOPE } from "@/engine/session-scope"
import type { ConversationSummary } from "@/ui/rail/rail-search"

import {
  DRAG_HELP_ID,
  markPointerFocus,
  useWorkspaceRailActions,
} from "./workspace-rail-actions"
import { WorkspaceRailAccount } from "./workspace-rail-account"
import { WorkspaceRailHeader, WorkspaceRailNavigation } from "./workspace-rail-navigation"
import { ConversationGroup, ScopedConversationGroup } from "./workspace-rail-session-list"
import type { WorkspaceRailProps } from "./workspace-rail-types"
import { itemStyles, railStyles } from "./workspace-rail-styles"

const RAIL_WIDTH_TRANSITION_MS = 200

export type WorkspaceRailShellProps = Omit<WorkspaceRailProps, "onRequestDelete" | "deleteDialogFallbackFocusRef"> & {
  onRequestDelete: (conversation: ConversationSummary, remove?: (id: string) => Promise<boolean>) => void
  deleteDialogFallbackFocusRef: RefObject<HTMLButtonElement | null>
}

/** Stateful rail composition boundary. Each child owns one visual/interaction responsibility. */
export function WorkspaceRailShell({
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
  onRequestProjectRename,
  projects,
  projectListStatus,
  projectListRetryable,
  onRetryProjects,
  onReorderProjects,
  onReorderConversations,
  activeNavigationKey,
  conversations,
  activeId,
  awaitingIds,
  onSelectConversation,
  onRequestDelete,
  deleteDialogFallbackFocusRef,
  onRenameConversation,
  conversationScope,
  conversationReads,
  conversationMove,
  conversationMovePending = false,
  conversationMoveFailed = false,
  onMoveConversation,
  onRetryConversationMove,
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
}: WorkspaceRailShellProps) {
  const t = useT()
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar()
  const visualCollapsed = state === "collapsed"
  const compactDesktop = !isMobile && visualCollapsed
  // Sidebar owns the physical 300px → 52px track transition. If the rail
  // content switches to icon mode in the same React commit, its labels vanish
  // while the old 300px gap is still shrinking, producing a blank gray slab.
  // Keep the expanded content projected during the collapse transition; on
  // expansion it is available immediately and simply reveals with the rail.
  const [contentCollapsed, setContentCollapsed] = useState(visualCollapsed)
  useEffect(() => {
    const delay = visualCollapsed ? RAIL_WIDTH_TRANSITION_MS : 0
    const timeout = window.setTimeout(() => setContentCollapsed(visualCollapsed), delay)
    return () => window.clearTimeout(timeout)
  }, [visualCollapsed])
  const contentCompactDesktop = !isMobile && contentCollapsed
  // Mounted-surface routes are projected through history on desktop, so their
  // default viewport/hover RSC prefetch is redundant. Keep mobile Link native.
  const mountedSurfacePrefetch = isMobile ? undefined : false
  const navigationExpanded = !contentCompactDesktop
  const navigationTransitionKey = `${activeNavigationKey ?? "none"}:${projectActive ? "project" : "direct"}`

  const closeNavigation = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  const newSessionLabel = t("rail.newTask")
  const fallbackBrandMark = (
    <BrandFallback
      {...(brandMark === undefined ? {} : { mark: brandMark })}
      {...(railStyles.brandFallbackIcon === undefined ? {} : { className: railStyles.brandFallbackIcon })}
    />
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  // Manus keeps the top-level task feed independently collapsible from the
  // project collection.  This is presentation state only: reads stay mounted
  // and owner-backed while the rows are hidden, so opening it is instantaneous.
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const projectItems = useMemo(() => {
    if (projects !== undefined) return [...projects]
    if (!preview || !projectHref) return []
    return [{
      id: projectHref,
      name: t("firstSite.currentProject"),
      href: projectHref,
      active: projectActive,
    }]
  }, [preview, projectActive, projectHref, projects, t])
  const moveDestinations = projectListStatus === "ready" && conversationScope !== undefined
    ? [
        ...(conversationScope.kind === "direct" ? [] : [{ id: null, name: t("rail.directChatsAria") }]),
        ...projectItems
          .filter((project) => conversationScope.kind !== "project" || project.id !== conversationScope.projectRef)
          .map((project) => ({ id: project.id, name: project.name })),
      ]
    : []

  const conversationScopeKey = projectActive ? `project:${projectHref ?? "active"}` : "direct"
  const {
    orderedProjects,
    dragProps,
    dragState,
    dragOverKey,
  } = useWorkspaceRailActions({
    projectItems,
    conversations: [],
    conversationScopeKey,
    ...(onReorderProjects === undefined ? {} : { onReorderProjects }),
    ...(onReorderConversations === undefined ? {} : { onReorderConversations }),
  })

  const hasConversations = conversations.length > 0

  const directConversationGroup = conversationReads ? <ScopedConversationGroup
    key={`direct:${conversationReads.identity}`}
    scope={DIRECT_SESSION_SCOPE} reads={conversationReads} preview={preview}
    compactDesktop={contentCompactDesktop} query={query} searchOpen={searchOpen}
    awaitingIds={awaitingIds} closeNavigation={closeNavigation} onNewChat={onNewChat}
    onRequestDelete={onRequestDelete} projects={projectItems}
    projectListReady={projectListStatus === "ready"}
    conversationMove={conversationMove ?? null} conversationMovePending={conversationMovePending}
    conversationMoveFailed={conversationMoveFailed}
    hideSectionHeader={!contentCompactDesktop}
    {...(onRetryConversationMove === undefined ? {} : { onRetryConversationMove })}
  /> : (
    <ConversationGroup
      projectActive={false}
      scopeKey="direct"
      onRenameConversation={onRenameConversation}
      {...(onReorderConversations === undefined ? {} : { onReorderConversations })}
      compactDesktop={contentCompactDesktop}
      searchOpen={searchOpen}
      query={query}
      conversations={conversations}
      hasConversations={hasConversations}
      activeId={activeId}
      awaitingIds={awaitingIds}
      listLoading={listLoading}
      listLoadingMore={listLoadingMore}
      listError={listError}
      {...(onRetryList === undefined ? {} : { onRetryList })}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      onNewChat={onNewChat}
      closeNavigation={closeNavigation}
      onSelectConversation={onSelectConversation}
      onRequestDelete={onRequestDelete}
      moveDestinations={moveDestinations}
      conversationMove={conversationMove ?? null}
      conversationMovePending={conversationMovePending}
      conversationMoveFailed={conversationMoveFailed}
      hideSectionHeader={!contentCompactDesktop}
      {...(onMoveConversation === undefined ? {} : { onMoveConversation })}
      {...(onRetryConversationMove === undefined ? {} : { onRetryConversationMove })}
    />
  )

  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const railRootRef = useRef<HTMLDivElement | null>(null)
  const toggleFocusRef = useRef<{ mode: "collapsed" | "expanded"; pointer: boolean } | null>(null)
  const togglePointerRef = useRef(false)
  const previousCompactDesktopRailRef = useRef<boolean | null>(null)
  const responsiveFocusPendingRef = useRef(false)
  const lastNavigationControlRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches(
        '[data-collapsed-brand="true"], [data-rail-anchor="rail-toggle"], [data-web-navigation-trigger="true"]',
      )) {
        lastNavigationControlRef.current = target
      }
    }
    document.addEventListener("focusin", onFocusIn)
    return () => document.removeEventListener("focusin", onFocusIn)
  }, [])

  // Focus handoff follows the committed provider state rather than the click
  // event's pre-toggle tree, so a replaced control never receives stale focus.
  useLayoutEffect(() => {
    const previousCompactDesktopRail = previousCompactDesktopRailRef.current
    previousCompactDesktopRailRef.current = compactDesktopRail
    if (previousCompactDesktopRail !== null && previousCompactDesktopRail !== compactDesktopRail) {
      responsiveFocusPendingRef.current = true
    }
    const targetMode = toggleFocusRef.current
    if (targetMode !== null) {
      responsiveFocusPendingRef.current = false
      toggleFocusRef.current = null
      const target = targetMode.mode === "expanded"
        ? railRootRef.current?.querySelector<HTMLElement>('[data-rail-anchor="rail-toggle"]')
        : compactDesktopRail
          ? document.querySelector<HTMLElement>('[data-web-navigation-trigger="true"]:not([aria-hidden="true"])')
          : railRootRef.current?.querySelector<HTMLElement>('[data-collapsed-brand="true"]')
      if (!target || target.getAttribute("aria-hidden") === "true") return
      if (targetMode.mode === "collapsed" && targetMode.pointer) {
        target.dataset.pointerFocus = "true"
        target.addEventListener("blur", () => delete target.dataset.pointerFocus, { once: true })
      }
      target.focus({ preventScroll: true })
      return
    }

    if (!responsiveFocusPendingRef.current) return
    const active = document.activeElement
    const navigationControl = active instanceof HTMLElement && active.matches(
      '[data-collapsed-brand="true"], [data-rail-anchor="rail-toggle"], [data-web-navigation-trigger="true"]',
    )
    const trackedNavigationControl = lastNavigationControlRef.current
    const focusWasReplacedNavigationControl = trackedNavigationControl !== null
      && (active === trackedNavigationControl
        || (active === document.body && !trackedNavigationControl.isConnected))
    if (!navigationControl && !focusWasReplacedNavigationControl) {
      responsiveFocusPendingRef.current = false
      return
    }
    const target = compactDesktopRail
      ? document.querySelector<HTMLElement>('[data-web-navigation-trigger="true"]:not([aria-hidden="true"])')
      : visualCollapsed
        ? railRootRef.current?.querySelector<HTMLElement>('[data-collapsed-brand="true"]')
        : null
    if (!target || target === active || target.getAttribute("aria-hidden") === "true") return
    target.focus({ preventScroll: true })
    responsiveFocusPendingRef.current = false
  }, [compactDesktopRail, contentCompactDesktop, visualCollapsed])

  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [searchOpen, visualCollapsed])

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery("")
    window.requestAnimationFrame(() => searchToggleRef.current?.focus())
  }

  const openSearch = () => {
    if (compactDesktop) setOpen(true)
    setSearchOpen(true)
  }

  const handleTogglePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerType = event.pointerType as string
    togglePointerRef.current = pointerType === "mouse" || pointerType === "pen" || pointerType === ""
    markPointerFocus(event)
  }

  const handleCollapsedBrandClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const pointerActivation = togglePointerRef.current || event.detail > 0
    toggleFocusRef.current = { mode: "expanded", pointer: pointerActivation }
    togglePointerRef.current = false
    setOpen(true)
  }

  const handleSidebarTriggerClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const wasCollapsed = compactDesktop
    const pointerActivation = togglePointerRef.current || event.detail > 0
    toggleFocusRef.current = { mode: wasCollapsed ? "expanded" : "collapsed", pointer: pointerActivation }
    togglePointerRef.current = false
    if (!compactDesktop && searchOpen) {
      setSearchOpen(false)
      setQuery("")
    }
  }

  const openSettings = (tab: SettingsTab) => onOpenSettings(tab)

  return (
    <Sidebar side="left" collapsible="icon" className={railStyles.sidebar} data-desktop-web="true">
      <div
        ref={railRootRef}
        className={railStyles.rail}
        aria-label={t("rail.railAria")}
        data-collapsed={contentCollapsed}
        data-active-navigation-key={activeNavigationKey ?? "none"}
        data-desktop-web="true"
        data-desktop-rail={!isMobile ? "true" : undefined}
      >
        <WorkspaceRailHeader
          chatHref={chatHref}
          {...(brandName === undefined ? {} : { brandName })}
          {...(brandLogoUrl === undefined ? {} : { brandLogoUrl })}
          fallbackBrandMark={fallbackBrandMark}
          mountedSurfacePrefetch={mountedSurfacePrefetch}
          compactDesktop={contentCompactDesktop}
          compactDesktopRail={compactDesktopRail}
          isMobile={isMobile}
          navigationExpanded={navigationExpanded}
          searchOpen={searchOpen}
          query={query}
          onQueryChange={setQuery}
          searchInputRef={searchInputRef}
          searchToggleRef={searchToggleRef}
          onOpenSearch={openSearch}
          onCloseSearch={closeSearch}
          onCollapsedBrandPointerDown={handleTogglePointerDown}
          onCollapsedBrandClick={handleCollapsedBrandClick}
          onSidebarTriggerPointerDown={handleTogglePointerDown}
          onSidebarTriggerClick={handleSidebarTriggerClick}
        />

        <SidebarContent className={railStyles.content}>
          <span id={DRAG_HELP_ID} className={railStyles.visuallyHidden}>
            使用空格开始或放置拖动，使用上下箭头重新排序，按 Escape 取消。
          </span>
          <WorkspaceRailNavigation
            {...(navigation === undefined ? {} : { navigation })}
            {...(featureFlags === undefined ? {} : { featureFlags })}
            {...(projectHref === undefined ? {} : { projectHref })}
            projectActive={projectActive}
            {...(projects === undefined ? {} : { projects })}
            orderedProjects={orderedProjects}
            {...(projectListStatus === undefined ? {} : { projectListStatus })}
            {...(projectListRetryable === undefined ? {} : { projectListRetryable })}
            {...(onRetryProjects === undefined ? {} : { onRetryProjects })}
            projectPickerOpen={projectPickerOpen}
            setProjectPickerOpen={setProjectPickerOpen}
            {...(onCreateProject === undefined ? {} : { onCreateProject })}
            {...(onRequestProjectRename === undefined ? {} : { onRequestProjectRename })}
            onNewChat={onNewChat}
            closeNavigation={closeNavigation}
            onOpenSettings={openSettings}
            deleteDialogFallbackFocusRef={deleteDialogFallbackFocusRef}
            {...(activeNavigationKey === undefined ? {} : { activeNavigationKey })}
            mountedSurfacePrefetch={mountedSurfacePrefetch}
            compactDesktop={contentCompactDesktop}
            navigationExpanded={navigationExpanded}
            navigationTransitionKey={navigationTransitionKey}
            newSessionLabel={newSessionLabel}
            dragProps={dragProps}
            dragState={dragState}
            dragOverKey={dragOverKey}
          />
          {!contentCompactDesktop ? <div className={itemStyles.sectionRow} data-task-section-header="true">
            <Button
              type="button"
              variant="ghost"
              className={itemStyles.sectionDisclosure}
              aria-label={t(tasksExpanded ? "rail.collapseTasks" : "rail.expandTasks")}
              aria-expanded={tasksExpanded}
              aria-controls="rail-direct-task-list"
              onClick={() => setTasksExpanded((expanded) => !expanded)}
            >
              <span>{t("rail.tasks")}</span>
              <ChevronDown aria-hidden="true" />
            </Button>
            <span className={itemStyles.sectionHeaderActions}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={itemStyles.sectionHeaderAction}
                aria-label={t("rail.taskOptions")}
                disabled
              >
                <Ellipsis aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={itemStyles.sectionHeaderAction}
                aria-label={t("rail.taskFilters")}
                disabled
              >
                <ListFilter aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={itemStyles.sectionHeaderAction}
                aria-label={newSessionLabel}
                onClick={() => { onNewChat(); closeNavigation() }}
              >
                <SquarePen aria-hidden="true" />
              </Button>
            </span>
          </div> : null}
          {contentCompactDesktop || tasksExpanded ? <div id="rail-direct-task-list">{directConversationGroup}</div> : null}
        </SidebarContent>

        <SidebarFooter className={railStyles.footer}>
          <WorkspaceRailAccount
            {...(brandName === undefined ? {} : { brandName })}
            preview={preview}
            compactDesktop={contentCompactDesktop}
            onOpenSettings={openSettings}
            {...(onOpenNotifications === undefined ? {} : { onOpenNotifications })}
            {...(accountTriggerRef === undefined ? {} : { accountTriggerRef })}
          />
        </SidebarFooter>
      </div>
    </Sidebar>
  )
}
