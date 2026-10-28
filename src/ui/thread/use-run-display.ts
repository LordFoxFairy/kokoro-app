import { BFF_TOOL_DISPLAY_PROVENANCE } from "@/generated/bff-tool-display"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import type { RunDisplay } from "@/contract/answer-actions"
import type { AnswerActionBoundary } from "./answer-action-scope"

function createRunDisplayReader(boundary: AnswerActionBoundary | undefined, runId: string | undefined, readEpoch: object | undefined) {
  const listeners = new Set<() => void>()
  let revision = 0
  const changed = () => { revision++; for (const listener of listeners) listener() }
  let facts: RunDisplay | null = null
  let phase: "idle" | "loading" | "ready" | "error" = "idle"
  let controller: AbortController | null = null
  let spent = false, retired = false, inspected = false, terminal = false, refreshed = false
  const current = () => !retired && boundary?.isCurrent() && boundary.readEpoch === readEpoch
  const inspect = () => {
    if (!boundary || !runId || !current() || spent) return
    inspected = true; spent = true; phase = "loading"
    const request = new AbortController()
    controller = request; changed()
    void boundary.client.readDisplay({ sessionId: boundary.sessionId, runId }, request.signal).then(result => {
      if (!current() || request.signal.aborted || controller !== request || result.run_id !== runId) return
      facts = result; phase = "ready"; changed()
    }).catch(() => {
      if (!current() || request.signal.aborted || controller !== request) return
      spent = false; phase = "error"; changed()
      // No automatic retry. A failed read needs another explicit inspection.
    })
  }
  const ensureRead = () => { if (phase === "idle") inspect() }
  const settle = (nextTerminal: boolean) => {
    const becameTerminal = nextTerminal && !terminal
    terminal ||= nextTerminal
    if (!becameTerminal || !inspected || refreshed || phase === "error" || !current()) return
    refreshed = true; controller?.abort(); spent = false; inspect()
  }
  return {
    get: () => current() ? facts : null, phase: () => current() ? phase : "idle" as const, inspect, ensureRead, settle,
    snapshot: () => revision,
    subscribe: (listener: () => void) => {
      if (retired) revision++
      retired = false
      if (controller?.signal.aborted && facts === null && phase === "loading") { spent = false; phase = "idle"; revision++ }
      listeners.add(listener)
      return () => { listeners.delete(listener); if (!listeners.size) { retired = true; controller?.abort() } }
    },
  }
}
type Reader = ReturnType<typeof createRunDisplayReader>
const readers = new WeakMap<AnswerActionBoundary, { epoch: object | undefined; profile: string; runs: Map<string, Reader> }>()
const serverRevision = () => 0
function scopedReader(boundary: AnswerActionBoundary | undefined, runId: string | undefined, epoch: object | undefined, profile: string): Reader {
  if (!boundary || !runId) return createRunDisplayReader(undefined, undefined, epoch)
  let scope = readers.get(boundary)
  if (!scope || scope.epoch !== epoch || scope.profile !== profile) {
    scope = { epoch, profile, runs: new Map() }; readers.set(boundary, scope)
  }
  let reader = scope.runs.get(runId)
  if (!reader) { reader = createRunDisplayReader(boundary, runId, epoch); scope.runs.set(runId, reader) }
  return reader
}
/** Timeline and Canvas share one exact scope/Run reader, never a global identity cache. */
export function useRunDisplay(boundary: AnswerActionBoundary | undefined, runId: string | undefined, terminal = false) {
  const profile = BFF_TOOL_DISPLAY_PROVENANCE.sourceSha256
  const epoch = boundary?.readEpoch
  const read = useMemo(() => scopedReader(boundary, runId, epoch, profile), [boundary, runId, profile, epoch])
  useSyncExternalStore(read.subscribe, read.snapshot, serverRevision)
  useEffect(() => { read.settle(terminal) }, [read, terminal])
  return { facts: read.get(), phase: read.phase(), inspect: read.inspect, ensureRead: read.ensureRead }
}
