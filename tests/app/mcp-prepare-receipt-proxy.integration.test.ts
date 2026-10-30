import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }));
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));
import { GET, POST } from "@/app/api/hub/[...path]/route";
import { prepareReceiptFixture } from "../hub/fixtures/mcp-prepare-receipt";
const path = ["mcp", "servers", "receipt-server", "prepare-receipt"];
const context = (segments = path) => ({ params: Promise.resolve({ path: segments }) });
let server: Server, calls: IncomingMessage[], peer: (request: IncomingMessage, response: ServerResponse) => void;
const input = (query = "?expected_state_version=1", headers: Record<string, string> = {}, signal?: AbortSignal) => new Request(`http://web.test/api/hub/${path.join("/")}${query}`, { headers: { "idempotency-key": "original-key", ...headers }, ...(signal ? { signal } : {}) });
function json(response: ServerResponse, value: unknown, status = 200, extra: Record<string, string> = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { "content-type": "application/json", "content-length": String(bytes.length), "cache-control": "no-store", "x-request-id": "receipt-request", ...extra }); response.end(bytes);
}
beforeEach(async () => {
  calls = [];
  currentProductSession.mockReset().mockResolvedValue({ access: "fixture-admitted-access", accessExpiresAt: Date.now() + 60_000 });
  peer = (_request, response) => json(response, prepareReceiptFixture());
  server = createServer((request, response) => { calls.push(request); peer(request, response); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("fixture listener failed");
  for (const [key, value] of Object.entries({ KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9", KOKORO_WEB_ORIGIN: "http://web.test", KOKORO_DOMAIN: "configured.product.test", KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`, KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-service-secret" })) vi.stubEnv(key, value);
});
afterEach(async () => {
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

it("bridges only original GET/key/CAS through admitted Product Session and drops caller identities", async () => {
  const result = await GET(input(undefined, { authorization: "Bearer forged", "x-kokoro-subject": "forged", "x-kokoro-tenant-id": "forged", "x-custom": "forged" }), context());
  expect(result.status).toBe(200); expect(await result.json()).toEqual(prepareReceiptFixture());
  expect(calls).toHaveLength(1); expect(calls[0]!.method).toBe("GET");
  expect(calls[0]!.url).toBe("/browser/v1/mcp/servers/receipt-server/prepare-receipt?expected_state_version=1");
  expect(calls[0]!.headers["idempotency-key"]).toBe("original-key");
  expect(calls[0]!.headers.authorization).toBe("Bearer fixture-admitted-access");
  expect(calls[0]!.headers.forwarded).toBe("host=configured.product.test");
  for (const name of ["content-type", "content-length", "transfer-encoding", "x-kokoro-subject", "x-kokoro-tenant-id", "x-custom"]) expect(calls[0]!.headers[name]).toBeUndefined();
});

it.each(["", "?expected_state_version=1&expected_state_version=2", "?expected_state_version=0", "?expected_state_version=2147483648", "?expected_state_version=1&actor=forged"])("rejects malformed lookup query %s before admission/I/O", async query => {
  expect((await GET(input(query), context())).status).toBe(400); expect(calls).toHaveLength(0); expect(currentProductSession).not.toHaveBeenCalled();
});
it.each(["content-length", "transfer-encoding", "content-type"])("rejects %s GET framing before admission/I/O", async name => {
  expect((await GET(input(undefined, { [name]: name === "content-length" ? "0" : "arbitrary" }), context())).status).toBe(400); expect(calls).toHaveLength(0); expect(currentProductSession).not.toHaveBeenCalled();
});
it("requires the original key only for the exact lookup GET, never widens existing GET or accepts POST", async () => {
  const missing = input(); missing.headers.delete("idempotency-key");
  expect((await GET(missing, context())).status).toBe(400);
  expect((await GET(new Request("http://web.test/api/hub/mcp/servers/receipt-server", { headers: { "idempotency-key": "original-key" } }), context(path.slice(0, 3)))).status).toBe(400);
  expect((await POST(new Request(`http://web.test/api/hub/${path.join("/")}`, { method: "POST", headers: { origin: "http://web.test", "content-type": "application/json", "idempotency-key": "original-key" }, body: "{}" }), context())).status).toBe(405);
  expect(calls).toHaveLength(0);
});
it.each([[404, "mcp_personal_not_found", false], [412, "mcp_personal_command_replay_expired", false], [503, "mcp_personal_command_outcome_unknown", false]] as const)("preserves exact %i/%s only as an unresolved error, never retries", async (status, code, retryable) => {
  peer = (_request, response) => json(response, { error: { code, message: "Public QA error", retryable } }, status);
  const result = await GET(input(), context()); expect(result.status).toBe(status); expect(await result.json()).toMatchObject({ error: { code, retryable } }); expect(calls).toHaveLength(1);
});
it.each(["pending", "not_replayed", "wrong_server", "negative", "future410"] as const)("rejects %s rather than leaking a new negative ACK", async fault => {
  const value = prepareReceiptFixture();
  const invalid = fault === "pending" ? { data: { completed: { ...value.data.completed, server: { ...value.data.completed.server, prepare_status: "pending_prepare" } } } }
    : fault === "not_replayed" ? { data: { completed: { ...value.data.completed, replayed: false } } }
    : fault === "wrong_server" ? { data: { completed: { ...value.data.completed, server: { ...value.data.completed.server, server_id: "other" } } } }
    : fault === "future410" ? { error: { code: "future_negative", message: "PRIVATE_NEGATIVE", retryable: false, reason: "not_completed" } } : { data: { completed: null, reason: "PRIVATE_NEGATIVE" } };
  peer = (_request, response) => json(response, invalid, fault === "future410" ? 410 : 200);
  const result = await GET(input(), context()); expect(result.status).toBe(502); expect(await result.text()).not.toContain("PRIVATE_NEGATIVE"); expect(calls).toHaveLength(1);
});
it("uses the same absolute ten-second admission budget without sending a late owner request", async () => {
  const now = performance.now(), clock = vi.spyOn(performance, "now").mockReturnValue(now);
  currentProductSession.mockImplementation(async () => { clock.mockReturnValue(now + 10_001); return { access: "fixture-admitted-access", accessExpiresAt: Date.now() + 60_000 }; });
  expect((await GET(input(), context())).status).toBe(503); expect(calls).toHaveLength(0);
});

it("rejects foreign origin or absent admitted session without contacting owner", async () => {
  expect((await GET(input(undefined, { origin: "https://foreign.test" }), context())).status).toBe(403);
  expect(currentProductSession).not.toHaveBeenCalled();
  currentProductSession.mockResolvedValue(null);
  expect((await GET(input(), context())).status).toBe(401); expect(calls).toHaveLength(0);
});
it("rejects duplicate response keys through real HTTP instead of accepting the last completed", async () => {
  peer = (_request, response) => {
    const bytes = Buffer.from('{"data":null,' + JSON.stringify(prepareReceiptFixture()).slice(1));
    response.writeHead(200, { "content-type": "application/json", "content-length": String(bytes.length), "cache-control": "no-store", "x-request-id": "receipt-request" }); response.end(bytes);
  };
  expect((await GET(input(), context())).status).toBe(502); expect(calls).toHaveLength(1);
});


it.each([["POST",412,"mcp_personal_prepare_rejected",412],["GET",412,"mcp_personal_prepare_rejected",412],["GET",409,"mcp_personal_prepare_execution_fenced",409],["POST",409,"mcp_personal_prepare_execution_fenced",502]] as const)("real same-origin loopback %s preserves only method-specific %s", async (method,status,code,expected) => {
 peer=(_request,response)=>json(response,{error:{code,message:"QA outcome",retryable:false}},status);
 const segments=method==="POST"?["mcp","servers","receipt-server","prepare"]:path;
 const request=method==="POST"?new Request(`http://web.test/api/hub/${segments.join("/")}`,{method:"POST",headers:{origin:"http://web.test","content-type":"application/json","idempotency-key":"original-key"},body:JSON.stringify({expected_state_version:"1"})}):input();
 const response=await (method==="POST"?POST:GET)(request,context(segments));expect(response.status).toBe(expected);expect(calls).toHaveLength(1);
 expect(calls[0]?.method).toBe(method);expect(calls[0]?.headers["idempotency-key"]).toBe("original-key");
});
