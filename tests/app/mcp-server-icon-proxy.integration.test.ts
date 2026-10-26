import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }));
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));
import { GET, POST } from "@/app/api/hub/[...path]/route";

const segments = ["mcp", "servers", "saved-server", "icon"];
const context = (path = segments) => ({ params: Promise.resolve({ path }) });
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
let server: Server;
let calls: IncomingMessage[];
let peer: (request: IncomingMessage, response: ServerResponse) => void;
function input(headers: Record<string, string> = {}, suffix = "", signal?: AbortSignal) {
  return new Request(`http://web.test/api/hub/${segments.join("/")}${suffix}`, { headers, ...(signal ? { signal } : {}) });
}
function media(response: ServerResponse, overrides: Record<string, string> = {}, body = bytes) {
  response.writeHead(200, { "content-type": "image/png", "content-length": String(body.byteLength), "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": "owner-image-request", ...overrides });
  response.end(body);
}
beforeEach(async () => {
  calls = [];
  currentProductSession.mockReset().mockResolvedValue({ access: "admitted-access", accessExpiresAt: Date.now() + 60_000 });
  peer = (_request, response) => media(response);
  server = createServer((request, response) => { calls.push(request); peer(request, response); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("fixture server failed");
  for (const [key, value] of Object.entries({ KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9", KOKORO_WEB_ORIGIN: "http://web.test", KOKORO_DOMAIN: "configured.product.test", KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`, KOKORO_INTERNAL_SECRET_WEB_BFF: "configured-service-secret" })) vi.stubEnv(key, value);
});
afterEach(async () => {
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
it("returns only complete media from the exact private BFF route, with admitted identity and fixed domain", async () => {
  const result = await GET(input({ authorization: "Bearer forged", cookie: "secret=forged", forwarded: "host=forged.test", "x-kokoro-subject": "forged", "x-kokoro-tenant-id": "forged", "x-custom": "forged" }), context());
  expect(result.status).toBe(200);
  expect(Buffer.from(await result.arrayBuffer())).toEqual(bytes);
  expect(result.headers.get("content-type")).toBe("image/png");
  expect(result.headers.get("content-length")).toBe(String(bytes.byteLength));
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("/browser/v1/mcp/servers/saved-server/icon");
  expect(calls[0]!.headers.authorization).toBe("Bearer admitted-access");
  expect(calls[0]!.headers.forwarded).toBe("host=configured.product.test");
  expect(calls[0]!.headers.accept).toBe("image/png, image/jpeg");
  for (const name of ["cookie", "x-kokoro-subject", "x-kokoro-tenant-id", "x-custom", "content-type", "content-length", "idempotency-key"]) expect(calls[0]!.headers[name]).toBeUndefined();
});
it.each(["content-type", "content-length", "transfer-encoding", "content-encoding", "idempotency-key", "if-match", "if-none-match", "range", "if-range"])("rejects %s before admission and BFF I/O", async name => {
  expect((await GET(input({ [name]: name === "content-length" ? "0" : "arbitrary" }), context())).status).toBe(400);
  expect(currentProductSession).not.toHaveBeenCalled(); expect(calls).toHaveLength(0);
});
it("rejects query, malformed paths, body and non-GET rather than entering the generic adapter", async () => {
  expect((await GET(input({}, "?signed=url"), context())).status).toBe(400);
  expect((await GET(input(), context([...segments, "extra"]))).status).toBe(400);
  const body = new Request(`http://web.test/api/hub/${segments.join("/")}`, { method: "POST", body: "forged" });
  expect((await POST(body, context())).status).toBe(405);
  expect(calls).toHaveLength(0);
});
it("preserves absence of admission and foreign origin without making an image read", async () => {
  currentProductSession.mockResolvedValue(null);
  expect((await GET(input(), context())).status).toBe(401);
  expect((await GET(input({ origin: "https://foreign.invalid" }), context())).status).toBe(403);
  expect(calls).toHaveLength(0);
});
it.each([
  { "content-type": "image/webp" }, { "cache-control": "public" }, { "x-content-type-options": "" },
  { "referrer-policy": "unsafe-url" }, { "content-length": "0" }, { "location": "https://foreign.invalid" },
  { "set-cookie": "secret=upstream" },
])("rejects invalid media response headers %j", async overrides => {
  peer = (_request, response) => media(response, overrides as Record<string, string>);
  const result = await GET(input(), context()); expect(result.status).toBe(502);
  expect(result.headers.get("location")).toBeNull(); expect(result.headers.get("set-cookie")).toBeNull();
});
it("does not follow a redirect or leak its headers/body", async () => {
  peer = (_request, response) => { response.writeHead(302, { location: "https://foreign.invalid/token", "set-cookie": "secret=upstream" }); response.end("private"); };
  const result = await GET(input(), context()); expect(result.status).toBe(502);
  expect(result.headers.get("location")).toBeNull(); expect(await result.text()).not.toContain("private"); expect(calls).toHaveLength(1);
});
it("enforces the 1 MiB bound before exposing any successful bytes", async () => {
  peer = (_request, response) => media(response, {}, Buffer.alloc(1_048_577));
  const result = await GET(input(), context()); expect(result.status).not.toBe(200); expect((await result.text()).length).toBeLessThan(1000);
});
it("does not expose truncated image bodies as success", async () => {
  peer = (_request, response) => { response.writeHead(200, { "content-type": "image/png", "content-length": String(bytes.byteLength + 1), "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": "owner-image-request" }); response.write(bytes); setTimeout(() => response.socket?.destroy(), 5); };
  expect((await GET(input(), context())).status).not.toBe(200);
});
it("cancels a partially received image without exposing successful bytes", async () => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let closed!: () => void;
  const close = new Promise<void>(resolve => { closed = resolve; });
  peer = (_request, response) => { response.once("close", closed); response.writeHead(200, { "content-type": "image/png", "content-length": String(bytes.byteLength), "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": "owner-image-request" }); response.write(bytes.subarray(0, 4)); started(); };
  const controller = new AbortController(); const pending = GET(input({}, "", controller.signal), context());
  await ready; controller.abort(); expect((await pending).status).toBe(503); await close;
});
it("does not issue a late BFF request after admission consumes the absolute budget", async () => {
  const now = performance.now(); const clock = vi.spyOn(performance, "now").mockReturnValue(now);
  currentProductSession.mockImplementation(async () => { clock.mockReturnValue(now + 10_001); return { access: "admitted-access", accessExpiresAt: Date.now() + 60_000 }; });
  expect((await GET(input(), context())).status).toBe(503); expect(calls).toHaveLength(0);
});
it("bounds an unresponsive session admission to the same ten-second budget", async () => {
  vi.useFakeTimers(); currentProductSession.mockImplementation(() => new Promise(() => undefined));
  const pending = GET(input(), context()); await vi.advanceTimersByTimeAsync(10_000);
  expect((await pending).status).toBe(503); expect(calls).toHaveLength(0);
});

it("accepts exactly 1 MiB complete bytes and only exposes the allowed media headers", async () => {
  const boundary = Buffer.alloc(1_048_576);
  peer = (_request, response) => media(response, { "x-upstream-secret": "hidden", "etag": "not-a-client-cache" }, boundary);
  const result = await GET(input(), context());
  expect(result.status).toBe(200); expect((await result.arrayBuffer()).byteLength).toBe(boundary.byteLength);
  expect(result.headers.get("x-upstream-secret")).toBeNull(); expect(result.headers.get("etag")).toBeNull();
});
it("rejects a missing declared length even if the binary stream reaches EOF", async () => {
  peer = (_request, response) => { response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": "owner-image-request" }); response.write(bytes); response.end(); };
  expect((await GET(input(), context())).status).toBe(502);
});
it("keeps admission and binary EOF inside one absolute budget", async () => {
  const now = performance.now(), clock = vi.spyOn(performance, "now").mockReturnValue(now);
  peer = (_request, response) => {
    response.writeHead(200, { "content-type": "image/png", "content-length": String(bytes.byteLength), "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": "owner-image-request" });
    response.write(bytes.subarray(0, 4));
    setTimeout(() => { clock.mockReturnValue(now + 10_001); response.end(bytes.subarray(4)); }, 5);
  };
  expect((await GET(input(), context())).status).toBe(503);
});
it("does not start admission or a BFF request after caller cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  expect((await GET(input({}, "", controller.signal), context())).status).toBe(503);
  expect(currentProductSession).not.toHaveBeenCalled(); expect(calls).toHaveLength(0);
});

const tuples = (await import("@/generated/bff-mcp-server-icon")).MCP_SERVER_ICON_POLICY.errors;
it.each(tuples)("consumes exactly the frozen private media error tuple $status/$code without a retry", async tuple => {
  const error = { error: { code: tuple.code, message: "Owner-defined failure", retryable: tuple.retryable } };
  peer = (_request, response) => { response.writeHead(tuple.status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner-error", ...(tuple.status === 429 ? { "retry-after": "5" } : {}) }); response.end(JSON.stringify(error)); };
  const result = await GET(input(), context());
  expect(result.status).toBe(tuple.status); expect(await result.json()).toEqual(error);
  expect(result.headers.get("x-request-id")).toBe("owner-error"); expect(calls).toHaveLength(1);
  expect(result.headers.get("retry-after")).toBe(tuple.status === 429 ? "5" : null);
});
it.each([
  { status: 404, raw: '{"error":{"code":"mcp_personal_not_found","message":"No","retryable":true}}' },
  { status: 404, raw: '{"error":{"code":"session_invalid","message":"No","retryable":false}}' },
  { status: 404, raw: '{"error":{"code":"mcp_personal_not_found","message":"No","retryable":false},"tenant_id":"forged"}' },
  { status: 404, raw: '{"error":{"code":"mcp_personal_not_found","code":"mcp_personal_not_found","message":"No","retryable":false}}' },
])("rejects invalid private error tuples/shape/raw duplicate keys: %j", async ({ status, raw }) => {
  peer = (_request, response) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner-error" }); response.end(raw); };
  const result = await GET(input(), context()); expect(result.status).toBe(502);
  expect((await result.json()).error.code).toBe("mcp_personal_response_invalid");
});
