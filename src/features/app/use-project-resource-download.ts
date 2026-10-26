import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { projectDownloadIntentSchema } from "@/contract/project-resource-download"
import { downloadProjectResource } from "./project-resource-download"
import type { ProjectResourcePreview } from "./project-workspace-model"

type DownloadState = "idle" | "pending" | "error" | "initiated"
type ReadBoundary = Readonly<{ admitted: boolean; subject: string | null; generation: number }>
export type ProjectResourceDownloadScope = Readonly<{
  projectRef: string | undefined; preview: boolean; open: boolean; boundary: ReadBoundary | undefined; isCurrent: () => boolean
}>
type Lifetime = { active: boolean; scope: object; requests: Map<string, AbortController>; urls: Set<string> }

/** A mounted resource dialog owns ephemeral download intents, never upload or Project authorization. */
export function useProjectResourceDownload(input: ProjectResourceDownloadScope) {
  const { projectRef, preview, open, boundary, isCurrent } = input
  const admitted = boundary?.admitted === true && typeof boundary.subject === "string" && boundary.subject.length > 0
    && Number.isSafeInteger(boundary.generation) && boundary.generation >= 0
  const scope = useMemo(() => ({ projectRef, preview, open, subject: boundary?.subject, generation: boundary?.generation,
    admitted: boundary?.admitted, isCurrent }), [projectRef, preview, open, boundary?.subject, boundary?.generation, boundary?.admitted, isCurrent])
  const owner = useRef<Lifetime | null>(null)
  const [projection, setProjection] = useState<{ scope: object; states: Readonly<Record<string, DownloadState>> } | null>(null)
  useLayoutEffect(() => {
    const lifetime: Lifetime = { active: true, scope, requests: new Map(), urls: new Set() }
    owner.current = lifetime
    return () => {
      lifetime.active = false
      lifetime.requests.forEach(controller => controller.abort()); lifetime.requests.clear()
      lifetime.urls.forEach(url => URL.revokeObjectURL(url)); lifetime.urls.clear()
    }
  }, [scope])
  const current = useCallback((lifetime: Lifetime) => {
    const owned = lifetime.active && owner.current === lifetime && lifetime.scope === scope
    const valid = owned && open && !preview && admitted && isCurrent()
    if (!valid) {
      lifetime.active = false
      lifetime.requests.forEach(controller => controller.abort())
      if (owned) setProjection(previous => previous?.scope === lifetime.scope ? null : previous)
    }
    return valid
  }, [scope, open, preview, admitted, isCurrent])
  const state = useCallback((id: string): DownloadState => projection?.scope === scope && isCurrent() ? projection.states[id] ?? "idle" : "idle", [projection, scope, isCurrent])
  const publish = (lifetime: Lifetime, id: string, value: DownloadState) => {
    if (!current(lifetime)) return
    setProjection(previous => ({ scope, states: { ...(previous?.scope === scope ? previous.states : {}), [id]: value } }))
  }
  const start = async (resource: ProjectResourcePreview): Promise<void> => {
    const lifetime = owner.current
    if (!lifetime || !current(lifetime) || lifetime.requests.has(resource.id)) return
    const parsed = projectDownloadIntentSchema.safeParse({ projectRef, assetId: resource.id, filename: resource.name,
      mimeType: resource.mimeType, sizeBytes: resource.sizeBytes, contentSha256: resource.contentSha256 })
    if (!parsed.success) { publish(lifetime, resource.id, "error"); return }
    const controller = new AbortController()
    lifetime.requests.set(resource.id, controller); publish(lifetime, resource.id, "pending")
    try {
      const blob = await downloadProjectResource(parsed.data, controller.signal)
      if (!current(lifetime) || controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      lifetime.urls.add(url)
      try {
        if (!current(lifetime) || controller.signal.aborted) return
        const link = document.createElement("a")
        link.href = url; link.download = parsed.data.filename
        document.body.append(link)
        try { link.click() } finally { link.remove() }
        publish(lifetime, resource.id, "initiated")
      } finally { URL.revokeObjectURL(url); lifetime.urls.delete(url) }
    } catch { if (!controller.signal.aborted) publish(lifetime, resource.id, "error") }
    finally { if (lifetime.requests.get(resource.id) === controller) lifetime.requests.delete(resource.id) }
  }
  const cancel = (id: string) => {
    const lifetime = owner.current
    if (!lifetime || !current(lifetime)) return
    lifetime.requests.get(id)?.abort(); lifetime.requests.delete(id); publish(lifetime, id, "idle")
  }
  return { state, start, cancel, unavailable: preview || !admitted || !projectRef || !isCurrent() }
}
