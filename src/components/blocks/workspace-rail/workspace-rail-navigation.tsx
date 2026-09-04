"use client"

import { type Dispatch, type MouseEvent, type PointerEvent, type RefObject, type ReactNode, type SetStateAction } from "react"
import Link from "next/link"
import { Folder, ListTodo, MessageSquareMore, Plus, Search, SquarePen, X } from "lucide-react"

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
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"
import { isRuntimeNavigationEnabled, navigationIcon, registeredNavigationRoute } from "@/ui/navigation/runtime-navigation-registry"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

import { type RailDragKind, type RailDragProps, type RailDragState, markPointerFocus } from "./workspace-rail-actions"
import type { WorkbenchNavigationItem, WorkspaceRailProject } from "./workspace-rail-types"
import { itemStyles, navigationStyles, railStyles } from "./workspace-rail-styles"

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
  chatHref: string
  projectHref?: string
  projectActive: boolean
  projects?: readonly WorkspaceRailProject[]
  orderedProjects: WorkspaceRailProject[]
  projectPickerOpen: boolean
  setProjectPickerOpen: Dispatch<SetStateAction<boolean>>
  onCreateProject?: () => void
  onCreateTask: () => void
  onNewChat: () => void
  closeNavigation: () => void
  onOpenSettings: (tab: SettingsTab) => void
  deleteDialogFallbackFocusRef?: RefObject<HTMLButtonElement | null>
  activeNavigationKey?: string
  mountedSurfacePrefetch: boolean | undefined
  compactDesktop: boolean
  navigationExpanded: boolean
  isMobile: boolean
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
  chatHref,
  projectHref,
  projectActive,
  projects,
  orderedProjects,
  projectPickerOpen,
  setProjectPickerOpen,
  onCreateProject,
  onCreateTask,
  onNewChat,
  closeNavigation,
  onOpenSettings,
  activeNavigationKey,
  mountedSurfacePrefetch,
  compactDesktop,
  navigationExpanded,
  isMobile,
  navigationTransitionKey,
  newSessionLabel,
  dragProps,
  dragState,
  dragOverKey,
  deleteDialogFallbackFocusRef,
}: WorkspaceRailNavigationProps) {
  const t = useT()
  const enabledNavigation = navigation?.filter((item) => isRuntimeNavigationEnabled(item, featureFlags))
  const workbenchNavigation: WorkbenchNavigationItem[] = (enabledNavigation ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    icon: navigationIcon(item.key),
    settingsTab: registeredNavigationRoute(item.key)?.settingsTab,
    href: registeredNavigationRoute(item.key)?.href,
  }))

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
            className={cn(navigationStyles.navItem, "text-sidebar-primary font-semibold")}
            type="button"
            data-testid="rail-new-task"
            data-navigation-section="new-task"
            onPointerDown={markPointerFocus}
            onClick={() => { onNewChat(); closeNavigation() }}
          >
            <SquarePen className={railStyles.icon} />
            {navigationExpanded ? <span className={railStyles.navLabel}>{newSessionLabel}</span> : null}
            {navigationExpanded ? <span className={navigationStyles.navShortcut} aria-hidden>{t("rail.newChatShortcut")}</span> : null}
          </SidebarMenuButton>
        </SidebarMenuItem>

        {/* The touch Sheet keeps a direct-chat shortcut; desktop uses the
            scoped list below and the single workbench conversation stop. */}
        {isMobile ? (
          <SidebarMenuItem data-desktop-direct-chat="true">
            <SidebarMenuButton asChild tooltip={t("rail.directChats")} tooltipKey={navigationTransitionKey} className={navigationStyles.navItem} isActive={activeNavigationKey === "chat"}>
              <Link
                href={chatHref}
                {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })}
                onClickCapture={(event) => interceptMountedSurfaceNavigation(event, chatHref)}
                onClick={closeNavigation}
                data-testid="rail-direct-chat"
                data-navigation-section="direct-chat"
                aria-current={activeNavigationKey === "chat" ? "page" : undefined}
              >
                <MessageSquareMore className={railStyles.icon} />
                {navigationExpanded ? <span className={railStyles.navLabel}>{t("rail.directChats")}</span> : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
      </SidebarMenu>

      {workbenchNavigation.length > 0 ? <SidebarGroup className={navigationStyles.navGroup} data-desktop-workbench-nav="true">
        <SidebarGroupContent>
          <SidebarMenu>
            {workbenchNavigation.map(({ key, label, icon: Icon, settingsTab, href }) => {
              const canActivate = settingsTab !== undefined || href !== undefined
              if (href) {
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild tooltip={label} tooltipKey={navigationTransitionKey} className={navigationStyles.navItem} data-testid={`rail-${key}`} data-navigation-section={key} isActive={activeNavigationKey === key}>
                      <Link href={href} {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })} onPointerDown={markPointerFocus} onClickCapture={(event) => interceptMountedSurfaceNavigation(event, href)} onClick={closeNavigation} aria-label={label} aria-current={activeNavigationKey === key ? "page" : undefined}>
                        <Icon className={railStyles.icon} />
                        {navigationExpanded ? <span className={railStyles.navLabel}>{label}</span> : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }
              return (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    tooltip={settingsTab || canActivate ? label : `${label} · ${t("firstSite.unavailable")}`}
                    tooltipKey={navigationTransitionKey}
                    aria-label={label}
                    type="button"
                    className={navigationStyles.navItem}
                    data-testid={`rail-${key}`}
                    data-navigation-section={key}
                    disabled={!canActivate}
                    aria-disabled={!canActivate || undefined}
                    onPointerDown={markPointerFocus}
                    onClick={() => {
                      if (settingsTab) {
                        onOpenSettings(settingsTab)
                        closeNavigation()
                      }
                    }}
                  >
                    <Icon className={railStyles.icon} />
                    {navigationExpanded ? <span className={railStyles.navLabel}>{label}</span> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup> : null}

      {projectHref || projects !== undefined ? <SidebarGroup className={cn(navigationStyles.navGroup, navigationStyles.projectGroup)} data-desktop-projects="true">
        {!compactDesktop ? <SidebarGroupLabel className={cn(railStyles.navGroupLabel, navigationStyles.navGroupLabel)}>
          <span>{t("firstSite.projects")}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className={itemStyles.sectionAction} aria-label={t("firstSite.newProject")} data-testid="rail-new-project">
                <Plus aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className={navigationStyles.projectMenu}>
              <DropdownMenuItem {...(onCreateProject === undefined ? {} : { onSelect: () => onCreateProject() })}>
                <Folder aria-hidden="true" />
                {t("firstSite.newProject")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarGroupLabel> : null}
        <SidebarGroupContent>
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
                    {orderedProjects.map((project) => {
                      const active = project.active ?? (projectActive && project.href === projectHref)
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
            <SidebarMenu data-project-list="true" aria-label={t("firstSite.projects")}>
              {orderedProjects.map((project) => {
                const active = project.active ?? (projectActive && project.href === projectHref)
                const testId = active || orderedProjects.length === 1 ? "rail-project" : `rail-project-${project.id}`
                const dragging = dragState?.kind === "project" && dragState.id === project.id
                const dragOver = dragOverKey === `project:${project.id}`
                return (
                  <SidebarMenuItem
                    key={project.id}
                    className={cn(itemStyles.item, dragging && itemStyles.itemDragging, dragOver && itemStyles.itemDragOver)}
                    data-project-id={project.id}
                    data-drag-kind="project"
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
                        <Folder className={railStyles.icon} aria-hidden="true" />
                        <span className={itemStyles.itemTitle}>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          )}
          {projectActive || projectHref ? (
            <SidebarMenu className={itemStyles.projectTaskShortcut}>
              <SidebarMenuItem>
                <SidebarMenuButton asChild type="button" className={navigationStyles.navItem} data-testid="rail-project-task" data-navigation-section="project-task">
                  {projectActive ? (
                    <button
                      type="button"
                      aria-label={t("firstSite.tasks")}
                      onPointerDown={markPointerFocus}
                      onClick={() => { onCreateTask(); closeNavigation() }}
                    >
                      <ListTodo className={railStyles.icon} aria-hidden="true" />
                    </button>
                  ) : projectHref !== undefined ? (
                    <Link
                      href={projectHref}
                      {...(mountedSurfacePrefetch === undefined ? {} : { prefetch: mountedSurfacePrefetch })}
                      aria-label={t("firstSite.tasks")}
                      onPointerDown={markPointerFocus}
                      onClickCapture={(event) => interceptMountedSurfaceNavigation(event, projectHref)}
                      onClick={closeNavigation}
                    >
                      <ListTodo className={railStyles.icon} aria-hidden="true" />
                    </Link>
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup> : null}
    </nav>
  )
}
