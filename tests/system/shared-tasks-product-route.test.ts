import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
  requestWithDomain: vi.fn(),
  oidcRpConfig: vi.fn(),
}));
vi.mock("@/lib/server/product-session", () => ({
  currentProductSession: mocks.currentProductSession,
}));
vi.mock("@/lib/server/upstream-http", () => ({
  requestWithDomain: mocks.requestWithDomain,
}));
vi.mock("@/lib/server/oidc-provider", () => ({
  oidcRpConfig: mocks.oidcRpConfig,
}));
import { GET } from "@/app/api/account/shared-tasks/route";
const session = {
  id: "opaque",
  generation: 1,
  subject: "alice",
  access: "server-secret",
  accessExpiresAt: Date.now() + 600_000,
  expiresAt: Date.now() + 600_000,
};
const request = (suffix = "?limit=100", headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/account/shared-tasks" + suffix, {
    headers: { host: "web.test", ...headers },
  });
beforeEach(() => {
  vi.resetAllMocks();
  for (const [k, v] of Object.entries({
    KOKORO_BFF_BASE_URL: "http://bff.test",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_WEB_REDIS_URL: "redis://fixture/0",
    KOKORO_WEB_AUTH_SECRET: "at-least-thirty-two-characters-secret",
    KOKORO_DOMAIN: "product.test",
  }))
    vi.stubEnv(k, v);
  mocks.oidcRpConfig.mockReturnValue({ tenantId: "tenant" });
  mocks.currentProductSession.mockResolvedValue(session);
  mocks.requestWithDomain.mockImplementation(async (_u, _d, o) =>
    Response.json(
      { data: { items: [], next_cursor: null } },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": o.headers.get("x-kokoro-request-id"),
        },
      },
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("returns strict private list after two actual identity reads, with server-only admission headers", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { items: [], next_cursor: null },
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.currentProductSession).toHaveBeenCalledTimes(2);
  expect(mocks.requestWithDomain.mock.calls[0]?.[0]).toBe(
    "http://bff.test/v1/account/shared-tasks?limit=100",
  );
  expect(
    mocks.requestWithDomain.mock.calls[0]?.[2].headers.get("authorization"),
  ).toBe("Bearer server-secret");
});
it.each(["?limit=01", "?limit=100&limit=100", "?foreign=x", "?cursor=%ZZ"])(
  "rejects invalid query before owner IO %s",
  async (suffix) => {
    expect((await GET(request(suffix))).status).toBe(400);
    expect(mocks.requestWithDomain).not.toHaveBeenCalled();
  },
);
it.each([
  { host: "foreign" },
  { origin: "https://web.test" },
  { "content-encoding": "identity" },
  { "idempotency-key": "x" },
])("rejects framing/origin %j", async (headers) => {
  expect([400, 403]).toContain(
    (await GET(request("?limit=100", headers))).status,
  );
  expect(mocks.requestWithDomain).not.toHaveBeenCalled();
});
it("rejects unknown response fields before projection", async () => {
  mocks.requestWithDomain.mockImplementation(async (_u, _d, o) =>
    Response.json(
      { data: { items: [], next_cursor: null }, secret: "x" },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": o.headers.get("x-kokoro-request-id"),
        },
      },
    ),
  );
  expect((await GET(request())).status).toBe(502);
});
it.each([
  "id",
  "generation",
  "subject",
  "access",
  "accessExpiresAt",
  "expiresAt",
])("retires changed final %s", async (field) => {
  mocks.currentProductSession
    .mockResolvedValueOnce(session)
    .mockResolvedValueOnce({
      ...session,
      [field]:
        field === "generation"
          ? 2
          : field.endsWith("At")
            ? session.accessExpiresAt + 1
            : "changed",
    });
  expect((await GET(request())).status).toBe(401);
});
it("absolute budget races a hung store and cancels before owner IO", async () => {
  vi.useFakeTimers();
  mocks.currentProductSession.mockImplementation(() => new Promise(() => {}));
  const pending = GET(request());
  await vi.advanceTimersByTimeAsync(10_001);
  expect((await pending).status).toBe(503);
  expect(mocks.requestWithDomain).not.toHaveBeenCalled();
});
