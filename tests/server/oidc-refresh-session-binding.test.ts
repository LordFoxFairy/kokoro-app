import { createServer, type Server } from "node:http"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { once } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
// Run the unchanged bounded transport; Next alone supplies server-only's build marker.
vi.mock("@/lib/server/oidc-bff-agent", async () => {
  const { readFileSync } = await import("node:fs"),
    { createRequire } = await import("node:module"),
    ts = await import("typescript")
  const policy = await import("@/lib/server/iam-relay-policy")
  const require = createRequire(import.meta.url),
    exports = {} as typeof import("@/lib/server/oidc-bff-agent")
  const emitted = ts.transpileModule(readFileSync("src/lib/server/oidc-bff-agent.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  new Function("require", "exports", emitted)(
    (name: string) => (name === "server-only" ? {} : name === "./iam-relay-policy" ? policy : require(name)),
    exports,
  )
  return exports
})
import { oidcRpConfig, type OidcRpConfig } from "@/lib/server/oidc-provider"
import { refreshOidcToken } from "@/lib/server/oidc-token"
const keys = generateKeyPairSync("ed25519"),
  wrongKeys = generateKeyPairSync("ed25519")
const publicJwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "session-binding-key", alg: "EdDSA", use: "sig" }
const expected = { subject: "user-one", issuerSessionId: "issuer-one" }
let timers = new Set<ReturnType<typeof setTimeout>>(),
  tokenDelay = 0,
  jwksDelay = 0,
  byRefresh: Record<string, Record<string, unknown>> = {}
const delayed = (fn: () => void, ms: number) => {
  if (!ms) {
    fn()
    return
  }
  const timer = setTimeout(() => {
    timers.delete(timer)
    fn()
  }, ms)
  timers.add(timer)
}
let server: Server,
  config: OidcRpConfig,
  tokenCalls: number,
  jwksCalls: number,
  tokenOverride: Record<string, unknown>,
  signingKey: typeof keys.privateKey
function token(claims: Record<string, unknown> = {}, algorithm = "EdDSA") {
  const now = Math.floor(Date.now() / 1000),
    payload = {
      iss: config.issuer,
      aud: config.clientId,
      sub: expected.subject,
      sid: expected.issuerSessionId,
      iat: now,
      exp: now + 600,
      ...claims,
    }
  const raw =
    Buffer.from(JSON.stringify({ alg: algorithm, typ: "JWT", kid: publicJwk.kid })).toString("base64url") +
    "." +
    Buffer.from(JSON.stringify(payload)).toString("base64url")
  return raw + "." + sign(null, Buffer.from(raw), signingKey).toString("base64url")
}
const refresh = () => refreshOidcToken(config, "refresh-original", new AbortController().signal, expected)
beforeEach(async () => {
  tokenCalls = 0
  jwksCalls = 0
  tokenDelay = 0
  jwksDelay = 0
  byRefresh = {}
  tokenOverride = {}
  signingKey = keys.privateKey
  server = createServer((request, response) => {
    expect(request.headers["x-kokoro-service"]).toBe("web-bff")
    expect(request.headers["x-kokoro-internal-secret"]).toBe("binding-service-secret")
    expect(request.headers.cookie).toBeUndefined()
    if (request.url === "/iam/jwks") {
      jwksCalls++
      delayed(() => {
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [publicJwk] }))
      }, jwksDelay)
      return
    }
    if (request.url !== "/iam/oauth2/token") {
      response.writeHead(404).end()
      return
    }
    tokenCalls++
    let raw = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      raw += chunk
    })
    request.on("end", () => {
      const form = new URLSearchParams(raw)
      expect(form.get("grant_type")).toBe("refresh_token")
      expect(["refresh-original", ...Object.keys(byRefresh)]).toContain(form.get("refresh_token"))
      expect(form.getAll("resource")).toEqual(["https://kokoro.dev/resources/iam-internal"])
      expect(request.headers.authorization).toBe(
        `Basic ${Buffer.from("session-client:session-client-secret").toString("base64")}`,
      )
      delayed(() => {
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(
            JSON.stringify({
              access_token: "access-next",
              refresh_token: "refresh-next",
              expires_in: 600,
              token_type: "Bearer",
              id_token: token(),
              ...tokenOverride,
              ...byRefresh[form.get("refresh_token") ?? ""],
            }),
          )
      }, tokenDelay)
    })
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error()
  const value = oidcRpConfig({
    NODE_ENV: "test",
    KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`,
    KOKORO_WEB_ORIGIN: "https://session.example.test",
    KOKORO_DOMAIN: "session.example.test",
    KOKORO_TENANT_ID: "tenant-one",
    KOKORO_INTERNAL_SECRET_WEB_BFF: "binding-service-secret",
    KOKORO_OIDC_CLIENT_ID: "session-client",
    KOKORO_OIDC_CLIENT_SECRET: "session-client-secret",
    KOKORO_WEB_AUTH_SECRET: createHash("sha256").update("fixture-auth").digest("hex"),
    KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9",
    NEXTAUTH_URL: "https://session.example.test/api/auth",
  })
  if (!value) throw new Error("Invalid isolated RP profile")
  config = value
})
afterEach(async () => {
  for (const timer of timers) clearTimeout(timer)
  timers = new Set()
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})
describe("native refresh cryptographic issuer-session continuity", () => {
  it("accepts the same signed issuer, client, subject and sid through one token exchange", async () => {
    expect(await refresh()).toEqual({ access: "access-next", refresh: "refresh-next", expiresIn: 600 })
    expect(tokenCalls).toBe(1)
    expect(jwksCalls).toBe(1)
  })
  it.each([
    { sid: "other-session" },
    { sub: "other-user" },
    { iss: "https://other-issuer.test" },
    { aud: "other-client" },
    { sid: null },
    { sid: "" },
    { exp: 1 },
    { at_hash: "wrong-access-hash" },
  ])("rejects changed or invalid verified claims %j", async (claims) => {
    tokenOverride = { id_token: token(claims) }
    await expect(refresh()).rejects.toThrow()
    expect(tokenCalls).toBe(1)
  })
  it("rejects an invalid signature rather than trusting decoded sid", async () => {
    signingKey = wrongKeys.privateKey
    await expect(refresh()).rejects.toThrow()
    expect(tokenCalls).toBe(1)
  })
  it("requires a new verified ID token, without a compatibility decode or another exchange", async () => {
    tokenOverride = { id_token: null }
    await expect(refresh()).rejects.toThrow()
    expect(tokenCalls).toBe(1)
  })
  it.each([0, 3601, 0.5])("keeps the original declared token lifetime boundary %s", async (expires_in) => {
    tokenOverride = { expires_in }
    await expect(refresh()).rejects.toThrow()
    expect(tokenCalls).toBe(1)
  })
  it("rejects an unexpected signing algorithm", async () => {
    tokenOverride = { id_token: token({}, "HS256") }
    await expect(refresh()).rejects.toThrow()
    expect(tokenCalls).toBe(1)
  })
  it("uses one absolute budget for a slow token exchange plus slow JWKS", async () => {
    tokenDelay = 2750
    jwksDelay = 2750
    const started = Date.now()
    await expect(refresh()).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(6500)
    expect(tokenCalls).toBe(1)
    expect(jwksCalls).toBe(1)
  }, 10000)
  it("aborts a pending JWKS read without accepting tokens or exchanging again", async () => {
    jwksDelay = 2500
    const controller = new AbortController()
    const pending = refreshOidcToken(config, "refresh-original", controller.signal, expected)
    const rejection = expect(pending).rejects.toThrow("OIDC refresh session verification failed")
    await vi.waitFor(() => expect(jwksCalls).toBe(1))
    controller.abort()
    await rejection
    expect(tokenCalls).toBe(1)
    expect(jwksCalls).toBe(1)
  })
  it("keeps parallel native verifiers and response TokenSets request-local", async () => {
    const a = { subject: "user-one", issuerSessionId: "issuer-a" },
      b = { subject: "user-one", issuerSessionId: "issuer-b" }
    byRefresh = {
      "refresh-a": { id_token: token({ sid: a.issuerSessionId }), access_token: "access-a", refresh_token: "next-a" },
      "refresh-b": { id_token: token({ sid: b.issuerSessionId }), access_token: "access-b", refresh_token: "next-b" },
    }
    const result = await Promise.all([
      refreshOidcToken(config, "refresh-a", new AbortController().signal, a),
      refreshOidcToken(config, "refresh-b", new AbortController().signal, b),
    ])
    expect(result.map((r) => r.access)).toEqual(["access-a", "access-b"])
    expect(tokenCalls).toBe(2)
    expect(jwksCalls).toBe(2)
  })
})
