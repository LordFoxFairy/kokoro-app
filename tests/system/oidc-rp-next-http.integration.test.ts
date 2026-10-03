import { spawn, type ChildProcess } from "node:child_process"
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
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
type NextDevEngine = "webpack" | "programmatic"

function nextDevEngine(): NextDevEngine {
  const value = process.env.KOKORO_TEST_NEXT_DEV_ENGINE?.trim() || "webpack"
  if (value === "webpack" || value === "programmatic") return value
  throw new Error("KOKORO_TEST_NEXT_DEV_ENGINE must be webpack or programmatic")
}

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

function http(
  port: number,
  target: string,
  method = "GET",
  body = "",
  extra: Record<string, string> = {},
  timeoutMs?: number,
): Promise<HttpResult> {
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//")) {
    return Promise.reject(new Error("fixture HTTP target must be root-relative"))
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const clearDeadline = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }
    const resolveOnce = (result: HttpResult): void => { clearDeadline(); resolve(result) }
    const rejectOnce = (error: unknown): void => { clearDeadline(); reject(error) }
    const request = httpRequest({ hostname: "127.0.0.1", port, path: target, method,
      headers: { host: `localhost:${port}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...extra } }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.once("error", rejectOnce)
      response.once("end", () => resolveOnce({ status: response.statusCode ?? 0, headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8") }))
    })
    request.once("error", rejectOnce)
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => request.destroy(new Error("fixture HTTP deadline")), Math.max(1, timeoutMs))
    }
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

async function isolatedNext(projectRoot: string, engine: NextDevEngine): Promise<string> {
  const commonRoot = path.resolve(projectRoot, "../../..")
  const root = await mkdtemp(path.join(engine === "programmatic" ? commonRoot : tmpdir(), "kokoro-oidc-rp-next-"))
  try {
    await cp(path.join(projectRoot, "src"), path.join(root, "src"), { recursive: true })
    await cp(path.join(projectRoot, "public"), path.join(root, "public"), { recursive: true })
    await writeFile(path.join(root, "json-parse-diagnostic.cjs"), `const { createHash } = require("node:crypto")
const originalParse = JSON.parse
let emitted = 0
function caller(stack) {
  for (const raw of String(stack).split("\\n").slice(1, 9)) {
    const frame = raw.replaceAll("\\\\", "/")
    const line = frame.match(/:(\\d+):\\d+\\)?$/)?.[1]
    if (frame.includes("/next/dist/server/load-manifest")) return { category: "next_manifest_loader", line }
    if (frame.includes("/next/dist/server/lib/router-utils/filesystem")) return { category: "next_router_filesystem", line }
    if (frame.includes("/next/dist/server/lib/incremental-cache/") || frame.includes("/next/dist/server/dev/")) return { category: "next_dev_or_cache", line }
    if (frame.includes("/next/dist/server/app-render/")) return { category: "next_app_render", line }
    if (frame.includes("/src/app/api/auth/") || frame.includes("/src/lib/server/")) return { category: "app_code", line }
    if (frame.includes("/next/") || frame.includes("/webpack/")) return { category: "next_or_webpack_other", line }
  }
  return { category: "unknown", line: undefined }
}
JSON.parse = function parse(text, reviver) {
  try { return originalParse.call(this, text, reviver) }
  catch (error) {
    if (emitted < 16) {
      emitted += 1
      try {
        const isString = typeof text === "string"
        const isBuffer = Buffer.isBuffer(text)
        const inputType = isString ? "string" : isBuffer ? "buffer" : "other"
        const completeString = isString && text.length <= 64 * 1024
        const bounded = isString ? Buffer.from(text.slice(0, 64 * 1024)) :
          isBuffer ? text.subarray(0, 256 * 1024) : null
        const truncated = isString ? !completeString : isBuffer ? text.byteLength > 256 * 1024 : false
        const location = caller(error instanceof Error ? error.stack || "" : "")
        const record = { category: location.category, input_type: inputType,
          byte_count: completeString ? bounded.byteLength : isBuffer ? text.byteLength : null,
          scanned_bytes: bounded === null ? 0 : bounded.byteLength, truncated,
          sha256: bounded === null ? null : createHash("sha256").update(bounded).digest("hex"),
          line: location.line === undefined ? null : Number(location.line) }
        process.stderr.write("KOKORO_TEST_JSON_PARSE_FAILURE " + JSON.stringify(record).slice(0, 8191) + "\\n")
      } catch {}
    }
    throw error
  }
}
`, { mode: 0o600 })
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
    const requestErrorRoute = path.join(root, "src", "app", "api", "rp-request-error-fixture", "route.ts")
    await mkdir(path.dirname(requestErrorRoute), { recursive: true })
    await writeFile(requestErrorRoute, `export const runtime = "nodejs"
export function GET(): never {
  const error = new SyntaxError("Unexpected end of JSON input")
  Object.defineProperty(error, "syntheticSecret", { value: process.env.KOKORO_TEST_SYNTHETIC_SECRET })
  throw error
}
`)
    await writeFile(path.join(root, "src", "instrumentation.ts"), `import type { Instrumentation } from "next"

type FrameCategory = "app_auth_route" | "app_product_session_store" | "app_product_session" |
  "app_oidc_token" | "app_product_identity" | "dependency_redis" | "dependency_jose_or_next_auth" |
  "dependency_openid_client" | "next_server_or_webpack" | "node_runtime" | "fixture_synthetic" | "unknown"

function frameCategory(value: string): FrameCategory {
  const normalized = value.replaceAll("\\\\", "/")
  if (normalized.includes("/src/app/api/auth/[...nextauth]/route.")) return "app_auth_route"
  if (normalized.includes("/src/lib/server/product-session-store.")) return "app_product_session_store"
  if (normalized.includes("/src/lib/server/product-session.")) return "app_product_session"
  if (normalized.includes("/src/lib/server/oidc-token.")) return "app_oidc_token"
  if (normalized.includes("/src/lib/server/product-identity.")) return "app_product_identity"
  if (normalized.includes("/src/app/api/rp-request-error-fixture/route.")) return "fixture_synthetic"
  if (normalized.includes("/node_modules/redis/") || normalized.includes("/node_modules/@redis/")) return "dependency_redis"
  if (normalized.includes("/node_modules/jose/") || normalized.includes("/node_modules/next-auth/")) return "dependency_jose_or_next_auth"
  if (normalized.includes("/node_modules/openid-client/")) return "dependency_openid_client"
  if (normalized.includes("/node_modules/next/") || normalized.includes("/node_modules/webpack/")) return "next_server_or_webpack"
  if (normalized.startsWith("node:") || normalized.includes("node:internal")) return "node_runtime"
  return "unknown"
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context): void => {
  try {
    const frames: { category: FrameCategory; line: number | null }[] = []
    let current: unknown = error
    for (let depth = 0; depth < 3 && current instanceof Error; depth += 1) {
      for (const frame of (current.stack ?? "").split("\\n").filter((line) => line.includes(" at ")).slice(0, 8 - frames.length)) {
        const line = frame.match(/:(\\d+):\\d+\\)?$/u)?.[1]
        frames.push({ category: frameCategory(frame), line: line === undefined ? null : Number(line) })
      }
      current = "cause" in current ? current.cause : undefined
    }
    const record = {
      error_class: error instanceof SyntaxError ? "syntax_error" : error instanceof TypeError ? "type_error" :
        error instanceof Error ? "other_error" : "non_error",
      error_code: error instanceof SyntaxError && error.message === "Unexpected end of JSON input" ? "json_unexpected_eof" : "other",
      method: request.method === "POST" || request.method === "GET" ? request.method : "other",
      route: request.path.split("?", 1)[0] === "/api/auth/signout" ? "auth_signout" :
        request.path.split("?", 1)[0] === "/api/rp-request-error-fixture" ? "fixture_synthetic" : "other",
      router_kind: context.routerKind === "App Router" ? "app" : context.routerKind === "Pages Router" ? "pages" : "other",
      route_type: ["route", "render", "action", "proxy"].includes(context.routeType) ? context.routeType : "other",
      frames: frames.slice(0, 8),
    }
    console.log("KOKORO_TEST_NEXT_REQUEST_ERROR " + JSON.stringify(record))
  } catch { /* diagnostics must not replace the original request error */ }
}
`)
    for (const name of ["package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) await cp(path.join(projectRoot, name), path.join(root, name))
    if (engine === "programmatic") {
      const configPath = path.join(root, "next.config.ts")
      const config = await readFile(configPath, "utf8")
      const marker = "root: process.cwd()"
      if (config.split(marker).length !== 2) throw new Error("Web Turbopack test fixture config drift")
      await writeFile(configPath, config.replace(marker, `root: ${JSON.stringify(commonRoot)}`))
      await writeFile(path.join(root, "server.cjs"), `const http = require("node:http")
const next = require("next")
const [port, host] = process.argv.slice(2)
const app = next({ dev: true, dir: __dirname, hostname: host, port: Number(port) })
app.prepare().then(() => http.createServer(app.getRequestHandler()).listen(Number(port), host))
  .catch(() => { process.exitCode = 1 })
`, { mode: 0o600 })
    }
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

function nextJsonFailureSources(value: string): string[] {
  const instrumented = requestErrorDiagnostics(value).flatMap((record) => record.frames.map((frame) => frame.category))
  if (instrumented.length > 0) return [...new Set(instrumented)]
  const checks: readonly [string, RegExp][] = [
    ["app_oidc_token", /src\/lib\/server\/oidc-token\.(?:ts|js)/u],
    ["app_product_identity", /src\/lib\/server\/product-identity\.(?:ts|js)/u],
    ["openid_client", /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?openid-client\//u],
    ["next_or_webpack", /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:next|webpack)\//u],
  ]
  const sources = checks.filter(([, pattern]) => pattern.test(value)).map(([source]) => source)
  return sources.length > 0 ? sources : ["unknown"]
}

const JSON_PARSE_FAILURE_PREFIX = "KOKORO_TEST_JSON_PARSE_FAILURE "
const JSON_PARSE_FAILURE_CATEGORIES = new Set(["next_manifest_loader", "next_router_filesystem", "next_dev_or_cache",
  "next_app_render", "app_code", "next_or_webpack_other", "unknown"])

function jsonParseFailureDiagnostics(value: string): readonly Record<string, unknown>[] {
  const bytes = Buffer.from(value, "utf8")
  let input = bytes.subarray(Math.max(0, bytes.byteLength - 256 * 1024)).toString("utf8")
  if (bytes.byteLength > 256 * 1024) input = input.slice(input.indexOf("\n") + 1)
  const records: Record<string, unknown>[] = []
  for (const line of input.split("\n")) {
    if (records.length >= 16 || line.length > 8 * 1024 || !line.startsWith(JSON_PARSE_FAILURE_PREFIX)) continue
    try {
      const raw: unknown = JSON.parse(line.slice(JSON_PARSE_FAILURE_PREFIX.length))
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue
      const record = raw as Record<string, unknown>
      if (typeof record.category !== "string" || !JSON_PARSE_FAILURE_CATEGORIES.has(record.category) ||
          !["string", "buffer", "other"].includes(typeof record.input_type === "string" ? record.input_type : "") ||
          !(record.byte_count === null || typeof record.byte_count === "number" &&
            Number.isSafeInteger(record.byte_count) && record.byte_count >= 0) ||
          typeof record.scanned_bytes !== "number" || !Number.isSafeInteger(record.scanned_bytes) ||
          record.scanned_bytes < 0 || record.scanned_bytes > 256 * 1024 ||
          typeof record.truncated !== "boolean" ||
          !(record.sha256 === null || typeof record.sha256 === "string" && /^[a-f0-9]{64}$/u.test(record.sha256)) ||
          !(record.line === null || typeof record.line === "number" && Number.isSafeInteger(record.line) && record.line > 0)) continue
      records.push({ category: record.category, input_type: record.input_type, byte_count: record.byte_count,
        scanned_bytes: record.scanned_bytes, truncated: record.truncated, sha256: record.sha256, line: record.line })
    } catch { /* Ignore incomplete child-process output. */ }
  }
  return records
}

const REQUEST_ERROR_PREFIX = "KOKORO_TEST_NEXT_REQUEST_ERROR "
const REQUEST_ERROR_FRAME_CATEGORIES = new Set([
  "app_auth_route", "app_product_session_store", "app_product_session", "app_oidc_token", "app_product_identity",
  "dependency_redis", "dependency_jose_or_next_auth", "dependency_openid_client", "next_server_or_webpack",
  "node_runtime", "fixture_synthetic", "unknown",
])

type RequestErrorDiagnostic = Readonly<{
  error_class: string
  error_code: string
  method: string
  route: string
  router_kind: string
  route_type: string
  frames: readonly Readonly<{ category: string; line: number | null }>[]
}>

function requestErrorDiagnostics(value: string): RequestErrorDiagnostic[] {
  const records: RequestErrorDiagnostic[] = []
  const bytes = Buffer.from(value, "utf8")
  const truncated = bytes.byteLength > 256 * 1024
  let input = (truncated ? bytes.subarray(bytes.byteLength - 256 * 1024) : bytes).toString("utf8")
  if (truncated) {
    const firstCompleteLine = input.indexOf("\n")
    if (firstCompleteLine < 0) return []
    input = input.slice(firstCompleteLine + 1)
  }
  for (const line of input.replace(/\u001b\[[0-9;]*m/gu, "").split(/\r?\n/u)) {
    if (records.length >= 16) break
    if (Buffer.byteLength(line, "utf8") > 8 * 1024) continue
    const offset = line.indexOf(REQUEST_ERROR_PREFIX)
    if (offset < 0) continue
    try {
      const raw: unknown = JSON.parse(line.slice(offset + REQUEST_ERROR_PREFIX.length))
      if (typeof raw !== "object" || raw === null || !("frames" in raw) || !Array.isArray(raw.frames)) continue
      const item = raw as Record<string, unknown>
      const oneOf = (candidate: unknown, allowed: readonly string[], fallback: string): string =>
        typeof candidate === "string" && allowed.includes(candidate) ? candidate : fallback
      const frames = raw.frames.flatMap((frame) => {
        if (typeof frame !== "object" || frame === null) return []
        const candidate = frame as Record<string, unknown>
        if (typeof candidate.category !== "string" || !REQUEST_ERROR_FRAME_CATEGORIES.has(candidate.category)) return []
        const lineNumber = typeof candidate.line === "number" && Number.isSafeInteger(candidate.line) && candidate.line > 0
          ? candidate.line : null
        return [{ category: candidate.category, line: lineNumber }]
      }).slice(0, 8)
      records.push({
        error_class: oneOf(item.error_class, ["syntax_error", "type_error", "other_error", "non_error"], "non_error"),
        error_code: oneOf(item.error_code, ["json_unexpected_eof", "other"], "other"),
        method: oneOf(item.method, ["POST", "GET", "other"], "other"),
        route: oneOf(item.route, ["auth_signout", "fixture_synthetic", "other"], "other"),
        router_kind: oneOf(item.router_kind, ["app", "pages", "other"], "other"),
        route_type: oneOf(item.route_type, ["route", "render", "action", "proxy", "other"], "other"),
        frames,
      })
    } catch { /* malformed diagnostic output is ignored and asserted by its focused system test */ }
  }
  return records
}

async function diagnosticWithin<T>(promise: Promise<T>, fallback: T, timeoutMs = 500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
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
  let deleteSessionStatus = 200
  let holdDeleteSession = false
  let deleteSessionCommitted = false
  let releaseDeleteSession: (() => void) | undefined
  const releaseHeldDeleteSession = (): void => {
    const release = releaseDeleteSession
    if (release !== undefined) release()
  }
  const deleteSessionRequests: { url: string; idempotencyKey: string | undefined }[] = []
  let sessionSnapshotRequests = 0
  const sessionBoundaryRequests: { method: string; path: string }[] = []
  let invalidIdentityShape = false
  let slowIdentity = false
  let output = ""
  let appCompileReadinessMs: number | null = null
  let appCompileReadinessStatus: number | null = null
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

  async function nextManifestMetadata(): Promise<readonly Record<string, unknown>[]> {
    const fixtureRoot = root
    if (fixtureRoot === undefined) return []
    const files = [
      { name: "build-manifest.json", json: true },
      { name: "routes-manifest.json", json: true },
      { name: "prerender-manifest.json", json: true },
      { name: "app-path-routes-manifest.json", json: true },
      { name: "server/app-paths-manifest.json", json: true },
      { name: "server/functions-config-manifest.json", json: true },
      { name: "server/middleware-manifest.json", json: true },
      { name: "server/pages-manifest.json", json: true },
      { name: "server/app/api/auth/[...nextauth]/route.js", json: false },
      { name: "server/app/api/auth/[...nextauth]/route.js.map", json: true },
    ] as const
    const collect = Promise.all(files.map(async ({ name, json }) => {
      try {
        const filename = path.join(fixtureRoot, ".next", "dev", name)
        const info = await stat(filename)
        if (!info.isFile()) return { name, exists: true, file: false, size: info.size }
        const bytes = await readFile(filename)
        let jsonValid: boolean | null = null
        if (json) {
          try { JSON.parse(bytes.toString("utf8")); jsonValid = true }
          catch { jsonValid = false }
        }
        return { name, exists: true, file: true, size: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"), json_valid: jsonValid }
      } catch (error) {
        const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "unknown"
        return { name, exists: code !== "ENOENT", error_code: code }
      }
    }))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        collect,
        new Promise<readonly Record<string, unknown>[]>((resolve) => {
          timer = setTimeout(() => resolve([{ error_code: "metadata_deadline" }]), 750)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  function nextManifestChanges(
    before: readonly Record<string, unknown>[],
    after: readonly Record<string, unknown>[],
  ): readonly Readonly<{ name: string; change: string }>[] {
    const names = ["build-manifest.json", "routes-manifest.json", "prerender-manifest.json", "app-path-routes-manifest.json",
      "server/app-paths-manifest.json", "server/functions-config-manifest.json", "server/middleware-manifest.json",
      "server/pages-manifest.json", "server/app/api/auth/[...nextauth]/route.js",
      "server/app/api/auth/[...nextauth]/route.js.map"] as const
    const byName = (values: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> =>
      new Map(values.flatMap((value) => typeof value.name === "string" ? [[value.name, value] as const] : []))
    const beforeByName = byName(before)
    const afterByName = byName(after)
    return names.map((name) => {
      const left = beforeByName.get(name)
      const right = afterByName.get(name)
      if (left === undefined || right === undefined || left.error_code !== undefined && left.error_code !== "ENOENT" ||
          right.error_code !== undefined && right.error_code !== "ENOENT") {
        return { name, change: "unavailable" }
      }
      if (left.exists === false && right.exists === true) return { name, change: "appeared" }
      if (left.exists === true && right.exists === false) return { name, change: "disappeared" }
      if (right.json_valid === false) return { name, change: "changed_invalid" }
      if (left.exists === right.exists && left.file === right.file && left.size === right.size &&
          left.sha256 === right.sha256 && left.json_valid === right.json_valid) return { name, change: "unchanged" }
      return { name, change: "changed_valid" }
    })
  }

  function nextFailureDiagnostic(
    stage: string,
    response: HttpResult,
    outputStart: number,
    pathStart: number,
    manifestsBefore: readonly Record<string, unknown>[],
    manifestsAfter: readonly Record<string, unknown>[],
  ): string {
    const nextOutput = output.slice(outputStart)
    return `${responseDiagnostic(stage, response, outputStart, pathStart)}; fixture metadata: ${JSON.stringify({
      next_json_failure_sources: nextJsonFailureSources(nextOutput),
      json_parse_failure_diagnostics: jsonParseFailureDiagnostics(nextOutput),
      request_error_diagnostics: requestErrorDiagnostics(nextOutput),
      next_manifests_before: manifestsBefore,
      next_manifests_after: manifestsAfter,
      next_manifest_changes: nextManifestChanges(manifestsBefore, manifestsAfter),
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

  async function deleteFailureDiagnostic(stage: string, page: Page): Promise<string> {
    const screenshotDirectory = process.env.KOKORO_TEST_SCREENSHOT_DIR?.trim()
    let screenshot: string | null = null
    const record = {
      pathname: (() => { try { return new URL(page.url()).pathname } catch { return "<invalid>" } })(),
      session_requests: sessionBoundaryRequests.slice(-20),
      snapshot_requests: sessionSnapshotRequests,
      delete_requests: deleteSessionRequests.length,
      direct_rows: await page.locator('[data-conversation-list="direct"] [data-conversation-id]').count().catch(() => -1),
      active_rows: await page.locator('[data-conversation-list="direct"] [aria-pressed="true"]').count().catch(() => -1),
      composer_visible: await page.locator('[data-slot="composer-input"]').isVisible().catch(() => false),
      dialog_visible: await page.getByRole("alertdialog").isVisible().catch(() => false),
    }
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true })
      screenshot = path.join(screenshotDirectory, `r143-${stage}.png`)
      await page.screenshot({ path: screenshot }).catch(() => undefined)
      await writeFile(
        path.join(screenshotDirectory, `r143-${stage}.json`),
        JSON.stringify({ ...record, screenshot }),
        { encoding: "utf8", mode: 0o600 },
      )
    }
    return `${stage} delete diagnostic: ${JSON.stringify({ ...record, screenshot })}`
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
    const setupDeadline = Date.now() + 55_000
    try {
      const engine = nextDevEngine()
      root = await isolatedNext(process.cwd(), engine)
      bff = createServer((request, response) => {
        paths.push(request.url ?? "")
        if (request.url?.startsWith("/v1/sessions")) {
          sessionBoundaryRequests.push({ method: request.method ?? "<unknown>", path: request.url })
        }
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
              ...(deleteSessionCommitted ? [] : [
                { session_id: "session-list-a", title: "Bounded list alpha", updated_at: "2026-10-03T12:00:00.000Z" },
              ]),
              { session_id: "session-list-b", title: "Bounded list beta", updated_at: "2026-10-03T11:00:00.000Z" },
            ], next_cursor: null },
            meta: { request_id: "req_r141_list" },
          } : { error: { code: "service_unavailable", message: "fixture unavailable", retryable: true } }))
          return
        }
        if (
          request.method === "GET" &&
          (request.url === "/v1/sessions/session-list-a" || request.url === "/v1/sessions/session-list-a?scope=direct")
        ) {
          sessionSnapshotRequests += 1
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({
            data: {
              session: {
                session_id: "session-list-a",
                title: "Bounded list alpha",
                owner_id: "user-one",
                created_at: "2026-10-03T11:59:00.000Z",
                updated_at: "2026-10-03T12:00:00.000Z",
              },
              messages: [{
                message_id: "message-r143-user-a",
                role: "user",
                content: "R143 authoritative conversation A body",
                status: "completed",
                created_at: "2026-10-03T12:00:00.000Z",
              }],
              execution_process: null,
              files: [],
              deliveries: [],
              deliveries_has_more: false,
              event_watermark: null,
            },
            meta: { request_id: "req_r143_snapshot" },
          }))
          return
        }
        if (request.method === "DELETE" && request.url?.startsWith("/v1/sessions/session-list-a")) {
          deleteSessionRequests.push({
            url: request.url,
            idempotencyKey: typeof request.headers["idempotency-key"] === "string"
              ? request.headers["idempotency-key"]
              : undefined,
          })
          const send = (): void => {
            if (response.destroyed) return
            response.writeHead(deleteSessionStatus, { "content-type": "application/json", "cache-control": "no-store" })
            if (deleteSessionStatus === 200) {
              deleteSessionCommitted = true
              response.end(JSON.stringify({ data: { status: "deleted" }, meta: { request_id: "req_r143_delete" } }))
            } else {
              response.end(JSON.stringify({ error: { code: "service_unavailable", message: "fixture unavailable", retryable: true } }))
            }
          }
          if (holdDeleteSession) releaseDeleteSession = send
          else send()
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
      const nextArgs = engine === "programmatic"
        ? [path.join(root, "server.cjs"), String(nextPort), "127.0.0.1"]
        : [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(nextPort)]
      next = spawn(process.execPath, nextArgs, {
        cwd: root,
        env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${path.join(root, "json-parse-diagnostic.cjs")}`]
          .filter((value): value is string => Boolean(value)).join(" "),
          NODE_ENV: "development", KOKORO_WEB_ORIGIN: `http://localhost:${nextPort}`,
          KOKORO_DOMAIN: "localhost", KOKORO_TENANT_ID: "tenant-one",
          KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`, KOKORO_INTERNAL_SECRET_WEB_BFF: "rp-bff-secret",
          KOKORO_WEB_REDIS_URL: redisUrl, KOKORO_OIDC_CLIENT_ID: clientId, KOKORO_OIDC_CLIENT_SECRET: clientSecret,
          KOKORO_WEB_AUTH_SECRET: authSecret, KOKORO_TEST_SYNTHETIC_SECRET: "syntheticsecret-marker",
          NEXTAUTH_URL: `http://localhost:${nextPort}/api/auth` },
        stdio: ["ignore", "pipe", "pipe"],
      })
      next.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8") })
      next.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8") })
      let lastResponse: HttpResult | undefined
      let csrfReady = false
      while (Date.now() < setupDeadline) {
        try {
          lastResponse = await http(nextPort, "/api/auth/csrf", "GET", "", {},
            Math.min(1_000, setupDeadline - Date.now()))
          if (lastResponse.status === 200) { csrfReady = true; break }
        } catch { /* wait for socket */ }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!csrfReady) throw new Error(`RP Next fixture did not become ready: ${JSON.stringify(lastResponse)}\n${output.slice(0, 2_000)}`)

      const compileStartedAt = Date.now()
      let appResponse: HttpResult | undefined
      while (Date.now() < setupDeadline) {
        try {
          appResponse = await http(nextPort, "/app", "GET", "", {}, Math.min(5_000, setupDeadline - Date.now()))
          appCompileReadinessStatus = appResponse.status
          if (appResponse.status === 200) {
            appCompileReadinessMs = Date.now() - compileStartedAt
            return
          }
        } catch { /* keep the fixture readiness failure bounded by beforeAll */ }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      appCompileReadinessMs = Date.now() - compileStartedAt
      throw new Error(`RP Next /app compile readiness failed: ${JSON.stringify({
        status: appResponse?.status ?? null,
        duration_ms: appCompileReadinessMs,
        error_categories: nextErrorCategories(output),
        error_excerpt: safeNextErrorExcerpt(output, [clientSecret, "rp-bff-secret", authSecret]),
      })}`)
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

  it("captures request errors through the real Next instrumentation hook without exposing private error fields", async () => {
    const outputStart = output.length
    const manifestsBefore = await nextManifestMetadata()
    const response = await http(nextPort, "/api/rp-request-error-fixture", "GET", "", {}, 10_000)
    const manifestsAfter = await nextManifestMetadata()
    expect(response.status).toBe(500)
    await expect.poll(() => requestErrorDiagnostics(output.slice(outputStart))
      .find((record) => record.route === "fixture_synthetic"), { timeout: 2_000 }).toBeDefined()
    const record = requestErrorDiagnostics(output.slice(outputStart))
      .find((candidate) => candidate.route === "fixture_synthetic")
    expect(record).toBeDefined()
    expect(Object.keys(record ?? {}).sort()).toEqual([
      "error_class", "error_code", "frames", "method", "route", "route_type", "router_kind",
    ])
    expect(record).toMatchObject({
      error_class: "syntax_error", error_code: "json_unexpected_eof", method: "GET",
      route: "fixture_synthetic", router_kind: "app", route_type: "route",
    })
    expect(record?.frames.length).toBeLessThanOrEqual(8)
    expect(record?.frames.every((frame) => REQUEST_ERROR_FRAME_CATEGORIES.has(frame.category) &&
      (frame.line === null || Number.isSafeInteger(frame.line) && frame.line > 0))).toBe(true)
    expect(JSON.stringify(record)).not.toContain("syntheticsecret-marker")
    expect(output.slice(outputStart)).not.toContain("syntheticsecret-marker")
    const manifestChanges = nextManifestChanges(manifestsBefore, manifestsAfter)
    expect(manifestChanges.some(({ change }) => change === "appeared" || change === "changed_valid")).toBe(true)
    expect(manifestChanges.every(({ change }) => !["changed_invalid", "disappeared", "unavailable"].includes(change))).toBe(true)
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

  it("R147 converges an authenticated cold and reloaded workspace instead of leaving the SSR loading shell", async () => {
    const { signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status).toBe(302)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    await recordProduct(callback)
    expect(callback.status).toBe(303)
    const productCookie = (callback.headers["set-cookie"] as string[] | undefined ?? [])
      .find((cookie) => /^kokoro_product_session=/u.test(cookie))
    expect(productCookie).toBeDefined()
    expect(productCookie).toMatch(/^kokoro_product_session=[^;]+;/u)

    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true })
      context = await browser.newContext()
      const origin = `http://localhost:${nextPort}`
      const productJar = cookieHeader(signin, callback)
      await context.addCookies(productJar.split(/;\s*/u).flatMap((pair) => {
        const separator = pair.indexOf("=")
        return separator > 0 ? [{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: origin }] : []
      }))
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      let sessionRequests = 0
      const sessionStatuses: number[] = []
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/auth/session") sessionRequests += 1
      })
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/auth/session") sessionStatuses.push(response.status())
      })

      const diagnostic = async (stage: string): Promise<string> => {
        const observed = browserDiagnostics.get(page)
        return `${stage} authenticated workspace diagnostic: ${JSON.stringify({
          stage,
          pathname: (() => { try { return new URL(page.url()).pathname } catch { return "<invalid>" } })(),
          document_ready_state: await diagnosticWithin(page.evaluate(() => document.readyState), "unavailable"),
          session_requests: sessionRequests,
          session_response_statuses: sessionStatuses,
          session_requests_pending: Math.max(0, sessionRequests - sessionStatuses.length),
          runtime_loading_count: await diagnosticWithin(page.getByTestId("runtime-loading").count(), -1),
          app_main_count: await diagnosticWithin(page.locator('[data-app-frame-main="true"]').count(), -1),
          composer_count: await diagnosticWithin(page.locator('[data-slot="composer-input"]').count(), -1),
          browser_error_categories: [...observed?.categories ?? []],
          request_failures: observed?.requestFailures ?? [],
          script_responses: observed?.scriptResponses ?? [],
          has_next_runtime: await diagnosticWithin(page.evaluate(() => "next" in window), false),
          has_webpack_chunk_runtime: await diagnosticWithin(page.evaluate(() => "webpackChunk_N_E" in window), false),
          flight_entry_count: await diagnosticWithin(page.evaluate(() => {
            const value = (window as unknown as { __next_f?: unknown }).__next_f
            return Array.isArray(value) ? value.length : 0
          }), -1),
          fixture_app_compile_readiness_ms: appCompileReadinessMs,
          fixture_app_compile_readiness_status: appCompileReadinessStatus,
          next_error_categories: nextErrorCategories(output.slice(outputStart)),
          next_error_excerpt: safeNextErrorExcerpt(output.slice(outputStart), [clientSecret, "rp-bff-secret", authSecret]),
        })}`
      }
      const converge = async (stage: "cold" | "reload"): Promise<void> => {
        const requestBaseline = sessionRequests
        const responseBaseline = sessionStatuses.length
        const deadline = Date.now() + 12_000
        const remaining = (): number => Math.max(1, deadline - Date.now())
        let response: BrowserResponse | null
        try {
          response = stage === "cold"
            ? await page.goto(`${origin}/app`, { waitUntil: "domcontentloaded", timeout: remaining() })
            : await page.reload({ waitUntil: "domcontentloaded", timeout: remaining() })
        } catch (error) {
          throw new AggregateError([error], await diagnostic(`${stage}_document`))
        }
        if (response?.status() !== 200) throw new Error(await diagnostic(`${stage}_document_status`))
        try {
          await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
          await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
        } catch (error) {
          throw new AggregateError([error], await diagnostic(`${stage}_convergence`))
        }
        expect(await page.getByTestId("runtime-loading").count(), await diagnostic(`${stage}_loading_remained`)).toBe(0)
        const stageRequestCount = sessionRequests - requestBaseline
        const stageStatuses = sessionStatuses.slice(responseBaseline)
        expect(stageRequestCount).toBeGreaterThanOrEqual(1)
        expect(stageStatuses).toHaveLength(stageRequestCount)
        expect(stageStatuses.every((status) => status === 200)).toBe(true)
        const composer = page.locator('[data-slot="composer-input"]')
        const value = `r147-${stage}-workspace-ready`
        await composer.fill(value)
        await expect.poll(() => composer.inputValue(), { timeout: remaining() }).toBe(value)
        await composer.fill("")
        await expect.poll(() => composer.inputValue(), { timeout: remaining() }).toBe("")
      }

      await converge("cold")
      await converge("reload")
    } finally {
      try { await context?.close() }
      finally { await browser?.close() }
    }
  }, 45_000)

  it("R150 lets the latest authenticated generation settle after finite focus tasks", async () => {
    const { jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status).toBe(302)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    await recordProduct(callback)
    expect(callback.status).toBe(303)
    const productCookie = (callback.headers["set-cookie"] as string[] | undefined ?? [])
      .find((cookie) => /^kokoro_product_session=/u.test(cookie))
    expect(productCookie).toMatch(/^kokoro_product_session=[^;]+;/u)

    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({
        headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" },
        args: ["--proxy-bypass-list=<-loopback>"],
      })
      context = await browser.newContext()
      await context.addInitScript(() => {
        type BootProbe = {
          init: number
          microtask: number
          domContentLoaded: number
          focusEvents: number
          ticks: number
          loadingSeen: number
          appSeen: number
        }
        const target = window as unknown as { __kokoroBootProbe: BootProbe }
        const probe: BootProbe = {
          init: 1,
          microtask: 0,
          domContentLoaded: 0,
          focusEvents: 0,
          ticks: 0,
          loadingSeen: 0,
          appSeen: 0,
        }
        target.__kokoroBootProbe = probe
        queueMicrotask(() => { probe.microtask = 1 })
        document.addEventListener("DOMContentLoaded", () => { probe.domContentLoaded = 1 }, { once: true })
        window.addEventListener("focus", () => { probe.focusEvents = Math.min(16, probe.focusEvents + 1) })
        const observe = (): void => {
          if (document.querySelector('[data-testid="runtime-loading"]')) probe.loadingSeen = 1
          if (document.querySelector('[data-app-frame-main="true"]')) probe.appSeen = 1
        }
        const observer = new MutationObserver(observe)
        observer.observe(document, { childList: true, subtree: true })
        const heartbeat = window.setInterval(() => {
          probe.ticks = Math.min(100, probe.ticks + 1)
          observe()
          if (probe.appSeen === 1 || probe.ticks === 100) {
            observer.disconnect()
            window.clearInterval(heartbeat)
          }
        }, 100)
      })
      const origin = `http://localhost:${nextPort}`
      await context.addCookies(productCookie === undefined ? [] : [{
        name: "kokoro_product_session",
        value: productCookie.slice("kokoro_product_session=".length).split(";", 1)[0] ?? "",
        url: origin,
      }])
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      const sessionStatuses: number[] = []
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/auth/session") sessionStatuses.push(response.status())
      })
      const heartbeat = async (): Promise<Record<string, number> | null> => diagnosticWithin(page.evaluate(() => {
        const value = (window as unknown as { __kokoroBootProbe?: Record<string, number> }).__kokoroBootProbe
        return value === undefined ? null : { ...value }
      }), null)
      const diagnostic = async (stage: string, response: BrowserResponse | null): Promise<string> =>
        `${await browserProbeDiagnostic(stage, page, response, proxy, outputStart)}; boot probe: ${JSON.stringify({
          heartbeat: await heartbeat(),
          session_statuses: sessionStatuses.slice(0, 8),
        })}`

      proxy.setFault("pending")
      const response = await page.goto(`${origin}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await diagnostic("focus_document", response))
      await requireSessionProbe("focus_pending_probe", 1, page, response, proxy, outputStart)
      if (!await page.getByTestId("runtime-loading").isVisible()) {
        throw new Error(await diagnostic("focus_pending_loading", response))
      }

      const focusBaseline = await heartbeat()
      await page.evaluate(async () => {
        for (let index = 0; index < 8; index += 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 20))
          window.dispatchEvent(new Event("focus"))
        }
      })
      const pendingHeartbeat = await heartbeat()
      expect(pendingHeartbeat).toMatchObject({ init: 1, microtask: 1, domContentLoaded: 1, loadingSeen: 1 })
      expect(pendingHeartbeat?.focusEvents).toBe((focusBaseline?.focusEvents ?? 0) + 8)
      expect((pendingHeartbeat?.ticks ?? 0) > (focusBaseline?.ticks ?? 0)).toBe(true)
      expect(proxy.sessionRequests()).toBe(1)

      proxy.setFault("pass")
      const deadline = Date.now() + 12_000
      const remaining = (): number => Math.max(1, deadline - Date.now())
      proxy.releasePending()
      try {
        await expect.poll(() => sessionStatuses, { timeout: remaining() }).toContain(200)
        await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
        await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
        await expect.poll(() => page.getByTestId("runtime-loading").count(), { timeout: remaining() }).toBe(0)
      } catch (error) {
        throw new AggregateError([error], await diagnostic("focus_release_convergence", response))
      }
      expect(await heartbeat()).toMatchObject({ appSeen: 1 })

      const settledRequests = proxy.sessionRequests()
      const settledResponses = sessionStatuses.length
      const postSettleDeadline = Date.now() + 12_000
      const postSettleRemaining = (): number => Math.max(1, postSettleDeadline - Date.now())
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        window.dispatchEvent(new Event("focus"))
      })
      try {
        await expect.poll(() => proxy.sessionRequests(), { timeout: postSettleRemaining() }).toBe(settledRequests + 1)
        await expect.poll(() => sessionStatuses.length, { timeout: postSettleRemaining() }).toBe(settledResponses + 1)
        expect(sessionStatuses.at(-1)).toBe(200)
        await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: postSettleRemaining() })
        await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: postSettleRemaining() })
        expect(await page.getByTestId("runtime-loading").count()).toBe(0)
      } catch (error) {
        throw new AggregateError([error], await diagnostic("focus_post_settle", response))
      }
    } finally {
      proxy.releasePending()
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 45_000)

  it.each([
    ["theme", "kokoro.theme"],
    ["locale", "kokoro.locale"],
  ] as const)("R150 keeps an authenticated workspace usable when the %s preference is denied", async (_preference, deniedKey) => {
    const { jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status).toBe(302)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    await recordProduct(callback)
    expect(callback.status).toBe(303)
    const productCookie = (callback.headers["set-cookie"] as string[] | undefined ?? [])
      .find((cookie) => /^kokoro_product_session=/u.test(cookie))
    expect(productCookie).toMatch(/^kokoro_product_session=[^;]+;/u)

    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true })
      context = await browser.newContext({ locale: "en-US", colorScheme: "light", viewport: { width: 1440, height: 900 } })
      await context.addInitScript((key) => {
        const originalGetItem = Storage.prototype.getItem
        const originalSetItem = Storage.prototype.setItem
        const target = window as unknown as { __kokoroDeniedPreferenceWrites: number }
        target.__kokoroDeniedPreferenceWrites = 0
        const denied = (): never => { throw new DOMException("preference storage denied", "SecurityError") }
        Storage.prototype.getItem = function (candidate: string): string | null {
          if (candidate === key) return denied()
          return originalGetItem.call(this, candidate)
        }
        Storage.prototype.setItem = function (candidate: string, value: string): void {
          if (candidate === key) {
            target.__kokoroDeniedPreferenceWrites += 1
            denied()
          }
          originalSetItem.call(this, candidate, value)
        }
      }, deniedKey)
      const origin = `http://localhost:${nextPort}`
      await context.addCookies(productCookie === undefined ? [] : [{
        name: "kokoro_product_session",
        value: productCookie.slice("kokoro_product_session=".length).split(";", 1)[0] ?? "",
        url: origin,
      }])
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      let sessionRequests = 0
      const sessionStatuses: number[] = []
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/auth/session") sessionRequests += 1
      })
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/auth/session") sessionStatuses.push(response.status())
      })
      const diagnostic = async (stage: string): Promise<string> => {
        const observed = browserDiagnostics.get(page)
        return `${stage} denied preference diagnostic: ${JSON.stringify({
          denied_key: deniedKey,
          session_requests: sessionRequests,
          session_statuses: sessionStatuses.slice(0, 8),
          loading_count: await diagnosticWithin(page.getByTestId("runtime-loading").count(), -1),
          app_count: await diagnosticWithin(page.locator('[data-app-frame-main="true"]').count(), -1),
          composer_count: await diagnosticWithin(page.locator('[data-slot="composer-input"]').count(), -1),
          browser_error_categories: [...observed?.categories ?? []],
          request_failures: observed?.requestFailures ?? [],
          script_responses: observed?.scriptResponses ?? [],
          next_error_categories: nextErrorCategories(output.slice(outputStart)),
        })}`
      }
      const deadline = Date.now() + 12_000
      const remaining = (): number => Math.max(1, deadline - Date.now())
      const response = await page.goto(`${origin}/app`, { waitUntil: "domcontentloaded", timeout: remaining() })
      if (response?.status() !== 200) throw new Error(await diagnostic("preference_document"))
      try {
        await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
        await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
        await expect.poll(() => page.getByTestId("runtime-loading").count(), { timeout: remaining() }).toBe(0)
      } catch (error) {
        throw new Error(await diagnostic("preference_convergence"), { cause: error })
      }
      expect(sessionRequests).toBeGreaterThanOrEqual(1)
      expect(sessionStatuses).toHaveLength(sessionRequests)
      expect(sessionStatuses.every((status) => status === 200)).toBe(true)

      const interactionDeadline = Date.now() + 10_000
      const interactionRemaining = (): number => Math.max(1, interactionDeadline - Date.now())
      const composer = page.locator('[data-slot="composer-input"]')
      await composer.fill(`r150-${_preference}-storage-denial`, { timeout: interactionRemaining() })
      await expect.poll(() => composer.inputValue(), { timeout: interactionRemaining() }).toContain("storage-denial")
      await composer.fill("", { timeout: interactionRemaining() })
      await expect.poll(() => composer.inputValue(), { timeout: interactionRemaining() }).toBe("")
      await page.getByTestId("rail-utility-account").click({ timeout: interactionRemaining() })
      await page.getByRole("menuitem", { name: /Settings|设置/u }).click({ timeout: interactionRemaining() })
      const appearance = page.getByTestId("settings-appearance")
      await appearance.waitFor({ state: "visible", timeout: interactionRemaining() })
      if (deniedKey === "kokoro.theme") {
        await appearance.getByRole("radio", { name: "Dark" }).click({ timeout: interactionRemaining() })
        await expect.poll(() => page.locator("html").getAttribute("class"), { timeout: interactionRemaining() }).toContain("dark")
        expect(await page.locator("html").getAttribute("lang")).toBe("en-US")
      } else {
        await appearance.getByRole("combobox", { name: /Interface language|界面语言/u }).click({ timeout: interactionRemaining() })
        await page.getByRole("option", { name: /中文|简体中文/u }).click({ timeout: interactionRemaining() })
        await expect.poll(() => page.locator("html").getAttribute("lang"), { timeout: interactionRemaining() }).toBe("zh")
        expect((await page.locator("html").getAttribute("class"))?.split(/\s+/u)).not.toContain("dark")
      }
      expect(await page.evaluate(() =>
        (window as unknown as { __kokoroDeniedPreferenceWrites: number }).__kokoroDeniedPreferenceWrites)).toBe(1)
      expect([...browserDiagnostics.get(page)?.categories ?? []].filter((category) => category.startsWith("page_"))).toEqual([])

      const reloadDeadline = Date.now() + 12_000
      const reloadRemaining = (): number => Math.max(1, reloadDeadline - Date.now())
      const reload = await page.reload({ waitUntil: "domcontentloaded", timeout: reloadRemaining() })
      if (reload?.status() !== 200) throw new Error(await diagnostic("preference_reload_document"))
      try {
        await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: reloadRemaining() })
        await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: reloadRemaining() })
        await expect.poll(() => page.getByTestId("runtime-loading").count(), { timeout: reloadRemaining() }).toBe(0)
      } catch (error) {
        throw new Error(await diagnostic("preference_reload_convergence"), { cause: error })
      }
      expect(await page.locator("html").getAttribute("lang")).toBe("en-US")
      expect((await page.locator("html").getAttribute("class"))?.split(/\s+/u)).not.toContain("dark")
      expect([...browserDiagnostics.get(page)?.categories ?? []].filter((category) => category.startsWith("page_"))).toEqual([])
      const reloadedAppearance = page.getByTestId("settings-appearance")
      await reloadedAppearance.waitFor({ state: "visible", timeout: reloadRemaining() })
      const reloadedLocale = reloadedAppearance.getByRole("combobox", { name: /Interface language|界面语言/u })
      await expect.poll(() => reloadedLocale.textContent(), { timeout: reloadRemaining() }).toMatch(/English/u)
    } finally {
      try { await context?.close() }
      finally { await browser?.close() }
    }
  }, 45_000)

  it("R150 turns complete localStorage denial into a recoverable session alert instead of a private workspace", async () => {
    const { jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status).toBe(302)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    await recordProduct(callback)
    expect(callback.status).toBe(303)
    const productCookie = (callback.headers["set-cookie"] as string[] | undefined ?? [])
      .find((cookie) => /^kokoro_product_session=/u.test(cookie))
    expect(productCookie).toMatch(/^kokoro_product_session=[^;]+;/u)

    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true })
      context = await browser.newContext()
      await context.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get: (): never => { throw new DOMException("local storage denied", "SecurityError") },
        })
      })
      const origin = `http://localhost:${nextPort}`
      await context.addCookies(productCookie === undefined ? [] : [{
        name: "kokoro_product_session",
        value: productCookie.slice("kokoro_product_session=".length).split(";", 1)[0] ?? "",
        url: origin,
      }])
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      let sessionRequests = 0
      const sessionStatuses: number[] = []
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/auth/session") sessionRequests += 1
      })
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/auth/session") sessionStatuses.push(response.status())
      })
      const diagnostic = async (stage: string): Promise<string> => {
        const observed = browserDiagnostics.get(page)
        return `${stage} denied localStorage diagnostic: ${JSON.stringify({
          session_requests: sessionRequests,
          session_statuses: sessionStatuses.slice(0, 8),
          loading_count: await diagnosticWithin(page.getByTestId("runtime-loading").count(), -1),
          alert_count: await diagnosticWithin(page.getByRole("alert").count(), -1),
          app_count: await diagnosticWithin(page.locator('[data-app-frame-main="true"]').count(), -1),
          browser_error_categories: [...observed?.categories ?? []],
          request_failures: observed?.requestFailures ?? [],
          script_responses: observed?.scriptResponses ?? [],
          next_error_categories: nextErrorCategories(output.slice(outputStart)),
        })}`
      }
      const deadline = Date.now() + 12_000
      const remaining = (): number => Math.max(1, deadline - Date.now())
      const response = await page.goto(`${origin}/app`, { waitUntil: "domcontentloaded", timeout: remaining() })
      if (response?.status() !== 200) throw new Error(await diagnostic("storage_denial_document"))
      const retry = page.getByRole("button", { name: /Retry|重试/u })
      const alert = page.getByRole("alert").filter({ has: retry })
      try {
        await alert.waitFor({ state: "visible", timeout: remaining() })
        await expect.poll(() => page.getByTestId("runtime-loading").count(), { timeout: remaining() }).toBe(0)
      } catch (error) {
        throw new Error(await diagnostic("storage_denial_alert"), { cause: error })
      }
      expect(sessionRequests).toBeGreaterThanOrEqual(1)
      expect(sessionStatuses).toHaveLength(sessionRequests)
      expect(sessionStatuses.every((status) => status === 200)).toBe(true)
      expect(await page.locator('[data-app-frame-main="true"]').count()).toBe(0)
      expect(await page.locator('[data-slot="composer-input"]').count()).toBe(0)
    } finally {
      try { await context?.close() }
      finally { await browser?.close() }
    }
  }, 45_000)

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

  it("R143 keeps the conversation, active draft and list stable until an exact-scope DELETE ACK", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    let page: Page | undefined
    holdDeleteSession = true
    deleteSessionStatus = 200
    deleteSessionCommitted = false
    deleteSessionRequests.length = 0
    releaseDeleteSession = undefined
    sessionSnapshotRequests = 0
    sessionBoundaryRequests.length = 0
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      await directList.getByText("Bounded list alpha", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      const conversationA = directList.locator('[data-conversation-id="session-list-a"]')
      await conversationA.click()
      await expect.poll(() => sessionSnapshotRequests, { timeout: 10_000 }).toBe(1)
      expect(sessionBoundaryRequests).toContainEqual({ method: "GET", path: "/v1/sessions/session-list-a" })
      expect(new URL(page.url()).pathname).toBe("/app")
      await expect.poll(() => conversationA.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      await page.getByText("R143 authoritative conversation A body", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      const listRequestsBeforeDelete = proxy.listRequests()
      const composer = page.locator('[data-slot="composer-input"]')
      await composer.waitFor({ state: "visible", timeout: 10_000 })
      const draft = "R143 delayed delete keeps this draft"
      await composer.fill(draft)

      await page.getByRole("button", { name: "Delete chat Bounded list alpha" }).click()
      const dialog = page.getByRole("alertdialog")
      await dialog.getByRole("button", { name: "Delete chat", exact: true }).click()
      await expect.poll(() => deleteSessionRequests.length, { timeout: 10_000 }).toBe(1)

      expect(deleteSessionRequests).toEqual([{
        url: "/v1/sessions/session-list-a?scope=direct",
        idempotencyKey: expect.stringMatching(/^session-mutation:/u),
      }])
      await expect.poll(() => composer.inputValue(), { timeout: 10_000 }).toBe(draft)
      await expect.poll(() => directList.getByText("Bounded list alpha", { exact: true }).count(), { timeout: 10_000 }).toBe(1)
      await expect.poll(() => proxy.listRequests(), { timeout: 10_000 }).toBe(listRequestsBeforeDelete)
      await expect.poll(() => dialog.isVisible(), { timeout: 10_000 }).toBe(true)
      expect(await dialog.getByRole("button", { name: "Delete chat", exact: true }).isDisabled()).toBe(true)

      releaseHeldDeleteSession()
      await expect.poll(() => directList.getByText("Bounded list alpha", { exact: true }).count(), { timeout: 10_000 }).toBe(0)
      await expect.poll(() => proxy.listRequests(), { timeout: 10_000 }).toBe(listRequestsBeforeDelete + 1)
      expect(deleteSessionRequests).toHaveLength(1)
    } catch (error) {
      if (page === undefined) throw error
      throw new AggregateError([error], await deleteFailureDiagnostic("delayed_ack", page))
    } finally {
      holdDeleteSession = false
      releaseHeldDeleteSession()
      releaseDeleteSession = undefined
      deleteSessionStatus = 200
      deleteSessionCommitted = false
      deleteSessionRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 45_000)

  it("R143 preserves the conversation and draft on DELETE 503 with visible recovery and no cancel or refresh", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    let page: Page | undefined
    deleteSessionStatus = 503
    deleteSessionCommitted = false
    deleteSessionRequests.length = 0
    sessionSnapshotRequests = 0
    sessionBoundaryRequests.length = 0
    const pathStart = paths.length
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      await directList.getByText("Bounded list alpha", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      const conversationA = directList.locator('[data-conversation-id="session-list-a"]')
      await conversationA.click()
      await expect.poll(() => sessionSnapshotRequests, { timeout: 10_000 }).toBe(1)
      expect(sessionBoundaryRequests).toContainEqual({ method: "GET", path: "/v1/sessions/session-list-a" })
      expect(new URL(page.url()).pathname).toBe("/app")
      await expect.poll(() => conversationA.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      await page.getByText("R143 authoritative conversation A body", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      const listRequestsBeforeDelete = proxy.listRequests()
      const composer = page.locator('[data-slot="composer-input"]')
      await composer.waitFor({ state: "visible", timeout: 10_000 })
      const draft = "R143 rejected delete keeps this draft"
      await composer.fill(draft)

      await page.getByRole("button", { name: "Delete chat Bounded list alpha" }).click()
      const dialog = page.getByRole("alertdialog")
      await dialog.getByRole("button", { name: "Delete chat", exact: true }).click()
      await expect.poll(() => deleteSessionRequests.length, { timeout: 10_000 }).toBe(1)

      await expect.poll(() => composer.inputValue(), { timeout: 10_000 }).toBe(draft)
      await expect.poll(() => directList.getByText("Bounded list alpha", { exact: true }).count(), { timeout: 10_000 }).toBe(1)
      await expect.poll(() => proxy.listRequests(), { timeout: 10_000 }).toBe(listRequestsBeforeDelete)
      await expect.poll(() => dialog.isVisible(), { timeout: 10_000 }).toBe(true)
      await dialog.getByRole("alert").waitFor({ state: "visible", timeout: 10_000 })
      expect(await dialog.getByRole("button", { name: "Delete chat", exact: true }).isEnabled()).toBe(true)
      expect(paths.slice(pathStart).some((value) => /\/runs\/[^/]+\/control(?:\?|$)/u.test(value))).toBe(false)
      expect(deleteSessionRequests).toHaveLength(1)
    } catch (error) {
      if (page === undefined) throw error
      throw new AggregateError([error], await deleteFailureDiagnostic("service_unavailable", page))
    } finally {
      deleteSessionStatus = 200
      deleteSessionCommitted = false
      deleteSessionRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
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
      const manifestsBefore = await nextManifestMetadata().catch(() => [{ error_code: "metadata_unavailable" }])
      const signout = await http(nextPort, "/api/auth/signout", "POST", form,
        { origin: `http://localhost:${nextPort}`, cookie })
      const manifestsAfter = await nextManifestMetadata().catch(() => [{ error_code: "metadata_unavailable" }])
      if (signout.status !== 200) {
        throw new Error(nextFailureDiagnostic(
          "signout", signout, outputStart, pathStart, manifestsBefore, manifestsAfter,
        ))
      }
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
