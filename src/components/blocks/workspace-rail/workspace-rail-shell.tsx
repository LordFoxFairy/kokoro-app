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
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar"
import { DEFAULT_BRAND } from "@/config/brand"
import { useT } from "@/i18n/context"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { ConversationSummary } from "@/ui/rail/rail-search"

import { WorkspaceInviteCard } from "./workspace-invite-card"
import {
  DRAG_HELP_ID,
  markPointerFocus,
  useWorkspaceRailActions,
} from "./workspace-rail-actions"
import { WorkspaceRailAccount } from "./workspace-rail-account"
import { WorkspaceRailHeader, WorkspaceRailNavigation } from "./workspace-rail-navigation"
import { WorkspaceRailSessionList } from "./workspace-rail-session-list"
import type { WorkspaceRailProps } from "./workspace-rail-types"
import { railStyles } from "./workspace-rail-styles"

export type WorkspaceRailShellProps = Omit<WorkspaceRailProps, "onRequestDelete" | "deleteDialogFallbackFocusRef"> & {
  onRequestDelete: (conversation: ConversationSummary) => void
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
  projects,
  onReorderProjects,
  onCreateTask,
  onReorderConversations,
  onReorderTasks,
  activeNavigationKey,
  conversations,
  activeId,
  awaitingIds,
  onSelectConversation,
  onRequestDelete,
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
}: WorkspaceRailShellProps) {
  const t = useT()
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar()
  const visualCollapsed = state === "collapsed"
  const compactDesktop = !isMobile && visualCollapsed
  // Mounted-surface routes are projected through history on desktop, so their
  // default viewport/hover RSC prefetch is redundant. Keep mobile Link native.
  const mountedSurfacePrefetch = isMobile ? undefined : false
  const navigationExpanded = !compactDesktop
  const navigationTransitionKey = `${activeNavigationKey ?? "none"}:${projectActive ? "project" : "direct"}`

  const closeNavigation = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  const newSessionLabel = t("firstSite.newTask")
  const fallbackBrandMark = (
    <BrandFallback
      {...(brandMark === undefined ? {} : { mark: brandMark })}
      {...(railStyles.brandFallbackIcon === undefined ? {} : { className: railStyles.brandFallbackIcon })}
    />
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const projectItems = useMemo(() => {
    if (projects !== undefined) return [...projects]
    if (!projectHref) return []
    return [{
      id: projectHref,
      name: brandName ?? DEFAULT_BRAND.name,
      href: projectHref,
      active: projectActive,
    }]
  }, [brandName, projectActive, projectHref, projects])

  const conversationScopeKey = projectActive ? `project:${projectHref ?? "active"}` : "direct"
  const {
    orderedProjects,
    orderedConversations,
    dragProps,
    dragState,
    dragOverKey,
  } = useWorkspaceRailActions({
    projectItems,
    conversations,
    conversationScopeKey,
    projectActive,
    ...(onReorderProjects === undefined ? {} : { onReorderProjects }),
    ...(onReorderConversations === undefined ? {} : { onReorderConversations }),
    ...(onReorderTasks === undefined ? {} : { onReorderTasks }),
  })

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
  }, [compactDesktopRail, visualCollapsed])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameReturnIdRef = useRef<string | null>(null)
  const renameRestoreFocusRef = useRef(false)

  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [searchOpen, visualCollapsed])

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
    renameRestoreFocusRef.current = restoreFocus || renameRestoreFocusRef.current
    setEditingId(null)
    setDraftTitle("")
    if (renameRestoreFocusRef.current) focusRenamedConversation()
  }

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
  const hasConversations = conversations.length > 0

  return (
    <Sidebar side="left" collapsible="icon" className={railStyles.sidebar} data-desktop-web="true">
      <div
        ref={railRootRef}
        className={railStyles.rail}
        aria-label={t("rail.railAria")}
        data-collapsed={visualCollapsed}
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
          compactDesktop={compactDesktop}
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
            chatHref={chatHref}
            {...(projectHref === undefined ? {} : { projectHref })}
            projectActive={projectActive}
            {...(projects === undefined ? {} : { projects })}
            orderedProjects={orderedProjects}
            projectPickerOpen={projectPickerOpen}
            setProjectPickerOpen={setProjectPickerOpen}
            {...(onCreateProject === undefined ? {} : { onCreateProject })}
            onCreateTask={onCreateTask ?? onNewChat}
            onNewChat={onNewChat}
            closeNavigation={closeNavigation}
            onOpenSettings={openSettings}
            deleteDialogFallbackFocusRef={deleteDialogFallbackFocusRef}
            {...(activeNavigationKey === undefined ? {} : { activeNavigationKey })}
            mountedSurfacePrefetch={mountedSurfacePrefetch}
            compactDesktop={compactDesktop}
            navigationExpanded={navigationExpanded}
            isMobile={isMobile}
            navigationTransitionKey={navigationTransitionKey}
            newSessionLabel={newSessionLabel}
            dragProps={dragProps}
            dragState={dragState}
            dragOverKey={dragOverKey}
          />
          <WorkspaceRailSessionList
            projectActive={projectActive}
            compactDesktop={compactDesktop}
            searchOpen={searchOpen}
            query={query}
            conversations={orderedConversations}
            hasConversations={hasConversations}
            activeId={activeId}
            awaitingIds={awaitingIds}
            listLoading={listLoading}
            listLoadingMore={listLoadingMore}
            listError={listError}
            {...(onRetryList === undefined ? {} : { onRetryList })}
            hasMore={hasMore}
            onLoadMore={onLoadMore}
            onCreateTask={onCreateTask ?? onNewChat}
            closeNavigation={closeNavigation}
            onSelectConversation={onSelectConversation}
            onRequestDelete={onRequestDelete}
            renameInputRef={renameInputRef}
            editingId={editingId}
            draftTitle={draftTitle}
            onDraftTitleChange={setDraftTitle}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onStartRename={startRename}
            dragProps={dragProps}
            dragState={dragState}
            dragOverKey={dragOverKey}
          />
        </SidebarContent>

        <SidebarFooter className={railStyles.footer}>
          {!compactDesktop && !isMobile ? (
            <div className={railStyles.footerInvite} data-desktop-invite="true">
              <WorkspaceInviteCard
                brandName={brandName ?? "Workspace"}
                onOpen={() => openSettings("team")}
              />
            </div>
          ) : null}
          <WorkspaceRailAccount
            {...(brandName === undefined ? {} : { brandName })}
            preview={preview}
            compactDesktop={compactDesktop}
            onOpenSettings={openSettings}
            {...(onOpenNotifications === undefined ? {} : { onOpenNotifications })}
            {...(accountTriggerRef === undefined ? {} : { accountTriggerRef })}
          />
        </SidebarFooter>
      </div>
    </Sidebar>
  )
}
