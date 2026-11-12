import { describe, expect, it } from "vitest"
import { productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
const env = { NODE_ENV: "test", KOKORO_BFF_BASE_URL: "https://bff.internal", KOKORO_DOMAIN: "dev.kokoro.localhost", KOKORO_WEB_ORIGIN: "https://web.example.test", KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture" } satisfies NodeJS.ProcessEnv

describe("thin Product credential transport", () => {
  it("requires only BFF configuration, without an RP/store", () => {
    expect(productBffConfig(env)).not.toBeNull()
    expect(productBffConfig({ ...env, KOKORO_BFF_BASE_URL: "" })).toBeNull()
  })
  it("transports allowlisted native cookies but never browser identity/bearer headers", () => {
    const headers = productBffHeaders(productBffConfig(env)!, new Request(env.KOKORO_WEB_ORIGIN, { headers: { cookie: "kokoro-issuer.session_token=session; other=private", authorization: "Bearer user", "x-kokoro-actor-id": "attacker" } }), "request-1")
    expect(headers.get("cookie")).toBe("kokoro-issuer.session_token=session")
    expect(headers.get("origin")).toBe(env.KOKORO_WEB_ORIGIN)
    for (const name of ["authorization","x-kokoro-actor-id","x-kokoro-tenant-id","x-kokoro-principal-id"]) expect(headers.get(name)).toBeNull()
  })
  it("lets BFF decide absent authentication and rejects ambiguous credentials locally", () => {
    const config = productBffConfig(env)!
    expect(productBffHeaders(config,new Request(env.KOKORO_WEB_ORIGIN),"request-1").get("cookie")).toBeNull()
    expect(() => productBffHeaders(config,new Request(env.KOKORO_WEB_ORIGIN,{headers:{cookie:"kokoro-issuer.session_token=a; kokoro-issuer.session_token=b"}}),"request-1")).toThrow()
  })
})
