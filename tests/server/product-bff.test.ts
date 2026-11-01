import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestWithDomain } = vi.hoisted(() => ({
  requestWithDomain: vi.fn(),
}));
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain }));

import {
  admittedNativeSession,
  nativeProductBffConfig,
  productBffConfig,
  productBffHeaders,
  ProductSessionUnavailableError,
} from "@/lib/server/product-bff";

const env = {
  NODE_ENV: "test",
  KOKORO_BFF_BASE_URL: "https://bff.internal",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_WEB_ORIGIN: "https://web.example.test",
  KOKORO_WEB_REDIS_URL: "redis://127.0.0.1:6379/9",
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_INTERNAL_SECRET_WEB_BFF: "service-secret",
} satisfies NodeJS.ProcessEnv;

describe("Product BFF admission", () => {
  beforeEach(() => {
    requestWithDomain.mockReset();
  });

  it("requires only native BFF configuration", () => {
    expect(productBffConfig(env)).not.toBeNull();
    expect(productBffConfig({ ...env, KOKORO_WEB_REDIS_URL: "", KOKORO_WEB_AUTH_SECRET: "" })).not.toBeNull();
    expect(productBffConfig({ ...env, KOKORO_BFF_BASE_URL: "" })).toBeNull();
  });

  it("fails closed without a native cookie and maps native admission errors", async () => {
    const config = productBffConfig(env)!;
    await expect(
      admittedNativeSession(new Request(env.KOKORO_WEB_ORIGIN), config),
    ).resolves.toBeNull();
    requestWithDomain.mockRejectedValueOnce(new Error("bff unavailable"));
    await expect(
      admittedNativeSession(new Request(env.KOKORO_WEB_ORIGIN, {
        headers: { cookie: "kokoro-issuer.session_token=session" },
      }), config),
    ).rejects.toBeInstanceOf(ProductSessionUnavailableError);
    requestWithDomain.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "native_session_invalid" } }), {
      status: 401, headers: { "content-type": "application/json" },
    }));
    await expect(
      admittedNativeSession(new Request(env.KOKORO_WEB_ORIGIN, {
        headers: { cookie: "kokoro-issuer.session_token=session" },
      }), config),
    ).resolves.toBeNull();
    expect(requestWithDomain).toHaveBeenCalledTimes(2);
  });

  it("emits the native cookie plus service identity and no bearer", () => {
    const config = productBffConfig(env)!;
    const headers = productBffHeaders(
      config,
      { nativeCookie: "kokoro-issuer.session_token=session" } as never,
      "request-1",
    );
    expect(headers.get("cookie")).toBe("kokoro-issuer.session_token=session");
    expect(headers.get("x-kokoro-service")).toBe("web-bff");
    expect(headers.get("x-kokoro-request-id")).toBe("request-1");
    expect(headers.get("x-kokoro-namespace")).toBeNull();
    expect(headers.get("x-kokoro-principal-id")).toBeNull();
    expect(headers.get("x-kokoro-tenant-id")).toBeNull();
  });

  it("admitted native sessions call BFF identity once and emit cookie auth without a bearer", async () => {
    const config = productBffConfig(env)!;
    requestWithDomain.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { user_id: "user-1", tenant_id: "tenant-1", platform_admin: false },
        meta: { request_id: "native-request" },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const request = new Request(env.KOKORO_WEB_ORIGIN!, {
      headers: { cookie: "kokoro-issuer.session_token=session; next-auth.session-token=legacy" },
    });
    const claims = await admittedNativeSession(request, config);
    expect(claims).toMatchObject({ subject: "user-1", nativeCookie: "kokoro-issuer.session_token=session" });
    const headers = productBffHeaders(config, claims!, "native-request");
    expect(headers.get("cookie")).toBe("kokoro-issuer.session_token=session");
    expect(headers.get("origin")).toBe(env.KOKORO_WEB_ORIGIN);
    expect(headers.get("authorization")).toBeNull();
    expect(requestWithDomain).toHaveBeenCalledExactlyOnceWith(
      "https://bff.internal/v1/me",
      "dev.kokoro.localhost",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("builds and admits a native session without legacy Redis, RP secret, or OIDC client settings", async () => {
    const native = nativeProductBffConfig({
      NODE_ENV: "test",
      KOKORO_BFF_BASE_URL: "https://bff.internal",
      KOKORO_DOMAIN: "dev.kokoro.localhost",
      KOKORO_WEB_ORIGIN: "https://web.example.test",
      KOKORO_INTERNAL_SECRET_WEB_BFF: "service-secret",
    });
    expect(native).toMatchObject({ bffBaseUrl: "https://bff.internal", domain: "dev.kokoro.localhost", internalSecret: "service-secret" });
    requestWithDomain.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { user_id: "user-native", tenant_id: "tenant-native", platform_admin: false },
        meta: { request_id: "native-request" },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const claims = await admittedNativeSession(new Request("https://web.example.test", {
      headers: { cookie: "kokoro-issuer.session_token=session" },
    }), native!);
    expect(claims).toMatchObject({ id: "native-session", subject: "user-native", nativeCookie: "kokoro-issuer.session_token=session" });
  });

});
