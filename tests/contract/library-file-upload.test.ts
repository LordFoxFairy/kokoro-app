import { File as NativeFile } from "node:buffer"

import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LibraryFileUploadError, uploadLibraryFile } from "@/features/app/kokoro-library-file-upload-client"

const clean = (file: File) => ({
  data: { file: {
    kind: "file", asset_id: "asset-personal-1", filename: file.name,
    mime_type: file.type, size_bytes: String(file.size), content_sha256: "a".repeat(64), scan_state: "clean",
  } },
  meta: { request_id: "req-upload" },
})

beforeEach(async () => {
  // Keep jsdom's window for the shared test setup, but use matching native
  // FormData/File/Request implementations when testing actual wire bytes.
  const native = await new Request("https://web.example", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: "--x--\r\n",
  }).formData()
  vi.stubGlobal("FormData", native.constructor)
  vi.stubGlobal("File", NativeFile)
})

afterEach(() => vi.unstubAllGlobals())

it("sends one native multipart Request with the exact measured body and special filename", async () => {
  const file = new File(["private bytes"], '私密 "笔记".txt', { type: "text/plain" })
  let sent: Request | null = null
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
    sent = request
    return new Response(JSON.stringify(clean(file)), { status: 200 })
  }))

  await expect(uploadLibraryFile(file, "library-file:fixed", new AbortController().signal)).resolves.toBe("asset-personal-1")
  expect(sent).not.toBeNull()
  const request = sent as unknown as Request
  expect(new URL(request.url).pathname).toBe("/api/hub/library/files")
  expect(request.method).toBe("POST")
  expect(request.headers.get("Idempotency-Key")).toBe("library-file:fixed")
  expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/u)
  expect((await request.clone().arrayBuffer()).byteLength).toBeLessThanOrEqual(1024 * 1024)
  const entries = [...(await request.clone().formData()).entries()]
  expect(entries).toHaveLength(1)
  expect(entries[0]?.[0]).toBe("files")
  const uploaded = entries[0]?.[1] as File
  expect(uploaded.name).toBe(file.name)
  expect(await uploaded.text()).toBe("private bytes")
})

it("rejects when multipart overhead pushes a sub-1MiB File over the complete request limit", async () => {
  const send = vi.fn()
  vi.stubGlobal("fetch", send)
  const file = new File([new Uint8Array(1024 * 1024 - 8)], "almost.bin", { type: "application/octet-stream" })
  await expect(uploadLibraryFile(file, "library-file:fixed", new AbortController().signal))
    .rejects.toMatchObject({ code: "request_body_too_large", retryable: false })
  expect(send).not.toHaveBeenCalled()
})

it("rejects a File already over 1 MiB before constructing or reading a multipart Request", async () => {
  let constructed = false
  vi.stubGlobal("Request", class {
    constructor() {
      constructed = true
      throw new Error("oversized File reached Request construction")
    }
  })
  const send = vi.fn()
  vi.stubGlobal("fetch", send)
  const file = new File([new Uint8Array(1024 * 1024 + 1)], "huge.bin", { type: "application/octet-stream" })
  await expect(uploadLibraryFile(file, "library-file:fixed", new AbortController().signal))
    .rejects.toMatchObject({ code: "request_body_too_large", retryable: false })
  expect(constructed).toBe(false)
  expect(send).not.toHaveBeenCalled()
})

it.each([
  [409, "idempotency_in_progress", true],
  [409, "idempotency_conflict", false],
  [409, "file_upload_aborted", false],
  [422, "library_file_infected", false],
  [408, "upload_http_408", true],
  [429, "upload_http_429", true],
  [500, "upload_http_500", true],
  [502, "upload_http_502", true],
  [503, "library_file_scan_pending", true],
  [504, "upload_http_504", true],
])("classifies %i %s as retryable=%s without inventing success", async (status, code, retryable) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code } }), { status })))
  const file = new File(["x"], "private.txt", { type: "text/plain" })
  await expect(uploadLibraryFile(file, "library-file:fixed", new AbortController().signal))
    .rejects.toMatchObject({ code, retryable, status } satisfies Partial<LibraryFileUploadError>)
})

it("rejects a non-CLEAN 200 receipt and keeps the same-key result uncertain", async () => {
  const file = new File(["x"], "private.txt", { type: "text/plain" })
  const invalid = clean(file)
  invalid.data.file.scan_state = "pending"
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(invalid), { status: 200 })))
  await expect(uploadLibraryFile(file, "library-file:fixed", new AbortController().signal))
    .rejects.toMatchObject({ code: "upload_invalid_response", retryable: true })
})
