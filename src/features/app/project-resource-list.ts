import { projectResourceListResponseSchema, type ProjectResourceListPage } from "@/contract/project-resource"

const PAGE_LIMIT = 50

/** Browser-private read through Web's existing same-origin BFF adapter. */
export async function listProjectResources(
  projectRef: string,
  cursor: string | null,
  signal: AbortSignal,
): Promise<ProjectResourceListPage> {
  if (!projectRef) throw new Error("project_not_selected")
  const query = new URLSearchParams({ limit: String(PAGE_LIMIT) })
  if (cursor !== null) query.set("cursor", cursor)
  const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/resources?${query}`, {
    cache: "no-store",
    signal,
  })
  if (!response.ok) throw new Error(`project_resources_http_${response.status}`)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error("project_resources_invalid_response")
  }
  const parsed = projectResourceListResponseSchema.safeParse(payload)
  if (!parsed.success) throw new Error("project_resources_invalid_response")
  return {
    items: parsed.data.data.items.map((item) => ({
      assetId: item.asset_id,
      filename: item.filename,
      mimeType: item.mime_type,
      sizeBytes: item.size_bytes,
      createdAt: item.created_at,
    })),
    nextCursor: parsed.data.data.next_cursor,
  }
}
