import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginProductSignIn,
  endProductSession,
} from "@/ui/auth/product-auth-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Product auth browser client", () => {
  it("obtains CSRF then submits the fixed Product OIDC provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ csrfToken: "Token123" }), {
          status: 200,
        }),
      ),
    );
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    await beginProductSignIn();
    const form = document.querySelector("form")!;
    expect(fetch).toHaveBeenCalledWith("/api/auth/csrf", { cache: "no-store" });
    expect(form.action).toContain("/api/auth/signin/kokoro-iam");
    expect(new FormData(form).get("csrfToken")).toBe("Token123");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("does not submit after the login page cancels an in-flight CSRF request", async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => undefined);
    const controller = new AbortController();
    const attempt = beginProductSignIn(controller.signal);
    controller.abort();
    resolveFetch(new Response(JSON.stringify({ csrfToken: "Token123" }), { status: 200 }));
    await expect(attempt).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/csrf", { cache: "no-store", signal: controller.signal });
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector("form")).toBeNull();
  });

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
