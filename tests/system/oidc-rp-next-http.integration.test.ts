import { spawn, type ChildProcess } from "node:child_process"
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto"
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createServer, request as httpRequest, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"

import { createClient } from "redis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

type HttpResult = Readonly<{ status: number; headers: Readonly<Record<string, string | string[] | undefined>>; body: string }>

function oidcStateKeyPrefix(webOrigin: string): string {
  return `kokoro:web:oidc-state:${createHash("sha256").update(webOrigin).digest("hex")}:`
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
  return address.port
}

async function unusedPort(): Promise<number> {
  const server = createServer()
  const port = await listen(server)
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

function http(port: number, target: string, method = "GET", body = "", extra: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path: target, method,
      headers: { host: `localhost:${port}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...extra } }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8") }))
    })
    request.once("error", reject)
    request.end(body)
  })
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve() }, 5_000)
    child.once("exit", () => { clearTimeout(timer); resolve() })
    child.kill("SIGTERM")
  })
}

async function isolatedNext(projectRoot: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "kokoro-oidc-rp-next-"))
  try {
    await cp(path.join(projectRoot, "src"), path.join(root, "src"), { recursive: true })
    await cp(path.join(projectRoot, "public"), path.join(root, "public"), { recursive: true })
    const fixtureRoute = path.join(root, "src", "app", "api", "rp-preabort-fixture", "route.ts")
    await mkdir(path.dirname(fixtureRoute), { recursive: true })
    await writeFile(fixtureRoute, `import { request as httpRequest } from "node:http"
import { custom } from "openid-client"
import { boundedOidcBffAgent } from "@/lib/server/oidc-bff-agent"
import { oidcAuthOptions, oidcRpConfig } from "@/lib/server/oidc-provider"
export const runtime = "nodejs"
export async function GET(): Promise<Response> {
  const url = new URL("/iam/oauth2/token", process.env.KOKORO_BFF_BASE_URL)
  const controller = new AbortController()
  controller.abort()
  const settled = await Promise.race([
    new Promise<boolean>((resolve) => {
      const request = httpRequest(url, { method: "POST", agent: boundedOidcBffAgent(url, controller.signal) },
        (response) => { response.resume(); resolve(false) })
      request.once("error", () => resolve(true))
      request.end()
    }),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 700)),
  ])
  const config = oidcRpConfig(process.env)
  if (config === null) return new Response(null, { status: 503 })
  let calls = 0
  const fakeClient: any = { issuer: {}, callback: async () => { calls += 1 }, userinfo: async () => { calls += 1 } }
  const provider: any = oidcAuthOptions(config, () => undefined, controller.signal).providers[0]
  let tokenRejected = false
  let userinfoRejected = false
  try { await provider.token.request({ client: fakeClient, params: {}, checks: {}, provider: { callbackUrl: config.callbackUrl } }) }
  catch (error) { tokenRejected = error instanceof Error && error.name === "AbortError" }
  try { await provider.userinfo.request({ client: fakeClient, tokens: {} }) }
  catch (error) { userinfoRejected = error instanceof Error && error.name === "AbortError" }
  const jwksController = new AbortController()
  const jwksProvider: any = oidcAuthOptions(config, () => undefined, jwksController.signal).providers[0]
  const jwksClient: any = { issuer: {}, callback: async () => {
    jwksController.abort()
    const hook = jwksClient.issuer[custom.http_options]
    return hook(new URL("/iam/jwks", config.relay.bffOrigin), {})
  } }
  let jwksRejected = false
  try { await jwksProvider.token.request({ client: jwksClient, params: {}, checks: {}, provider: { callbackUrl: config.callbackUrl } }) }
  catch (error) { jwksRejected = error instanceof Error && error.name === "AbortError" }
  return Response.json({ settled, tokenRejected, userinfoRejected, jwksRejected, calls })
}
`)
    for (const name of ["package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) await cp(path.join(projectRoot, name), path.join(root, name))
    await symlink(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "dir")
    return root
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error }
}

function cookieHeader(...responses: HttpResult[]): string {
  const cookies = new Map<string, string>()
  for (const response of responses) for (const cookie of response.headers["set-cookie"] as string[] | undefined ?? []) {
    const pair = cookie.split(";")[0] ?? ""
    const name = pair.slice(0, pair.indexOf("="))
    if (cookie.includes("Max-Age=0")) cookies.delete(name)
    else cookies.set(name, pair)
  }
  return [...cookies.values()].join("; ")
}

function jwt(privateKey: KeyObject, payload: Record<string, unknown>, algorithm: "EdDSA" | "RS256" = "EdDSA"): string {
  const header = Buffer.from(JSON.stringify({ alg: algorithm, typ: "JWT", kid: algorithm === "EdDSA" ? "fixture-key" : "rsa-key" })).toString("base64url")
  const claims = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const body = `${header}.${claims}`
  return `${body}.${sign(algorithm === "EdDSA" ? null : "RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`
}

describe("RP through real Next HTTP and strict BFF fixture", { timeout: 30_000 }, () => {
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL ?? "redis://127.0.0.1:6379/9"
  const clientId = "web-rp-fixture"
  const clientSecret = "web-rp-secret"
  const keys = generateKeyPairSync("ed25519")
  const wrongKeys = generateKeyPairSync("ed25519")
  const rsaKeys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const publicJwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "fixture-key", use: "sig", alg: "EdDSA" }
  const rsaJwk = { ...rsaKeys.publicKey.export({ format: "jwk" }), kid: "rsa-key", use: "sig", alg: "RS256" }
  const issuedStates = new Set<string>()
  const paths: string[] = []
  let root: string | undefined
  let bff: Server | undefined
  let next: ChildProcess | undefined
  let nextPort = 0
  let nonce = ""
  let invalidIdToken: "none" | "nonce" | "issuer" | "audience" | "signature" | "algorithm" | "expired" = "none"
  let invalidUserinfoSubject = false
  let oversizedResponse: "none" | "token" | "userinfo" | "jwks" = "none"
  let slowResponse: "none" | "token" | "userinfo" = "none"
  let onTokenStarted: (() => void) | undefined
  let onTokenClosed: (() => void) | undefined
  let output = ""

  function sendJson(response: import("node:http").ServerResponse, endpoint: "token" | "userinfo" | "jwks", body: object): void {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    const payload = JSON.stringify(oversizedResponse === endpoint ? { ...body, padding: "x".repeat(1_100_000) } : body)
    if (slowResponse === endpoint) {
      response.write(payload.slice(0, 16))
      const timer = setTimeout(() => response.end(payload.slice(16)), 6_000)
      response.once("close", () => clearTimeout(timer))
      return
    }
    response.write(payload)
    response.end()
  }

  async function cleanup(): Promise<void> {
    if (next !== undefined) { const child = next; next = undefined; await stop(child) }
    if (bff !== undefined) { const server = bff; bff = undefined; await close(server) }
    if (root !== undefined) { const directory = root; root = undefined; await rm(directory, { recursive: true, force: true }) }
    if (issuedStates.size > 0 && nextPort !== 0) {
      const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
      client.on("error", () => undefined)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          (async () => { await client.connect(); await client.del([...issuedStates].map((state) =>
            `${oidcStateKeyPrefix(`http://localhost:${nextPort}`)}${createHash("sha256").update(state).digest("hex")}`)) })(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("RP Redis cleanup deadline")), 2_000) }),
        ])
      } finally { if (timer !== undefined) clearTimeout(timer); client.destroy() }
    }
  }

  beforeAll(async () => {
    try {
      root = await isolatedNext(process.cwd())
      bff = createServer((request, response) => {
        paths.push(request.url ?? "")
        if (request.url === "/iam/jwks") {
          expect(request.method).toBe("GET")
          expect(request.headers.authorization).toBeUndefined()
          expect(request.headers.cookie).toBeUndefined()
          expect(request.headers["x-kokoro-service"]).toBe("web-bff")
          expect(request.headers["x-kokoro-internal-secret"]).toBe("rp-bff-secret")
          sendJson(response, "jwks", { keys: [publicJwk, rsaJwk] })
          return
        }
        if (request.url === "/iam/oauth2/token") {
          const chunks: Buffer[] = []
          request.on("data", (chunk: Buffer) => chunks.push(chunk))
          request.on("end", () => {
            const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"))
            expect(request.headers["x-kokoro-service"]).toBe("web-bff")
            expect(request.headers["x-kokoro-internal-secret"]).toBe("rp-bff-secret")
            expect(request.headers.authorization).toBe(`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`)
            expect(request.headers.cookie).toBeUndefined()
            expect(body.getAll("resource")).toEqual(["https://kokoro.dev/resources/iam-internal"])
            expect(body.getAll("code_verifier")).toHaveLength(1)
            expect(body.get("redirect_uri")).toBe(`http://localhost:${nextPort}/api/auth/callback/kokoro-iam`)
            const now = Math.floor(Date.now() / 1000)
            const idToken = jwt(invalidIdToken === "algorithm" ? rsaKeys.privateKey : invalidIdToken === "signature" ? wrongKeys.privateKey : keys.privateKey,
              { iss: invalidIdToken === "issuer" ? "https://evil.example/iam" : `http://localhost:${nextPort}/iam`,
                aud: invalidIdToken === "audience" ? "wrong-client" : clientId, sub: "user-one",
                nonce: invalidIdToken === "nonce" ? "wrong-nonce" : nonce,
                iat: invalidIdToken === "expired" ? now - 1_200 : now,
                exp: invalidIdToken === "expired" ? now - 600 : now + 600 },
              invalidIdToken === "algorithm" ? "RS256" : "EdDSA")
            if (onTokenClosed !== undefined) response.once("close", onTokenClosed)
            sendJson(response, "token", { access_token: "access-opaque", refresh_token: "refresh-opaque",
              id_token: idToken, token_type: "Bearer", expires_in: 600 })
            onTokenStarted?.()
          })
          return
        }
        if (request.url === "/iam/oauth2/userinfo") {
          expect(request.method).toBe("GET")
          expect(request.headers.authorization).toBe("Bearer access-opaque")
          expect(request.headers.cookie).toBeUndefined()
          expect(request.headers["x-kokoro-service"]).toBe("web-bff")
          sendJson(response, "userinfo", { sub: invalidUserinfoSubject ? "different-user" : "user-one",
            name: "Fixture User", email: "fixture@example.test" })
          return
        }
        if (request.url?.startsWith("/iam/oauth2/authorize?")) {
          const url = new URL(request.url, `http://localhost:${nextPort}`)
          nonce = url.searchParams.get("nonce") ?? ""
          response.writeHead(302, { location: `/api/auth/callback/kokoro-iam?code=fixture-code&state=${url.searchParams.get("state")}` })
          response.end()
          return
        }
        response.writeHead(404)
        response.end()
      })
      const bffPort = await listen(bff)
      nextPort = await unusedPort()
      const nextBin = path.resolve(process.cwd(), "node_modules/next/dist/bin/next")
      next = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
        cwd: root,
        env: { ...process.env, KOKORO_WEB_ORIGIN: `http://localhost:${nextPort}`,
          KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`, KOKORO_INTERNAL_SECRET_WEB_BFF: "rp-bff-secret",
          KOKORO_WEB_REDIS_URL: redisUrl, KOKORO_OIDC_CLIENT_ID: clientId, KOKORO_OIDC_CLIENT_SECRET: clientSecret,
          KOKORO_WEB_AUTH_SECRET: randomBytes(32).toString("hex"), NEXTAUTH_URL: `http://localhost:${nextPort}/api/auth` },
        stdio: ["ignore", "pipe", "pipe"],
      })
      next.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8") })
      next.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8") })
      let lastResponse: HttpResult | undefined
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          lastResponse = await http(nextPort, "/api/auth/csrf")
          if (lastResponse.status === 200) return
        } catch { /* wait for socket */ }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(`RP Next fixture did not become ready: ${JSON.stringify(lastResponse)}\n${output.slice(0, 2_000)}`)
    } catch (error) { await cleanup(); throw error }
  }, 60_000)

  afterAll(cleanup)

  async function start(): Promise<{ signin: HttpResult; jar: string; location: string; state: string }> {
    const csrf = await http(nextPort, "/api/auth/csrf")
    expect(csrf.status).toBe(200)
    const token = (JSON.parse(csrf.body) as { csrfToken: string }).csrfToken
    const signin = await http(nextPort, "/api/auth/signin/kokoro-iam", "POST", `csrfToken=${encodeURIComponent(token)}`,
      { origin: `http://localhost:${nextPort}`, cookie: cookieHeader(csrf) })
    expect(signin.status).toBe(302)
    const location = signin.headers.location as string
    const state = new URL(location).searchParams.get("state") ?? ""
    issuedStates.add(state)
    return { signin, jar: cookieHeader(csrf, signin), location, state }
  }

  it("keeps code exchange and userinfo server-only, then returns no usable session", async () => {
    const { signin, jar, location, state } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status).toBe(302)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    expect(callback.status).toBe(503)
    expect(JSON.parse(callback.body)).toMatchObject({ error: { code: "product_session_unavailable" } })
    expect(callback.body).not.toContain("access-opaque")
    expect(callback.body).not.toContain("refresh-opaque")
    expect(callback.body).not.toContain("fixture-code")
    expect((callback.headers["set-cookie"] as string[]).every((cookie) =>
      !cookie.includes("session-token=") || cookie.includes("Max-Age=0"))).toBe(true)
    expect((callback.headers["set-cookie"] as string[]).every((cookie) =>
      !cookie.includes("kokoro_session="))).toBe(true)
    expect(paths).toContain("/iam/oauth2/token")
    expect(paths).toContain("/iam/oauth2/userinfo")
    expect(signin.headers["set-cookie"]).toBeDefined()
    const tokenCalls = paths.filter((item) => item === "/iam/oauth2/token").length
    const replay = await http(nextPort, `/api/auth/callback/kokoro-iam?code=fixture-code&state=${state}`, "GET", "", { cookie: jar })
    expect(replay.status).toBe(403)
    expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(tokenCalls)
  })

  it("rejects browser overrides and wrong state before any token socket", async () => {
    const initial = paths.length
    const csrf = await http(nextPort, "/api/auth/csrf")
    const token = (JSON.parse(csrf.body) as { csrfToken: string }).csrfToken
    for (const suffix of ["?resource=evil", "?resource=one&resource=two", "?client_id=evil", "?redirect_uri=https://evil.test", "?scope=openid", "?callbackUrl=https://evil.test"]) {
      const rejected = await http(nextPort, `/api/auth/signin/kokoro-iam${suffix}`, "POST", `csrfToken=${encodeURIComponent(token)}`,
        { origin: `http://localhost:${nextPort}`, cookie: cookieHeader(csrf) })
      expect(rejected.status).toBe(400)
    }
    const { jar } = await start()
    const rejected = await http(nextPort, "/api/auth/callback/kokoro-iam?code=fixture-code&state=wrong-state-123456", "GET", "", { cookie: jar })
    expect(rejected.status).toBe(403)
    expect(paths.slice(initial).filter((item) => item === "/iam/oauth2/token")).toHaveLength(0)
  })

  it("rejects a wrong Auth.js CSRF proof before issuing RP state or opening BFF", async () => {
    const csrf = await http(nextPort, "/api/auth/csrf")
    const before = paths.length
    const rejected = await http(nextPort, "/api/auth/signin/kokoro-iam", "POST", "csrfToken=wrong",
      { origin: `http://localhost:${nextPort}`, cookie: cookieHeader(csrf) })
    expect(rejected.status).toBe(403)
    expect(paths).toHaveLength(before)
  })

  it("binds state to the RP nonce/PKCE cookies and consumes concurrent callback only once", async () => {
    const { jar, location, state } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    const callbackPath = authorize.headers.location as string
    const withoutNonce = jar.split("; ").filter((pair) => !pair.startsWith("next-auth.nonce=")).join("; ")
    const before = paths.filter((item) => item === "/iam/oauth2/token").length
    expect((await http(nextPort, callbackPath, "GET", "", { cookie: withoutNonce })).status).toBe(403)
    expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(before)
    const [first, second] = await Promise.all([
      http(nextPort, callbackPath, "GET", "", { cookie: jar }),
      http(nextPort, callbackPath, "GET", "", { cookie: jar }),
    ])
    expect([first.status, second.status].sort()).toEqual([403, 503])
    expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(before + 1)
    expect((await http(nextPort, `/api/auth/callback/kokoro-iam?code=fixture-code&state=${state}`, "GET", "", { cookie: jar })).status).toBe(403)
  })

  it("rejects a chunked oversized signin before BFF or Redis state issue", async () => {
    const csrf = await http(nextPort, "/api/auth/csrf")
    const token = (JSON.parse(csrf.body) as { csrfToken: string }).csrfToken
    const before = paths.length
    const response = await http(nextPort, "/api/auth/signin/kokoro-iam", "POST",
      `csrfToken=${encodeURIComponent(token)}&padding=${"x".repeat(70_000)}`,
      { origin: `http://localhost:${nextPort}`, cookie: cookieHeader(csrf), "transfer-encoding": "chunked" })
    expect(response.status).toBe(400)
    expect(paths).toHaveLength(before)
  })

  it.each(["nonce", "issuer", "audience", "signature", "algorithm", "expired"] as const)("rejects a wrong ID token %s before userinfo and session", async (variant) => {
    const { jar, location } = await start()
    invalidIdToken = variant
    try {
      const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
      const before = paths.filter((item) => item === "/iam/oauth2/userinfo").length
      const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
      expect(callback.status).toBe(403)
      expect(paths.filter((item) => item === "/iam/oauth2/userinfo")).toHaveLength(before)
      expect((callback.headers["set-cookie"] as string[]).every((cookie) =>
        !cookie.includes("session-token=") || cookie.includes("Max-Age=0"))).toBe(true)
    } finally { invalidIdToken = "none" }
  })

  it("rejects userinfo sub that differs from the verified ID token", async () => {
    const { jar, location } = await start()
    invalidUserinfoSubject = true
    try {
      const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
      const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
      expect(callback.status).toBe(403)
      expect(callback.body).not.toContain("different-user")
    } finally { invalidUserinfoSubject = false }
  })

  it("keeps browser userinfo and token endpoints closed before a BFF socket", async () => {
    const before = paths.length
    for (const endpoint of ["/iam/oauth2/userinfo", "/iam/oauth2/token"]) {
      const response = await http(nextPort, endpoint, "GET", "", { authorization: "Bearer attacker" })
      expect(response.status).toBe(404)
    }
    expect(paths).toHaveLength(before)
  })

  it.each(["token", "userinfo", "jwks"] as const)("rejects oversized %s response before RP verification", async (endpoint) => {
    const { jar, location } = await start()
    oversizedResponse = endpoint
    try {
      const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
      const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
      expect(callback.status).toBe(403)
      expect(callback.body).not.toContain("access-opaque")
    } finally { oversizedResponse = "none" }
  })

  it("cuts off a headers-complete but slowly dripping userinfo body within the RP deadline", async () => {
    const { jar, location } = await start()
    slowResponse = "userinfo"
    try {
      const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
      const started = Date.now()
      const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
      expect(Date.now() - started).toBeLessThan(5_800)
      expect(callback.status).toBe(403)
    } finally { slowResponse = "none" }
  }, 10_000)

  it("cancels the active BFF token socket when the browser callback disconnects", async () => {
    const { jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    const path = authorize.headers.location as string
    let started!: () => void
    let closed!: () => void
    const tokenStarted = new Promise<void>((resolve) => { started = resolve })
    const tokenClosed = new Promise<void>((resolve) => { closed = resolve })
    slowResponse = "token"
    onTokenStarted = started
    onTokenClosed = closed
    const before = paths.length
    const browser = httpRequest({ hostname: "127.0.0.1", port: nextPort, path, method: "GET",
      headers: { host: `localhost:${nextPort}`, cookie: jar } }, (response) => response.resume())
    browser.on("error", () => undefined)
    try {
      browser.end()
      await tokenStarted
      browser.destroy()
      const cancelled = await Promise.race([
        tokenClosed.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 1_500)),
      ])
      expect(cancelled).toBe(true)
      expect(paths.slice(before).filter((value) => value === "/iam/jwks" || value === "/iam/oauth2/userinfo")).toEqual([])
    } finally {
      browser.destroy()
      slowResponse = "none"
      onTokenStarted = undefined
      onTokenClosed = undefined
    }
  }, 10_000)

  it("settles a pre-aborted backchannel request without opening any BFF socket", async () => {
    const before = paths.length
    const response = await http(nextPort, "/api/rp-preabort-fixture")
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ settled: true, tokenRejected: true,
      userinfoRejected: true, jwksRejected: true, calls: 0 })
    expect(paths).toHaveLength(before)
  })
})
