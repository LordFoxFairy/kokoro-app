"use client"

import type { ProjectPinsModel } from "@/features/app/use-project-pins"
import { useLayoutEffect, useRef, Fragment, type Dispatch, type RefObject, type SetStateAction, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, ChevronRight, Ellipsis, Folder, Shapes, Monitor, Plus, SquareMousePointer, SquarePen, WandSparkles, Workflow } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useKeyboardShortcuts, useKeyboardShortcutParts } from "@/hooks/use-keyboard-shortcuts"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"
import { isRuntimeNavigationEnabled, navigationIcon, registeredNavigationRoute } from "@/ui/navigation/runtime-navigation-registry"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

import { type RailDragKind, type RailDragProps, type RailDragState, markPointerFocus } from "./workspace-rail-actions"
import type { RailConversationReads, WorkbenchNavigationItem, WorkspaceRailProject, WorkspaceRailProps } from "./workspace-rail-types"
import { itemStyles, navigationStyles, railStyles } from "./workspace-rail-styles"
import { WorkspaceRailLoadingPlaceholder } from "./workspace-rail-loading-placeholder"
import { WorkspaceRailProjectCreateDialog } from "./workspace-rail-project-create-dialog"
import { WorkspaceRailProjectMenu } from "./workspace-rail-project-menu"
import { ScopedConversationGroup } from "./workspace-rail-session-list"
export { WorkspaceRailHeader, type WorkspaceRailHeaderProps } from "./workspace-rail-header"

export type WorkspaceRailNavigationProps = Pick<WorkspaceRailProps, "conversationMove" | "conversationMovePending" | "conversationMoveFailed" | "onRetryConversationMove"> & {
  navigation?: readonly RuntimeNavigationItem[]
  featureFlags?: readonly RuntimeFeatureFlag[]
  projectHref?: string
  projectActive: boolean
  projects?: readonly WorkspaceRailProject[]
  orderedProjects: WorkspaceRailProject[]
  projectListStatus?: "blocked" | "loading" | "ready" | "error"
  projectListRetryable?: boolean
  onRetryProjects?: () => void
  projectPickerOpen: boolean
  setProjectPickerOpen: Dispatch<SetStateAction<boolean>>
  onCreateProject?: (input?: Readonly<{ name?: string; draft?: string }>) => void
  onRequestProjectRename?: (projectId: string, opener?: HTMLButtonElement | null) => void
  projectPins?: ProjectPinsModel
  onRequestProjectDelete?: (projectId: string, opener: HTMLButtonElement | null) => void
  onNewChat: () => void
  closeNavigation: () => void
  onOpenSettings: (tab: SettingsTab) => void
  deleteDialogFallbackFocusRef?: RefObject<HTMLButtonElement | null>
  activeNavigationKey?: string
  mountedSurfacePrefetch: boolean | undefined
  compactDesktop: boolean
  navigationExpanded: boolean
  navigationTransitionKey: string
  newSessionLabel: string
  conversationReads?: RailConversationReads
  onRequestDelete: NonNullable<WorkspaceRailProps["onRequestDelete"]>
  awaitingIds: ReadonlySet<string>
  dragProps: (kind: RailDragKind, id: string) => RailDragProps
  dragState: RailDragState | null
  dragOverKey: string | null
}

/** Primary destinations, workbench entries, and project navigation. */
export function WorkspaceRailNavigation({
  navigation,
  featureFlags,
  projectHref,
  projectActive,
  projects,
  orderedProjects,
  projectListStatus,
  projectPickerOpen,
  setProjectPickerOpen,
  onCreateProject,
  onRequestProjectRename,
  onRequestProjectDelete,
  projectPins,
  onNewChat,
  closeNavigation,
  onOpenSettings,
  activeNavigationKey,
  mountedSurfacePrefetch,
  compactDesktop,
  navigationExpanded,
  navigationTransitionKey,
  newSessionLabel,
  conversationReads,
  onRequestDelete,
  awaitingIds,
  conversationMove = null,
  conversationMovePending = false,
  conversationMoveFailed = false,
  onRetryConversationMove,
  dragProps,
  dragState,
  dragOverKey,
  deleteDialogFallbackFocusRef,
}: WorkspaceRailNavigationProps) {
  const t = useT()
  // The Projects caption is a real disclosure in Manus. Keeping this state at
  // the navigation composition boundary lets its contents collapse without
  // changing the owner-backed project collection or project-route selection.
  const [projectsExpanded, setProjectsExpanded] = useState(true)
  // An expanded project owns exactly one scoped list.  A closed project is not
  // mounted, so it cannot issue a background session read merely because it is
  // visible in the project index.
  const [projectConversationExpansion, setProjectConversationExpansion] = useState<ReadonlyMap<string, boolean>>(new Map())
  // Opening a project seeds a presentation choice once; leaving its route
  // must not collapse the same scoped tasks. A recorded false is an explicit
  // user choice and must not be overwritten by later route activation.
  const newlyActiveProjects = orderedProjects.filter((project) =>
    ((projectActive && project.href === projectHref) || project.active === true)
    && !projectConversationExpansion.has(project.id),
  )
  if (conversationReads?.admitted !== false
    && (projectListStatus === undefined || projectListStatus === "ready")
    && newlyActiveProjects.length > 0) {
    const next = new Map(projectConversationExpansion)
    for (const project of newlyActiveProjects) next.set(project.id, true)
    setProjectConversationExpansion(next)
  }
  const [projectCreateOpen, setProjectCreateOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const keyboardShortcuts = useKeyboardShortcuts()
  const keyboardShortcutParts = useKeyboardShortcutParts()
  const enabledNavigation = navigation?.filter((item) => isRuntimeNavigationEnabled(item, featureFlags))
  const workbenchNavigation: WorkbenchNavigationItem[] = (enabledNavigation ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    icon: navigationIcon(item.key),
    settingsTab: registeredNavigationRoute(item.key)?.settingsTab,
    href: registeredNavigationRoute(item.key)?.href,
  }))
  const navigationByKey = new Map(workbenchNavigation.map((item) => [item.key, item]))
  const primaryDestinations = ["agent", "library"]
    .map((key) => navigationByKey.get(key))
    .filter((item): item is WorkbenchNavigationItem => item !== undefined)
  const pluginsDestination = navigationByKey.get("mcp")
  const PluginsIcon = pluginsDestination?.icon
  const automationDestination = navigationByKey.get("scheduled")
  const automationHref = automationDestination?.href
  // Scheduled tasks already have the Automation destination. Do not duplicate
  // them in More or leave the primary affordance disabled while it is enabled.
  // Other manifest-provided Kokoro destinations retain their existing access.
  const tuckedDestinations = workbenchNavigation.filter((item) => !primaryDestinations.includes(item) && item !== pluginsDestination && item !== automationDestination)
  const moreActive = tuckedDestinations.some((item) => item.key === activeNavigationKey)
  const renderTuckedDestination = ({ key, label, icon: Icon, settingsTab, href }: WorkbenchNavigationItem) => href ? (
    <DropdownMenuItem key={key} asChild>
      <Link href={href} {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, href)} onClick={() => { setMoreOpen(false); closeNavigation() }} aria-current={activeNavigationKey === key ? "page" : undefined}>
        <span className={navigationStyles.moreGlyph}><Icon aria-hidden="true" /></span>
        <span>{label}</span>
        {activeNavigationKey === key ? <Check className={navigationStyles.moreCheck} aria-hidden="true" /> : null}
      </Link>
    </DropdownMenuItem>
  ) : settingsTab ? (
    <DropdownMenuItem key={key} onSelect={() => { onOpenSettings(settingsTab); closeNavigation() }}>
      <span className={navigationStyles.moreGlyph}><Icon aria-hidden="true" /></span><span>{label}</span>
    </DropdownMenuItem>
  ) : null
  const projectReadFeedback = projectListStatus === "loading" || projectListStatus === "blocked" ? (
    <WorkspaceRailLoadingPlaceholder
      label={t("firstSite.projectsLoading")}
      testId="projects-loading"
    />
  ) : projectListStatus === "error" ? (
    <span className="sr-only" role="status">{t("firstSite.projectsError")}</span>
  ) : projectListStatus === "ready" && orderedProjects.length === 0 ? (
    <p role="status" data-testid="projects-empty">{t("firstSite.projectsEmpty")}</p>
  ) : null

  const toggleProjectConversations = (projectId: string, currentlyExpanded: boolean) => {
    setProjectConversationExpansion((current) => {
      const next = new Map(current)
      next.set(projectId, !currentlyExpanded)
      return next
    })
  }

  const navigationRef = useRef<HTMLElement>(null)
  const pinFocusScope = useRef<object>({})
  const pinVisibleIds = useRef<ReadonlySet<string>>(new Set())
  useLayoutEffect(() => { pinVisibleIds.current = new Set(orderedProjects.map(item => item.id)) }, [orderedProjects])
  useLayoutEffect(() => {
    const scope = {}
    pinFocusScope.current = scope
    const retireFocus = () => { pinFocusScope.current = {} }
    window.addEventListener("popstate", retireFocus)
    window.addEventListener("kokoro:surface-navigation", retireFocus)
    return () => {
      if (pinFocusScope.current === scope) pinFocusScope.current = {}
      window.removeEventListener("popstate", retireFocus)
      window.removeEventListener("kokoro:surface-navigation", retireFocus)
    }
  }, [projectPins?.context])
  const setProjectPin = (id: string, value: boolean, opener: HTMLButtonElement | null) => {
    const scope = pinFocusScope.current
    const route = `${window.location.pathname}${window.location.search}${window.location.hash}`
    void projectPins?.set(id, value).then(() => window.requestAnimationFrame(() => {
      if (pinFocusScope.current !== scope || !pinVisibleIds.current.has(id) || route !== `${window.location.pathname}${window.location.search}${window.location.hash}` || !navigationRef.current || opener?.isConnected
        || document.activeElement !== document.body) return
      const row = [...navigationRef.current.querySelectorAll<HTMLElement>("[data-project-id]")].find(item => item.dataset.projectId === id)
      const target = row?.querySelector<HTMLButtonElement>("[data-project-menu-trigger]")
        ?? navigationRef.current.querySelector<HTMLButtonElement>('[aria-controls="rail-project-list"], [data-navigation-section="project"]')
      if (target?.isConnected && !target.disabled && (typeof target.checkVisibility !== "function" || target.checkVisibility())) target.focus({ preventScroll: true })
    }))
  }
  const pinnedProjects = projectPins?.pinned.flatMap(pin => {
    const project=orderedProjects.find(item=>item.id===pin.project_id)
    return project ? [project] : []
  }) ?? []
  const pinnedIds=new Set(pinnedProjects.map(item=>item.id))
  const ordinaryProjects=orderedProjects.filter(item=>!pinnedIds.has(item.id))
  const renderProjectRows = (items: readonly WorkspaceRailProject[]) => items.map((project) => {
                const active = (projectActive && project.href === projectHref) || project.active === true
                const conversationsExpanded = projectConversationExpansion.get(project.id) ?? active
                const testId = active || orderedProjects.length === 1 ? "rail-project" : `rail-project-${project.id}`
                const dragging = dragState?.kind === "project" && dragState.id === project.id
                const dragOver = dragOverKey === `project:${project.id}`
                return (
                  <Fragment key={project.id}>
                  <WorkspaceRailProjectMenu project={project} identity={conversationReads?.identity ?? "controlled"} admitted={conversationReads?.admitted !== false && (projectListStatus === undefined || projectListStatus === "ready")}
                    triggerClassName={cn(itemStyles.projectAction, itemStyles.projectOptions)}
                    {...(projectPins === undefined ? {} : { pins: projectPins, onSetPin: setProjectPin })}
                    {...(onRequestProjectRename === undefined ? {} : { onRename: onRequestProjectRename })}
                    {...(onRequestProjectDelete === undefined ? {} : { onDelete: onRequestProjectDelete })}
                    onShowLess={() => setProjectConversationExpansion(current => new Map(current).set(project.id, false))}
                    onNavigate={closeNavigation}>{menuTrigger => <SidebarMenuItem
                    className={cn(itemStyles.item, navigationStyles.projectRow, dragging && itemStyles.itemDragging, dragOver && itemStyles.itemDragOver)}
                    data-project-id={project.id}
                    data-drag-kind="project"
                    data-project-active={active ? "true" : "false"}
                    data-dragging={dragging ? "true" : "false"}
                    data-drag-over={dragOver ? "true" : "false"}
                  >
                    <SidebarMenuButton
                      type="button"
                      className={itemStyles.itemSelect}
                      isActive={active}
                      {...dragProps("project", project.id)}
                      onPointerDown={markPointerFocus}
                      onClick={() => toggleProjectConversations(project.id, conversationsExpanded)}
                      aria-label={project.name}
                      aria-expanded={conversationsExpanded}
                      aria-controls={`rail-project-conversations-${project.id}`}
                      data-testid={testId}
                      data-navigation-section="project"
                    >
                      <span className={itemStyles.projectGlyph} aria-hidden="true">
                        <Folder className={cn(railStyles.icon, itemStyles.projectFolderIcon)} />
                        <ChevronRight className={cn(railStyles.icon, itemStyles.projectChevron)} />
                      </span>
                      <span className={itemStyles.itemTitle}>{project.name}</span>
                    </SidebarMenuButton>
                    <span className={itemStyles.projectActions}>
                      {menuTrigger}
                      <Button asChild variant="ghost" size="icon-xs" className={itemStyles.projectAction}>
                        <Link href={project.href}
                          {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })}
                          onPointerDown={markPointerFocus}
                          onClickCapture={(event) => interceptMountedSurfaceNavigation(event, project.href)}
                          onClick={closeNavigation}
                          aria-label={`${t("rail.newChat")} · ${project.name}`}
                          aria-current={active ? "page" : undefined}
                        >
                          <SquarePen aria-hidden="true" />
                        </Link>
                      </Button>
                    </span>
                  </SidebarMenuItem>}</WorkspaceRailProjectMenu>
                  {conversationsExpanded ? <SidebarMenuItem
                      id={`rail-project-conversations-${project.id}`}
                      className={navigationStyles.projectConversationGroup}
                    >
                      {conversationReads ? <ScopedConversationGroup
                        scope={{ kind: "project", projectRef: project.id }}
                        reads={conversationReads}
                        compactDesktop={false}
                        query=""
                        searchOpen={false}
                        awaitingIds={awaitingIds}
                        closeNavigation={closeNavigation}
                        onNewChat={onNewChat}
                        hideSectionHeader
                        conversationMove={conversationMove}
                        conversationMovePending={conversationMovePending}
                        conversationMoveFailed={conversationMoveFailed}
                        {...(onRetryConversationMove === undefined ? {} : { onRetryConversationMove })}
                        projects={orderedProjects}
                        projectListReady={projectListStatus === "ready"}
                        onRequestDelete={onRequestDelete}
                      /> : <p className={itemStyles.empty} role="status">{t("firstSite.unavailable")}</p>}
                    </SidebarMenuItem> : null}
                  </Fragment>
                )
              })

  return (
    <nav ref={navigationRef} className={navigationStyles.nav} aria-label={t("rail.navAria")}>
      <SidebarMenu data-desktop-global-menu="true">
        {/* 新对话：带 ⇧⌘O 快捷键（AppFrame 已接入键盘）。 */}
        <SidebarMenuItem>
          <SidebarMenuButton
            ref={deleteDialogFallbackFocusRef}
            tooltip={newSessionLabel}
            tooltipKey={navigationTransitionKey}
            aria-label={newSessionLabel}
            size="lg"
            className={navigationStyles.navItem}
            type="button"
            data-testid="rail-new-conversation"
            data-navigation-section="new-conversation"
            onPointerDown={markPointerFocus}
            onClick={() => { onNewChat(); closeNavigation() }}
          >
            <SquarePen className={railStyles.icon} />
            {navigationExpanded ? <span className={railStyles.navLabel}>{newSessionLabel}</span> : null}
            {navigationExpanded ? <span className={navigationStyles.navShortcut} aria-hidden>{keyboardShortcutParts(keyboardShortcuts.newTask).join("")}</span> : null}
          </SidebarMenuButton>
        </SidebarMenuItem>

      </SidebarMenu>

      <SidebarGroup className={navigationStyles.navGroup} data-desktop-workbench-nav="true">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                disabled
                aria-disabled="true"
                tooltip={`${t("rail.computer")} · ${t("firstSite.unavailable")}`}
                tooltipKey={navigationTransitionKey}
                className={cn(navigationStyles.navItem, navigationStyles.unavailableItem)}
                data-navigation-section="computer"
              >
                <Monitor className={railStyles.icon} />
                {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.computer")}</span> : null}
              </SidebarMenuButton>
            </SidebarMenuItem>

            {primaryDestinations.map(({ key, label, icon: Icon, settingsTab, href }) => {
              const active = activeNavigationKey === key
              if (href) {
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild tooltip={label} tooltipKey={navigationTransitionKey} className={navigationStyles.navItem} data-testid={`rail-${key}`} data-navigation-section={key} isActive={active}>
                      <Link href={href} {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })} onPointerDown={markPointerFocus} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, href)} onClick={closeNavigation} aria-label={label} aria-current={active ? "page" : undefined}>
                        <Icon className={railStyles.icon} />
                        {navigationExpanded && key === "agent" ? <span className={navigationStyles.agentLabel}><span>{label}</span><span className={navigationStyles.agentBadge}>Cue!</span></span> : null}
                        {navigationExpanded && key !== "agent" ? <span className={railStyles.navLabel}>{label}</span> : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }
              return (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    tooltip={label}
                    tooltipKey={navigationTransitionKey}
                    aria-label={label}
                    type="button"
                    className={navigationStyles.navItem}
                    data-testid={`rail-${key}`}
                    data-navigation-section={key}
                    isActive={active}
                    onPointerDown={markPointerFocus}
                    onClick={() => { if (settingsTab) { onOpenSettings(settingsTab); closeNavigation() } }}
                  >
                    <Icon className={railStyles.icon} />
                    {navigationExpanded ? <span className={railStyles.navLabel}>{label}</span> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}

            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                disabled
                aria-disabled="true"
                tooltip={`${t("rail.create")} · ${t("firstSite.unavailable")}`}
                tooltipKey={navigationTransitionKey}
                className={cn(navigationStyles.navItem, navigationStyles.unavailableItem)}
                data-navigation-section="create"
              >
                <WandSparkles className={railStyles.icon} />
                {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.create")}</span> : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              {automationHref ? <SidebarMenuButton
                asChild
                tooltip={t("rail.automation")}
                tooltipKey={navigationTransitionKey}
                className={navigationStyles.navItem}
                data-navigation-section="automation"
                isActive={activeNavigationKey === "scheduled"}
              >
                <Link href={automationHref} {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })} aria-label={t("rail.automation")} aria-current={activeNavigationKey === "scheduled" ? "page" : undefined} onPointerDown={markPointerFocus} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, automationHref)} onClick={closeNavigation}>
                  <Workflow className={railStyles.icon} />
                  {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.automation")}</span> : null}
                </Link>
              </SidebarMenuButton> : <SidebarMenuButton
                type="button"
                disabled
                aria-disabled="true"
                tooltip={`${t("rail.automation")} · ${t("firstSite.unavailable")}`}
                tooltipKey={navigationTransitionKey}
                className={cn(navigationStyles.navItem, navigationStyles.unavailableItem)}
                data-navigation-section="automation"
              >
                <Workflow className={railStyles.icon} />
                {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.automation")}</span> : null}
              </SidebarMenuButton>}
            </SidebarMenuItem>
            {pluginsDestination?.href && PluginsIcon ? (() => {
              const pluginsHref = pluginsDestination.href;
              const pluginsLabel = pluginsDestination.label;
              return (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={pluginsLabel} tooltipKey={navigationTransitionKey} className={navigationStyles.navItem} data-testid="rail-mcp" data-navigation-section="mcp" isActive={activeNavigationKey === "mcp"}>
                    <Link href={pluginsHref} {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })} onPointerDown={markPointerFocus} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, pluginsHref)} onClick={closeNavigation} aria-label={pluginsLabel} aria-current={activeNavigationKey === "mcp" ? "page" : undefined}>
                      <PluginsIcon className={railStyles.icon} />
                      {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.plugins")}</span> : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })() : null}

            {tuckedDestinations.length > 0 ? <SidebarMenuItem>
              <DropdownMenu modal={false} open={moreOpen} onOpenChange={setMoreOpen}>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    type="button"
                    tooltip={t("rail.more")}
                    tooltipKey={navigationTransitionKey}
                    className={navigationStyles.navItem}
                    data-testid="rail-more"
                    data-navigation-section="more"
                    isActive={moreActive}
                    aria-current={moreActive ? "page" : undefined}
                  >
                    <Ellipsis className={railStyles.icon} />
                    {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.more")}</span> : null}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right" sideOffset={4} className={navigationStyles.moreMenu}>
                  <DropdownMenuItem disabled aria-description={t("firstSite.unavailable")}>
                    <span className={navigationStyles.moreGlyph}><SquareMousePointer aria-hidden="true" /></span><span>Computer Use</span>
                  </DropdownMenuItem>
                  {tuckedDestinations.filter((item) => item.key === "skills").map(renderTuckedDestination)}
                  <DropdownMenuItem onSelect={() => { onOpenSettings("personalization"); closeNavigation() }}>
                    <span className={navigationStyles.moreGlyph}><Shapes aria-hidden="true" /></span><span>{t("settings.personalizationTitle")}</span>
                  </DropdownMenuItem>
                  {tuckedDestinations.some((item) => item.key !== "skills") ? <DropdownMenuSeparator /> : null}
                  {tuckedDestinations.filter((item) => item.key !== "skills").map(renderTuckedDestination)}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem> : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {!compactDesktop && projectPins?.available && (pinnedProjects.length>0 || projectPins.nextCursor!==null) ? <SidebarGroup className={navigationStyles.projectGroup}>
        <SidebarGroupLabel>{t("firstSite.pinnedProjects")}</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu aria-label={t("firstSite.pinnedProjects")}>
          {renderProjectRows(pinnedProjects)}
          {projectPins.nextCursor!==null ? <SidebarMenuItem><Button variant="ghost" disabled={projectPins.loading} onClick={projectPins.loadMore}>{t("firstSite.moreProjectPins")}</Button></SidebarMenuItem> : null}
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup> : null}

      {projectHref || projects !== undefined || onCreateProject ? <SidebarGroup className={cn(navigationStyles.navGroup, navigationStyles.projectGroup)} data-desktop-projects="true" data-projects-expanded={projectsExpanded ? "true" : "false"}>
        {!compactDesktop ? <SidebarGroupLabel className={cn(railStyles.navGroupLabel, navigationStyles.navGroupLabel)}>
          <Button
            type="button"
            variant="ghost"
            className={navigationStyles.projectDisclosure}
            aria-label={t(projectsExpanded ? "firstSite.collapseProjects" : "firstSite.expandProjects")}
            aria-expanded={projectsExpanded}
            aria-controls="rail-project-list"
            onClick={() => setProjectsExpanded((expanded) => !expanded)}
          >
            <span>{t("firstSite.projects")}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
          <span className={navigationStyles.projectHeaderActions}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" className={itemStyles.sectionAction} aria-label={t("firstSite.projectOptions")} data-testid="rail-project-options">
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className={navigationStyles.projectMenu}>
                <DropdownMenuItem disabled><span>{t("firstSite.projectSort")}</span><ChevronRight aria-hidden="true" /></DropdownMenuItem>
                <DropdownMenuItem disabled><Plus aria-hidden="true" />{t("firstSite.newProjectSection")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon-xs"
              className={itemStyles.sectionAction}
              aria-label={t("firstSite.newProject")}
              data-testid="rail-new-project"
              disabled={!onCreateProject}
              onClick={() => setProjectCreateOpen(true)}
            >
              <Plus aria-hidden="true" />
            </Button>
          </span>
        </SidebarGroupLabel> : null}
        {compactDesktop || projectsExpanded ? <SidebarGroupContent>
          {compactDesktop ? (
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton type="button" className={navigationStyles.navItem} isActive={projectActive} tooltip={t("firstSite.projects")} tooltipKey={navigationTransitionKey} aria-label={t("firstSite.projects")} data-testid="rail-project" data-navigation-section="project" onPointerDown={markPointerFocus}>
                      <Folder className={railStyles.icon} />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" sideOffset={10} className={navigationStyles.projectMenu}>
                    {projectReadFeedback}
                    {onCreateProject ? <DropdownMenuItem onSelect={() => setProjectCreateOpen(true)}><Plus aria-hidden="true" />{t("firstSite.newProject")}</DropdownMenuItem> : null}
                    {orderedProjects.map((project) => {
                      const active = (projectActive && project.href === projectHref) || project.active === true
                      return (
                        <DropdownMenuItem key={project.id} asChild>
                          <Link
                            href={project.href}
                            {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })}
                            {...dragProps("project", project.id)}
                            onPointerDown={markPointerFocus}
                            onClickCapture={(event) => {
                              interceptMountedSurfaceNavigation(event, project.href)
                              setProjectPickerOpen(false)
                            }}
                            onClick={closeNavigation}
                            aria-label={project.name}
                            aria-current={active ? "page" : undefined}
                          >
                            <Folder aria-hidden="true" />
                            {project.name}
                          </Link>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : (
            <SidebarMenu id="rail-project-list" data-project-list="true" aria-label={t("firstSite.projects")}>
              {projectReadFeedback ? <SidebarMenuItem>{projectReadFeedback}</SidebarMenuItem> : null}
              {renderProjectRows(ordinaryProjects)}
            </SidebarMenu>
          )}
        </SidebarGroupContent> : null}
      </SidebarGroup> : null}
      <WorkspaceRailProjectCreateDialog open={projectCreateOpen} onOpenChange={setProjectCreateOpen} {...(onCreateProject === undefined ? {} : { onCreate: onCreateProject })} />
    </nav>
  )
}
