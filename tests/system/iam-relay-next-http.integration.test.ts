import { nextFixtureEnvironment } from "./fixtures/next-fixture-environment"
import { spawn, type ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { createHash, randomUUID } from "node:crypto"
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { createServer, request as httpRequest, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { createClient } from "redis"
import { chromium } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { iamCsrfKeyPrefix } from "@/lib/server/iam-interaction-csrf"
import { iamSignInFlowKeyPrefix } from "@/lib/server/iam-sign-in-flow"
import { issuerCookieAfter, prepareInteraction } from "@/lib/server/iam-interaction-route"

type HttpResult = Readonly<{ status: number; headers: Readonly<Record<string, string | string[] | undefined>>; body: string }>

function loginStartForm(response: HttpResult): URLSearchParams {
  const csrfToken = response.body.match(/name="csrfToken" value="([a-f0-9]{64})"/u)?.[1]
  const loginIntent = response.body.match(/name="loginIntent" value="([A-Za-z0-9_.-]+)"/u)?.[1]
  if (!csrfToken || !loginIntent) throw new Error("missing signed login form")
  return new URLSearchParams({ csrfToken, loginIntent })
}

function loginStartCsrf(response: HttpResult, authSecret = "a".repeat(32)): string {
  expect(response.status).toBe(200)
  expect(response.headers.location).toBeUndefined()
  expect(response.headers["content-type"]).toBe("text/html; charset=utf-8")
  expect(response.headers["cache-control"]).toBe("no-store")
  expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  expect([...response.body.matchAll(/<form\b[^>]*>/giu)].map(([tag]) => tag)).toEqual([
    '<form id="kokoro-login-start" method="post" action="/api/auth/signin/kokoro-iam">',
  ])
  const inputs = [...response.body.matchAll(/<input\b[^>]*>/giu)].map(([tag]) => tag)
  expect(inputs).toEqual([expect.stringMatching(/^<input type="hidden" name="csrfToken" value="[a-f0-9]{64}">$/u), expect.stringMatching(/^<input type="hidden" name="loginIntent" value="[A-Za-z0-9_.-]+">$/u)])
  const token = inputs[0]?.match(/value="([a-f0-9]{64})"/u)?.[1]
  if (token === undefined) throw new Error("login start did not issue its single CSRF field")
  expect([...response.body.matchAll(/<meta\b[^>]*\bname="referrer"[^>]*>/giu)].map(([tag]) => tag))
    .toEqual(['<meta name="referrer" content="no-referrer">'])
  const scripts = [...response.body.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu)].map(([tag]) => tag)
  expect(scripts).toEqual([expect.stringMatching(/^<script nonce="[A-Za-z0-9_-]{16,128}">document\.getElementById\("kokoro-login-start"\)\?\.submit\(\)<\/script>$/u)])
  const nonce = scripts[0]?.match(/nonce="([A-Za-z0-9_-]{16,128})"/u)?.[1]
  if (nonce === undefined) throw new Error("login start did not issue its nonce-bound script")
  const csp = response.headers["content-security-policy"]
  if (typeof csp !== "string") throw new Error("login start did not issue its response CSP")
  const directives = csp.split(";").map((directive) => directive.trim().split(/\s+/u))
  const policy = new Map(directives.map(([name, ...values]) => [name, values]))
  expect(policy.size).toBe(directives.length)
  expect(policy.get("script-src")).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'unsafe-eval'"])
  expect(policy.get("form-action")).toEqual(["'self'"])
  expect(policy.get("base-uri")).toEqual(["'self'"])
  expect(policy.get("frame-ancestors")).toEqual(["'none'"])
  const csrfCookies = (response.headers["set-cookie"] as string[] | undefined ?? [])
    .filter((cookie) => cookie.startsWith("next-auth.csrf-token.tx-"))
  const digest = createHash("sha256").update(`${token}${authSecret}`).digest("hex")
  expect(csrfCookies).toEqual([
    `${csrfCookies[0]!.split("=", 1)[0]}=${encodeURIComponent(`${token}|${digest}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`,
  ])
  return token
}

function providerStartLocation(response: HttpResult, origin: string): URL {
  expect(response.status).toBe(302)
  const location = new URL(response.headers.location as string)
  expect(location.origin).toBe(origin)
  expect(location.pathname).toBe("/iam/oauth2/authorize")
  expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{16,1024}$/u)
  expect((response.headers["set-cookie"] as string[] | undefined ?? [])
    .some((cookie) => /^next-auth\.state\.tx-[A-Za-z0-9_-]{22}=/u.test(cookie))).toBe(true)
  return location
}

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
  const exited = () => child.exitCode !== null || child.signalCode !== null
  if (exited()) return
  await new Promise<void>((resolve, reject) => {
    let forcedExit: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      if (forcedExit !== undefined) clearTimeout(forcedExit)
      child.removeListener("exit", observeExit)
      child.removeListener("error", observeExit)
      if (exited()) resolve()
      else reject(new Error("Next fixture process did not exit"))
    }
    const observeExit = () => { if (exited()) finish() }
    const signal = (value: NodeJS.Signals) => {
      // A rejected/failed signal is not proof of quiescence. Keep observing
      // terminal state until the bounded escalation deadline.
      try { child.kill(value) } catch { observeExit() }
    }
    const fallback = setTimeout(() => {
      forcedExit = setTimeout(finish, 1_000)
      signal("SIGKILL")
      observeExit()
    }, 5_000)
    child.once("exit", observeExit)
    child.on("error", observeExit)
    signal("SIGTERM")
    observeExit()
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
  type ResourceKind = "csrf" | "oidc_state" | "product_session" | "sign_in_flow"
  let resourceBaseline: Readonly<Record<ResourceKind, ReadonlySet<string>>> | undefined
  let baselineSentinels: string[] = []

  function productSessionKeyPrefix(origin: string): string {
    return `kokoro:web:product-session:${createHash("sha256").update(origin).digest("hex")}:`
  }

  function oidcStateKeyPrefix(origin: string): string {
    return `kokoro:web:oidc-state:${createHash("sha256").update(origin).digest("hex")}:`
  }

  function resourcePrefixes(): Readonly<Record<ResourceKind, string>> {
    const origin = `http://localhost:${nextPort}`
    return {
      sign_in_flow: iamSignInFlowKeyPrefix(origin),
      csrf: iamCsrfKeyPrefix(origin),
      oidc_state: oidcStateKeyPrefix(origin),
      product_session: productSessionKeyPrefix(origin),
    }
  }

  async function ownResourceKeys(): Promise<Record<ResourceKind, Set<string>>> {
    const prefixes = resourcePrefixes()
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          await client.connect()
          const found: Record<ResourceKind, Set<string>> = {
            sign_in_flow: new Set(), csrf: new Set(), oidc_state: new Set(), product_session: new Set(),
          }
          for (const kind of Object.keys(prefixes) as ResourceKind[]) {
            for await (const batch of client.scanIterator({ MATCH: `${prefixes[kind]}*`, COUNT: 100 })) {
              for (const key of batch) found[kind].add(key)
            }
          }
          return found
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("test Redis resource read deadline")), 2_000)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      client.destroy()
    }
  }

  async function installBaselineSentinels(): Promise<void> {
    const suffix = createHash("sha256").update(randomUUID()).digest("hex")
    const keys = Object.values(resourcePrefixes()).map((prefix) => `${prefix}${suffix}`)
    baselineSentinels = []
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          await client.connect()
          for (const key of keys) {
            // The system file may run all 68 cases at their declared 30-second
            // ceiling; keep the baseline proof alive through setup and teardown.
            if (await client.set(key, "fixture-baseline", { EX: 3_600, NX: true }) !== "OK") {
              throw new Error("test Redis baseline sentinel collision")
            }
            baselineSentinels.push(key)
          }
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("test Redis baseline sentinel deadline")), 2_000)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      client.destroy()
    }
  }

  async function deleteOwnedResourceDelta(): Promise<void> {
    if (resourceBaseline === undefined) return
    const prefixes = resourcePrefixes()
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          await client.connect()
          const delta: string[] = []
          for (const kind of Object.keys(prefixes) as ResourceKind[]) {
            for await (const batch of client.scanIterator({ MATCH: `${prefixes[kind]}*`, COUNT: 100 })) {
              for (const key of batch) if (!resourceBaseline?.[kind].has(key)) delta.push(key)
            }
          }
          if (delta.length > 0) await client.del(delta)
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("test Redis cleanup deadline")), 2_000)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      client.destroy()
    }
  }

  async function removeBaselineSentinels(): Promise<void> {
    if (baselineSentinels.length === 0) return
    const keys = [...baselineSentinels]
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => { await client.connect(); await client.del(keys); baselineSentinels = [] })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("test Redis baseline sentinel cleanup deadline")), 2_000)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      client.destroy()
    }
  }

  async function assertNoOwnedResourceDelta(): Promise<void> {
    if (resourceBaseline === undefined) return
    const current = await ownResourceKeys()
    for (const kind of Object.keys(current) as ResourceKind[]) {
      const count = [...current[kind]].filter((key) => !resourceBaseline?.[kind].has(key)).length
      if (count > 0) throw new Error(`test Redis resource delta: kind=${kind} count=${count}`)
    }
  }

  function closedResourceDelta(error: unknown): string | null {
    if (error instanceof Error && /^test Redis resource delta: kind=(csrf|oidc_state|product_session|sign_in_flow) count=\d+$/u.test(error.message)) {
      return error.message
    }
    if (error instanceof AggregateError) {
      return error.errors.map(closedResourceDelta).find((message) => message !== null) ?? null
    }
    return null
  }

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

  async function cleanupResources(dispose = disposeNextState): Promise<void> {
    const errors: unknown[] = []
    if (next !== undefined) {
      const child = next
      try { await stop(child); next = undefined } catch (error) { errors.push(error) }
    }
    if (bff !== undefined) {
      const server = bff
      try { await close(server); bff = undefined } catch (error) { errors.push(error) }
    }
    if (next === undefined) {
      try { await dispose() } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) {
      const resourceDelta = errors.map(closedResourceDelta).find((message) => message !== null)
      throw new AggregateError(errors, `failed to clean IAM relay Next fixture${resourceDelta ? `; ${resourceDelta}` : ""}`)
    }
  }

  async function disposeNextState(): Promise<void> {
    const errors: unknown[] = []
    if (fixtureRoot !== undefined) {
      const directory = fixtureRoot
      try { await rm(directory, { recursive: true, force: true }); fixtureRoot = undefined } catch (error) { errors.push(error) }
    }
    if (nextPort !== 0) {
      try { await deleteOwnedResourceDelta() } catch (error) { errors.push(error) }
      try { await assertNoOwnedResourceDelta() } catch (error) { errors.push(error) }
      try {
        const current = await ownResourceKeys()
        const present = new Set(Object.values(current).flatMap((keys) => [...keys]))
        const missing = baselineSentinels.filter((key) => !present.has(key)).length
        if (missing > 0) throw new Error(`test Redis baseline sentinel missing: count=${missing}`)
      } catch (error) { errors.push(error) }
      try { await removeBaselineSentinels() } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) {
      const resourceDelta = errors.map(closedResourceDelta).find((message) => message !== null)
      throw new AggregateError(errors, `failed to clean IAM relay Next fixture${resourceDelta ? `; ${resourceDelta}` : ""}`)
    }
  }

  it("retains the active Next handle and never disposes its directory or CSRF keys", async () => {
    vi.useFakeTimers()
    const liveNext = next
    const liveBff = bff
    const child = Object.assign(new EventEmitter(), {
      exitCode: null, signalCode: null, kill: vi.fn(() => false),
    })
    const dispose = vi.fn(async () => undefined)
    next = child as unknown as ChildProcess
    bff = undefined
    try {
      const cleaning = cleanupResources(dispose)
      const outcome = cleaning.then(() => null, (error: unknown) => error)
      await vi.advanceTimersByTimeAsync(6_000)
      expect(await outcome).toBeInstanceOf(AggregateError)
      expect(next).toBe(child)
      expect(dispose).not.toHaveBeenCalled()
    } finally {
      next = liveNext
      bff = liveBff
      vi.useRealTimers()
    }
  })

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
      await installBaselineSentinels()
      resourceBaseline = await ownResourceKeys()
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
          env: await nextFixtureEnvironment(fixtureRoot, {
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
          }),
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

  afterAll(() => cleanupResources())

  it("starts Product OIDC from the server login route", async () => {
    const origin = `http://localhost:${nextPort}`
    const jar = pathCookieJar()
    const response = await rawHttp(nextPort, "/login")
    if (response.status !== 200) throw new Error(`login status ${response.status}; ${nextOutput.slice(-1000)}`)
    const token = loginStartCsrf(response)
    expect((response.headers["set-cookie"] as string[] | undefined)?.some(cookie => /^next-auth\.state\.tx-[A-Za-z0-9_-]{22}=/u.test(cookie)) ?? false).toBe(false)
    const issued = response.headers["set-cookie"] as string[] | undefined
    expect(issued?.filter((cookie) => /^next-auth\.csrf-token\.tx-[A-Za-z0-9_-]{22}=/u.test(cookie))).toHaveLength(1)
    jar.absorb(response)
    const signinOutputStart = nextOutput.length
    const signin = await rawPost(nextPort, "/api/auth/signin/kokoro-iam", loginStartForm(response).toString(), {
      origin: "null", cookie: jar.headerFor("/api/auth/signin/kokoro-iam"),
    })
    if (signin.status !== 302) {
      let errorCode = "unrecognized"
      try {
        const payload: unknown = JSON.parse(signin.body)
        if (typeof payload === "object" && payload !== null && Object.keys(payload).length === 1 && "error" in payload) {
          const error = payload.error
          if (typeof error === "object" && error !== null && Object.keys(error).sort().join(",") === "code,message" &&
            "message" in error && error.message === "RP request was rejected" && "code" in error && typeof error.code === "string" &&
            ["rp_unavailable", "rp_signin_rejected", "rp_origin_rejected", "rp_credential_rejected", "rp_request_too_large",
              "rp_body_rejected", "rp_method_not_allowed", "rp_not_found"].includes(error.code)) errorCode = error.code
        }
      } catch { /* Malformed or foreign payloads retain only the closed diagnostic category. */ }
      const setCookies = signin.headers["set-cookie"]
      console.error("KOKORO_TEST_PRODUCT_PROVIDER_START_FAILURE " + JSON.stringify({
        status: signin.status,
        error_code: errorCode,
        has_location: signin.headers.location !== undefined,
        set_cookie_count: Array.isArray(setCookies) ? setCookies.length : typeof setCookies === "string" ? 1 : 0,
        catch_marker_observed: nextOutput.slice(signinOutputStart).includes("Kokoro RP sign-in start threw"),
      }))
    }
    expect(providerStartLocation(signin, origin).href).toContain("/iam/oauth2/authorize?")
    expect((signin.headers["set-cookie"] as string[] | undefined)
      ?.some((cookie) => /^next-auth\.state\.tx-[A-Za-z0-9_-]{22}=/u.test(cookie))).toBe(true)
    jar.absorb(signin)
    const returning = await rawHttp(nextPort, "/login", `localhost:${nextPort}`, undefined, {
      cookie: jar.headerFor("/login"),
    })
    const returningToken = loginStartCsrf(returning)
    expect(returningToken).not.toBe(token)
    jar.absorb(returning)
    const returningSignin = await rawPost(nextPort, "/api/auth/signin/kokoro-iam",
      loginStartForm(returning).toString(), {
        origin: "null", cookie: jar.headerFor("/api/auth/signin/kokoro-iam"),
      })
    providerStartLocation(returningSignin, origin)
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
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toMatch(/^\/auth\/sign-in\?flow=[A-Za-z0-9_-]{24}$/u)
      expect(await page.locator("body").innerText()).not.toContain('"redirect":true')
      expect((await page.context().cookies()).some((cookie) =>
        cookie.name === "kokoro-issuer.session_token" && cookie.path === "/iam")).toBe(true)
      expect(receivedPaths).toEqual(["/iam/oauth2/authorize?client_id=web"])
    } finally {
      await browser.close()
    }
  }, 30_000)

  it("rejects direct access to the internal React view even with forged proxy headers", async () => {
    const direct = await rawHttp(nextPort, "/auth/sign-in/form?sig=%2BAb", `localhost:${nextPort}`, undefined, {
      "x-kokoro-sign-in-query": "?sig=%2BAb",
      "x-kokoro-sign-in-csrf": "a".repeat(43),
      "x-kokoro-sign-in-proof": "b".repeat(43),
    })
    expect(direct.status).toBe(404)
    expect(direct.body).not.toContain("欢迎回来")
    expect(receivedPaths).toEqual([])
  })

  it("renders the real shadcn issuer form responsively without a retry or connecting page", async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      for (const [name, viewport] of [
        ["desktop", { width: 1440, height: 900 }],
        ["narrow", { width: 560, height: 600 }],
        ["mobile", { width: 390, height: 844 }],
      ] as const) {
        const context = await browser.newContext({ viewport })
        const page = await context.newPage()
        const resourceHeaders: Array<Promise<Record<string, string>>> = []
        page.on("request", (request) => {
          if (request.url().includes("/_next/static/")) resourceHeaders.push(request.allHeaders().catch(() => ({})))
        })
        const response = await page.goto(`http://localhost:${nextPort}/auth/sign-in?sig=%2BAb`, {
          waitUntil: "networkidle",
        })
        expect(response?.status()).toBe(200)
        expect(await page.getByRole("heading", { name: "欢迎回来" }).count()).toBe(1)
        expect(await page.locator("html").getAttribute("lang")).toBe("zh-CN")
        expect(await page.locator('[data-slot="card"]').count()).toBe(1)
        expect(await page.locator('[data-slot="input"]').count()).toBe(2)
        expect(await page.locator('[data-slot="button"]').count()).toBe(1)
        expect(await page.getByRole("button", { name: /重试|连接中/u }).count()).toBe(0)
        const email = page.getByLabel("邮箱")
        const password = page.getByLabel("密码")
        const submit = page.getByRole("button", { name: "登录" })
        await email.focus()
        expect(await email.evaluate((input) => getComputedStyle(input).boxShadow)).not.toBe("none")
        const [emailBox, passwordBox, buttonBox] = await Promise.all([
          email.boundingBox(), password.boundingBox(), submit.boundingBox(),
        ])
        expect(emailBox?.width).toBeGreaterThan(250)
        expect((passwordBox?.y ?? 0)).toBeGreaterThan((emailBox?.y ?? 0) + (emailBox?.height ?? 0))
        expect((buttonBox?.y ?? 0)).toBeGreaterThan((passwordBox?.y ?? 0) + (passwordBox?.height ?? 0))
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
        expect(await page.locator("form").getAttribute("action")).toBe(new URL(page.url()).pathname + new URL(page.url()).search)
        expect(await page.locator('input[name="csrf_token"]').count()).toBe(1)
        expect(response?.headers()["referrer-policy"]).toBe("origin")
        expect((await Promise.all(resourceHeaders)).every((headers) =>
          !headers.referer?.includes("sig="))).toBe(true)
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
        expect(tenant?.status()).toBe(200)
        expect(page.url()).toBe(`http://localhost:${nextPort}/auth/sign-in/failed`)
        await page.getByRole("heading", { name: "恢复工作区", exact: true }).waitFor({ state: "visible" })
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

  function signInAction(page: HttpResult): string {
    const action = page.body.match(/action="(\/auth\/sign-in\?flow=[A-Za-z0-9_-]{24})"/u)?.[1]
    if (!action) throw new Error(`missing short form action: ${page.status}`)
    return action
  }

  function signInCookies(page: HttpResult): string {
    return (page.headers["set-cookie"] as string[] | undefined ?? []).map(cookie => cookie.split(";", 1)[0]!).join("; ")
  }

  async function signInPage(target = "/auth/sign-in?sig=%2BAb"): Promise<HttpResult> {
    const entry = await rawHttp(nextPort, target)
    expect(entry.status).toBe(303)
    const short = new URL(entry.headers.location as string, `http://localhost:${nextPort}`)
    expect(short.pathname + short.search).toMatch(/^\/auth\/sign-in\?flow=[A-Za-z0-9_-]{24}$/u)
    const page = await rawHttp(nextPort, short.pathname + short.search, undefined, undefined, { cookie: signInCookies(entry) })
    expect(page.body).not.toContain("sig=%2BAb")
    expect(page.body).not.toContain("sig=second")
    return { ...page, headers: { ...page.headers, "set-cookie": [
      ...(page.headers["set-cookie"] as string[] | undefined ?? []), ...(entry.headers["set-cookie"] as string[] | undefined ?? []),
    ] } }
  }

  async function submitValidSignIn(): Promise<HttpResult> {
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = signInCookies(page)
    if (token === undefined || cookie === undefined) throw new Error("sign-in fixture CSRF proof missing")
    return rawPost(nextPort, signInAction(page), `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie,
    })
  }

  async function interactionProof(path: string): Promise<{ page: HttpResult; token: string; cookie: string; tenantIds: string }> {
    const page = await rawHttp(nextPort, path)
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = (page.headers["set-cookie"] as string[] | undefined)?.find((value) => value.startsWith("kokoro_iam_csrf="))?.split(";")[0]
    const tenantIds = page.body.match(/name="tenant_ids" value="([^"]*)"/u)?.[1] ?? ""
    if (token === undefined || cookie === undefined) throw new Error(`interaction proof missing for ${path}: ${page.status}`)
    return { page, token, cookie, tenantIds }
  }

  it("restarts an expired signed browser URL through real Next without a server error", async () => {
    const response = await rawHttp(nextPort, "/auth/sign-in?exp=1&sig=%2BAb")
    expect(response.status).toBe(303)
    expect(response.headers.location).toBe("/login")
    expect(response.headers["cache-control"]).toContain("no-store")
    expect(receivedPaths).toEqual([])
  })

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

  it("omits token-bearing authentication URLs from Next development logs without hiding unrelated requests", async () => {
    const token = `verify-log-${randomUUID()}`
    const authorization = `authorize-log-${randomUUID()}`
    const code = `callback-log-${randomUUID()}`
    const callbackLookalike = `lookalike-log-${randomUUID()}`
    const marker = `ordinary-log-${randomUUID()}`
    const formProof = `form-log-${randomUUID()}`
    const tenantOuter = `tenant-outer-log-${randomUUID()}`
    const tenantInner = `tenant-inner-log-${randomUUID()}`
    const verification = await rawHttp(nextPort, `/iam/verify-email?token=${token}`)
    await rawHttp(nextPort, `/iam/oauth2/authorize?client_id=${authorization}`)
    await rawHttp(nextPort, `/api/auth/callback/kokoro-iam?code=${code}`)
    await rawHttp(nextPort, `/api/auth/callback/kokoro-iam-extra?probe=${callbackLookalike}`)
    await rawHttp(nextPort, `/auth/sign-in?sig=${formProof}`)
    await rawHttp(nextPort, `/auth/select-tenant?sig=${tenantOuter}`)
    await rawHttp(nextPort, `/iam/interactions/select-tenant?sig=${tenantInner}`)
    const ordinary = await rawHttp(nextPort, `/iam/jwks?probe=${marker}`)
    expect(verification.status).toBe(200)
    expect(ordinary.status).toBe(200)
    expect(receivedPaths.splice(0)).toEqual([
      `/iam/verify-email?token=${token}`,
      `/iam/oauth2/authorize?client_id=${authorization}`,
      `/iam/jwks?probe=${marker}`,
    ])
    for (let attempt = 0; attempt < 20 && !nextOutput.includes(marker); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(nextOutput).toContain(marker)
    expect(nextOutput).toContain(callbackLookalike)
    expect(nextOutput).not.toContain(token)
    expect(nextOutput).not.toContain(authorization)
    expect(nextOutput).not.toContain(code)
    expect(nextOutput).not.toContain(formProof)
    expect(nextOutput).not.toContain(tenantOuter)
    expect(nextOutput).not.toContain(tenantInner)
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

  it.each(["same", "different"])("keeps both cold IAM forms valid with %s queries and reverse response delivery", async variant => {
    const targets = ["/auth/sign-in?sig=%2BAb", variant === "same" ? "/auth/sign-in?sig=%2BAb" : "/auth/sign-in?sig=second"]
    const pages = await Promise.all(targets.map(target => signInPage(target)))
    const jar = pathCookieJar()
    for (const page of [...pages].reverse()) { expect(page.status).toBe(200); jar.absorb(page) }
    const tokens = pages.map(page => page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)![1]!)
    const names = pages.map(page => (page.headers["set-cookie"] as string[])[0]!.split("=", 1)[0]!)
    expect(new Set(names).size).toBe(2)
    const headers = { origin: `http://localhost:${nextPort}`, cookie: jar.headerFor("/auth/sign-in") }
    const body = (token: string) => new URLSearchParams({ csrf_token: token, email: "user@example.test", password: "secret" }).toString()
    const wrongQuery = await rawPost(nextPort, "/auth/sign-in?flow=" + "x".repeat(24), body(tokens[0]!), headers)
    expect(wrongQuery.status).toBe(403)
    expect(wrongQuery.headers["set-cookie"]).toBeUndefined()
    const results = await Promise.all(pages.map((page, i) => rawPost(nextPort, signInAction(page), body(tokens[i]!), headers)))
    for (const [i, result] of results.entries()) {
      expect(result.status).toBe(303)
      const clears = (result.headers["set-cookie"] as string[]).filter(cookie => cookie.includes("Max-Age=0"))
      expect(clears).toHaveLength(2)
      expect(clears).toContain(`${names[i]}=; Path=/auth/sign-in; Max-Age=0; HttpOnly; SameSite=Lax`)
      expect(clears).toContain(`kokoro_iam_signin_flow_${new URL(signInAction(pages[i]!), "http://test").searchParams.get("flow")}=; Path=/auth/sign-in; Max-Age=0; HttpOnly; SameSite=Lax`)
    }
    expect(receivedPaths.filter(path => path === "/iam/sign-in/email")).toHaveLength(2)
    expect(receivedPaths.filter(path => path === "/iam/oauth2/continue")).toHaveLength(2)
    const replay = await rawPost(nextPort, signInAction(pages[0]!), body(tokens[0]!), headers)
    expect(replay.status).toBe(403)
    expect(replay.headers["set-cookie"]).toBeUndefined()
  })

  it("clears only the failed IAM form and leaves the other form usable", async () => {
    const pages = await Promise.all([signInPage(), signInPage()])
    const jar = pathCookieJar()
    for (const page of pages) jar.absorb(page)
    const token = (page: HttpResult) => page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)![1]!
    const submit = (page: HttpResult) => rawPost(nextPort, signInAction(page),
      new URLSearchParams({ csrf_token: token(page), email: "user@example.test", password: "secret" }).toString(),
      { origin: `http://localhost:${nextPort}`, cookie: jar.headerFor("/auth/sign-in"), accept: "text/html" })
    signInStatus = 401
    const failure = await submit(pages[0]!)
    expect(failure.status).toBe(303)
    jar.absorb(failure)
    signInStatus = 200
    expect((await submit(pages[1]!)).status).toBe(303)
    expect(receivedPaths).toEqual(["/iam/sign-in/email", "/iam/sign-in/email", "/iam/oauth2/continue"])
  })

  it("refreshes a short login repeatedly without growing the proof budget or invalidating another flow", async () => {
    let current = await signInPage()
    const other = await signInPage()
    const action = signInAction(current)
    const jar = pathCookieJar()
    jar.absorb(current)
    jar.absorb(other)
    const oldToken = current.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)![1]!
    for (let i = 0; i < 6; i++) {
      current = await rawHttp(nextPort, action, undefined, undefined, { cookie: jar.headerFor(action) })
      expect(current.status).toBe(200)
      expect(signInAction(current)).toBe(action)
      expect(current.body).not.toContain("sig=%2BAb")
      jar.absorb(current)
      expect(jar.headerFor(action).split(";").filter(cookie => cookie.trim().startsWith("kokoro_iam_csrf_signin_"))).toHaveLength(2)
    }
    const body = (token: string) => new URLSearchParams({ csrf_token: token, email: "user@example.test", password: "secret" }).toString()
    const headers = { origin: `http://localhost:${nextPort}`, cookie: jar.headerFor(action) }
    const stale = await rawPost(nextPort, action, body(oldToken), headers)
    expect(stale.status).toBe(403)
    expect(stale.headers["set-cookie"]).toBeUndefined()
    expect(receivedPaths).toEqual([])
    const otherToken = other.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)![1]!
    expect((await rawPost(nextPort, signInAction(other), body(otherToken), headers)).status).toBe(303)
  })

  it("requires the browser proof for the short address and rejects mixed or legacy POST targets", async () => {
    const page = await signInPage()
    const action = signInAction(page)
    const missing = await rawHttp(nextPort, action)
    expect(missing.status).toBe(303)
    expect(missing.headers.location).toBe("/login")
    const mixed = await rawHttp(nextPort, `${action}&sig=one`, undefined, undefined, { cookie: signInCookies(page) })
    expect(mixed.status).toBe(404)
    const legacy = await rawPost(nextPort, "/auth/sign-in?sig=%2BAb", "email=user%40example.test&password=secret&csrf_token=x", {
      origin: `http://localhost:${nextPort}`, cookie: signInCookies(page),
    })
    expect(legacy.status).toBe(404)
    expect(receivedPaths).toEqual([])
  })

  it("rejects forged POSTs before the BFF socket and consumes a valid one-time proof", async () => {
    const page = await signInPage()
    expect(page.status).toBe(200)
    expect(receivedPaths).toEqual([])
    const csrf = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    expect(csrf).toBeDefined()
    const cookie = signInCookies(page)
    expect(cookie).toBeDefined()
    const form = `csrf_token=${csrf}&email=user%40example.test&password=secret`
    const validHeaders = { origin: `http://localhost:${nextPort}`, cookie: cookie ?? "" }

    const evil = await rawPost(nextPort, signInAction(page), form, { ...validHeaders, origin: "https://evil.example" })
    expect(evil.status).toBe(403)
    const noOrigin = await rawPost(nextPort, signInAction(page), form, { cookie: validHeaders.cookie })
    expect(noOrigin.status).toBe(403)
    const missing = await rawPost(nextPort, signInAction(page), form, { origin: validHeaders.origin })
    expect(missing.status).toBe(403)
    const wrongQuery = await rawPost(nextPort, "/auth/sign-in?flow=" + "x".repeat(24), form, validHeaders)
    expect(wrongQuery.status).toBe(403)
    const wrongPath = await rawPost(nextPort, "/iam/sign-in/email", form, validHeaders)
    expect(wrongPath.status).toBe(405)
    const oversized = await rawPost(nextPort, signInAction(page), `${form}&padding=${"x".repeat(65_536)}`, validHeaders)
    expect(oversized.status).toBe(400)
    expect(receivedPaths).toEqual([])

    const freshPage = await signInPage()
    const freshCsrf = freshPage.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const freshCookie = signInCookies(freshPage)
    expect(freshCsrf).toBeDefined()
    expect(freshCookie).toBeDefined()
    const freshForm = `csrf_token=${freshCsrf}&email=user%40example.test&password=secret`
    const freshHeaders = { origin: validHeaders.origin, cookie: freshCookie ?? "" }
    const accepted = await rawPost(nextPort, signInAction(freshPage), freshForm, freshHeaders)
    expect(accepted.status).toBe(303)
    expect(accepted.headers.location).toBe(`http://localhost:${nextPort}/auth/select-tenant?sig=%2BAb`)
    expect(accepted.body).not.toContain("must-not-reach-browser")
    expect((accepted.headers["set-cookie"] as string[] | undefined)?.length).toBe(4)
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email", "/iam/oauth2/continue"])
    expect(JSON.parse(receivedBodies[1] ?? "{}")).toEqual({ postLogin: true, oauth_query: "sig=%2BAb" })
    const replay = await rawPost(nextPort, signInAction(freshPage), freshForm, freshHeaders)
    expect(replay.status).toBe(403)
    expect(receivedPaths).toEqual([])
  })

  it.each(["text/html", "application/json"])("rejects expired signed POST with valid CSRF before credentials (%s)", async (accept) => {
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)![1]!
    const flowId = new URL(signInAction(page), "http://test").searchParams.get("flow")!
    const client = createClient({ url: redisUrl })
    try {
      await client.connect()
      await client.pExpire(`${iamSignInFlowKeyPrefix(`http://localhost:${nextPort}`)}${flowId}`, 1)
    } finally { client.destroy() }
    await new Promise(resolve => setTimeout(resolve, 10))
    const response = await rawPost(nextPort, signInAction(page),
      new URLSearchParams({ csrf_token: token, email: "user@example.test", password: "secret" }).toString(), {
        origin: `http://localhost:${nextPort}`, cookie: signInCookies(page), accept,
        "sec-fetch-mode": "navigate", "sec-fetch-dest": "document",
      })
    expect(receivedPaths).toEqual([])
    expect(response.status).toBe(accept === "text/html" ? 303 : 403)
    expect(response.headers.location).toBe(accept === "text/html" ? "/auth/sign-in/failed" : undefined)
    expect(response.headers["cache-control"]).toContain("no-store")
  })

  it("ends an old native DOM with missing proof without retrying login or exposing a JSON error", async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/auth/sign-in?sig=%2BAb`)
      const proofCookies = (await context.cookies()).filter(cookie => cookie.name.startsWith("kokoro_iam_csrf_signin_"))
      expect(proofCookies).toHaveLength(1)
      await context.clearCookies({ name: proofCookies[0]!.name })
      const requests: string[] = []
      page.on("request", request => requests.push(new URL(request.url()).pathname))
      await page.getByLabel("邮箱").fill("user@example.test")
      await page.getByLabel("密码").fill("secret")
      await page.getByRole("button", { name: "登录" }).click()
      await page.waitForURL(`http://localhost:${nextPort}/auth/sign-in/failed`)
      await page.getByRole("link", { name: "重新登录", exact: true }).waitFor({ state: "visible" })
      await page.reload()
      expect(requests).not.toContain("/login")
      expect(requests).not.toContain("/api/auth/signin/kokoro-iam")
      expect(receivedPaths).toEqual([])
    } finally { await browser.close() }
  }, 30_000)

  it("rejects an unproved browser form without clearing any transaction cookie", async () => {
    const page = await signInPage()
    const cookie = signInCookies(page)
    const result = await rawPost(nextPort, signInAction(page),
      `csrf_token=${"x".repeat(43)}&email=user%40example.test&password=secret`, {
        origin: `http://localhost:${nextPort}`, cookie, accept: "text/html",
        "sec-fetch-mode": "navigate", "sec-fetch-dest": "document",
      })
    expect(result.status).toBe(303)
    expect(result.headers.location).toBe("/auth/sign-in/failed")
    expect(result.headers["set-cookie"]).toBeUndefined()
    expect(receivedPaths).toEqual([])
  })

  it.each([401, 429, 503])("sanitizes sign-in %i before any continuation", async (status) => {
    signInStatus = status
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = signInCookies(page)
    const result = await rawPost(nextPort, signInAction(page), `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: cookie ?? "",
    })
    expect(result.status).toBe(status === 503 ? 503 : status)
    expect(result.body).not.toContain("sensitive-marker-must-not-reach-browser")
    expect(result.body).not.toContain("must-not-reach-browser")
    expect(result.headers["set-cookie"]).toEqual(expect.not.arrayContaining([expect.stringContaining("kokoro-issuer")]))
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email"])
  })

  it.each([401, 429, 503])("keeps browser %i feedback on the real shadcn form with fresh CSRF", async (status) => {
    signInStatus = status
    const page = await signInPage()
    const token = page.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]
    const cookie = signInCookies(page)
    const result = await rawPost(nextPort, signInAction(page), `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: cookie ?? "", accept: "text/html",
    })
    expect(result.status).toBe(303)
    expect(result.headers.location).toBe(signInAction(page))
    expect((result.headers["set-cookie"] as string[] | undefined)?.length).toBe(2)
    const feedbackCookie = (result.headers["set-cookie"] as string[])[0]?.split(";", 1)[0]
    const refreshed = await rawHttp(nextPort, signInAction(page), `localhost:${nextPort}`, undefined,
      { cookie: `${signInCookies(page)}; ${feedbackCookie ?? ""}` })
    expect(refreshed.status).toBe(200)
    expect(refreshed.body).toContain('role="alert"')
    expect(refreshed.body).toContain(status === 401 ? "邮箱或密码不正确" : status === 429 ? "登录尝试次数过多" : "登录未完成")
    expect(refreshed.body).toContain('value="user@example.test"')
    expect(refreshed.body).not.toContain("password=secret")
    expect(refreshed.body).not.toContain("sensitive-marker-must-not-reach-browser")
    expect(refreshed.body.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/u)?.[1]).not.toBe(token)
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email"])
  })

  it("keeps a real Chromium sign-in failure inline and accessible", async () => {
    signInStatus = 401
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/auth/sign-in?sig=%2BAb`)
      await page.getByLabel("邮箱").fill("user@example.test")
      await page.getByLabel("密码").fill("wrong-password")
      await page.getByRole("button", { name: "登录" }).click()
      await expect.poll(async () => page.getByRole("alert").textContent()).toBe("邮箱或密码不正确。")
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toMatch(/^\/auth\/sign-in\?flow=[A-Za-z0-9_-]{24}$/u)
      expect(await page.getByLabel("邮箱").inputValue()).toBe("user@example.test")
      expect(await page.getByLabel("密码").inputValue()).toBe("")
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([])
      const screenshotDir = process.env.KOKORO_IAM_UI_SCREENSHOT_DIR
      if (screenshotDir) {
        await mkdir(screenshotDir, { recursive: true })
        await page.screenshot({ path: path.join(screenshotDir, "sign-in-error-mobile.png"), fullPage: true })
      }
    } finally {
      await browser.close()
    }
  }, 30_000)

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
    expect(cookies).toHaveLength(5)
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
    const signedIn = await rawPost(nextPort, signInAction(signIn), `csrf_token=${signInToken}&email=user%40example.test&password=secret`, {
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
    const signedIn = await rawPost(nextPort, signInAction(signIn), `csrf_token=${signInToken}&email=user%40example.test&password=secret`, {
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

  it.each([
    ["text/html", "navigate", "document", 303],
    ["text/html;q=0", "navigate", "document", 503],
    ["application/json", "navigate", "document", 503],
    ["text/html", "cors", "empty", 503],
  ])("keeps failed tenant continuation bounded and native-only (%s/%s)", async (accept, mode, dest, expected) => {
    setActiveStatus = 503
    setActiveCookies = ["kokoro-issuer.session_data=must-not-leak; Path=/iam; HttpOnly; SameSite=Lax"]
    const response = await rawHttp(nextPort, "/iam/interactions/select-tenant?sig=%2BAb", undefined, undefined, {
      cookie: "kokoro-issuer.session_token=opaque", accept: String(accept),
      "sec-fetch-mode": String(mode), "sec-fetch-dest": String(dest),
    })
    expect(response.status).toBe(expected)
    expect(response.headers.location).toBe(expected === 303 ? "/auth/sign-in/failed" : undefined)
    expect(response.headers["set-cookie"]).toBeUndefined()
    expect(response.body).not.toContain("must-not-leak")
    expect(receivedPaths.splice(0)).toEqual(["/iam/organization/set-active"])
    if (expected === 303) {
      expect(response.body).toBe("")
      expect(response.headers["referrer-policy"]).toBe("no-referrer")
      for (let i = 0; i < 2; i++) {
        const page = await rawHttp(nextPort, "/auth/sign-in/failed")
        expect(page.status).toBe(200)
        expect(page.body).toContain("恢复工作区")
      }
      expect(receivedPaths).toEqual([])
    } else expect(JSON.parse(response.body)).toMatchObject({ error: { code: "iam_interaction_unavailable" } })
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
    const cookie = signInCookies(page)
    const result = await rawPost(nextPort, signInAction(page), `csrf_token=${token}&email=user%40example.test&password=secret`, {
      origin: `http://localhost:${nextPort}`, cookie: cookie ?? "",
    })
    expect(result.status).toBe(502)
    expect(result.headers.location).toBeUndefined()
    expect(result.body).not.toContain("must-not-reach-browser")
    expect((result.headers["set-cookie"] as string[] | undefined)?.some((value) => value.includes("kokoro-issuer"))).not.toBe(true)
    expect(receivedPaths.splice(0)).toEqual(["/iam/sign-in/email", "/iam/oauth2/continue"])
  })

  async function expireIssuedConsentNonce(token: string): Promise<void> {
    const { createHash } = await import("node:crypto")
    const key = `${iamCsrfKeyPrefix(`http://localhost:${nextPort}`)}${createHash("sha256").update(token).digest("hex")}`
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          await client.connect()
          expect(await client.del(key)).toBe(1)
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("test Redis delete deadline")), 2_000)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      client.destroy()
    }
    expect(await ownCsrfKeys()).not.toContain(key)
  }

  it("R80 consent recovery restarts an expired HTML nonce at the fixed login path", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    const proof = await interactionProof(path)
    await expireIssuedConsentNonce(proof.token)

    const response = await rawPost(nextPort, path, `csrf_token=${proof.token}&decision=agree`, {
      accept: "text/html",
      cookie: proof.cookie,
      origin: `http://localhost:${nextPort}`,
      "x-request-id": "r80-consent-expired-html",
    })

    expect(response.status).toBe(303)
    expect(response.body).toBe("")
    expect(response.headers.location).toBe("/login")
    expect(response.headers["cache-control"]).toBe("no-store")
    expect(response.headers["referrer-policy"]).toBe("no-referrer")
    expect(response.headers["x-request-id"]).toBe("r80-consent-expired-html")
    expect(response.headers["set-cookie"]).toEqual([
      "kokoro_iam_csrf=; Path=/iam/interactions/consent; Max-Age=0; HttpOnly; SameSite=Lax",
    ])
    expect(receivedPaths).toEqual([])
  })

  it("R80 consent recovery preserves JSON rejection for an expired nonce", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    const proof = await interactionProof(path)
    await expireIssuedConsentNonce(proof.token)

    const response = await rawPost(nextPort, path, `csrf_token=${proof.token}&decision=agree`, {
      accept: "application/json",
      cookie: proof.cookie,
      origin: `http://localhost:${nextPort}`,
      "x-request-id": "r80-consent-expired-json",
    })

    expect(response.status).toBe(403)
    expect(JSON.parse(response.body)).toEqual({
      error: { code: "iam_interaction_csrf_rejected", message: "IAM interaction was rejected" },
    })
    expect(response.headers.location).toBeUndefined()
    expect(response.headers["set-cookie"]).toBeUndefined()
    expect(response.headers["cache-control"]).toBe("no-store")
    expect(response.headers["x-request-id"]).toBe("r80-consent-expired-json")
    expect(receivedPaths).toEqual([])
  })

  it("R80 consent recovery rejects origin and malformed query before HTML recovery", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    const proof = await interactionProof(path)
    await expireIssuedConsentNonce(proof.token)
    const common = {
      accept: "text/html",
      cookie: proof.cookie,
      "x-request-id": "r80-consent-validation-order",
    }
    const body = `csrf_token=${proof.token}&decision=agree`

    const maliciousOrigin = await rawPost(nextPort, path, body, {
      ...common,
      origin: "https://evil.example",
    })
    const missingOrigin = await rawPost(nextPort, path, body, common)
    const malformedQuery = await rawPost(nextPort, "/iam/interactions/consent?sig=%2BAb&sig=duplicate&scope=openid", body, {
      ...common,
      origin: `http://localhost:${nextPort}`,
    })

    expect(maliciousOrigin.status).toBe(403)
    expect(JSON.parse(maliciousOrigin.body)).toMatchObject({ error: { code: "iam_interaction_origin_rejected" } })
    expect(maliciousOrigin.headers.location).toBeUndefined()
    expect(missingOrigin.status).toBe(403)
    expect(JSON.parse(missingOrigin.body)).toMatchObject({ error: { code: "iam_interaction_origin_rejected" } })
    expect(missingOrigin.headers.location).toBeUndefined()
    expect(malformedQuery.status).toBe(404)
    expect(JSON.parse(malformedQuery.body)).toMatchObject({ error: { code: "iam_interaction_not_found" } })
    expect(malformedQuery.headers.location).toBeUndefined()
    expect(receivedPaths).toEqual([])
  })

  it("R80 consent recovery preserves owner 503 and rejects its replayed nonce as JSON", async () => {
    const path = "/iam/interactions/consent?sig=%2BAb&scope=openid"
    consentStatus = 503
    const proof = await interactionProof(path)
    const body = `csrf_token=${proof.token}&decision=agree`
    const common = {
      cookie: proof.cookie,
      origin: `http://localhost:${nextPort}`,
    }

    const ownerFailure = await rawPost(nextPort, path, body, { ...common, accept: "text/html" })
    expect(ownerFailure.status).toBe(503)
    expect(JSON.parse(ownerFailure.body)).toMatchObject({ error: { code: "iam_interaction_unavailable" } })
    expect(ownerFailure.headers.location).toBeUndefined()
    expect(receivedPaths).toEqual(["/iam/oauth2/consent"])

    const replay = await rawPost(nextPort, path, body, { ...common, accept: "application/json" })
    expect(replay.status).toBe(403)
    expect(JSON.parse(replay.body)).toMatchObject({ error: { code: "iam_interaction_csrf_rejected" } })
    expect(replay.headers.location).toBeUndefined()
    expect(receivedPaths).toEqual(["/iam/oauth2/consent"])
  })
})


describe("Next fixture shutdown confirmation", () => {
  afterEach(() => vi.useRealTimers())

  it.each([false, true])("rejects an active child after bounded signals (TERM accepted: %s)", async (accepted) => {
    vi.useFakeTimers()
    const child = Object.assign(new EventEmitter(), {
      exitCode: null, signalCode: null, kill: vi.fn(() => accepted),
    })
    const stopped = stop(child as unknown as ChildProcess)
    const outcome = stopped.then(() => null, (error: unknown) => error)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(await outcome).toEqual(new Error("Next fixture process did not exit"))
    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
    expect(child.kill).toHaveBeenCalledWith("SIGKILL")
    expect(child.listenerCount("exit")).toBe(0)
  })

  it("accepts only an observed terminal child and cancels escalation", async () => {
    vi.useFakeTimers()
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null, signalCode: null, kill: vi.fn(() => true),
    })
    const stopped = stop(child as unknown as ChildProcess)
    child.exitCode = 0
    child.emit("exit", 0, null)
    await stopped
    await vi.advanceTimersByTimeAsync(6_000)
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.listenerCount("exit")).toBe(0)
  })
})
