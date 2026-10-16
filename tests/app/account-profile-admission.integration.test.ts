import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }));
vi.mock("@/lib/server/product-session", () => ({
  currentProductSession,
}));
vi.mock("@/lib/server/oidc-bff-agent", () => ({
  boundedOidcBffAgent: vi.fn(),
}));
import { GET } from "@/app/api/account/profile/route";

type Scenario = {
  status?: number;
  mutate?: (body: Record<string, unknown>, headers: Record<string, string>) => void;
  raw?: string;
};

describe("SET43 account profile admission through real BFF HTTP", () => {
  let server: Server | undefined;
  let scenario: Scenario;
  let paths: string[];
  let outboundIds: string[];

  beforeEach(async () => {
    scenario = {};
    paths = [];
    outboundIds = [];
    const now = Date.now();
    currentProductSession.mockReset().mockResolvedValue({
      id: "set43-local-session", generation: 1, subject: "alice",
      access: "set43-server-access", accessExpiresAt: now + 60_000,
      expiresAt: now + 120_000,
    });
    server = createServer((request, response) => {
      paths.push(request.url ?? "");
      const id = String(request.headers["x-kokoro-request-id"] ?? "");
      outboundIds.push(id);
      if (request.url === "/iam/oauth2/userinfo") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ sub: "alice", name: "Alice", email: null, email_verified: null }));
        return;
      }
      if (request.url !== "/v1/me") { response.writeHead(404); response.end(); return; }
      const body: Record<string, unknown> = scenario.status === 200
        ? { data: { user_id: "alice", tenant_id: "tenant-one", platform_admin: false }, meta: { request_id: id } }
        : { error: { code: "session_invalid", message: "Session is invalid" }, meta: { request_id: id } };
      const headers: Record<string, string> = {
        "content-type": "application/json", "cache-control": "no-store", "x-request-id": id,
      };
      scenario.mutate?.(body, headers);
      response.writeHead(scenario.status ?? 401, headers);
      response.end(scenario.raw ?? JSON.stringify(body));
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture did not bind");
    for (const [key, value] of Object.entries({
      KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`,
      KOKORO_WEB_ORIGIN: "http://web.test", NEXTAUTH_URL: "http://web.test/api/auth",
      KOKORO_INTERNAL_SECRET_WEB_BFF: "set43-fixture-secret",
      KOKORO_OIDC_CLIENT_ID: "set43-client", KOKORO_OIDC_CLIENT_SECRET: "set43-client-secret",
      KOKORO_WEB_AUTH_SECRET: "set43-auth-secret-at-least-thirty-two-characters",
      KOKORO_WEB_REDIS_URL: "redis://unused.invalid/0", KOKORO_DOMAIN: "product.test",
      KOKORO_TENANT_ID: "tenant-one",
    })) vi.stubEnv(key, value);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) {
      const owned = server;
      server = undefined;
      owned.closeAllConnections();
      await new Promise<void>((resolve, reject) => owned.close((error) => error ? reject(error) : resolve()));
    }
  });

  const read = () => GET(new Request("http://web.test/api/account/profile", {
    headers: { host: "web.test", cookie: "set43-local-cookie" },
  }));

  it("projects an authoritative session_invalid rejection as profile 401 without userinfo", async () => {
    const response = await read();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: {
      code: "account_profile_session_required", message: "account_profile_session_required",
    } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(paths).toEqual(["/v1/me"]);
    expect(outboundIds[0]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("accepts the JSON charset parameter for an authoritative session rejection", async () => {
    scenario = { mutate: (_body, headers) => {
      headers["content-type"] = "application/json; charset=utf-8";
    } };
    const response = await read();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: {
      code: "account_profile_session_required", message: "account_profile_session_required",
    } });
    expect(paths).toEqual(["/v1/me"]);
  });

  const invalid: [string, Scenario][] = [
    ["wrong response header ID", { mutate: (_body, headers) => { headers["x-request-id"] = "other"; } }],
    ["wrong meta ID", { mutate: (body) => { body.meta = { request_id: "other" }; } }],
    ["extra envelope field", { mutate: (body) => { body.extra = true; } }],
    ["extra error field", { mutate: (body) => { body.error = { code: "session_invalid", message: "invalid", extra: true }; } }],
    ["extra meta field", { mutate: (body) => { body.meta = { ...(body.meta as object), extra: true }; } }],
    ["missing no-store", { mutate: (_body, headers) => { delete headers["cache-control"]; } }],
    ["wrong MIME", { mutate: (_body, headers) => { headers["content-type"] = "text/plain"; } }],
    ["MIME prefix impostor", { mutate: (_body, headers) => { headers["content-type"] = "application/json-invalid"; } }],
    ["Location", { mutate: (_body, headers) => { headers.location = "http://web.test/elsewhere"; } }],
    ["Set-Cookie", { mutate: (_body, headers) => { headers["set-cookie"] = "fixture=private"; } }],
    ["malformed JSON", { raw: "{" }],
    ["other 401 code", { mutate: (body) => { body.error = { code: "permission_denied", message: "denied" }; } }],
    ["empty message", { mutate: (body) => { body.error = { code: "session_invalid", message: "" }; } }],
    ["owner unavailable", { status: 503 }],
    ["service authentication rejected", { status: 403, mutate: (body) => {
      body.error = { code: "service_auth_failed", message: "Service authentication failed" };
    } }],
  ];
  it.each(invalid)("keeps %s as dependency failure without userinfo", async (_label, value) => {
    scenario = value;
    const response = await read();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: {
      code: "account_profile_admission_failed", message: "account_profile_admission_failed",
    } });
    expect(paths).toEqual(["/v1/me"]);
  });

  it("retains successful real identity admission followed by authoritative userinfo", async () => {
    scenario = { status: 200 };
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: {
      subject: "alice", name: "Alice", email: null, email_verified: null,
    } });
    expect(paths).toEqual(["/v1/me", "/iam/oauth2/userinfo"]);
    expect(currentProductSession).toHaveBeenCalledTimes(2);
  });
});
