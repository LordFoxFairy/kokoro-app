import { useCallback, useEffect, useRef, useState } from "react"

import type { ProjectResourceListPage, ProjectResourceUploadResult } from "@/contract/project-resource"

import { previewResources, type ProjectResourcePreview } from "./project-workspace-model"

type ListResources = (cursor: string | null, signal: AbortSignal) => Promise<ProjectResourceListPage>
type ResourceListState = {
  items: readonly ProjectResourcePreview[]
  nextCursor: string | null
  status: "loading" | "loadingMore" | "ready" | "error"
  errorCursor: string | null
}

const initialLiveState: ResourceListState = { items: [], nextCursor: null, status: "loading", errorCursor: null }
const initialPreviewState: ResourceListState = { items: previewResources, nextCursor: null, status: "ready", errorCursor: null }

function resourceRow(item: ProjectResourceListPage["items"][number]): ProjectResourcePreview {
  return {
    id: item.assetId,
    name: item.filename,
    kind: "file",
    detail: `${item.mimeType} · ${Math.max(1, Math.ceil(Number(item.sizeBytes) / 1024))} KB`,
  }
}

/** Project-local read projection; BFF remains the sole persisted resource owner. */
export function useProjectResources(projectRef: string | undefined, preview: boolean, listResources: ListResources | undefined) {
  const [state, setState] = useState<ResourceListState>(preview ? initialPreviewState : initialLiveState)
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async (cursor: string | null): Promise<void> => {
    const id = ++requestId.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState((current) => ({
      items: cursor === null ? [] : current.items,
      nextCursor: cursor === null ? null : current.nextCursor,
      status: cursor === null ? "loading" : "loadingMore",
      errorCursor: null,
    }))
    try {
      if (!projectRef || !listResources) throw new Error("project_resources_not_configured")
      const page = await listResources(cursor, controller.signal)
      if (controller.signal.aborted || id !== requestId.current) return
      if (cursor !== null && page.nextCursor === cursor) throw new Error("project_resources_cursor_loop")
      setState((current) => {
        const rows = page.items.map(resourceRow)
        const items = cursor === null ? rows : [...current.items, ...rows.filter((row) => !current.items.some((item) => item.id === row.id))]
        return { items, nextCursor: page.nextCursor, status: "ready", errorCursor: null }
      })
    } catch {
      if (controller.signal.aborted || id !== requestId.current) return
      setState((current) => ({ ...current, status: "error", errorCursor: cursor }))
    }
  }, [listResources, projectRef])

  useEffect(() => {
    if (preview) {
      requestId.current += 1
      controllerRef.current?.abort()
      return
    }
    let active = true
    queueMicrotask(() => { if (active) void load(null) })
    return () => {
      active = false
      requestId.current += 1
      controllerRef.current?.abort()
    }
  }, [load, preview])

  const refresh = useCallback(() => load(null), [load])
  const loadMore = useCallback(() => {
    if (state.status !== "ready" || state.nextCursor === null) return Promise.resolve()
    return load(state.nextCursor)
  }, [load, state.nextCursor, state.status])
  const retry = useCallback(() => load(state.errorCursor), [load, state.errorCursor])
  const confirmUpload = useCallback(async (receipt: ProjectResourceUploadResult) => {
    if (preview) {
      setState((current) => ({ ...current, items: [{
        id: receipt.assetId,
        name: receipt.filename,
        kind: "file",
        detail: `${receipt.mimeType} · ${Math.max(1, Math.ceil(Number(receipt.sizeBytes) / 1024))} KB`,
      }, ...current.items.filter((item) => item.id !== receipt.assetId)] }))
      return
    }
    // The POST receipt proves mutation success, but only a fresh owner GET
    // can make it a listed resource. A GET error remains visible separately.
    await refresh()
  }, [preview, refresh])

  return { ...state, refresh, loadMore, retry, confirmUpload }
}
