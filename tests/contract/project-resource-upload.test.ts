import { afterEach, describe, expect, it, vi } from "vitest"

import { ProjectResourceUploadError, uploadProjectResource } from "@/features/app/project-resource-upload"

const cleanReceipt = (file: File) => ({
  data: { resources: [{
    upload_id: "upload-1",
    asset_id: "asset-1",
    filename: file.name,
    mime_type: file.type,
    size_bytes: String(file.size),
    content_sha256: "a".repeat(64),
    scan_state: "clean",
  }] },
  meta: { request_id: "req-1" },
})

afterEach(() => vi.unstubAllGlobals())

describe("project resource browser mutation", () => {
  it("sends exactly one file and the caller-owned stable key, then accepts one clean receipt", async () => {
    const file = new File(["hello"], "one.txt", { type: "text/plain" })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(cleanReceipt(file)), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await uploadProjectResource("project /1", file, "project-resource:fixed")).toEqual({
      assetId: "asset-1", filename: "one.txt", mimeType: "text/plain", sizeBytes: "5",
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/hub/projects/project%20%2F1/resources")
    expect(init.headers).toEqual({ "Idempotency-Key": "project-resource:fixed" })
    expect(init.body).toBeInstanceOf(FormData)
    expect(Array.from((init.body as FormData).entries())).toEqual([["files", file]])
  })

  it("does not turn a 200 with a missing, pending, or mismatched receipt into UI success", async () => {
    const file = new File(["hello"], "one.txt", { type: "text/plain" })
    for (const malformed of [
      { ...cleanReceipt(file), data: { resources: [] } },
      { ...cleanReceipt(file), data: { resources: [{ ...cleanReceipt(file).data.resources[0], scan_state: "pending" }] } },
      { ...cleanReceipt(file), data: { resources: [{ ...cleanReceipt(file).data.resources[0], filename: "other.txt" }] } },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 })))
      await expect(uploadProjectResource("p1", file, "fixed")).rejects.toBeInstanceOf(ProjectResourceUploadError)
    }
  })

  it("retries only recoverable owner 409, not conflict, aborted, or unknown 409", async () => {
    const file = new File(["hello"], "one.txt", { type: "text/plain" })
    for (const [code, retryable] of [
      ["idempotency_in_progress", true],
      ["idempotency_conflict", false],
      ["resource_upload_aborted", false],
      ["future_409", false],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code } }), { status: 409 })))
      await expect(uploadProjectResource("p1", file, "fixed")).rejects.toMatchObject({ code, retryable, status: 409 })
    }
  })

  it("classifies scan-pending as retryable and infected as terminal, without issuing a new key", async () => {
    const file = new File(["hello"], "one.txt", { type: "text/plain" })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "resource_scan_pending" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "resource_file_infected" } }), { status: 422 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(uploadProjectResource("p1", file, "fixed")).rejects.toMatchObject({ retryable: true, code: "resource_scan_pending" })
    await expect(uploadProjectResource("p1", file, "fixed")).rejects.toMatchObject({ retryable: false, code: "resource_file_infected" })
    expect(fetchMock.mock.calls.map((call: unknown[]) => ((call[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"])).toEqual(["fixed", "fixed"])
  })
})
