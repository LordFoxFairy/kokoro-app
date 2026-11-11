import { describe, expect, it } from "vitest"

import { nativeSessionBffHeaders } from "@/lib/server/product-bff"

const config = {
  bffBaseUrl: "https://bff.example",
  domain: "bff.example",
  internalSecret: "fixture-secret",
  session: {
    redisUrl: "redis://127.0.0.1:6379/8",
    webOrigin: "https://app.example",
    secret: "s".repeat(32),
  },
} as const

describe("native session BFF adapter", () => {
  it("forwards only allowlisted IAM cookies and fixes the trusted origin", () => {
    const result = nativeSessionBffHeaders(
      new Request("https://app.example/api/session/sessions/one/events", {
        headers: {
          cookie: "kokoro-issuer.session_token=session; next-auth.session-token=product",
          origin: "https://attacker.example",
        },
      }),
      config,
      "native-request-1",
    )
    expect(result.state).toBe("valid")
    if (result.state !== "valid") return
    expect(result.headers.get("cookie")).toBe("kokoro-issuer.session_token=session")
    expect(result.headers.get("origin")).toBe("https://app.example")
    expect(result.headers.get("authorization")).toBeNull()
    expect(result.headers.get("x-kokoro-service")).toBe("web-bff")
    expect(result.headers.get("x-kokoro-internal-secret")).toBe("fixture-secret")
  })

  it("fails closed on duplicate or empty native cookies", () => {
    expect(
      nativeSessionBffHeaders(
        new Request("https://app.example", {
          headers: { cookie: "kokoro-issuer.session_token=one; kokoro-issuer.session_token=two" },
        }),
        config,
        "native-request-2",
      ),
    ).toEqual({ state: "invalid" })
    expect(
      nativeSessionBffHeaders(
        new Request("https://app.example", {
          headers: { cookie: "kokoro-issuer.session_token=" },
        }),
        config,
        "native-request-3",
      ),
    ).toEqual({ state: "invalid" })
  })

  it("does not treat a Product Session cookie as native authentication", () => {
    expect(
      nativeSessionBffHeaders(
        new Request("https://app.example", {
          headers: { cookie: "kokoro_product_session=product" },
        }),
        config,
        "native-request-4",
      ),
    ).toEqual({ state: "missing" })
  })
})
