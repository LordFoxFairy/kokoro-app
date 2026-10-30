import { useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { selectedMcpConnectionIdsSchema } from "@/contract/chat"
import type { SessionEngine } from "@/engine/machine"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { McpTrialTarget } from "@/ui/mcp/mcp-trial-context"
import { useT } from "@/i18n/context"

const route = () => typeof window === "undefined" ? "" : `${location.pathname}${location.search}${location.hash}`
function marker(): string | null | undefined {
  try { return typeof window === "undefined" ? undefined : localStorage.getItem("kokoro.web.auth-index-subject") }
  catch { return undefined }
}

/** One explicit UI action seeds a fresh draft; it never prepares, sends or authorizes a tool. */
export function useAppFrameMcpTrial({ engine, preview, boundary, handOffPrompt }: {
  engine: SessionEngine | null
  preview: boolean
  boundary: ProjectReadBoundary | undefined
  handOffPrompt: (prompt: string) => boolean
}) {
  const t = useT()
  const subject = boundary?.subject, admitted = boundary?.admitted === true, generation = boundary?.generation
  const originRoute = route()
  const context = useMemo(() => ({ engine, preview, subject, admitted, generation, originRoute }), [engine, preview, subject, admitted, generation, originRoute])
  const current = useRef<{ context: typeof context; active: boolean } | null>(null)
  useLayoutEffect(() => {
    const action = { context, active: true }
    current.current = action
    const moved = () => { if (route() !== context.originRoute) action.active = false }
    const changed = (event: StorageEvent) => {
      if (preview || event.storageArea && event.storageArea !== localStorage) return
      if (event.key === null || event.key === "kokoro.web.auth-index-subject" && event.oldValue !== event.newValue) action.active = false
    }
    window.addEventListener("popstate", moved)
    window.addEventListener("kokoro:surface-navigation", moved)
    window.addEventListener("storage", changed)
    return () => {
      action.active = false
      if (current.current === action) current.current = null
      window.removeEventListener("popstate", moved)
      window.removeEventListener("kokoro:surface-navigation", moved)
      window.removeEventListener("storage", changed)
    }
  }, [context, preview])
  return useCallback((target: McpTrialTarget): boolean => {
    const action = current.current
    if (!engine || !action?.active || action.context !== context || route() !== originRoute ||
      !preview && (!admitted || !subject || marker() !== subject) ||
      !target.name.trim() || target.name.length > 256 || !selectedMcpConnectionIdsSchema.safeParse([target.connectionId]).success) return false
    const before = engine.getSnapshot()
    if (before.hydrating || before.hasPendingSubmission || before.canRetryPendingSubmission || !before.canSubmitMessage ||
      before.machine.phase !== "idle" && before.machine.phase !== "error") return false
    let accepted = false
    try { accepted = handOffPrompt(t("mcp.tryPrompt", { name: target.name })) } catch { return false }
    if (!accepted || current.current !== action || !preview && marker() !== subject) return false
    const after = engine.getSnapshot()
    if (!after.store || after.store.activeId === before.store?.activeId || after.hasPendingSubmission || after.hydrating) return false
    engine.setSelectedMcpConnectionIds([target.connectionId])
    // The intentional navigation retires this old dialog action. The next
    // rendered page receives a fresh callback, not a reusable route lease.
    action.active = false
    return true
  }, [admitted, context, engine, handOffPrompt, originRoute, preview, subject, t])
}
