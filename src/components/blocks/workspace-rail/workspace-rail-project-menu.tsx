"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import Link from "next/link"
import { ChevronsUp, Ellipsis, FolderOpen, SquarePen, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"
import type { WorkspaceRailProject } from "./workspace-rail-types"
import styles from "./workspace-rail-project-menu.module.css"

type Props = {
  project: WorkspaceRailProject
  identity: string
  admitted: boolean
  triggerClassName: string
  onRename?: (target: string, opener: HTMLButtonElement | null) => void
  onDelete?: (target: string, opener: HTMLButtonElement | null) => void
  onShowLess: () => void
  onNavigate: () => void
  children: (trigger: ReactNode) => ReactElement
}

/** Two native menu surfaces share one exact target and one action definition. */
export function WorkspaceRailProjectMenu({ project, identity, admitted, triggerClassName, onRename, onDelete, onShowLess, onNavigate, children }: Props) {
  const t = useT()
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [openIdentity, setOpenIdentity] = useState(identity)
  const [contextOpen, setContextOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const live = useRef(false)
  useLayoutEffect(() => {
    live.current = admitted
    return () => {
      live.current = false
    }
  }, [admitted, identity])
  useEffect(() => {
    const close = () => {
      setDropdownOpen(false)
      setContextOpen(false)
    }
    window.addEventListener("kokoro:surface-navigation", close)
    window.addEventListener("popstate", close)
    return () => {
      window.removeEventListener("kokoro:surface-navigation", close)
      window.removeEventListener("popstate", close)
    }
  }, [])
  const invoke = (action: () => void) => {
    if (live.current) action()
  }
  const items = (kind: "context" | "dropdown") => {
    const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem
    return (
      <>
        {onRename ? (
          <Item
            onSelect={() =>
              invoke(() => {
                onRename(project.id, trigger.current)
                onNavigate()
              })
            }
          >
            <SquarePen aria-hidden="true" />
            {t("firstSite.editProject")}
          </Item>
        ) : null}
        <Item asChild>
          <Link
            href={project.href}
            onClickCapture={(event) => {
              if (!live.current) {
                event.preventDefault()
                return
              }
              interceptMountedSurfaceNavigation(event, project.href)
            }}
            onClick={() => invoke(onNavigate)}
          >
            <FolderOpen aria-hidden="true" />
            {t("firstSite.viewProject")}
          </Link>
        </Item>
        <Item onSelect={() => invoke(onShowLess)}>
          <ChevronsUp aria-hidden="true" />
          {t("firstSite.projectShowLess")}
        </Item>
        {onDelete ? (
          <Item
            className={styles.destructive}
            onSelect={() =>
              invoke(() => {
                onDelete(project.id, trigger.current)
                onNavigate()
              })
            }
          >
            <Trash2 aria-hidden="true" />
            {t("firstSite.projectMenuDelete")}
          </Item>
        ) : null}
      </>
    )
  }
  const ellipsis = (
    <DropdownMenu
      open={dropdownOpen && admitted && openIdentity === identity}
      onOpenChange={(open) => {
        setOpenIdentity(identity)
        setDropdownOpen(open)
        if (open) setContextOpen(false)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          size="icon-xs"
          className={triggerClassName}
          disabled={!admitted}
          aria-label={t("firstSite.projectOptions")}
        >
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className={styles.menu} aria-label={t("firstSite.projectOptions")}>
        {items("dropdown")}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <ContextMenu
      open={contextOpen && admitted && openIdentity === identity}
      onOpenChange={(open) => {
        setOpenIdentity(identity)
        setContextOpen(open)
        if (open) setDropdownOpen(false)
      }}
    >
      <ContextMenuTrigger asChild disabled={!admitted}>
        {children(ellipsis)}
      </ContextMenuTrigger>
      <ContextMenuContent className={styles.menu} aria-label={t("firstSite.projectOptions")}>
        {items("context")}
      </ContextMenuContent>
    </ContextMenu>
  )
}
