import { afterEach, describe, expect, it, vi } from "vitest";

import { createTeamClient, TeamClientError } from "@/team/client";

const stamp = "2026-09-24T00:00:00Z";
const member = {
  member_id: "member-1",
  user_id: "user-1",
  display_name: "One",
  image_url: null,
  roles: ["owner"],
  joined_at: stamp,
};
const invitation = {
  invitation_id: "inv-1",
  email: "new@example.test",
  roles: ["member"],
  status: "pending",
  created_at: stamp,
  expires_at: stamp,
};
const role = {
  role_id: null,
  name: "owner",
  kind: "builtin",
  permissions: {
    member: ["create", "read", "update", "delete"],
    invitation: ["create", "read", "cancel"],
  },
};

function teamResponse(raw: unknown, init: ResponseInit = {}): Response {
  const meta = (raw as { meta?: { request_id?: string } }).meta;
  return Response.json(raw, {
    ...init,
    headers: {
      "cache-control": "private, no-store",
      "x-request-id": meta?.request_id ?? "req-test",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pinned Team Product browser client", () => {
  it("preserves the complete IAM builtin role permissions through the real response parser", async () => {
    const skill = [
      "create_draft",
      "create_version",
      "begin_upload",
      "complete_upload",
      "abort_upload",
      "validate_draft",
      "publish",
      "withdraw",
      "set_status",
      "install",
      "set_installation_enabled",
      "remove_installation",
      "update_draft",
      "discard_draft",
      "set_publication_audience",
    ];
    const builtinRoles = [
      {
        role_id: null,
        name: "owner",
        kind: "builtin",
        permissions: {
          organization: ["update"],
          member: ["create", "read", "update", "delete"],
          invitation: ["create", "read", "cancel"],
          ac: ["create", "read", "update"],
          tenant: ["read"],
          audit: ["read"],
          platform: ["execute"],
          skill,
        },
      },
      {
        role_id: null,
        name: "admin",
        kind: "builtin",
        permissions: {
          organization: ["update"],
          member: ["create", "read", "update", "delete"],
          invitation: ["create", "read", "cancel"],
          ac: ["read"],
          tenant: ["read"],
          audit: ["read"],
          platform: ["execute"],
          skill,
        },
      },
      {
        role_id: null,
        name: "member",
        kind: "builtin",
        permissions: {
          member: ["read"],
          ac: ["read"],
          tenant: ["read"],
          platform: ["execute"],
        },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        teamResponse({
          data: builtinRoles,
          meta: { request_id: "req-builtin", next_cursor: null },
        }),
      ),
    );
    expect((await createTeamClient().listRoles()).items).toEqual(builtinRoles);
  });

  it.each([
    { unknown: ["read"] },
    { platform: ["unknown"] },
    { skill: ["unknown"] },
    { platform: [] },
    { skill: [] },
  ])(
    "rejects invalid permission domains or actions: %j",
    async (permissions) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          teamResponse({
            data: [{ ...role, permissions }],
            meta: { request_id: "req-invalid-role", next_cursor: null },
          }),
        ),
      );
      await expect(createTeamClient().listRoles()).rejects.toMatchObject({
        code: "bff_bad_response",
      });
    },
  );

  it("uses generated Team GET operations through the same-origin adapter and preserves owner cursor", async () => {
    const fetcher = vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      expect(url.pathname.startsWith("/api/team/")).toBe(true);
      const data = url.pathname.endsWith("/members")
        ? [member]
        : url.pathname.endsWith("/invitations")
          ? [invitation]
          : [role];
      return teamResponse({
        data,
        meta: { request_id: "req-bff", next_cursor: "opaque+next" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const client = createTeamClient();
    expect(
      (await client.listMembers({ limit: 25, cursor: "opaque+first" })).items,
    ).toEqual([member]);
    expect((await client.listInvitations()).items).toEqual([invitation]);
    expect((await client.listRoles()).items).toEqual([role]);
    expect(
      new URL((fetcher.mock.calls[0]?.[0] as Request).url).searchParams.get(
        "cursor",
      ),
    ).toBe("opaque+first");
    expect((await client.listMembers()).nextCursor).toBe("opaque+next");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("uses generated six mutation operations with owner IDs/roles[] and no automatic retry", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        const request = input.clone();
        const path = new URL(request.url).pathname;
        const text = request.body === null ? "" : await request.text();
        calls.push({
          method: request.method,
          path,
          body: text === "" ? null : (JSON.parse(text) as unknown),
        });
        const data =
          path.endsWith("/resend") || request.method === "POST"
            ? { invitation_id: "inv-1", status: "pending" }
            : path.endsWith("/roles")
              ? { member_id: "member-1", roles: ["admin"] }
              : path.endsWith("/invitations/inv-1")
                ? { invitation_id: "inv-1", status: "canceled" }
                : path.endsWith("/me")
                  ? { member_id: "member-1", status: "left" }
                  : { member_id: "member-1", status: "removed" };
        return teamResponse({ data, meta: { request_id: "req-write" } });
      }),
    );
    const client = createTeamClient();
    await client.createInvitation("new@example.test", ["member"]);
    await client.resendInvitation("inv-1");
    await client.cancelInvitation("inv-1");
    await client.replaceMemberRoles("member-1", ["admin"]);
    await client.removeMember("member-1");
    await client.leave("member-1");
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/team/invitations",
        body: { email: "new@example.test", roles: ["member"] },
      },
      {
        method: "POST",
        path: "/api/team/invitations/inv-1/resend",
        body: null,
      },
      { method: "DELETE", path: "/api/team/invitations/inv-1", body: null },
      {
        method: "PUT",
        path: "/api/team/members/member-1/roles",
        body: { roles: ["admin"] },
      },
      { method: "DELETE", path: "/api/team/members/member-1", body: null },
      { method: "DELETE", path: "/api/team/members/me", body: null },
    ]);
  });

  it("preserves LAST_OWNER status/request ID and never retries a disputed write", async () => {
    const fetcher = vi.fn(async () =>
      teamResponse(
        {
          error: { code: "LAST_OWNER", message: "Last owner" },
          meta: { request_id: "req-conflict" },
        },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(createTeamClient().leave("member-1")).rejects.toMatchObject({
      code: "LAST_OWNER",
      status: 409,
      requestId: "req-conflict",
    } satisfies Partial<TeamClientError>);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed on malformed owner response rather than accepting legacy team/session shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        teamResponse({
          data: [{ userId: "legacy" }],
          meta: { request_id: "req-bad", next_cursor: null },
        }),
      ),
    );
    await expect(createTeamClient().listMembers()).rejects.toMatchObject({
      code: "bff_bad_response",
    });
  });
});

describe("SET20 Team strict wire and bound acknowledgement RED", () => {
  it.each([307, 308])(
    "blocks %s before a redirect can forward an invitation body",
    async () => {
      const forwarded: string[] = [];
      const fetcher = vi.fn(async (request: Request) => {
        if (request.redirect === "error")
          throw new TypeError("redirect rejected");
        forwarded.push(await request.text());
        return teamResponse({
          data: { invitation_id: "inv-1", status: "pending" },
          meta: { request_id: "req-redirect" },
        });
      });
      vi.stubGlobal("fetch", fetcher);
      await expect(
        createTeamClient().createInvitation("new@example.test", ["member"]),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledOnce();
      expect((fetcher.mock.calls[0]?.[0] as Request).redirect).toBe("error");
      expect(forwarded).toEqual([]);
    },
  );

  it.each([
    ["resend", { invitation_id: "foreign", status: "pending" }],
    ["cancel", { invitation_id: "foreign", status: "canceled" }],
    ["remove", { member_id: "foreign", status: "removed" }],
    ["roles", { member_id: "member-1", roles: ["owner"] }],
    ["roles", { member_id: "member-1", roles: ["admin", "admin"] }],
  ])("rejects a valid-shape but unbound %s ACK %j", async (operation, data) => {
    const fetcher = vi.fn(async () =>
      teamResponse({ data, meta: { request_id: "req-bound" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = createTeamClient();
    const pending =
      operation === "resend"
        ? client.resendInvitation("inv-1")
        : operation === "cancel"
          ? client.cancelInvitation("inv-1")
          : operation === "remove"
            ? client.removeMember("member-1")
            : client.replaceMemberRoles("member-1", ["admin"]);
    await expect(pending).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects duplicate decoded JSON keys before generated parsing loses evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            '{"data":{"invitation_id":"foreign","invitation_id":"inv-1","status":"pending"},"meta":{"request_id":"req-raw"}}',
            {
              headers: {
                "content-type": "application/json",
                "cache-control": "no-store",
                "x-request-id": "req-raw",
              },
            },
          ),
      ),
    );
    await expect(
      createTeamClient().resendInvitation("inv-1"),
    ).rejects.toThrow();
  });

  it.each([
    { "x-request-id": "different" },
    { "cache-control": "public, max-age=60" },
    { "retry-after": "1" },
  ])("rejects successful response header contradiction %j", async (headers) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        teamResponse(
          {
            data: { invitation_id: "inv-1", status: "pending" },
            meta: { request_id: "req-header" },
          },
          { headers },
        ),
      ),
    );
    await expect(
      createTeamClient().resendInvitation("inv-1"),
    ).rejects.toThrow();
  });

  it.each([undefined, "1", "99999"])(
    "accepts formal optional Team429 Retry-After %s without retry",
    async (retryAfter) => {
      const fetcher = vi.fn(async () =>
        teamResponse(
          {
            error: { code: "RATE_LIMITED", message: "limited" },
            meta: { request_id: "req-rate" },
          },
          {
            status: 429,
            ...(retryAfter === undefined
              ? {}
              : { headers: { "retry-after": retryAfter } }),
          },
        ),
      );
      vi.stubGlobal("fetch", fetcher);
      await expect(
        createTeamClient().resendInvitation("inv-1"),
      ).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [429, "0"],
    [429, "100000"],
    [503, "1"],
  ])(
    "rejects undeclared or invalid Retry-After %s/%s",
    async (status, retryAfter) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          teamResponse(
            {
              error: { code: "UNAVAILABLE", message: "unavailable" },
              meta: { request_id: "req-rate" },
            },
            {
              status,
              headers: { "retry-after": retryAfter },
            },
          ),
        ),
      );
      await expect(
        createTeamClient().resendInvitation("inv-1"),
      ).rejects.toMatchObject({ code: "bff_bad_response" });
    },
  );

  it("bounds a hanging fetch by one total ten-second call budget", async () => {
    vi.useFakeTimers();
    let release!: (value: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    let settled = false;
    const pending = createTeamClient()
      .listMembers()
      .then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
    await vi.advanceTimersByTimeAsync(10_001);
    const settledAtDeadline = settled;
    release(
      teamResponse({
        data: [member],
        meta: { request_id: "req-late", next_cursor: null },
      }),
    );
    await pending;
    expect(settledAtDeadline).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("SET20 finite raw response and retirement", () => {
  it("keeps headers and a delayed body within the same ten-second budget", async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 9000));
        return new Response(
          new ReadableStream({
            start(controller) {
              stream = controller;
            },
            cancel,
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-request-id": "req-slow",
            },
          },
        );
      }),
    );
    let failed = false;
    const pending = createTeamClient()
      .listMembers()
      .catch(() => {
        failed = true;
      });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(failed).toBe(true);
    expect(stream).toBeDefined();
    expect(cancel).toHaveBeenCalledOnce();
    await pending;
  });

  it("closes a noncooperative fetch response arriving after the deadline", async () => {
    vi.useFakeTimers();
    let release!: (value: Response) => void;
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const pending = createTeamClient()
      .listMembers()
      .catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10_001);
    await pending;
    release(
      new Response(new ReadableStream({ cancel }), {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "req-late",
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    '\uFEFF{"data":[],"meta":{"request_id":"req-raw","next_cursor":null}}',
    '{"data":[],"meta":{"request_id":"req-raw","next_cursor":null}} false',
    '{"data":[],"meta":{"request_id":"req-raw","next_cursor":null,"unknown":true}}',
  ])("rejects BOM, trailing data or unknown raw fields: %s", async (text) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(text, {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-request-id": "req-raw",
            },
          }),
      ),
    );
    await expect(createTeamClient().listMembers()).rejects.toMatchObject({
      code: "bff_bad_response",
    });
  });

  it("preserves a legitimate historical escaped lone surrogate in display_name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        teamResponse({
          data: [{ ...member, display_name: "\uD800" }],
          meta: { request_id: "req-history", next_cursor: null },
        }),
      ),
    );
    expect(
      (await createTeamClient().listMembers()).items[0]?.display_name,
    ).toBe("\uD800");
  });

  it("requires the actor's exact member ID for leave ACK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        teamResponse({
          data: { member_id: "foreign", status: "left" },
          meta: { request_id: "req-leave" },
        }),
      ),
    );
    await expect(createTeamClient().leave("member-1")).rejects.toMatchObject({
      code: "bff_bad_response",
    });
  });
});

describe("SET20 authoritative actor projection and bounded wire", () => {
  it("reads only a closed, unexpired Product session actor without browser credentials", async () => {
    const fetcher = vi.fn(async (input: Request) => {
      expect(new URL(input.url).pathname).toBe("/api/auth/session");
      return Response.json(
        {
          authenticated: true,
          subject: "user-1",
          expires_at: Date.now() + 60000,
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await createTeamClient().currentUserId()).toBe("user-1");
    const request = fetcher.mock.calls[0]?.[0] as unknown as Request;
    expect(new URL(request.url).pathname).toBe("/api/auth/session");
    expect(request.headers.has("authorization")).toBe(false);
    expect(request.credentials).toBe("same-origin");
  });
  it("rejects an unknown credential field in the actor projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            authenticated: true,
            subject: "user-1",
            expires_at: Date.now() + 60000,
            access: "not-a-browser-fact",
          },
          { headers: { "cache-control": "no-store" } },
        ),
      ),
    );
    await expect(createTeamClient().currentUserId()).rejects.toThrow();
  });
  it("rejects malformed UTF8 before generated JSON decoding can substitute characters", async () => {
    const prefix = new TextEncoder().encode(
      '{"data":[],"meta":{"request_id":"req-raw","next_cursor":null},"bad":"',
    );
    const suffix = new TextEncoder().encode('"}');
    const bytes = new Uint8Array(prefix.length + suffix.length + 1);
    bytes.set(prefix);
    bytes[prefix.length] = 0xff;
    bytes.set(suffix, prefix.length + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-request-id": "req-raw",
            },
          }),
      ),
    );
    await expect(createTeamClient().listMembers()).rejects.toMatchObject({
      code: "bff_bad_response",
    });
  });
  it("counts response headers with body in the two MiB limit", async () => {
    const raw = {
      data: [{ ...member, display_name: "x".repeat(2 * 1024 * 1024 - 280) }],
      meta: { request_id: "req-large", next_cursor: null },
    };
    // Body alone fits; declared headers put the response over the combined budget.
    const text = JSON.stringify(raw);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(
      2 * 1024 * 1024,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(text, {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-request-id": "req-large",
              "x-padding": "x".repeat(500),
            },
          }),
      ),
    );
    await expect(createTeamClient().listMembers()).rejects.toMatchObject({
      code: "bff_bad_response",
    });
  });
});
