import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react"

import { WebSkinProvider } from "@/components/ui/web-skin"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ContextPanel } from "@/components/blocks/context-panel/context-panel"
import { WorkspaceNavigationTrigger } from "@/components/blocks/workspace-header/workspace-header"
import { WorkspaceRail, type WorkspaceRailProps } from "@/components/blocks/workspace-rail/workspace-rail"
import type { EngineSnapshot } from "@/engine/machine"
import type { CanvasWorkspace } from "@/ui/shell/use-canvas-workspace"
import { CANVAS_MAX, CANVAS_MIN } from "@/ui/canvas/use-canvas-resize"
import { RAIL_COLLAPSED_WIDTH, RAIL_MAX, RAIL_MIN } from "@/ui/rail/use-rail-resize"
import { WORKSPACE_MAIN_MIN } from "@/ui/shell/layout-constraints"
import { useT } from "@/i18n/context"

import type { AppFrameProps } from "./app-frame.types"
import styles from "./app-frame.module.css"

type Thread = EngineSnapshot["thread"]
type RailProps = Omit<WorkspaceRailProps, "withinProvider">

export type AppFrameShellProps = {
  webSkin: NonNullable<AppFrameProps["webSkin"]>
  narrowWeb: boolean
  compactDesktopRail: boolean
  hideWorkspaceHeader: boolean
  resolvedRailCollapsed: boolean
  railHidden: boolean
  railWidth: number
  canvasWidth: number
  isResizing: boolean
  shellRef: RefObject<HTMLDivElement | null>
  workspaceRef: RefObject<HTMLDivElement | null>
  onRailOpenChange: (open: boolean) => void
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void
  onResizeKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
  onCanvasLayoutChange: (layout: Record<string, number>) => void
  onCanvasResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  railProps: RailProps
  mainSurface: ReactNode
  canvas: CanvasWorkspace
  thread: Thread
  activeId: string | null
  overlays: ReactNode
}

/** Owns the shadcn shell geometry: rail, main panel, optional Canvas, and overlays. */
export function AppFrameShell({
  webSkin,
  narrowWeb,
  compactDesktopRail,
  hideWorkspaceHeader,
  resolvedRailCollapsed,
  railHidden,
  railWidth,
  canvasWidth,
  isResizing,
  shellRef,
  workspaceRef,
  onRailOpenChange,
  onResizeStart,
  onResizeKeyDown,
  onCanvasLayoutChange,
  onCanvasResizeStart,
  railProps,
  mainSurface,
  canvas,
  thread,
  activeId,
  overlays,
}: AppFrameShellProps) {
  const t = useT()

  return (
    <WebSkinProvider value={webSkin}>
      <SidebarProvider
        ref={shellRef}
        className={styles.shell}
        // User Web keeps the desktop Sidebar primitive for fine-pointer windows;
        // the narrow desktop contract hides its track without switching to
        // the phone Sheet. Only a coarse-pointer phone uses the mobile surface.
        forceDesktop={!narrowWeb}
        data-desktop-web="true"
        data-web-skin={webSkin}
        data-compact-desktop={compactDesktopRail ? "true" : undefined}
        data-rail-collapsed={resolvedRailCollapsed ? "true" : "false"}
        data-rail-hidden={railHidden ? "true" : undefined}
        data-canvas-open={canvas.canvasOpen ? "true" : undefined}
        data-resizing={isResizing ? "true" : undefined}
        style={
          {
            "--rail-width": `${railWidth}px`,
            // The divider follows the same 200ms track as shadcn Sidebar when
            // The custom rail seam follows the same committed track as the
            // provider gap. It is intentionally separate from the user's
            // preferred width so collapsed mode has one explicit 52px edge.
            "--rail-seam-width": resolvedRailCollapsed ? `${RAIL_COLLAPSED_WIDTH}px` : `${railWidth}px`,
            "--canvas-width": `${canvasWidth}px`,
            "--sidebar-width": `${railWidth}px`,
            // Wide desktop uses a 52px icon track when explicitly collapsed.
            // Narrow desktop removes that track in CSS and keeps this token for
            // the wide-layout expand/collapse contract.
            "--sidebar-width-icon": `${RAIL_COLLAPSED_WIDTH}px`,
          } as CSSProperties
        }
        open={!resolvedRailCollapsed}
        persistOpenState={!compactDesktopRail}
        onOpenChange={onRailOpenChange}
      >
        {compactDesktopRail && hideWorkspaceHeader && railHidden ? (
          <WorkspaceNavigationTrigger
            {...(styles.compactNavigationTrigger === undefined ? {} : { className: styles.compactNavigationTrigger })}
          />
        ) : null}
        <WorkspaceRail withinProvider {...railProps} />

        {/* 拖拽分隔条：调整 rail/main 宽度（两侧自由、各有最小宽度）。 */}
        {!narrowWeb && !railHidden ? (
          <div
            className={styles.resizer}
            data-seam="rail"
            data-seam-visible="true"
            data-collapsed={resolvedRailCollapsed ? "true" : "false"}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("shell.resizeAria")}
            aria-valuemin={RAIL_MIN}
            aria-valuemax={RAIL_MAX}
            aria-valuenow={Math.round(railWidth)}
            aria-valuetext={`${Math.round(railWidth)}px`}
            tabIndex={resolvedRailCollapsed ? -1 : 0}
            aria-hidden={resolvedRailCollapsed || undefined}
            onPointerDown={onResizeStart}
            onKeyDown={onResizeKeyDown}
          />
        ) : null}

        <SidebarInset className={styles.inset}>
          <div
            ref={workspaceRef}
            className={styles.workspace}
            data-canvas-open={canvas.canvasOpen ? "true" : undefined}
          >
            <ResizablePanelGroup
              id="kokoro-workspace"
              orientation="horizontal"
              className={styles.workspaceGroup}
              onLayoutChange={onCanvasLayoutChange}
              resizeTargetMinimumSize={{ coarse: 28, fine: 20 }}
            >
              <ResizablePanel
                id="main"
                minSize={`${WORKSPACE_MAIN_MIN}px`}
                className={styles.mainPanel}
              >
                {mainSurface}
              </ResizablePanel>
              {canvas.resolvedCanvas !== null && activeId !== null ? (
                <>
                  {!canvas.fullscreen ? (
                    <ResizableHandle
                      id="canvas-resize"
                      className={styles.canvasHandle}
                      aria-label={t("canvas.resizeAria")}
                      aria-valuemin={CANVAS_MIN}
                      aria-valuemax={CANVAS_MAX}
                      aria-valuenow={Math.round(canvasWidth)}
                      aria-valuetext={`${Math.round(canvasWidth)}px`}
                      onPointerDown={onCanvasResizeStart}
                      disableDoubleClick
                    />
                  ) : null}
                  <ResizablePanel
                    id="canvas"
                    defaultSize={`${canvasWidth}px`}
                    minSize={`${CANVAS_MIN}px`}
                    maxSize={`${CANVAS_MAX}px`}
                    groupResizeBehavior="preserve-pixel-size"
                    className={styles.canvasPanel}
                  >
                    <ContextPanel
                      sessionId={activeId}
                      content={canvas.resolvedCanvas}
                      files={thread.files}
                      deliveries={thread.deliveries}
                      todos={thread.todos}
                      focusScopeRef={shellRef}
                      fullscreen={canvas.fullscreen}
                      onSelectFile={canvas.onSelectFile}
                      onSelectDelivery={canvas.onSelectDelivery}
                      onToggleFullscreen={canvas.onToggleFullscreen}
                      onClose={canvas.onClose}
                    />
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </div>
        </SidebarInset>

        {overlays}
      </SidebarProvider>
    </WebSkinProvider>
  )
}
