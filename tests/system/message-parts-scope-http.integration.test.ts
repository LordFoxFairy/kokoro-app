// Real browser client + same-origin adapter + Node HTTP owner contract fixture.
// Authentication/owner are fixtures; this is not a production BFF/PG acceptance claim.
import { createServer, type Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/server/product-session", () => ({ currentProductSession: vi.fn(async () => ({ access: "fixture-product-access", accessExpiresAt: Date.now() + 60_000 })) }))
import { GET } from "@/app/api/session/[...path]/route"
import { createSessionClient } from "@/engine/client"
import { fetchCompleteSnapshot } from "@/engine/hydrate-process"
import { readMessageParts } from "@/engine/message-parts-reader"
import type { SessionScope } from "@/engine/session-scope"

const originalEnv = { ...process.env }
let owner: Server
const observed: string[] = []
beforeAll(async () => {
  owner = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://owner.test")
    observed.push(url.pathname + url.search)
    const sessionId = url.pathname.split("/")[3] ?? ""
    const expected = sessionId === "session-project" ? "project:p" : "direct"
    const scope = url.searchParams.get("scope") === "direct" ? "direct" : url.searchParams.has("project_ref") ? `project:${url.searchParams.get("project_ref")}` : "all"
    const cursor = `opaque-bound-${scope}`
    const send = (status: number, data: unknown) => {
      const body = JSON.stringify(status === 200 ? { data, meta: { request_id: "scope-http" } } : { error: { code: "invalid_cursor", message: "invalid_cursor" }, meta: { request_id: "scope-http" } })
      response.writeHead(status, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), "cache-control": "no-store", "x-request-id": "scope-http" }); response.end(body)
    }
    if (url.pathname.endsWith("/parts")) {
      if (scope !== expected || url.searchParams.get("cursor") !== cursor) return send(400, null)
      return send(200, { session_id: sessionId, message_id: "message", run_id: "run", format_version: 1, revision: "0", event_watermark: null, items: [], next_cursor: null })
    }
    send(200, { session: { session_id: sessionId, title: "Scope fixture", owner_id: "fixture", created_at: "now", updated_at: "now" }, messages: [{ message_id: "message", run_id: "run", role: "assistant", content: null, status: "completed", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "0", event_watermark: null, parts_cursor: cursor } }], execution_process: null, files: [], deliveries: [], deliveries_has_more: false, event_watermark: null })
  })
  await new Promise<void>((resolve) => owner.listen(0, "127.0.0.1", resolve))
  const address = owner.address()
  if (!address || typeof address === "string") throw new Error("fixture did not bind")
  Object.assign(process.env, { KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9", KOKORO_WEB_ORIGIN: "http://app.test", KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`, KOKORO_DOMAIN: "fixture.kokoro.localhost", KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-secret" })
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://app.test")
    const path = url.pathname.slice("/api/session/".length).split("/").map(decodeURIComponent)
    return GET(new Request(url, init), { params: Promise.resolve({ path }) })
  })
})
afterAll(async () => {
  vi.unstubAllGlobals()
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  owner.closeAllConnections()
  await new Promise<void>((resolve, reject) => owner.close((error) => error ? reject(error) : resolve()))
})
describe("exact private snapshot/parts scope over HTTP", () => {
  it.each<SessionScope>([{ kind: "direct" }, { kind: "project", projectRef: "p" }])("keeps $kind snapshot cursor and all parts requests in the same explicit scope", async (scope) => {
    const client = createSessionClient({ baseUrl: "/api/session" }), signal = new AbortController().signal
    const sessionId = scope.kind === "direct" ? "session-direct" : "session-project"
    const snapshot = await fetchCompleteSnapshot(client, sessionId, scope, signal, performance.now() + 10_000)
    const message = snapshot?.messages?.[0]
    if (!message || !("rendering" in message)) throw new Error("ordered fixture missing")
    await expect(readMessageParts({ client, sessionId, messageId: message.message_id, runId: message.run_id, cursor: message.rendering.parts_cursor, scope, signal })).resolves.toMatchObject({ message_id: "message", items: [] })
    const expected = scope.kind === "direct" ? "scope=direct" : "project_ref=p"
    expect(observed.at(-2)).toContain(expected); expect(observed.at(-1)).toContain(expected)
  })
  it("rejects a cursor issued to all rather than silently downgrading an explicit direct read", async () => {
    const response = await GET(new Request("http://app.test/api/session/sessions/session-direct"), { params: Promise.resolve({ path: ["sessions", "session-direct"] }) })
    const raw = await response.json() as { messages: { rendering: { parts_cursor: string } }[] }
    const client = createSessionClient({ baseUrl: "/api/session" })
    await expect(client.fetchMessageParts({ sessionId: "session-direct", messageId: "message", cursor: raw.messages[0]!.rendering.parts_cursor, scope: { kind: "direct" }, signal: new AbortController().signal })).rejects.toMatchObject({ status: 400, code: "invalid_cursor" })
  })
})
