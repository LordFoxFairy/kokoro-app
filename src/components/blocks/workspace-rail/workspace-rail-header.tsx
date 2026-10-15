"use client"

import { type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react"
import Link from "next/link"
import { Search, X } from "lucide-react"

import { BrandMark } from "@/components/blocks/brand-mark/brand-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

import { navigationStyles, railStyles } from "./workspace-rail-styles"

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
