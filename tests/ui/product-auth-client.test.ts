import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openProductSignIn,
  endProductSession,
  refreshProductSession,
} from "@/ui/auth/product-auth-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("Product auth browser client", () => {
  it("uses CSRF-protected Product signout and follows only the issuer handoff", async () => {
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ csrfToken: "Token123" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              issuer_end_session_url: "/iam/oauth2/end-session?client_id=web",
            }),
            { status: 200 },
          ),
        ),
    );
    await endProductSession(navigate);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/auth/signout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/iam/oauth2/end-session?client_id=web");
  });

  it("does not navigate to an attacker-controlled signout URL", async () => {
    const navigate = vi.fn();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "Token123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ issuer_end_session_url: "https://evil.example/signout" }), { status: 200 })));
    await endProductSession(navigate);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/");
  });
});


describe("Product session refresh consumer", () => {
  const projection = { authenticated: true, subject: "reader-a", expires_at: Date.now() + 3_600_000 };
  it("consumes CSRF then the existing form POST with one caller signal", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "a".repeat(64) }))
      .mockResolvedValueOnce(Response.json(projection));
    vi.stubGlobal("fetch", fetchMock);
    await expect(refreshProductSession(signal)).resolves.toEqual({ mode: "authenticated", subject: "reader-a" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/csrf", { cache: "no-store", signal });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/session", expect.objectContaining({
      method: "POST", cache: "no-store", signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }));
    expect(fetchMock.mock.calls[1]?.[1].body.toString()).toBe(`csrfToken=${"a".repeat(64)}`);
  });
  it.each([401, 409])("returns only read confirmation for refresh %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "a".repeat(64) }))
      .mockResolvedValueOnce(Response.json({ error: "refresh_conflict" }, { status })));
    await expect(refreshProductSession(new AbortController().signal)).resolves.toEqual({ mode: "confirm" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...projection, subject: " " },
    { ...projection, expires_at: "2026-10-05T13:36:40.220Z" },
    { ...projection, expires_at: 0 },
    { ...projection, expires_at: null },
    { authenticated: true, subject: "reader-a" },
    { ...projection, access_token: "sensitive" },
    { ...projection, authenticated: false },
  ])("rejects invalid refresh success projection %j", async (raw) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "a".repeat(64) }))
      .mockResolvedValueOnce(Response.json(raw)));
    await expect(refreshProductSession(new AbortController().signal)).rejects.toThrow();
  });
  it("does not dispatch POST after a late CSRF body settles following abort", async () => {
    const controller = new AbortController();
    let settle!: (raw: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { settle = resolve; }) }));
    const request = refreshProductSession(controller.signal);
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    controller.abort();
    settle({ csrfToken: "a".repeat(64) });
    await expect(request).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects an already aborted chain before CSRF dispatch", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn());
    await expect(refreshProductSession(controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});


describe("mounted actual product return intent", () => {
  it.each([
    "/app?conversation=conv_00000000-0000-4000-8000-000000000302",
    "/app/project/project_00000000-0000-4000-8000-000000000301?conversation=conv_00000000-0000-4000-8000-000000000302",
    "/app/library?type=images&view=list",
  ])("retains the actual window path and query %s", (target) => {
    window.history.replaceState({}, "", target + "#ignored");
    const navigate = vi.fn();
    openProductSignIn(navigate);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(`/login?${new URLSearchParams({ return_to: target })}`);
  });
  it.each(["/api/auth/session", "/app?unknown=value", "/app/project/arbitrary"])("falls back without forwarding invalid intent %s", (target) => {
    window.history.replaceState({}, "", target);
    const navigate = vi.fn();
    openProductSignIn(navigate);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/login");
  });
});

describe("SET20 retired Team signout RED", () => {
  it("does not POST signout after its caller retires during the CSRF body", async () => {
    const controller = new AbortController()
    const navigate = vi.fn()
    let release!: (raw: unknown) => void
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => new Promise((resolve) => { release = resolve }) })
      .mockResolvedValueOnce(Response.json({ issuer_end_session_url: "/iam/oauth2/end-session?client_id=web" }))
    vi.stubGlobal("fetch", fetcher)
    // Reflect invokes the existing public function with the future optional caller signal;
    // no nonexistent module or TypeScript error is used as a behavioral oracle.
    const pending = Reflect.apply(endProductSession, undefined, [navigate, controller.signal]).catch(() => undefined)
    await vi.waitFor(() => expect(release).toBeTypeOf("function"))
    controller.abort()
    release({ csrfToken: "Token123" })
    await pending
    expect(fetcher).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe("SET20 signout result retirement", () => {
  it("does not navigate after a late signout body settles for a retired caller", async () => {
    const controller = new AbortController()
    const navigate = vi.fn()
    let release!: (raw: unknown) => void
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ csrfToken: "Token123" }))
      .mockResolvedValueOnce({ ok: true, json: () => new Promise((resolve) => { release = resolve }) }))
    const pending = endProductSession(navigate, controller.signal).catch(() => undefined)
    await vi.waitFor(() => expect(release).toBeTypeOf("function"))
    controller.abort()
    release({ issuer_end_session_url: "/iam/oauth2/end-session?client_id=web" })
    await pending
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(navigate).not.toHaveBeenCalled()
  })
  it("does not read CSRF for an already retired caller", async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal("fetch", vi.fn())
    await expect(endProductSession(vi.fn(), controller.signal)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})

it("checks retirement between successful CSRF return and the signout continuation", async () => {
  const controller = new AbortController()
  const navigate = vi.fn()
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: () => {
    const body = Promise.resolve({ csrfToken: "Token123" })
    // The first job queues abort after currentCsrf's own final check, but before
    // endProductSession resumes and would dispatch the noncooperative POST.
    void body.then(() => queueMicrotask(() => controller.abort()))
    return body
  } }).mockResolvedValueOnce(Response.json({ issuer_end_session_url: "/iam/oauth2/end-session?client_id=web" }))
  vi.stubGlobal("fetch", fetcher)
  await expect(endProductSession(navigate, controller.signal)).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledOnce()
  expect(navigate).not.toHaveBeenCalled()
})

it("encodes the known settings return fragment inside the login query, not after it", () => {
  window.history.replaceState({}, "", "/app#/account/settings/mcp")
  const navigate = vi.fn()
  openProductSignIn(navigate)
  expect(navigate).toHaveBeenCalledExactlyOnceWith(`/login?${new URLSearchParams({ return_to: "/app#/account/settings/mcp" })}`)
})


it("consumes one caller-preloaded CSRF result without starting a second CSRF read", async () => {
  const controller = new AbortController()
  let finish!: (token: string) => void
  const pending = new Promise<string>(resolve => { finish = resolve })
  const dispatch = vi.fn()
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ authenticated: true, subject: "reader-a", expires_at: Date.now() + 3_600_000 }))
  vi.stubGlobal("fetch", fetchMock)
  const result = refreshProductSession(controller.signal, dispatch, pending)
  void result.catch(() => undefined)
  try {
    expect(fetchMock).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    finish("a".repeat(64))
    await expect(result).resolves.toEqual({ mode: "authenticated", subject: "reader-a" })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/session", expect.objectContaining({ method: "POST", signal: controller.signal }))
    expect(fetchMock.mock.calls[0]![1].body.toString()).toBe(`csrfToken=${"a".repeat(64)}`)
    expect(dispatch).toHaveBeenCalledTimes(1)
  } finally { controller.abort() }
})
