import { restoreRunHistoryParent } from "./bff-run-history-parent"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { NextRequest } from "next/server"
import YAML from "yaml"
import { afterEach, expect, it, vi } from "vitest"
import { downloadProjectResource } from "@/features/app/project-resource-download"
import { proxy } from "@/proxy"

const intent = { projectRef: "project-a", assetId: "asset-1", filename: "private.txt", mimeType: "text/plain", sizeBytes: "3",
  contentSha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" }
function response(body: BodyInit = "abc", overrides?: HeadersInit, status = 200) {
  return new Response(body, { status, headers: {
    "content-type": "text/plain", "content-length": "3", "content-disposition": "attachment; filename=\"private.txt\"; filename*=UTF-8''private.txt",
    "cache-control": "private, no-store, max-age=0", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-request-id": "req-download",
    ...Object.fromEntries(new Headers(overrides)),
  } })
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it("I3 pins formal19.1 and inverses only its single operation and version into complete formal19.0 bytes", async () => {
  const bytes = restoreRunHistoryParent(await readFile("src/generated/bff-public-openapi.yaml"))
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("ac649109f7b394ab894d17352c5f9f106e24e1cbf94e74672569333190adfab5")
  const spec = YAML.parse(bytes.toString())
  expect(spec.info.version).toBe("19.1.0")
  expect(spec.paths["/v1/projects/{projectId}/resources/{asset_id}/content"].get).toMatchObject({ operationId: "downloadProjectResource", "x-kokoro-idempotency": "none", responses: { "200": { content: { "*/*": { schema: { type: "string", format: "binary" } } } } } })
  const operations = Object.values(spec.paths).flatMap(path => Object.keys(path as object).filter(key => ["get", "post", "put", "patch", "delete", "head", "options"].includes(key)))
  expect(operations).toHaveLength(166)
  const prior = bytes.toString().replace(/^  \/v1\/projects\/\{projectId\}\/resources\/\{asset_id\}\/content:\n[\s\S]*?(?=^  \/|^components:)/mu, "").replace("  version: 19.1.0\n", "  version: 19.0.0\n")
  expect(createHash("sha256").update(prior).digest("hex")).toBe("955412b680bf7a2529c4c35f553ff272d7361769ea95bb441ba820b552ffc564")
})
it("I3 actual global Proxy final headers remain consumable by the real binary client", async () => {
  const result = await proxy(new NextRequest("http://localhost/api/hub/projects/project-a/resources/asset-1/content"))
  const actual = response()
  result.headers.forEach((value, name) => { if (!["x-middleware-next", "x-middleware-override-headers"].includes(name) && !name.startsWith("x-middleware-request-")) actual.headers.set(name, value) })
  expect(actual.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(actual))
  const blob = await downloadProjectResource(intent, new AbortController().signal)
  expect(blob.size).toBe(3)
  expect(blob.type).toBe("text/plain")
})
it.each([
  ["GET", "/api/hub/projects/project-a/resources/asset-1/content?x=1"],
  ["POST", "/api/hub/projects/project-a/resources/asset-1/content"],
  ["GET", "/api/hub/self/projects/project-a/resources/asset-1/content"],
  ["GET", "/api/hub/projects/project-a/resources/asset-1/content/"],
  ["GET", "/api/hub/projects/project-a/resources/asset-1"],
  ["GET", "/api/hub/%70rojects/project-a/resources/asset-1/content"],
  ["GET", "/api/hub/projects/project%2Fa/resources/asset-1/content"],
  ["GET", "/api/hub/projects/project%253Aa/resources/asset-1/content"],
  ["GET", "/api/hub/projects/project:a/resources/asset-1/content"],
])("I3 Proxy does not broaden project binary policy to %s %s", async (method, path) => {
  const result = await proxy(new NextRequest(`http://localhost${path}`, { method }))
  expect(result.headers.get("referrer-policy")).not.toBe("no-referrer")
})
it("I3 Proxy admits only standard component-encoded colon selectors", async () => {
  const result = await proxy(new NextRequest("http://localhost/api/hub/projects/project%3Aa/resources/asset%3Aone/content"))
  expect(result.headers.get("referrer-policy")).toBe("no-referrer")
})
it("I3 browser requests one exact bodyless GET with no browser-supplied credentials and no redirect following", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response())
  vi.stubGlobal("fetch", fetchMock)
  expect((await downloadProjectResource(intent, new AbortController().signal)).size).toBe(3)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/projects/project-a/resources/asset-1/content", { method: "GET", cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) })
})
it.each([
  ["cache-control", "no-store"], ["cache-control", "private, no-store"], ["cache-control", "private, no-store, max-age=1"],
  ["content-length", "2"], ["content-length", "4"], ["content-length", "1048577"], ["content-type", "image/png"],
  ["content-disposition", "attachment; filename=\"other.txt\"; filename*=UTF-8''other.txt"], ["set-cookie", "leak=1"],
  ["location", "/other"], ["content-encoding", "gzip"], ["referrer-policy", "origin"], ["x-content-type-options", "none"],
])("I3 browser rejects incorrect %s=%s before any verified Blob", async (key, value) => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response("abc", { [key]: value })))
  await expect(downloadProjectResource(intent, new AbortController().signal)).rejects.toThrow()
})
it.each(["", "private, no-store, max-age=0, public"])("I3 browser missing or noncanonical cache %j is rejected", async value => {
  const actual = response(); if (value) actual.headers.set("cache-control", value); else actual.headers.delete("cache-control")
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(actual))
  await expect(downloadProjectResource(intent, new AbortController().signal)).rejects.toThrow()
})
it.each(["ab", "abcd", "abd"])("I3 browser validates actual byte length and SHA at EOF for %j", async body => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response(body)))
  await expect(downloadProjectResource(intent, new AbortController().signal)).rejects.toThrow()
})
it.each([0, 1_048_576])("I3 browser accepts exactly %i bytes including real EOF and trusted SHA", async size => {
  const bytes = new Uint8Array(size)
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response(bytes, { "content-length": String(size) })))
  const blob = await downloadProjectResource({ ...intent, sizeBytes: String(size), contentSha256: createHash("sha256").update(bytes).digest("hex") }, new AbortController().signal)
  expect(blob.size).toBe(size)
})
it("I3 browser does not accept declared complete bytes before actual EOF and owns the full 40s budget", async () => {
  vi.useFakeTimers()
  const cancel = vi.fn(() => new Promise<void>(() => undefined))
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("abc")) }, cancel }))))
  const pending = downloadProjectResource(intent, new AbortController().signal)
  const assertion = expect(pending).rejects.toMatchObject({ code: "request_timeout" })
  await vi.advanceTimersByTimeAsync(40_001)
  await assertion
  expect(cancel).toHaveBeenCalledTimes(1)
})
it("I3 browser cancels a noncooperative fetch without automatic retry and disposes late bytes", async () => {
  let resolve!: (value: Response) => void
  const fetchMock = vi.fn<typeof fetch>(() => new Promise(yes => { resolve = yes }))
  vi.stubGlobal("fetch", fetchMock)
  const controller = new AbortController(), pending = downloadProjectResource(intent, controller.signal)
  const assertion = expect(pending).rejects.toMatchObject({ code: "request_aborted" })
  controller.abort(); await assertion
  const cancel = vi.fn()
  resolve(response(new ReadableStream({ cancel })))
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
