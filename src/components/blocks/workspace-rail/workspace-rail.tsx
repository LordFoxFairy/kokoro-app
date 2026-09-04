"use client"

import { type CSSProperties, useCallback, useRef, useState } from "react"

import { SidebarProvider } from "@/components/ui/sidebar"
import type { ConversationSummary } from "@/ui/rail/rail-search"
import { RAIL_COLLAPSED_WIDTH } from "@/ui/rail/use-rail-resize"

import { WorkspaceDeleteDialog } from "./workspace-rail-delete-dialog"
import { WorkspaceRailShell } from "./workspace-rail-shell"
import type { WorkspaceRailProps } from "./workspace-rail-types"
import { railStyles } from "./workspace-rail-styles"

export type { WorkspaceRailProject, WorkspaceRailProps } from "./workspace-rail-types"

/** Public rail boundary: provider ownership and destructive-dialog lifecycle. */
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
    <WorkspaceRailShell
      {...props}
      deleteDialogFallbackFocusRef={deleteDialogFallbackFocusRef}
      onRequestDelete={requestDelete}
    />
  )
  const dialog = (
    <WorkspaceDeleteDialog
      target={deleteTarget}
      onClose={() => setDeleteTarget(null)}
      onConfirm={confirmDelete}
      returnFocusRef={deleteDialogFocusRef}
      fallbackFocusRef={deleteDialogFallbackFocusRef}
    />
  )

  if (props.withinProvider) return <>{content}{dialog}</>

  return (
    <SidebarProvider
      className={railStyles.provider}
      forceDesktop
      // Standalone embeds inherit the live width contract of the full shell.
      style={{
        "--sidebar-width": "var(--rail-width, 20rem)",
        "--sidebar-width-icon": `${RAIL_COLLAPSED_WIDTH}px`,
      } as CSSProperties}
      open={!props.collapsed}
      onOpenChange={() => props.onToggleCollapse()}
    >
      {content}
      {dialog}
    </SidebarProvider>
  )
}
