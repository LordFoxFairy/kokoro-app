import { BFF_TOOL_DISPLAY_PROVENANCE } from "@/generated/bff-tool-display"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import type { SessionStreamState } from "@/core/state"
import type { WorkspaceOutputFile } from "@/ui/canvas/canvas-store"
import type { RunDisplay } from "@/contract/answer-actions"
import type { AnswerActionBoundary } from "./answer-action-scope"

function createRunDisplayReader(boundary: AnswerActionBoundary | undefined, runId: string | undefined, readEpoch: object | undefined, publish?: () => void) {
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
      const outputChanged = facts?.workspace_outputs?.length || result.workspace_outputs?.length
      facts = result; phase = "ready"; changed()
      if (outputChanged) publish?.()
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
      // Leaving the view can abort the terminal refresh after an earlier read
      // succeeded. Keep those same-scope facts, but release the cancelled read
      // so reopening the visible passage can obtain the final result once.
      if (controller?.signal.aborted && phase === "loading") { spent = false; phase = "idle"; revision++ }
      listeners.add(listener)
      return () => { listeners.delete(listener); if (!listeners.size) { retired = true; controller?.abort() } }
    },
  }
}
type Reader = ReturnType<typeof createRunDisplayReader>
function createScope(epoch: object | undefined, profile: string) {
  let revision = 0
  const listeners = new Set<() => void>()
  return {
    epoch, profile, runs: new Map<string, Reader>(),
    snapshot: () => revision,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    publish: () => { revision++; for (const listener of listeners) listener() },
  }
}
const readers = new WeakMap<AnswerActionBoundary, ReturnType<typeof createScope>>()
const noSubscribe = () => () => {}
const serverRevision = () => 0
function readerScope(boundary: AnswerActionBoundary, epoch: object | undefined, profile: string) {
  let scope = readers.get(boundary)
  if (!scope || scope.epoch !== epoch || scope.profile !== profile) {
    scope = createScope(epoch, profile); readers.set(boundary, scope)
  }
  return scope
}
function scopedReader(boundary: AnswerActionBoundary | undefined, runId: string | undefined, epoch: object | undefined, profile: string): Reader {
  if (!boundary || !runId) return createRunDisplayReader(undefined, undefined, epoch)
  const scope = readerScope(boundary, epoch, profile)
  let reader = scope.runs.get(runId)
  if (!reader) { reader = createRunDisplayReader(boundary, runId, epoch, scope.publish); scope.runs.set(runId, reader) }
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

/** Pure projection of already-read, still-loaded Runs; never starts an owner read. */
export function useRunWorkspaceFiles(boundary: AnswerActionBoundary | undefined, thread: SessionStreamState): readonly WorkspaceOutputFile[] {
  const epoch = boundary?.readEpoch
  const profile = BFF_TOOL_DISPLAY_PROVENANCE.sourceSha256
  const scope = useMemo(() => boundary && readerScope(boundary, epoch, profile), [boundary, epoch, profile])
  useSyncExternalStore(scope?.subscribe ?? noSubscribe, scope?.snapshot ?? serverRevision, serverRevision)
  if (!scope || !boundary?.isCurrent()) return []
  const loaded = new Set([...Object.keys(thread.stepsByRun), ...thread.messages.map(message => message.runId), thread.executionProcess?.runId])
  return [...scope.runs].flatMap(([runId, reader]) => loaded.has(runId) ? runWorkspaceFiles(reader.get()) : [])
}

export function runWorkspaceFiles(display: RunDisplay | null): WorkspaceOutputFile[] {
  return display?.workspace_outputs?.map(output => ({
    runId: display.run_id, versionId: output.version_id, path: output.virtual_path, mime: output.mime_type,
    bytes: output.size_bytes, contentSha256: output.content_sha256,
  })) ?? []
}
