import {
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"

import { WORKSPACE_MAIN_MIN } from "@/ui/shell/layout-constraints"

// 侧栏拖拽改宽的钳制边界：保证 rail 与 main 各有最小宽度，RAIL_MAX 再加一道硬顶。
export const RAIL_MIN = 240
export const RAIL_MAX = 440
// The collapsed reference rail is 104 physical px at 2x capture = 52 CSS px.
// Keep this contract separate from the resizable expanded width and the mobile
// Sheet width so the seam, gap, and icon centers share one value.
export const RAIL_COLLAPSED_WIDTH = 52
// Manus' expanded command rail starts at 300px. This leaves the same readable
// project/task column and context column as the reference at 1280px.
export const RAIL_DEFAULT = 300
// Keep the full Manus workbench above 768px. At exactly 768px the narrow
// desktop destination must already be active; using 767 here created a
// one-pixel layout discontinuity where the rail was expanded at 768 and
// collapsed at 767, making a browser resize visibly jump between two
// workbenches. The phone Sheet remains owned by useIsMobile and is not part
// of this query.
export const RAIL_COMPACT_BREAKPOINT = 768

// Pointer coordinates are CSS pixels, while the seam is painted on the device
// pixel grid. Keeping the track width on that grid prevents a fractional
// transform from rasterising the 1px rule as two faint lines at the clamp
// edges (most visible with browser zoom or a non-1 devicePixelRatio).
export function snapResizeWidth(raw: number): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  return Math.round(raw * dpr) / dpr
}

function canvasReserveWidth(shell: HTMLElement): number {
  // When the right Canvas is open, its grid track is another hard constraint
  // on the left rail. Letting Rail resize to its old max first makes the
  // Canvas ResizeObserver clamp in the same gesture, so the two dividers move
  // at different speeds near the boundary. Read the committed panel track
  // instead and keep it stable for the duration of the Rail gesture.
  const panel = shell.querySelector<HTMLElement>('[data-slot="context-panel"]')
  if (!panel) return 0
  const width = panel.getBoundingClientRect().width
  return Number.isFinite(width) && width > 0 ? width : 0
}

export function clampRailWidth(raw: number, containerWidth: number, reservedCanvasWidth = 0): number {
  const max = Math.min(RAIL_MAX, containerWidth - WORKSPACE_MAIN_MIN - reservedCanvasWidth)
  // 容器极窄时 max 可能小于 min：回退到 min，不返回负数/反转区间。
  return snapResizeWidth(Math.max(RAIL_MIN, Math.min(raw, Math.max(RAIL_MIN, max))))
}

// 返回当前 rail 宽度（px）、挂到 shell 的 ref（用于量取容器几何）、以及分隔条的拖拽起始处理器。
export function useRailResize() {
  const [width, setWidth] = useState(RAIL_DEFAULT)
  const widthRef = useRef(RAIL_DEFAULT)
  // 拖拽中标记：让 shell 在拖拽期间关掉列宽过渡，宽度实时跟手；仅收起/展开切换才用过渡。
  const [isResizing, setIsResizing] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  // SidebarProvider renders a div; keep the ref concrete so the standard
  // shadcn layout can own the shell without a cast at the call site.
  const shellRef = useRef<HTMLDivElement | null>(null)

  // React owns the three layout variables through AppFrame's controlled
  // SidebarProvider.  Committing here synchronously keeps the gap, fixed
  // container and seam on the same render instead of briefly allowing a
  // native style write and a later React render to disagree.
  const commitWidth = useCallback((next: number) => {
    if (next === widthRef.current) {
      return
    }
    widthRef.current = next
    flushSync(() => setWidth(next))
  }, [])

  useEffect(() => () => {
    cleanupRef.current?.()
  }, [])

  const onResizeStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const shell = shellRef.current
    if (!shell) {
      return
    }
    // A shell owns one horizontal resize transaction at a time. If the user
    // catches the other handle while Canvas is still captured, allowing both
    // hooks to publish widths makes each side measure a different frame and
    // the two seams visibly drift apart. Keep the active pointer authoritative
    // and let the second gesture start after it has ended.
    if (shell.dataset.canvasResizing === "true") {
      return
    }
    event.preventDefault()
    const handle = event.currentTarget
    // Finish a stale transaction before installing the next one. Installing
    // capture first lets the previous cleanup clear the new gesture marker.
    cleanupRef.current?.()
    // React state is intentionally still used for rendering, but it is not
    // synchronous. Mark the shell before the first pointermove so the
    // Sidebar width transition is disabled immediately; otherwise the first
    // few pixels of a drag are animated and the pointer/painted seam drift
    // apart at the clamp edge.
    // Use a synchronous, side-specific marker in addition to React's shared
    // state marker. The canvas hook can start in the same frame; side-specific
    // markers prevent one gesture from clearing the other side's no-transition
    // lock and make the divider follow the pointer from its first pixel.
    shell.dataset.railResizing = "true"
    shell.dataset.resizing = "true"
    if (typeof event.pointerId === "number") {
      handle.setPointerCapture?.(event.pointerId)
    }
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    // 起始即量取容器矩形：拖拽期间容器不移动，用它把 clientX 换算成 rail 宽度。
    const rect = shell.getBoundingClientRect()
    setIsResizing(true)

    const reservedCanvasWidth = canvasReserveWidth(shell)
    const move = (moveEvent: PointerEvent) => {
      const next = clampRailWidth(moveEvent.clientX - rect.left, rect.width, reservedCanvasWidth)
      commitWidth(next)
    }
    let active = true
    const end = () => {
      if (!active) {
        return
      }
      active = false
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("blur", end)
      handle.removeEventListener("lostpointercapture", end)
      // Restore the page's pre-drag inline styles instead of unconditionally
      // clearing them. This keeps the resizer composable with a site-owned
      // cursor/user-select policy and makes pointer-cancel cleanup lossless.
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      if (typeof event.pointerId === "number" && handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture?.(event.pointerId)
      }
      // A pointer drag should not leave the separator's keyboard focus ring
      // painted across the entire shell. Keyboard users still get the normal
      // focus-visible ring when they tab to the separator and resize with
      // ArrowLeft/ArrowRight.
      if (document.activeElement === handle) {
        handle.blur()
      }
      // Only clear our inline marker. A parent shell may have installed its
      // own marker while this gesture was ending.
      delete shell.dataset.railResizing
      if (shell.dataset.canvasResizing !== "true") {
        delete shell.dataset.resizing
      }
      setIsResizing(false)
      if (cleanupRef.current === end) {
        cleanupRef.current = null
      }
    }
    cleanupRef.current = end

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    window.addEventListener("blur", end)
    // A browser can lose capture when the tab/window changes state without
    // delivering pointerup. Treat that boundary as a cancelled transaction so
    // the shell never remains locked in resize mode.
    handle.addEventListener("lostpointercapture", end)
    // 拖拽期间全局锁定列宽光标并禁选，避免选中文本/光标闪烁。
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [commitWidth])

  const onResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return
    }
    const shell = shellRef.current
    if (!shell) {
      return
    }
    event.preventDefault()
    const rect = shell.getBoundingClientRect()
    const step = event.shiftKey ? 32 : 16
    const direction = event.key === "ArrowRight" ? 1 : -1
    const next = clampRailWidth(widthRef.current + direction * step, rect.width, canvasReserveWidth(shell))
    commitWidth(next)
  }, [commitWidth])

  return { width, isResizing, shellRef, onResizeStart, onResizeKeyDown }
}
