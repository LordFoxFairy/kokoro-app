import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { currentProductSession, verifyProductIdentity, requestWithDomain } =
  vi.hoisted(() => ({
    currentProductSession: vi.fn(),
    verifyProductIdentity: vi.fn(),
    requestWithDomain: vi.fn(),
  }));
vi.mock("@/lib/server/product-session", async (original) => ({
  ...(await original<typeof import("@/lib/server/product-session")>()),
  currentProductSession,
}));
vi.mock("@/lib/server/oidc-bff-agent", () => ({
  boundedOidcBffAgent: vi.fn(),
}));
vi.mock("@/lib/server/product-identity", () => ({ verifyProductIdentity }));
vi.mock("@/lib/server/upstream-http", async (original) => ({
  ...(await original<typeof import("@/lib/server/upstream-http")>()),
  requestWithDomain,
}));
import { GET } from "@/app/api/account/profile/route";
const session = () => ({
  id: "fixture-session",
  generation: 2,
  subject: "alice",
  access: "fixture-server-access",
  accessExpiresAt: Date.now() + 60_000,
  expiresAt: Date.now() + 120_000,
});
const request = (
  suffix = "",
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) =>
  new Request(`http://web.test/api/account/profile${suffix}`, {
    headers: {
      host: "web.test",
      cookie: "private-cookie",
      authorization: "Bearer browser-forged",
      "x-kokoro-tenant-id": "forged",
      ...headers,
    },
    ...(signal ? { signal } : {}),
  });
const owner = (
  value: unknown = {
    sub: "alice",
    name: "Alice",
    email: "alice@example.test",
    email_verified: true,
  },
  status = 200,
) =>
  Response.json(value, {
    status,
    headers: {
      "set-cookie": "private-issuer=secret",
      location: "https://private.test",
      "x-private": "secret",
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({
    KOKORO_BFF_BASE_URL: "http://bff.test",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-relay-secret",
    KOKORO_OIDC_CLIENT_ID: "fixture-client",
    KOKORO_OIDC_CLIENT_SECRET: "fixture-client-secret",
    KOKORO_WEB_AUTH_SECRET: "fixture-auth-secret-at-least-32-chars",
    KOKORO_WEB_REDIS_URL: "redis://fixture.test/0",
    KOKORO_DOMAIN: "product.test",
    KOKORO_TENANT_ID: "fixture-tenant",
    NEXTAUTH_URL: "http://web.test/api/auth",
  }))
    vi.stubEnv(key, value);
  currentProductSession.mockImplementation(async () => session());
  verifyProductIdentity.mockResolvedValue(undefined);
  requestWithDomain.mockImplementation(async () => owner());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("whitelists userinfo after online admission and same session revalidation", async () => {
  requestWithDomain.mockResolvedValue(
    owner({
      sub: "alice",
      name: "Alice",
      email: "alice@example.test",
      email_verified: true,
      access_token: "never-browser",
      roles: ["admin"],
    }),
  );
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: {
      subject: "alice",
      name: "Alice",
      email: "alice@example.test",
      email_verified: true,
    },
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("location")).toBeNull();
  expect(currentProductSession).toHaveBeenCalledTimes(2);
  expect(verifyProductIdentity).toHaveBeenCalledWith(
    expect.objectContaining({ tenantId: "fixture-tenant" }),
    "fixture-server-access",
    "alice",
    expect.any(AbortSignal),
  );
  const [target, domain, init] = requestWithDomain.mock.calls[0]!;
  expect(target).toBe("http://bff.test/iam/oauth2/userinfo");
  expect(domain).toBe("product.test");
  expect(Object.fromEntries(init.headers)).toEqual(
    expect.objectContaining({
      authorization: "Bearer fixture-server-access",
      "x-kokoro-service": "web-bff",
      "x-kokoro-internal-secret": "fixture-relay-secret",
    }),
  );
  expect(init.headers.has("cookie")).toBe(false);
  expect(init.headers.has("x-kokoro-tenant-id")).toBe(false);
});
it("projects missing scope fields as null", async () => {
  requestWithDomain.mockResolvedValue(owner({ sub: "alice" }));
  expect(await (await GET(request())).json()).toEqual({
    data: { subject: "alice", name: null, email: null, email_verified: null },
  });
});
it.each(["?subject=forged", "?"])(
  "rejects query %s before any session I/O",
  async (suffix) => {
    expect((await GET(request(suffix))).status).toBe(400);
    expect(currentProductSession).not.toHaveBeenCalled();
  },
);
it.each([
  { host: "evil.test" },
  { origin: "http://evil.test" },
  { "content-length": "1" },
  { "transfer-encoding": "chunked" },
])("rejects invalid canonical/framing headers %j", async (headers) => {
  expect([400, 403]).toContain((await GET(request("", headers))).status);
  expect(currentProductSession).not.toHaveBeenCalled();
});
it("requires the sole complete RP config", async () => {
  vi.stubEnv("KOKORO_TENANT_ID", "");
  expect((await GET(request())).status).toBe(503);
  expect(currentProductSession).not.toHaveBeenCalled();
});
it.each([null, "expired"])(
  "rejects missing/expired session %s",
  async (kind) => {
    currentProductSession.mockResolvedValue(
      kind === null ? null : { ...session(), accessExpiresAt: Date.now() - 1 },
    );
    expect((await GET(request())).status).toBe(401);
    expect(verifyProductIdentity).not.toHaveBeenCalled();
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);
it("fails closed on store failure", async () => {
  currentProductSession.mockRejectedValue(new Error("private redis details"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private redis");
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it("fails closed on BFF subject/tenant admission rejection", async () => {
  verifyProductIdentity.mockRejectedValue(new Error("subject/tenant mismatch"));
  expect((await GET(request())).status).toBe(503);
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it.each([401, 403, 429, 500, 302])(
  "rejects owner status %s and cancels its body",
  async (status) => {
    const cancel = vi.fn();
    requestWithDomain.mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status }),
    );
    const response = await GET(request());
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain("secret");
    expect(cancel).toHaveBeenCalled();
  },
);
it.each([
  { sub: "other" },
  { sub: "alice", name: 42 },
  { sub: "alice", email_verified: "true" },
  [],
  null,
])("rejects invalid projection %j", async (value) => {
  requestWithDomain.mockResolvedValue(owner(value));
  expect((await GET(request())).status).toBe(502);
});
it.each([
  null,
  "changed-id",
  "changed-generation",
  "changed-subject",
  "expired",
])("revalidates session before returning: %s", async (kind) => {
  currentProductSession
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(
      kind === null
        ? null
        : {
            ...session(),
            ...(kind === "changed-id"
              ? { id: "other" }
              : kind === "changed-generation"
                ? { generation: 3 }
                : kind === "changed-subject"
                  ? { subject: "bob" }
                  : { accessExpiresAt: Date.now() - 1 }),
          },
    );
  expect((await GET(request())).status).toBe(401);
});
it.each(["initial-store", "admission", "fetch", "body", "final-store"])(
  "total 5s deadline includes hanging %s",
  async (stage) => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    const cancel = vi.fn();
    if (stage === "initial-store")
      currentProductSession.mockReturnValueOnce(never);
    if (stage === "admission") verifyProductIdentity.mockReturnValueOnce(never);
    if (stage === "fetch") requestWithDomain.mockReturnValueOnce(never);
    if (stage === "body")
      requestWithDomain.mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-type": "application/json" },
        }),
      );
    if (stage === "final-store")
      currentProductSession
        .mockResolvedValueOnce(session())
        .mockReturnValueOnce(never);
    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(5_001);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "account_profile_timeout" },
    });
    if (stage === "body") expect(cancel).toHaveBeenCalled();
  },
);
it("cancels late fetch body after deadline instead of reviving success", async () => {
  vi.useFakeTimers();
  let finish!: (r: Response) => void;
  requestWithDomain.mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  const pending = GET(request());
  await vi.advanceTimersByTimeAsync(5_001);
  expect((await pending).status).toBe(503);
  const cancel = vi.fn();
  finish(
    new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(cancel).toHaveBeenCalled();
  expect(currentProductSession).toHaveBeenCalledTimes(1);
});
it("caller abort retires pending admission without userinfo", async () => {
  verifyProductIdentity.mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const pending = GET(request("", {}, controller.signal));
  await Promise.resolve();
  controller.abort();
  expect((await pending).status).toBe(499);
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it.each(["oversize", "malformed", "content-type", "declared-size"])(
  "rejects %s body",
  async (kind) => {
    requestWithDomain.mockResolvedValue(
      kind === "oversize"
        ? owner({ sub: "alice", other: "x".repeat(16_384) })
        : kind === "malformed"
          ? new Response("{", {
              headers: { "content-type": "application/json" },
            })
          : kind === "content-type"
            ? new Response("{}", { headers: { "content-type": "text/plain" } })
            : new Response("{}", {
                headers: {
                  "content-type": "application/json",
                  "content-length": "16385",
                },
              }),
    );
    expect((await GET(request())).status).toBe(502);
  },
);

it("does not restart the 5s budget between initial store and fetch", async () => {
  vi.useFakeTimers();
  let finish!: (value: ReturnType<typeof session>) => void;
  currentProductSession.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  requestWithDomain.mockReturnValueOnce(new Promise(() => {}));
  const pending=GET(request());
  await vi.advanceTimersByTimeAsync(4_000);finish(session());
  await vi.advanceTimersByTimeAsync(1_001);
  expect((await pending).status).toBe(503);
  expect(requestWithDomain.mock.calls[0]![2].timeoutMs).toBeLessThanOrEqual(1_000);
});
it("never follows redirects or leaks owner cookies",async()=>{
  requestWithDomain.mockResolvedValue(new Response(null,{status:302,headers:{location:"https://private.test", "set-cookie":"secret=issuer"}}));
  const response=await GET(request());expect(response.status).toBe(502);expect(response.headers.get("location")).toBeNull();expect(response.headers.get("set-cookie")).toBeNull();expect(requestWithDomain).toHaveBeenCalledTimes(1);
});
