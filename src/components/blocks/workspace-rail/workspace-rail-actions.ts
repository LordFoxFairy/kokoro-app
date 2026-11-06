import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useMemo,
  useState,
} from "react"

import type { ConversationSummary } from "@/ui/rail/rail-search"

import type { WorkspaceRailProject } from "./workspace-rail-types"

export type RailDragKind = "project" | "conversation"

export type RailDragState = { id: string; originOrder: string[] } & (
  | { kind: "conversation" }
  | { kind: "project"; scope: object; input: "pointer" | "keyboard"; draft: string[] }
)

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

export function reconcileOrder(current: readonly string[], incoming: readonly string[]): string[] {
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
  projectScopeKey?: string | null
  savedProjectOrder?: readonly string[] | null
  pinnedProjectIds?: ReadonlySet<string>
  onReorderProjects?: (projectIds: string[]) => void
  onReorderConversations?: (conversationIds: string[]) => void
}

/** Owns local ordering state and pointer/keyboard reorder gestures. */
export function useWorkspaceRailActions({
  projectItems,
  conversations,
  conversationScopeKey,
  projectScopeKey = "standalone",
  savedProjectOrder,
  pinnedProjectIds,
  onReorderProjects,
  onReorderConversations,
}: WorkspaceRailActionsProps) {
  const projectIds = useMemo(() => projectItems.map((project) => project.id), [projectItems])
  const conversationIds = useMemo(() => conversations.map((conversation) => conversation.id), [conversations])
  const [localProjectOrder, setLocalProjectOrder] = useState<string[]>([])
  const [conversationOrderState, setConversationOrderState] = useState<RailOrderState>({ scopeKey: "", ids: [] })
  const [gesture, setDragState] = useState<RailDragState | null>(null)
  const [gestureOver, setDragOverKey] = useState<string | null>(null)

  const baseProjectOrder = reconcileOrder(savedProjectOrder === undefined ? localProjectOrder : savedProjectOrder ?? [], projectIds)
  const ordinaryProjectOrder = baseProjectOrder.filter((id) => !pinnedProjectIds?.has(id))
  // A gesture belongs to one admitted epoch. Losing admission/list readiness
  // also discards a draft if the same account becomes ready again.
  const projectScope = useMemo(() => projectScopeKey === null ? null : {}, [projectScopeKey])
  const dragState = gesture?.kind === "project" && (
    gesture.scope !== projectScope || !sameOrder(gesture.originOrder, ordinaryProjectOrder)
  ) ? null : gesture
  const dragOverKey = dragState === null ? null : gestureOver
  const canDragProject = (id: string) => projectScope !== null && ordinaryProjectOrder.includes(id)
  const placeOrdinaryProjects = (order: readonly string[]) => {
    let index = 0
    return baseProjectOrder.map((id) => pinnedProjectIds?.has(id) ? id : order[index++] ?? id)
  }
  const projectOrder = dragState?.kind === "project" ? placeOrdinaryProjects(dragState.draft) : baseProjectOrder
  const conversationOrder = conversationOrderState.scopeKey === conversationScopeKey
    ? reconcileOrder(conversationOrderState.ids, conversationIds)
    : conversationIds
  const orderedProjects = orderByIds(projectItems, projectOrder)
  const orderedConversations = orderByIds(conversations, conversationOrder)

  const commitProjectOrder = (next: string[]) => {
    if (sameOrder(next, ordinaryProjectOrder)) return
    const all = placeOrdinaryProjects(next)
    if (savedProjectOrder === undefined) setLocalProjectOrder(all)
    onReorderProjects?.(all)
  }
  const commitConversationOrder = (next: string[]) => {
    setConversationOrderState({ scopeKey: conversationScopeKey, ids: next })
    onReorderConversations?.(next)
  }
  const finishDrag = () => {
    setDragState(null)
    setDragOverKey(null)
  }
  const beginDrag = (kind: RailDragKind, id: string, input: "pointer" | "keyboard") => {
    if (kind === "project") {
      if (projectScope === null || !canDragProject(id)) return
      setDragState({ kind, id, scope: projectScope, input, originOrder: ordinaryProjectOrder, draft: ordinaryProjectOrder })
    } else {
      setDragState({ kind, id, originOrder: [...conversationOrder] })
    }
  }
  const move = (order: readonly string[], source: string, target: number): string[] | null => {
    const index = order.indexOf(source)
    if (index < 0 || target < 0 || target >= order.length || index === target) return null
    const next = [...order]
    next.splice(index, 1)
    next.splice(target, 0, source)
    return next
  }

  const dragProps = (kind: RailDragKind, id: string): RailDragProps => ({
    draggable: true,
    "aria-grabbed": dragState?.kind === kind && dragState.id === id ? "true" : "false",
    "aria-roledescription": "可拖动项目",
    "aria-describedby": DRAG_HELP_ID,
    "aria-keyshortcuts": "Space ArrowUp ArrowDown Escape",
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (kind === "project" && !canDragProject(id)) return
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", `${kind}:${id}`)
      }
      beginDrag(kind, id, "pointer")
      setDragOverKey(`${kind}:${id}`)
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (dragState?.kind !== kind || dragState.id === id ||
        (dragState.kind === "project" && (dragState.input !== "pointer" || !canDragProject(id)))) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
      setDragOverKey(`${kind}:${id}`)
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      if (dragState?.kind === kind) {
        if (dragState.kind === "project") {
          if (dragState.input === "pointer" && canDragProject(id)) {
            const next = move(ordinaryProjectOrder, dragState.id, ordinaryProjectOrder.indexOf(id))
            if (next) commitProjectOrder(next)
          }
        } else {
          const next = move(conversationOrder, dragState.id, conversationOrder.indexOf(id))
          if (next) commitConversationOrder(next)
        }
      }
      finishDrag()
    },
    onDragEnd: finishDrag,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (kind === "project" && !canDragProject(id)) return
      const active = dragState?.kind === kind && dragState.id === id ? dragState : null
      if (event.key === "Escape" && active) {
        event.preventDefault()
        if (active.kind === "conversation") {
          setConversationOrderState({ scopeKey: conversationScopeKey, ids: active.originOrder })
          if (!sameOrder(conversationOrder, active.originOrder)) onReorderConversations?.(active.originOrder)
        }
        finishDrag()
        return
      }
      // Space is the explicit grab/drop gesture. Enter keeps normal activation.
      if (event.key === " ") {
        event.preventDefault()
        if (active) {
          if (active.kind === "project" && active.input === "keyboard") commitProjectOrder(active.draft)
          finishDrag()
        } else {
          beginDrag(kind, id, "keyboard")
        }
        return
      }
      if (!active || (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
        (active.kind === "project" && active.input !== "keyboard")) return
      event.preventDefault()
      const order = active.kind === "project" ? active.draft : conversationOrder
      const next = move(order, id, order.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1))
      if (!next) return
      if (active.kind === "project") setDragState({ ...active, draft: next })
      else commitConversationOrder(next)
      setDragOverKey(`${kind}:${id}`)
    },
  })

  return {
    orderedProjects,
    orderedConversations,
    canDragProject,
    dragProps,
    dragState,
    dragOverKey,
  }
}
