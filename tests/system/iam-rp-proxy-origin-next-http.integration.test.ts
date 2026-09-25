import { spawn, type ChildProcess } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { cp, mkdtemp, rm, symlink } from "node:fs/promises"
import { createServer, request as httpRequest, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"

import { createClient } from "redis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const WEB_ORIGIN = "https://web-proxy.example.test"
const WEB_HOST = new URL(WEB_ORIGIN).host
const SIGNED_QUERY = "?sig=%2BAb"

type HttpResult = Readonly<{
  status: number
  headers: Readonly<Record<string, string | string[] | undefined>>
  body: string
}>

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("fixture did not bind")
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
      headers: { host: WEB_HOST, "x-forwarded-proto": "https", ...extra,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) } }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8") }))
    })
    request.once("error", reject)
    request.end(body)
  })
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve() }, 5_000)
    child.once("exit", () => { clearTimeout(timer); resolve() })
    child.kill("SIGTERM")
  })
}

function cookies(response: HttpResult): string {
  return ((response.headers["set-cookie"] as string[] | undefined) ?? [])
    .map((value) => value.split(";", 1)[0] ?? "").filter(Boolean).join("; ")
}

function csrfToken(response: HttpResult, issued: Set<string>): string {
  const token = response.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
  if (token === undefined) throw new Error(`proxy fixture CSRF proof missing: ${response.status}`)
  issued.add(token)
  return token
}

describe("IAM and RP origin admission behind an HTTPS reverse proxy-style Next hop", { timeout: 30_000 }, () => {
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL ?? "redis://127.0.0.1:6379/9"
  const issuedCsrf = new Set<string>()
  const issuedStates = new Set<string>()
  const bffPaths: string[] = []
  let root: string | undefined
  let bff: Server | undefined
  let proxy: Server | undefined
  let next: ChildProcess | undefined
  let nextPort = 0
  let proxyPort = 0
  let output = ""

  async function cleanup(): Promise<void> {
    if (next !== undefined) { const child = next; next = undefined; await stop(child) }
    if (proxy !== undefined) { const server = proxy; proxy = undefined; server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
    if (bff !== undefined) { const server = bff; bff = undefined; server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
    if (root !== undefined) { const directory = root; root = undefined; await rm(directory, { recursive: true, force: true }) }
    const keys = [
      ...[...issuedCsrf].map((token) => `kokoro:web:iam-csrf:${createHash("sha256").update(WEB_ORIGIN).digest("hex")}:${createHash("sha256").update(token).digest("hex")}`),
      ...[...issuedStates].map((state) => `kokoro:web:oidc-state:${createHash("sha256").update(WEB_ORIGIN).digest("hex")}:${createHash("sha256").update(state).digest("hex")}`),
    ]
    if (keys.length === 0) return
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => { await client.connect(); await client.del(keys) })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("proxy fixture Redis cleanup deadline")), 2_000) }),
      ])
    } finally { if (timer !== undefined) clearTimeout(timer); client.destroy() }
  }

  beforeAll(async () => {
    try {
      root = await mkdtemp(path.join(tmpdir(), "kokoro-proxy-origin-next-"))
      for (const name of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) {
        await cp(path.join(process.cwd(), name), path.join(root, name), { recursive: true })
      }
      await symlink(path.join(process.cwd(), "node_modules"), path.join(root, "node_modules"), "dir")
      bff = createServer((request, response) => {
        bffPaths.push(request.url ?? "")
        const route = request.url ?? ""
        if (route === "/iam/organization/set-active") {
          response.writeHead(200, { "content-type": "application/json" })
          response.end(JSON.stringify({ redirect: true, url: `${WEB_ORIGIN}/auth/consent${SIGNED_QUERY}&scope=openid` }))
        } else if (route === "/iam/sign-in/email") {
          response.writeHead(200, { "content-type": "application/json",
            "set-cookie": "kokoro-issuer.session_token=opaque; Path=/iam; HttpOnly; SameSite=Lax" })
          response.end('{"token":"server-only"}')
        } else if (route === "/iam/oauth2/continue") {
          response.writeHead(200, { "content-type": "application/json" })
          response.end(JSON.stringify({ redirect: true, url: `${WEB_ORIGIN}/auth/select-tenant${SIGNED_QUERY}` }))
        } else {
          response.writeHead(200, { "content-type": "application/json" })
          response.end('{"keys":[]}')
        }
      })
      const bffPort = await listen(bff)
      nextPort = await unusedPort()
      const nextBin = path.resolve(process.cwd(), "node_modules/next/dist/bin/next")
      next = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
        cwd: root,
        env: { ...process.env, KOKORO_WEB_ORIGIN: WEB_ORIGIN, KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`,
          KOKORO_DOMAIN: WEB_HOST,
          KOKORO_INTERNAL_SECRET_WEB_BFF: "proxy-fixture-secret", KOKORO_WEB_REDIS_URL: redisUrl,
          KOKORO_OIDC_CLIENT_ID: "proxy-rp", KOKORO_OIDC_CLIENT_SECRET: "proxy-rp-secret", KOKORO_TENANT_ID: "tenant-one",
          KOKORO_WEB_AUTH_SECRET: randomBytes(32).toString("hex"), NEXTAUTH_URL: `${WEB_ORIGIN}/api/auth` },
        stdio: ["ignore", "pipe", "pipe"],
      })
      next.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8") })
      next.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8") })
      proxy = createServer((incoming, outgoing) => {
        const headers = { ...incoming.headers, "x-forwarded-proto": incoming.headers["x-forwarded-proto"] ?? "https" }
        const upstream = httpRequest({ hostname: "127.0.0.1", port: nextPort, method: incoming.method,
          path: incoming.url, headers }, (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers)
          response.pipe(outgoing)
        })
        upstream.once("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end() })
        incoming.pipe(upstream)
      })
      proxyPort = await listen(proxy)
      for (let attempt = 0; attempt < 200; attempt += 1) {
        try { if ((await http(proxyPort, "/")).status !== 502) return } catch { /* wait for Next */ }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(`proxy Next fixture did not become ready\n${output.slice(0, 2_000)}`)
    } catch (error) { await cleanup(); throw error }
  }, 45_000)

  afterAll(cleanup)

  it("admits fixed-host proxy GET across IAM relay, outer/inner interactions and RP CSRF", async () => {
    expect((await http(proxyPort, "/iam/jwks")).status).toBe(200)
    const signIn = await http(proxyPort, `/auth/sign-in${SIGNED_QUERY}`)
    expect(signIn.status).toBe(200)
    csrfToken(signIn, issuedCsrf)
    const selectOuter = await http(proxyPort, `/auth/select-tenant${SIGNED_QUERY}`)
    expect(selectOuter.status).toBe(302)
    expect(selectOuter.headers.location).toBe(`/iam/interactions/select-tenant${SIGNED_QUERY}`)
    const selectInner = await http(proxyPort, `/iam/interactions/select-tenant${SIGNED_QUERY}`,
      "GET", "", { cookie: "kokoro-issuer.session_token=opaque" })
    expect(selectInner.status).toBe(303)
    expect(selectInner.headers.location).toBe(`${WEB_ORIGIN}/auth/consent${SIGNED_QUERY}&scope=openid`)
    expect(bffPaths).toContain("/iam/organization/set-active")
    expect(bffPaths).not.toContain("/iam/organization/list")
    const consentOuter = await http(proxyPort, `/auth/consent${SIGNED_QUERY}&scope=openid`)
    expect(consentOuter.status).toBe(302)
    const consentInner = await http(proxyPort, `/iam/interactions/consent${SIGNED_QUERY}&scope=openid`,
      "GET", "", { cookie: "kokoro-issuer.session_token=opaque" })
    expect(consentInner.status).toBe(200)
    csrfToken(consentInner, issuedCsrf)
    expect((await http(proxyPort, "/api/auth/csrf")).status).toBe(200)
  })

  it("admits fixed-host proxy mutations only with canonical Origin and CSRF", async () => {
    const signIn = await http(proxyPort, `/auth/sign-in${SIGNED_QUERY}`)
    const token = csrfToken(signIn, issuedCsrf)
    const accepted = await http(proxyPort, `/auth/sign-in${SIGNED_QUERY}`, "POST",
      `csrf_token=${token}&email=user%40example.test&password=secret`,
      { origin: WEB_ORIGIN, cookie: cookies(signIn) })
    expect(accepted.status).toBe(303)
    expect(accepted.headers.location).toBe(`${WEB_ORIGIN}/auth/select-tenant${SIGNED_QUERY}`)
    const csrf = await http(proxyPort, "/api/auth/csrf")
    const rpToken = (JSON.parse(csrf.body) as { csrfToken: string }).csrfToken
    const rpSignin = await http(proxyPort, "/api/auth/signin/kokoro-iam", "POST", `csrfToken=${encodeURIComponent(rpToken)}`,
      { origin: WEB_ORIGIN, cookie: cookies(csrf) })
    expect(rpSignin.status).toBe(302)
    const location = new URL(rpSignin.headers.location as string)
    expect(location.origin).toBe(WEB_ORIGIN)
    expect(location.pathname).toBe("/iam/oauth2/authorize")
    issuedStates.add(location.searchParams.get("state") ?? "")
  })

  it("uses fixed Host and Origin rather than forwarded authority for admission", async () => {
    const forwarded = { origin: WEB_ORIGIN, "x-forwarded-host": "wrong-forwarded.example.test",
      "x-forwarded-proto": "http" }
    expect((await http(proxyPort, "/iam/jwks", "GET", "", forwarded)).status).toBe(200)
    const signIn = await http(proxyPort, `/auth/sign-in${SIGNED_QUERY}`, "GET", "", forwarded)
    expect(signIn.status).toBe(200)
    const token = csrfToken(signIn, issuedCsrf)
    expect((await http(proxyPort, `/auth/sign-in${SIGNED_QUERY}`, "POST",
      `csrf_token=${token}&email=user%40example.test&password=secret`,
      { ...forwarded, cookie: cookies(signIn) })).status).toBe(303)
    expect((await http(proxyPort, "/api/auth/csrf", "GET", "", forwarded)).status).toBe(200)
  })

  it("rejects malicious Host and Origin despite spoofed forwarding headers before BFF", async () => {
    for (const target of ["/iam/jwks", `/auth/sign-in${SIGNED_QUERY}`, `/auth/select-tenant${SIGNED_QUERY}`,
      `/iam/interactions/select-tenant${SIGNED_QUERY}`, `/iam/interactions/consent${SIGNED_QUERY}&scope=openid`,
      "/api/auth/csrf"]) {
      const before = bffPaths.length
      const rejected = await http(proxyPort, target, "GET", "", { host: "evil.example.test",
        "x-forwarded-host": WEB_HOST, "x-forwarded-proto": "https" })
      expect(rejected.status).toBe(403)
      expect(bffPaths).toHaveLength(before)
    }
    const before = bffPaths.length
    expect((await http(proxyPort, "/iam/jwks", "GET", "", { origin: "https://evil.example.test",
      "x-forwarded-host": WEB_HOST, "x-forwarded-proto": "https" })).status).toBe(403)
    expect((await http(proxyPort, `/auth/sign-in${SIGNED_QUERY}`, "POST", "csrf_token=bad&email=a%40b.test&password=p",
      { origin: "https://evil.example.test", "x-forwarded-host": WEB_HOST })).status).toBe(403)
    expect((await http(proxyPort, "/api/auth/signin/kokoro-iam", "POST", "csrfToken=bad",
      { "x-forwarded-host": WEB_HOST })).status).toBe(403)
    expect(bffPaths).toHaveLength(before)
  })

  it("keeps route, signed query and browser credential boundaries under proxy authority mismatch", async () => {
    const before = bffPaths.length
    expect((await http(proxyPort, `/auth/sign-in-other${SIGNED_QUERY}`)).status).toBe(404)
    expect((await http(proxyPort, `/auth/select-tenant${SIGNED_QUERY}&sig=duplicate`)).status).toBe(404)
    expect((await http(proxyPort, "/iam/oauth2/token")).status).toBe(404)
    expect((await http(proxyPort, "/api/auth/csrf?unexpected=1")).status).toBe(400)
    expect((await http(proxyPort, "/api/auth/csrf", "GET", "", { authorization: "Bearer browser-token" })).status).toBe(403)
    expect((await http(proxyPort, "/iam/jwks", "GET", "", { authorization: "Bearer browser-token" })).status).toBe(403)
    expect((await http(proxyPort, `/auth/sign-in${SIGNED_QUERY}`, "POST", "csrf_token=bad&email=a%40b.test&password=p",
      { "x-forwarded-host": WEB_HOST })).status).toBe(403)
    expect(bffPaths).toHaveLength(before)
  })
})
