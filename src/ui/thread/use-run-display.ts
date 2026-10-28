import { useEffect, useMemo, useState } from "react"
import type { RunDisplay } from "@/contract/answer-actions"
import type { AnswerActionBoundary } from "./answer-action-scope"
function createRunDisplayReader(boundary: AnswerActionBoundary | undefined, runId: string | undefined, changed: (update: (value: number) => number) => void) {
    let facts: RunDisplay | null = null, controller: AbortController | null = null, spent = false, retired = false
    const inspect = () => {
      if (!boundary || !runId || !boundary.isCurrent() || spent || retired) return
      spent = true; controller = new AbortController(); changed(value => value + 1)
      const signal = controller.signal
      void boundary.client.readDisplay({ sessionId: boundary.sessionId, runId }, signal).then(result => {
        if (retired || signal.aborted || !boundary.isCurrent() || result.run_id !== runId) return
        facts = result; changed(value => value + 1)
      }).catch(() => {
        if (!retired && !signal.aborted && boundary.isCurrent()) { spent = false; changed(value => value + 1) }
        // Missing/unavailable display remains unknown; only a new explicit click may read again.
      })
    }
    return { get: () => facts, inspect, activate: () => { retired = false; if (controller?.signal.aborted && facts === null) spent = false }, retire: () => { retired = true; controller?.abort() } }
}
/** One explicitly requested Run read; no snapshot fan-out, background poll or command. */
export function useRunDisplay(boundary: AnswerActionBoundary | undefined, runId: string | undefined) {
  const [, changed] = useState(0)
  const read = useMemo(() => createRunDisplayReader(boundary, runId, changed), [boundary, runId])
  useEffect(() => { read.activate(); return () => read.retire() }, [read])
  return { facts: read.get(), inspect: read.inspect }
}
