"use client"

import { type Dispatch, type MouseEvent, type PointerEvent, type ReactNode, type RefObject, type SetStateAction, useState } from "react"
import Link from "next/link"
import { Bot, ChevronDown, ChevronRight, Ellipsis, Folder, Monitor, Plus, Search, SquarePen, WandSparkles, X } from "lucide-react"

import { BrandMark } from "@/components/blocks/brand-mark/brand-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useKeyboardShortcuts, useKeyboardShortcutParts } from "@/hooks/use-keyboard-shortcuts"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"
import { isRuntimeNavigationEnabled, navigationIcon, registeredNavigationRoute } from "@/ui/navigation/runtime-navigation-registry"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

import { type RailDragKind, type RailDragProps, type RailDragState, markPointerFocus } from "./workspace-rail-actions"
import type { WorkbenchNavigationItem, WorkspaceRailProject } from "./workspace-rail-types"
import { itemStyles, navigationStyles, railStyles } from "./workspace-rail-styles"
import { WorkspaceRailLoadingPlaceholder } from "./workspace-rail-loading-placeholder"
import { WorkspaceRailProjectCreateDialog } from "./workspace-rail-project-create-dialog"

export type WorkspaceRailHeaderProps = {
  chatHref: string
  brandName?: string
  brandLogoUrl?: string
  fallbackBrandMark: ReactNode
  mountedSurfacePrefetch: boolean | undefined
  compactDesktop: boolean
  compactDesktopRail: boolean
  isMobile: boolean
  navigationExpanded: boolean
  searchOpen: boolean
  query: string
  onQueryChange: (query: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  searchToggleRef: RefObject<HTMLButtonElement | null>
  onOpenSearch: () => void
  onCloseSearch: () => void
  onCollapsedBrandPointerDown: (event: PointerEvent<HTMLElement>) => void
  onCollapsedBrandClick: (event: MouseEvent<HTMLButtonElement>) => void
  onSidebarTriggerPointerDown: (event: PointerEvent<HTMLElement>) => void
  onSidebarTriggerClick: (event: MouseEvent<HTMLButtonElement>) => void
}

/** Rail header, brand lockup, search surface, and collapse affordance. */
export function WorkspaceRailHeader({
  chatHref,
  brandName,
  brandLogoUrl,
  fallbackBrandMark,
  mountedSurfacePrefetch,
  compactDesktop,
  compactDesktopRail,
  isMobile,
  navigationExpanded,
  searchOpen,
  query,
  onQueryChange,
  searchInputRef,
  searchToggleRef,
  onOpenSearch,
  onCloseSearch,
  onCollapsedBrandPointerDown,
  onCollapsedBrandClick,
  onSidebarTriggerPointerDown,
  onSidebarTriggerClick,
}: WorkspaceRailHeaderProps) {
  const t = useT()

  return (
    <>
      <SidebarHeader className={railStyles.head} data-rail-header="true">
        {compactDesktop && !compactDesktopRail ? <Button
          className={navigationStyles.collapsedBrand}
          data-collapsed-brand="true"
          data-rail-anchor="collapsed-brand"
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("rail.expandAria")}
          title={t("rail.expandAria")}
          aria-expanded={false}
          onPointerDown={onCollapsedBrandPointerDown}
          onClick={onCollapsedBrandClick}
        >
          <span className={railStyles.brandMark} data-rail-brand-mark="true" aria-hidden="true">
            <BrandMark
              {...(brandLogoUrl === undefined ? {} : { logoUrl: brandLogoUrl })}
              imageClassName={railStyles.brandLogo ?? ""}
              fallback={fallbackBrandMark}
            />
          </span>
        </Button> : null}
        {!compactDesktop ? <Link
          className={railStyles.brand}
          href={chatHref}
          {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })}
          aria-label={brandName ?? "Workspace"}
          tabIndex={0}
          onClickCapture={(event) => interceptMountedSurfaceNavigation(event, chatHref)}
        >
          <span className={railStyles.brandMark} data-rail-brand-mark="true" aria-hidden="true">
            <BrandMark
              {...(brandLogoUrl === undefined ? {} : { logoUrl: brandLogoUrl })}
              imageClassName={railStyles.brandLogo ?? ""}
              fallback={fallbackBrandMark}
            />
          </span>
          <div className={railStyles.brandText}>
            <p className={railStyles.brandTitle}>{brandName ?? "Workspace"}</p>
          </div>
        </Link> : null}

        <div className={railStyles.headActions}>
          {!compactDesktop ? <Button
            variant="ghost"
            size="icon-sm"
            className={cn(railStyles.headBtn, navigationStyles.headerControl, navigationStyles.searchToggle)}
            data-rail-header-control="true"
            data-rail-header-control-kind="search"
            ref={searchToggleRef}
            type="button"
            onClick={() => (searchOpen ? onCloseSearch() : onOpenSearch())}
            aria-label={t("rail.searchAria")}
            aria-expanded={searchOpen}
            aria-pressed={searchOpen}
          >
            <Search className={railStyles.icon} />
          </Button> : null}
          {!compactDesktop ? <SidebarTrigger
            size="icon-sm"
            className={cn(railStyles.headBtn, navigationStyles.headerControl)}
            data-rail-header-control="true"
            data-rail-header-control-kind="toggle"
            type="button"
            data-rail-anchor="rail-toggle"
            data-web-navigation-trigger={!isMobile && (!compactDesktopRail || !compactDesktop) ? "true" : undefined}
            aria-hidden={compactDesktopRail && compactDesktop ? true : undefined}
            tabIndex={compactDesktopRail && compactDesktop ? -1 : undefined}
            aria-label={compactDesktop ? t("rail.expandAria") : t("rail.collapseAria")}
            aria-expanded={navigationExpanded}
            onPointerDown={onSidebarTriggerPointerDown}
            onClick={onSidebarTriggerClick}
          /> : null}
        </div>
      </SidebarHeader>

      {searchOpen ? (
        <div className={navigationStyles.searchBox}>
          <Search className={navigationStyles.searchGlyph} />
          <Input
            ref={searchInputRef}
            className={navigationStyles.searchInput}
            type="search"
            value={query}
            aria-label={t("rail.searchInputAria")}
            placeholder={t("rail.searchPlaceholder")}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCloseSearch()
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className={navigationStyles.searchClose}
            type="button"
            aria-label={t("rail.searchClose")}
            onClick={onCloseSearch}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </>
  )
}

export type WorkspaceRailNavigationProps = {
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
  onRequestProjectRename?: (projectId: string) => void
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
  projectListRetryable = false,
  onRetryProjects,
  projectPickerOpen,
  setProjectPickerOpen,
  onCreateProject,
  onRequestProjectRename,
  onNewChat,
  closeNavigation,
  onOpenSettings,
  activeNavigationKey,
  mountedSurfacePrefetch,
  compactDesktop,
  navigationExpanded,
  navigationTransitionKey,
  newSessionLabel,
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
  const [projectCreateOpen, setProjectCreateOpen] = useState(false)
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
  // Skills and scheduled work are intentionally tucked behind “更多”, matching
  // the live Manus rail. They retain their typed route contracts; this is only
  // a presentation grouping, not another navigation model.
  const tuckedDestinations = workbenchNavigation.filter((item) => !primaryDestinations.includes(item) && item !== pluginsDestination)
  const moreActive = tuckedDestinations.some((item) => item.key === activeNavigationKey)
  const projectReadFeedback = projectListStatus === "loading" ? (
    <WorkspaceRailLoadingPlaceholder
      label={t("firstSite.projectsLoading")}
      testId="projects-loading"
    />
  ) : projectListStatus === "error" ? (
    <div role="alert" data-testid="projects-error">
      <p>{t("firstSite.projectsError")}</p>
      <Button type="button" variant="ghost" size="sm" onClick={onRetryProjects} disabled={!onRetryProjects || !projectListRetryable}>{t("firstSite.retry")}</Button>
    </div>
  ) : projectListStatus === "ready" && orderedProjects.length === 0 ? (
    <p role="status" data-testid="projects-empty">{t("firstSite.projectsEmpty")}</p>
  ) : projectListStatus === "blocked" ? (
    <p role="status" data-testid="projects-blocked">{t("firstSite.projectsUnavailable")}</p>
  ) : null

  return (
    <nav className={navigationStyles.nav} aria-label={t("rail.navAria")}>
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
              <SidebarMenuButton
                type="button"
                disabled
                aria-disabled="true"
                tooltip={`${t("rail.automation")} · ${t("firstSite.unavailable")}`}
                tooltipKey={navigationTransitionKey}
                className={cn(navigationStyles.navItem, navigationStyles.unavailableItem)}
                data-navigation-section="automation"
              >
                <Bot className={railStyles.icon} />
                {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.automation")}</span> : null}
              </SidebarMenuButton>
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
              <DropdownMenu>
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
                <DropdownMenuContent align="start" side="right" sideOffset={8} className={navigationStyles.moreMenu}>
                  {tuckedDestinations.map(({ key, label, icon: Icon, settingsTab, href }) => href ? (
                    <DropdownMenuItem key={key} asChild>
                      <Link href={href} {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, href)} onClick={closeNavigation} aria-current={activeNavigationKey === key ? "page" : undefined}>
                        <Icon aria-hidden="true" />
                        {label}
                      </Link>
                    </DropdownMenuItem>
                  ) : settingsTab ? (
                    <DropdownMenuItem key={key} onSelect={() => { onOpenSettings(settingsTab); closeNavigation() }}>
                      <Icon aria-hidden="true" />
                      {label}
                    </DropdownMenuItem>
                  ) : null)}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem> : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

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
              {orderedProjects.map((project) => {
                const active = (projectActive && project.href === projectHref) || project.active === true
                const testId = active || orderedProjects.length === 1 ? "rail-project" : `rail-project-${project.id}`
                const dragging = dragState?.kind === "project" && dragState.id === project.id
                const dragOver = dragOverKey === `project:${project.id}`
                return (
                  <SidebarMenuItem
                    key={project.id}
                    className={cn(itemStyles.item, dragging && itemStyles.itemDragging, dragOver && itemStyles.itemDragOver)}
                    data-project-id={project.id}
                    data-drag-kind="project"
                    data-project-active={active ? "true" : "false"}
                    data-dragging={dragging ? "true" : "false"}
                    data-drag-over={dragOver ? "true" : "false"}
                  >
                    <SidebarMenuButton asChild type="button" className={itemStyles.itemSelect} isActive={active}>
                      <Link
                        href={project.href}
                        {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })}
                        {...dragProps("project", project.id)}
                        onPointerDown={markPointerFocus}
                        onClickCapture={(event) => interceptMountedSurfaceNavigation(event, project.href)}
                        onClick={closeNavigation}
                        aria-label={project.name}
                        aria-current={active ? "page" : undefined}
                        data-testid={testId}
                        data-navigation-section="project"
                      >
                        <span className={itemStyles.projectGlyph} aria-hidden="true">
                          <Folder className={cn(railStyles.icon, itemStyles.projectFolderIcon)} />
                        </span>
                        <span className={itemStyles.itemTitle}>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    {onRequestProjectRename ? <span className={itemStyles.projectActions}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon-xs" className={itemStyles.projectAction} aria-label={t("firstSite.projectOptions")}>
                            <Ellipsis aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="right" sideOffset={4} className={navigationStyles.projectMenu}>
                          <DropdownMenuItem onSelect={() => onRequestProjectRename(project.id)}>
                            <SquarePen aria-hidden="true" />
                            {t("firstSite.renameProject")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button type="button" variant="ghost" size="icon-xs" className={itemStyles.projectAction} aria-label={t("firstSite.renameProject")} onClick={() => onRequestProjectRename(project.id)}>
                        <SquarePen aria-hidden="true" />
                      </Button>
                    </span> : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          )}
        </SidebarGroupContent> : null}
      </SidebarGroup> : null}
      <WorkspaceRailProjectCreateDialog open={projectCreateOpen} onOpenChange={setProjectCreateOpen} {...(onCreateProject === undefined ? {} : { onCreate: onCreateProject })} />
    </nav>
  )
}
