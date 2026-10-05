"use client"

import { type CSSProperties, useCallback, useLayoutEffect, useRef, useState } from "react"

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
  const [deleteIntent, setDeleteTarget] = useState<{ conversation: ConversationSummary; remove: (id: string) => Promise<boolean>; identity: string } | null>(null)
  const identity = props.conversationReads?.identity ?? "controlled"
  const admitted = props.conversationReads?.admitted ?? true
  const deleteTarget = admitted && deleteIntent?.identity === identity ? deleteIntent.conversation : null
  const activeIntentRef = useRef(deleteIntent)
  useLayoutEffect(() => {
    const current = admitted && deleteIntent?.identity === identity ? deleteIntent : null
    activeIntentRef.current = current
    return () => { if (activeIntentRef.current === current) activeIntentRef.current = null }
  }, [admitted, deleteIntent, identity])
  const [pendingIntent, setPendingIntent] = useState<typeof deleteIntent>(null)
  const deletePending = deleteTarget !== null && pendingIntent === deleteIntent
  const [deleteFailed, setDeleteFailed] = useState(false)
  const deleteDialogFallbackFocusRef = useRef<HTMLButtonElement | null>(null)
  const deleteDialogFocusRef = useRef<HTMLElement | null>(null)
  // Retire destructive intent rather than merely hiding its projection.
  if (!admitted || (deleteIntent !== null && deleteIntent.identity !== identity)) {
    if (deleteIntent !== null) setDeleteTarget(null)
    if (pendingIntent !== null) setPendingIntent(null)
    if (deleteFailed) setDeleteFailed(false)
  }
  useLayoutEffect(() => {
    if (!admitted) deleteDialogFocusRef.current = null
    return () => { deleteDialogFocusRef.current = null }
  }, [admitted, identity])
  const { onDeleteConversation } = props

  const requestDelete = (conversation: ConversationSummary, remove = onDeleteConversation) => {
    if (deletePending && activeIntentRef.current !== null) return
    const active = document.activeElement
    const activeElement = active instanceof HTMLElement && active !== document.body ? active : null
    deleteDialogFocusRef.current = activeElement
    setDeleteTarget({ conversation, remove, identity })
    setDeleteFailed(false)
  }

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deletePending) return
    const intent = activeIntentRef.current
    if (!intent) return
    const targetId = deleteTarget.id
    setPendingIntent(intent)
    setDeleteFailed(false)
    try {
      const result = await intent.remove(targetId)
      if (activeIntentRef.current !== intent) return
      if (result !== true) {
        setDeleteFailed(true)
        return
      }
      setDeleteTarget((current) => current === intent ? null : current)
    } catch {
      if (activeIntentRef.current === intent) setDeleteFailed(true)
    } finally {
      setPendingIntent((current) => current === intent ? null : current)
    }
  }, [deletePending, deleteTarget])

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
      onClose={() => {
        if (!deletePending) setDeleteTarget(null)
      }}
      onConfirm={confirmDelete}
      pending={deleteTarget !== null && deletePending}
      failed={deleteTarget !== null && deleteFailed}
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
