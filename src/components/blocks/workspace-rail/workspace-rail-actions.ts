import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useMemo,
  useState,
} from "react"

import type { ConversationSummary } from "@/ui/rail/rail-search"

import type { WorkspaceRailProject } from "./workspace-rail-types"

export type RailDragKind = "project" | "conversation"

export type RailDragState = {
  kind: RailDragKind
  id: string
  originOrder: string[]
}

export type RailDragProps = {
  draggable: true
  "aria-grabbed": "true" | "false"
  "aria-roledescription": string
  "aria-describedby": string
  "aria-keyshortcuts": string
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

type RailOrderState = {
  scopeKey: string
  ids: string[]
}

export const DRAG_HELP_ID = "workspace-rail-drag-help"

export function markPointerFocus(event: PointerEvent<HTMLElement>): void {
  // Chromium can keep :focus-visible after a pointer navigation in a compact
  // rail. Preserve keyboard focus semantics, but mark pointer focus so the
  // rail can suppress that distracting outline while the route settles.
  const pointerType = event.pointerType as string
  if (pointerType !== "mouse" && pointerType !== "pen" && pointerType !== "") return
  const target = event.currentTarget
  target.dataset.pointerFocus = "true"
  target.addEventListener("blur", () => delete target.dataset.pointerFocus, { once: true })
}

export function reconcileOrder(current: string[], incoming: readonly string[]): string[] {
  const incomingSet = new Set(incoming)
  const kept = current.filter((id) => incomingSet.has(id))
  const keptSet = new Set(kept)
  return [...kept, ...incoming.filter((id) => !keptSet.has(id))]
}

export function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function orderByIds<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
  if (order.length === 0) return [...items]
  const byId = new Map(items.map((item) => [item.id, item]))
  const ordered = order.flatMap((id) => {
    const item = byId.get(id)
    return item ? [item] : []
  })
  const known = new Set(order)
  return [...ordered, ...items.filter((item) => !known.has(item.id))]
}

export type WorkspaceRailActionsProps = {
  projectItems: readonly WorkspaceRailProject[]
  conversations: readonly ConversationSummary[]
  conversationScopeKey: string
  projectActive: boolean
  onReorderProjects?: (projectIds: string[]) => void
  onReorderConversations?: (conversationIds: string[]) => void
  onReorderTasks?: (conversationIds: string[]) => void
}

/** Owns local ordering state and pointer/keyboard reorder gestures. */
export function useWorkspaceRailActions({
  projectItems,
  conversations,
  conversationScopeKey,
  projectActive,
  onReorderProjects,
  onReorderConversations,
  onReorderTasks,
}: WorkspaceRailActionsProps) {
  const projectIds = useMemo(() => projectItems.map((project) => project.id), [projectItems])
  const conversationIds = useMemo(() => conversations.map((conversation) => conversation.id), [conversations])
  const [projectOrderState, setProjectOrderState] = useState<RailOrderState>({ scopeKey: "", ids: [] })
  const [conversationOrderState, setConversationOrderState] = useState<RailOrderState>({ scopeKey: "", ids: [] })
  const [dragState, setDragState] = useState<RailDragState | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const projectOrder = projectOrderState.scopeKey === "projects"
    ? reconcileOrder(projectOrderState.ids, projectIds)
    : projectIds
  const conversationOrder = conversationOrderState.scopeKey === conversationScopeKey
    ? reconcileOrder(conversationOrderState.ids, conversationIds)
    : conversationIds
  const orderedProjects = orderByIds(projectItems, projectOrder)
  const orderedConversations = orderByIds(conversations, conversationOrder)

  const orderFor = useCallback((kind: RailDragKind): string[] => {
    if (kind === "project") return [...projectOrder]
    return [...conversationOrder]
  }, [conversationOrder, projectOrder])

  const notifyConversationOrder = useCallback((next: string[]) => {
    const onReorder = projectActive
      ? onReorderTasks ?? onReorderConversations
      : onReorderConversations ?? onReorderTasks
    onReorder?.(next)
  }, [onReorderConversations, onReorderTasks, projectActive])

  const commitOrder = useCallback((kind: RailDragKind, next: string[]) => {
    if (kind === "project") {
      setProjectOrderState({ scopeKey: "projects", ids: next })
      onReorderProjects?.(next)
      return
    }
    setConversationOrderState({ scopeKey: conversationScopeKey, ids: next })
    notifyConversationOrder(next)
  }, [conversationScopeKey, notifyConversationOrder, onReorderProjects])

  const moveItem = useCallback((kind: RailDragKind, sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const current = orderFor(kind)
    const sourceIndex = current.indexOf(sourceId)
    const targetIndex = current.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const next = [...current]
    next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, sourceId)
    commitOrder(kind, next)
  }, [commitOrder, orderFor])

  const beginKeyboardDrag = useCallback((kind: RailDragKind, id: string) => {
    setDragState({ kind, id, originOrder: orderFor(kind) })
  }, [orderFor])

  const cancelDrag = useCallback(() => {
    if (dragState) {
      if (dragState.kind === "project") {
        setProjectOrderState({ scopeKey: "projects", ids: dragState.originOrder })
      } else {
        setConversationOrderState({ scopeKey: conversationScopeKey, ids: dragState.originOrder })
      }
      if (!sameOrder(orderFor(dragState.kind), dragState.originOrder)) {
        if (dragState.kind === "project") onReorderProjects?.(dragState.originOrder)
        else notifyConversationOrder(dragState.originOrder)
      }
    }
    setDragState(null)
    setDragOverKey(null)
  }, [conversationScopeKey, dragState, notifyConversationOrder, onReorderProjects, orderFor])

  const dragProps = useCallback((kind: RailDragKind, id: string): RailDragProps => ({
    draggable: true as const,
    "aria-grabbed": dragState?.kind === kind && dragState.id === id ? "true" as const : "false" as const,
    "aria-roledescription": "可拖动项目",
    "aria-describedby": DRAG_HELP_ID,
    "aria-keyshortcuts": "Space ArrowUp ArrowDown Escape",
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", `${kind}:${id}`)
      }
      setDragState({ kind, id, originOrder: orderFor(kind) })
      setDragOverKey(`${kind}:${id}`)
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (dragState?.kind !== kind || dragState.id === id) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
      setDragOverKey(`${kind}:${id}`)
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      if (dragState?.kind === kind && dragState.id !== id) moveItem(kind, dragState.id, id)
      setDragState(null)
      setDragOverKey(null)
    },
    onDragEnd: () => {
      setDragState(null)
      setDragOverKey(null)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const isActive = dragState?.kind === kind && dragState.id === id
      if (event.key === "Escape" && isActive) {
        event.preventDefault()
        cancelDrag()
        return
      }
      // Space is the explicit grab/drop gesture. Enter remains the normal
      // activation key for project links and conversation buttons.
      if (event.key === " ") {
        event.preventDefault()
        if (isActive) {
          setDragState(null)
          setDragOverKey(null)
        } else {
          beginKeyboardDrag(kind, id)
        }
        return
      }
      if (!isActive || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
      event.preventDefault()
      const current = orderFor(kind)
      const index = current.indexOf(id)
      const nextIndex = event.key === "ArrowUp" ? index - 1 : index + 1
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return
      const next = [...current]
      const [item] = next.splice(index, 1)
      if (item === undefined) return
      next.splice(nextIndex, 0, item)
      commitOrder(kind, next)
      setDragOverKey(`${kind}:${id}`)
    },
  }), [beginKeyboardDrag, cancelDrag, commitOrder, dragState, moveItem, orderFor])

  return {
    orderedProjects,
    orderedConversations,
    dragProps,
    dragState,
    dragOverKey,
  }
}
