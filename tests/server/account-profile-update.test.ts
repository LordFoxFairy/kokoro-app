import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { currentProductSession, requestWithDomain } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
  requestWithDomain: vi.fn(),
}));
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain }));
vi.mock("@/lib/server/oidc-bff-agent", () => ({
  boundedOidcBffAgent: vi.fn(),
}));
import { PATCH } from "@/app/api/account/profile/route";
const name = "New Alice";
const input = { name, expected_name: "\ud800\u0000 Old " };
let session: {
  id: string;
  generation: number;
  subject: string;
  access: string;
  accessExpiresAt: number;
  expiresAt: number;
};
const request = (
  body: string = JSON.stringify(input),
  headers: Record<string, string> = {},
  suffix = "",
  signal?: AbortSignal,
) =>
  new Request("http://internal-bind/api/account/profile" + suffix, {
    method: "PATCH",
    headers: {
      host: "web.test",
      origin: "http://web.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
    ...(signal ? { signal } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({
    KOKORO_BFF_BASE_URL: "http://bff.test",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_WEB_REDIS_URL: "redis://fixture/0",
    KOKORO_WEB_AUTH_SECRET: "fixture-secret-at-least-thirty-two-characters",
    KOKORO_INTERNAL_SECRET_WEB_BFF: "server-secret",
    KOKORO_DOMAIN: "product.test",
  }))
    vi.stubEnv(key, value);
  session = {
    id: "session",
    generation: 1,
    subject: "alice",
    access: "server-only",
    accessExpiresAt: Date.now() + 60000,
    expiresAt: Date.now() + 120000,
  };
  currentProductSession.mockResolvedValue(session);
  requestWithDomain.mockImplementation(async (_url, _domain, options) =>
    Response.json(
      { data: { subject: "alice", name } },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": options.headers.get("x-kokoro-request-id"),
        },
      },
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("writes canonical BFF with private identity and exact original UTF16; returns only strict ACK", async () => {
  const response = await PATCH(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { subject: "alice", name } });
  expect(requestWithDomain).toHaveBeenCalledOnce();
  const [url, , options] = requestWithDomain.mock.calls[0]!;
  expect(url).toBe("http://bff.test/v1/account/profile");
  expect(JSON.parse(new TextDecoder().decode(options.body))).toEqual(input);
  expect(options.headers.get("authorization")).toBe("Bearer server-only");
  expect(options.headers.has("cookie")).toBe(false);
  expect(currentProductSession).toHaveBeenCalledTimes(2);
});
it.each([
  { origin: "http://foreign.test" },
  { origin: "https://web.test" },
  { origin: "" },
  { host: "foreign.test" },
])("rejects foreign authority before I/O %j", async (headers) => {
  expect((await PATCH(request(undefined, headers))).status).toBe(403);
  expect(currentProductSession).not.toHaveBeenCalled();
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it.each([
  ['{"name":"A","name":"B","expected_name":"Old"}', ""],
  [JSON.stringify({ ...input, subject: "forged" }), ""],
  [JSON.stringify({ ...input, name: "\ud800" }), ""],
  [JSON.stringify({ ...input, name: "x".repeat(101) }), ""],
  [JSON.stringify(input), "?"],
])("rejects raw input before session/owner", async (body, suffix) => {
  expect((await PATCH(request(body, {}, suffix))).status).toBe(400);
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it.each([
  "id",
  "generation",
  "subject",
  "access",
  "accessExpiresAt",
  "expiresAt",
])("rejects late %s change after real ACK", async (key) => {
  currentProductSession.mockResolvedValueOnce(session).mockResolvedValueOnce({
    ...session,
    [key]:
      typeof session[key as keyof typeof session] === "number" ? 42 : "changed",
  });
  expect((await PATCH(request())).status).toBe(401);
});
it.each([
  { data: { subject: "bob", name } },
  { data: { subject: "alice", name: "other" } },
  { data: { subject: "alice", name, token: "private" } },
  { data: { subject: "alice", name }, meta: { request_id: "id" } },
])("rejects malformed ACK %j", async (raw) => {
  requestWithDomain.mockImplementation(async (_u, _d, o) =>
    Response.json(raw, {
      headers: {
        "cache-control": "no-store",
        "x-request-id": o.headers.get("x-kokoro-request-id"),
      },
    }),
  );
  expect((await PATCH(request())).status).toBe(502);
});
it.each(["body", "session", "fetch", "response"])(
  "bounds hanging %s and cleans late work",
  async (kind) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let req = request();
    if (kind === "body")
      req = new Request(req.url, {
        method: "PATCH",
        headers: req.headers,
        body: new ReadableStream({ cancel }),
        duplex: "half",
      } as RequestInit);
    if (kind === "session")
      currentProductSession.mockReturnValue(new Promise(() => {}));
    if (kind === "fetch")
      requestWithDomain.mockReturnValue(new Promise(() => {}));
    if (kind === "response")
      requestWithDomain.mockImplementation(
        async (_u, _d, o) =>
          new Response(new ReadableStream({ cancel }), {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-request-id": o.headers.get("x-kokoro-request-id"),
            },
          }),
      );
    const pending = PATCH(req);
    await vi.advanceTimersByTimeAsync(10001);
    expect((await pending).status).toBe(503);
    if (["body", "response"].includes(kind)) expect(cancel).toHaveBeenCalled();
    if (["body", "session"].includes(kind))
      expect(requestWithDomain).not.toHaveBeenCalled();
  },
);

it.each([
  [429, "12", 429],
  [429, null, 502],
  [429, "0", 502],
  [429, "86401", 502],
  [503, "12", 502],
])(
  "validates exact Retry-After status%s/header%s",
  async (status, retry, expected) => {
    requestWithDomain.mockImplementation(async (_u, _d, o) =>
      Response.json(
        {
          error: {
            code:
              status === 429
                ? "account_profile_rate_limited"
                : "account_profile_unavailable",
            message: "Safe",
            retryable: true,
          },
        },
        {
          status: status as number,
          headers: {
            "cache-control": "no-store",
            "x-request-id": o.headers.get("x-kokoro-request-id"),
            ...(retry === null ? {} : { "retry-after": String(retry) }),
          },
        },
      ),
    );
    const response = await PATCH(request());
    expect(response.status).toBe(expected);
    if (expected === 429)
      expect(response.headers.get("retry-after")).toBe("12");
  },
);

it("timeout retires a late store result before any BFF write", async () => {
  vi.useFakeTimers();
  let resolve!: (value: typeof session) => void;
  currentProductSession.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = PATCH(request());
  await vi.advanceTimersByTimeAsync(10001);
  expect((await pending).status).toBe(503);
  resolve(session);
  await Promise.resolve();
  await Promise.resolve();
  expect(requestWithDomain).not.toHaveBeenCalled();
});
it("caller abort retires a late fetch body and cannot return ACK", async () => {
  let resolve!: (response: Response) => void;
  requestWithDomain.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const controller = new AbortController();
  const pending = PATCH(request(undefined, {}, "", controller.signal));
  await vi.waitFor(() => expect(requestWithDomain).toHaveBeenCalledOnce());
  controller.abort();
  expect((await pending).status).toBe(503);
  const cancel = vi.fn();
  resolve(new Response(new ReadableStream({ cancel })));
  await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  expect(currentProductSession).toHaveBeenCalledTimes(1);
});
it("rejects raw duplicate ACK keys and bad UTF8", async () => {
  for (const body of [
    '{"data":{"subject":"alice","name":"New Alice","name":"New Alice"}}',
    new Uint8Array([0xff]),
  ]) {
    requestWithDomain.mockImplementation(
      async (_u, _d, o) =>
        new Response(body, {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": o.headers.get("x-kokoro-request-id"),
          },
        }),
    );
    expect((await PATCH(request())).status).toBe(502);
  }
});
