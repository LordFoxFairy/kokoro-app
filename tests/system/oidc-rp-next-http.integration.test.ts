import { spawn, type ChildProcess } from "node:child_process"
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto"
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createServer, request as httpRequest, type Server } from "node:http"
import { connect as netConnect } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Duplex } from "node:stream"

import { createClient } from "redis"
import { decode } from "next-auth/jwt"
import { chromium, type Browser, type Locator, type Page, type Response as BrowserResponse } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

type HttpResult = Readonly<{ status: number; headers: Readonly<Record<string, string | string[] | undefined>>; body: string }>

function oidcStateKeyPrefix(webOrigin: string): string {
  return `kokoro:web:oidc-state:${createHash("sha256").update(webOrigin).digest("hex")}:`
}

function productSessionKeyPrefix(webOrigin: string): string {
  return `kokoro:web:product-session:${createHash("sha256").update(webOrigin).digest("hex")}:`
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
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//")) {
    return Promise.reject(new Error("fixture HTTP target must be root-relative"))
  }
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

type SessionProbeFault = "pass" | "pending" | "unavailable"

async function sessionProbeProxy(nextPort: number): Promise<{
  port: number
  server: Server
  close: () => Promise<void>
  setFault: (fault: SessionProbeFault) => void
  releasePending: () => void
  setListBodyPending: (pending: boolean) => void
  releaseListBodies: () => void
  sessionRequests: () => number
  listRequests: () => number
  heldListBodies: () => number
  loginRequests: () => number
  upgradeDiagnostics: () => readonly { path: string; requests: number }[]
  connectDiagnostics: () => Readonly<{ requests: number; established: boolean }>
  resourceDiagnostics: () => readonly { path: string; requests: number; upstream_statuses: readonly number[] }[]
}> {
  let fault: SessionProbeFault = "pass"
  let probes = 0
  let lists = 0
  let logins = 0
  let holdListBody = false
  const pending = new Set<{ request: import("node:http").IncomingMessage; response: import("node:http").ServerResponse }>()
  const pendingListBodies = new Set<{ response: import("node:http").ServerResponse; tail: Buffer }>()
  const resources = new Map<string, { requests: number; upstreamStatuses: number[] }>()
  const upgrades = new Map<string, number>()
  const upstreamRequests = new Set<ReturnType<typeof httpRequest>>()
  const tunnelSockets = new Set<Duplex>()
  let connectRequests = 0
  let connectEstablished = false

  const forward = (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse): void => {
    if (response.destroyed) return
    const target = new URL(request.url ?? "/", `http://localhost:${nextPort}`)
    const resource = resources.get(target.pathname) ?? { requests: 0, upstreamStatuses: [] }
    resource.requests += 1
    resources.set(target.pathname, resource)
    const upstream = httpRequest({ hostname: "127.0.0.1", port: nextPort, method: request.method,
      path: `${target.pathname}${target.search}`, headers: { ...request.headers, host: `localhost:${nextPort}` } }, (reply) => {
      if (resource.upstreamStatuses.length < 8) resource.upstreamStatuses.push(reply.statusCode ?? 0)
      response.writeHead(reply.statusCode ?? 502, reply.headers)
      if (holdListBody && request.method === "GET" && target.pathname === "/api/session/sessions" && reply.statusCode === 200) {
        const chunks: Buffer[] = []
        reply.on("data", (chunk: Buffer) => chunks.push(chunk))
        reply.once("end", () => {
          const body = Buffer.concat(chunks)
          const split = Math.max(0, body.length - 1)
          if (split > 0) response.write(body.subarray(0, split))
          const held = { response, tail: body.subarray(split) }
          pendingListBodies.add(held)
          response.once("close", () => pendingListBodies.delete(held))
        })
      } else reply.pipe(response)
    })
    upstreamRequests.add(upstream)
    upstream.once("close", () => upstreamRequests.delete(upstream))
    response.once("close", () => upstream.destroy())
    request.once("aborted", () => upstream.destroy())
    upstream.once("error", () => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: { code: "fixture_upstream_unavailable" } }))
    })
    if (request.method === "GET" || request.method === "HEAD") upstream.end()
    else request.pipe(upstream)
  }

  const server = createServer((request, response) => {
    const target = new URL(request.url ?? "/", `http://localhost:${nextPort}`)
    if (target.pathname === "/login") logins += 1
    if (request.method === "GET" && target.pathname === "/api/session/sessions") lists += 1
    if (request.method === "GET" && target.pathname === "/api/auth/session") {
      probes += 1
      if (fault === "pending") {
        const held = { request, response }
        pending.add(held)
        response.once("close", () => pending.delete(held))
        return
      }
      if (fault === "unavailable") {
        response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" })
        response.end(JSON.stringify({ error: { code: "product_session_unavailable", message: "fixture unavailable" } }))
        return
      }
    }
    forward(request, response)
  })
  server.on("upgrade", (request, socket) => {
    const target = new URL(request.url ?? "/", `http://localhost:${nextPort}`)
    upgrades.set(target.pathname, (upgrades.get(target.pathname) ?? 0) + 1)
    socket.destroy()
  })
  server.on("connect", (request, clientSocket, head) => {
    connectRequests += 1
    tunnelSockets.add(clientSocket)
    clientSocket.once("close", () => tunnelSockets.delete(clientSocket))
    if (request.url !== `localhost:${nextPort}`) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
      return
    }
    const upstreamSocket = netConnect({ host: "127.0.0.1", port: nextPort })
    tunnelSockets.add(upstreamSocket)
    upstreamSocket.once("close", () => tunnelSockets.delete(upstreamSocket))
    clientSocket.once("error", () => upstreamSocket.destroy())
    upstreamSocket.once("error", () => clientSocket.destroy())
    upstreamSocket.once("connect", () => {
      connectEstablished = true
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      if (head.length > 0) upstreamSocket.write(head)
      clientSocket.pipe(upstreamSocket)
      upstreamSocket.pipe(clientSocket)
    })
  })
  const port = await listen(server)
  return {
    port,
    server,
    close: async () => {
      for (const held of pending) {
        held.request.destroy()
        held.response.destroy()
      }
      pending.clear()
      for (const held of pendingListBodies) held.response.destroy()
      pendingListBodies.clear()
      for (const request of upstreamRequests) request.destroy()
      for (const socket of tunnelSockets) socket.destroy()
      upstreamRequests.clear()
      tunnelSockets.clear()
      await close(server)
    },
    setFault: (next) => { fault = next },
    releasePending: () => {
      for (const held of pending) {
        pending.delete(held)
        forward(held.request, held.response)
      }
    },
    setListBodyPending: (next) => { holdListBody = next },
    releaseListBodies: () => {
      holdListBody = false
      for (const held of pendingListBodies) {
        pendingListBodies.delete(held)
        if (!held.response.destroyed) held.response.end(held.tail)
      }
    },
    sessionRequests: () => probes,
    listRequests: () => lists,
    heldListBodies: () => pendingListBodies.size,
    loginRequests: () => logins,
    upgradeDiagnostics: () => [...upgrades.entries()].slice(0, 20).map(([path, requests]) => ({ path, requests })),
    connectDiagnostics: () => ({ requests: connectRequests, established: connectEstablished }),
    resourceDiagnostics: () => [...resources.entries()].slice(0, 100).map(([path, value]) => ({
      path,
      requests: value.requests,
      upstream_statuses: value.upstreamStatuses,
    })),
  }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve, reject) => {
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const termTimer = setTimeout(() => {
      child.kill("SIGKILL")
      killTimer = setTimeout(() => {
        child.removeListener("exit", onExit)
        reject(new Error("RP Next fixture did not exit after SIGKILL"))
      }, 5_000)
    }, 5_000)
    const onExit = (): void => {
      clearTimeout(termTimer)
      if (killTimer !== undefined) clearTimeout(killTimer)
      resolve()
    }
    child.once("exit", onExit)
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

const KNOWN_DIAGNOSTIC_ERROR_CODES = new Set([
  "iam_relay_body_rejected",
  "iam_relay_cookie_invalid",
  "iam_relay_credential_rejected",
  "iam_relay_header_invalid",
  "iam_relay_origin_rejected",
  "iam_relay_request_too_large",
  "iam_relay_response_invalid",
  "iam_relay_route_not_found",
  "iam_relay_unavailable",
  "product_session_unavailable",
  "rp_body_rejected",
  "rp_callback_rejected",
  "rp_credential_rejected",
  "rp_origin_rejected",
  "rp_request_too_large",
  "rp_response_invalid",
  "rp_transaction_rejected",
  "rp_unavailable",
])

function knownErrorCode(body: string): string | null {
  try {
    const value: unknown = JSON.parse(body)
    if (typeof value !== "object" || value === null || !("error" in value)) return null
    const error = (value as { error?: unknown }).error
    if (typeof error !== "object" || error === null || !("code" in error)) return null
    const code = (error as { code?: unknown }).code
    return typeof code === "string" && KNOWN_DIAGNOSTIC_ERROR_CODES.has(code) ? code : null
  } catch {
    return null
  }
}

function headerValue(headers: HttpResult["headers"], name: string): string | null {
  const value = headers[name]
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? null : null
}

function safeLocationPath(headers: HttpResult["headers"]): string | null {
  const value = headerValue(headers, "location")
  if (value === null) return null
  try { return new URL(value, "http://fixture.invalid").pathname }
  catch { return "<invalid>" }
}

function bffPathnames(values: readonly string[]): string[] {
  return values.map((value) => {
    try { return new URL(value, "http://fixture.invalid").pathname }
    catch { return "<invalid>" }
  })
}

function nextErrorCategories(value: string): string[] {
  const checks: readonly [string, RegExp][] = [
    ["web_rp_error", /Web RP error:/u],
    ["rp_signin_response_rejected", /Kokoro RP sign-in response rejected:/u],
    ["rp_signin_start_threw", /Kokoro RP sign-in start threw/u],
    ["next_compile_error", /Failed to compile|Module not found|Syntax Error/u],
    ["next_runtime_error", /(?:^|\n)\s*(?:⨯|Error:)/u],
    ["next_http_5xx", /\b(?:GET|POST) \/[^\s?]*(?:\?[^\s]*)? 5[0-9]{2}\b/u],
  ]
  return checks.filter(([, pattern]) => pattern.test(value)).map(([category]) => category)
}

function safeNextErrorExcerpt(value: string, redactions: readonly string[] = []): string | null {
  const sensitive = /authorization|cookie|password|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token/iu
  const relevant = /TypeError|ReferenceError|Module not found|Cannot (?:find|resolve|read|access)|Failed to compile|Build Error|Import trace|Error:|(?:^|\s)at\s+.*(?:src\/|tests\/|node_modules\/)|^\s*[./].*(?:src\/|node_modules\/)/u
  let sanitized = value
  for (const secret of redactions) {
    if (secret !== "") sanitized = sanitized.split(secret).join("<redacted>")
  }
  const lines = sanitized
    .replace(/\u001b\[[0-9;]*m/gu, "")
    .split(/\r?\n/u)
  const selected = new Set<number>()
  for (const [index, line] of lines.entries()) {
    if (line.includes("⨯")) {
      for (let offset = 0; offset <= 3 && index + offset < lines.length; offset += 1) selected.add(index + offset)
    }
    if (relevant.test(line)) selected.add(index)
  }
  const excerpt = [...selected]
    .sort((left, right) => left - right)
    .map((index) => lines[index] ?? "")
    .filter((line) => !sensitive.test(line))
    .slice(0, 8)
    .map((line) => line.replace(/https?:\/\/[^\s)]+/gu, (raw) => {
      try { const url = new URL(raw); return `${url.origin}${url.pathname}${url.search ? "?<redacted>" : ""}` }
      catch { return "<invalid-url>" }
    }).replace(/[\t ]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 500)
  return excerpt === "" ? null : excerpt
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
  const productIds = new Set<string>()
  const authSecret = randomBytes(32).toString("hex")
  const paths: string[] = []
  let root: string | undefined
  let bff: Server | undefined
  let next: ChildProcess | undefined
  let nextPort = 0
  let nonce = ""
  let invalidIdToken: "none" | "nonce" | "issuer" | "audience" | "signature" | "algorithm" | "expired" = "none"
  let invalidUserinfoSubject = false
  let oversizedRefreshCredential = false
  let oversizedAccessCredential = false
  let oversizedSubject = false
  let refreshResponseOverride: object | undefined
  let oversizedResponse: "none" | "token" | "userinfo" | "jwks" = "none"
  let slowResponse: "none" | "token" | "userinfo" = "none"
  let onTokenStarted: (() => void) | undefined
  let onTokenClosed: (() => void) | undefined
  let onRefreshStarted: (() => void) | undefined
  let releaseRefresh: (() => void) | undefined
  let holdRefresh = false
  let issuerSessionActive = false
  let identityUserId = "user-one"
  let identityTenantId = "tenant-one"
  let identityStatus = 200
  let sessionListStatus = 200
  let invalidIdentityShape = false
  let slowIdentity = false
  let output = ""
  let ownedBrowserPrefixes: readonly string[] = []
  let ownsBrowserPrefixes = false
  type BrowserDiagnostics = {
    categories: Set<string>
    requestFailures: { path: string; code: string }[]
    scriptResponses: { path: string; status: number }[]
  }
  const browserDiagnostics = new WeakMap<Page, BrowserDiagnostics>()

  function requestFailureCode(value: string | null): string {
    if (value === null) return "unknown"
    if (/ABORTED/iu.test(value)) return "aborted"
    if (/NAME_NOT_RESOLVED/iu.test(value)) return "name_not_resolved"
    if (/CONNECTION_REFUSED/iu.test(value)) return "connection_refused"
    if (/TIMED_OUT|TIMEOUT/iu.test(value)) return "timed_out"
    if (/FAILED/iu.test(value)) return "failed"
    return "other"
  }

  function observeBrowserDiagnostics(page: Page): void {
    const diagnostics: BrowserDiagnostics = {
      categories: new Set<string>(), requestFailures: [], scriptResponses: [],
    }
    browserDiagnostics.set(page, diagnostics)
    const classify = (value: string): boolean => {
      if (/Content Security Policy|CSP/iu.test(value) && /unsafe-eval|eval/iu.test(value)) {
        diagnostics.categories.add("csp_eval_blocked")
        return true
      }
      return false
    }
    page.on("console", (message) => {
      const value = message.text()
      const categorized = classify(value)
      if (!categorized && message.type() === "error") {
        if (/webpack-hmr/iu.test(value) && /WebSocket/iu.test(value)) diagnostics.categories.add("hmr_websocket_failed")
        else diagnostics.categories.add("console_error_other")
      }
    })
    page.on("pageerror", (error) => {
      const value = `${error.name}: ${error.message}`
      const categorized = classify(value)
      if (!categorized) {
        if (error.name === "TypeError") diagnostics.categories.add("page_type_error")
        else if (error.name === "EvalError") diagnostics.categories.add("page_eval_error")
        else diagnostics.categories.add("page_error_other")
      }
    })
    page.on("requestfailed", (request) => {
      if (diagnostics.requestFailures.length >= 100) return
      const url = new URL(request.url())
      diagnostics.requestFailures.push({ path: url.pathname, code: requestFailureCode(request.failure()?.errorText ?? null) })
    })
    page.on("response", (response) => {
      if (response.request().resourceType() !== "script" || diagnostics.scriptResponses.length >= 100) return
      const url = new URL(response.url())
      diagnostics.scriptResponses.push({ path: url.pathname, status: response.status() })
    })
  }

  async function browserPrefixKeys(): Promise<string[]> {
    if (ownedBrowserPrefixes.length === 0) return []
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          await client.connect()
          const keys: string[] = []
          for (const prefix of ownedBrowserPrefixes) {
            for await (const batch of client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
              keys.push(...batch)
              if (keys.length > 1_000) throw new Error("RP owned Redis prefix exceeded cleanup bound")
            }
          }
          return keys
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("RP owned Redis prefix scan deadline")), 2_000)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      client.destroy()
    }
  }

  function responseDiagnostic(
    stage: string,
    response: HttpResult,
    outputStart: number,
    pathStart: number,
  ): string {
    const requestId = headerValue(response.headers, "x-request-id")
    const safeRequestId = requestId !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(requestId) ? requestId : null
    const contentType = headerValue(response.headers, "content-type")
    return `${stage} diagnostic: ${JSON.stringify({
      stage,
      status: response.status,
      content_type: contentType !== null && /^[\x20-\x7e]{1,128}$/u.test(contentType) ? contentType : null,
      request_id: safeRequestId,
      error_code: knownErrorCode(response.body),
      body_bytes: Buffer.byteLength(response.body),
      location_path: safeLocationPath(response.headers),
      bff_paths: bffPathnames(paths.slice(pathStart)),
      next_error_categories: nextErrorCategories(output.slice(outputStart)),
      next_error_excerpt: safeNextErrorExcerpt(output.slice(outputStart), [clientSecret, "rp-bff-secret", authSecret]),
    })}`
  }

  async function browserProbeDiagnostic(
    stage: string,
    page: Page,
    response: BrowserResponse | null,
    proxy: Awaited<ReturnType<typeof sessionProbeProxy>>,
    outputStart: number,
  ): Promise<string> {
    const body = await page.locator("body").textContent().catch(() => null)
    const screenshotDirectory = process.env.KOKORO_TEST_SCREENSHOT_DIR?.trim()
    let screenshot: string | null = null
    const nextOutput = output.slice(outputStart)
    const nextErrorExcerpt = safeNextErrorExcerpt(nextOutput, [clientSecret, "rp-bff-secret", authSecret])
    const diagnostics = browserDiagnostics.get(page)
    const scriptNonces = await page.locator("script").evaluateAll((scripts) => scripts.map((script) => script.nonce))
      .catch(() => [] as string[])
    const csp = await response?.headerValue("content-security-policy") ?? null
    const cspNonce = csp?.match(/(?:^|;\s*)script-src[^;]*'nonce-([^']+)'/u)?.[1] ?? null
    let nextErrorArtifact: string | null = null
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true })
      screenshot = path.join(screenshotDirectory, `r139-${stage}.png`)
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined)
      if (nextErrorExcerpt !== null) {
        nextErrorArtifact = path.join(screenshotDirectory, `r139-${stage}-next-error.txt`)
        await writeFile(nextErrorArtifact, nextErrorExcerpt, { encoding: "utf8", mode: 0o600 })
      }
    }
    return `${stage} browser diagnostic: ${JSON.stringify({
      stage,
      response_status: response?.status() ?? null,
      pathname: (() => { try { return new URL(page.url()).pathname } catch { return "<invalid>" } })(),
      body_bytes: body === null ? null : Buffer.byteLength(body),
      has_runtime_loading: body?.includes("Loading") ?? false,
      has_retry: /Retry|重试/u.test(body ?? ""),
      has_next_overlay: /Unhandled Runtime Error|Failed to compile|Build Error/u.test(body ?? ""),
      has_runtime_loading_testid: await page.getByTestId("runtime-loading").count() > 0,
      session_requests: proxy.sessionRequests(),
      login_requests: proxy.loginRequests(),
      next_error_categories: nextErrorCategories(nextOutput),
      browser_error_categories: [...diagnostics?.categories ?? []],
      request_failures: diagnostics?.requestFailures ?? [],
      script_responses: diagnostics?.scriptResponses ?? [],
      proxy_resources: proxy.resourceDiagnostics(),
      proxy_upgrades: proxy.upgradeDiagnostics(),
      proxy_connect: proxy.connectDiagnostics(),
      script_count: scriptNonces.length,
      scripts_match_csp_nonce: cspNonce !== null && scriptNonces.length > 0 && scriptNonces.every((nonce) => nonce === cspNonce),
      document_ready_state: await page.evaluate(() => document.readyState),
      has_next_runtime: await page.evaluate(() => "next" in window),
      has_webpack_chunk_runtime: await page.evaluate(() => "webpackChunk_N_E" in window),
      flight_entry_count: await page.evaluate(() => {
        const value = (window as unknown as { __next_f?: unknown }).__next_f
        return Array.isArray(value) ? value.length : 0
      }),
      child_node_env: "development",
      next_error_excerpt: nextErrorExcerpt,
      next_error_artifact: nextErrorArtifact,
      screenshot,
    })}`
  }

  async function requireSessionProbe(
    stage: string,
    expected: number,
    page: Page,
    response: BrowserResponse | null,
    proxy: Awaited<ReturnType<typeof sessionProbeProxy>>,
    outputStart: number,
  ): Promise<void> {
    try {
      await expect.poll(() => proxy.sessionRequests(), { timeout: 10_000 }).toBe(expected)
    } catch {
      throw new Error(await browserProbeDiagnostic(stage, page, response, proxy, outputStart))
    }
  }

  async function listFailureDiagnostic(
    stage: string,
    page: Page,
    proxy: Awaited<ReturnType<typeof sessionProbeProxy>>,
  ): Promise<string> {
    const directList = page.locator('[data-conversation-list="direct"]')
    const listErrors = page.locator('[data-conversation-list="direct"] [role="alert"]')
    const retryButtons = page.locator('[data-conversation-list="direct"] button')
      .filter({ hasText: /Retry|重试/u })
    const listLoading = page.locator('[data-conversation-list="direct"] [role="status"]')
    const visibleCount = async (locator: Locator): Promise<number> => {
      const count = await locator.count()
      let visible = 0
      for (let index = 0; index < count; index += 1) {
        if (await locator.nth(index).isVisible().catch(() => false)) visible += 1
      }
      return visible
    }
    const record = {
      stage,
      pathname: (() => { try { return new URL(page.url()).pathname } catch { return "<invalid>" } })(),
      main_visible: await page.locator('[data-app-frame-main="true"]').isVisible().catch(() => false),
      desktop_rail_count: await page.locator('[data-desktop-rail="true"]').count(),
      desktop_rail_collapsed: await page.locator('[data-desktop-rail="true"]').getAttribute("data-collapsed"),
      direct_list_count: await directList.count(),
      direct_list_visible: await visibleCount(directList),
      direct_list_display: await directList.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).display)),
      list_error_count: await listErrors.count(),
      list_error_visible: await visibleCount(listErrors),
      retry_count: await retryButtons.count(),
      retry_visible: await visibleCount(retryButtons),
      list_loading_count: await listLoading.count(),
      list_loading_visible: await visibleCount(listLoading),
      list_requests: proxy.listRequests(),
      held_list_bodies: proxy.heldListBodies(),
      login_requests: proxy.loginRequests(),
      list_upstream_statuses: proxy.resourceDiagnostics()
        .find((entry) => entry.path === "/api/session/sessions")?.upstream_statuses ?? [],
    }
    const serialized = JSON.stringify(record)
    const screenshotDirectory = process.env.KOKORO_TEST_SCREENSHOT_DIR?.trim()
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true })
      await page.screenshot({ path: path.join(screenshotDirectory, `r141-${stage}.png`), fullPage: true }).catch(() => undefined)
      await writeFile(path.join(screenshotDirectory, `r141-${stage}.json`), serialized, { encoding: "utf8", mode: 0o600 })
    }
    return `${stage} list diagnostic: ${serialized}`
  }

  async function expandDesktopRail(page: Page): Promise<void> {
    const rail = page.locator('[data-desktop-rail="true"]')
    await rail.waitFor({ state: "visible", timeout: 15_000 })
    if (await rail.getAttribute("data-collapsed") === "false") return
    await page.getByRole("button", { name: /Expand sidebar|展开侧栏/u }).first().click()
    await expect.poll(() => rail.getAttribute("data-collapsed"), { timeout: 10_000 }).toBe("false")
  }

  async function directAnonymousControlDiagnostic(): Promise<string> {
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    let sessionRequests = 0
    let loginRequests = 0
    try {
      browser = await chromium.launch({ headless: true })
      context = await browser.newContext()
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      page.on("request", (request) => {
        const pathname = new URL(request.url()).pathname
        if (pathname === "/api/auth/session") sessionRequests += 1
        if (pathname === "/login") loginRequests += 1
      })
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      try { await expect.poll(() => sessionRequests, { timeout: 10_000 }).toBeGreaterThan(0) }
      catch { /* diagnostic control reports the observed zero without changing the product assertion */ }
      const diagnostics = browserDiagnostics.get(page)
      const record = {
        response_status: response?.status() ?? null,
        pathname: (() => { try { return new URL(page.url()).pathname } catch { return "<invalid>" } })(),
        session_requests: sessionRequests,
        login_requests: loginRequests,
        has_runtime_loading_testid: await page.getByTestId("runtime-loading").count() > 0,
        browser_error_categories: [...diagnostics?.categories ?? []],
        script_responses: diagnostics?.scriptResponses ?? [],
        document_ready_state: await page.evaluate(() => document.readyState),
        has_next_runtime: await page.evaluate(() => "next" in window),
        has_webpack_chunk_runtime: await page.evaluate(() => "webpackChunk_N_E" in window),
        flight_entry_count: await page.evaluate(() => {
          const value = (window as unknown as { __next_f?: unknown }).__next_f
          return Array.isArray(value) ? value.length : 0
        }),
      }
      const serialized = JSON.stringify(record)
      const screenshotDirectory = process.env.KOKORO_TEST_SCREENSHOT_DIR?.trim()
      if (screenshotDirectory) {
        await mkdir(screenshotDirectory, { recursive: true })
        await writeFile(path.join(screenshotDirectory, "direct-control.json"), serialized, { encoding: "utf8", mode: 0o600 })
      }
      console.error(`R139_DIRECT_CONTROL ${serialized}`)
      return `direct anonymous control: ${serialized}`
    } finally {
      try { await context?.close() }
      finally { await browser?.close() }
    }
  }

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
    const errors: unknown[] = []
    let nextTerminal = next === undefined
    if (next !== undefined) {
      const child = next
      try { await stop(child); nextTerminal = true; next = undefined }
      catch (error) { errors.push(error) }
    }
    if (bff !== undefined) {
      const server = bff
      try { await close(server); bff = undefined }
      catch (error) { errors.push(error) }
    }
    if (nextTerminal && root !== undefined) {
      const directory = root
      try { await rm(directory, { recursive: true, force: true }); root = undefined }
      catch (error) { errors.push(error) }
    }
    if (nextTerminal && (issuedStates.size > 0 || productIds.size > 0) && nextPort !== 0) {
      const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
      client.on("error", () => undefined)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          (async () => { await client.connect(); await client.del([
            ...[...issuedStates].map((state) =>
              `${oidcStateKeyPrefix(`http://localhost:${nextPort}`)}${createHash("sha256").update(state).digest("hex")}`),
            ...[...productIds].flatMap((id) => [`${productSessionKeyPrefix(`http://localhost:${nextPort}`)}${id}`,
              `${productSessionKeyPrefix(`http://localhost:${nextPort}`)}${id}:tombstone`]),
          ]) })(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("RP Redis cleanup deadline")), 2_000) }),
        ])
      } catch (error) { errors.push(error) }
      finally { if (timer !== undefined) clearTimeout(timer); client.destroy() }
    }
    if (nextTerminal && ownsBrowserPrefixes) {
      try {
        const owned = await browserPrefixKeys()
        if (owned.length > 0) {
          const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
          client.on("error", () => undefined)
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              (async () => { await client.connect(); await client.del(owned) })(),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("RP owned Redis delete deadline")), 2_000)
              }),
            ])
          } finally {
            if (timer !== undefined) clearTimeout(timer)
            client.destroy()
          }
        }
        const remaining = await browserPrefixKeys()
        if (remaining.length > 0) throw new Error(`RP owned Redis cleanup left ${remaining.length} keys`)
        ownsBrowserPrefixes = false
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "RP fixture cleanup failed")
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
            if (body.get("grant_type") === "refresh_token") {
              expect(body.get("refresh_token")).toBe("refresh-opaque")
              expect(body.get("code_verifier")).toBeNull()
              const send = (): void => sendJson(response, "token", refreshResponseOverride ??
                { access_token: "access-rotated", refresh_token: "refresh-rotated", token_type: "Bearer", expires_in: 600 })
              if (holdRefresh) { releaseRefresh = send; onRefreshStarted?.() }
              else send()
              return
            }
            expect(body.getAll("code_verifier")).toHaveLength(1)
            expect(body.get("redirect_uri")).toBe(`http://localhost:${nextPort}/api/auth/callback/kokoro-iam`)
            const now = Math.floor(Date.now() / 1000)
            const idToken = jwt(invalidIdToken === "algorithm" ? rsaKeys.privateKey : invalidIdToken === "signature" ? wrongKeys.privateKey : keys.privateKey,
              { iss: invalidIdToken === "issuer" ? "https://evil.example/iam" : `http://localhost:${nextPort}/iam`,
                aud: invalidIdToken === "audience" ? "wrong-client" : clientId, sub: oversizedSubject ? "s".repeat(257) : "user-one",
                nonce: invalidIdToken === "nonce" ? "wrong-nonce" : nonce,
                iat: invalidIdToken === "expired" ? now - 1_200 : now,
                exp: invalidIdToken === "expired" ? now - 600 : now + 600 },
              invalidIdToken === "algorithm" ? "RS256" : "EdDSA")
            if (onTokenClosed !== undefined) response.once("close", onTokenClosed)
            sendJson(response, "token", { access_token: oversizedAccessCredential ? "a".repeat(2049) : "access-opaque", refresh_token: oversizedRefreshCredential ? "r".repeat(9_000) : "refresh-opaque",
              id_token: idToken, token_type: "Bearer", expires_in: 600 })
            onTokenStarted?.()
          })
          return
        }
        if (request.url === "/iam/oauth2/revoke") {
          const chunks: Buffer[] = []
          request.on("data", (chunk: Buffer) => chunks.push(chunk))
          request.on("end", () => {
            const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"))
            expect(["refresh-opaque", "refresh-rotated"]).toContain(body.get("token"))
            expect(request.headers.authorization).toBe(`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`)
            response.writeHead(200); response.end()
          })
          return
        }
        if (request.url === "/iam/oauth2/userinfo") {
          expect(request.method).toBe("GET")
          expect(request.headers.authorization).toBe(`Bearer ${oversizedAccessCredential ? "a".repeat(2049) : "access-opaque"}`)
          expect(request.headers.cookie).toBeUndefined()
          expect(request.headers["x-kokoro-service"]).toBe("web-bff")
          sendJson(response, "userinfo", { sub: invalidUserinfoSubject ? "different-user" : oversizedSubject ? "s".repeat(257) : "user-one",
            name: "Fixture User", email: "fixture@example.test" })
          return
        }
        if (request.url === "/v1/me") {
          expect(request.method).toBe("GET")
          expect(request.headers.cookie).toBeUndefined()
          expect(request.headers["x-kokoro-service"]).toBe("web-bff")
          expect(request.headers["x-kokoro-internal-secret"]).toBe("rp-bff-secret")
          expect(request.headers.forwarded).toBe("host=localhost")
          expect(["Bearer access-opaque", "Bearer access-rotated"]).toContain(request.headers.authorization)
          response.writeHead(identityStatus, { "content-type": "application/json", "cache-control": "no-store" })
          const payload = JSON.stringify(identityStatus === 200
            ? invalidIdentityShape
              ? { data: { user_id: identityUserId, tenant_id: identityTenantId, access_token: "must-not-pass" }, meta: { request_id: "req_fixture" } }
              : { data: { user_id: identityUserId, tenant_id: identityTenantId }, meta: { request_id: "req_fixture" } }
            : { error: { code: "identity_rejected", message: "rejected", retryable: false } })
          if (slowIdentity) {
            const timer = setTimeout(() => response.end(payload), 6_000)
            response.once("close", () => clearTimeout(timer))
          } else response.end(payload)
          return
        }
        if (request.method === "GET" && request.url === "/v1/sessions?scope=direct") {
          expect(request.headers.cookie).toBeUndefined()
          expect(request.headers["x-kokoro-service"]).toBe("web-bff")
          expect(request.headers["x-kokoro-internal-secret"]).toBe("rp-bff-secret")
          expect(["Bearer access-opaque", "Bearer access-rotated"]).toContain(request.headers.authorization)
          response.writeHead(sessionListStatus, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify(sessionListStatus === 200 ? {
            data: { sessions: [
              { session_id: "session-list-a", title: "Bounded list alpha", updated_at: "2026-10-03T12:00:00.000Z" },
              { session_id: "session-list-b", title: "Bounded list beta", updated_at: "2026-10-03T11:00:00.000Z" },
            ], next_cursor: null },
            meta: { request_id: "req_r141_list" },
          } : { error: { code: "service_unavailable", message: "fixture unavailable", retryable: true } }))
          return
        }
        if (request.url?.startsWith("/iam/oauth2/authorize?")) {
          const url = new URL(request.url, `http://localhost:${nextPort}`)
          nonce = url.searchParams.get("nonce") ?? ""
          issuerSessionActive = true
          response.writeHead(302, { location: `/api/auth/callback/kokoro-iam?code=fixture-code&state=${url.searchParams.get("state")}&iss=${encodeURIComponent(`http://localhost:${nextPort}/iam`)}`,
            "set-cookie": "kokoro-issuer.session_token=issuer-fixture; Path=/iam; HttpOnly; SameSite=Lax" })
          response.end()
          return
        }
        if (request.url?.startsWith("/iam/oauth2/end-session?")) {
          const query = new URL(request.url, `http://localhost:${nextPort}`)
          expect(query.searchParams.get("client_id")).toBe(clientId)
          expect(query.searchParams.get("post_logout_redirect_uri")).toBe(`http://localhost:${nextPort}/auth/sign-in`)
          expect(request.headers.cookie).toBe("kokoro-issuer.session_token=issuer-fixture")
          response.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie":
            "kokoro-issuer.session_token.oauth_logout_confirmation=signed-fixture; Path=/iam/oauth2/end-session/confirm; HttpOnly; SameSite=Lax" })
          response.end(`<form method="post" action="http://localhost:${nextPort}/iam/oauth2/end-session/confirm"><button name="action" value="confirm">Confirm</button></form>`)
          return
        }
        if (request.url === "/iam/oauth2/end-session/confirm") {
          expect(request.method).toBe("POST")
          expect(request.headers.origin).toBe(`http://localhost:${nextPort}`)
          expect(request.headers.cookie).toBe("kokoro-issuer.session_token=issuer-fixture; kokoro-issuer.session_token.oauth_logout_confirmation=signed-fixture")
          const chunks: Buffer[] = []
          request.on("data", (chunk: Buffer) => chunks.push(chunk))
          request.on("end", () => {
            expect(Buffer.concat(chunks).toString("utf8")).toBe("action=confirm")
            issuerSessionActive = false
            response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": [
              "kokoro-issuer.session_token=; Path=/iam; Max-Age=0; HttpOnly; SameSite=Lax",
              "kokoro-issuer.session_token.oauth_logout_confirmation=; Path=/iam/oauth2/end-session/confirm; Max-Age=0; HttpOnly; SameSite=Lax",
            ] })
            response.end(JSON.stringify({ redirect: true, url: `http://localhost:${nextPort}/auth/sign-in` }))
          })
          return
        }
        if (request.url === "/iam/get-session") {
          const present = request.headers.cookie?.includes("kokoro-issuer.session_token=issuer-fixture") && issuerSessionActive
          sendJson(response, "userinfo", present ? { session: { userId: "user-one" } } : { session: null })
          return
        }
        response.writeHead(404)
        response.end()
      })
      const bffPort = await listen(bff)
      nextPort = await unusedPort()
      ownedBrowserPrefixes = [
        oidcStateKeyPrefix(`http://localhost:${nextPort}`),
        productSessionKeyPrefix(`http://localhost:${nextPort}`),
      ]
      const preexisting = await browserPrefixKeys()
      if (preexisting.length > 0) throw new Error(`RP random-origin Redis prefixes were not empty (${preexisting.length})`)
      ownsBrowserPrefixes = true
      const nextBin = path.resolve(process.cwd(), "node_modules/next/dist/bin/next")
      next = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
        cwd: root,
        env: { ...process.env, NODE_ENV: "development", KOKORO_WEB_ORIGIN: `http://localhost:${nextPort}`,
          KOKORO_DOMAIN: "localhost", KOKORO_TENANT_ID: "tenant-one",
          KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`, KOKORO_INTERNAL_SECRET_WEB_BFF: "rp-bff-secret",
          KOKORO_WEB_REDIS_URL: redisUrl, KOKORO_OIDC_CLIENT_ID: clientId, KOKORO_OIDC_CLIENT_SECRET: clientSecret,
          KOKORO_WEB_AUTH_SECRET: authSecret, NEXTAUTH_URL: `http://localhost:${nextPort}/api/auth` },
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
    } catch (error) {
      try { await cleanup() }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], "RP fixture setup and cleanup failed") }
      throw error
    }
  }, 60_000)

  afterAll(cleanup)

  async function start(): Promise<{ csrf: HttpResult; signin: HttpResult; jar: string; location: string; state: string }> {
    const csrf = await http(nextPort, "/api/auth/csrf")
    expect(csrf.status).toBe(200)
    const token = (JSON.parse(csrf.body) as { csrfToken: string }).csrfToken
    const signin = await http(nextPort, "/api/auth/signin/kokoro-iam", "POST", `csrfToken=${encodeURIComponent(token)}`,
      { origin: `http://localhost:${nextPort}`, cookie: cookieHeader(csrf) })
    expect(signin.status).toBe(302)
    const location = signin.headers.location as string
    const state = new URL(location).searchParams.get("state") ?? ""
    issuedStates.add(state)
    return { csrf, signin, jar: cookieHeader(csrf, signin), location, state }
  }

  async function recordProduct(response: HttpResult): Promise<void> {
    const cookie = (response.headers["set-cookie"] as string[] | undefined ?? [])
      .find((item) => item.startsWith("kokoro_product_session="))
    if (cookie === undefined) return
    const token = cookie.split(";")[0]?.slice("kokoro_product_session=".length)
    if (token === undefined) return
    const claims = await decode({ token, secret: authSecret, salt: "kokoro-product-session-v1" })
    if (typeof claims?.id === "string") productIds.add(claims.id)
  }

  async function productRecordKeys(): Promise<Set<string>> {
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    try {
      await client.connect()
      const keys = new Set<string>()
      for await (const batch of client.scanIterator({ MATCH: `${productSessionKeyPrefix(`http://localhost:${nextPort}`)}*` })) {
        for (const key of batch) keys.add(key)
      }
      return keys
    } finally { client.destroy() }
  }

  it("rejects undefined and non-root-relative fixture HTTP targets instead of requesting the app root", async () => {
    await expect(http(nextPort, undefined as unknown as string)).rejects.toThrow("fixture HTTP target must be root-relative")
    await expect(http(nextPort, "api/auth/csrf")).rejects.toThrow("fixture HTTP target must be root-relative")
  })

  it("keeps code exchange and userinfo server-only, then establishes an encrypted Product Session", async () => {
    const { signin, jar, location, state } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status).toBe(302)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    await recordProduct(callback)
    expect(callback.status).toBe(303)
    expect(callback.headers.location).toBe("/app")
    expect(callback.body).not.toContain("access-opaque")
    expect(callback.body).not.toContain("refresh-opaque")
    expect(callback.body).not.toContain("fixture-code")
    expect((callback.headers["set-cookie"] as string[]).some((cookie) => cookie.startsWith("kokoro_product_session="))).toBe(true)
    expect(Buffer.byteLength((callback.headers["set-cookie"] as string[]).find((cookie) =>
      cookie.startsWith("kokoro_product_session="))!, "utf8"))
      .toBeLessThanOrEqual(4096)
    const productJar = cookieHeader(signin, callback)
    const projection = await http(nextPort, "/api/auth/session", "GET", "", { cookie: productJar })
    expect(projection.status).toBe(200)
    expect(projection.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/u)
    expect(JSON.parse(projection.body)).toMatchObject({ authenticated: true, subject: "user-one" })
    expect(projection.body).not.toContain("access-opaque")
    expect(projection.body).not.toContain("refresh-opaque")
    expect((callback.headers["set-cookie"] as string[]).every((cookie) =>
      !cookie.includes("kokoro_session="))).toBe(true)
    expect(paths).toContain("/iam/oauth2/token")
    expect(paths).toContain("/iam/oauth2/userinfo")
    expect(paths).toContain("/v1/me")
    expect(signin.headers["set-cookie"]).toBeDefined()
    const tokenCalls = paths.filter((item) => item === "/iam/oauth2/token").length
    const replay = await http(nextPort, `/api/auth/callback/kokoro-iam?code=fixture-code&state=${state}&iss=${encodeURIComponent(`http://localhost:${nextPort}/iam`)}`, "GET", "", { cookie: jar })
    expect(replay.status).toBe(403)
    expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(tokenCalls)
  })

  it("R139 turns a pending browser session probe into a recoverable alert without request storms", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" },
        args: ["--proxy-bypass-list=<-loopback>"] })
      const context = await browser.newContext()
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      proxy.setFault("pending")
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await browserProbeDiagnostic("pending_document", page, response, proxy, outputStart))
      await requireSessionProbe("pending_probe_barrier", 1, page, response, proxy, outputStart)
      if (!await page.getByTestId("runtime-loading").isVisible()) {
        throw new Error(await browserProbeDiagnostic("pending_loading", page, response, proxy, outputStart))
      }
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"))
        window.dispatchEvent(new Event("focus"))
      })
      const retry = page.getByRole("button", { name: /Retry|重试/u })
      const alert = page.getByRole("alert").filter({ has: retry })
      try { await alert.waitFor({ timeout: 12_000 }) }
      catch { throw new Error(await browserProbeDiagnostic("pending_alert", page, response, proxy, outputStart)) }
      expect(proxy.sessionRequests()).toBe(1)
      expect(new URL(page.url()).pathname).toBe("/app")

      proxy.setFault("pass")
      const recoveryDeadline = Date.now() + 10_000
      const recoveryBudget = (): number => Math.max(1, recoveryDeadline - Date.now())
      await retry.click()
      await expect.poll(() => proxy.loginRequests(), { timeout: recoveryBudget() }).toBeGreaterThan(0)
      expect(proxy.sessionRequests()).toBeGreaterThanOrEqual(2)
      proxy.releasePending()
      try {
        await expect.poll(async () => {
          const pathname = new URL(page.url()).pathname
          return pathname !== "/app" || await page.locator('[data-app-frame-main="true"]').count() > 0
        }, { timeout: recoveryBudget() }).toBe(true)
      } catch {
        throw new Error(await browserProbeDiagnostic("pending_recovery", page, response, proxy, outputStart))
      }
      await expect.poll(() => alert.count(), { timeout: recoveryBudget() }).toBe(0)
      await context.close()
    } finally {
      proxy.releasePending()
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 45_000)

  it("R139 keeps a 503 session probe on an explicit retry surface instead of redirecting to login", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      proxy.setFault("unavailable")
      const context = await browser.newContext()
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await browserProbeDiagnostic("unavailable_document", page, response, proxy, outputStart))
      await requireSessionProbe("unavailable_probe_barrier", 1, page, response, proxy, outputStart)
      const retry = page.getByRole("button", { name: /Retry|重试/u })
      const alert = page.getByRole("alert").filter({ has: retry })
      try { await alert.waitFor({ timeout: 12_000 }) }
      catch { throw new Error(await browserProbeDiagnostic("unavailable_alert", page, response, proxy, outputStart)) }
      expect(new URL(page.url()).pathname).toBe("/app")
      expect(proxy.loginRequests()).toBe(0)
      expect(proxy.sessionRequests()).toBe(1)

      proxy.setFault("pass")
      await retry.click()
      await expect.poll(() => proxy.loginRequests()).toBeGreaterThan(0)
      expect(proxy.sessionRequests()).toBeGreaterThanOrEqual(2)
      await context.close()
    } finally {
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 30_000)

  it("R139 preserves a real anonymous 200 response as the only automatic login path", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      const context = await browser.newContext()
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await browserProbeDiagnostic("anonymous_document", page, response, proxy, outputStart))
      try { await requireSessionProbe("anonymous_probe_barrier", 1, page, response, proxy, outputStart) }
      catch (error) {
        let control: string
        try { control = await directAnonymousControlDiagnostic() }
        catch (controlError) {
          throw new AggregateError([error, controlError], "anonymous probe and direct diagnostic control failed")
        }
        throw new AggregateError([error], `${error instanceof Error ? error.message : "anonymous probe failed"}\n${control}`)
      }
      await expect.poll(() => proxy.loginRequests()).toBeGreaterThan(0)
      expect(proxy.sessionRequests()).toBeGreaterThanOrEqual(1)
      await context.close()
    } finally {
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 30_000)

  it("R139 preserves a first tab's conversation index and draft when the same subject opens a second app document", async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext()
      const firstPage = await context.newPage()
      await firstPage.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      const firstMain = firstPage.locator('[data-app-frame-main="true"]')
      await firstMain.waitFor({ state: "visible", timeout: 15_000 })

      const newChat = firstPage.getByRole("button", { name: /New chat|新对话/iu }).first()
      await newChat.click()
      const composer = firstPage.locator('[data-slot="composer-input"]')
      const draft = "same subject second document draft"
      await composer.fill(draft)
      await expect.poll(() => composer.inputValue(), { timeout: 10_000 }).toBe(draft)
      await expect.poll(() => firstPage.evaluate(() => Object.keys(window.localStorage)
        .filter((key) => key.startsWith("kokoro.web.conversations.")).length), { timeout: 10_000 }).toBeGreaterThan(0)
      const originalIndexes = await firstPage.evaluate(() => Object.fromEntries(Object.keys(window.localStorage)
        .filter((key) => key.startsWith("kokoro.web.conversations."))
        .map((key) => [key, window.localStorage.getItem(key)])))

      const secondPage = await context.newPage()
      await secondPage.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await secondPage.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: 15_000 })

      await expect.poll(() => firstMain.isVisible(), { timeout: 10_000 }).toBe(true)
      await expect.poll(() => composer.inputValue(), { timeout: 10_000 }).toBe(draft)
      await expect.poll(() => firstPage.evaluate(() => Object.fromEntries(Object.keys(window.localStorage)
        .filter((key) => key.startsWith("kokoro.web.conversations."))
        .map((key) => [key, window.localStorage.getItem(key)])))).toEqual(originalIndexes)
      await context.close()
    } finally {
      await browser.close()
    }
  }, 45_000)

  it("R141 bounds an unfinished session-list response and restores the list only after Retry", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let page: Page | undefined
    sessionListStatus = 200
    try {
      proxy.setListBodyPending(true)
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      const context = await browser.newContext()
      page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: 15_000 })
      const loginRequestsAfterAdmission = proxy.loginRequests()
      await expandDesktopRail(page)
      await expect.poll(() => proxy.listRequests(), { timeout: 15_000 }).toBe(1)
      await expect.poll(() => proxy.heldListBodies(), { timeout: 10_000 }).toBe(1)
      const loginRequestsAtListBarrier = proxy.loginRequests()
      expect(loginRequestsAtListBarrier).toBe(loginRequestsAfterAdmission)

      const directList = page.locator('[data-conversation-list="direct"]')
      const alert = directList.getByRole("alert")
      const retry = alert.getByRole("button", { name: /Retry|重试/u })
      await alert.waitFor({ timeout: 15_000 })
      expect(new URL(page.url()).pathname).toBe("/app")
      expect(proxy.listRequests()).toBe(1)
      expect(proxy.loginRequests()).toBe(loginRequestsAtListBarrier)

      proxy.releaseListBodies()
      await retry.click()
      await expect.poll(() => proxy.listRequests(), { timeout: 10_000 }).toBe(2)
      await page.getByText("Bounded list alpha", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await page.getByText("Bounded list beta", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await expect.poll(() => alert.count(), { timeout: 10_000 }).toBe(0)
      expect(proxy.loginRequests()).toBe(loginRequestsAtListBarrier)
      await context.close()
    } catch (error) {
      if (page === undefined) throw error
      throw new AggregateError([error], await listFailureDiagnostic("unfinished_body", page, proxy))
    } finally {
      sessionListStatus = 200
      proxy.releaseListBodies()
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 50_000)

  it("R141 keeps a 503 session list on an explicit Retry surface and restores the authoritative list", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let page: Page | undefined
    sessionListStatus = 503
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      const context = await browser.newContext()
      page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: 15_000 })
      const loginRequestsAfterAdmission = proxy.loginRequests()
      await expandDesktopRail(page)
      await expect.poll(() => proxy.listRequests(), { timeout: 15_000 }).toBe(1)
      const loginRequestsAtListBarrier = proxy.loginRequests()
      expect(loginRequestsAtListBarrier).toBe(loginRequestsAfterAdmission)

      const directList = page.locator('[data-conversation-list="direct"]')
      const alert = directList.getByRole("alert")
      const retry = alert.getByRole("button", { name: /Retry|重试/u })
      await alert.waitFor({ timeout: 10_000 })
      expect(new URL(page.url()).pathname).toBe("/app")
      expect(proxy.listRequests()).toBe(1)
      expect(proxy.loginRequests()).toBe(loginRequestsAtListBarrier)

      sessionListStatus = 200
      await retry.click()
      await expect.poll(() => proxy.listRequests(), { timeout: 10_000 }).toBe(2)
      await page.getByText("Bounded list alpha", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await page.getByText("Bounded list beta", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await expect.poll(() => alert.count(), { timeout: 10_000 }).toBe(0)
      expect(proxy.loginRequests()).toBe(loginRequestsAtListBarrier)
      await context.close()
    } catch (error) {
      if (page === undefined) throw error
      throw new AggregateError([error], await listFailureDiagnostic("service_unavailable", page, proxy))
    } finally {
      sessionListStatus = 200
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 45_000)

  it.each([
    ["tenant mismatch", "user-one", "tenant-two", 200],
    ["subject mismatch", "user-two", "tenant-one", 200],
    ["BFF rejection", "user-one", "tenant-one", 503],
  ])("fails callback closed for %s without creating a Product Session", async (_label, userId, tenantId, status) => {
    identityUserId = userId
    identityTenantId = tenantId
    identityStatus = status
    try {
      const { jar, location } = await start()
      const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
      const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
      expect(callback.status).toBe(503)
      expect((callback.headers["set-cookie"] as string[] | undefined)?.some((cookie) => cookie.startsWith("kokoro_product_session=")) ?? false).toBe(false)
      expect(callback.body).not.toMatch(/access-opaque|rp-bff-secret|tenant-two|user-two/u)
    } finally {
      identityUserId = "user-one"
      identityTenantId = "tenant-one"
      identityStatus = 200
    }
  })

  it.each([["unknown response field", true, false], ["BFF timeout", false, true]])(
    "fails callback closed for %s without leaking credentials", async (_label, malformed, slow) => {
      invalidIdentityShape = malformed
      slowIdentity = slow
      try {
        const { jar, location } = await start()
        const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
        const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
        expect(callback.status).toBe(503)
        expect(callback.body).not.toMatch(/access-opaque|refresh-opaque|must-not-pass|rp-bff-secret/u)
        expect((callback.headers["set-cookie"] as string[] | undefined)?.some((cookie) =>
          cookie.startsWith("kokoro_product_session=")) ?? false).toBe(false)
      } finally { invalidIdentityShape = false; slowIdentity = false }
    },
    10_000,
  )

  it("rotates once across concurrent refresh POSTs and rejects old generation before active logout", async () => {
    const { csrf, signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    expect(callback.status).toBe(303)
    await recordProduct(callback)
    const oldJar = cookieHeader(csrf, signin, callback)
    const csrfToken = (JSON.parse(csrf.body) as { csrfToken: string }).csrfToken
    const form = `csrfToken=${csrfToken}`
    const before = paths.filter((item) => item === "/iam/oauth2/token").length
    const results = await Promise.all([0, 1].map(() => http(nextPort, "/api/auth/session", "POST", form,
      { origin: `http://localhost:${nextPort}`, cookie: oldJar })))
    expect(results.filter((item) => item.status === 200)).toHaveLength(1)
    expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(before + 1)
    const winner = results.find((item) => item.status === 200)!
    expect(winner.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/u)
    await recordProduct(winner)
    expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie: oldJar })).body).toContain('"authenticated":false')
    const newJar = cookieHeader(csrf, signin, callback, winner)
    expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie: newJar })).body).toContain('"authenticated":true')
    const revokesBeforeStaleSignout = paths.filter((item) => item === "/iam/oauth2/revoke").length
    const staleSignout = await http(nextPort, "/api/auth/signout", "POST", form,
      { origin: `http://localhost:${nextPort}`, cookie: oldJar })
    expect(staleSignout.status).toBe(200)
    expect(JSON.parse(staleSignout.body)).toEqual({ status: "stale_session", remote_revocation: "not_required" })
    expect(staleSignout.headers["set-cookie"]).toBeUndefined()
    expect(cookieHeader(csrf, signin, callback, winner, staleSignout)).toBe(newJar)
    expect(paths.filter((item) => item === "/iam/oauth2/revoke")).toHaveLength(revokesBeforeStaleSignout)
    expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie: newJar })).body).toContain('"authenticated":true')
    const signout = await http(nextPort, "/api/auth/signout", "POST", form,
      { origin: `http://localhost:${nextPort}`, cookie: newJar })
    expect(signout.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/u)
    expect(signout.body).toContain('"remote_revocation":"confirmed"')
    expect(paths).toContain("/iam/oauth2/revoke")
    expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie: newJar })).body).toContain('"authenticated":false')
  })

  it("revokes the old Product Session when refreshed identity no longer matches the fixed tenant", async () => {
    const { csrf, signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", {
      cookie: jar,
    })
    expect(callback.status).toBe(303)
    await recordProduct(callback)
    const oldJar = cookieHeader(csrf, signin, callback)
    identityTenantId = "tenant-two"
    try {
      const form = `csrfToken=${encodeURIComponent((JSON.parse(csrf.body) as { csrfToken: string }).csrfToken)}`
      const refreshed = await http(nextPort, "/api/auth/session", "POST", form, {
        cookie: oldJar, origin: `http://localhost:${nextPort}`,
        "content-type": "application/x-www-form-urlencoded",
      })
      expect(refreshed.status).toBe(503)
      expect(refreshed.body).not.toMatch(/access-rotated|refresh-rotated|tenant-two|rp-bff-secret/u)
      const oldSession = await http(nextPort, "/api/auth/session", "GET", "", { cookie: oldJar })
      expect(oldSession.status).toBe(200)
      expect(JSON.parse(oldSession.body)).toEqual({ authenticated: false })
    } finally { identityTenantId = "tenant-one" }
  })

  it("hands browser a token-free issuer logout URL and ends issuer session only after GET confirmation plus POST", async () => {
    const { csrf, signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    expect(callback.status).toBe(303)
    await recordProduct(callback)
    const productJar = cookieHeader(csrf, signin, callback)
    const issuerCookie = cookieHeader(authorize)
    expect((await http(nextPort, "/iam/get-session", "GET", "", { cookie: issuerCookie })).body)
      .toContain('"userId":"user-one"')
    const token = (JSON.parse(csrf.body) as { csrfToken: string }).csrfToken
    const signout = await http(nextPort, "/api/auth/signout", "POST", `csrfToken=${token}`,
      { origin: `http://localhost:${nextPort}`, cookie: productJar })
    expect(signout.status).toBe(200)
    const handoff = JSON.parse(signout.body) as { issuer_session: string; issuer_end_session_url: string }
    expect(handoff.issuer_session).toBe("pending_browser_confirmation")
    expect(handoff.issuer_end_session_url).toMatch(/^\/iam\/oauth2\/end-session\?/u)
    expect(handoff.issuer_end_session_url).not.toMatch(/access|refresh|id_token|secret/u)
    expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie: productJar })).body)
      .toContain('"authenticated":false')
    expect((await http(nextPort, "/iam/get-session", "GET", "", { cookie: issuerCookie })).body)
      .toContain('"userId":"user-one"')
    const get = await http(nextPort, handoff.issuer_end_session_url, "GET", "", { cookie: issuerCookie,
      accept: "text/html" })
    expect(get.status).toBe(200)
    expect(get.body).toContain("/iam/oauth2/end-session/confirm")
    const confirmationCookie = cookieHeader(get)
    const rejected = await http(nextPort, "/iam/oauth2/end-session/confirm", "POST", "action=confirm",
      { cookie: `${issuerCookie}; ${confirmationCookie}` })
    expect(rejected.status).toBe(403)
    const confirmed = await http(nextPort, "/iam/oauth2/end-session/confirm", "POST", "action=confirm",
      { origin: `http://localhost:${nextPort}`, cookie: `${issuerCookie}; ${confirmationCookie}` })
    expect(confirmed.status).toBe(303)
    expect(confirmed.headers.location).toBe("/login")
    expect(confirmed.body).toBe("")
    const nextLogin = await http(nextPort, confirmed.headers.location as string, "GET", "")
    expect(nextLogin.status).toBe(302)
    expect(nextLogin.headers.location).toMatch(new RegExp(`^http://localhost:${nextPort}/iam/oauth2/authorize\\?`, "u"))
    const issuerAfter = cookieHeader(authorize, get, confirmed)
    expect((await http(nextPort, "/iam/get-session", "GET", "", { cookie: issuerAfter })).body)
      .toContain('"session":null')
  })

  it("keeps BFF untouched while real Next has not received a complete slow confirmation body", async () => {
    const before = paths.length
    let responseStatus: number | undefined
    let replySettled: Promise<void> | undefined
    const browser = httpRequest({ hostname: "127.0.0.1", port: nextPort, agent: false,
        path: "/iam/oauth2/end-session/confirm", method: "POST",
        headers: { host: `localhost:${nextPort}`, origin: `http://localhost:${nextPort}`,
          "content-type": "application/x-www-form-urlencoded", "transfer-encoding": "chunked" } }, (reply) => {
        responseStatus = reply.statusCode
        replySettled = new Promise<void>((resolve) => {
          let done = false
          const finish = (): void => { if (!done) { done = true; resolve() } }
          reply.once("end", finish)
          reply.once("close", finish)
        })
        reply.resume()
      })
    const requestClosed = new Promise<void>((resolve) => browser.once("close", resolve))
    browser.on("error", () => undefined)
    browser.write("action=")
    await new Promise((resolve) => setTimeout(resolve, 5_500))
    browser.destroy()
    await requestClosed
    if (replySettled !== undefined) await replySettled
    expect(responseStatus === undefined || responseStatus === 400).toBe(true)
    expect(paths).toHaveLength(before)
    expect((await http(nextPort, "/api/auth/csrf")).status).toBe(200)
  }, 8_000)

  it("does not relay a browser-disconnected logout confirmation form", async () => {
    const before = paths.length
    let replySettled: Promise<void> | undefined
    const browser = httpRequest({ hostname: "127.0.0.1", port: nextPort, agent: false,
      path: "/iam/oauth2/end-session/confirm", method: "POST",
      headers: { host: `localhost:${nextPort}`, origin: `http://localhost:${nextPort}`,
        "content-type": "application/x-www-form-urlencoded", "transfer-encoding": "chunked" } }, (reply) => {
      replySettled = new Promise<void>((resolve) => {
        let done = false
        const finish = (): void => { if (!done) { done = true; resolve() } }
        reply.once("end", finish)
        reply.once("close", finish)
      })
      reply.resume()
    })
    const requestClosed = new Promise<void>((resolve) => browser.once("close", resolve))
    browser.on("error", () => undefined)
    await new Promise<void>((resolve) => { browser.write("action=", () => resolve()) })
    browser.destroy()
    await requestClosed
    if (replySettled !== undefined) await replySettled
    expect(paths).toHaveLength(before)
    expect((await http(nextPort, "/api/auth/csrf")).status).toBe(200)
  })

  it("tombstones a pending refresh without sending its stale credential to revoke", async () => {
    const outputStart = output.length
    const pathStart = paths.length
    const { csrf, signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status, responseDiagnostic("authorize", authorize, outputStart, pathStart)).toBe(302)
    const callbackLocation = headerValue(authorize.headers, "location")
    expect(typeof callbackLocation, responseDiagnostic("authorize_location", authorize, outputStart, pathStart)).toBe("string")
    if (callbackLocation === null) throw new Error(responseDiagnostic("authorize_location", authorize, outputStart, pathStart))
    const callback = await http(nextPort, callbackLocation, "GET", "", { cookie: jar })
    expect(callback.status, responseDiagnostic("callback", callback, outputStart, pathStart)).toBe(303)
    await recordProduct(callback)
    const cookie = cookieHeader(csrf, signin, callback)
    const form = `csrfToken=${(JSON.parse(csrf.body) as { csrfToken: string }).csrfToken}`
    const refreshesBefore = paths.filter((item) => item === "/iam/oauth2/token").length
    const started = new Promise<void>((resolve) => {
      onRefreshStarted = () => { onRefreshStarted = undefined; resolve() }
    })
    holdRefresh = true
    try {
      const refreshing = http(nextPort, "/api/auth/session", "POST", form,
        { origin: `http://localhost:${nextPort}`, cookie })
      const first = await Promise.race([
        started.then(() => ({ kind: "started" as const })),
        refreshing.then(
          (response) => ({ kind: "response" as const, response }),
          (error: unknown) => ({ kind: "rejection" as const, category:
            error instanceof TypeError ? "type_error" :
              error instanceof Error && error.name === "AbortError" ? "abort_error" :
                error instanceof Error ? "error" : "non_error" }),
        ),
      ])
      if (first.kind === "response") {
        throw new Error(responseDiagnostic("refresh_before_token", first.response, outputStart, pathStart))
      }
      if (first.kind === "rejection") {
        throw new Error(`refresh_before_token diagnostic: ${JSON.stringify({
          stage: "refresh_before_token",
          outcome: "rejected",
          error_category: first.category,
          bff_paths: bffPathnames(paths.slice(pathStart)),
          next_error_categories: nextErrorCategories(output.slice(outputStart)),
        })}`)
      }
      expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(refreshesBefore + 1)
      const revokesBefore = paths.filter((item) => item === "/iam/oauth2/revoke").length
      const signout = await http(nextPort, "/api/auth/signout", "POST", form,
        { origin: `http://localhost:${nextPort}`, cookie })
      expect(signout.status, responseDiagnostic("signout", signout, outputStart, pathStart)).toBe(200)
      expect(JSON.parse(signout.body)).toMatchObject({ remote_revocation: "unconfirmed" })
      expect(paths.filter((item) => item === "/iam/oauth2/revoke")).toHaveLength(revokesBefore)
      releaseRefresh?.()
      releaseRefresh = undefined
      expect((await refreshing).status).toBe(409)
      expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie })).body).toContain('"authenticated":false')
    } finally { holdRefresh = false; releaseRefresh?.(); releaseRefresh = undefined; onRefreshStarted = undefined }
  })

  it.each([
    { access_token: "a".repeat(2049), refresh_token: "refresh-next", expires_in: 600 },
    { access_token: "access-next", refresh_token: "r".repeat(8193), expires_in: 600 },
    { access_token: "access-next", refresh_token: "refresh-next", expires_in: 3601 },
    { access_token: "access-next", refresh_token: "refresh-next", expires_in: 0.5 },
  ])("rejects malformed rotated token credentials before a generation change: %#", async (invalid) => {
    const { csrf, signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    expect(callback.status).toBe(303)
    await recordProduct(callback)
    const oldJar = cookieHeader(csrf, signin, callback)
    refreshResponseOverride = { ...invalid, token_type: "Bearer" }
    try {
      const before = paths.filter((item) => item === "/iam/oauth2/token").length
      const result = await http(nextPort, "/api/auth/session", "POST",
        `csrfToken=${(JSON.parse(csrf.body) as { csrfToken: string }).csrfToken}`,
        { origin: `http://localhost:${nextPort}`, cookie: oldJar })
      expect(result.status).toBe(503)
      expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(before + 1)
      expect((result.headers["set-cookie"] as string[] | undefined ?? [])
        .some((cookie) => cookie.startsWith("kokoro_product_session="))).toBe(false)
      expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie: oldJar })).body)
        .toContain('"authenticated":false')
    } finally { refreshResponseOverride = undefined }
  })

  it("rejects refresh and signout mutations without matching Origin and Auth.js CSRF", async () => {
    const { csrf, signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    expect(callback.status).toBe(303)
    await recordProduct(callback)
    const cookie = cookieHeader(csrf, signin, callback)
    const before = paths.length
    for (const action of ["session", "signout"]) {
      const path = `/api/auth/${action}`
      const noOrigin = await http(nextPort, path, "POST", "csrfToken=wrong", { cookie })
      expect(noOrigin.status).toBe(403)
      const badCsrf = await http(nextPort, path, "POST", "csrfToken=wrong",
        { origin: `http://localhost:${nextPort}`, cookie })
      expect(badCsrf.status).toBe(403)
    }
    expect(paths).toHaveLength(before)
    expect((await http(nextPort, "/api/auth/session", "GET", "", { cookie })).body).toContain('"authenticated":true')
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
    const { jar, state } = await start()
    const callback = `/api/auth/callback/kokoro-iam?code=fixture-code&state=${state}`
    const issuer = encodeURIComponent(`http://localhost:${nextPort}/iam`)
    for (const path of [callback, `${callback}&iss=${encodeURIComponent("https://evil.example/iam")}`,
      `${callback}&iss=${issuer}&iss=${issuer}`, `${callback}&iss=${issuer}&extra=1`]) {
      expect((await http(nextPort, path, "GET", "", { cookie: jar })).status).toBe(400)
    }
    const rejected = await http(nextPort, `/api/auth/callback/kokoro-iam?code=fixture-code&state=wrong-state-123456&iss=${issuer}`, "GET", "", { cookie: jar })
    expect(rejected.status).toBe(403)
    expect(paths.slice(initial).filter((item) => item === "/iam/oauth2/token")).toHaveLength(0)
  })

  it("rejects an oversized initial refresh before Product Session creation, without a cookie", async () => {
    const { jar, location, state } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    oversizedRefreshCredential = true
    try {
      const callbackPath = authorize.headers.location as string
      const callback = await http(nextPort, callbackPath, "GET", "", { cookie: jar })
      expect(callback.status).toBe(403)
      expect(JSON.parse(callback.body)).toMatchObject({ error: { code: "rp_callback_rejected" } })
      expect(callback.body).not.toContain("r".repeat(100))
      expect((callback.headers["set-cookie"] as string[] | undefined ?? []).every((cookie) =>
        !cookie.startsWith("kokoro_product_session="))).toBe(true)
      const replay = await http(nextPort, `/api/auth/callback/kokoro-iam?code=fixture-code&state=${state}&iss=${encodeURIComponent(`http://localhost:${nextPort}/iam`)}`,
        "GET", "", { cookie: jar })
      expect(replay.status).toBe(403)
    } finally { oversizedRefreshCredential = false }
  })

  it("returns controlled 503 without creating a Redis record when Product cookie preflight rejects claims", async () => {
    const { jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    oversizedSubject = true
    try {
      const before = await productRecordKeys()
      const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
      expect(callback.status).toBe(503)
      expect(JSON.parse(callback.body)).toMatchObject({ error: { code: "product_session_unavailable" } })
      expect((callback.headers["set-cookie"] as string[] | undefined ?? [])
        .some((cookie) => cookie.startsWith("kokoro_product_session="))).toBe(false)
      for (const key of await productRecordKeys()) expect(before.has(key)).toBe(true)
    } finally { oversizedSubject = false }
  })

  it("rejects an oversized initial access credential before Redis session creation or a browser cookie", async () => {
    const { jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    oversizedAccessCredential = true
    try {
      const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
      expect(callback.status).toBe(403)
      expect((callback.headers["set-cookie"] as string[] | undefined ?? [])
        .some((cookie) => cookie.startsWith("kokoro_product_session="))).toBe(false)
    } finally { oversizedAccessCredential = false }
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
    expect([first.status, second.status].sort()).toEqual([303, 403])
    await recordProduct(first)
    await recordProduct(second)
    expect(paths.filter((item) => item === "/iam/oauth2/token")).toHaveLength(before + 1)
    expect((await http(nextPort, `/api/auth/callback/kokoro-iam?code=fixture-code&state=${state}&iss=${encodeURIComponent(`http://localhost:${nextPort}/iam`)}`, "GET", "", { cookie: jar })).status).toBe(403)
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
