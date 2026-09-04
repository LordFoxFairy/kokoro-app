"use client"

import { type RefObject } from "react"
import { Pencil, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
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
  onRequestDelete: (conversation: ConversationSummary) => void
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
}: WorkspaceRailSessionItemProps) {
  const t = useT()

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
          {/* 双击标题或使用悬停编辑按钮进入内联改题。 */}
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
          <SidebarMenuAction
            showOnHover
            className={itemStyles.itemRename}
            type="button"
            aria-label={t("rail.renameChat", { title })}
            onClick={() => onStartRename(conversation.id, conversation.title)}
          >
            <Pencil aria-hidden="true" />
          </SidebarMenuAction>
          <SidebarMenuAction
            showOnHover
            className={cn(itemStyles.itemDelete, itemStyles.itemDeleteAction)}
            type="button"
            aria-label={t("rail.deleteChat", { title })}
            onClick={() => onRequestDelete(conversation)}
          >
            <X aria-hidden="true" />
          </SidebarMenuAction>
        </>
      )}
    </SidebarMenuItem>
  )
}
