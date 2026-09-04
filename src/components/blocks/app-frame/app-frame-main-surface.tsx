import type { ComponentType, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import type { EngineSnapshot } from "@/engine/machine"
import type { CanvasWorkspace } from "@/ui/shell/use-canvas-workspace"
import type { SessionClient } from "@/engine/client"
import { ConversationThread, type ConversationThreadProps } from "@/ui/thread/conversation-thread"
import { TodoBar } from "@/ui/todo/todo-bar"
import { WorkspaceHeader } from "@/components/blocks/workspace-header/workspace-header"
import { useT } from "@/i18n/context"
import type { SettingsTab } from "@/ui/settings/settings-modal"

import {
  AppFrameConversationErrorSurface,
  AppFrameLoadingSurface,
} from "./app-frame-status-surfaces"
import type { EmptyStateProps } from "./app-frame.types"
import mainStyles from "./app-frame-main.module.css"
import statusStyles from "./app-frame-status.module.css"

type Thread = EngineSnapshot["thread"]

export type AppFrameMainSurfaceProps = {
  brandName: string | undefined
  activeId: string | null
  mounted: boolean
  hideWorkspaceHeader: boolean
  standaloneSurface: boolean
  projectWorkspace: boolean
  projectTaskView: boolean
  resolvedRailCollapsed: boolean
  narrowWeb: boolean
  compactDesktopRail: boolean
  railHidden: boolean
  showConversation: boolean
  conversationHydrating: boolean
  conversationHydrationFailed: boolean
  machineError: string | null
  retryConversationHydration: () => void
  onOpenSettings: (tab: SettingsTab, returnTarget?: HTMLElement | null) => void
  shareClient: Pick<SessionClient, "createShare" | "revokeShare">
  thread: Thread
  conversationProps: ConversationThreadProps
  emptyState: ComponentType<EmptyStateProps>
  emptyStateProps: EmptyStateProps
  composer: ReactNode
  emptyStateOwnsComposer: boolean
  canvas: CanvasWorkspace
}

/** Owns the main workbench stage: header, state projection, timeline, and Composer slot. */
export function AppFrameMainSurface({
  brandName,
  activeId,
  mounted,
  hideWorkspaceHeader,
  standaloneSurface,
  projectWorkspace,
  projectTaskView,
  resolvedRailCollapsed,
  narrowWeb,
  compactDesktopRail,
  railHidden,
  showConversation,
  conversationHydrating,
  conversationHydrationFailed,
  machineError,
  retryConversationHydration,
  onOpenSettings,
  shareClient,
  thread,
  conversationProps,
  emptyState: EmptyState,
  emptyStateProps,
  composer,
  emptyStateOwnsComposer,
  canvas,
}: AppFrameMainSurfaceProps) {
  const t = useT()

  return (
    <section
      className={mainStyles.main}
      data-desktop-web="true"
      data-app-frame-main="true"
      data-standalone-surface={standaloneSurface ? "true" : undefined}
      data-rail-collapsed={resolvedRailCollapsed ? "true" : "false"}
      // Empty direct chat and project workspaces share one document geometry
      // with active conversations.
      data-web-view={showConversation ? "thread" : projectTaskView ? "project-task" : "welcome"}
    >
      {/* 会话头部（SHARE-1）：有活跃会话且已开聊时显分享入口——创建可撤销只读链接。 */}
      {mounted && !hideWorkspaceHeader ? (
        <WorkspaceHeader
          activeId={activeId}
          shareClient={shareClient}
          onOpenSettings={onOpenSettings}
          {...(brandName === undefined ? {} : { brandName })}
          emptyWorkspace={!showConversation}
          projectWorkspace={projectWorkspace}
          // The header owns the only menu trigger while the compact rail is
          // hidden. Once the rail is visible, its own shadcn trigger becomes
          // the owner so the canvas never shows two competing toggles.
          showNavigationTrigger={narrowWeb || (compactDesktopRail && railHidden)}
        />
      ) : null}
      <div
        className={statusStyles.timelineStage}
        data-canvas-reopen={canvas.canReopenCanvas ? "true" : undefined}
      >
        {!mounted ? (
          <AppFrameLoadingSurface />
        ) : conversationHydrating ? (
          <AppFrameLoadingSurface />
        ) : conversationHydrationFailed ? (
          <AppFrameConversationErrorSurface
            detail={machineError}
            onRetry={retryConversationHydration}
          />
        ) : showConversation ? (
          <div data-slot="conversation-timeline" className="min-h-0 flex-1">
            <ConversationThread {...conversationProps} />
          </div>
        ) : (
          <EmptyState
            // A new conversation is a fresh workbench, not a continuation of
            // the previous welcome surface. Keying by its session restores the
            // canvas scroll and site-local empty-state controls together.
            key={activeId ?? "new-workspace"}
            {...emptyStateProps}
          />
        )}

        {/* 仅在时间线层内显示，避免按钮覆盖 TodoBar 或 Composer。 */}
        {canvas.canReopenCanvas ? (
          <Button variant="outline" type="button" className={statusStyles.canvasReopen} onClick={canvas.onReopen}>
            {t("canvas.reopen")}
          </Button>
        ) : null}
      </div>

      {/* 计划条钉在输入框正上方，可收缩；思考/工具/子智能体在 ConversationThread 内联呈现。 */}
      {mounted ? <TodoBar todos={thread.todos} /> : null}

      {/* Site-owned empty surfaces may move the same composer into their own
          welcome layout; active conversations always use the shell slot. */}
      {!standaloneSurface && (showConversation || !emptyStateOwnsComposer) ? composer : null}
    </section>
  )
}
