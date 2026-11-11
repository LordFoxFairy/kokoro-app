import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { GET, PUT } from "@/app/api/hub/[...path]/route"

const project = "project_11111111-1111-4111-8111-111111111111"
const path = ["projects", project, "websites"]
const url = "http://web.test/api/hub/" + path.join("/")
const cookie = "kokoro-issuer.session_token=fixture"
const context = (segments = path) => ({ params: Promise.resolve({ path: segments }) })
const put = (body: string, headers: HeadersInit = {}) => new Request(url, {
  method: "PUT", headers: { cookie, origin: "http://web.test", "content-type": "application/json", ...headers }, body,
})
const canonical = "https://example.test/"
const reply = (req: IncomingMessage, res: ServerResponse, value: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": String(req.headers["x-kokoro-request-id"]) })
  res.end(JSON.stringify(value))
}

let server: Server
let hits: { req: IncomingMessage; bytes: string }[]
let peer: (req: IncomingMessage, res: ServerResponse) => void
beforeEach(async () => {
  hits = []
  peer = (req, res) => reply(req, res, { data: { project_id: project, websites: [canonical], state_version: "2" } })
  server = createServer((req, res) => {
    let bytes = ""
    req.setEncoding("utf8")
    req.on("data", part => { bytes += part })
    req.on("end", () => { hits.push({ req, bytes }); peer(req, res) })
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("loopback fixture failed to bind")
  vi.stubEnv("KOKORO_WEB_ORIGIN", "http://web.test")
  vi.stubEnv("KOKORO_DOMAIN", "product.test")
  vi.stubEnv("KOKORO_BFF_BASE_URL", `http://127.0.0.1:${address.port}`)
  vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "fixture")
})
afterEach(async () => {
  vi.unstubAllEnvs()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

it("the exact website adapter forwards only trusted credentials and original PUT bytes, preserving a correlated 412", async () => {
  const raw = ' {"websites":["HTTPS://EXAMPLE.TEST"],"expected_state_version":"1"}\n'
  const accepted = await PUT(put(raw, { "x-kokoro-subject": "spoofed", authorization: "Bearer fixture" }), context())
  expect(accepted.status).toBe(200)
  expect(await accepted.json()).toEqual({ data: { project_id: project, websites: [canonical], state_version: "2" } })
  expect(hits[0]?.req.url).toBe(`/v1/projects/${project}/websites`)
  expect(hits[0]?.bytes).toBe(raw)
  expect(hits[0]?.req.headers).toMatchObject({ cookie, origin: "http://web.test" })
  expect(hits[0]?.req.headers).not.toHaveProperty("authorization")
  expect(hits[0]?.req.headers).not.toHaveProperty("x-kokoro-subject")

  peer = (req, res) => reply(req, res, { error: { code: "project_websites_precondition_failed", message: "changed" }, meta: { request_id: req.headers["x-kokoro-request-id"] } }, 412)
  const stale = await PUT(put(raw), context())
  expect(stale.status).toBe(412)
  expect(await stale.json()).toMatchObject({ meta: { request_id: stale.headers.get("x-request-id") } })
})

it("aliases, foreign origin, command headers and canonical URL duplicates never reach the owner; wrong Project never returns state", async () => {
  const body = JSON.stringify({ websites: [canonical], expected_state_version: "1" })
  expect((await GET(new Request(`${url}?`, { headers: { cookie } }), context())).status).toBe(400)
  const alias = ["self", ...path]
  expect((await GET(new Request(`http://web.test/api/hub/${alias.join("/")}`, { headers: { cookie } }), context(alias))).status).toBe(404)
  expect((await PUT(put(body, { origin: "http://other.test" }), context())).status).toBe(403)
  expect((await PUT(put(body, { "if-match": "1" }), context())).status).toBe(400)
  expect((await PUT(put(JSON.stringify({ websites: [canonical, "HTTPS://EXAMPLE.TEST"], expected_state_version: "1" })), context())).status).toBe(400)
  expect(hits).toHaveLength(0)
  peer = (req, res) => reply(req, res, { data: { project_id: "project_22222222-2222-4222-8222-222222222222", websites: [], state_version: "1" } })
  const wrong = await GET(new Request(url, { headers: { cookie } }), context())
  expect(wrong.status).toBe(502)
  expect(hits.map(hit => hit.req.method)).toEqual(["GET"])
})
