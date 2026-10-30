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
  await expect(listLibraryArtifacts(null, new AbortController().signal, {query:"",type:"all"})).resolves.toEqual({ items: [], nextCursor: "next-1" })
  expect(fetcher).toHaveBeenCalledWith("/api/hub/library?kind=artifact&limit=50", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }))
  await listLibraryArtifacts("next-1", new AbortController().signal, {query:"",type:"all"})
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/hub/library?kind=artifact&limit=50&cursor=next-1")
  await listLibraryArtifacts(null, new AbortController().signal, {query:"report & final",type:"documents"})
  expect(fetcher.mock.calls[2]?.[0]).toBe("/api/hub/library?kind=artifact&limit=50&q=report+%26+final&type=documents")
  const rawQuery = "İ".repeat(200)
  await listLibraryArtifacts(null,new AbortController().signal,{query:rawQuery,type:"all"})
  const sentQuery = new URL(String(fetcher.mock.calls[3]?.[0]),"http://fixture.local").searchParams.get("q")
  expect(sentQuery).toBe(rawQuery)
  expect([...sentQuery!]).toHaveLength(200)
})

it("rejects a non-artifact/mixed page rather than displaying a false empty page", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(page([item, { ...item, kind: "file" }])), { status: 200 })))
  await expect(listLibraryArtifacts(null, new AbortController().signal, {query:"",type:"all"})).rejects.toThrow("library_artifacts_invalid_response")
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

// Preview reads are a separate, bounded consumer of the unchanged binary URL.
import * as artifactClient from "@/features/app/kokoro-library-artifact-client"
import { createHash, webcrypto } from "node:crypto"

const previewBytes = new TextEncoder().encode("# Delivered\n中文正文\n")
const previewItem = (bytes = previewBytes, overrides: Record<string, unknown> = {}) => ({
  ...item, filename: "report.md", mime_type: "text/markdown", size_bytes: String(bytes.length),
  content_sha256: createHash("sha256").update(bytes).digest("hex"), ...overrides,
})
function previewResponse(bytes: Uint8Array, headers: Record<string, string> = {}) {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } }), {
    headers: { "content-type": "text/markdown", "content-length": String(bytes.length), ...headers },
  })
}
function previewFetch(metadata = previewItem(), content: Response = previewResponse(previewBytes)) {
  vi.stubGlobal("crypto", webcrypto)
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: metadata, meta: { request_id: "req-preview" } })).mockResolvedValueOnce(content)
  vi.stubGlobal("fetch", fetcher)
  return fetcher
}
const selector = { conversationId: "conversation-1", artifactId: "artifact-1" }
afterEach(() => vi.useRealTimers())

it("previews small UTF8 Markdown only after exact detail and complete size/SHA verification", async () => {
  const fetcher = previewFetch()
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).resolves.toEqual({ kind: "text", text: "# Delivered\n中文正文\n", mimeType: "text/markdown", sizeBytes: String(previewBytes.length) })
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    "/api/hub/library/artifacts/conversation-1/artifact-1", "/api/hub/library/artifacts/conversation-1/artifact-1/content",
  ])
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) })
})

it.each([{ size_bytes: "65537" }, { mime_type: "text/html" }, { mime_type: "image/png" }])("never reads unsupported or over-limit metadata content %j", async overrides => {
  const fetcher = previewFetch(previewItem(previewBytes, overrides))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).resolves.toEqual({ kind: "unsupported" })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it("accepts exactly 64KiB and an empty verified text file", async () => {
  for (const bytes of [new Uint8Array(65536).fill(97), new Uint8Array()]) {
    previewFetch(previewItem(bytes), previewResponse(bytes))
    await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).resolves.toEqual({ kind: "text", text: new TextDecoder().decode(bytes), mimeType: "text/markdown", sizeBytes: String(bytes.length) })
  }
})

it.each([
  { name: "hash mismatch", metadata: { content_sha256: "0".repeat(64) }, headers: {} },
  { name: "declared length mismatch", metadata: {}, headers: { "content-length": String(previewBytes.length + 1) } },
  { name: "MIME mismatch", metadata: {}, headers: { "content-type": "text/html" } },
])("rejects $name rather than displaying unverified bytes", async ({ metadata, headers }) => {
  previewFetch(previewItem(previewBytes, metadata), previewResponse(previewBytes, headers))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).rejects.toThrow()
})

it("rejects actual early EOF, a chunk exceeding the hard limit and invalid UTF8 despite a correct hash", async () => {
  previewFetch(previewItem(), previewResponse(previewBytes.slice(0, -1), { "content-length": String(previewBytes.length) }))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).rejects.toThrow()
  previewFetch(previewItem(), previewResponse(new Uint8Array(65537), { "content-length": String(previewBytes.length) }))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).rejects.toThrow()
  const badUtf8 = new Uint8Array([0xff])
  previewFetch(previewItem(badUtf8), previewResponse(badUtf8))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).rejects.toThrow()
})

it("does not request content after rejected identity or owner detail and does not follow a content redirect", async () => {
  for (const response of [Response.json({ data: { ...previewItem(), artifact_id: "foreign" }, meta: { request_id: "r" } }), new Response("", { status: 404 })]) {
    const fetcher = vi.fn().mockResolvedValue(response); vi.stubGlobal("fetch", fetcher)
    await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledOnce()
  }
  previewFetch(previewItem(), new Response(null, { status: 302, headers: { location: "https://foreign.test/bytes" } }))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).rejects.toThrow()
})

it("the one 10s deadline includes a stalled detail; a late detail never dispatches content", async () => {
  vi.useFakeTimers()
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal("fetch", fetcher)
  const reading = artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)
  const rejected = expect(reading).rejects.toThrow()
  await vi.advanceTimersByTimeAsync(10000)
  await rejected
  finish(Response.json({ data: previewItem(), meta: { request_id: "r" } }))
  await vi.advanceTimersByTimeAsync(1)
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]?.[1]?.signal.aborted).toBe(true)
})

it("cancels an in-flight body and never resets the deadline after detail headers", async () => {
  vi.useFakeTimers()
  let finish!: (response: Response) => void
  const cancel = vi.fn()
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
    .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/markdown", "content-length": String(previewBytes.length) } }))
  vi.stubGlobal("fetch", fetcher)
  const reading = artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)
  const rejected = expect(reading).rejects.toThrow()
  await vi.advanceTimersByTimeAsync(9000)
  finish(Response.json({ data: previewItem(), meta: { request_id: "r" } }))
  await vi.advanceTimersByTimeAsync(1000)
  await rejected
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(cancel).toHaveBeenCalledOnce()
})

it("a caller cancel aborts the original shared signal before a late detail can dispatch content", async () => {
  const abort = new AbortController()
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal("fetch", fetcher)
  const reading = artifactClient.readLibraryArtifactTextPreview(selector, abort.signal)
  const rejected = expect(reading).rejects.toThrow()
  abort.abort()
  await rejected
  finish(Response.json({ data: previewItem(), meta: { request_id: "r" } }))
  await Promise.resolve(); await Promise.resolve()
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]?.[1]?.signal.aborted).toBe(true)
})

it("cancels a late content response body instead of consuming or abandoning it after caller retirement", async () => {
  const abort = new AbortController(), cancel = vi.fn()
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: previewItem(), meta: { request_id: "r" } }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal("fetch", fetcher)
  const reading = artifactClient.readLibraryArtifactTextPreview(selector, abort.signal)
  const rejected = expect(reading).rejects.toThrow()
  for (let i = 0; i < 10 && fetcher.mock.calls.length < 2; i++) await Promise.resolve()
  expect(fetcher).toHaveBeenCalledTimes(2)
  abort.abort(); await rejected
  finish(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/markdown", "content-length": String(previewBytes.length) } }))
  for (let i = 0; i < 5; i++) await Promise.resolve()
  expect(cancel).toHaveBeenCalledOnce()
})

it("plain text uses the same verified bounded flow, and a broken stream is never a partial text success", async () => {
  previewFetch(previewItem(previewBytes, { mime_type: "text/plain" }), previewResponse(previewBytes, { "content-type": "text/plain" }))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).resolves.toEqual({ kind: "text", text: new TextDecoder().decode(previewBytes), mimeType: "text/plain", sizeBytes: String(previewBytes.length) })
  previewFetch(previewItem(), new Response(new ReadableStream({ start(controller) { controller.error(new Error("broken body")) } }), { headers: { "content-type": "text/markdown", "content-length": String(previewBytes.length) } }))
  await expect(artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)).rejects.toThrow()
})

it("SHA verification is inside the original total deadline, including an uncooperative late digest", async () => {
  vi.useFakeTimers()
  previewFetch()
  let finish!: (bytes: ArrayBuffer) => void
  const digest = vi.fn(() => new Promise<ArrayBuffer>(resolve => { finish = resolve }))
  vi.stubGlobal("crypto", { subtle: { digest } })
  const reading = artifactClient.readLibraryArtifactTextPreview(selector, new AbortController().signal)
  const rejected = expect(reading).rejects.toThrow()
  await vi.advanceTimersByTimeAsync(9000)
  expect(digest).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1000)
  await rejected
  finish(new Uint8Array(createHash("sha256").update(previewBytes).digest()).buffer)
  await vi.advanceTimersByTimeAsync(1)
})
