"use client"

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
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

import { useWorkspaceRailActions, type RailDragKind, type RailDragProps, type RailDragState } from "./workspace-rail-actions"
import { itemStyles } from "./workspace-rail-styles"
import { WorkspaceRailLoadingPlaceholder } from "./workspace-rail-loading-placeholder"
import { WorkspaceRailSessionItem } from "./workspace-rail-session-item"
import type { ConversationMoveIntent } from "@/engine/engine-types"
import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import { useConversationList } from "@/ui/shell/use-conversation-list"
import type { RailConversationReads, WorkspaceRailProps } from "./workspace-rail-types"

export type WorkspaceRailSessionListProps = {
  projectActive: boolean
  groupLabel?: string
  /** The shell may own a section disclosure (for the top-level task list).
   * Nested project lists retain their own compact action row. */
  hideSectionHeader?: boolean
  blocked?: boolean
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
  onNewChat: () => void
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
  moveDestinations: readonly Readonly<{ id: string | null; name: string }>[]
  conversationMove: ConversationMoveIntent | null
  conversationMovePending: boolean
  conversationMoveFailed: boolean
  onMoveConversation?: (sessionId: string, targetProjectId: string | null) => void
  onRetryConversationMove?: () => void
}

/** Owns the route-scoped conversation list and its local presentation state. */
export function WorkspaceRailSessionList({
  projectActive,
  groupLabel,
  hideSectionHeader = false,
  blocked = false,
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
  onNewChat,
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
  moveDestinations,
  conversationMove,
  conversationMovePending,
  conversationMoveFailed,
  onMoveConversation,
  onRetryConversationMove,
}: WorkspaceRailSessionListProps) {
  const t = useT()
  const [conversationOrder, setConversationOrder] = useState<"recent" | "name">("recent")
  const filtered = filterConversations(conversations, query)
  const ordered = conversationOrder === "name"
    ? [...filtered].sort((left, right) => left.title.localeCompare(right.title))
    : filtered

  return (
    <nav
      className={cn(itemStyles.list, !projectActive && !hasConversations && !listLoading && !listError && itemStyles.emptyDirectList)}
      aria-label={groupLabel ?? (projectActive ? t("firstSite.projectConversations") : t("rail.directChatsAria"))}
      data-conversation-list={projectActive ? "project-conversation" : "direct"}
    >
      {!compactDesktop ? (
        <>
          {!hideSectionHeader ? <div className={itemStyles.sectionRow}>
            {/* `conversations` is already scope-filtered by the host. */}
            <p className={itemStyles.section}>{groupLabel ?? (projectActive ? t("firstSite.projectConversations") : t("rail.directChats"))}</p>
            {projectActive ? (
              <div className={itemStyles.sectionActions}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={itemStyles.sectionAction}
                  aria-label={t("rail.newChat")}
                  data-testid="rail-new-project-conversation"
                  type="button"
                  disabled={blocked}
                  onClick={() => { onNewChat(); closeNavigation() }}
                >
                  <Plus aria-hidden="true" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" className={itemStyles.sectionAction} aria-label={t("rail.conversationSort")}>
                      <ListFilter aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4}>
                    <DropdownMenuLabel>{t("rail.conversationSort")}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={conversationOrder}
                      onValueChange={(value) => {
                        if (value === "recent" || value === "name") setConversationOrder(value)
                      }}
                    >
                      <DropdownMenuRadioItem value="recent">{t("rail.sortRecent")}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="name">{t("rail.sortName")}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div> : null}
          {conversationMoveFailed ? (
            <div className={itemStyles.listNotice} role="alert">{t("rail.moveFailed")}</div>
          ) : null}
          {blocked ? (
            <p className={itemStyles.empty} role="status">{t("firstSite.unavailable")}</p>
          ) : listError && !hasConversations ? (
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
            <WorkspaceRailLoadingPlaceholder
              label={t("rail.listLoading")}
              testId="conversations-loading"
            />
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
                      moveDestinations={moveDestinations}
                      conversationMove={conversationMove?.sessionId === conversation.id ? conversationMove : null}
                      conversationMovePending={conversationMovePending}
                      {...(onMoveConversation === undefined ? {} : { onMoveConversation })}
                      {...(onRetryConversationMove === undefined ? {} : { onRetryConversationMove })}
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
          ) : projectActive ? (
            <p className={itemStyles.empty} role="status">
              {t(query !== "" ? "rail.emptyResult" : "firstSite.noProjectConversations")}
            </p>
          ) : (
            <p className={itemStyles.empty}>{t(searchOpen ? "rail.emptyResult" : "rail.emptyChats")}</p>
          )}
        </>
      ) : null}
    </nav>
  )
}

type ConversationGroupProps = Omit<WorkspaceRailSessionListProps, "renameInputRef" | "editingId" | "draftTitle" | "onDraftTitleChange" | "onCommitRename" | "onCancelRename" | "onStartRename" | "dragProps" | "dragState" | "dragOverKey"> & {
  scopeKey: string
  onRenameConversation: (id: string, title: string) => void
  onReorderConversations?: (ids: string[]) => void
}

/** Each rendered list owns its edit/order state independently of selection. */
export function ConversationGroup({ scopeKey, onRenameConversation, onReorderConversations, ...props }: ConversationGroupProps) {
  const railRootRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameReturnIdRef = useRef<string | null>(null)
  const renameRestoreFocusRef = useRef(false)

  useEffect(() => {
    if (editingId !== null) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [editingId])

  const startRename = (id: string, current: string) => {
    renameReturnIdRef.current = id
    renameRestoreFocusRef.current = false
    setEditingId(id)
    setDraftTitle(current)
  }

  const focusRenamedConversation = () => {
    const id = renameReturnIdRef.current
    if (!id) return
    window.requestAnimationFrame(() => {
      const target = [...(railRootRef.current?.querySelectorAll<HTMLElement>('[data-conversation-id]') ?? [])]
        .find((element) => element.dataset.conversationId === id)
      target?.focus()
    })
  }

  const cancelRename = (restoreFocus = false) => {
    renameRestoreFocusRef.current = restoreFocus || renameRestoreFocusRef.current
    setEditingId(null)
    setDraftTitle("")
    if (renameRestoreFocusRef.current) focusRenamedConversation()
  }

  const commitRename = (current: string, restoreFocus = false) => {
    const value = draftTitle.trim()
    if (editingId !== null && value !== "" && value !== current) {
      onRenameConversation(editingId, value)
    }
    cancelRename(restoreFocus)
  }

  const { orderedConversations, dragProps, dragState, dragOverKey } = useWorkspaceRailActions({
    projectItems: [], conversations: props.conversations, conversationScopeKey: scopeKey,
    ...(onReorderConversations === undefined ? {} : { onReorderConversations }),
  })
  return <div ref={railRootRef}><WorkspaceRailSessionList {...props}
    conversations={orderedConversations}
    renameInputRef={renameInputRef} editingId={editingId} draftTitle={draftTitle}
    onDraftTitleChange={setDraftTitle} onCommitRename={commitRename} onCancelRename={cancelRename} onStartRename={startRename}
    dragProps={dragProps} dragState={dragState} dragOverKey={dragOverKey}
  /></div>
}

type ScopedGroupProps = Pick<WorkspaceRailSessionListProps,
  "compactDesktop" | "query" | "searchOpen" | "awaitingIds" | "closeNavigation" | "onNewChat" |
  "groupLabel" | "hideSectionHeader" | "conversationMove" | "conversationMovePending" | "conversationMoveFailed" | "onRetryConversationMove"
> & {
  scope: SessionScope
  reads: RailConversationReads
  preview: boolean
  projects: NonNullable<WorkspaceRailProps["projects"]>
  projectListReady: boolean
  onRequestDelete: (conversation: ConversationSummary, remove?: (id: string) => Promise<boolean>) => void
}

/** A folder reads only its canonical list; it never creates an engine or SSE. */
export function ScopedConversationGroup({ scope: desiredScope, reads, preview, projects, projectListReady, onRequestDelete, ...props }: ScopedGroupProps) {
  const key = sessionScopeKey(desiredScope)
  const ownedController = desiredScope.kind === "direct"
    ? reads.directController
    : key === sessionScopeKey(reads.scope) ? reads.currentController : null
  if (ownedController !== null) {
    return <ScopedConversationGroupView {...props} scope={desiredScope} reads={reads} projects={projects}
      projectListReady={projectListReady} onRequestDelete={onRequestDelete} controller={ownedController} />
  }
  return <IndependentScopedConversationGroup {...props} scope={desiredScope} reads={reads} preview={preview}
    projects={projects} projectListReady={projectListReady} onRequestDelete={onRequestDelete} />
}

function IndependentScopedConversationGroup({ scope: desiredScope, reads, preview, projects, projectListReady, onRequestDelete, ...props }: ScopedGroupProps) {
  const key = sessionScopeKey(desiredScope)
  const projectRef = desiredScope.kind === "project" ? desiredScope.projectRef : null
  const scope = useMemo<SessionScope>(() => projectRef === null ? DIRECT_SESSION_SCOPE : { kind: "project", projectRef }, [projectRef])
  const controller = useConversationList({
    engine: null, preview,
    activeId: null, thread: reads.thread,
    isStreaming: false, focusComposer: reads.focusComposer, scope,
    scopeRevision: reads.scopeVersions.get(key) ?? 0,
    readBoundary: { identity: reads.identity, admitted: reads.admitted },
    onDeleteConfirmed: reads.onDeleteConfirmed,
  })
  return <ScopedConversationGroupView {...props} scope={scope} reads={reads} projects={projects}
    projectListReady={projectListReady} onRequestDelete={onRequestDelete} controller={controller} />
}

function ScopedConversationGroupView({ scope, reads, projects, projectListReady, onRequestDelete, controller, ...props }:
  Omit<ScopedGroupProps, "preview"> & { controller: import("@/ui/shell/use-conversation-list").ConversationListController }) {
  const t = useT()
  const destinations = projectListReady ? [
    ...(scope.kind === "direct" ? [] : [{ id: null, name: t("rail.directChatsAria") }]),
    ...projects.filter((project) => scope.kind !== "project" || project.id !== scope.projectRef).map((project) => ({ id: project.id, name: project.name })),
  ] : []
  const key = sessionScopeKey(scope)
  const current = key === sessionScopeKey(reads.scope)
  return <ConversationGroup {...props} conversationMoveFailed={props.conversationMoveFailed && reads.failedMoveScopeKey === key} scopeKey={key} onNewChat={() => { if (reads.admitted) reads.onNewChat(scope) }} blocked={!reads.admitted} projectActive={scope.kind === "project"}
    conversations={controller.conversations} hasConversations={controller.conversations.length > 0}
    activeId={current ? reads.activeId : null}
    listLoading={controller.loading} listLoadingMore={controller.loadingMore} listError={controller.error}
    {...(reads.admitted ? { onRetryList: controller.refresh } : {})} hasMore={controller.hasMore} onLoadMore={controller.loadMore}
    onSelectConversation={(id) => { if (reads.admitted) reads.onSelect(scope, id) }}
    onRequestDelete={(conversation) => onRequestDelete(conversation, controller.deleteConversation)}
    onRenameConversation={controller.renameConversation}
    moveDestinations={destinations}
    onMoveConversation={(id, target) => { if (reads.admitted) reads.onMove(scope, id, target) }}
  />
}
