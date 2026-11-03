import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openProductSignIn,
  endProductSession,
  refreshProductSession,
  readProductSignInReturnTarget,
} from "@/ui/auth/product-auth-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("confirmed Product signout across tabs", () => {
  const marker = "kokoro.web.auth-index-subject";
  const handoff = "/iam/oauth2/end-session?client_id=web";
  const csrf = () => Response.json({ csrfToken: "Token123" });

  it.each([
    [200, "signed_out"],
    [503, "browser_cookie_cleared"],
  ])("retires only the original browser hint after %s / %s", async (status, outcome) => {
    window.localStorage.setItem(marker, "reader-a");
    window.localStorage.setItem("unrelated-preference", "keep");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(
      Response.json({ status: outcome, issuer_end_session_url: handoff }, { status: Number(status) }),
    ));
    const navigate = vi.fn();
    await endProductSession(navigate);
    expect(window.localStorage.getItem(marker)).toBeNull();
    expect(window.localStorage.getItem("unrelated-preference")).toBe("keep");
    expect(navigate).toHaveBeenCalledExactlyOnceWith(handoff);
  });

  it("does not announce or navigate on the server's stale-generation ACK", async () => {
    window.localStorage.setItem(marker, "reader-a");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(
      Response.json({ status: "stale_session", remote_revocation: "not_required" }),
    ));
    const navigate = vi.fn();
    await expect(endProductSession(navigate)).rejects.toThrow();
    expect(window.localStorage.getItem(marker)).toBe("reader-a");
    expect(navigate).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not clear a replacement actor or follow a late old-actor ACK", async () => {
    window.localStorage.setItem(marker, "reader-a");
    let settle!: (body: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce({
      ok: true, status: 200, json: () => new Promise((resolve) => { settle = resolve; }),
    }));
    const navigate = vi.fn();
    const pending = endProductSession(navigate);
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    window.localStorage.setItem(marker, "reader-b");
    settle({ status: "signed_out", issuer_end_session_url: handoff });
    await expect(pending).rejects.toThrow();
    expect(window.localStorage.getItem(marker)).toBe("reader-b");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not retire a browser hint for a failed signout", async () => {
    window.localStorage.setItem(marker, "reader-a");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(
      Response.json({ error: "unavailable" }, { status: 500 }),
    ));
    await expect(endProductSession(vi.fn())).rejects.toThrow();
    expect(window.localStorage.getItem(marker)).toBe("reader-a");
  });

  it("retires an old ACK after observed cross-tab A to B to A", async () => {
    window.localStorage.setItem(marker, "reader-a");
    let settle!: (body: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce({
      status: 200, json: () => new Promise((resolve) => { settle = resolve; }),
    }));
    const navigate = vi.fn();
    const pending = endProductSession(navigate);
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    window.dispatchEvent(new StorageEvent("storage", {
      key: marker, oldValue: "reader-a", newValue: "reader-b", storageArea: window.localStorage,
    }));
    window.dispatchEvent(new StorageEvent("storage", {
      key: marker, oldValue: "reader-b", newValue: "reader-a", storageArea: window.localStorage,
    }));
    settle({ status: "signed_out", issuer_end_session_url: handoff });
    await expect(pending).rejects.toThrow();
    expect(window.localStorage.getItem(marker)).toBe("reader-a");
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(["getItem", "removeItem"] as const)("still hands off a confirmed signout when storage %s fails", async (method) => {
    window.localStorage.setItem(marker, "reader-a");
    vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("storage unavailable"); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(
      Response.json({ status: "signed_out", issuer_end_session_url: handoff }),
    ));
    const navigate = vi.fn();
    await endProductSession(navigate);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(handoff);
  });

  it.each(["preference", "session-storage"])("ignores an unrelated %s storage event", async (kind) => {
    window.localStorage.setItem(marker, "reader-a");
    let settle!: (body: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce({
      status: 200, json: () => new Promise((resolve) => { settle = resolve; }),
    }));
    const navigate = vi.fn();
    const pending = endProductSession(navigate);
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    window.dispatchEvent(new StorageEvent("storage", {
      key: kind === "preference" ? "unrelated-preference" : marker,
      oldValue: "before", newValue: "after",
      storageArea: kind === "preference" ? window.localStorage : window.sessionStorage,
    }));
    settle({ status: "signed_out", issuer_end_session_url: handoff });
    await pending;
    expect(window.localStorage.getItem(marker)).toBeNull();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(handoff);
  });

  it.each([{}, [], { status: "signed_out" }, { status: "browser_cookie_cleared" }])(
    "does not retire a marker for an unknown or mismatched success ACK %j", async (raw) => {
      window.localStorage.setItem(marker, "reader-a");
      const status = typeof raw === "object" && raw !== null && "status" in raw && raw.status === "signed_out" ? 503 : 200;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(Response.json(raw, { status })));
      const navigate = vi.fn();
      await expect(endProductSession(navigate)).rejects.toThrow();
      expect(window.localStorage.getItem(marker)).toBe("reader-a");
      expect(navigate).not.toHaveBeenCalled();
    },
  );
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
              status: "signed_out",
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "signed_out", issuer_end_session_url: "https://evil.example/signout" }), { status: 200 })));
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

describe("tab-local login recovery intent", () => {
  it("retains only a validated navigation target across the failed login document", () => {
    const target = "/app/library?tab=files&type=documents&view=list#/account/settings/account";
    window.history.replaceState({}, "", target);
    openProductSignIn(vi.fn());
    window.history.replaceState({}, "", "/auth/sign-in/failed");
    expect(readProductSignInReturnTarget()).toBe(target);
  });

  it.each(["expired", "unbounded", "external", "malformed"])("discards %s recovery intent", (kind) => {
    window.history.replaceState({}, "", "/app#/account/settings/mcp");
    openProductSignIn(vi.fn());
    const key = window.sessionStorage.key(0)!;
    const raw = JSON.parse(window.sessionStorage.getItem(key)!);
    if (kind === "expired") raw.expiresAt = Date.now() - 1;
    if (kind === "unbounded") raw.expiresAt = Date.now() + 86_400_000;
    if (kind === "external") raw.target = "https://example.invalid/";
    window.sessionStorage.setItem(key, kind === "malformed" ? "{" : JSON.stringify(raw));
    expect(readProductSignInReturnTarget()).toBeNull();
  });

  it("still starts normal login when tab storage is unavailable", () => {
    window.history.replaceState({}, "", "/app#/account/settings/team");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const navigate = vi.fn();
    openProductSignIn(navigate);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(`/login?${new URLSearchParams({ return_to: "/app#/account/settings/team" })}`);
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
    window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-a")
    let release!: (raw: unknown) => void
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ csrfToken: "Token123" }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => new Promise((resolve) => { release = resolve }) }))
    const pending = endProductSession(navigate, controller.signal).catch(() => undefined)
    await vi.waitFor(() => expect(release).toBeTypeOf("function"))
    controller.abort()
    release({ status: "signed_out", issuer_end_session_url: "/iam/oauth2/end-session?client_id=web" })
    await pending
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(navigate).not.toHaveBeenCalled()
    expect(window.localStorage.getItem("kokoro.web.auth-index-subject")).toBe("reader-a")
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
