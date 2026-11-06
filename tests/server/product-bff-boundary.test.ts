import { afterEach, beforeEach, expect, it, vi } from "vitest"
const { upstream, fetchUpstream } = vi.hoisted(() => ({ upstream: vi.fn(), fetchUpstream: vi.fn() }))
vi.mock("@/lib/server/upstream-http", async original => ({ ...(await original<typeof import("@/lib/server/upstream-http")>()), requestWithDomain: upstream, fetchWithDomain: fetchUpstream }))
import { readAccountProfile } from "@/lib/server/account-profile"
beforeEach(() => {
  vi.stubEnv("KOKORO_BFF_BASE_URL", "https://bff.test"); vi.stubEnv("KOKORO_DOMAIN", "web.test"); vi.stubEnv("KOKORO_WEB_ORIGIN", "https://web.test"); vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "fixture")
  upstream.mockReset()
  fetchUpstream.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
it("business adapter makes exactly one authenticated BFF request, without a Web principal or pre/post session probes", async () => {
  const body = { data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true } }
  upstream.mockImplementation(async (_url, _domain, init) => Response.json(body, { headers: { "x-request-id": init.headers.get("x-kokoro-request-id"), "cache-control": "no-store" } }))
  const response = await readAccountProfile(new Request("https://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=current; other=private", "x-kokoro-actor-id": "attacker" } }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(body)
  expect(upstream).toHaveBeenCalledOnce()
  expect(upstream.mock.calls[0]![0]).toBe("https://bff.test/v1/account/profile")
  expect(upstream.mock.calls[0]![2].headers.get("cookie")).toBe("kokoro-issuer.session_token=current")
  expect(upstream.mock.calls[0]![2].headers.get("x-kokoro-actor-id")).toBeNull()
})


const cookieBoundaries = [
  { name: "Agent setup", method: "GET", path: "/api/agents/connections/setup?platform=telegram", code: "invalid_browser_cookie", call: async (request: Request) => (await import("@/app/api/agents/[...path]/route")).GET(request, { params: Promise.resolve({ path: ["connections", "setup"] }) }) },
  { name: "Billing plans", method: "GET", path: "/api/billing/plans", code: "invalid_browser_cookie", call: async (request: Request) => (await import("@/app/api/billing/plans/route")).GET(request) },
  { name: "Billing checkout", method: "POST", path: "/api/billing/checkout", body: { plan_id: "plan-1" }, code: "invalid_browser_cookie", call: async (request: Request) => (await import("@/app/api/billing/checkout/route")).POST(request) },
  { name: "Admin ordinary", method: "GET", path: "/api/admin/skills", code: "invalid_admin_request", call: async (request: Request) => (await import("@/app/api/admin/[...path]/route")).GET(request, { params: Promise.resolve({ path: ["skills"] }) }) },
  { name: "Admin discovery", method: "GET", path: "/api/admin/model-providers/11111111-1111-4111-8111-111111111111/upstream-models", code: "invalid_admin_request", call: async (request: Request) => (await import("@/app/api/admin/[...path]/route")).GET(request, { params: Promise.resolve({ path: ["model-providers", "11111111-1111-4111-8111-111111111111", "upstream-models"] }) }) },
  { name: "Hub generic", method: "GET", path: "/api/hub/projects", code: "invalid_browser_cookie", call: async (request: Request) => (await import("@/app/api/hub/[...path]/route")).GET(request, { params: Promise.resolve({ path: ["projects"] }) }) },
  { name: "Scheduled", method: "GET", path: "/api/scheduled-tasks", code: "invalid_browser_cookie", call: async (request: Request) => (await import("@/app/api/scheduled-tasks/[[...path]]/route")).GET(request, { params: Promise.resolve({ path: [] }) }) },
  { name: "Skill download RPC", method: "POST", path: "/api/skill.v1.SkillService/DownloadSkill", body: {}, code: "invalid_skill_request", call: async (request: Request) => (await import("@/app/api/skill.v1.SkillService/DownloadSkill/route")).POST(request) },
  { name: "Skill optional RPC", method: "POST", path: "/api/skill.v1.SkillOptionalService/GetSkill", body: {}, code: "invalid_skill_request", call: async (request: Request) => (await import("@/app/api/skill.v1.SkillOptionalService/[operation]/route")).POST(request, { params: Promise.resolve({ operation: "GetSkill" }) }) },
]
it.each(cookieBoundaries)("$name rejects an ambiguous native cookie as a no-store request error before any BFF I/O", async boundary => {
  const body = "body" in boundary ? JSON.stringify(boundary.body) : undefined
  const request = new Request(`https://web.test${boundary.path}`, {
    method: boundary.method,
    headers: {
      host: "web.test", origin: "https://web.test", cookie: "kokoro-issuer.session_token=first; kokoro-issuer.session_token=second",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body }),
  })
  const response = await boundary.call(request)
  expect(response.status).toBe(400)
  expect(response.headers.get("cache-control")).toContain("no-store")
  const value = await response.json()
  expect(typeof value.error === "string" ? value.error : value.error.code).toBe(boundary.code)
  expect(upstream).not.toHaveBeenCalled()
  expect(fetchUpstream).not.toHaveBeenCalled()
})
