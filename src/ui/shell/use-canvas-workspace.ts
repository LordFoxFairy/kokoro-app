"use client"

// canvas 工作区 controller：事件总线 store 按会话键各存一槽（内容+开合+全屏），切会话即读回各自的槽——
// 产物天然按会话隔离，无需 effect 清理；「closed」只由用户手动关闭记账。thread/file/delivery/tool
// 打开入口在此收口为 activeId-bound 回调，shell 只接线不持逻辑。

import { useCallback, useSyncExternalStore } from "react"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { SessionDelivery } from "@/core/state"
import type { AnswerActionBoundary } from "@/ui/thread/answer-action-scope"
import { useRunWorkspaceFiles } from "@/ui/thread/use-run-display"
import {
  canvasSlot,
  closeCanvas,
  openCanvas,
  readCanvasState,
  reopenCanvas,
  resolveCanvasContent,
  serverCanvasState,
  subscribeCanvas,
  toggleCanvasFullscreen,
  type WorkspaceOutputFile,
} from "@/ui/canvas/canvas-store"

type Thread = Parameters<typeof resolveCanvasContent>[1]
type ResolvedCanvas = ReturnType<typeof resolveCanvasContent>

export type CanvasWorkspace = {
  resolvedCanvas: ResolvedCanvas | null
  canvasOpen: boolean
  canReopenCanvas: boolean
  fullscreen: boolean
  isCurrentOpening: () => boolean
  openActivity: (runId: string, activityId: string, subject: string) => void
  openFile: (file: WorkspaceOutputFile) => void
  files: readonly WorkspaceOutputFile[]
  openDelivery: (delivery: SessionDelivery) => void
  onSelectDelivery: (delivery: SessionDelivery) => void
  onToggleFullscreen: () => void
  onClose: () => void
  onReopen: () => void
}

export function useCanvasWorkspace(activeId: string | null, thread: Thread, mounted: boolean, boundary?: ProjectReadBoundary, answerBoundary?: AnswerActionBoundary): CanvasWorkspace {
  const canvasState = useSyncExternalStore(subscribeCanvas, readCanvasState, serverCanvasState)
  const slot = canvasSlot(canvasState, activeId)
  const opening = slot.content
  const files = useRunWorkspaceFiles(answerBoundary, thread)
  const readEpoch = answerBoundary?.readEpoch
  const fileAdmitted = slot.content?.kind !== "file" || (readEpoch === slot.content.epoch && Boolean(answerBoundary?.isCurrent()))
  const activityAdmitted = slot.content?.kind !== "activity" || Boolean(boundary?.admitted && boundary.subject === slot.content.subject && boundary.generation === slot.content.generation)
  const resolvedCanvas =
    mounted && activityAdmitted && fileAdmitted && activeId !== null && slot.open && slot.content !== null
      ? resolveCanvasContent(slot.content, thread, files)
      : null
  const canvasOpen = resolvedCanvas !== null && activeId !== null
  const canReopenCanvas = mounted && activityAdmitted && fileAdmitted && activeId !== null && !slot.open && slot.content !== null &&
    (opening?.kind !== "file" || files.some(file => file.runId === opening.runId && file.versionId === opening.versionId))
  // A delayed close must see the current store intent even before React has
  // committed the newer selection. Metadata refreshes don't replace it.
  const isCurrentOpening = useCallback(
    () => activeId !== null && canvasSlot(readCanvasState(), activeId).content === opening,
    [activeId, opening],
  )

  const openActivity = useCallback((runId: string, activityId: string, subject: string) => {
    if (activeId !== null && boundary?.admitted && boundary.subject === subject) openCanvas(activeId, { kind: "activity", runId, activityId, subject, generation: boundary.generation })
  }, [activeId, boundary])
  const openFile = useCallback((file: WorkspaceOutputFile) => {
    if (activeId !== null && readEpoch && answerBoundary?.readEpoch === readEpoch && answerBoundary.isCurrent())
      openCanvas(activeId, { kind: "file", runId: file.runId, versionId: file.versionId, epoch: readEpoch })
  }, [activeId, answerBoundary, readEpoch])
  const openDelivery = useCallback(
    (delivery: SessionDelivery) => {
      if (activeId !== null) {
        openCanvas(activeId, { kind: "delivery", conversationId: delivery.conversationId, artifactId: delivery.artifactId })
      }
    },
    [activeId],
  )
  const onSelectDelivery = useCallback(
    (delivery: SessionDelivery) => {
      if (activeId !== null) {
        openCanvas(activeId, { kind: "delivery", conversationId: delivery.conversationId, artifactId: delivery.artifactId })
      }
    },
    [activeId],
  )
  const onToggleFullscreen = useCallback(() => {
    if (activeId !== null) {
      toggleCanvasFullscreen(activeId)
    }
  }, [activeId])
  const onClose = useCallback(() => {
    if (activeId !== null) {
      closeCanvas(activeId)
    }
  }, [activeId])
  const onReopen = useCallback(() => {
    if (activeId !== null) {
      reopenCanvas(activeId)
    }
  }, [activeId])

  return {
    resolvedCanvas,
    canvasOpen,
    canReopenCanvas,
    fullscreen: slot.fullscreen,
    isCurrentOpening,
    openActivity,
    openFile,
    openDelivery,
    files,
    onSelectDelivery,
    onToggleFullscreen,
    onClose,
    onReopen,
  }
}
