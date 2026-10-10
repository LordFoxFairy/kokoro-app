import { afterEach, expect, it, vi } from "vitest"
import { putSkillPackage } from "@/hub/skill-package-transfer"
const reference = { url: "https://objects.example/put?signature=TOKEN", method: "PUT" as const, required_headers: { "content-type": "application/zip", "x-amz-meta-import": "signed" }, expires_at: "2999-01-01T00:00:00Z" }
const file = new File(["zip"], "mine.skill")
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it("sends exactly signed required headers without session credentials and cancels unused ACK body", async () => {
  const cancel = vi.fn()
  const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "x-amz-version-id": "real-version" } }))
  vi.stubGlobal("fetch", fetchMock)
  await expect(putSkillPackage(reference, file, "https://app.example", 20_000)).resolves.toEqual({ source_version_id: "real-version" })
  expect(fetchMock).toHaveBeenCalledWith(reference.url, expect.objectContaining({ headers: reference.required_headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", mode: "cors" }))
  expect(cancel).toHaveBeenCalledOnce()
})
it.each([undefined, "", "a".repeat(1025), "bad\nversion"])("rejects missing or invalid real version %s", async (version) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { headers: version === undefined ? {} : { "x-amz-version-id": version.replace(/\n/gu, "\t") } })))
  await expect(putSkillPackage(reference, file, "https://app.example", 20_000)).rejects.toMatchObject({ reason: "parse" })
})
it.each(["authorization", "cookie", "host"])("rejects credential or forbidden signed header %s before IO", async (header) => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
  await expect(putSkillPackage({ ...reference, required_headers: { [header]: "secret" } }, file, "https://app.example", 20_000)).rejects.toMatchObject({ reason: "parse" })
  expect(fetchMock).not.toHaveBeenCalled()
})
it.each([20_000, 60_000] as const)("bounds even abort-ignoring fetch at %i and cancels late ACK", async (budget) => {
  vi.useFakeTimers()
  let finish!: (response: Response) => void
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve })))
  const result = putSkillPackage(reference, file, "https://app.example", budget)
  const assertion = expect(result).rejects.toMatchObject({ reason: "network" })
  await vi.advanceTimersByTimeAsync(budget)
  await assertion
  const cancel = vi.fn()
  finish(new Response(new ReadableStream({ cancel }), { headers: { "x-amz-version-id": "late" } }))
  await Promise.resolve(); await Promise.resolve()
  expect(cancel).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
it("caller cancellation settles an abort-ignoring transfer and cleans late ACK", async () => {
  const controller = new AbortController()
  let finish!: (response: Response) => void
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve })))
  const result = putSkillPackage(reference, file, "https://app.example", 20_000, controller.signal)
  controller.abort()
  await expect(result).rejects.toMatchObject({ reason: "aborted" })
  const cancel = vi.fn(); finish(new Response(new ReadableStream({ cancel })))
  await Promise.resolve(); await Promise.resolve()
  expect(cancel).toHaveBeenCalledOnce()
})
