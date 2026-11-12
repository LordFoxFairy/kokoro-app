import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { isLibraryFileSearchQuery, listLibraryFiles, type LibraryFile, type LibraryFileType } from "./kokoro-library-file-client"

type Phase = "loading" | "ready" | "error" | "loadingMore" | "moreError"
type FileState = { items: readonly LibraryFile[]; nextCursor: string | null; phase: Phase }
const INITIAL: FileState = { items: [], nextCursor: null, phase: "loading" }

/** Search and paging retire together, without retiring the surrounding file actions. */
export function useLibraryFiles(refreshRevision: number, query: string, type: LibraryFileType) {
  const [attempt, setAttempt] = useState(0)
  const scope = useMemo(() => ({ search: { query, type }, refreshRevision, attempt, validQuery: isLibraryFileSearchQuery(query) }),
    [attempt, query, refreshRevision, type])
  const [record, setRecord] = useState<{ scope: typeof scope; view: FileState } | null>(null)
  const state = record?.scope === scope ? record.view : INITIAL
  const active = useRef<typeof scope | null>(null)
  const previousSearch = useRef<typeof scope | null>(null)
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const usedCursors = useRef(new Set<string>())
  const inFlightCursor = useRef<string | null>(null)
  // An already-started list request may describe the file before its delete
  // ACK. The acknowledged IDs retire that projection only for this tab scope.
  const retired = useRef(new Set<string>())

  useLayoutEffect(() => {
    active.current = scope
    usedCursors.current.clear()
    inFlightCursor.current = null
    return () => {
      active.current = null
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [scope])

  const load = useCallback(async (cursor: string | null) => {
    if (active.current !== scope || !scope.validQuery) return
    const id = ++requestId.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const isCurrent = () => active.current === scope && id === requestId.current && !controller.signal.aborted
    if (cursor !== null) {
      inFlightCursor.current = cursor
      setRecord((current) => current?.scope === scope ? { scope, view: { ...current.view, phase: "loadingMore" } } : current)
    }
    try {
      const page = await listLibraryFiles(cursor, controller.signal, scope.search)
      if (!isCurrent()) return
      if (cursor !== null) usedCursors.current.add(cursor)
      const nextCursor = page.nextCursor !== null && usedCursors.current.has(page.nextCursor) ? null : page.nextCursor
      setRecord((current) => {
        if (active.current !== scope) return current
        const prior = cursor !== null && current?.scope === scope ? current.view.items : []
        const byId = new Map(prior.map((item) => [item.assetId, item]))
        for (const item of page.items) if (!retired.current.has(item.assetId)) byId.set(item.assetId, item)
        return { scope, view: { items: [...byId.values()], nextCursor, phase: "ready" } }
      })
    } catch {
      if (!isCurrent()) return
      setRecord((current) => active.current === scope ? { scope, view: {
        ...(current?.scope === scope ? current.view : INITIAL), phase: cursor === null ? "error" : "moreError",
      } } : current)
    } finally {
      if (isCurrent()) {
        controllerRef.current = null
        inFlightCursor.current = null
      }
    }
  }, [scope])

  useEffect(() => {
    const previous = previousSearch.current
    previousSearch.current = scope
    if (!scope.validQuery) return
    if (previous && previous.search.type === scope.search.type && previous.search.query !== scope.search.query &&
      previous.refreshRevision === scope.refreshRevision && previous.attempt === scope.attempt) {
      const timer = setTimeout(() => void load(null), 225)
      return () => clearTimeout(timer)
    }
    let live = true
    queueMicrotask(() => { if (live) void load(null) })
    return () => { live = false }
  }, [load, scope])

  const reload = useCallback(() => { setAttempt((value) => value + 1) }, [])
  const acknowledgeDeletion = useCallback((assetId: string) => {
    retired.current.add(assetId)
    setRecord((current) => current === null ? null : { ...current, view: {
      ...current.view, items: current.view.items.filter((item) => item.assetId !== assetId),
    } })
  }, [])
  const loadMore = useCallback(() => {
    const cursor = state.nextCursor
    if (active.current !== scope || cursor === null || state.phase === "loadingMore" || inFlightCursor.current === cursor) return
    if (usedCursors.current.has(cursor)) {
      setRecord((current) => current?.scope === scope ? { scope, view: { ...current.view, nextCursor: null } } : current)
      return
    }
    void load(cursor)
  }, [load, scope, state.nextCursor, state.phase])

  return { ...state, validQuery: scope.validQuery, reload, loadMore, acknowledgeDeletion }
}
