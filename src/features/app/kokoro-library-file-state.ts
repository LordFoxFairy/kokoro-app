import { useCallback, useEffect, useRef, useState } from "react"

import { listLibraryFiles, type LibraryFile, type LibraryFilePage } from "./kokoro-library-file-client"

type Phase = "loading" | "ready" | "error" | "loadingMore" | "moreError"
type FileState = { items: readonly LibraryFile[]; nextCursor: string | null; phase: Phase }
type ListFiles = (cursor: string | null, signal: AbortSignal) => Promise<LibraryFilePage>

const INITIAL: FileState = { items: [], nextCursor: null, phase: "loading" }

/** Tab-local read state; unmount aborts the page and discards late results. */
export function useLibraryFiles(refreshRevision = 0, listFiles: ListFiles = listLibraryFiles) {
  const [state, setState] = useState<FileState>(INITIAL)
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const usedCursors = useRef(new Set<string>())
  const inFlightCursor = useRef<string | null>(null)

  const load = useCallback(async (cursor: string | null) => {
    const id = ++requestId.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    if (cursor === null) {
      usedCursors.current.clear()
      setState(INITIAL)
    } else {
      inFlightCursor.current = cursor
      setState((current) => ({ ...current, phase: "loadingMore" }))
    }
    try {
      const page = await listFiles(cursor, controller.signal)
      if (controller.signal.aborted || id !== requestId.current) return
      if (cursor !== null) usedCursors.current.add(cursor)
      const nextCursor = page.nextCursor !== null && usedCursors.current.has(page.nextCursor) ? null : page.nextCursor
      setState((current) => {
        const byId = new Map((cursor === null ? [] : current.items).map((item) => [item.assetId, item]))
        for (const item of page.items) byId.set(item.assetId, item)
        return { items: [...byId.values()], nextCursor, phase: "ready" }
      })
    } catch {
      if (controller.signal.aborted || id !== requestId.current) return
      setState((current) => ({ ...current, phase: cursor === null ? "error" : "moreError" }))
    } finally {
      if (id === requestId.current) inFlightCursor.current = null
    }
  }, [listFiles])

  useEffect(() => {
    const requestSequence = requestId
    let active = true
    queueMicrotask(() => { if (active) void load(null) })
    return () => {
      active = false
      requestSequence.current++
      controllerRef.current?.abort()
    }
  }, [load, refreshRevision])

  const reload = useCallback(() => { void load(null) }, [load])
  const loadMore = useCallback(() => {
    const cursor = state.nextCursor
    if (cursor === null || state.phase === "loadingMore" || inFlightCursor.current === cursor) return
    if (usedCursors.current.has(cursor)) {
      setState((current) => ({ ...current, nextCursor: null }))
      return
    }
    void load(cursor)
  }, [load, state.nextCursor, state.phase])

  return { ...state, reload, loadMore }
}
