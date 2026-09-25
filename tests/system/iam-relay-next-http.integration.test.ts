import { spawn, type ChildProcess } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { createServer, request as httpRequest, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { createClient } from "redis"
import { chromium } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { iamCsrfKeyPrefix } from "@/lib/server/iam-interaction-csrf"
import { issuerCookieAfter, prepareInteraction } from "@/lib/server/iam-interaction-route"

type HttpResult = Readonly<{ status: number; headers: Readonly<Record<string, string | string[] | undefined>>; body: string }>

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
  return address.port
}

async function unusedPort(): Promise<number> {
  const probe = createServer()
  const port = await listen(probe)
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
  return port
}

function rawHttp(
  port: number,
  requestPath: string,
  host = `localhost:${port}`,
  chunkedBody?: string,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise<HttpResult>((resolve, reject) => {
    const headers: Record<string, string> = { host, ...extraHeaders }
    if (chunkedBody !== undefined) headers["transfer-encoding"] = "chunked"
    const request = httpRequest({ hostname: "127.0.0.1", port, path: requestPath, headers }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("end", () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }))
    })
    request.once("error", reject)
    request.end(chunkedBody)
  })
}

function rawMethod(port: number, requestPath: string, method: "HEAD" | "OPTIONS"): Promise<HttpResult> {
  return new Promise<HttpResult>((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path: requestPath, method,
      headers: { host: `localhost:${port}` } }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8") }))
    })
    request.once("error", reject)
    request.end()
  })
}

function pathCookieJar() {
  const entries = new Map<string, { value: string; path: string }>()
  return {
    absorb(response: HttpResult): void {
      for (const cookie of response.headers["set-cookie"] as string[] | undefined ?? []) {
        const pair = cookie.split(";")[0] ?? ""
        const name = pair.slice(0, pair.indexOf("="))
        const path = cookie.match(/(?:^|;)\s*Path=([^;]+)/iu)?.[1] ?? "/"
        const key = `${name}\u0000${path}`
        const maxAge = cookie.match(/(?:^|;)\s*Max-Age=(-?[0-9]+)/iu)?.[1]
        const expires = cookie.match(/(?:^|;)\s*Expires=([^;]+)/iu)?.[1]
        const expired = maxAge !== undefined ? Number(maxAge) <= 0 :
          expires !== undefined && Number.isFinite(Date.parse(expires)) && Date.parse(expires) <= Date.now()
        if (expired) entries.delete(key)
        else entries.set(key, { value: pair, path })
      }
    },
    headerFor(target: string): string {
      const pathname = new URL(target, "http://localhost").pathname
      return [...entries.values()].filter((entry) => pathname === entry.path ||
        (pathname.startsWith(entry.path) && (entry.path.endsWith("/") || pathname[entry.path.length] === "/")))
        .map((entry) => entry.value).join("; ")
    },
  }
}

async function waitForNext(port: number, diagnostics: () => string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const response = await rawHttp(port, "/iam/jwks")
      if (response.status === 200) return
    } catch {
      // The socket is not accepting requests yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Next fixture did not become ready\n${diagnostics()}`)
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    let forcedExit: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      if (forcedExit !== undefined) clearTimeout(forcedExit)
      resolve()
    }
    const fallback = setTimeout(() => {
      child.kill("SIGKILL")
      forcedExit = setTimeout(finish, 1_000)
    }, 5_000)
    child.once("exit", finish)
    if (!child.kill("SIGTERM")) finish()
  })
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

function rawPost(port: number, requestPath: string, body: string, headers: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise<HttpResult>((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1", port, path: requestPath, method: "POST",
      headers: { host: `localhost:${port}`, "content-type": "application/x-www-form-urlencoded", ...headers },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }))
    })
    request.once("error", reject)
    request.end(body)
  })
}

async function createIsolatedNextFixture(projectRoot: string): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "kokoro-iam-relay-next-"))
  try {
    await cp(path.join(projectRoot, "src"), path.join(fixtureRoot, "src"), { recursive: true })
    await cp(path.join(projectRoot, "public"), path.join(fixtureRoot, "public"), { recursive: true })
    for (const name of ["package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) {
      await cp(path.join(projectRoot, name), path.join(fixtureRoot, name))
    }
    await symlink(path.join(projectRoot, "node_modules"), path.join(fixtureRoot, "node_modules"), "dir")
    return fixtureRoot
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true })
    throw error
  }
}

describe("IAM relay through the real Next HTTP boundary", { timeout: 30_000 }, () => {
  let bff: Server | undefined
  let bffPort = 0
  let nextPort = 0
  let next: ChildProcess | undefined
  let nextOutput = ""
  let fixtureRoot: string | undefined
  const receivedPaths: string[] = []
  const receivedCookies: Array<string | undefined> = []
  const receivedBodies: string[] = []
  const issuedCsrfTokens = new Set<string>()
  let signInStatus = 200
  let authorizePayload: unknown = { redirect: true, url: "" }
  let authorizeCookies: string[] = []
  let continueStatus = 200
  let continueLocation = "/auth/select-tenant?sig=%2BAb"
  let continueSetCookies: string[] = []
  let continuePayload: unknown = { redirect: true, url: "" }
  let setActiveStatus = 200
  let setActiveLocation = "/auth/consent?sig=%2BAb&scope=openid"
  let setActivePayload: unknown = { redirect: true, url: "" }
  let setActiveCookies: string[] = []
  let consentStatus = 200
  let consentLocation = "/auth/select-tenant?sig=%2BAb"
  let consentPayload: unknown = { redirect: true, url: "" }
  let consentCookies: string[] = []
  let sessionRequired = false
  let verifyEmailStatus = 200
  let verifyEmailLocation = "/auth/sign-in"
  let verifyEmailCacheControl: string | undefined
  let verifyEmailReferrerPolicy: string | undefined
  let verifyEmailContentType = "text/plain"
  let verifyEmailBody = "verified"
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL ?? "redis://127.0.0.1:6379"

  async function ownCsrfKeys(): Promise<string[]> {
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          await client.connect()
          const prefix = iamCsrfKeyPrefix(`http://localhost:${nextPort}`)
          const keys: string[] = []
          for await (const batch of client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) keys.push(...batch)
          return keys.sort()
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("test Redis read deadline")), 2_000)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      client.destroy()
    }
  }

  async function cleanupResources(): Promise<void> {
    const errors: unknown[] = []
    if (next !== undefined) {
      const child = next
      next = undefined
      try { await stop(child) } catch (error) { errors.push(error) }
    }
    if (bff !== undefined) {
      const server = bff
      bff = undefined
      try { await close(server) } catch (error) { errors.push(error) }
    }
    if (fixtureRoot !== undefined) {
      const directory = fixtureRoot
      fixtureRoot = undefined
      try { await rm(directory, { recursive: true, force: true }) } catch (error) { errors.push(error) }
    }
    if (nextPort !== 0 && issuedCsrfTokens.size > 0) {
      const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
      client.on("error", () => undefined)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const prefix = iamCsrfKeyPrefix(`http://localhost:${nextPort}`)
        const keys = [...issuedCsrfTokens].map((token) => `${prefix}${createHash("sha256").update(token).digest("hex")}`)
        await Promise.race([
          (async () => { await client.connect(); await client.del(keys) })(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("test Redis cleanup deadline")), 2_000) }),
        ])
      } catch (error) { errors.push(error) }
      finally { if (timer !== undefined) clearTimeout(timer); client.destroy() }
    }
    if (errors.length > 0) throw new AggregateError(errors, "failed to clean IAM relay Next fixture")
  }

  beforeAll(async () => {
    try {
      const projectRoot = process.cwd()
      fixtureRoot = await createIsolatedNextFixture(projectRoot)
      bff = createServer((request, response) => {
        receivedPaths.push(request.url ?? "")
        receivedCookies.push(request.headers.cookie)
        if (request.url?.startsWith("/iam/verify-email")) {
          response.writeHead(verifyEmailStatus, {
            ...(verifyEmailStatus === 302 ? { location: verifyEmailLocation } : { "content-type": verifyEmailContentType }),
            ...(verifyEmailCacheControl === undefined ? {} : { "cache-control": verifyEmailCacheControl }),
            ...(verifyEmailReferrerPolicy === undefined ? {} : { "referrer-policy": verifyEmailReferrerPolicy }),
          })
          response.end(verifyEmailStatus === 302 ? "" : verifyEmailBody)
          return
        }
        if (request.url?.startsWith("/iam/oauth2/authorize?")) {
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
            "set-cookie": authorizeCookies,
          })
          response.end(JSON.stringify(authorizePayload))
          return
        }
        if (request.url === "/iam/organization/set-active" || request.url === "/iam/oauth2/consent") {
          if (sessionRequired && !request.headers.cookie?.includes("kokoro-issuer.session_token=opaque")) {
            response.writeHead(401, { "content-type": "application/json" })
            response.end('{"secret":"missing-owner-session"}')
            return
          }
          const isTenant = request.url === "/iam/organization/set-active"
          const status = isTenant ? setActiveStatus : consentStatus
          const location = isTenant ? setActiveLocation : consentLocation
          const payload = isTenant ? setActivePayload : consentPayload
          const cookies = isTenant ? setActiveCookies : consentCookies
          const chunks: Buffer[] = []
          request.on("data", (chunk: Buffer) => chunks.push(chunk))
          request.on("end", () => {
            receivedBodies.push(Buffer.concat(chunks).toString("utf8"))
            response.writeHead(status, {
              ...(status === 302 ? { location } : { "content-type": "application/json" }),
              "set-cookie": cookies,
            })
            response.end(status === 302 ? "" : status === 200 ? JSON.stringify(payload) : '{"secret":"sensitive-marker-must-not-reach-browser"}')
          })
          return
        }
        if (request.url === "/iam/sign-in/email" || request.url === "/iam/oauth2/continue") {
          const chunks: Buffer[] = []
          request.on("data", (chunk: Buffer) => chunks.push(chunk))
          request.on("end", () => {
            receivedBodies.push(Buffer.concat(chunks).toString("utf8"))
            if (request.url === "/iam/sign-in/email") {
              response.writeHead(signInStatus, {
                "content-type": "application/json",
                "set-cookie": [
                  "kokoro-issuer.session_token=opaque; Path=/iam; HttpOnly; SameSite=Lax",
                  "kokoro-issuer.session_data=opaque-data; Path=/iam; HttpOnly; SameSite=Lax",
                ],
              })
              response.end(signInStatus === 200 ? '{"token":"must-not-reach-browser"}' : '{"error":"sensitive-marker-must-not-reach-browser"}')
            } else {
              if (continueStatus === 302) {
                response.writeHead(302, {
                  location: continueLocation,
                  "cache-control": "no-store",
                  "set-cookie": continueSetCookies,
                })
                response.end()
              } else {
                response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
                response.end(JSON.stringify(continuePayload))
              }
            }
          })
          return
        }
        const payload = JSON.stringify({ keys: [] })
        response.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": "next-http-probe",
          "content-length": Buffer.byteLength(payload),
        })
        response.end(payload)
      })
      bffPort = await listen(bff)
      nextPort = await unusedPort()
      authorizePayload = { redirect: true, url: `http://localhost:${nextPort}/auth/sign-in?sig=%2BAb` }
      continuePayload = { redirect: true, url: `http://localhost:${nextPort}/auth/select-tenant?sig=%2BAb` }
      setActivePayload = { redirect: true, url: `http://localhost:${nextPort}/auth/consent?sig=%2BAb&scope=openid` }
      consentPayload = { redirect: true, url: `http://localhost:${nextPort}/api/auth/callback/kokoro-iam?code=secret-code` }
      const nextBin = path.resolve(projectRoot, "node_modules/next/dist/bin/next")
      next = spawn(
        process.execPath,
        [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(nextPort)],
        {
          cwd: fixtureRoot,
          env: {
            ...process.env,
            KOKORO_WEB_ORIGIN: `http://localhost:${nextPort}`,
            KOKORO_DOMAIN: "localhost",
            KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`,
            KOKORO_INTERNAL_SECRET_WEB_BFF: "next-http-secret",
            KOKORO_WEB_REDIS_URL: redisUrl,
            KOKORO_OIDC_CLIENT_ID: "product-web",
            KOKORO_TENANT_ID: "tenant-one",
            KOKORO_OIDC_CLIENT_SECRET: "fixture-secret",
            KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
            NEXTAUTH_URL: `http://localhost:${nextPort}/api/auth`,
            NEXT_PUBLIC_SESSION_PREVIEW: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      )
      next.stdout?.on("data", (chunk: Buffer) => { nextOutput += chunk.toString("utf8") })
      next.stderr?.on("data", (chunk: Buffer) => { nextOutput += chunk.toString("utf8") })
      await waitForNext(nextPort, () => nextOutput)
    } catch (error) {
      try {
        await cleanupResources()
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "failed to start and clean IAM relay Next fixture")
      }
      throw error
    }
  }, 60_000)

  beforeEach(() => {
    receivedPaths.length = 0
    receivedCookies.length = 0
    receivedBodies.length = 0
    signInStatus = 200
    authorizePayload = { redirect: true, url: `http://localhost:${nextPort}/auth/sign-in?sig=%2BAb` }
    authorizeCookies = []
    continueStatus = 200
    continueLocation = "/auth/select-tenant?sig=%2BAb"
    continueSetCookies = []
    continuePayload = { redirect: true, url: `http://localhost:${nextPort}/auth/select-tenant?sig=%2BAb` }
    setActiveStatus = 200
    setActiveLocation = "/auth/consent?sig=%2BAb&scope=openid"
    setActivePayload = { redirect: true, url: `http://localhost:${nextPort}/auth/consent?sig=%2BAb&scope=openid` }
    setActiveCookies = []
    consentStatus = 200
    consentLocation = "/auth/select-tenant?sig=%2BAb"
    consentPayload = { redirect: true, url: `http://localhost:${nextPort}/api/auth/callback/kokoro-iam?code=secret-code` }
    consentCookies = []
    sessionRequired = false
    verifyEmailStatus = 200
    verifyEmailLocation = "/auth/sign-in"
    verifyEmailCacheControl = undefined
    verifyEmailReferrerPolicy = undefined
    verifyEmailContentType = "text/plain"
    verifyEmailBody = "verified"
  })

  afterAll(cleanupResources)

  it("starts Product OIDC from the server login route", async () => {
    const response = await rawHttp(nextPort, "/login")
    if (response.status !== 302) throw new Error(`login status ${response.status}; ${nextOutput.slice(-1000)}`)
    expect(response.headers.location).toContain("/iam/oauth2/authorize?")
    const issued = response.headers["set-cookie"] as string[] | undefined
    expect(issued?.some((cookie) => cookie.startsWith("next-auth.csrf-token="))).toBe(true)
    expect(issued?.filter((cookie) => cookie.startsWith("next-auth.csrf-token="))).toHaveLength(1)
    expect(issued?.some((cookie) => cookie.startsWith("next-auth.state="))).toBe(true)
    const returning = await rawHttp(nextPort, "/login", `localhost:${nextPort}`, undefined, {
      cookie: issued?.map((cookie) => cookie.split(";", 1)[0]).join("; ") ?? "",
    })
    expect(returning.status).toBe(302)
  })

  it("navigates a real Chromium tab from authorize JSON to the Web sign-in page", async () => {
    authorizeCookies = ["kokoro-issuer.session_token=opaque; Path=/iam; HttpOnly; SameSite=Lax"]
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      const authorizeResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/iam/oauth2/authorize")
      await page.goto(`http://localhost:${nextPort}/iam/oauth2/authorize?client_id=web`, {
        waitUntil: "domcontentloaded",
      })
      expect((await authorizeResponse).status()).toBe(302)
      expect(page.url()).toBe(`http://localhost:${nextPort}/auth/sign-in?sig=%2BAb`)
      expect(await page.locator("body").innerText()).not.toContain('"redirect":true')
      expect((await page.context().cookies()).some((cookie) =>
        cookie.name === "kokoro-issuer.session_token" && cookie.path === "/iam")).toBe(true)
      expect(receivedPaths).toEqual(["/iam/oauth2/authorize?client_id=web"])
    } finally {
      await browser.close()
    }
  }, 30_000)

  it("renders stacked, responsive and accessible issuer forms without client credential logic", async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      for (const [name, viewport] of [
        ["desktop", { width: 1440, height: 900 }],
        ["narrow", { width: 560, height: 600 }],
        ["mobile", { width: 390, height: 844 }],
      ] as const) {
        const context = await browser.newContext({ viewport })
        const page = await context.newPage()
        const response = await page.goto(`http://localhost:${nextPort}/auth/sign-in?sig=%2BAb`, {
          waitUntil: "domcontentloaded",
        })
        expect(response?.status()).toBe(200)
        expect(await page.getByRole("heading", { name: "Sign in" }).count()).toBe(1)
        const email = page.getByLabel("Email")
        const password = page.getByLabel("Password")
        const submit = page.getByRole("button", { name: "Sign in" })
        const [emailBox, passwordBox, buttonBox] = await Promise.all([
          email.boundingBox(), password.boundingBox(), submit.boundingBox(),
        ])
        expect(emailBox?.width).toBeGreaterThan(250)
        expect((passwordBox?.y ?? 0)).toBeGreaterThan((emailBox?.y ?? 0) + (emailBox?.height ?? 0))
        expect((buttonBox?.y ?? 0)).toBeGreaterThan((passwordBox?.y ?? 0) + (passwordBox?.height ?? 0))
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
        expect(await page.locator("form").getAttribute("action")).toBe("/auth/sign-in?sig=%2BAb")
        expect(await page.locator('input[name="csrf_token"]').count()).toBe(1)
        expect((await response?.text())?.includes("<script")).toBe(false)
        if (name === "mobile") {
          const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
          expect(accessibility.violations).toEqual([])
        }
        const screenshotDir = process.env.KOKORO_IAM_UI_SCREENSHOT_DIR
        if (screenshotDir) {
          await mkdir(screenshotDir, { recursive: true })
          await page.screenshot({ path: path.join(screenshotDir, `sign-in-${name}.png`), fullPage: true })
        }

        const tenant = await page.goto(`http://localhost:${nextPort}/iam/interactions/select-tenant?sig=%2BAb`, {
          waitUntil: "domcontentloaded",
        })
        expect(tenant?.status()).toBe(401)
        expect(await page.getByRole("combobox", { name: "Tenant" }).count()).toBe(0)
        expect(await page.getByRole("button", { name: "Continue" }).count()).toBe(0)

        const consent = await page.goto(`http://localhost:${nextPort}/iam/interactions/consent?sig=%2BAb&scope=openid`, {
          waitUntil: "domcontentloaded",
        })
        expect(consent?.status()).toBe(200)
        expect(await page.getByRole("heading", { name: "Review requested access" }).count()).toBe(1)
        expect(await page.getByRole("button", { name: "Agree and continue" }).count()).toBe(1)
        expect(await page.getByRole("button", { name: "Decline" }).count()).toBe(1)
        expect(await page.locator("form").getAttribute("action")).toBe("/iam/interactions/consent?sig=%2BAb&scope=openid")
        if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `consent-${name}.png`), fullPage: true })
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
        await context.close()
      }
    } finally {
      await browser.close()
    }
  }, 30_000)

  async function signInPage(): Promise<HttpResult> {
    const page = await rawHttp(nextPort, "/auth/sign-in?sig=%2BAb")
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    if (token !== undefined) issuedCsrfTokens.add(token)
    return page
  }

  async function submitValidSignIn(): Promise<HttpResult> {
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = (page.headers["set-cookie"] as string[] | undefined)?.[0]?.split(";")[0]
    if (token === undefined || cookie === undefined) throw new Error("sign-in fixture CSRF proof missing")
    return rawPost(nextPort, "/auth/sign-in?sig=%2BAb", `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie,
    })
  }

  async function interactionProof(path: string): Promise<{ page: HttpResult; token: string; cookie: string; tenantIds: string }> {
    const page = await rawHttp(nextPort, path)
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = (page.headers["set-cookie"] as string[] | undefined)?.find((value) => value.startsWith("kokoro_iam_csrf="))?.split(";")[0]
    const tenantIds = page.body.match(/name="tenant_ids" value="([^"]*)"/u)?.[1] ?? ""
    if (token === undefined || cookie === undefined) throw new Error(`interaction proof missing for ${path}: ${page.status}`)
    issuedCsrfTokens.add(token)
    return { page, token, cookie, tenantIds }
  }

  it("relays the canonical GET and rejects an untrusted Host without relying on Origin", async () => {
    const canonical = await rawHttp(nextPort, "/iam/jwks")
    expect(canonical.status).toBe(200)
    expect(JSON.parse(canonical.body)).toEqual({ keys: [] })
    expect(receivedPaths.splice(0)).toEqual(["/iam/jwks"])

    const attacker = await rawHttp(nextPort, "/iam/jwks", "evil.example")
    expect(attacker.status).toBe(403)
    expect(JSON.parse(attacker.body)).toMatchObject({ error: { code: "iam_relay_origin_rejected" } })
    expect(receivedPaths).toEqual([])
  })

  it("keeps verification query bytes and fixes sensitive response headers without changing other GETs", async () => {
    const query = "?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in"
    const missing = await rawHttp(nextPort, `/iam/verify-email${query}`, undefined, undefined, {
      cookie: "kokoro_session=product; kokoro-issuer.session_token=issuer",
    })
    expect(missing.status).toBe(200)
    expect(missing.body).toBe("verified")
    expect(missing.headers["cache-control"]).toBe("no-store")
    expect(missing.headers["referrer-policy"]).toBe("no-referrer")
    expect(receivedPaths.splice(0)).toEqual([`/iam/verify-email${query}`])
    expect(receivedCookies.splice(0)).toEqual(["kokoro-issuer.session_token=issuer"])

    verifyEmailCacheControl = "public, max-age=3600"
    verifyEmailReferrerPolicy = "unsafe-url"
    const poisoned = await rawHttp(nextPort, `/iam/verify-email${query}`)
    expect(poisoned.headers["cache-control"]).toBe("no-store")
    expect(poisoned.headers["referrer-policy"]).toBe("no-referrer")
    expect(receivedPaths.splice(0)).toEqual([`/iam/verify-email${query}`])

    const jwks = await rawHttp(nextPort, "/iam/jwks")
    expect(jwks.status).toBe(200)
    expect(jwks.headers["referrer-policy"]).not.toBe("no-referrer")
    expect(receivedPaths.splice(0)).toEqual(["/iam/jwks"])
  })

  it("omits the verification token from Next development incoming-request logs only", async () => {
    const token = `verify-log-${randomUUID()}`
    const marker = `ordinary-log-${randomUUID()}`
    const verification = await rawHttp(nextPort, `/iam/verify-email?token=${token}`)
    const ordinary = await rawHttp(nextPort, `/iam/jwks?probe=${marker}`)
    expect(verification.status).toBe(200)
    expect(ordinary.status).toBe(200)
    expect(receivedPaths.splice(0)).toEqual([
      `/iam/verify-email?token=${token}`,
      `/iam/jwks?probe=${marker}`,
    ])
    for (let attempt = 0; attempt < 20 && !nextOutput.includes(marker); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(nextOutput).toContain(marker)
    expect(nextOutput).not.toContain(token)
  })

  it("accepts only fixed-origin verification redirects and fails closed without leaking Location", async () => {
    verifyEmailStatus = 302
    verifyEmailLocation = `http://localhost:${nextPort}/auth/sign-in?from=verified`
    verifyEmailCacheControl = "public"
    const accepted = await rawHttp(nextPort, "/iam/verify-email?token=one")
    expect(accepted.status).toBe(302)
    expect(accepted.headers.location).toBe(verifyEmailLocation)
    expect(accepted.headers["cache-control"]).toBe("no-store")
    expect(accepted.headers["referrer-policy"]).toBe("no-referrer")
    expect(receivedPaths.splice(0)).toEqual(["/iam/verify-email?token=one"])

    verifyEmailLocation = "https://evil.example/auth/sign-in?token=one"
    const rejected = await rawHttp(nextPort, "/iam/verify-email?token=one")
    expect(rejected.status).toBe(502)
    expect(rejected.headers.location).toBeUndefined()
    expect(rejected.body).not.toContain("evil.example")
    expect(rejected.headers["cache-control"]).toBe("no-store")
    expect(rejected.headers["referrer-policy"]).toBe("no-referrer")
    expect(receivedPaths.splice(0)).toEqual(["/iam/verify-email?token=one"])
  })

  it("rejects verification aliases, methods and credentials before the BFF socket", async () => {
    const alias = await rawHttp(nextPort, "/iam/%76erify-email?token=one")
    const duplicate = await rawHttp(nextPort, "/iam/verify-email?token=one&callbackURL=%2Fauth&token=two")
    const encodedKey = await rawHttp(nextPort, "/iam/verify-email?%74oken=one")
    const normalizedDuplicate = await rawHttp(nextPort, "/iam/verify-email?token=one&%74oken=two")
    const extra = await rawHttp(nextPort, "/iam/verify-email?token=one&extra=one")
    const empty = await rawHttp(nextPort, "/iam/verify-email?token=")
    const wrongMethod = await rawPost(nextPort, "/iam/verify-email?token=one", "x=y", {
      origin: `http://localhost:${nextPort}`,
    })
    const credential = await rawHttp(nextPort, "/iam/verify-email?token=one", undefined, undefined, {
      authorization: "Bearer attacker",
      cookie: "kokoro_session=product",
    })
    expect(alias.status).toBe(404)
    expect(encodedKey.status).toBe(200)
    expect(receivedPaths.splice(0)).toEqual(["/iam/verify-email?token=one"])
    expect([duplicate.status, normalizedDuplicate.status, extra.status, empty.status]).toEqual([404, 404, 404, 404])
    expect(wrongMethod.status).toBe(405)
    expect(credential.status).toBe(403)
    expect(credential.headers["cache-control"]).toBe("no-store")
    expect(credential.headers["referrer-policy"]).toBe("no-referrer")
    expect(receivedPaths).toEqual([])
  })

  it("does not send the verification token URL as Referer on real Chromium same-origin navigation", async () => {
    verifyEmailContentType = "text/html"
    verifyEmailBody = '<a href="/iam/jwks">continue</a>'
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(`http://localhost:${nextPort}/iam/verify-email?token=secret-token`, {
        waitUntil: "domcontentloaded",
      })
      const followup = page.waitForRequest((request) => new URL(request.url()).pathname === "/iam/jwks")
      await page.getByRole("link", { name: "continue" }).click()
      const followupHeaders = await (await followup).allHeaders()
      expect(receivedPaths).toEqual(["/iam/verify-email?token=secret-token", "/iam/jwks"])
      expect(followupHeaders.referer).toBeUndefined()
    } finally {
      await browser.close()
    }
  }, 30_000)

  it("keeps a real Chromium verification 302 inside the fixed origin", async () => {
    verifyEmailStatus = 302
    verifyEmailLocation = `http://localhost:${nextPort}/iam/jwks`
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      const followup = page.waitForRequest((request) => new URL(request.url()).pathname === "/iam/jwks")
      await page.goto(`http://localhost:${nextPort}/iam/verify-email?token=secret-token`, {
        waitUntil: "domcontentloaded",
      })
      const followupHeaders = await (await followup).allHeaders()
      expect(receivedPaths).toEqual(["/iam/verify-email?token=secret-token", "/iam/jwks"])
      expect(page.url()).toBe(`http://localhost:${nextPort}/iam/jwks`)
      expect(followupHeaders.referer).toBeUndefined()
    } finally {
      await browser.close()
    }
  }, 30_000)

  it("rejects a chunked GET body before opening BFF", async () => {
    const response = await rawHttp(nextPort, "/iam/jwks", undefined, "unexpected-body")

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "iam_relay_body_rejected" } })
    expect(receivedPaths).toEqual([])
  })

  it("records Next canonicalization honestly without expanding the relay allowlist", async () => {
    const dotSegment = await rawHttp(nextPort, "/iam/oauth2/../jwks")
    expect(dotSegment.status).toBe(200)
    expect(receivedPaths.splice(0)).toEqual(["/iam/jwks"])

    const encodedDotSegment = await rawHttp(nextPort, "/iam/oauth2/%2e%2e/jwks")
    expect(encodedDotSegment.status).toBe(200)
    expect(receivedPaths.splice(0)).toEqual(["/iam/jwks"])

    const doubleSlash = await rawHttp(nextPort, "/iam/oauth2//authorize")
    expect(doubleSlash.status).toBe(308)
    expect(doubleSlash.headers.location).toBe("/iam/oauth2/authorize")
    expect(receivedPaths).toEqual([])

    const encodedName = await rawHttp(nextPort, "/iam/oauth2/%61uthorize")
    expect(encodedName.status).toBe(404)
    expect(receivedPaths).toEqual([])
  })

  it("rejects forged POSTs before the BFF socket and consumes a valid one-time proof", async () => {
    const signedQuery = "?sig=%2BAb"
    const page = await signInPage()
    expect(page.status).toBe(200)
    expect(receivedPaths).toEqual([])
    const csrf = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    expect(csrf).toBeDefined()
    const cookie = (page.headers["set-cookie"] as string[] | undefined)?.[0]?.split(";")[0]
    expect(cookie).toBeDefined()
    const form = `csrf_token=${csrf}&email=user%40example.test&password=secret`
    const validHeaders = { origin: `http://localhost:${nextPort}`, cookie: cookie ?? "" }

    const evil = await rawPost(nextPort, `/auth/sign-in${signedQuery}`, form, { ...validHeaders, origin: "https://evil.example" })
    expect(evil.status).toBe(403)
    const noOrigin = await rawPost(nextPort, `/auth/sign-in${signedQuery}`, form, { cookie: validHeaders.cookie })
    expect(noOrigin.status).toBe(403)
    const missing = await rawPost(nextPort, `/auth/sign-in${signedQuery}`, form, { origin: validHeaders.origin })
    expect(missing.status).toBe(403)
    const wrongQuery = await rawPost(nextPort, "/auth/sign-in?sig=+Ab", form, validHeaders)
    expect(wrongQuery.status).toBe(403)
    const wrongPath = await rawPost(nextPort, "/iam/sign-in/email", form, validHeaders)
    expect(wrongPath.status).toBe(405)
    const oversized = await rawPost(nextPort, `/auth/sign-in${signedQuery}`, `${form}&padding=${"x".repeat(65_536)}`, validHeaders)
    expect(oversized.status).toBe(400)
    expect(receivedPaths).toEqual([])

    const freshPage = await signInPage()
    const freshCsrf = freshPage.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const freshCookie = (freshPage.headers["set-cookie"] as string[] | undefined)?.[0]?.split(";")[0]
    expect(freshCsrf).toBeDefined()
    expect(freshCookie).toBeDefined()
    const freshForm = `csrf_token=${freshCsrf}&email=user%40example.test&password=secret`
    const freshHeaders = { origin: validHeaders.origin, cookie: freshCookie ?? "" }
    const accepted = await rawPost(nextPort, `/auth/sign-in${signedQuery}`, freshForm, freshHeaders)
    expect(accepted.status).toBe(303)
    expect(accepted.headers.location).toBe(`http://localhost:${nextPort}/auth/select-tenant?sig=%2BAb`)
    expect(accepted.body).not.toContain("must-not-reach-browser")
    expect((accepted.headers["set-cookie"] as string[] | undefined)?.length).toBe(3)
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email", "/iam/oauth2/continue"])
    expect(JSON.parse(receivedBodies[1] ?? "{}")).toEqual({ postLogin: true, oauth_query: "sig=%2BAb" })
    const replay = await rawPost(nextPort, `/auth/sign-in${signedQuery}`, freshForm, freshHeaders)
    expect(replay.status).toBe(403)
    expect(receivedPaths).toEqual([])
  })

  it.each([401, 429, 503])("sanitizes sign-in %i before any continuation", async (status) => {
    signInStatus = status
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = (page.headers["set-cookie"] as string[] | undefined)?.[0]?.split(";")[0]
    const result = await rawPost(nextPort, "/auth/sign-in?sig=%2BAb", `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: cookie ?? "",
    })
    expect(result.status).toBe(status === 503 ? 503 : status)
    expect(result.body).not.toContain("sensitive-marker-must-not-reach-browser")
    expect(result.body).not.toContain("must-not-reach-browser")
    expect(result.headers["set-cookie"]).toEqual(expect.not.arrayContaining([expect.stringContaining("kokoro-issuer")]))
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email"])
  })

  it("keeps a browser credential error on the IAM form with a fresh CSRF proof", async () => {
    signInStatus = 401
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = (page.headers["set-cookie"] as string[] | undefined)?.[0]?.split(";")[0]
    const result = await rawPost(nextPort, "/auth/sign-in?sig=%2BAb", `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: cookie ?? "", accept: "text/html",
    })
    expect(result.status).toBe(401)
    expect(result.body).toContain('name="email" type="email"')
    expect(result.body).toContain('value="user@example.test"')
    expect(result.body).toContain('role="alert"')
    expect(result.body).not.toContain("password=secret")
    expect(result.body).not.toContain("sensitive-marker-must-not-reach-browser")
    expect(result.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]).not.toBe(token)
    expect((result.headers["set-cookie"] as string[] | undefined)?.length).toBe(1)
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email"])
  })

  it("preserves a native 302 continuation with multiple issuer cookies", async () => {
    continueStatus = 302
    continueSetCookies = [
      "kokoro-issuer.session_data=updated; Path=/iam; HttpOnly; SameSite=Lax",
      "kokoro-issuer.dont_remember=one; Path=/iam; HttpOnly; SameSite=Lax",
    ]
    const result = await submitValidSignIn()
    expect(result.status).toBe(302)
    expect(result.headers.location).toBe("/auth/select-tenant?sig=%2BAb")
    const cookies = result.headers["set-cookie"] as string[] | undefined
    expect(cookies).toEqual(expect.arrayContaining([
      expect.stringContaining("kokoro-issuer.session_token=opaque;"),
      expect.stringContaining("kokoro-issuer.session_data=updated;"),
      expect.stringContaining("kokoro-issuer.dont_remember=one;"),
    ]))
    expect(cookies).toHaveLength(4)
    expect(result.body).toBe("")
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email", "/iam/oauth2/continue"])
  })

  it("rejects a native 302 continuation with an unsafe Location without issuer cookies", async () => {
    continueStatus = 302
    continueLocation = "https://evil.example/auth/select-tenant?sig=%2BAb"
    continueSetCookies = ["kokoro-issuer.dont_remember=one; Path=/iam; HttpOnly; SameSite=Lax"]
    const result = await submitValidSignIn()
    expect(result.status).toBe(502)
    expect(result.headers.location).toBeUndefined()
    expect((result.headers["set-cookie"] as string[] | undefined)?.some((value) => value.includes("kokoro-issuer"))).not.toBe(true)
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email", "/iam/oauth2/continue"])
  })

  it("continues the fixed tenant without rendering a selection or retry page", async () => {
    const tenant = await rawHttp(nextPort, "/iam/interactions/select-tenant?sig=%2BAb", undefined, undefined, {
      cookie: "kokoro-issuer.session_token=opaque",
    })
    const consent = await interactionProof("/iam/interactions/consent?sig=%2BAb&scope=openid")
    expect(tenant.status).toBe(303)
    expect(tenant.body).toBe("")
    expect(tenant.headers.location).toBe(`http://localhost:${nextPort}/auth/consent?sig=%2BAb&scope=openid`)
    expect(receivedBodies[0]).toBe(JSON.stringify({ organizationId: "tenant-one", oauth_query: "sig=%2BAb" }))
    expect((await rawPost(nextPort, "/iam/interactions/select-tenant?sig=%2BAb", "organization_id=tenant-other", {
      origin: `http://localhost:${nextPort}`,
    })).status).toBe(405)
    expect(consent.page.status).toBe(200)
    expect(consent.page.body).toContain("openid")
    expect(receivedPaths.splice(0)).toEqual(["/iam/organization/set-active"])
  })

  it("carries Path=/iam issuer cookies through outer redirects into both real interaction pages", async () => {
    sessionRequired = true
    const outerTenantPost = await rawPost(nextPort, "/auth/select-tenant?sig=%2BAb", "organization_id=tenant-one", {
      origin: `http://localhost:${nextPort}`,
    })
    const outerConsentPost = await rawPost(nextPort, "/auth/consent?sig=%2BAb&scope=openid", "decision=agree", {
      origin: `http://localhost:${nextPort}`,
    })
    const directTenantPost = await rawPost(nextPort, "/iam/organization/set-active", "organizationId=tenant-one", {
      origin: `http://localhost:${nextPort}`,
    })
    const directConsentPost = await rawPost(nextPort, "/iam/oauth2/consent", "accept=true", {
      origin: `http://localhost:${nextPort}`,
    })
    expect([outerTenantPost.status, outerConsentPost.status, directTenantPost.status, directConsentPost.status]).toEqual([405, 405, 405, 405])
    expect(receivedPaths).toEqual([])
    const jar = pathCookieJar()
    const signIn = await signInPage()
    jar.absorb(signIn)
    const signInToken = signIn.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const signedIn = await rawPost(nextPort, "/auth/sign-in?sig=%2BAb", `csrf_token=${signInToken}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: jar.headerFor("/auth/sign-in"),
    })
    expect(signedIn.status).toBe(303)
    jar.absorb(signedIn)
    expect(jar.headerFor("/auth/select-tenant")).not.toContain("kokoro-issuer")
    const outerTenant = await rawHttp(nextPort, "/auth/select-tenant?sig=%2BAb", undefined, undefined, {
      cookie: jar.headerFor("/auth/select-tenant"),
    })
    expect(outerTenant.status).toBe(302)
    expect(outerTenant.headers.location).toBe("/iam/interactions/select-tenant?sig=%2BAb")
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email", "/iam/oauth2/continue"])
    const innerTenant = await rawHttp(nextPort, outerTenant.headers.location as string, undefined, undefined, {
      cookie: jar.headerFor(outerTenant.headers.location as string),
    })
    expect(innerTenant.status).toBe(303)
    expect(innerTenant.body).toBe("")
    expect(innerTenant.headers.location).toBe(`http://localhost:${nextPort}/auth/consent?sig=%2BAb&scope=openid`)
    jar.absorb(innerTenant)
    expect(jar.headerFor("/auth/consent")).not.toContain("kokoro-issuer")
    const beforeOuterConsent = receivedPaths.length
    const outerConsent = await rawHttp(nextPort, "/auth/consent?sig=%2BAb&scope=openid", undefined, undefined, {
      cookie: jar.headerFor("/auth/consent"),
    })
    expect(outerConsent.status).toBe(302)
    expect(outerConsent.headers.location).toBe("/iam/interactions/consent?sig=%2BAb&scope=openid")
    expect(receivedPaths).toHaveLength(beforeOuterConsent)
    const innerConsent = await rawHttp(nextPort, outerConsent.headers.location as string, undefined, undefined, {
      cookie: jar.headerFor(outerConsent.headers.location as string),
    })
    expect(innerConsent.status).toBe(200)
    const consentToken = innerConsent.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    expect(consentToken).toBeDefined()
    if (consentToken !== undefined) issuedCsrfTokens.add(consentToken)
    jar.absorb(innerConsent)
    const consented = await rawPost(nextPort, "/iam/interactions/consent?sig=%2BAb&scope=openid",
      `csrf_token=${consentToken}&decision=agree`, {
        origin: `http://localhost:${nextPort}`, cookie: jar.headerFor("/iam/interactions/consent"),
      })
    expect(consented.status).toBe(503)
    expect(JSON.parse(consented.body)).toMatchObject({ error: { code: "rp_callback_unavailable" } })
    expect(receivedPaths.splice(0)).toEqual([
      "/iam/organization/set-active", "/iam/oauth2/consent",
    ])
  })

  it("rejects malformed outer interaction redirects without reaching the BFF", async () => {
    const badHost = await rawHttp(nextPort, "/auth/select-tenant?sig=%2BAb", "evil.example")
    const badOrigin = await rawHttp(nextPort, "/auth/consent?sig=%2BAb&scope=openid", undefined, undefined, {
      origin: "https://evil.example",
    })
    const missingSignature = await rawHttp(nextPort, "/auth/select-tenant?scope=openid")
    const body = await rawHttp(nextPort, "/auth/consent?sig=%2BAb&scope=openid", undefined, "unexpected")
    expect([badHost.status, badOrigin.status, missingSignature.status, body.status]).toEqual([403, 403, 404, 400])
    expect(receivedPaths).toEqual([])
  })

  it("rejects HEAD and OPTIONS on all four interaction routes without BFF or Redis writes", async () => {
    const paths = [
      "/auth/select-tenant?sig=%2BAb",
      "/auth/consent?sig=%2BAb&scope=openid",
      "/iam/interactions/select-tenant?sig=%2BAb",
      "/iam/interactions/consent?sig=%2BAb&scope=openid",
    ]
    const keysBefore = await ownCsrfKeys()
    for (const path of paths) for (const method of ["HEAD", "OPTIONS"] as const) {
      const result = await rawMethod(nextPort, path, method)
      expect(result.status, `${method} ${path}`).toBe(405)
      expect(result.headers["set-cookie"]).toBeUndefined()
      expect(result.body).toBe("")
    }
    expect(receivedPaths).toEqual([])
    expect(await ownCsrfKeys()).toEqual(keysBefore)

    const bypass = prepareInteraction(new Request("https://web.example/iam/interactions/consent?sig=proof", {
      method: "HEAD",
    }), "/iam/interactions/consent", "GET")
    expect(bypass).toBeInstanceOf(Response)
    expect((bypass as Response).status).toBe(405)
  })

  it.each([
    "Max-Age=0",
    "Expires=Wed, 01 Jan 2020 00:00:00 GMT",
  ])("retains the valid issuer session when IAM deletes session_data with %s", async (expiry) => {
    sessionRequired = true
    setActiveCookies = [`kokoro-issuer.session_data=; Path=/iam; HttpOnly; SameSite=Lax; ${expiry}`]
    const jar = pathCookieJar()
    const signIn = await signInPage()
    jar.absorb(signIn)
    const signInToken = signIn.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const signedIn = await rawPost(nextPort, "/auth/sign-in?sig=%2BAb", `csrf_token=${signInToken}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: jar.headerFor("/auth/sign-in"),
    })
    expect(signedIn.status).toBe(303)
    jar.absorb(signedIn)
    expect(jar.headerFor("/iam/interactions/select-tenant")).toContain("kokoro-issuer.session_data=opaque-data")
    const path = "/iam/interactions/select-tenant?sig=%2BAb"
    const page = await rawHttp(nextPort, path, undefined, undefined, { cookie: jar.headerFor(path) })
    expect(page.status).toBe(303)
    jar.absorb(page)
    expect(jar.headerFor(path)).toContain("kokoro-issuer.session_token=opaque")
    expect(jar.headerFor(path)).not.toContain("kokoro-issuer.session_data")
    expect(receivedPaths.splice(0)).toEqual([
      "/iam/sign-in/email", "/iam/oauth2/continue", "/iam/organization/set-active",
    ])
  })

  it("honors Max-Age precedence over an expired Expires when computing issuer binding", () => {
    const previous = "kokoro-issuer.session_token=opaque; kokoro-issuer.session_data=old"
    expect(issuerCookieAfter(previous, [
      "kokoro-issuer.session_data=new; Path=/iam; HttpOnly; SameSite=Lax; Max-Age=60; Expires=Wed, 01 Jan 2020 00:00:00 GMT",
    ])).toBe("kokoro-issuer.session_token=opaque; kokoro-issuer.session_data=new")
  })

  it("accepts only a signed server-fixed tenant continuation, never a browser selection", async () => {
    const path = "/iam/interactions/select-tenant?sig=%2BAb"
    const cookie = "kokoro-issuer.session_token=opaque"
    const selected = await rawPost(nextPort, path, "organization_id=tenant-other", {
      origin: `http://localhost:${nextPort}`, cookie,
    })
    expect(selected.status).toBe(405)
    const badHost = await rawHttp(nextPort, path, "evil.example", undefined, { cookie })
    const duplicateSig = await rawHttp(nextPort, `${path}&sig=duplicate`, undefined, undefined, { cookie })
    const noIssuer = await rawHttp(nextPort, path)
    expect([badHost.status, duplicateSig.status, noIssuer.status]).toEqual([403, 404, 401])
    expect(receivedPaths).toEqual([])

    const continued = await rawHttp(nextPort, path, undefined, undefined, { cookie })
    expect(continued.status).toBe(303)
    expect(continued.body).toBe("")
    expect(continued.headers.location).toBe(`http://localhost:${nextPort}/auth/consent?sig=%2BAb&scope=openid`)
    expect(receivedPaths.splice(0)).toEqual(["/iam/organization/set-active"])
    expect(JSON.parse(receivedBodies.at(-1) ?? "{}")).toEqual({ organizationId: "tenant-one", oauth_query: "sig=%2BAb" })
  })

  it("preserves native tenant 302 issuer cookies and rejects unsafe or looping continuations", async () => {
    const path = "/iam/interactions/select-tenant?sig=%2BAb"
    const headers = { cookie: "kokoro-issuer.session_token=opaque" }
    setActiveStatus = 302
    setActiveCookies = [
      "kokoro-issuer.session_data=updated; Path=/iam; HttpOnly; SameSite=Lax",
      "kokoro-issuer.dont_remember=one; Path=/iam; HttpOnly; SameSite=Lax",
    ]
    const result = await rawHttp(nextPort, path, undefined, undefined, headers)
    expect(result.status).toBe(302)
    expect(result.headers.location).toBe(setActiveLocation)
    expect(result.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("kokoro-issuer.session_data=updated;"),
      expect.stringContaining("kokoro-issuer.dont_remember=one;"),
    ]))
    receivedPaths.length = 0
    setActiveLocation = "https://evil.example/auth/consent?sig=%2BAb"
    const rejected = await rawHttp(nextPort, path, undefined, undefined, headers)
    expect(rejected.status).toBe(502)
    expect(rejected.headers.location).toBeUndefined()
    expect(rejected.headers["set-cookie"]).toBeUndefined()
    expect(receivedPaths.splice(0)).toEqual(["/iam/organization/set-active"])
    setActiveLocation = `http://localhost:${nextPort}/auth/select-tenant?sig=%2BAb`
    const loop = await rawHttp(nextPort, path, undefined, undefined, headers)
    expect(loop.status).toBe(502)
    expect(loop.headers.location).toBeUndefined()
    expect(loop.headers["set-cookie"]).toBeUndefined()
  })

  it("requires explicit consent and binds its unverified scope preview to the signed query", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid+profile"
    const { page, token, cookie } = await interactionProof(path)
    expect(page.body).toContain("identity provider validates")
    expect(page.body).toContain("<li>openid</li><li>profile</li>")
    expect(receivedPaths).toEqual([])
    const headers = { origin: `http://localhost:${nextPort}`, cookie }
    const denied = await rawPost(nextPort, path, `csrf_token=${token}&decision=decline`, headers)
    expect(denied.status).toBe(403)
    const altered = await rawPost(nextPort, "/iam/interactions/consent?sig=%2BAb&scope=openid", `csrf_token=${token}&decision=agree`, headers)
    expect(altered.status).toBe(403)
    const evil = await rawPost(nextPort, path, `csrf_token=${token}&decision=agree`, { ...headers, origin: "https://evil.example" })
    expect(evil.status).toBe(403)
    const noOrigin = await rawPost(nextPort, path, `csrf_token=${token}&decision=agree`, { cookie })
    expect(noOrigin.status).toBe(403)
    expect(receivedPaths).toEqual([])
    const fresh = await interactionProof(path)
    const accepted = await rawPost(nextPort, path, `csrf_token=${fresh.token}&decision=agree`, {
      origin: headers.origin, cookie: fresh.cookie,
    })
    expect(accepted.status).toBe(503)
    expect(JSON.parse(accepted.body)).toMatchObject({ error: { code: "rp_callback_unavailable" } })
    expect(accepted.body).not.toContain("secret-code")
    expect(accepted.headers.location).toBeUndefined()
    expect(accepted.headers["set-cookie"]).toBeUndefined()
    expect(receivedPaths.splice(0)).toEqual(["/iam/oauth2/consent"])
    expect(JSON.parse(receivedBodies.at(-1) ?? "{}")).toEqual({ accept: true, scope: "openid profile", oauth_query: "sig=%2BAb&scope=openid+profile" })
    const replay = await rawPost(nextPort, path, `csrf_token=${fresh.token}&decision=agree`, {
      origin: headers.origin, cookie: fresh.cookie,
    })
    expect(replay.status).toBe(403)
    expect(receivedPaths).toEqual([])
  })

  it("sanitizes IAM consent signature rejection and unsafe continuation", async () => {
    const path = "/iam/interactions/consent?sig=forged&scope=openid"
    consentStatus = 401
    consentCookies = ["kokoro-issuer.session_data=sensitive; Path=/iam; HttpOnly; SameSite=Lax"]
    const first = await interactionProof(path)
    const rejected = await rawPost(nextPort, path, `csrf_token=${first.token}&decision=agree`, {
      origin: `http://localhost:${nextPort}`, cookie: first.cookie,
    })
    expect(rejected.status).toBe(401)
    expect(rejected.body).not.toContain("sensitive-marker")
    expect(rejected.headers["set-cookie"]).toBeUndefined()
    receivedPaths.length = 0
    consentStatus = 302
    consentLocation = "https://evil.example/auth/select-tenant?sig=forged"
    const second = await interactionProof(path)
    const unsafe = await rawPost(nextPort, path, `csrf_token=${second.token}&decision=agree`, {
      origin: `http://localhost:${nextPort}`, cookie: second.cookie,
    })
    expect(unsafe.status).toBe(502)
    expect(unsafe.headers.location).toBeUndefined()
    expect(unsafe.headers["set-cookie"]).toBeUndefined()
  })

  it("preserves an allowed native consent 302 with multiple issuer cookies", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    consentStatus = 302
    consentLocation = "/auth/select-tenant?sig=%2BAb"
    consentCookies = [
      "kokoro-issuer.session_data=updated; Path=/iam; HttpOnly; SameSite=Lax",
      "kokoro-issuer.dont_remember=one; Path=/iam; HttpOnly; SameSite=Lax",
    ]
    const proof = await interactionProof(path)
    const result = await rawPost(nextPort, path, `csrf_token=${proof.token}&decision=agree`, {
      origin: `http://localhost:${nextPort}`, cookie: proof.cookie,
    })
    expect(result.status).toBe(302)
    expect(result.headers.location).toBe(consentLocation)
    expect(result.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("kokoro-issuer.session_data=updated;"),
      expect.stringContaining("kokoro-issuer.dont_remember=one;"),
    ]))
    expect(receivedPaths.splice(0)).toEqual(["/iam/oauth2/consent"])
  })

  it("forwards a native 302 only to the installed fixed RP callback with issuer cookies", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    consentStatus = 302
    consentLocation = `/api/auth/callback/kokoro-iam?code=secret-code&state=secret-state-123456&iss=${encodeURIComponent(`http://localhost:${nextPort}/iam`)}`
    consentCookies = ["kokoro-issuer.session_data=secret; Path=/iam; HttpOnly; SameSite=Lax"]
    const proof = await interactionProof(path)
    const result = await rawPost(nextPort, path, `csrf_token=${proof.token}&decision=agree`, {
      origin: `http://localhost:${nextPort}`, cookie: proof.cookie,
    })
    expect(result.status).toBe(302)
    expect(result.body).not.toContain("secret-code")
    expect(result.headers.location).toBe(consentLocation)
    expect(result.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining("kokoro-issuer.session_data=secret;"),
    ]))
  })

  it("forwards IAM's JSON consent callback only with its exact issuer response parameter", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    const callback = `http://localhost:${nextPort}/api/auth/callback/kokoro-iam?code=secret-code&state=secret-state-123456`
    const issuer = encodeURIComponent(`http://localhost:${nextPort}/iam`)
    consentPayload = { redirect: true, url: `${callback}&iss=${issuer}` }
    const proof = await interactionProof(path)
    const accepted = await rawPost(nextPort, path, `csrf_token=${proof.token}&decision=agree`, {
      origin: `http://localhost:${nextPort}`, cookie: proof.cookie,
    })
    expect(accepted.status).toBe(303)
    expect(accepted.headers.location).toBe(`${callback}&iss=${issuer}`)
    for (const url of [callback, `${callback}&iss=${encodeURIComponent("https://evil.example/iam")}`,
      `${callback}&iss=${issuer}&iss=${issuer}`, `${callback}&iss=${issuer}&extra=1`]) {
      consentPayload = { redirect: true, url }
      const invalidProof = await interactionProof(path)
      const rejected = await rawPost(nextPort, path, `csrf_token=${invalidProof.token}&decision=agree`, {
        origin: `http://localhost:${nextPort}`, cookie: invalidProof.cookie,
      })
      expect(rejected.status).toBe(503)
      expect(JSON.parse(rejected.body)).toMatchObject({ error: { code: "rp_callback_unavailable" } })
      expect(rejected.headers.location).toBeUndefined()
    }
  })

  it.each([401, 429, 503])("sanitizes consent owner %i without response body or issuer cookies", async (status) => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    consentStatus = status
    consentCookies = ["kokoro-issuer.session_data=secret; Path=/iam; HttpOnly; SameSite=Lax"]
    const proof = await interactionProof(path)
    const result = await rawPost(nextPort, path, `csrf_token=${proof.token}&decision=agree`, {
      origin: `http://localhost:${nextPort}`, cookie: proof.cookie,
    })
    expect(result.status).toBe(status)
    expect(result.body).not.toContain("sensitive-marker")
    expect(result.headers["set-cookie"]).toBeUndefined()
  })

  it("rejects malformed consent scope and direct IAM mutation before any BFF socket", async () => {
    const absent = await rawHttp(nextPort, "/iam/interactions/consent?sig=abc")
    const repeated = await rawHttp(nextPort, "/iam/interactions/consent?sig=abc&scope=openid&scope=profile")
    const injected = await rawHttp(nextPort, "/iam/interactions/consent?sig=abc&scope=%3Cscript%3E")
    expect([absent.status, repeated.status, injected.status]).toEqual([400, 400, 400])
    const direct = await rawPost(nextPort, "/iam/oauth2/consent", "accept=true", { origin: `http://localhost:${nextPort}` })
    expect(direct.status).toBe(405)
    expect(receivedPaths).toEqual([])
  })

  it.each([401, 403, 429, 503])("sanitizes fixed tenant continuation %i without upstream body or issuer cookies", async (status) => {
    const path = "/iam/interactions/select-tenant?sig=%2BAb"
    receivedPaths.length = 0
    setActiveStatus = status
    setActiveCookies = ["kokoro-issuer.session_data=secret; Path=/iam; HttpOnly; SameSite=Lax"]
    const result = await rawHttp(nextPort, path, undefined, undefined, {
      cookie: "kokoro-issuer.session_token=opaque",
    })
    expect(result.status).toBe(status)
    expect(result.body).not.toContain("sensitive-marker")
    expect(result.headers["set-cookie"]).toBeUndefined()
    expect(receivedPaths.splice(0)).toEqual(["/iam/organization/set-active"])
  })

  it.each([
    { redirect: true, url: "https://evil.example/auth/select-tenant?sig=%2BAb" },
    { redirect: true, url: "http://localhost.evil.example/auth/select-tenant?sig=%2BAb" },
    { redirect: true, url: "/auth/select-tenant?sig=%2BAb" },
    { redirect: true, url: "http://localhost:PORT/unknown?sig=%2BAb" },
    { redirect: true, url: "http://localhost:PORT/auth/%73elect-tenant?sig=%2BAb" },
    { redirect: true, url: "http://localhost:PORT/auth/../auth/consent?sig=%2BAb" },
    { redirect: true, url: "http://localhost:PORT/auth/select-tenant" },
    { redirect: true, url: "http://localhost:PORT/auth/select-tenant?sig=%2BAb#fragment" },
    { redirect: false, url: "http://localhost:PORT/auth/select-tenant?sig=%2BAb" },
    { redirect: true, url: "http://localhost:PORT/auth/select-tenant?sig=%2BAb", extra: "drift" },
  ])("rejects unsafe or drifting continuation JSON %#", async (payload) => {
    continuePayload = { ...payload, url: payload.url.replace("PORT", String(nextPort)) }
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = (page.headers["set-cookie"] as string[] | undefined)?.[0]?.split(";")[0]
    const result = await rawPost(nextPort, "/auth/sign-in?sig=%2BAb", `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: cookie ?? "",
    })
    expect(result.status).toBe(502)
    expect(result.headers.location).toBeUndefined()
    expect(result.body).not.toContain("must-not-reach-browser")
    expect((result.headers["set-cookie"] as string[] | undefined)?.some((value) => value.includes("kokoro-issuer"))).not.toBe(true)
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email", "/iam/oauth2/continue"])
  })
})
