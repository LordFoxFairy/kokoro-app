import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentProductSession } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
}));
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }));

import {
  admittedProductSession,
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
  beforeEach(() => currentProductSession.mockReset());

  it("requires the complete online Product Session configuration", () => {
    expect(productBffConfig(env)).not.toBeNull();
    expect(productBffConfig({ ...env, KOKORO_WEB_REDIS_URL: "" })).toBeNull();
    expect(
      productBffConfig({ ...env, KOKORO_WEB_AUTH_SECRET: "short" }),
    ).toBeNull();
  });

  it("fails closed on inspection errors and expired access", async () => {
    const config = productBffConfig(env)!;
    currentProductSession.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      admittedProductSession(new Request(env.KOKORO_WEB_ORIGIN), config),
    ).rejects.toBeInstanceOf(ProductSessionUnavailableError);
    currentProductSession.mockResolvedValueOnce({
      accessExpiresAt: Date.now() - 1,
    });
    await expect(
      admittedProductSession(new Request(env.KOKORO_WEB_ORIGIN), config),
    ).resolves.toBeNull();
  });

  it("emits one Product Bearer plus service identity and no self-asserted identity", () => {
    const config = productBffConfig(env)!;
    const headers = productBffHeaders(
      config,
      { access: "product-access" } as never,
      "request-1",
    );
    expect(headers.get("authorization")).toBe("Bearer product-access");
    expect(headers.get("x-kokoro-service")).toBe("web-bff");
    expect(headers.get("x-kokoro-request-id")).toBe("request-1");
    expect(headers.get("x-kokoro-namespace")).toBeNull();
    expect(headers.get("x-kokoro-principal-id")).toBeNull();
    expect(headers.get("x-kokoro-tenant-id")).toBeNull();
  });
});
