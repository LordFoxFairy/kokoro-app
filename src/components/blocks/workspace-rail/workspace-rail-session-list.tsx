"use client"

import { useState, type RefObject } from "react"
import { ListFilter, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"
import { filterConversations, type ConversationSummary } from "@/ui/rail/rail-search"

import { type RailDragKind, type RailDragProps, type RailDragState } from "./workspace-rail-actions"
import { itemStyles } from "./workspace-rail-styles"
import { WorkspaceRailSessionItem } from "./workspace-rail-session-item"

export type WorkspaceRailSessionListProps = {
  projectActive: boolean
  compactDesktop: boolean
  searchOpen: boolean
  query: string
  conversations: ConversationSummary[]
  hasConversations: boolean
  activeId: string | null
  awaitingIds: ReadonlySet<string>
  listLoading: boolean
  listLoadingMore?: boolean
  listError: boolean
  onRetryList?: () => void
  hasMore: boolean
  onLoadMore: () => void
  onCreateTask: () => void
  closeNavigation: () => void
  onSelectConversation: (id: string) => void
  onRequestDelete: (conversation: ConversationSummary) => void
  renameInputRef: RefObject<HTMLInputElement | null>
  editingId: string | null
  draftTitle: string
  onDraftTitleChange: (title: string) => void
  onCommitRename: (current: string, restoreFocus?: boolean) => void
  onCancelRename: (restoreFocus?: boolean) => void
  onStartRename: (id: string, current: string) => void
  dragProps: (kind: RailDragKind, id: string) => RailDragProps
  dragState: RailDragState | null
  dragOverKey: string | null
}

/** Owns the route-scoped conversation/task list and its local presentation state. */
export function WorkspaceRailSessionList({
  projectActive,
  compactDesktop,
  searchOpen,
  query,
  conversations,
  hasConversations,
  activeId,
  awaitingIds,
  listLoading,
  listLoadingMore = false,
  listError,
  onRetryList,
  hasMore,
  onLoadMore,
  onCreateTask,
  closeNavigation,
  onSelectConversation,
  onRequestDelete,
  renameInputRef,
  editingId,
  draftTitle,
  onDraftTitleChange,
  onCommitRename,
  onCancelRename,
  onStartRename,
  dragProps,
  dragState,
  dragOverKey,
}: WorkspaceRailSessionListProps) {
  const t = useT()
  const [taskOrder, setTaskOrder] = useState<"recent" | "name">("recent")
  const filtered = filterConversations(conversations, query)
  const ordered = taskOrder === "name"
    ? [...filtered].sort((left, right) => left.title.localeCompare(right.title))
    : filtered

  return (
    <nav
      className={cn(itemStyles.list, !projectActive && !hasConversations && itemStyles.emptyDirectList)}
      aria-label={projectActive ? t("firstSite.tasks") : t("rail.directChatsAria")}
      data-conversation-list={projectActive ? "project-conversation" : "direct"}
    >
      {!compactDesktop ? (
        <>
          <div className={itemStyles.sectionRow}>
            {/* `conversations` is already scope-filtered by the host. */}
            <p className={itemStyles.section}>{projectActive ? t("firstSite.tasks") : t("rail.directChats")}</p>
            {projectActive ? (
              <div className={itemStyles.sectionActions}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={itemStyles.sectionAction}
                  aria-label={t("firstSite.newTask")}
                  data-testid="rail-new-project-task"
                  type="button"
                  onClick={() => { onCreateTask(); closeNavigation() }}
                >
                  <Plus aria-hidden="true" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" className={itemStyles.sectionAction} aria-label={t("rail.taskSort")}>
                      <ListFilter aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4}>
                    <DropdownMenuLabel>{t("rail.taskSort")}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={taskOrder}
                      onValueChange={(value) => {
                        if (value === "recent" || value === "name") setTaskOrder(value)
                      }}
                    >
                      <DropdownMenuRadioItem value="recent">{t("rail.sortRecent")}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="name">{t("rail.sortName")}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
          {listError && !hasConversations ? (
            <div className={itemStyles.listNotice} role="alert">
              <p className={itemStyles.empty}>{t("rail.listError")}</p>
              {onRetryList ? (
                <Button variant="outline" size="sm" type="button" disabled={listLoading} aria-busy={listLoading} onClick={onRetryList}>
                  {listLoading ? <Spinner aria-hidden="true" /> : null}
                  {listLoading ? t("rail.listLoading") : t("rail.retryList")}
                </Button>
              ) : null}
            </div>
          ) : listLoading && !hasConversations ? (
            <p className={itemStyles.empty} role="status" aria-label={t("rail.listLoading")}>{t("rail.listLoading")}</p>
          ) : ordered.length > 0 ? (
            <>
              {listError && onRetryList ? (
                <div className={itemStyles.listNotice} role="alert">
                  <p className={itemStyles.empty}>{t("rail.listError")}</p>
                  <Button variant="outline" size="sm" type="button" disabled={listLoading} aria-busy={listLoading} onClick={onRetryList}>
                    {listLoading ? <Spinner aria-hidden="true" /> : null}
                    {listLoading ? t("rail.listLoading") : t("rail.retryList")}
                  </Button>
                </div>
              ) : null}
              <SidebarMenu>
                {ordered.map((conversation) => {
                  const title = conversation.title || t("rail.newChat")
                  const editing = conversation.id === editingId
                  const dragging = dragState?.kind === "conversation" && dragState.id === conversation.id
                  const dragOver = dragOverKey === `conversation:${conversation.id}`
                  return (
                    <WorkspaceRailSessionItem
                      key={conversation.id}
                      conversation={conversation}
                      title={title}
                      active={conversation.id === activeId}
                      awaiting={awaitingIds.has(conversation.id)}
                      editing={editing}
                      dragging={dragging}
                      dragOver={dragOver}
                      dragProps={dragProps("conversation", conversation.id)}
                      renameInputRef={renameInputRef}
                      draftTitle={draftTitle}
                      onDraftTitleChange={onDraftTitleChange}
                      onCommitRename={onCommitRename}
                      onCancelRename={onCancelRename}
                      onSelect={(id) => { onSelectConversation(id); closeNavigation() }}
                      onStartRename={onStartRename}
                      onRequestDelete={onRequestDelete}
                    />
                  )
                })}
              </SidebarMenu>
              {/* 搜索过滤只作用于已加载项，因此不显示翻页按钮。 */}
              {hasMore && query === "" ? (
                <Button
                  variant="outline"
                  className={itemStyles.loadMore}
                  type="button"
                  disabled={listLoadingMore}
                  aria-busy={listLoadingMore}
                  onClick={onLoadMore}
                >
                  {listLoadingMore ? <Spinner aria-hidden="true" /> : null}
                  {t("rail.loadMore")}
                </Button>
              ) : null}
            </>
          ) : projectActive ? null : (
            <p className={itemStyles.empty}>{t(searchOpen ? "rail.emptyResult" : "rail.emptyChats")}</p>
          )}
        </>
      ) : null}
    </nav>
  )
}
