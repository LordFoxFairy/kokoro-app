import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  admittedProductSession,
  productBffConfig,
  requestWithDomain,
  sameOriginOk,
  currentProductSession,
} = vi.hoisted(() => ({
  admittedProductSession: vi.fn(),
  currentProductSession: vi.fn(),
  productBffConfig: vi.fn(),
  requestWithDomain: vi.fn(),
  sameOriginOk: vi.fn<(request: Request) => boolean>(() => true),
}));

vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));
vi.mock("@/lib/server/same-origin", () => ({ sameOriginOk }));
vi.mock("@/lib/server/product-bff", () => ({
  admittedProductSession,
  productBffConfig,
  productBffHeaders: (
    _config: unknown,
    claims: { access: string },
    requestId: string,
  ) =>
    new Headers({
      authorization: `Bearer ${claims.access}`,
      "x-kokoro-service": "web-bff",
      "x-kokoro-request-id": requestId,
    }),
}));
vi.mock("@/lib/server/upstream-http", () => ({
  requestWithDomain,
  readBoundedRequestBody: (request: Request) => request.arrayBuffer(),
  UpstreamRequestTooLargeError: class extends Error {},
}));

import * as teamRoute from "@/app/api/team/[...path]/route";

function teamRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      host: "web.example.test",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

beforeEach(async () => {
  productBffConfig.mockReturnValue({
    bffBaseUrl: "https://bff.internal",
    domain: "web.example.test",
    internalSecret: null,
    session: {
      webOrigin: "https://web.example.test",
      redisUrl: "redis://unused.test:6379/0",
      secret: "x".repeat(32),
    },
  });
  const now = Date.now();
  const session = {
    id: "opaque-session",
    generation: 1,
    subject: "user-me",
    access: "product-access",
    accessExpiresAt: now + 60_000,
    expiresAt: now + 120_000,
  };
  admittedProductSession.mockResolvedValue(session);
  currentProductSession.mockResolvedValue(session);
  requestWithDomain.mockImplementation(
    async (target: string, _domain: string, init: RequestInit) => {
      const path = new URL(target).pathname;
      const data =
        init.method === "GET"
          ? []
          : path.endsWith("/roles")
            ? { member_id: "member-1", roles: ["admin"] }
            : path.endsWith("/me")
              ? { member_id: "member-me", status: "left" }
              : path.includes("/invitations")
                ? {
                    invitation_id: "inv-1",
                    status: init.method === "DELETE" ? "canceled" : "pending",
                  }
                : { member_id: "member-1", status: "removed" };
      return new Response(
        JSON.stringify({
          data,
          meta: {
            request_id: "bff-request",
            ...(init.method === "GET" ? { next_cursor: null } : {}),
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "bff-request",
            "cache-control": "no-store",
          },
        },
      );
    },
  );
  const actual = await vi.importActual<
    typeof import("@/lib/server/same-origin")
  >("@/lib/server/same-origin");
  sameOriginOk.mockImplementation(actual.sameOriginOk);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("fixed-tenant Team Product adapter", () => {
  it.each([
    ["GET", ["members"]],
    ["GET", ["invitations"]],
    ["GET", ["roles"]],
    ["POST", ["invitations"]],
    ["POST", ["invitations", "inv-1", "resend"]],
    ["DELETE", ["invitations", "inv-1"]],
    ["PUT", ["members", "member-1", "roles"]],
    ["DELETE", ["members", "member-1"]],
    ["DELETE", ["members", "me"]],
  ] as const)(
    "forwards only the exact %s /v1/team/%s operation with Product Bearer",
    async (method, path) => {
      const handler = (
        teamRoute as unknown as Record<
          string,
          (
            request: Request,
            ctx: ReturnType<typeof context>,
          ) => Promise<Response>
        >
      )[method];
      expect(handler).toBeTypeOf("function");
      if (handler === undefined)
        throw new Error(`missing Team ${method} handler`);
      const body =
        method === "POST" && path.length === 1
          ? JSON.stringify({ email: "a@example.test", roles: ["member"] })
          : method === "PUT"
            ? JSON.stringify({ roles: ["admin"] })
            : undefined;
      const request = teamRequest(
        `https://web.example.test/api/team/${path.join("/")}`,
        {
          method,
          headers: {
            origin: "https://web.example.test",
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body === undefined ? {} : { body }),
        },
      );
      const response = await handler(request, context([...path]));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("x-request-id")).toBe("bff-request");
      const [target, domain, init] = requestWithDomain.mock.calls.at(-1) as [
        string,
        string,
        RequestInit,
      ];
      expect(target).toBe(`https://bff.internal/v1/team/${path.join("/")}`);
      expect(domain).toBe("web.example.test");
      const headers = new Headers(init.headers);
      expect(headers.get("authorization")).toBe("Bearer product-access");
      expect(headers.get("x-kokoro-principal-id")).toBeNull();
      expect(headers.get("x-kokoro-namespace")).toBeNull();
      expect(headers.get("cookie")).toBeNull();
      expect(init.method).toBe(method);
      expect(init.body === undefined).toBe(body === undefined);
      expect(requestWithDomain).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves the opaque owner cursor and rejects unknown Team paths before BFF I/O", async () => {
    const response = await teamRoute.GET(
      teamRequest(
        "https://web.example.test/api/team/members?limit=25&cursor=opaque%2Bnext",
      ),
      context(["members"]),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      meta: { next_cursor: null },
    });
    expect(requestWithDomain.mock.calls[0]?.[0]).toBe(
      "https://bff.internal/v1/team/members?limit=25&cursor=opaque%2Bnext",
    );
    requestWithDomain.mockClear();
    for (const path of [
      ["me", "teams"],
      ["members", "change-role"],
      ["auth", "team-sessions"],
      ["invitations", "inv-1", "accept"],
    ]) {
      const denied = await teamRoute.GET(
        teamRequest(`https://web.example.test/api/team/${path.join("/")}`),
        context(path),
      );
      expect(denied.status).toBe(404);
    }
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated or cross-origin mutations before BFF I/O", async () => {
    admittedProductSession.mockResolvedValueOnce(null);
    const anonymous = await teamRoute.GET(
      teamRequest("https://web.example.test/api/team/members"),
      context(["members"]),
    );
    expect(anonymous.status).toBe(401);
    sameOriginOk.mockReturnValueOnce(false);
    const csrf = await teamRoute.POST(
      teamRequest("https://web.example.test/api/team/invitations", {
        method: "POST",
        body: "{}",
      }),
      context(["invitations"]),
    );
    expect(csrf.status).toBe(403);
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant or actor fields and malformed page queries before BFF I/O", async () => {
    const body = JSON.stringify({
      email: "a@example.test",
      roles: ["member"],
      tenant_id: "forged",
    });
    const mutation = await teamRoute.POST(
      teamRequest("https://web.example.test/api/team/invitations", {
        method: "POST",
        headers: {
          origin: "https://web.example.test",
          "content-type": "application/json",
        },
        body,
      }),
      context(["invitations"]),
    );
    expect(mutation.status).toBe(400);
    const page = await teamRoute.GET(
      teamRequest(
        "https://web.example.test/api/team/members?cursor=one&cursor=two",
      ),
      context(["members"]),
    );
    expect(page.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("does not retry a conflict and preserves the stable owner error", async () => {
    requestWithDomain.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "LAST_OWNER", message: "Last owner" },
          meta: { request_id: "owner-conflict" },
        }),
        {
          status: 409,
          headers: {
            "content-type": "application/json",
            "x-request-id": "owner-conflict",
            "cache-control": "no-store",
          },
        },
      ),
    );
    const response = await teamRoute.DELETE(
      teamRequest("https://web.example.test/api/team/members/me", {
        method: "DELETE",
        headers: { origin: "https://web.example.test" },
      }),
      context(["members", "me"]),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "LAST_OWNER" },
    });
    expect(requestWithDomain).toHaveBeenCalledTimes(1);
  });
});

describe("SET20 Team adapter protocol RED", () => {
  it.each([
    ["POST", ["invitations", "inv-1", "resend"]],
    ["DELETE", ["invitations", "inv-1"]],
    ["DELETE", ["members", "member-1"]],
    ["DELETE", ["members", "me"]],
  ] as const)(
    "accepts proven EOF-only %s body for %j without forwarding a body",
    async (method, path) => {
      const request = teamRequest(
        `https://web.example.test/api/team/${path.join("/")}`,
        {
          method,
          headers: {
            host: "web.example.test",
            origin: "https://web.example.test",
          },
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          duplex: "half",
        } as RequestInit,
      );
      const handler = method === "POST" ? teamRoute.POST : teamRoute.DELETE;
      const response = await handler(request, context([...path]));
      expect(response.status).toBe(200);
      expect(requestWithDomain).toHaveBeenCalledOnce();
      expect(requestWithDomain.mock.calls[0]?.[2].body).toBeUndefined();
    },
  );

  it.each([undefined, "http://web.example.test"])(
    "rejects missing or cross-scheme mutation Origin %s before owner dispatch",
    async (origin) => {
      const response = await teamRoute.DELETE(
        teamRequest("https://web.example.test/api/team/members/me", {
          method: "DELETE",
          headers: {
            host: "web.example.test",
            ...(origin === undefined ? {} : { origin }),
          },
        }),
        context(["members", "me"]),
      );
      expect(response.status).toBe(403);
      expect(requestWithDomain).not.toHaveBeenCalled();
    },
  );

  it("rejects a duplicate decoded JSON key before owner dispatch", async () => {
    const response = await teamRoute.POST(
      teamRequest("https://web.example.test/api/team/invitations", {
        method: "POST",
        headers: {
          host: "web.example.test",
          origin: "https://web.example.test",
          "content-type": "application/json",
        },
        body: '{"email":"foreign@example.test","email":"a@example.test","roles":["member"]}',
      }),
      context(["invitations"]),
    );
    expect(response.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("rejects a bare query delimiter on a mutation", async () => {
    const response = await teamRoute.DELETE(
      teamRequest("https://web.example.test/api/team/members/me?", {
        method: "DELETE",
        headers: {
          host: "web.example.test",
          origin: "https://web.example.test",
        },
      }),
      context(["members", "me"]),
    );
    expect(response.status).toBe(400);
    expect(requestWithDomain).not.toHaveBeenCalled();
  });

  it("does not release successful owner data after the final session generation changed", async () => {
    currentProductSession.mockResolvedValue({
      ...(await admittedProductSession()),
      generation: 2,
    });
    const response = await teamRoute.GET(
      teamRequest("https://web.example.test/api/team/members", {
        headers: { host: "web.example.test" },
      }),
      context(["members"]),
    );
    expect(response.status).toBe(401);
    expect(requestWithDomain).toHaveBeenCalledOnce();
  });

  it("includes suspended route params in the single ten-second budget", async () => {
    vi.useFakeTimers();
    let release!: (value: { path: string[] }) => void;
    let settled = false;
    const pending = teamRoute
      .GET(
        teamRequest("https://web.example.test/api/team/members", {
          headers: { host: "web.example.test" },
        }),
        {
          params: new Promise((resolve) => {
            release = resolve;
          }),
        },
      )
      .then((value) => {
        settled = true;
        return value;
      });
    await vi.advanceTimersByTimeAsync(10_001);
    const settledAtDeadline = settled;
    release({ path: ["members"] });
    await pending;
    expect(settledAtDeadline).toBe(true);
    expect(requestWithDomain).not.toHaveBeenCalled();
  });
});

describe("SET20 same-session and strict upstream negatives", () => {
  it.each([
    "id",
    "generation",
    "subject",
    "access",
    "accessExpiresAt",
    "expiresAt",
  ])("retires the final %s change after an owner ACK", async (field) => {
    const session = await admittedProductSession();
    currentProductSession.mockResolvedValue({
      ...session,
      [field]:
        typeof session[field] === "number"
          ? session[field] + 1
          : `${session[field]}-changed`,
    });
    const response = await teamRoute.DELETE(
      teamRequest("https://web.example.test/api/team/members/member-1", {
        method: "DELETE",
        headers: { origin: "https://web.example.test" },
      }),
      context(["members", "member-1"]),
    );
    expect(response.status).toBe(401);
    expect(requestWithDomain).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("does not dispatch after late session admission completes beyond the entry deadline", async () => {
    vi.useFakeTimers();
    let release!: (value: unknown) => void;
    admittedProductSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = teamRoute.GET(
      teamRequest("https://web.example.test/api/team/members"),
      context(["members"]),
    );
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await pending).status).toBe(503);
    release({
      id: "late",
      generation: 1,
      subject: "user-me",
      access: "late",
      accessExpiresAt: Date.now() + 60000,
      expiresAt: Date.now() + 60000,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(requestWithDomain).not.toHaveBeenCalled();
  });
  it.each([undefined, "1", "99999"])(
    "accepts formal429 Retry-After %s without an automatic owner retry",
    async (retry) => {
      requestWithDomain.mockResolvedValueOnce(
        Response.json(
          {
            error: { code: "RATE_LIMITED", message: "owner private message" },
            meta: { request_id: "limited" },
          },
          {
            status: 429,
            headers: {
              "cache-control": "no-store",
              "x-request-id": "limited",
              ...(retry === undefined ? {} : { "retry-after": retry }),
            },
          },
        ),
      );
      const response = await teamRoute.GET(
        teamRequest("https://web.example.test/api/team/members"),
        context(["members"]),
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe(retry ?? null);
      expect((await response.json()).error.message).toBe("RATE_LIMITED");
      expect(requestWithDomain).toHaveBeenCalledOnce();
    },
  );
  it.each([
    [429, "0"],
    [429, "100000"],
    [503, "1"],
  ])("rejects malformed upstream retry header %s/%s", async (status, retry) => {
    requestWithDomain.mockResolvedValueOnce(
      Response.json(
        {
          error: { code: "UNAVAILABLE", message: "private" },
          meta: { request_id: "invalid" },
        },
        {
          status,
          headers: {
            "cache-control": "no-store",
            "x-request-id": "invalid",
            "retry-after": retry,
          },
        },
      ),
    );
    const response = await teamRoute.GET(
      teamRequest("https://web.example.test/api/team/members"),
      context(["members"]),
    );
    expect(response.status).toBe(502);
  });
});

it.each(["identity", "gzip"])(
  "rejects unpublished Team input Content-Encoding %s before any owner call",
  async (encoding) => {
    const response = await teamRoute.POST(
      teamRequest("https://web.example.test/api/team/invitations", {
        method: "POST",
        headers: {
          origin: "https://web.example.test",
          "content-type": "application/json",
          "content-encoding": encoding,
        },
        body: JSON.stringify({ email: "a@example.test", roles: ["member"] }),
      }),
      context(["invitations"]),
    );
    expect(response.status).toBe(400);
    expect(admittedProductSession).not.toHaveBeenCalled();
    expect(requestWithDomain).not.toHaveBeenCalled();
  },
);
