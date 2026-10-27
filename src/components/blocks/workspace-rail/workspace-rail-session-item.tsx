"use client"

import { type RefObject, useRef, useState } from "react"
import { Archive, Ellipsis, FolderInput, Pencil, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { ConversationMoveIntent } from "@/engine/engine-types"
import { archiveIdAvailable } from "@/lib/archived-tasks.schema"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"
import type { ConversationSummary } from "@/ui/rail/rail-search"

import type { RailDragProps } from "./workspace-rail-actions"
import { itemStyles } from "./workspace-rail-styles"

export type WorkspaceRailSessionItemProps = {
  conversation: ConversationSummary
  title: string
  active: boolean
  awaiting: boolean
  editing: boolean
  dragging: boolean
  dragOver: boolean
  dragProps: RailDragProps
  renameInputRef: RefObject<HTMLInputElement | null>
  draftTitle: string
  onDraftTitleChange: (title: string) => void
  onCommitRename: (current: string, restoreFocus?: boolean) => void
  onCancelRename: (restoreFocus?: boolean) => void
  onSelect: (id: string) => void
  onStartRename: (id: string, current: string) => void
  onArchiveConversation?: (id:string)=>void
  archiveBusy?: boolean
  onRequestDelete: (conversation: ConversationSummary) => void
  moveDestinations: readonly Readonly<{ id: string | null; name: string }>[]
  conversationMove: ConversationMoveIntent | null
  conversationMovePending: boolean
  onMoveConversation?: (sessionId: string, targetProjectId: string | null) => void
  onRetryConversationMove?: () => void
}

/** A single conversation/task row, including rename and destructive actions. */
export function WorkspaceRailSessionItem({
  conversation,
  title,
  active,
  awaiting,
  editing,
  dragging,
  dragOver,
  dragProps,
  renameInputRef,
  draftTitle,
  onDraftTitleChange,
  onCommitRename,
  onCancelRename,
  onSelect,
  onStartRename,
  onRequestDelete,
  onArchiveConversation,
  archiveBusy,
  moveDestinations,
  conversationMove,
  conversationMovePending,
  onMoveConversation,
  onRetryConversationMove,
}: WorkspaceRailSessionItemProps) {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const afterMenuCloseRef = useRef<(() => void) | null>(null)

  if (conversation.submissionUnconfirmed) {
    // This is an exact local recovery destination, not an owner-backed task row.
    // Do not expose rename/archive/move/delete or drag handlers before confirmation.
    return <SidebarMenuItem data-active={active ? "true" : "false"}>
      <SidebarMenuButton isActive={active} className={itemStyles.unconfirmedSelect} type="button"
        data-conversation-id={conversation.id} onClick={() => onSelect(conversation.id)} aria-pressed={active}>
        <span className={itemStyles.itemTitle}>{title}</span>
        <span className={itemStyles.unconfirmedLabel}>{t("thread.submissionUnconfirmed")}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  }

  return (
    <SidebarMenuItem
      className={cn(itemStyles.item, dragging && itemStyles.itemDragging, dragOver && itemStyles.itemDragOver)}
      data-active={active ? "true" : "false"}
      data-editing={editing ? "true" : "false"}
      data-drag-kind="conversation"
      data-dragging={dragging ? "true" : "false"}
      data-drag-over={dragOver ? "true" : "false"}
    >
      {editing ? (
        <Input
          ref={renameInputRef}
          className={itemStyles.itemRenameInput}
          value={draftTitle}
          maxLength={256}
          aria-label={t("rail.renamePlaceholder")}
          placeholder={t("rail.renamePlaceholder")}
          onChange={(event) => onDraftTitleChange(event.target.value)}
          onBlur={() => onCommitRename(conversation.title)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onCommitRename(conversation.title, true)
            } else if (event.key === "Escape") {
              event.preventDefault()
              onCancelRename(true)
            }
          }}
        />
      ) : (
        <>
          {/* 双击标题或使用行菜单进入内联改题。 */}
          <SidebarMenuButton
            isActive={active}
            className={itemStyles.itemSelect}
            type="button"
            data-conversation-id={conversation.id}
            {...dragProps}
            onClick={() => onSelect(conversation.id)}
            onDoubleClick={() => onStartRename(conversation.id, conversation.title)}
            aria-pressed={active}
          >
            {/* 待批徽标（HITL-NOTIFY）：琥珀点提示该会话有待你决定的审批，跨会话可见。 */}
            {awaiting ? (
              <span
                className={itemStyles.itemAwaiting}
                aria-label={t("hitl.awaitingApproval")}
              />
            ) : null}
            <span className={itemStyles.itemTitle}>{title}</span>
          </SidebarMenuButton>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction
                ref={menuTriggerRef}
                className={itemStyles.itemOptions}
                type="button"
                aria-label={`${t("rail.more")} · ${title}`}
              >
                <Ellipsis aria-hidden="true" />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={itemStyles.itemMenu} align="end" onCloseAutoFocus={(event) => {
              const afterClose = afterMenuCloseRef.current
              if (!afterClose) return
              afterMenuCloseRef.current = null
              // Rename replaces the trigger; delete opens an independent dialog.
              // Let that next owner receive focus instead of Radix restoring it.
              event.preventDefault()
              menuTriggerRef.current?.focus()
              afterClose()
            }}>
              <DropdownMenuItem aria-label={t("rail.renameChat", { title })} onSelect={() => {
                afterMenuCloseRef.current = () => onStartRename(conversation.id, conversation.title)
              }}>
                <Pencil aria-hidden="true" /><span className={itemStyles.itemMenuText}>{t("rail.actionRename")}</span>
              </DropdownMenuItem>
              {onMoveConversation ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger aria-label={t("rail.moveChat", { title })} disabled={conversationMovePending}>
                    <FolderInput aria-hidden="true" /><span className={itemStyles.itemMenuText}>{t("rail.actionMove")}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className={cn(itemStyles.itemMenu, itemStyles.itemMoveMenu)}>
                    {moveDestinations.map((destination) => (
                      <DropdownMenuItem key={destination.id ?? "direct"}
                        onSelect={() => onMoveConversation(conversation.id, destination.id)}>
                        <span className={itemStyles.itemMenuText}>{destination.name}</span>
                      </DropdownMenuItem>
                    ))}
                    {conversationMove?.status === "unknown" && onRetryConversationMove ? (
                      <DropdownMenuItem onSelect={onRetryConversationMove}><span className={itemStyles.itemMenuText}>{t("rail.retryMoveChat")}</span></DropdownMenuItem>
                    ) : null}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              {onArchiveConversation ? <>
                <DropdownMenuItem aria-label={`${t("archive.action")} · ${title}`} disabled={archiveBusy || !archiveIdAvailable(conversation.id)}
                  onSelect={() => onArchiveConversation(conversation.id)}>
                  <Archive aria-hidden="true" /><span className={itemStyles.itemMenuText}>{t("rail.actionArchive")}</span>
                </DropdownMenuItem>
                {!archiveIdAvailable(conversation.id) ? <p>{t("archive.idUnavailable")}</p> : null}
              </> : null}
              <DropdownMenuItem aria-label={t("rail.deleteChat", { title })} variant="destructive" onSelect={() => {
                afterMenuCloseRef.current = () => onRequestDelete(conversation)
              }}>
                <X aria-hidden="true" /><span className={itemStyles.itemMenuText}>{t("rail.actionDelete")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </SidebarMenuItem>
  )
}
