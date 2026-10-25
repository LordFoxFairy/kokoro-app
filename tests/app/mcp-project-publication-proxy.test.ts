import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requestWithDomain } from "@/lib/server/upstream-http";
import { proxyMcpProjectPublication } from "@/lib/server/mcp-project-publication";
vi.mock("@/lib/server/upstream-http", async original => ({ ...await original<typeof import("@/lib/server/upstream-http")>(), requestWithDomain: vi.fn() }));
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }));
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));
const env = { KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9", KOKORO_WEB_ORIGIN: "http://localhost", KOKORO_DOMAIN: "dev.kokoro.localhost", KOKORO_BFF_BASE_URL: "http://bff.test" };
const input = { connector_id: "connector", expected_source_state_version: "2", targets: [{ project_id: "project", expected_pin: { absent: true } }] };
const revision = { revision_id: "revision", server_id: "server", connector_id: "connector", content_digest: "a".repeat(64), source_state_version: "2", display_name: "MCP", created_at: "2026-10-25T00:00:00Z" };
const ack = { revision, pins: [{ project_id: "project", pin_id: "pin", revision, state_version: "1", removed: false, updated_at: "2026-10-25T00:00:00Z", execution_ready: false }], replayed: false };
const path = ["mcp", "servers", "server", "project-publications"];
function request(body = JSON.stringify(input), origin = "http://localhost") { return new Request(`http://localhost/api/hub/${path.join("/")}`, { method: "POST", headers: { origin, "content-type": "application/json", "idempotency-key": "original-key", "x-kokoro-subject": "untrusted-body-actor" }, body }); }
const upstream = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store", "x-request-id": "owner-request", "content-type": "application/json" } });
beforeEach(() => { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); currentProductSession.mockResolvedValue({ access: "fixture-access", accessExpiresAt: Date.now() + 60000 }); vi.mocked(requestWithDomain).mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("thin same-origin adapter uses private owner route and preserves body/key without forwarding spoofed identity", async () => {
 vi.mocked(requestWithDomain).mockResolvedValue(upstream({ data: ack })); const result = await proxyMcpProjectPublication(request(), path); expect(result.status).toBe(200);
 expect(requestWithDomain).toHaveBeenCalledOnce(); const [url, domain, options] = vi.mocked(requestWithDomain).mock.calls[0]!;
 expect(url).toBe("http://bff.test/browser/v1/mcp/servers/server/project-publications"); expect(domain).toBe("dev.kokoro.localhost");
 const headers = new Headers(options.headers); expect(headers.get("idempotency-key")).toBe("original-key"); expect(headers.get("x-kokoro-subject")).toBeNull(); expect(headers.get("authorization")).toBe("Bearer fixture-access"); expect(new TextDecoder().decode(options.body as ArrayBuffer)).toBe(JSON.stringify(input));
});
it.each([['{"connector_id":"connector","connector_id":"other","expected_source_state_version":"2","targets":[]}', "http://localhost"], [JSON.stringify({ ...input, subject: "actor" }), "http://localhost"], [JSON.stringify(input), "https://outside.invalid"]])("rejects duplicate/extra identity/cross-origin before upstream", async (body, origin) => {
 const result = await proxyMcpProjectPublication(request(body, origin), path); expect([400, 403]).toContain(result.status); expect(requestWithDomain).not.toHaveBeenCalled();
});
it("read receipt does not become a replay POST and binds the original identity", async () => {
 vi.mocked(requestWithDomain).mockResolvedValue(upstream({ data: { publication: { ...ack, replayed: true } } }));
 const result = await proxyMcpProjectPublication(new Request("http://localhost/api/hub/mcp/project-publication-receipts", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "idempotency-key": "original-key" }, body: JSON.stringify({ publication: { ...input, server_id: "server" } }) }), ["mcp", "project-publication-receipts"]);
 expect(result.status).toBe(200); expect(requestWithDomain).toHaveBeenCalledOnce(); expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe("http://bff.test/browser/v1/mcp/project-publication-receipts");
});
it("does not relay an ACK with a different project or execution-ready assertion", async () => {
 vi.mocked(requestWithDomain).mockResolvedValue(upstream({ data: { ...ack, pins: [{ ...ack.pins[0], execution_ready: true }] } })); expect((await proxyMcpProjectPublication(request(), path)).status).toBe(502);
});
it("rejects mismatched owner error tuple instead of authorizing retry", async () => {
 vi.mocked(requestWithDomain).mockResolvedValue(upstream({ error: { code: "mcp_project_publication_in_progress", message: "pending", retryable: false } }, 409)); expect((await proxyMcpProjectPublication(request(), path)).status).toBe(502);
});
