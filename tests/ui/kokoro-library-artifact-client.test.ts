import { afterEach, expect, it, vi } from "vitest"

import { beginLibraryArtifactDownload, getLibraryArtifact, listLibraryArtifacts } from "@/features/app/kokoro-library-artifact-client"

const item = {
  kind: "artifact", conversation_id: "conversation-1", artifact_id: "artifact-1", asset_id: "asset-1",
  artifact_kind: "document", title: "Report", filename: "report.pdf", mime_type: "application/pdf",
  size_bytes: "2048", content_sha256: "a".repeat(64), source_run_id: "run-1", delivered_at: "2026-09-28T10:00:00Z",
}
const page = (items: unknown[], next_cursor: string | null = null) => ({ data: { items, next_cursor }, meta: { request_id: "req-1" } })

afterEach(() => vi.unstubAllGlobals())

it("reads an empty Artifact page with cursor and never calls the old session path", async () => {
  const fetcher = vi.fn(async (url: string) => { expect(url).toContain("/api/hub/library?"); return new Response(JSON.stringify(page([], "next-1")), { status: 200 }) })
  vi.stubGlobal("fetch", fetcher)
  await expect(listLibraryArtifacts(null, new AbortController().signal)).resolves.toEqual({ items: [], nextCursor: "next-1" })
  expect(fetcher).toHaveBeenCalledWith("/api/hub/library?kind=artifact&limit=50", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }))
  await listLibraryArtifacts("next-1", new AbortController().signal)
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/hub/library?kind=artifact&limit=50&cursor=next-1")
})

it("rejects a non-artifact/mixed page rather than displaying a false empty page", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(page([item, { ...item, kind: "file" }])), { status: 200 })))
  await expect(listLibraryArtifacts(null, new AbortController().signal)).rejects.toThrow("library_artifacts_invalid_response")
})

it("checks two-part detail and preflights before native attachment, without a browser Blob", async () => {
  const fetcher = vi.fn(async (url: string) => { expect(url).toContain("/api/hub/library/artifacts/"); return new Response(JSON.stringify({ data: item, meta: { request_id: "req-1" } }), { status: 200 }) })
  vi.stubGlobal("fetch", fetcher)
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  await expect(getLibraryArtifact("conversation-1", "artifact-1", new AbortController().signal)).resolves.toMatchObject({ conversationId: "conversation-1", artifactId: "artifact-1" })
  await beginLibraryArtifactDownload({ conversationId: "conversation-1", artifactId: "artifact-1" }, new AbortController().signal)
  expect(fetcher).toHaveBeenCalledWith("/api/hub/library/artifacts/conversation-1/artifact-1", expect.objectContaining({ cache: "no-store" }))
  expect(click).toHaveBeenCalledTimes(1)
  const anchor = click.mock.instances[0] as HTMLAnchorElement
  expect(anchor.href).toContain("/api/hub/library/artifacts/conversation-1/artifact-1/content")
  expect(anchor.download).toBe("report.pdf")
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/content"))).toBe(false)
  click.mockRestore()
})

it("does not launch attachment after a 404 detail, abort or mismatched identity", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })))
  await expect(beginLibraryArtifactDownload({ conversationId: "conversation-1", artifactId: "artifact-1" }, new AbortController().signal)).rejects.toThrow("library_artifact_not_found")
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { ...item, artifact_id: "different" }, meta: { request_id: "req-1" } }), { status: 200 })))
  await expect(beginLibraryArtifactDownload({ conversationId: "conversation-1", artifactId: "artifact-1" }, new AbortController().signal)).rejects.toThrow("library_artifacts_invalid_response")
  const abort = new AbortController(); abort.abort()
  await expect(beginLibraryArtifactDownload({ conversationId: "conversation-1", artifactId: "artifact-1" }, abort.signal)).rejects.toThrow()
  expect(click).not.toHaveBeenCalled()
  click.mockRestore()
})
