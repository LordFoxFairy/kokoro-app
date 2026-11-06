import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"

import { GET, POST, PATCH, DELETE } from "@/app/api/hub/[...path]/route"
import { POST as sessionPost } from "@/app/api/session/[...path]/route"

const projectId = "project_11111111-1111-4111-8111-111111111111"
const taskId = "task_22222222-2222-4222-8222-222222222222"
const revision = `ptask_${"a".repeat(43)}`
const path = ["projects", projectId, "tasks"]
const base = `/api/hub/projects/${projectId}/tasks`
const owner = `/v1/projects/${projectId}/tasks`
const context = (suffix: string[] = []) => ({ params: Promise.resolve({ path: [...path, ...suffix] }) })
let calls: { method: string | undefined; url: string | undefined; headers: IncomingMessage["headers"]; body: string }[]
let mismatch = false

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  let body = ""
  request.setEncoding("utf8")
  request.on("data", chunk => { body += chunk })
  request.on("end", () => {
    calls.push({ method: request.method, url: request.url, headers: request.headers, body })
    const requestId = String(request.headers["x-kokoro-request-id"])
    const headers = { "cache-control": "no-store", "x-request-id": requestId }
    if (request.method === "DELETE") { response.writeHead(204, headers); response.end(); return }
    const data = request.method === "GET" ? { tasks: [] } : { id: taskId, project_id: mismatch ? "wrong-project" : projectId, revision }
    const result = JSON.stringify({ data, meta: { request_id: requestId } })
    response.writeHead(request.method === "POST" ? 201 : 200, {
      ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(result),
      ...(request.method === "POST" ? { location: `${owner}/${taskId}` } : {}),
    })
    response.end(result)
  })
})

const request = (method: string, suffix = "", body?: unknown, headers: Record<string, string> = {}) => new Request(`http://web.test${base}${suffix}`, {
  method, headers: {
    cookie: "kokoro-issuer.session_token=fixture", origin: "http://web.test",
    ...(method === "GET" ? {} : { "idempotency-key": "fixture-command" }),
    ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("fixture not listening")
  vi.stubEnv("KOKORO_BFF_BASE_URL", `http://127.0.0.1:${address.port}`)
  vi.stubEnv("KOKORO_WEB_ORIGIN", "http://web.test")
  vi.stubEnv("KOKORO_DOMAIN", "configured.product.test")
  vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "fixture-web-service")
})
beforeEach(() => { calls = []; mismatch = false })
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs() })

it("bridges exact conditional task writes and rebuilds the canonical same-origin creation Location", async () => {
  const created = await POST(request("POST", "", { title: "Task" }, { authorization: "Bearer forged", "x-kokoro-subject": "forged" }), context())
  expect(created.status).toBe(201)
  expect(created.headers.get("location")).toBe(`${base}/${taskId}`)
  expect((await created.json()).data).toEqual({ id: taskId, project_id: projectId, revision })
  expect(calls[0]?.url).toBe(owner)
  expect(calls[0]?.headers.cookie).toBe("kokoro-issuer.session_token=fixture")
  expect(calls[0]?.headers.authorization).toBeUndefined()
  expect(calls[0]?.headers["x-kokoro-subject"]).toBeUndefined()
  expect(calls[0]?.body).toBe('{"title":"Task"}')
  const updated = await PATCH(request("PATCH", `/${taskId}`, { status: "done" }, { "if-match": `"${revision}"` }), context([taskId]))
  expect(updated.status).toBe(200)
  expect(calls[1]?.headers["if-match"]).toBe(`"${revision}"`)
  const removed = await DELETE(request("DELETE", `/${taskId}`, undefined, { "if-match": `"${revision}"` }), context([taskId]))
  expect(removed.status).toBe(204)
  expect(removed.body).toBeNull()
  expect(calls[2]?.body).toBe("")
})

it("rejects the Session bypass, Hub self alias and missing precondition before touching the owner", async () => {
  const sessionRequest = new Request(`http://web.test/api/session${owner.slice(3)}`, {
    method: "POST", headers: { origin: "http://web.test", "content-type": "application/json" }, body: '{"title":"Task"}',
  })
  expect((await sessionPost(sessionRequest, context())).status).toBe(404)
  const alias = ["self", ...path]
  expect((await POST(new Request(`http://web.test/api/hub/self${owner.slice(3)}`, { method: "POST" }), { params: Promise.resolve({ path: alias }) })).status).toBe(404)
  expect((await PATCH(request("PATCH", `/${taskId}`, { status: "done" }), context([taskId]))).status).toBe(428)
  expect(calls).toEqual([])
})

it("accepts Next's empty DELETE stream but rejects hidden bytes before contacting the owner", async () => {
  const deleteStream = (payload?: Uint8Array<ArrayBuffer>) => new Request(`http://web.test${base}/${taskId}`, {
    method: "DELETE", headers: request("DELETE", `/${taskId}`, undefined, { "if-match": `"${revision}"` }).headers,
    body: new ReadableStream({ start(controller) { if (payload) controller.enqueue(payload); controller.close() } }),
    duplex: "half",
  } as RequestInit)
  const removed = await DELETE(deleteStream(), context([taskId]))
  expect(removed.status).toBe(204)
  expect(calls.map(call => call.body)).toEqual([""])
  expect((await DELETE(deleteStream(new Uint8Array([1])), context([taskId]))).status).toBe(400)
  expect(calls).toHaveLength(1)
})

it("rejects a successful owner response bound to another project", async () => {
  mismatch = true
  expect((await POST(request("POST", "", { title: "Task" }), context())).status).toBe(502)
  expect(calls).toHaveLength(1)
  const listed = await GET(request("GET"), context())
  expect(listed.status).toBe(200)
  expect((await listed.json()).data.tasks).toEqual([])
})
