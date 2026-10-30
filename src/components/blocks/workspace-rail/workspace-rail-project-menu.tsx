"use client"

import type { ProjectPinsModel } from "@/features/app/use-project-pins"
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import Link from "next/link"
import { ChevronsUp, Ellipsis, Eye, FolderPen, Pin, PinOff, Trash2 } from "lucide-react"
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
  onSetPin?: (id: string, value: boolean, opener: HTMLButtonElement | null) => void
  pins?: ProjectPinsModel
  onRename?: (target: string, opener: HTMLButtonElement | null) => void
  onDelete?: (target: string, opener: HTMLButtonElement | null) => void
  onShowLess: () => void
  onNavigate: () => void
  children: (trigger: ReactNode) => ReactElement
}

/** Two native menu surfaces share one exact target and one action definition. */
export function WorkspaceRailProjectMenu({ project, identity, admitted, triggerClassName, pins, onSetPin, onRename, onDelete, onShowLess, onNavigate, children }: Props) {
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
  const pinFact = pins && Object.hasOwn(pins.targets, project.id) ? pins.targets[project.id] : undefined
  const pinKnown = pinFact?.status === "known"
  const pinChecking = pinFact?.status === "reading" || pinFact?.status === "pending"
  const pinLabel = pinKnown ? pinFact.value.is_pinned ? "firstSite.unpinProject" : "firstSite.pinProject"
    : pinChecking || pinFact === undefined ? "firstSite.projectPinStatus" : "firstSite.checkProjectPin"
  const PinIcon = pinKnown && pinFact.value.is_pinned ? PinOff : Pin
  const selectPin = (event: Event) => {
    event.preventDefault()
    invoke(() => {
      if (!pins) return
      if (pinKnown) {
        if (onSetPin) onSetPin(project.id, !pinFact.value.is_pinned, trigger.current)
        else void pins.set(project.id, !pinFact.value.is_pinned)
      } else void pins.check(project.id)
    })
  }
  const items = (kind: "context" | "dropdown") => {
    const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem
    return (
      <>
        {pins?.available ? <Item disabled={pinChecking || pinFact === undefined || pinFact.status === "unavailable"} onSelect={selectPin}>
          <PinIcon aria-hidden="true" />{t(pinLabel)}
        </Item> : null}
        {onRename ? (
          <Item
            onSelect={() =>
              invoke(() => {
                onRename(project.id, trigger.current)
                onNavigate()
              })
            }
          >
            <FolderPen aria-hidden="true" />
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
              // Close the Sheet before navigation can synchronously unmount this portal.
              if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate()
              interceptMountedSurfaceNavigation(event, project.href)
            }}
          >
            <Eye aria-hidden="true" />
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
        if (open) { setContextOpen(false); pins?.ensure(project.id) }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          data-project-menu-trigger="true"
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
        if (open) { setDropdownOpen(false); pins?.ensure(project.id) }
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
