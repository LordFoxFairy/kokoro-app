import { afterEach, describe, expect, it, vi } from "vitest"

import { listProjectResources } from "@/features/app/project-resource-list"

const cleanItem = {
  asset_id: "asset-1",
  filename: "private.txt",
  mime_type: "text/plain",
  size_bytes: "7",
  content_sha256: "a".repeat(64),
  scan_state: "clean",
  created_at: "2026-09-28T10:00:00.000Z",
}
const page = (items: unknown[], nextCursor: string | null = null) => ({ data: { items, next_cursor: nextCursor }, meta: { request_id: "req-1" } })
afterEach(() => vi.unstubAllGlobals())

describe("project resource owner GET consumer", () => {
  it("requests a bounded private page with an opaque cursor and AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page([cleanItem], "next/cursor")), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    expect(await listProjectResources("project /1", "opaque/cursor", controller.signal)).toEqual({
      items: [{ assetId: "asset-1", filename: "private.txt", mimeType: "text/plain", sizeBytes: "7", contentSha256: cleanItem.content_sha256, createdAt: "2026-09-28T10:00:00.000Z" }],
      nextCursor: "next/cursor",
    })
    expect(fetchMock).toHaveBeenCalledWith("/api/hub/projects/project%20%2F1/resources?limit=50&cursor=opaque%2Fcursor", { cache: "no-store", signal: controller.signal })
  })

  it("rejects pending, private-field leakage, malformed envelope and HTTP failure", async () => {
    for (const response of [
      new Response(JSON.stringify(page([{ ...cleanItem, scan_state: "pending" }])), { status: 200 }),
      new Response(JSON.stringify(page([{ ...cleanItem, download_url: "https://leak.test" }])), { status: 200 }),
      new Response(JSON.stringify({ data: { items: [] } }), { status: 200 }),
      new Response(JSON.stringify({ error: { code: "project_not_found" } }), { status: 404 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
      await expect(listProjectResources("project-1", null, new AbortController().signal)).rejects.toThrow()
    }
  })
})

// I3 exercises the existing strict wire reader, not a future download module.
describe("I3 trusted project resource metadata", () => {
  it("I3 real list mapper preserves the owner SHA alongside exact byte size and MIME", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(page([cleanItem])), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await listProjectResources("project-1", null, new AbortController().signal)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      assetId: cleanItem.asset_id, filename: cleanItem.filename,
      mimeType: cleanItem.mime_type, sizeBytes: cleanItem.size_bytes,
      contentSha256: cleanItem.content_sha256, createdAt: cleanItem.created_at,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
