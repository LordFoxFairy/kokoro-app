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
import { chromium, type Browser, type BrowserContext, type CDPSession, type Locator, type Page, type Response as BrowserResponse } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// SET32-BEGIN: recorder
type Set32Category = "runtime" | "session_probe" | "document" | "lifecycle" | "handoff"
type Set32EventKind = "browser_request" | "browser_response" | "browser_failed" | "proxy_arrival"
  | "proxy_upstream_response" | "proxy_response" | "helper_start" | "helper_cold_ready"
  | "helper_reload_start" | "helper_reload_end" | "helper_ready" | "helper_failed"
  | "baseline" | "focus_before" | "focus_after" | "handoff_commit" | "handoff_watchdog" | "complete" | "truncated"
type Set32Event = { seq: number; relative_ms: number; kind: Set32EventKind; category: Set32Category; status?: number; request_seq?: number }
type Set32Recorder = {
  record: (kind: Set32EventKind, category: Set32Category, status?: number, requestSeq?: number) => number | undefined
  emit: () => void
}
const set32ProxyOrders = new WeakMap<Server, Set32Recorder>()
const set32PageOrders = new WeakMap<Page, Set32Recorder>()
const set32ProxyRequests = new WeakMap<import("node:http").IncomingMessage, { recorder: Set32Recorder; category: Set32Category; seq: number }>()
function set32Category(pathname: string): Set32Category | undefined {
  if (pathname === "/api/system/runtime-manifest") return "runtime"
  if (pathname === "/api/auth/session") return "session_probe"
  if (["/app", "/login", "/iam/oauth2/authorize", "/api/auth/callback/kokoro-iam"].includes(pathname)) return "document"
  return undefined
}
function set32NativeOrder(testCase: "R175" | "R177"): Set32Recorder | undefined {
  if (process.env.KOKORO_TEST_NATIVE_ORDER !== "1") return undefined
  const startedAt = process.hrtime.bigint()
  const events: Set32Event[] = []
  let sequence = 0
  let truncated = false
  const record: Set32Recorder["record"] = (kind, category, status, requestSeq) => {
    const relativeMs = () => Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000) / 1_000
    if (events.length >= 512) {
      if (!truncated) {
        truncated = true
        events.push({ seq: ++sequence, relative_ms: relativeMs(), kind: "truncated", category: "lifecycle" })
      }
      return undefined
    }
    const seq = ++sequence
    events.push({ seq, relative_ms: relativeMs(), kind, category,
      ...(status === undefined ? {} : { status }), ...(requestSeq === undefined ? {} : { request_seq: requestSeq }) })
    return seq
  }
  return { record, emit: () => {
    record("complete", "lifecycle")
    // These are Node event-observation times, never browser-internal dispatch
    // timestamps. Local request_seq links only within its own layer; there is
    // no shared Browser/proxy ID, so cross-layer correspondence is ambiguous.
    console.log("KOKORO_TEST_NATIVE_ORDER " + JSON.stringify({ test_case: testCase, cross_layer_pairing: "ambiguous", events }))
  } }
}
function set32ObservePage(page: Page, recorder: Set32Recorder | undefined): void {
  if (recorder === undefined) return
  set32PageOrders.set(page, recorder)
  const requests = new WeakMap<import("@playwright/test").Request, number>()
  page.on("request", (request) => {
    const category = set32Category(new URL(request.url()).pathname)
    if (category === undefined) return
    const seq = recorder.record("browser_request", category)
    if (seq !== undefined) requests.set(request, seq)
  })
  page.on("response", (response) => {
    const request = response.request()
    const category = set32Category(new URL(request.url()).pathname)
    if (category !== undefined) recorder.record("browser_response", category, response.status(), requests.get(request))
  })
  page.on("requestfailed", (request) => {
    const category = set32Category(new URL(request.url()).pathname)
    if (category !== undefined) recorder.record("browser_failed", category, undefined, requests.get(request))
  })
}
// SET32-END: recorder
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

type SessionProbeFault = "pass" | "pending" | "pending_body" | "unavailable" | "anonymous"
type SessionBodyDiagnostic = {
  headersFlushed: boolean
  partialWritten: boolean
  closed: boolean
  ended: boolean
  elapsedMs: number | null
  lateTailAttempted: boolean
  lateTailDiscarded: boolean
}

function observeAnonymousSafetyHandoff(): void {
  let sawRuntime = false
  let sentCommit = false
  const snapshot = (phase: "commit" | "watchdog"): void => {
    const composer = document.querySelector('[data-slot="composer-input"]')
    const retry = document.querySelector('[role="alert"] button')
    void fetch("/__fixture/anonymous-handoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phase,
        booting: document.querySelector('[data-server-admitted-shell="true"]') !== null,
        main: document.querySelector('[data-app-frame-main="true"]') !== null,
        composer_disabled: composer instanceof HTMLTextAreaElement && composer.matches(":disabled"),
        all_controls_disabled: [...document.querySelectorAll("button, input, select, textarea")]
          .every((control) => control.matches(":disabled")),
        runtime_loading: document.querySelector('[data-testid="runtime-loading"]') !== null,
        app_frame_loading: document.querySelector('[data-testid="app-frame-loading"]') !== null,
        private_timeline: document.querySelector('[data-slot="conversation-timeline"]') !== null,
        draft_nonempty: composer instanceof HTMLTextAreaElement && composer.value.length > 0,
        alert_visible: document.querySelector('[role="alert"]') !== null,
        retry_visible: retry instanceof HTMLButtonElement && !retry.matches(":disabled"),
      }),
      keepalive: true,
    }).catch(() => undefined)
  }
  const observe = (): void => {
    const composer = document.querySelector('[data-slot="composer-input"]')
    if (composer instanceof HTMLTextAreaElement && !composer.matches(":disabled") &&
      document.querySelector('[data-server-admitted-shell="true"]') === null) sawRuntime = true
    const booting = document.querySelector('[data-server-admitted-shell="true"]') !== null
    if (!sawRuntime || !booting || sentCommit) return
    sentCommit = true
    snapshot("commit")
    window.setTimeout(() => snapshot("watchdog"), 10_500)
  }
  const observer = new MutationObserver(observe)
  observer.observe(document, { childList: true, subtree: true, attributes: true,
    attributeFilter: ["disabled", "data-server-admitted-shell"] })
  document.addEventListener("DOMContentLoaded", observe, { once: true })
}

type NativeNavigationDiagnostic = Readonly<{
  runtime: "ok" | "local_deadline" | "protocol_error" | "exception_details" | "missing_value"
  late: "not_applicable" | "resolved" | "rejected" | "pending"
  elapsed: "under_500ms" | "500_to_2000ms" | "over_2000ms"
  protocol_error: "context_destroyed" | "target_closed" | "session_closed" | "timeout" | "other" | null
  page: "ok" | "deadline" | "protocol_error"
  frame_started: number
  frame_stopped: number
  contexts_cleared: number
  contexts_created: number
}>

type NativeNavigationEvents = {
  frame_started: number
  frame_stopped: number
  contexts_cleared: number
  contexts_created: number
}

async function observeNativeNavigation(cdp: CDPSession): Promise<NativeNavigationEvents> {
  const events = { frame_started: 0, frame_stopped: 0, contexts_cleared: 0, contexts_created: 0 }
  cdp.on("Page.frameStartedLoading", () => { events.frame_started += 1 })
  cdp.on("Page.frameStoppedLoading", () => { events.frame_stopped += 1 })
  cdp.on("Runtime.executionContextsCleared", () => { events.contexts_cleared += 1 })
  cdp.on("Runtime.executionContextCreated", () => { events.contexts_created += 1 })
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")])
  return events
}

async function nativeNavigationDiagnostic(
  cdp: CDPSession,
  events: NativeNavigationEvents,
): Promise<NativeNavigationDiagnostic> {
  const started = Date.now()
  const settled = cdp.send("Runtime.evaluate", {
    expression: "({ diagnostic: true })",
    returnByValue: true,
    awaitPromise: false,
  }).then((value) => ({ state: "resolved" as const, value }), (error: unknown) => ({ state: "rejected" as const, error }))
  const first = await Promise.race([
    settled,
    new Promise<{ state: "deadline" }>((resolve) => setTimeout(() => resolve({ state: "deadline" }), 500)),
  ])
  let observed: typeof first | { state: "pending" } = first
  if (first.state === "deadline") {
    observed = await Promise.race([
      settled,
      new Promise<{ state: "pending" }>((resolve) => setTimeout(() => resolve({ state: "pending" }), 1_500)),
    ])
  }
  const elapsedMs = Date.now() - started
  const elapsed = elapsedMs < 500 ? "under_500ms" : elapsedMs <= 2_000 ? "500_to_2000ms" : "over_2000ms"
  const classifyError = (error: unknown): NativeNavigationDiagnostic["protocol_error"] => {
    const message = error instanceof Error ? error.message.toLowerCase() : ""
    if (message.includes("context") && (message.includes("destroy") || message.includes("not found"))) return "context_destroyed"
    if (message.includes("target") && (message.includes("close") || message.includes("crash"))) return "target_closed"
    if (message.includes("session") && (message.includes("close") || message.includes("detach"))) return "session_closed"
    if (message.includes("timeout") || message.includes("timed out")) return "timeout"
    return "other"
  }
  let runtime: NativeNavigationDiagnostic["runtime"]
  let late: NativeNavigationDiagnostic["late"] = "not_applicable"
  let protocolError: NativeNavigationDiagnostic["protocol_error"] = null
  if (first.state === "deadline") {
    runtime = "local_deadline"
    late = observed.state === "resolved" ? "resolved" : observed.state === "rejected" ? "rejected" : "pending"
    if (observed.state === "rejected") protocolError = classifyError(observed.error)
  } else if (first.state === "rejected") {
    runtime = "protocol_error"
    protocolError = classifyError(first.error)
  } else if (first.value.exceptionDetails !== undefined) runtime = "exception_details"
  else if (first.value.result.value === undefined) runtime = "missing_value"
  else runtime = "ok"

  const page = await Promise.race([
    cdp.send("Page.getFrameTree").then(() => "ok" as const, () => "protocol_error" as const),
    new Promise<"deadline">((resolve) => setTimeout(() => resolve("deadline"), 500)),
  ])
  return { runtime, late, elapsed, protocol_error: protocolError, page, ...events }
}

async function sessionProbeProxy(nextPort: number): Promise<{
  port: number
  server: Server
  close: () => Promise<void>
  setFault: (fault: SessionProbeFault) => void
  releasePending: () => void
  releaseSessionBodies: () => void
  sessionBodyDiagnostics: () => readonly SessionBodyDiagnostic[]
  setLoginPending: (pending: boolean) => void
  releaseLoginRequests: () => void
  forwardLoginRequests: () => void
  heldLoginRequests: () => number
  heldLoginDiagnostics: () => readonly { id: number; method: string; request_category: string; received_at_ms: number }[]
  loginHoldOutcomes: () => readonly { id: number; outcome: "aborted" | "released" }[]
  sessionResponseDiagnostics: () => readonly {
    status: number
    authenticated: boolean | null
    completed_at_ms: number
  }[]
  anonymousHandoffDiagnostics: () => readonly {
    phase: "commit" | "watchdog"
    booting: boolean
    main: boolean
    composer_disabled: boolean
    all_controls_disabled: boolean
    runtime_loading: boolean
    app_frame_loading: boolean
    private_timeline: boolean
    draft_nonempty: boolean
    alert_visible: boolean
    retry_visible: boolean
  }[]
  anonymousHandoffOwnerDiagnostics: () => readonly {
    phase: "commit" | "watchdog"
    session_owner: number
    session_collection: number
    messages: number
    runtime_manifest: number
  }[]
  r176Heartbeats: () => readonly { phase: "before_navigation" | "held_navigation"; ticks: number }[]
  r176HeldDocuments: () => number
  releaseR176HeldDocuments: () => void
  setListBodyPending: (pending: boolean) => void
  releaseListBodies: () => void
  sessionRequests: () => number
  listRequests: () => number
  heldListBodies: () => number
  loginRequests: () => number
  upgradeDiagnostics: () => readonly { path: string; requests: number }[]
  connectDiagnostics: () => Readonly<{ requests: number; established: boolean }>
  resourceDiagnostics: () => readonly {
    path: string
    requests: number
    methods: Readonly<Record<string, number>>
    request_categories: Readonly<Record<string, number>>
    upstream_statuses: readonly number[]
  }[]
}> {
  let fault: SessionProbeFault = "pass"
  let probes = 0
  let lists = 0
  let logins = 0
  let holdLogin = false
  let holdListBody = false
  const pending = new Set<{ request: import("node:http").IncomingMessage; response: import("node:http").ServerResponse }>()
  const sessionBodies: {
    response: import("node:http").ServerResponse
    diagnostic: SessionBodyDiagnostic
  }[] = []
  const pendingLogins = new Set<{
    request: import("node:http").IncomingMessage
    response: import("node:http").ServerResponse
    id: number
    requestCategory: string
    receivedAtMs: number
    released: boolean
  }>()
  const loginHoldOutcomes: { id: number; outcome: "aborted" | "released" }[] = []
  let nextLoginHoldId = 1
  const sessionResponses: { status: number; authenticated: boolean | null; completed_at_ms: number }[] = []
  const anonymousHandoffs: {
    phase: "commit" | "watchdog"
    booting: boolean
    main: boolean
    composer_disabled: boolean
    all_controls_disabled: boolean
    runtime_loading: boolean
    app_frame_loading: boolean
    private_timeline: boolean
    draft_nonempty: boolean
    alert_visible: boolean
    retry_visible: boolean
  }[] = []
  const anonymousHandoffOwners: {
    phase: "commit" | "watchdog"
    session_owner: number
    session_collection: number
    messages: number
    runtime_manifest: number
  }[] = []
  const r176Heartbeats: { phase: "before_navigation" | "held_navigation"; ticks: number }[] = []
  const r176HeldDocuments = new Set<import("node:http").ServerResponse>()
  const pendingListBodies = new Set<{ response: import("node:http").ServerResponse; tail: Buffer }>()
  const resources = new Map<string, {
    requests: number
    methods: Record<string, number>
    requestCategories: Record<string, number>
    upstreamStatuses: number[]
  }>()
  const upgrades = new Map<string, number>()
  const upstreamRequests = new Set<ReturnType<typeof httpRequest>>()
  const tunnelSockets = new Set<Duplex>()
  let connectRequests = 0
  let connectEstablished = false

  const forward = (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse): void => {
    if (response.destroyed) return
    const target = new URL(request.url ?? "/", `http://localhost:${nextPort}`)
    const resource = resources.get(target.pathname) ?? {
      requests: 0, methods: {}, requestCategories: {}, upstreamStatuses: [],
    }
    resource.requests += 1
    const method = request.method ?? "UNKNOWN"
    resource.methods[method] = (resource.methods[method] ?? 0) + 1
    const requestCategory = request.headers["sec-fetch-dest"] === "document"
      ? "document"
      : request.headers.rsc === "1" ? "rsc"
      : request.headers["next-router-prefetch"] === "1" ? "router_prefetch" : "document_or_other"
    resource.requestCategories[requestCategory] = (resource.requestCategories[requestCategory] ?? 0) + 1
    resources.set(target.pathname, resource)
    const upstream = httpRequest({ hostname: "127.0.0.1", port: nextPort, method: request.method,
      path: `${target.pathname}${target.search}`, headers: { ...request.headers, host: `localhost:${nextPort}` } }, (reply) => {
      if (resource.upstreamStatuses.length < 8) resource.upstreamStatuses.push(reply.statusCode ?? 0)
      // SET32-BEGIN: proxy-upstream-response
      const nativeRequest = set32ProxyRequests.get(request)
      nativeRequest?.recorder.record("proxy_upstream_response", nativeRequest.category, reply.statusCode ?? 0, nativeRequest.seq)
      // SET32-END: proxy-upstream-response
      if (request.method === "GET" && target.pathname === "/api/auth/session") {
        const chunks: Buffer[] = []
        let size = 0
        reply.on("data", (chunk: Buffer) => {
          if (size + chunk.length <= 64 * 1024) chunks.push(chunk)
          size += chunk.length
        })
        reply.once("end", () => {
          let authenticated: boolean | null = null
          if (size <= 64 * 1024) {
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { authenticated?: unknown }
              if (typeof parsed.authenticated === "boolean") authenticated = parsed.authenticated
            } catch { /* closed diagnostic only */ }
          }
          if (sessionResponses.length < 8) {
            sessionResponses.push({ status: reply.statusCode ?? 0, authenticated, completed_at_ms: Date.now() })
          }
        })
      }
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
    // SET32-BEGIN: proxy-arrival
    const nativeOrder = set32ProxyOrders.get(server)
    const nativeCategory = set32Category(target.pathname)
    if (nativeOrder !== undefined && nativeCategory !== undefined) {
      const seq = nativeOrder.record("proxy_arrival", nativeCategory)
      if (seq !== undefined) set32ProxyRequests.set(request, { recorder: nativeOrder, category: nativeCategory, seq })
      response.once("finish", () => nativeOrder.record("proxy_response", nativeCategory, response.statusCode, seq))
    }
    // SET32-END: proxy-arrival
    if (request.method === "GET" && target.pathname === "/__fixture/r176-static-control") {
      const navigate = target.searchParams.get("navigate") === "1"
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
      response.end(`<!doctype html><html><body><main>control</main><script>
        let ticks = 0;
        const report = (phase) => fetch('/__fixture/r176-heartbeat', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({phase, ticks: Math.min(ticks, 20)}), keepalive: true }).catch(() => undefined);
        report('before_navigation');
        setInterval(() => { ticks += 1; report(${navigate ? "'held_navigation'" : "'before_navigation'"}); }, 100);
        ${navigate ? "setTimeout(() => location.replace('/__fixture/r176-held-document'), 100);" : ""}
      </script></body></html>`)
      return
    }
    if (request.method === "POST" && target.pathname === "/__fixture/r176-heartbeat") {
      const chunks: Buffer[] = []
      let size = 0
      request.on("data", (chunk: Buffer) => { size += chunk.length; if (size <= 256) chunks.push(chunk) })
      request.once("end", () => {
        if (size <= 256 && r176Heartbeats.length < 32) {
          try {
            const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
            if ((value.phase === "before_navigation" || value.phase === "held_navigation") &&
              typeof value.ticks === "number" && Number.isInteger(value.ticks) && value.ticks >= 0 && value.ticks <= 20) {
              r176Heartbeats.push({ phase: value.phase, ticks: value.ticks })
            }
          } catch { /* closed fixture observation */ }
        }
        response.writeHead(204, { "cache-control": "no-store" })
        response.end()
      })
      return
    }
    if (request.method === "GET" && target.pathname === "/__fixture/r176-held-document") {
      r176HeldDocuments.add(response)
      response.once("close", () => r176HeldDocuments.delete(response))
      return
    }
    if (request.method === "POST" && target.pathname === "/__fixture/anonymous-handoff") {
      const chunks: Buffer[] = []
      let size = 0
      request.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size <= 1024) chunks.push(chunk)
      })
      request.once("end", () => {
        if (size <= 1024 && anonymousHandoffs.length < 4) {
          try {
            const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
            const keys = ["booting", "main", "composer_disabled", "all_controls_disabled", "runtime_loading", "app_frame_loading",
              "private_timeline", "draft_nonempty", "alert_visible", "retry_visible"] as const
            if ((value.phase === "commit" || value.phase === "watchdog") &&
              Object.keys(value).length === keys.length + 1 && keys.every((key) => typeof value[key] === "boolean")) {
              anonymousHandoffs.push({ phase: value.phase,
                ...Object.fromEntries(keys.map((key) => [key, value[key]])) } as typeof anonymousHandoffs[number])
              const count = (predicate: (path: string) => boolean): number => [...resources.entries()]
                .filter(([path]) => predicate(path)).reduce((total, [, resource]) => total + resource.requests, 0)
              // SET32-BEGIN: handoff
              set32ProxyOrders.get(server)?.record(value.phase === "commit" ? "handoff_commit" : "handoff_watchdog", "handoff")
              // SET32-END: handoff
              anonymousHandoffOwners.push({
                phase: value.phase,
                session_owner: count((path) => path.startsWith("/api/session/")),
                session_collection: count((path) => path === "/api/session/sessions"),
                messages: count((path) => /^\/api\/session\/sessions\/[^/]+\/messages$/u.test(path)),
                runtime_manifest: count((path) => path === "/api/system/runtime-manifest"),
              })
            }
          } catch { /* closed fixture observation */ }
        }
        response.writeHead(204, { "cache-control": "no-store" })
        response.end()
      })
      return
    }
    if (target.pathname === "/login") {
      logins += 1
      if (holdLogin) {
        const requestCategory = request.headers["sec-fetch-dest"] === "document"
          ? "document" : request.headers.rsc === "1" ? "rsc" : "document_or_other"
        const held = { request, response, id: nextLoginHoldId++, requestCategory, receivedAtMs: Date.now(), released: false }
        pendingLogins.add(held)
        response.once("close", () => {
          pendingLogins.delete(held)
          if (loginHoldOutcomes.length < 8) {
            loginHoldOutcomes.push({ id: held.id, outcome: held.released ? "released" : "aborted" })
          }
        })
        return
      }
    }
    if (request.method === "GET" && target.pathname === "/api/session/sessions") lists += 1
    if (request.method === "GET" && target.pathname === "/api/auth/session") {
      probes += 1
      if (fault === "pending") {
        const held = { request, response }
        pending.add(held)
        response.once("close", () => pending.delete(held))
        return
      }
      if (fault === "pending_body") {
        const startedAt = Date.now()
        const diagnostic: SessionBodyDiagnostic = {
          headersFlushed: false, partialWritten: false, closed: false, ended: false,
          elapsedMs: null, lateTailAttempted: false, lateTailDiscarded: false,
        }
        sessionBodies.push({ response, diagnostic })
        response.once("close", () => {
          diagnostic.closed = true
          diagnostic.ended = response.writableEnded
          diagnostic.elapsedMs = Date.now() - startedAt
        })
        response.writeHead(200, {
          "content-type": "application/json", "cache-control": "no-store",
          "x-kokoro-test-session-body": "pending",
        })
        response.flushHeaders()
        diagnostic.headersFlushed = true
        response.write('{"authenticated":', (error) => { diagnostic.partialWritten = error == null })
        return
      }
      if (fault === "unavailable") {
        response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" })
        response.end(JSON.stringify({ error: { code: "product_session_unavailable", message: "fixture unavailable" } }))
        return
      }
      if (fault === "anonymous") {
        response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
        response.end(JSON.stringify({ authenticated: false }))
        if (sessionResponses.length < 8) {
          sessionResponses.push({ status: 200, authenticated: false, completed_at_ms: Date.now() })
        }
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
      for (const held of sessionBodies) held.response.destroy()
      sessionBodies.length = 0
      for (const held of pendingLogins) {
        held.request.destroy()
        held.response.destroy()
      }
      pendingLogins.clear()
      for (const response of r176HeldDocuments) response.destroy()
      r176HeldDocuments.clear()
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
    releaseSessionBodies: () => {
      for (const held of sessionBodies) {
        if (held.diagnostic.lateTailAttempted) continue
        held.diagnostic.lateTailAttempted = true
        held.diagnostic.lateTailDiscarded = held.response.destroyed
        // Retain the closed response for the oracle: an aborted body must not
        // reopen a socket or deliver its contradictory anonymous tail.
        if (!held.response.destroyed) held.response.end("false}")
      }
    },
    sessionBodyDiagnostics: () => sessionBodies.map(({ diagnostic }) => ({ ...diagnostic })),
    setLoginPending: (next) => { holdLogin = next },
    releaseLoginRequests: () => {
      holdLogin = false
      for (const held of pendingLogins) {
        pendingLogins.delete(held)
        if (!held.response.destroyed) {
          held.released = true
          held.response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" })
          held.response.end(JSON.stringify({ error: { code: "fixture_login_navigation_unavailable" } }))
        }
      }
    },
    forwardLoginRequests: () => {
      holdLogin = false
      for (const held of pendingLogins) {
        pendingLogins.delete(held)
        if (!held.response.destroyed) {
          held.released = true
          forward(held.request, held.response)
        }
      }
    },
    heldLoginRequests: () => pendingLogins.size,
    heldLoginDiagnostics: () => [...pendingLogins].slice(0, 8).map((held) => ({
      id: held.id,
      method: held.request.method ?? "UNKNOWN",
      request_category: held.requestCategory,
      received_at_ms: held.receivedAtMs,
    })),
    loginHoldOutcomes: () => loginHoldOutcomes.slice(),
    sessionResponseDiagnostics: () => sessionResponses.slice(),
    anonymousHandoffDiagnostics: () => anonymousHandoffs.slice(),
    anonymousHandoffOwnerDiagnostics: () => anonymousHandoffOwners.slice(),
    r176Heartbeats: () => r176Heartbeats.slice(),
    r176HeldDocuments: () => r176HeldDocuments.size,
    releaseR176HeldDocuments: () => {
      for (const response of r176HeldDocuments) {
        r176HeldDocuments.delete(response)
        if (!response.destroyed) {
          response.writeHead(204, { "cache-control": "no-store" })
          response.end()
        }
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
      methods: value.methods,
      request_categories: value.requestCategories,
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
  const refreshRequests: string[] = []
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
  let deleteSessionBCommitted = false
  let renameSessionStatus = 200
  const renameSessionRequests: { path: string; body: string }[] = []
  let renameLifecycleFixture = false
  let renameLifecycleLostAck = false
  let renameLifecycleTitle = "Bounded list beta"
  let failNextRenameLifecycleList = false
  let releaseHeldRenameA: (() => void) | undefined
  const releaseRenameA = (): void => {
    const release = releaseHeldRenameA
    if (release !== undefined) release()
  }
  const renameLifecycleListResponses: { status: number; title: string }[] = []
  let releaseDeleteSession: (() => void) | undefined
  const releaseHeldDeleteSession = (): void => {
    const release = releaseDeleteSession
    if (release !== undefined) release()
  }
  const deleteSessionRequests: { url: string; idempotencyKey: string | undefined }[] = []
  let projectDeleteFixtureEnabled = false
  let projectDeleteStatus = 200
  let projectDeleteHeld = false
  let projectDeleteCommitted = false
  let releaseProjectDelete: (() => void) | undefined
  const projectDeleteRequests: { url: string; idempotencyKey: string | undefined }[] = []
  const projectDeleteScopeGets: string[][] = []
  const projectDeleteProject = "project_44444444-4444-4444-8444-444444444444"
  const projectDeleteConversationA = "conv_cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  const projectDeleteConversationB = "conv_dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  const projectDeleteDirectConversation = "conv_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
  const releaseHeldProjectDelete = (): void => {
    const release = releaseProjectDelete
    releaseProjectDelete = undefined
    release?.()
  }
  let sessionSnapshotRequests = 0
  let coldSnapshotStatus: 200 | 503 | undefined
  const coldSnapshotResponses: number[] = []
  const sessionBoundaryRequests: { method: string; path: string }[] = []
  type MoveFixtureResponse = {
    status: number
    body: unknown
    contentType?: string
    requestId?: string
    retryAfter?: string
  }
  let moveFixtureResponse: MoveFixtureResponse | undefined
  let moveUiFixtureEnabled = false
  let moveBindingFixtureEnabled = false
  let moveBindingProjectRef: string | null = null
  const moveBindingScopeGets: {
    scope: string
    bindingAtRead: string | null
    sessionIds: string[]
  }[] = []
  const moveBindingSnapshotGets: {
    sessionId: string
    bindingAtRead: string | null
    messageIds: string[]
  }[] = []
  let moveFixtureMode: "respond" | "hold" | "close" | "commit-close" = "respond"
  let releaseHeldMove: (() => void) | undefined
  const releaseMove = (): void => { const release = releaseHeldMove; releaseHeldMove = undefined; release?.() }
  const moveBoundaryRequests: { method: string; path: string; idempotencyKey: string | undefined; body: string }[] = []
  const moveConversationA = "conv_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const moveConversationB = "conv_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  const moveProjectA = "project_22222222-2222-4222-8222-222222222222"
  const moveProjectB = "project_33333333-3333-4333-8333-333333333333"
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
    failureDiagnostic?: (stage: string) => Promise<string>,
  ): Promise<void> {
    try {
      await expect.poll(() => proxy.sessionRequests(), { timeout: 10_000 }).toBe(expected)
    } catch {
      throw new Error(failureDiagnostic === undefined
        ? await browserProbeDiagnostic(stage, page, response, proxy, outputStart)
        : await failureDiagnostic(stage))
    }
  }

  async function requireStableAuthenticatedWorkspace(
    stage: string,
    page: Page,
    response: BrowserResponse | null,
    proxy: Awaited<ReturnType<typeof sessionProbeProxy>>,
    outputStart: number,
    deadline: number,
    failureDiagnostic?: (stage: string) => Promise<string>,
  ): Promise<void> {
    const remaining = (): number => Math.max(1, deadline - Date.now())
    // SET32-BEGIN: helper-start
    const nativeOrder = set32PageOrders.get(page)
    nativeOrder?.record("helper_start", "lifecycle")
    // SET32-END: helper-start
    try {
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
      await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
      await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
      await expect.poll(() => page.locator('[data-slot="composer-input"]').isEnabled(), { timeout: remaining() }).toBe(true)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
      await expect.poll(() => page.getByTestId("runtime-loading").count(), { timeout: remaining() }).toBe(0)
      expect(new URL(page.url()).pathname).toBe("/app")

      // SET32-BEGIN: helper-cold-ready
      nativeOrder?.record("helper_cold_ready", "lifecycle")
      // SET32-END: helper-cold-ready
      const sessionsBeforeReload = proxy.sessionRequests()
      // SET32-BEGIN: helper-reload-start
      nativeOrder?.record("helper_reload_start", "lifecycle")
      // SET32-END: helper-reload-start
      const reloadResponse = await page.reload({ waitUntil: "domcontentloaded", timeout: remaining() })
      // SET32-BEGIN: helper-reload-end
      nativeOrder?.record("helper_reload_end", "lifecycle", reloadResponse?.status())
      // SET32-END: helper-reload-end
      if (reloadResponse?.status() !== 200) {
        throw new Error(`reload document status ${reloadResponse?.status() ?? "missing"}`)
      }
      await expect.poll(() => proxy.sessionRequests(), { timeout: remaining() }).toBeGreaterThan(sessionsBeforeReload)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
      await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
      await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
      await expect.poll(() => page.locator('[data-slot="composer-input"]').isEnabled(), { timeout: remaining() }).toBe(true)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
      await expect.poll(() => page.getByTestId("runtime-loading").count(), { timeout: remaining() }).toBe(0)
      expect(new URL(page.url()).pathname).toBe("/app")
      // SET32-BEGIN: helper-ready
      nativeOrder?.record("helper_ready", "lifecycle")
      // SET32-END: helper-ready
    } catch (error) {
      // SET32-BEGIN: helper-failed
      nativeOrder?.record("helper_failed", "lifecycle")
      // SET32-END: helper-failed
      const diagnostic = failureDiagnostic === undefined
        ? await browserProbeDiagnostic(stage, page, response, proxy, outputStart)
        : await failureDiagnostic(stage)
      throw new Error(diagnostic, { cause: error })
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
              const refresh = body.get("refresh_token")
              expect(["refresh-opaque", "refresh-rotated"]).toContain(refresh)
              refreshRequests.push(refresh!)
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
              ? { data: { user_id: identityUserId, tenant_id: identityTenantId, platform_admin: false, access_token: "must-not-pass" }, meta: { request_id: "req_fixture" } }
              : { data: { user_id: identityUserId, tenant_id: identityTenantId, platform_admin: false }, meta: { request_id: "req_fixture" } }
            : { error: { code: "identity_rejected", message: "rejected", retryable: false } })
          if (slowIdentity) {
            const timer = setTimeout(() => response.end(payload), 6_000)
            response.once("close", () => clearTimeout(timer))
          } else response.end(payload)
          return
        }
        if (request.method === "GET" && request.url === "/v1/projects" && projectDeleteFixtureEnabled) {
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({ data: { projects: [
            { id: projectDeleteProject, name: "Delete fixture project", slug: "delete-fixture-project", description: "", created_at: "2026-10-03T10:00:00.000Z", updated_at: "2026-10-03T10:00:00.000Z" },
          ] }, meta: { request_id: "req_project_delete_projects" } }))
          return
        }
        if (request.method === "GET" && request.url === "/v1/projects" && moveUiFixtureEnabled) {
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({ data: { projects: [
            { id: moveProjectA, name: "Move target alpha", slug: "move-target-alpha", description: "", created_at: "2026-10-03T10:00:00.000Z", updated_at: "2026-10-03T10:00:00.000Z" },
            { id: moveProjectB, name: "Move target beta", slug: "move-target-beta", description: "", created_at: "2026-10-03T10:00:00.000Z", updated_at: "2026-10-03T10:00:00.000Z" },
          ] }, meta: { request_id: "req_move_projects" } }))
          return
        }
        if (request.method === "GET" && request.url === "/v1/sessions?scope=direct") {
          expect(request.headers.cookie).toBeUndefined()
          expect(request.headers["x-kokoro-service"]).toBe("web-bff")
          expect(request.headers["x-kokoro-internal-secret"]).toBe("rp-bff-secret")
          expect(["Bearer access-opaque", "Bearer access-rotated"]).toContain(request.headers.authorization)
          const effectiveSessionListStatus = renameLifecycleFixture && failNextRenameLifecycleList
            ? 503
            : sessionListStatus
          if (renameLifecycleFixture) {
            renameLifecycleListResponses.push({ status: effectiveSessionListStatus, title: renameLifecycleTitle })
            failNextRenameLifecycleList = false
          }
          const moveSessions = [
            ...(moveBindingProjectRef === null ? [
              { session_id: moveConversationA, title: "Move conversation alpha", updated_at: "2026-10-03T12:00:00.000Z" },
            ] : []),
            { session_id: moveConversationB, title: "Move conversation beta", updated_at: "2026-10-03T11:00:00.000Z" },
          ]
          if (moveBindingFixtureEnabled) {
            moveBindingScopeGets.push({
              scope: "direct",
              bindingAtRead: moveBindingProjectRef,
              sessionIds: moveSessions.map((session) => session.session_id),
            })
          }
          response.writeHead(effectiveSessionListStatus, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify(effectiveSessionListStatus === 200 ? {
            data: { sessions: projectDeleteFixtureEnabled ? [
              { session_id: projectDeleteDirectConversation, title: "Direct conversation C", updated_at: "2026-10-03T09:00:00.000Z" },
            ] : moveUiFixtureEnabled ? moveSessions : [
              ...(deleteSessionCommitted ? [] : [
                { session_id: "session-list-a", title: "Bounded list alpha", updated_at: "2026-10-03T12:00:00.000Z" },
              ]),
              ...(deleteSessionBCommitted ? [] : [
                { session_id: "session-list-b", title: renameLifecycleFixture ? renameLifecycleTitle : "Bounded list beta", updated_at: "2026-10-03T11:00:00.000Z" },
              ]),
            ], next_cursor: null },
            meta: { request_id: "req_r141_list" },
          } : { error: { code: "service_unavailable", message: "fixture unavailable", retryable: true } }))
          return
        }
        if (request.method === "GET" && request.url === `/v1/sessions?project_ref=${projectDeleteProject}` && projectDeleteFixtureEnabled) {
          const sessions = [
            ...(projectDeleteCommitted ? [] : [
              { session_id: projectDeleteConversationA, title: "Project conversation A", updated_at: "2026-10-03T12:00:00.000Z" },
            ]),
            { session_id: projectDeleteConversationB, title: "Project conversation B", updated_at: "2026-10-03T11:00:00.000Z" },
          ]
          projectDeleteScopeGets.push(sessions.map((session) => session.session_id))
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({
            data: { sessions, next_cursor: null },
            meta: { request_id: "req_project_delete_list" },
          }))
          return
        }
        const moveProjectScope = request.url?.match(/^\/v1\/sessions\?project_ref=(project_[0-9a-f-]+)$/u)?.[1]
        if (request.method === "GET" && moveBindingFixtureEnabled &&
          (moveProjectScope === moveProjectA || moveProjectScope === moveProjectB)) {
          const projectSessions = moveProjectScope === moveProjectA && moveBindingProjectRef === moveProjectA ? [
            { session_id: moveConversationA, title: "Move conversation alpha", updated_at: "2026-10-03T12:00:00.000Z" },
          ] : []
          moveBindingScopeGets.push({
            scope: `project:${moveProjectScope}`,
            bindingAtRead: moveBindingProjectRef,
            sessionIds: projectSessions.map((session) => session.session_id),
          })
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({
            data: {
              sessions: projectSessions,
              next_cursor: null,
            },
            meta: { request_id: "req_move_binding_project_list" },
          }))
          return
        }
        const defaultFixtureMovePath = "/v1/sessions/conv_11111111-1111-4111-8111-111111111111/move"
        const fixtureMovePath = request.url?.match(/^\/v1\/sessions\/(conv_[0-9a-f-]+)\/move(?:\?.*)?$/u)?.[0]?.split("?")[0]
        if (request.method === "POST" && fixtureMovePath !== undefined &&
          (fixtureMovePath === defaultFixtureMovePath || moveUiFixtureEnabled)) {
          const chunks: Buffer[] = []
          request.on("data", (chunk: Buffer) => chunks.push(chunk))
          request.on("end", () => {
            const configured = moveFixtureResponse
            moveBoundaryRequests.push({
              method: request.method ?? "<unknown>",
              path: request.url ?? "<unknown>",
              idempotencyKey: request.headers["idempotency-key"] as string | undefined,
              body: Buffer.concat(chunks).toString("utf8"),
            })
            expect(request.headers.cookie).toBeUndefined()
            expect(request.headers["x-kokoro-service"]).toBe("web-bff")
            expect(request.headers["x-kokoro-internal-secret"]).toBe("rp-bff-secret")
            expect(["Bearer access-opaque", "Bearer access-rotated"]).toContain(request.headers.authorization)
            if (request.url !== fixtureMovePath) {
              response.writeHead(400, {
                "content-type": "application/json",
                "cache-control": "no-store",
                "x-request-id": "req_move_owner_invalid_query",
              })
              response.end(JSON.stringify({
                error: { code: "invalid_move_request", message: "query is not allowed", retryable: false },
              }))
              return
            }
            expect(configured).toBeDefined()
            const headers: Record<string, string> = {
              "content-type": configured?.contentType ?? "application/json",
              "cache-control": "no-store",
            }
            if (configured?.requestId !== undefined) headers["x-request-id"] = configured.requestId
            if (configured?.retryAfter !== undefined) headers["retry-after"] = configured.retryAfter
            const settle = (): void => {
              if (moveBindingFixtureEnabled && configured?.status === 200) {
                const parsedBody = JSON.parse(moveBoundaryRequests.at(-1)?.body ?? "null") as { target_project_id?: unknown } | null
                const configuredBody = configured.body as {
                  data?: { session_id?: unknown; project_ref?: unknown }
                } | null
                const pathSessionId = fixtureMovePath.slice("/v1/sessions/".length, -"/move".length)
                const targetProjectId = parsedBody?.target_project_id
                if (
                  (typeof targetProjectId === "string" || targetProjectId === null) &&
                  configuredBody?.data?.session_id === pathSessionId &&
                  configuredBody.data.project_ref === targetProjectId
                ) {
                  moveBindingProjectRef = targetProjectId
                }
              }
              if (moveFixtureMode === "close" || moveFixtureMode === "commit-close") {
                response.destroy()
                return
              }
              response.writeHead(configured?.status ?? 500, headers)
              response.end(JSON.stringify(configured?.body ?? { error: { code: "fixture_unconfigured" } }))
            }
            if (moveFixtureMode === "hold") releaseHeldMove = settle
            else settle()
          })
          return
        }
        if (request.method === "GET" && request.url === "/v1/sessions/session-no-meta") {
          response.writeHead(200, {
            "content-type": "application/json", "cache-control": "no-store", "x-request-id": "req_non_move",
          })
          response.end(JSON.stringify({ data: { session_id: "session-no-meta" } }))
          return
        }
        if (request.method === "GET" && moveUiFixtureEnabled &&
          (request.url === `/v1/sessions/${moveConversationA}` || request.url === `/v1/sessions/${moveConversationB}`)) {
          const sessionId = request.url.slice("/v1/sessions/".length)
          const moveMessages = moveBindingFixtureEnabled && sessionId === moveConversationA ? [{
            message_id: "message-move-binding-a",
            role: "user",
            content: "R192 binding survives the filtered view move",
            status: "completed",
            created_at: "2026-10-03T12:00:00.000Z",
          }] : []
          if (moveBindingFixtureEnabled) {
            moveBindingSnapshotGets.push({
              sessionId,
              bindingAtRead: moveBindingProjectRef,
              messageIds: moveMessages.map((message) => message.message_id),
            })
          }
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({ data: { session: {
            session_id: sessionId, title: sessionId === moveConversationA ? "Move conversation alpha" : "Move conversation beta",
            owner_id: "user-one", created_at: "2026-10-03T11:59:00.000Z", updated_at: "2026-10-03T12:00:00.000Z",
          }, messages: moveMessages, execution_process: null, files: [], deliveries: [], deliveries_has_more: false, event_watermark: null },
          meta: { request_id: "req_move_snapshot" } }))
          return
        }
        if (request.method === "GET" && projectDeleteFixtureEnabled &&
          request.url === `/v1/sessions/${projectDeleteConversationA}`) {
          sessionSnapshotRequests += 1
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({
            data: {
              session: {
                session_id: projectDeleteConversationA,
                title: "Project conversation A",
                owner_id: "user-one",
                created_at: "2026-10-03T11:59:00.000Z",
                updated_at: "2026-10-03T12:00:00.000Z",
              },
              messages: [{
                message_id: "message-project-delete-a",
                role: "user",
                content: "R231 authoritative project conversation A body",
                status: "completed",
                created_at: "2026-10-03T12:00:00.000Z",
              }],
              execution_process: null,
              files: [],
              deliveries: [],
              deliveries_has_more: false,
              event_watermark: null,
            },
            meta: { request_id: "req_project_delete_snapshot" },
          }))
          return
        }
        if (
          request.method === "GET" &&
          (request.url === "/v1/sessions/session-list-a" || request.url === "/v1/sessions/session-list-a?scope=direct" ||
            request.url === "/v1/sessions/session-list-b" || request.url === "/v1/sessions/session-list-b?scope=direct")
        ) {
          const sessionId = request.url.includes("session-list-b") ? "session-list-b" : "session-list-a"
          const title = sessionId === "session-list-a" ? "Bounded list alpha" : "Bounded list beta"
          sessionSnapshotRequests += 1
          if (sessionId === "session-list-a" && coldSnapshotStatus !== undefined) {
            coldSnapshotResponses.push(coldSnapshotStatus)
            if (coldSnapshotStatus === 503) {
              response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" })
              response.end(JSON.stringify({ error: { code: "service_unavailable", message: "Snapshot temporarily unavailable" },
                meta: { request_id: "req_r229_cold_snapshot" } }))
              return
            }
          }
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({
            data: {
              session: {
                session_id: sessionId,
                title,
                owner_id: "user-one",
                created_at: "2026-10-03T11:59:00.000Z",
                updated_at: "2026-10-03T12:00:00.000Z",
              },
              messages: [{
                message_id: sessionId === "session-list-a" ? "message-r143-user-a" : "message-r188-user-b",
                role: "user",
                content: sessionId === "session-list-a"
                  ? "R143 authoritative conversation A body"
                  : "R188 authoritative conversation B body",
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
        if (request.method === "PATCH" && request.url === "/v1/sessions/session-list-b/title") {
          const chunks: Buffer[] = []
          request.on("data", (chunk: Buffer) => chunks.push(chunk))
          request.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8")
            renameSessionRequests.push({ path: request.url ?? "<unknown>", body })
            if (renameLifecycleFixture) {
              const ordinal = renameSessionRequests.length
              const requestedTitle = (JSON.parse(body) as { title: string }).title
              if (renameLifecycleLostAck && ordinal === 1) {
                renameLifecycleTitle = requestedTitle
                response.destroy()
                return
              }
              const send = (status: number): void => {
                if (status === 200) renameLifecycleTitle = requestedTitle
                response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
                response.end(JSON.stringify(status === 200
                  ? { data: { ok: true }, meta: { request_id: `req_r190_rename_${ordinal}` } }
                  : { error: { code: "service_unavailable", message: "fixture unavailable", retryable: true } }))
              }
              if (ordinal === 1) releaseHeldRenameA = () => { releaseHeldRenameA = undefined; send(200) }
              else send(ordinal === 2 ? 503 : 200)
              return
            }
            response.writeHead(renameSessionStatus, { "content-type": "application/json", "cache-control": "no-store" })
            response.end(JSON.stringify(renameSessionStatus === 200
              ? { data: { ok: true }, meta: { request_id: "req_r188_rename" } }
              : { error: { code: "service_unavailable", message: "fixture unavailable", retryable: true } }))
          })
          return
        }
        if (request.method === "DELETE" && request.url?.startsWith("/v1/sessions/session-list-b")) {
          deleteSessionRequests.push({
            url: request.url,
            idempotencyKey: typeof request.headers["idempotency-key"] === "string"
              ? request.headers["idempotency-key"]
              : undefined,
          })
          deleteSessionBCommitted = true
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
          response.end(JSON.stringify({ data: { status: "deleted" }, meta: { request_id: "req_r188_delete_b" } }))
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
        if (request.method === "DELETE" && projectDeleteFixtureEnabled &&
          request.url === `/v1/sessions/${projectDeleteConversationA}?project_ref=${projectDeleteProject}`) {
          projectDeleteRequests.push({
            url: request.url,
            idempotencyKey: typeof request.headers["idempotency-key"] === "string"
              ? request.headers["idempotency-key"]
              : undefined,
          })
          const send = (): void => {
            if (response.destroyed) return
            response.writeHead(projectDeleteStatus, { "content-type": "application/json", "cache-control": "no-store" })
            if (projectDeleteStatus === 200) {
              projectDeleteCommitted = true
              response.end(JSON.stringify({ data: { status: "deleted" }, meta: { request_id: "req_project_delete" } }))
            } else {
              response.end(JSON.stringify({ error: { code: "service_unavailable", message: "fixture unavailable", retryable: true } }))
            }
          }
          if (projectDeleteHeld) releaseProjectDelete = send
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
          const anonymousRedirectReady = appResponse.status === 307 &&
            appResponse.headers.location === "/login?return_to=%2Fapp" &&
            !appResponse.body.includes('data-testid="runtime-loading"')
          if (appResponse.status === 200 || anonymousRedirectReady) {
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

  async function authenticatedProductJar(): Promise<string> {
    const { signin, jar, location } = await start()
    const authorize = await http(nextPort, new URL(location).pathname + new URL(location).search)
    expect(authorize.status).toBe(302)
    const callback = await http(nextPort, authorize.headers.location as string, "GET", "", { cookie: jar })
    await recordProduct(callback)
    expect(callback.status).toBe(303)
    expect(callback.headers.location).toBe("/app")
    expect((callback.headers["set-cookie"] as string[] | undefined ?? [])
      .some((cookie) => cookie.startsWith("kokoro_product_session="))).toBe(true)
    return cookieHeader(signin, callback)
  }

  async function admitBrowserContext(context: BrowserContext): Promise<void> {
    const jar = await authenticatedProductJar()
    const origin = `http://localhost:${nextPort}`
    await context.addCookies(jar.split(/;\s*/u).flatMap((pair) => {
      const separator = pair.indexOf("=")
      return separator > 0 ? [{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: origin }] : []
    }))
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

  function expectServerFirstAnonymousRedirect(response: HttpResult, expectedTarget = "/app"): void {
    const loginLocation = `/login?${new URLSearchParams({ return_to: expectedTarget })}`
    expect(response.body).not.toContain('data-testid="runtime-loading"')
    if (response.status >= 300 && response.status < 400) {
      expect(response.headers.location).toBe(loginLocation)
      return
    }
    expect(response.status).toBe(200)
    const escapedLocation = loginLocation.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    expect(response.body).toMatch(new RegExp(`(?:NEXT_REDIRECT[^<]{0,512}${escapedLocation}|<meta[^>]+url=${escapedLocation})(?=[;\\s"'<]|$)`, "u"))
  }

  it("R167 redirects an anonymous initial app document before rendering the client loading gate", async () => {
    const response = await http(nextPort, "/app", "GET", "", {}, 10_000)
    expectServerFirstAnonymousRedirect(response)
  })

  it("R167 applies the same server-first anonymous redirect to a nested app document", async () => {
    const response = await http(nextPort, "/app/skills", "GET", "", {}, 10_000)
    expectServerFirstAnonymousRedirect(response, "/app/skills")
  })

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

  it("R162 projects strict Move owner responses through real Next without widening generic envelopes", async () => {
    const productJar = await authenticatedProductJar()
    const sessionId = "conv_11111111-1111-4111-8111-111111111111"
    const projectId = "project_22222222-2222-4222-8222-222222222222"
    const projectCommandId = "move-r162-project-intent"
    const directCommandId = "move-r162-direct-intent"
    const path = `/api/session/sessions/${sessionId}/move`
    const upstreamPath = `/v1/sessions/${sessionId}/move`
    const postMove = (targetProjectId: string | null, commandId: string): Promise<HttpResult> => http(
      nextPort,
      path,
      "POST",
      JSON.stringify({ target_project_id: targetProjectId }),
      { cookie: productJar, origin: `http://localhost:${nextPort}`,
        "content-type": "application/json", "idempotency-key": commandId },
      10_000,
    )

    moveBoundaryRequests.length = 0
    for (const [index, [targetProjectId, commandId]] of ([
      [projectId, projectCommandId],
      [null, directCommandId],
    ] as const).entries()) {
      moveFixtureResponse = {
        status: 200,
        requestId: `req_move_success_${index}`,
        body: { data: { session_id: sessionId, project_ref: targetProjectId } },
      }
      const response = await postMove(targetProjectId, commandId)
      expect(response.status).toBe(200)
      expect(headerValue(response.headers, "x-request-id")).toBe(`req_move_success_${index}`)
      expect(JSON.parse(response.body)).toEqual({ session_id: sessionId, project_ref: targetProjectId })
    }
    expect(moveBoundaryRequests).toEqual([
      { method: "POST", path: upstreamPath, idempotencyKey: projectCommandId,
        body: JSON.stringify({ target_project_id: projectId }) },
      { method: "POST", path: upstreamPath, idempotencyKey: directCommandId,
        body: JSON.stringify({ target_project_id: null }) },
    ])

    moveFixtureResponse = {
      status: 429,
      requestId: "req move rate limited",
      retryAfter: "7",
      body: { error: { code: "session_rate_limited", message: "rate limited", retryable: true } },
    }
    const rateLimited = await postMove(projectId, "move-r162-rate-limited-intent")
    expect(rateLimited.status).toBe(429)
    expect(headerValue(rateLimited.headers, "x-request-id")).toBe("req move rate limited")
    expect(headerValue(rateLimited.headers, "retry-after")).toBe("7")
    expect(JSON.parse(rateLimited.body)).toEqual({
      error: { code: "session_rate_limited", message: "rate limited", retryable: true },
    })

    const invalidOwnerResponses: readonly (readonly [string, MoveFixtureResponse])[] = [
      ["move-r162-invalid-success-extra", { status: 200, requestId: "req_move_extra",
        body: { data: { session_id: sessionId, project_ref: projectId }, extra: true } }],
      ["move-r162-invalid-missing-request-id",
        { status: 200, body: { data: { session_id: sessionId, project_ref: projectId } } }],
      ["move-r162-invalid-session-id", { status: 200, requestId: "req_move_invalid_identity",
        body: { data: { session_id: "session_alias", project_ref: projectId } } }],
      ["move-r162-invalid-status-code", { status: 409, requestId: "req_move_bad_graph",
        body: { error: { code: "session_not_found", message: "wrong status", retryable: false } } }],
      ["move-r162-invalid-undeclared-code", { status: 503, requestId: "req_move_undeclared_code",
        body: { error: { code: "product_tenant_not_configured", message: "not in public graph", retryable: false } } }],
      ["move-r162-invalid-error-extra", { status: 409, requestId: "req_move_error_extra",
        body: { error: { code: "idempotency_conflict", message: "extra", retryable: false, extra: true } } }],
      ["move-r162-invalid-retry-after", { status: 429, requestId: "req_move_bad_retry", retryAfter: "0",
        body: { error: { code: "session_rate_limited", message: "bad retry", retryable: true } } }],
    ]
    for (const [commandId, configured] of invalidOwnerResponses) {
      moveFixtureResponse = configured
      const response = await postMove(projectId, commandId)
      expect(response.status).toBe(502)
      expect(JSON.parse(response.body)).toMatchObject({ error: { code: "bff_bad_response" } })
    }

    const nonMove = await http(nextPort, "/api/session/sessions/session-no-meta", "GET", "", { cookie: productJar })
    expect(nonMove.status).toBe(502)
    expect(JSON.parse(nonMove.body)).toMatchObject({ error: { code: "bff_bad_response" } })
  }, 60_000)

  it("R164 treats a normalized bare query as canonical but rejects a nonempty Move query locally", async () => {
    const productJar = await authenticatedProductJar()
    const sessionId = "conv_11111111-1111-4111-8111-111111111111"
    const projectId = "project_22222222-2222-4222-8222-222222222222"
    const bareBoundaryStart = moveBoundaryRequests.length
    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_bare_query_normalized",
      body: { data: { session_id: sessionId, project_ref: projectId } },
    }

    const bare = await http(
      nextPort,
      `/api/session/sessions/${sessionId}/move?`,
      "POST",
      JSON.stringify({ target_project_id: projectId }),
      { cookie: productJar, origin: `http://localhost:${nextPort}`,
        "content-type": "application/json", "idempotency-key": "move-r164-bare-query" },
      10_000,
    )

    expect(bare.status).toBe(200)
    expect(headerValue(bare.headers, "x-request-id")).toBe("req_move_bare_query_normalized")
    expect(JSON.parse(bare.body)).toEqual({ session_id: sessionId, project_ref: projectId })
    expect(moveBoundaryRequests.slice(bareBoundaryStart)).toEqual([{
      method: "POST",
      path: `/v1/sessions/${sessionId}/move`,
      idempotencyKey: "move-r164-bare-query",
      body: JSON.stringify({ target_project_id: projectId }),
    }])

    const queryBoundaryStart = moveBoundaryRequests.length
    const unexpectedQuery = await http(
      nextPort,
      `/api/session/sessions/${sessionId}/move?unexpected=1`,
      "POST",
      JSON.stringify({ target_project_id: projectId }),
      { cookie: productJar, origin: `http://localhost:${nextPort}`,
        "content-type": "application/json", "idempotency-key": "move-r164-nonempty-query" },
      10_000,
    )
    expect(unexpectedQuery.status).toBe(400)
    expect(JSON.parse(unexpectedQuery.body)).toMatchObject({ error: { code: "invalid_move_request" } })
    expect(moveBoundaryRequests).toHaveLength(queryBoundaryStart)
  }, 60_000)

  it("R164 accepts only the application/json media type for strict Move owner responses", async () => {
    const productJar = await authenticatedProductJar()
    const sessionId = "conv_11111111-1111-4111-8111-111111111111"
    const projectId = "project_22222222-2222-4222-8222-222222222222"
    const path = `/api/session/sessions/${sessionId}/move`
    const postMove = (commandId: string): Promise<HttpResult> => http(
      nextPort,
      path,
      "POST",
      JSON.stringify({ target_project_id: projectId }),
      { cookie: productJar, origin: `http://localhost:${nextPort}`,
        "content-type": "application/json", "idempotency-key": commandId },
      10_000,
    )
    const validBody = { data: { session_id: sessionId, project_ref: projectId } }

    for (const [commandId, contentType] of [
      ["move-r164-json-suffix", "application/jsonx"],
      ["move-r164-json-substring", "text/plain; profile=application/json"],
    ] as const) {
      moveFixtureResponse = { status: 200, requestId: `req_${commandId}`, contentType, body: validBody }
      const response = await postMove(commandId)
      expect(response.status).toBe(502)
      expect(JSON.parse(response.body)).toMatchObject({ error: { code: "bff_bad_response" } })
    }

    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_json_charset",
      contentType: "application/json; charset=utf-8",
      body: validBody,
    }
    const valid = await postMove("move-r164-json-charset")
    expect(valid.status).toBe(200)
    expect(headerValue(valid.headers, "x-request-id")).toBe("req_move_json_charset")
    expect(JSON.parse(valid.body)).toEqual(validBody.data)
  }, 60_000)

  it("R147 converges an authenticated cold and reloaded workspace instead of leaving the SSR loading shell", async () => {
    const refreshBaseline = refreshRequests.length
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

    const productJar = cookieHeader(signin, callback)
    const admittedDocument = await http(nextPort, "/app", "GET", "", { cookie: productJar })
    expect(admittedDocument.status).toBe(200)
    expect(admittedDocument.body).not.toContain('data-testid="runtime-loading"')
    expect(admittedDocument.body).toContain('data-app-frame-main="true"')
    expect(admittedDocument.body).toContain('data-slot="composer-input"')

    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true })
      const origin = `http://localhost:${nextPort}`
      const cookies = productJar.split(/;\s*/u).flatMap((pair) => {
        const separator = pair.indexOf("=")
        return separator > 0 ? [{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: origin }] : []
      })
      const noScriptContext = await browser.newContext({ javaScriptEnabled: false })
      try {
        await noScriptContext.addCookies(cookies)
        const noScriptPage = await noScriptContext.newPage()
        const noScriptResponse = await noScriptPage.goto(`${origin}/app`, { waitUntil: "domcontentloaded", timeout: 12_000 })
        expect(noScriptResponse?.status()).toBe(200)
        await noScriptPage.locator('[data-app-frame-main="true"]').waitFor({ state: "visible" })
        expect(await noScriptPage.locator('[data-app-frame-main="true"]').isVisible()).toBe(true)
        await noScriptPage.locator('[data-slot="composer-input"]').waitFor({ state: "visible" })
        expect(await noScriptPage.locator('[data-slot="composer-input"]').isVisible()).toBe(true)
        expect(await noScriptPage.locator('[data-slot="composer-input"]').isDisabled()).toBe(true)
        expect(await noScriptPage.getByTestId("runtime-loading").count()).toBe(0)
        expect(await noScriptPage.getByTestId("app-frame-loading").count()).toBe(0)
      } finally {
        await noScriptContext.close()
      }
      context = await browser.newContext()
      await context.addCookies(cookies)
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
          await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
          await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
          await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
          expect(await page.locator('[data-slot="composer-input"]').isEnabled()).toBe(true)
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
      expect(refreshRequests.slice(refreshBaseline)).toEqual(["refresh-opaque"])
      await converge("reload")
      expect(refreshRequests.slice(refreshBaseline)).toEqual(["refresh-opaque", "refresh-rotated"])
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
          if ((probe.appSeen === 1 && document.querySelector('[data-server-admitted-shell="true"]') === null) || probe.ticks === 100) {
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
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "visible" })
      expect(await page.locator('[data-app-frame-main="true"]').isVisible()).toBe(true)
      expect(await page.locator('[data-slot="composer-input"]').isVisible()).toBe(true)
      expect(await page.locator('[data-slot="composer-input"]').isDisabled()).toBe(true)
      expect(await page.getByTestId("runtime-loading").count()).toBe(0)
      expect(await page.getByTestId("app-frame-loading").count()).toBe(0)
      expect(proxy.resourceDiagnostics()
        .filter(({ path }) => path.startsWith("/api/session/") || path === "/api/system/runtime-manifest")
        .reduce((total, resource) => total + resource.requests, 0)).toBe(0)

      const focusBaseline = await heartbeat()
      await page.evaluate(async () => {
        for (let index = 0; index < 8; index += 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 20))
          window.dispatchEvent(new Event("focus"))
        }
      })
      const pendingHeartbeat = await heartbeat()
      expect(pendingHeartbeat).toMatchObject({ init: 1, microtask: 1, domContentLoaded: 1, loadingSeen: 0, appSeen: 1 })
      expect(pendingHeartbeat?.focusEvents).toBe((focusBaseline?.focusEvents ?? 0) + 8)
      expect((pendingHeartbeat?.ticks ?? 0) > (focusBaseline?.ticks ?? 0)).toBe(true)
      expect(proxy.sessionRequests()).toBe(1)

      proxy.setFault("pass")
      const deadline = Date.now() + 12_000
      const remaining = (): number => Math.max(1, deadline - Date.now())
      proxy.releasePending()
      try {
        await expect.poll(() => sessionStatuses, { timeout: remaining() }).toContain(200)
        await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
        await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
        await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
        expect(await page.locator('[data-slot="composer-input"]').isEnabled()).toBe(true)
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
        await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
        await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: remaining() })
        await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: remaining() })
        expect(await page.locator('[data-slot="composer-input"]').isEnabled()).toBe(true)
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
        await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: reloadRemaining() })
        await page.locator('[data-app-frame-main="true"]').waitFor({ state: "visible", timeout: reloadRemaining() })
        await page.locator('[data-slot="composer-input"]').waitFor({ state: "visible", timeout: reloadRemaining() })
        expect(await page.locator('[data-slot="composer-input"]').isEnabled()).toBe(true)
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
      await admitBrowserContext(context)
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await browserProbeDiagnostic("pending_document", page, response, proxy, outputStart))
      await requireSessionProbe("pending_probe_barrier", 1, page, response, proxy, outputStart)
      if (!await page.locator('[data-server-admitted-shell="true"]').isVisible()) {
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
      const recoveryDeadline = Date.now() + 18_000
      const recoveryBudget = (): number => Math.max(1, recoveryDeadline - Date.now())
      await retry.click()
      await expect.poll(() => proxy.sessionRequests(), { timeout: recoveryBudget() }).toBeGreaterThanOrEqual(2)
      expect(proxy.loginRequests()).toBe(0)
      proxy.releasePending()
      await requireStableAuthenticatedWorkspace(
        "pending_recovery", page, response, proxy, outputStart, recoveryDeadline,
      )
      await expect.poll(() => alert.count(), { timeout: recoveryBudget() }).toBe(0)
      await context.close()
    } finally {
      proxy.releasePending()
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 60_000)

  it("R227 aborts an unfinished 200 session body and recovers on Retry without accepting its late anonymous tail", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: BrowserContext | undefined
    const outputStart = output.length
    try {
      proxy.setFault("pending_body")
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" },
        args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      const bodyResponses: BrowserResponse[] = []
      let failedBodies = 0
      let finishedBodies = 0
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/auth/session" &&
          response.headers()["x-kokoro-test-session-body"] === "pending") bodyResponses.push(response)
      })
      page.on("requestfailed", (request) => {
        if (bodyResponses.some((response) => response.request() === request)) failedBodies += 1
      })
      page.on("requestfinished", (request) => {
        if (bodyResponses.some((response) => response.request() === request)) finishedBodies += 1
      })
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await browserProbeDiagnostic(
        "session_body_document", page, response, proxy, outputStart,
      ))
      await requireSessionProbe("session_body_probe", 1, page, response, proxy, outputStart)
      await expect.poll(() => bodyResponses.length, { timeout: 10_000 }).toBe(1)
      expect(bodyResponses[0]?.status()).toBe(200)
      await expect.poll(() => proxy.sessionBodyDiagnostics()).toEqual([{
        headersFlushed: true, partialWritten: true, closed: false, ended: false,
        elapsedMs: null, lateTailAttempted: false, lateTailDiscarded: false,
      }])
      expect(await page.locator('[data-server-admitted-shell="true"]').isVisible()).toBe(true)
      expect(await page.locator('[data-slot="composer-input"]').isEnabled()).toBe(false)
      expect(await page.locator('[data-slot="conversation-timeline"]').count()).toBe(0)
      expect(proxy.resourceDiagnostics().filter(({ path }) => path.startsWith("/api/session/") ||
        path === "/api/system/runtime-manifest")).toEqual([])

      const retry = page.getByRole("button", { name: /Retry|重试/u })
      const alert = page.getByRole("alert").filter({ has: retry })
      await alert.waitFor({ timeout: 12_000 })
      await expect.poll(() => failedBodies).toBe(1)
      await expect.poll(() => proxy.sessionBodyDiagnostics()[0]?.closed).toBe(true)
      const aborted = proxy.sessionBodyDiagnostics()[0]
      expect(aborted).toMatchObject({ ended: false, lateTailAttempted: false })
      expect(aborted?.elapsedMs).toBeGreaterThanOrEqual(9_000)
      expect(aborted?.elapsedMs).toBeLessThanOrEqual(12_000)
      expect(finishedBodies).toBe(0)
      expect(proxy.sessionRequests()).toBe(1)
      expect(proxy.loginRequests()).toBe(0)
      expect(new URL(page.url()).pathname).toBe("/app")
      expect(await page.locator('[data-app-frame-main="true"]').count()).toBe(0)

      proxy.setFault("pass")
      const recoveryDeadline = Date.now() + 18_000
      const remaining = (): number => Math.max(1, recoveryDeadline - Date.now())
      await retry.click()
      await expect.poll(() => proxy.sessionRequests(), { timeout: remaining() }).toBe(2)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: remaining() })
      const composer = page.locator('[data-slot="composer-input"]')
      await expect.poll(() => composer.isEnabled(), { timeout: remaining() }).toBe(true)
      await expect.poll(() => alert.count(), { timeout: remaining() }).toBe(0)
      await composer.fill("r227-session-body-recovered")
      proxy.releaseSessionBodies()
      expect(proxy.sessionBodyDiagnostics()[0]).toMatchObject({
        closed: true, ended: false, lateTailAttempted: true, lateTailDiscarded: true,
      })
      // Observe subsequent browser turns in the same document before reload.
      // The old body is transport-cancelled, not a synthetic stale callback.
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
      expect(await composer.inputValue()).toBe("r227-session-body-recovered")
      expect(await composer.isEnabled()).toBe(true)
      expect(await alert.count()).toBe(0)
      expect(proxy.sessionRequests()).toBe(2)
      expect(proxy.loginRequests()).toBe(0)
      expect(bodyResponses).toHaveLength(1)
      expect(failedBodies).toBe(1)
      expect(finishedBodies).toBe(0)
      await composer.fill("")
      await requireStableAuthenticatedWorkspace(
        "session_body_recovery", page, response, proxy, outputStart, recoveryDeadline,
      )
      expect(proxy.loginRequests()).toBe(0)
    } finally {
      proxy.releaseSessionBodies()
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R139 keeps a 503 session probe on an explicit retry surface instead of redirecting to login", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    const outputStart = output.length
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      proxy.setFault("unavailable")
      const context = await browser.newContext()
      await admitBrowserContext(context)
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
      const recoveryDeadline = Date.now() + 15_000
      const recoveryBudget = (): number => Math.max(1, recoveryDeadline - Date.now())
      await retry.click()
      await expect.poll(() => proxy.sessionRequests(), { timeout: recoveryBudget() }).toBeGreaterThanOrEqual(2)
      expect(proxy.loginRequests()).toBe(0)
      await requireStableAuthenticatedWorkspace(
        "unavailable_recovery", page, response, proxy, outputStart, recoveryDeadline,
      )
      await context.close()
    } finally {
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 60_000)

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
      const terminalDeadline = Date.now() + 18_000
      const terminalBudget = (): number => Math.max(1, terminalDeadline - Date.now())
      try { await expect.poll(() => proxy.loginRequests(), { timeout: terminalBudget() }).toBeGreaterThan(0) }
      catch { throw new Error(await browserProbeDiagnostic("anonymous_login", page, response, proxy, outputStart)) }
      expect(proxy.sessionRequests()).toBeGreaterThanOrEqual(1)
      await requireStableAuthenticatedWorkspace(
        "anonymous_terminal", page, response, proxy, outputStart, terminalDeadline,
      )
      await context.close()
    } finally {
      try { await browser?.close() }
      finally { await proxy.close() }
    }
  }, 60_000)

  it("R175 removes private Runtime before a server-admitted document hands anonymous control to native login", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    // SET32-BEGIN: R175-recorder
    const nativeOrder = set32NativeOrder("R175")
    if (nativeOrder !== undefined) set32ProxyOrders.set(proxy.server, nativeOrder)
    // SET32-END: R175-recorder
    let browser: Browser | undefined
    let context: BrowserContext | undefined
    const outputStart = output.length
    try {
      proxy.setLoginPending(true)
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await context.addInitScript(observeAnonymousSafetyHandoff)
      await admitBrowserContext(context)
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      // SET32-BEGIN: R175-browser
      set32ObservePage(page, nativeOrder)
      // SET32-END: R175-browser
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await browserProbeDiagnostic(
        "anonymous_handoff_document", page, response, proxy, outputStart,
      ))
      const runtimeDeadline = Date.now() + 12_000
      await requireStableAuthenticatedWorkspace(
        "anonymous_handoff_runtime", page, response, proxy, outputStart, runtimeDeadline,
      )
      const composer = page.locator('[data-slot="composer-input"]')
      await composer.fill("private-draft-must-not-survive-anonymous-handoff")
      const ownerRequests = (): number => proxy.resourceDiagnostics()
        .filter(({ path }) => path.startsWith("/api/session/") || path === "/api/system/runtime-manifest")
        .reduce((total, resource) => total + resource.requests, 0)
      const ownerBaseline = ownerRequests()
      // SET32-BEGIN: R175-baseline
      nativeOrder?.record("baseline", "lifecycle")
      // SET32-END: R175-baseline
      const probeBaseline = proxy.sessionRequests()

      proxy.setFault("anonymous")
      // SET32-BEGIN: R175-focus-before
      nativeOrder?.record("focus_before", "lifecycle")
      // SET32-END: R175-focus-before
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      // SET32-BEGIN: R175-focus-after
      nativeOrder?.record("focus_after", "lifecycle")
      // SET32-END: R175-focus-after
      await expect.poll(() => proxy.sessionRequests(), { timeout: 10_000 }).toBe(probeBaseline + 1)
      await expect.poll(() => proxy.anonymousHandoffDiagnostics().length, { timeout: 10_000 }).toBe(1)
      expect(proxy.anonymousHandoffDiagnostics()[0]).toEqual({
        phase: "commit",
        booting: true,
        main: true,
        composer_disabled: true,
        all_controls_disabled: true,
        runtime_loading: false,
        app_frame_loading: false,
        private_timeline: false,
        draft_nonempty: false,
        alert_visible: false,
        retry_visible: false,
      })
      expect(ownerRequests()).toBe(ownerBaseline)
      await expect.poll(() => proxy.heldLoginRequests(), { timeout: 5_000 }).toBe(1)
      expect(proxy.heldLoginDiagnostics()[0]).toMatchObject({ method: "GET", request_category: "document" })
      expect(proxy.loginRequests()).toBe(1)
    } finally {
      // SET32-BEGIN: R175-emit
      nativeOrder?.emit()
      // SET32-END: R175-emit
      proxy.releaseLoginRequests()
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R177 keeps anonymous native handoff data-free without reviving a visible retry interstitial", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    // SET32-BEGIN: R177-recorder
    const nativeOrder = set32NativeOrder("R177")
    if (nativeOrder !== undefined) set32ProxyOrders.set(proxy.server, nativeOrder)
    // SET32-END: R177-recorder
    let browser: Browser | undefined
    let context: BrowserContext | undefined
    const outputStart = output.length
    try {
      proxy.setLoginPending(true)
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await context.addInitScript(observeAnonymousSafetyHandoff)
      await admitBrowserContext(context)
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      // SET32-BEGIN: R177-browser
      set32ObservePage(page, nativeOrder)
      // SET32-END: R177-browser
      const response = await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      if (response?.status() !== 200) throw new Error(await browserProbeDiagnostic(
        "no_interstitial_document", page, response, proxy, outputStart,
      ))
      await requireStableAuthenticatedWorkspace(
        "no_interstitial_runtime", page, response, proxy, outputStart, Date.now() + 12_000,
      )
      await page.locator('[data-slot="composer-input"]').fill("private-draft-must-be-removed-before-native-login")
      const ownerRequests = (): number => proxy.resourceDiagnostics()
        .filter(({ path }) => path.startsWith("/api/session/") || path === "/api/system/runtime-manifest")
        .reduce((total, resource) => total + resource.requests, 0)
      const ownerSnapshot = () => ({
        session_owner: proxy.resourceDiagnostics().filter(({ path }) => path.startsWith("/api/session/"))
          .reduce((total, resource) => total + resource.requests, 0),
        session_collection: proxy.resourceDiagnostics().find(({ path }) => path === "/api/session/sessions")?.requests ?? 0,
        messages: proxy.resourceDiagnostics().filter(({ path }) => /^\/api\/session\/sessions\/[^/]+\/messages$/u.test(path))
          .reduce((total, resource) => total + resource.requests, 0),
        runtime_manifest: proxy.resourceDiagnostics().find(({ path }) => path === "/api/system/runtime-manifest")?.requests ?? 0,
      })
      const ownerBaseline = ownerRequests()
      // SET32-BEGIN: R177-baseline
      nativeOrder?.record("baseline", "lifecycle")
      // SET32-END: R177-baseline
      const ownerBeforeHandoff = ownerSnapshot()
      const probeBaseline = proxy.sessionRequests()
      const resource = (path: string) => proxy.resourceDiagnostics().find((candidate) => candidate.path === path)
      const appDocumentsBeforeHandoff = resource("/app")?.request_categories.document ?? 0

      proxy.setFault("anonymous")
      // SET32-BEGIN: R177-focus-before
      nativeOrder?.record("focus_before", "lifecycle")
      // SET32-END: R177-focus-before
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      // SET32-BEGIN: R177-focus-after
      nativeOrder?.record("focus_after", "lifecycle")
      // SET32-END: R177-focus-after
      await expect.poll(() => proxy.sessionRequests(), { timeout: 10_000 }).toBe(probeBaseline + 1)
      await expect.poll(() => proxy.heldLoginRequests(), { timeout: 5_000 }).toBe(1)
      await expect.poll(
        () => proxy.anonymousHandoffDiagnostics().filter(({ phase }) => phase === "watchdog").length,
        { timeout: 12_000 },
      ).toBe(1)
      const expectedSafeShell = {
        booting: true,
        main: true,
        composer_disabled: true,
        all_controls_disabled: true,
        runtime_loading: false,
        app_frame_loading: false,
        private_timeline: false,
        draft_nonempty: false,
        alert_visible: false,
        retry_visible: false,
      }
      expect(proxy.anonymousHandoffDiagnostics()).toEqual([
        { phase: "commit", ...expectedSafeShell },
        { phase: "watchdog", ...expectedSafeShell },
      ])
      console.log("KOKORO_TEST_R178_HANDOFF_OWNER_DIAGNOSTIC " + JSON.stringify({
        before_handoff: ownerBeforeHandoff,
        at_beacons: proxy.anonymousHandoffOwnerDiagnostics(),
        after_watchdog: ownerSnapshot(),
      }))
      expect(ownerRequests()).toBe(ownerBaseline)
      expect(proxy.loginRequests()).toBe(1)
      expect(proxy.heldLoginDiagnostics()[0]).toMatchObject({ method: "GET", request_category: "document" })

      proxy.setFault("pass")
      proxy.forwardLoginRequests()
      const recoveryDeadline = Date.now() + 18_000
      await requireStableAuthenticatedWorkspace(
        "no_interstitial_recovery", page, response, proxy, outputStart, recoveryDeadline,
      )
      expect(resource("/login")?.upstream_statuses).toContain(302)
      expect(resource("/iam/oauth2/authorize")?.upstream_statuses).toContain(302)
      expect(resource("/api/auth/callback/kokoro-iam")?.upstream_statuses).toContain(303)
      expect((resource("/app")?.request_categories.document ?? 0) - appDocumentsBeforeHandoff).toBeGreaterThanOrEqual(2)
      expect(proxy.sessionResponseDiagnostics().at(-1)).toMatchObject({ status: 200, authenticated: true })
      const composer = page.locator('[data-slot="composer-input"]')
      await composer.fill("r177-native-login-recovered")
      await expect.poll(() => composer.inputValue(), { timeout: Math.max(1, recoveryDeadline - Date.now()) })
        .toBe("r177-native-login-recovered")
      await composer.fill("")
    } finally {
      // SET32-BEGIN: R177-emit
      nativeOrder?.emit()
      // SET32-END: R177-emit
      proxy.releaseLoginRequests()
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R176 classifies Runtime and Page observability across a held native document navigation", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let baselineContext: BrowserContext | undefined
    let heldContext: BrowserContext | undefined
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      baselineContext = await browser.newContext()
      const baselinePage = await baselineContext.newPage()
      const baselineCdp = await baselineContext.newCDPSession(baselinePage)
      const baselineEvents = await observeNativeNavigation(baselineCdp)
      const baselineResponse = await baselinePage.goto(
        `http://localhost:${nextPort}/__fixture/r176-static-control?navigate=0`,
        { waitUntil: "domcontentloaded", timeout: 5_000 },
      )
      expect(baselineResponse?.status()).toBe(200)
      await expect.poll(() => proxy.r176Heartbeats().length, { timeout: 2_000 }).toBeGreaterThan(0)
      const baseline = await nativeNavigationDiagnostic(baselineCdp, baselineEvents)
      expect(baseline.runtime).toBe("ok")
      expect(baseline.page).toBe("ok")

      heldContext = await browser.newContext()
      const heldPage = await heldContext.newPage()
      const heldCdp = await heldContext.newCDPSession(heldPage)
      const heldEvents = await observeNativeNavigation(heldCdp)
      const heldResponse = await heldPage.goto(
        `http://localhost:${nextPort}/__fixture/r176-static-control?navigate=1`,
        { waitUntil: "domcontentloaded", timeout: 5_000 },
      )
      expect(heldResponse?.status()).toBe(200)
      await expect.poll(() => proxy.r176HeldDocuments(), { timeout: 2_000 }).toBe(1)
      const heartbeatBaseline = proxy.r176Heartbeats().filter(({ phase }) => phase === "held_navigation").length
      const held = await nativeNavigationDiagnostic(heldCdp, heldEvents)
      await new Promise((resolve) => setTimeout(resolve, 250))
      const heartbeatAfter = proxy.r176Heartbeats().filter(({ phase }) => phase === "held_navigation").length
      console.log("KOKORO_TEST_R176_NATIVE_DIAGNOSTIC " + JSON.stringify({
        baseline,
        held,
        held_heartbeat_advanced: heartbeatAfter > heartbeatBaseline,
      }))
      expect(proxy.r176HeldDocuments()).toBe(1)
    } finally {
      proxy.releaseR176HeldDocuments()
      try { await heldContext?.close() }
      finally {
        try { await baselineContext?.close() }
        finally {
          try { await browser?.close() }
          finally { await proxy.close() }
        }
      }
    }
  }, 60_000)


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

  it("R183 shows a safe rail failure when the Move owner rejects without changing the active draft or route", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveFixtureMode = "respond"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status: 409,
      requestId: "req_move_owner_rejected",
      body: { error: { code: "idempotency_conflict", message: "fixture owner detail must stay private", retryable: false } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      const composer = page.locator('[data-slot="composer-input"]')
      await expect.poll(() => composer.isEnabled(), { timeout: 15_000 }).toBe(true)
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const rowA = directList.locator(
        `[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`,
      )
      const selectA = rowA.locator(`[data-conversation-id="${moveConversationA}"]`)
      await selectA.getByText("Move conversation alpha", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await selectA.click()
      await composer.fill("R183 owner rejection preserves this active draft")
      const beforeUrl = page.url()
      const beforeListRequests = proxy.listRequests()

      await rowA.getByRole("button", { name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u }).click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)

      const alert = directList.getByRole("alert").filter({
        hasText: /The conversation could not be moved\. Refresh and try again\.|移动失败，请刷新后重试。/u,
      })
      await alert.waitFor({ state: "visible", timeout: 10_000 })
      expect(await alert.textContent()).not.toMatch(/fixture owner detail|idempotency_conflict|req_move_owner_rejected/u)
      expect(page.url()).toBe(beforeUrl)
      expect(await composer.inputValue()).toBe("R183 owner rejection preserves this active draft")
      expect(await selectA.getAttribute("aria-pressed")).toBe("true")
      expect(proxy.listRequests()).toBe(beforeListRequests)
      expect(moveBoundaryRequests).toHaveLength(1)
      expect(paths.some((value) => /\/runs\/[^/]+\/control(?:\?|$)/u.test(value))).toBe(false)
    } finally {
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 45_000)

  it("R183 disables every competing Move while one row is pending and retries an unknown result only on its original row", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveFixtureMode = "hold"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_retry_confirmed",
      body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expect.poll(() => page.locator('[data-slot="composer-input"]').isEnabled(), { timeout: 15_000 }).toBe(true)
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const rowA = directList.locator(
        `[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`,
      )
      const rowB = directList.locator(
        `[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationB}"])`,
      )
      const selectA = rowA.locator(`[data-conversation-id="${moveConversationA}"]`)
      await selectA.click()
      await expect.poll(() => selectA.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      const moveA = rowA.getByRole("button", { name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u })
      const moveB = rowB.getByRole("button", { name: /Move conversation Move conversation beta|移动会话 Move conversation beta/u })
      await moveA.click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)
      await expect.poll(() => moveA.isDisabled(), { timeout: 10_000 }).toBe(true)
      await expect.poll(() => moveB.isDisabled(), { timeout: 10_000 }).toBe(true)
      expect(moveBoundaryRequests).toHaveLength(1)

      moveFixtureMode = "close"
      releaseMove()
      await expect.poll(() => moveA.isEnabled(), { timeout: 10_000 }).toBe(true)
      await moveA.click()
      const retryItems = page.getByRole("menuitem", { name: /Retry moving conversation|重试移动会话/u })
      await retryItems.waitFor({ state: "visible", timeout: 10_000 })
      expect(await retryItems.count()).toBe(1)
      await page.keyboard.press("Escape")
      await moveB.click()
      expect(await page.getByRole("menuitem", { name: /Retry moving conversation|重试移动会话/u }).count()).toBe(0)
      await page.keyboard.press("Escape")
      await moveA.click()
      const retry = page.getByRole("menuitem", { name: /Retry moving conversation|重试移动会话/u })
      await retry.waitFor({ state: "visible", timeout: 10_000 })
      expect(moveBoundaryRequests).toHaveLength(1)

      moveFixtureMode = "respond"
      await retry.click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(2)
      expect(moveBoundaryRequests[1]).toEqual(moveBoundaryRequests[0])
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toBe(`/app/project/${moveProjectA}`)
    } finally {
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it("R192 keeps a moved Conversation out of Direct after return and reload while preserving its Project history", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveBindingFixtureEnabled = true
    moveBindingProjectRef = null
    moveBindingScopeGets.length = 0
    moveBindingSnapshotGets.length = 0
    moveFixtureMode = "respond"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_binding_confirmed",
      body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const directRowA = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`)
      await directRowA.locator(`[data-conversation-id="${moveConversationA}"]`).click()
      await page.getByText("R192 binding survives the filtered view move", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })

      await directRowA.getByRole("button", {
        name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u,
      }).click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)
      expect(moveBoundaryRequests[0]?.body).toBe(JSON.stringify({ target_project_id: moveProjectA }))
      expect(moveBoundaryRequests[0]?.idempotencyKey).toMatch(
        /^move_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
      )
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toBe(`/app/project/${moveProjectA}`)
      expect(new URL(page.url()).searchParams.get("conversation")).toBe(moveConversationA)
      await page.getByText("R192 binding survives the filtered view move", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })

      const directGetsAfterCommitBaseline = moveBindingScopeGets.filter((entry) => entry.scope === "direct").length
      await page.locator('a[href="/app"]').first().click()
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe("/app")
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === "direct").length, { timeout: 10_000 })
        .toBeGreaterThan(directGetsAfterCommitBaseline)
      const directReturnRead = moveBindingScopeGets.filter((entry) => entry.scope === "direct").at(-1)
      expect(directReturnRead).toEqual({
        scope: "direct",
        bindingAtRead: moveProjectA,
        sessionIds: [moveConversationB],
      })
      const directGetsBeforeReload = moveBindingScopeGets.filter((entry) => entry.scope === "direct").length
      await page.reload({ waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const reloadedDirectList = page.locator('[data-conversation-list="direct"]')
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === "direct").length, { timeout: 10_000 })
        .toBeGreaterThan(directGetsBeforeReload)
      const directReloadRead = moveBindingScopeGets.filter((entry) => entry.scope === "direct").at(-1)
      expect(directReloadRead).toEqual({
        scope: "direct",
        bindingAtRead: moveProjectA,
        sessionIds: [moveConversationB],
      })
      await expect.poll(() => reloadedDirectList.locator(`[data-conversation-id="${moveConversationA}"]`).count(), {
        timeout: 10_000,
      }).toBe(0)
      expect(new URL(page.url()).searchParams.get("conversation")).toBeNull()

      const snapshotGetsBeforeProjectOpen = moveBindingSnapshotGets.length
      await page.getByRole("link", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toBe(`/app/project/${moveProjectA}`)
      const targetFolderToggle = page.locator(`button[aria-controls="project-children-${encodeURIComponent(moveProjectA)}"]`)
      if (await targetFolderToggle.getAttribute("aria-expanded") === "false") await targetFolderToggle.click()
      expect(await targetFolderToggle.getAttribute("aria-expanded")).toBe("true")
      const projectList = page.locator('[data-conversation-list="project-conversation"]')
      await expect.poll(() => moveBindingSnapshotGets.length, { timeout: 10_000 })
        .toBeGreaterThan(snapshotGetsBeforeProjectOpen)
      expect(moveBindingSnapshotGets.at(-1)).toEqual({
        sessionId: moveConversationA,
        bindingAtRead: moveProjectA,
        messageIds: ["message-move-binding-a"],
      })
      await projectList.locator(`[data-conversation-id="${moveConversationA}"]`).click()
      await expect.poll(() => new URL(page.url()).searchParams.get("conversation"), { timeout: 10_000 })
        .toBe(moveConversationA)
      await page.getByText("R192 binding survives the filtered view move", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      expect(moveBindingScopeGets).toContainEqual({
        scope: `project:${moveProjectA}`,
        bindingAtRead: moveProjectA,
        sessionIds: [moveConversationA],
      })
      expect(moveBoundaryRequests).toHaveLength(1)
    } finally {
      moveBindingFixtureEnabled = false
      moveBindingProjectRef = null
      moveBindingScopeGets.length = 0
      moveBindingSnapshotGets.length = 0
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it("R194 reconciles a late matching ACK with a post-commit source GET without stealing the newly active draft", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveBindingFixtureEnabled = true
    moveBindingProjectRef = null
    moveBindingScopeGets.length = 0
    moveFixtureMode = "hold"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_late_confirmed_reconcile",
      body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const composer = page.locator('[data-slot="composer-input"]')
      const directList = page.locator('[data-conversation-list="direct"]')
      const rowA = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`)
      const rowB = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationB}"])`)
      const selectA = rowA.locator(`[data-conversation-id="${moveConversationA}"]`)
      const selectB = rowB.locator(`[data-conversation-id="${moveConversationB}"]`)
      await selectA.click()
      await rowA.getByRole("button", { name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u }).click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)

      const preCommitReads = moveBindingScopeGets.filter((entry) => entry.scope === "direct")
      expect(preCommitReads.length).toBeGreaterThan(0)
      expect(preCommitReads.at(-1)).toEqual({
        scope: "direct", bindingAtRead: null, sessionIds: [moveConversationA, moveConversationB],
      })
      const sourceGetsBeforeAck = preCommitReads.length
      await selectB.click()
      await expect.poll(() => selectB.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      await composer.fill("R194 keep the newly active B draft")
      const stableUrl = page.url()

      releaseMove()
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === "direct").length, { timeout: 10_000 })
        .toBeGreaterThan(sourceGetsBeforeAck)
      expect(moveBindingScopeGets.filter((entry) => entry.scope === "direct").at(-1)).toEqual({
        scope: "direct", bindingAtRead: moveProjectA, sessionIds: [moveConversationB],
      })
      await expect.poll(() => directList.locator(`[data-conversation-id="${moveConversationA}"]`).count(), { timeout: 10_000 })
        .toBe(0)
      expect(page.url()).toBe(stableUrl)
      expect(await selectB.getAttribute("aria-pressed")).toBe("true")
      expect(await composer.inputValue()).toBe("R194 keep the newly active B draft")
      expect(moveBoundaryRequests).toHaveLength(1)
    } finally {
      moveBindingFixtureEnabled = false
      moveBindingProjectRef = null
      moveBindingScopeGets.length = 0
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it("R188 retains an unknown Move identity after active switch and retries only its original row", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveFixtureMode = "hold"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_switched_unknown_retry",
      body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const rowA = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`)
      const rowB = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationB}"])`)
      const selectA = rowA.locator(`[data-conversation-id="${moveConversationA}"]`)
      const selectB = rowB.locator(`[data-conversation-id="${moveConversationB}"]`)
      const moveA = rowA.getByRole("button", {
        name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u,
      })
      await selectA.click()
      await expect.poll(() => selectA.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      await moveA.click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)

      await selectB.click()
      await expect.poll(() => selectB.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      const stableUrl = page.url()
      const listRequestsBeforeUnknown = proxy.listRequests()
      moveFixtureMode = "close"
      releaseMove()
      await expect.poll(() => moveA.isEnabled(), { timeout: 10_000 }).toBe(true)
      expect(page.url()).toBe(stableUrl)
      expect(proxy.listRequests()).toBe(listRequestsBeforeUnknown)

      await moveA.click()
      const retry = page.getByRole("menuitem", { name: /Retry moving conversation|重试移动会话/u })
      await retry.waitFor({ state: "visible", timeout: 10_000 })
      moveFixtureMode = "respond"
      await retry.click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(2)
      expect(moveBoundaryRequests[1]).toEqual(moveBoundaryRequests[0])
      expect(page.url()).toBe(stableUrl)
      expect(await selectB.getAttribute("aria-pressed")).toBe("true")
    } finally {
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it("R194 recovers a committed Move after the owner socket closes with the exact command and preserves one Conversation history", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveBindingFixtureEnabled = true
    moveBindingProjectRef = null
    moveBindingScopeGets.length = 0
    moveBindingSnapshotGets.length = 0
    moveFixtureMode = "commit-close"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_committed_lost_ack",
      body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const rowA = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`)
      await rowA.locator(`[data-conversation-id="${moveConversationA}"]`).click()
      await page.getByText("R192 binding survives the filtered view move", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      const ownerMutationsBefore = paths.filter((value) => /\/messages(?:\?|$)|\/runs(?:\/|\?|$)/u.test(value)).length

      await rowA.getByRole("button", { name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u }).click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)
      expect(moveBindingProjectRef).toBe(moveProjectA)
      await expect.poll(() => rowA.getByRole("button", {
        name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u,
      }).isEnabled(), { timeout: 10_000 }).toBe(true)
      await rowA.getByRole("button", { name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u }).click()
      const retry = page.getByRole("menuitem", { name: /Retry moving conversation|重试移动会话/u })
      await retry.waitFor({ state: "visible", timeout: 10_000 })

      moveFixtureMode = "respond"
      await retry.click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(2)
      expect(moveBoundaryRequests[1]).toEqual(moveBoundaryRequests[0])
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toBe(`/app/project/${moveProjectA}`)
      expect(new URL(page.url()).searchParams.get("conversation")).toBe(moveConversationA)
      await page.getByText("R192 binding survives the filtered view move", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      expect(moveBindingSnapshotGets.at(-1)).toEqual({
        sessionId: moveConversationA,
        bindingAtRead: moveProjectA,
        messageIds: ["message-move-binding-a"],
      })
      expect(paths.filter((value) => /\/messages(?:\?|$)|\/runs(?:\/|\?|$)/u.test(value))).toHaveLength(ownerMutationsBefore)
    } finally {
      moveBindingFixtureEnabled = false
      moveBindingProjectRef = null
      moveBindingScopeGets.length = 0
      moveBindingSnapshotGets.length = 0
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it.each([
    [503, "business_store_unavailable"],
    [409, "idempotency_in_progress"],
  ] as const)("R194 keeps typed %s %s Move outcomes unknown and retries the exact command", async (status, code) => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveFixtureMode = "respond"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status,
      requestId: `req_move_unknown_${status}`,
      body: { error: { code, message: "uncertain owner outcome", retryable: true } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const rowA = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`)
      await rowA.getByRole("button", { name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u }).click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)
      await rowA.getByRole("button", { name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u }).click()
      const retry = page.getByRole("menuitem", { name: /Retry moving conversation|重试移动会话/u })
      await retry.waitFor({ state: "visible", timeout: 10_000 })
      moveFixtureResponse = {
        status: 200,
        requestId: `req_move_unknown_retry_${status}`,
        body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
      }
      await retry.click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(2)
      expect(moveBoundaryRequests[1]).toEqual(moveBoundaryRequests[0])
    } finally {
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it("R195 reconciles a cross-scope matching Move ACK without stealing the mounted Project draft", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveBindingFixtureEnabled = true
    moveBindingProjectRef = null
    moveBindingScopeGets.length = 0
    moveBindingSnapshotGets.length = 0
    moveFixtureMode = "hold"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = {
      status: 200,
      requestId: "req_move_cross_scope_confirmed",
      body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      await page.getByRole("link", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectA}`).length, {
        timeout: 10_000,
      }).toBeGreaterThan(0)
      expect(moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectA}`).at(-1)).toEqual({
        scope: `project:${moveProjectA}`, bindingAtRead: null, sessionIds: [],
      })
      await page.locator('a[href="/app"]').first().click()
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe("/app")
      const directList = page.locator('[data-conversation-list="direct"]')
      const directRowA = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`)
      await directRowA.locator(`[data-conversation-id="${moveConversationA}"]`).click()
      await directRowA.getByRole("button", {
        name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u,
      }).click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)

      await page.getByRole("link", { name: "Move target beta", exact: true }).click()
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toBe(`/app/project/${moveProjectB}`)
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectB}`).length, {
        timeout: 10_000,
      }).toBeGreaterThan(0)
      const projectBReadsBeforeAck = moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectB}`).length
      const composer = page.locator('[data-slot="composer-input"]')
      const projectBDraft = "R195 keep the mounted Project B draft"
      await composer.fill(projectBDraft)
      const directReadsBeforeAck = moveBindingScopeGets.filter((entry) => entry.scope === "direct").length
      const targetReadsBeforeAck = moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectA}`).length

      releaseMove()
      await expect.poll(() => moveBindingProjectRef, { timeout: 10_000 }).toBe(moveProjectA)
      expect(new URL(page.url()).pathname).toBe(`/app/project/${moveProjectB}`)
      expect(await composer.inputValue()).toBe(projectBDraft)
      expect(moveBoundaryRequests).toHaveLength(1)

      await page.locator('a[href="/app"]').first().click()
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === "direct").length, { timeout: 10_000 })
        .toBeGreaterThan(directReadsBeforeAck)
      const returnedDirectList = page.locator('[data-conversation-list="direct"]')
      await expect.poll(() => returnedDirectList.locator(`[data-conversation-id="${moveConversationA}"]`).count(), {
        timeout: 10_000,
      }).toBe(0)
      expect(moveBindingScopeGets.filter((entry) => entry.scope === "direct").at(-1)).toEqual({
        scope: "direct", bindingAtRead: moveProjectA, sessionIds: [moveConversationB],
      })

      await page.getByRole("link", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectA}`).length, {
        timeout: 10_000,
      }).toBeGreaterThan(targetReadsBeforeAck)
      expect(moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectA}`).at(-1)).toEqual({
        scope: `project:${moveProjectA}`, bindingAtRead: moveProjectA, sessionIds: [moveConversationA],
      })
      const targetFolderToggle = page.locator(`button[aria-controls="project-children-${encodeURIComponent(moveProjectA)}"]`)
      if (await targetFolderToggle.getAttribute("aria-expanded") === "false") await targetFolderToggle.click()
      expect(await targetFolderToggle.getAttribute("aria-expanded")).toBe("true")
      await page.locator('[data-conversation-list="project-conversation"]')
        .locator(`[data-conversation-id="${moveConversationA}"]`).waitFor({ state: "visible", timeout: 10_000 })

      await page.getByRole("link", { name: "Move target beta", exact: true }).click()
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toBe(`/app/project/${moveProjectB}`)
      await expect.poll(() => page.locator('[data-slot="composer-input"]').inputValue(), { timeout: 10_000 })
        .toBe(projectBDraft)
      await expect.poll(() => moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectB}`).length, {
        timeout: 10_000,
      }).toBe(projectBReadsBeforeAck + 1)
      expect(moveBindingScopeGets.filter((entry) => entry.scope === `project:${moveProjectB}`).at(-1)).toEqual({
        scope: `project:${moveProjectB}`, bindingAtRead: moveProjectA, sessionIds: [],
      })
      expect(moveBoundaryRequests).toHaveLength(1)
    } finally {
      moveBindingFixtureEnabled = false
      moveBindingProjectRef = null
      moveBindingScopeGets.length = 0
      moveBindingSnapshotGets.length = 0
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it.each([
    ["committed lost ACK", "commit-close", 200, "lost_ack"],
    ["typed unavailable", "respond", 503, "business_store_unavailable"],
  ] as const)("R195 retains a cross-scope %s Move command for one explicit exact retry", async (
    _outcome, releaseMode, status, code,
  ) => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    moveUiFixtureEnabled = true
    moveBindingFixtureEnabled = true
    moveBindingProjectRef = null
    moveBindingScopeGets.length = 0
    moveBindingSnapshotGets.length = 0
    moveFixtureMode = "hold"
    moveBoundaryRequests.length = 0
    moveFixtureResponse = status === 200 ? {
      status,
      requestId: "req_move_cross_scope_lost_ack",
      body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
    } : {
      status,
      requestId: "req_move_cross_scope_unavailable",
      body: { error: { code, message: "uncertain owner outcome", retryable: true } },
    }
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const directRowA = directList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`)
      await directRowA.getByRole("button", {
        name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u,
      }).click()
      await page.getByRole("menuitem", { name: "Move target alpha", exact: true }).click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(1)
      const frozenRequest = moveBoundaryRequests[0]

      await page.getByRole("link", { name: "Move target beta", exact: true }).click()
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
        .toBe(`/app/project/${moveProjectB}`)
      const projectBDraft = `R195 ${code} keeps Project B mounted`
      const composer = page.locator('[data-slot="composer-input"]')
      await composer.fill(projectBDraft)
      moveFixtureMode = releaseMode
      releaseMove()
      await expect.poll(() => moveBindingProjectRef, { timeout: 10_000 })
        .toBe(status === 200 ? moveProjectA : null)
      expect(new URL(page.url()).pathname).toBe(`/app/project/${moveProjectB}`)
      expect(await composer.inputValue()).toBe(projectBDraft)
      expect(moveBoundaryRequests).toHaveLength(1)

      const recoveryProject = status === 200 ? moveProjectA : null
      if (recoveryProject === null) {
        await page.locator('a[href="/app"]').first().click()
        await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe("/app")
      } else {
        await page.getByRole("link", { name: "Move target alpha", exact: true }).click()
        await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
          .toBe(`/app/project/${moveProjectA}`)
      }
      if (recoveryProject !== null) {
        const targetFolderToggle = page.locator(`button[aria-controls="project-children-${encodeURIComponent(recoveryProject)}"]`)
        if (await targetFolderToggle.getAttribute("aria-expanded") === "false") await targetFolderToggle.click()
        expect(await targetFolderToggle.getAttribute("aria-expanded")).toBe("true")
      }
      const recoveryList = page.locator(`[data-conversation-list="${recoveryProject === null ? "direct" : "project-conversation"}"]`)
      const recoveryRow = recoveryList.locator(
        `[data-slot="sidebar-menu-item"]:has([data-conversation-id="${moveConversationA}"])`,
      )
      const moveButton = recoveryRow.getByRole("button", {
        name: /Move conversation Move conversation alpha|移动会话 Move conversation alpha/u,
      })
      await moveButton.waitFor({ state: "visible", timeout: 10_000 })
      await page.locator('[data-slot="composer-input"]').focus()
      expect(moveBoundaryRequests).toHaveLength(1)

      const retainedConversation = recoveryRow.locator(`[data-conversation-id="${moveConversationA}"]`)
      await retainedConversation.click()
      await expect.poll(() => new URL(page.url()).searchParams.get("conversation"), { timeout: 10_000 })
        .toBe(moveConversationA)
      await moveButton.click()
      const retry = page.getByRole("menuitem", { name: /Retry moving conversation|重试移动会话/u })
      await retry.waitFor({ state: "visible", timeout: 10_000 })
      expect(moveBoundaryRequests).toHaveLength(1)
      moveFixtureMode = "respond"
      moveFixtureResponse = {
        status: 200,
        requestId: `req_move_cross_scope_retry_${status}`,
        body: { data: { session_id: moveConversationA, project_ref: moveProjectA } },
      }
      await retry.click()
      await expect.poll(() => moveBoundaryRequests.length, { timeout: 10_000 }).toBe(2)
      expect(moveBoundaryRequests[1]).toEqual(frozenRequest)
      await expect.poll(() => {
        const url = new URL(page.url())
        return `${url.pathname}${url.search}`
      }, { timeout: 10_000 }).toBe(
        `/app/project/${moveProjectA}?conversation=${encodeURIComponent(moveConversationA)}`,
      )
      await page.getByText("R192 binding survives the filtered view move", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
    } finally {
      moveBindingFixtureEnabled = false
      moveBindingProjectRef = null
      moveBindingScopeGets.length = 0
      moveBindingSnapshotGets.length = 0
      moveUiFixtureEnabled = false
      moveFixtureMode = "respond"
      moveFixtureResponse = undefined
      releaseMove()
      moveBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 50_000)

  it("R229 recovers a cold conversation deep link from a real snapshot 503 through manual Retry", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: BrowserContext | undefined
    coldSnapshotStatus = 503
    coldSnapshotResponses.length = 0
    sessionSnapshotRequests = 0
    sessionBoundaryRequests.length = 0
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      // A new storage-free context must fail before A has ever become an active conversation.
      expect((await context.storageState()).origins).toEqual([])
      await admitBrowserContext(context)
      const page = await context.newPage()
      const browserSnapshotStatuses: number[] = []
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/session/sessions/session-list-a") {
          browserSnapshotStatuses.push(response.status())
        }
      })
      const target = `http://localhost:${nextPort}/app?conversation=session-list-a`
      const document = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 15_000 })
      expect(document?.status()).toBe(200)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expect.poll(() => coldSnapshotResponses, { timeout: 10_000 }).toEqual([503])
      await expect.poll(() => browserSnapshotStatuses, { timeout: 10_000 }).toEqual([503])
      expect(sessionSnapshotRequests).toBe(1)
      expect(new URL(page.url()).searchParams.get("conversation")).toBe("session-list-a")
      const errorSurface = page.getByTestId("app-frame-conversation-error")
      const loading = page.getByTestId("app-frame-loading")
      // On failure the oracle retains both the real peer status and the actually rendered branch.
      await expect.poll(async () => ({
        errorVisible: await errorSurface.isVisible(),
        loadingVisible: await loading.isVisible(),
        snapshotStatuses: [...browserSnapshotStatuses],
      }), { timeout: 12_000 }).toEqual({ errorVisible: true, loadingVisible: false, snapshotStatuses: [503] })
      expect(await page.getByText("R143 authoritative conversation A body", { exact: true }).count()).toBe(0)
      expect(sessionBoundaryRequests.filter((request) => request.method === "POST")).toEqual([])

      coldSnapshotStatus = 200
      await errorSurface.getByRole("button", { name: /Retry|重试/u }).click()
      await expect.poll(() => coldSnapshotResponses, { timeout: 10_000 }).toEqual([503, 200])
      await page.getByText("R143 authoritative conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      expect(await page.getByText("R143 authoritative conversation A body", { exact: true }).count()).toBe(1)
      expect(await errorSurface.count()).toBe(0)
      expect(await loading.count()).toBe(0)
      expect(new URL(page.url()).pathname).toBe("/app")
      expect(new URL(page.url()).searchParams.get("conversation")).toBe("session-list-a")
      expect(sessionBoundaryRequests.filter((request) => request.method === "POST")).toEqual([])

      const reload = await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 })
      expect(reload?.status()).toBe(200)
      await page.getByText("R143 authoritative conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      await expect.poll(() => coldSnapshotResponses, { timeout: 10_000 }).toEqual([503, 200, 200])
      expect(await page.getByText("R143 authoritative conversation A body", { exact: true }).count()).toBe(1)
      expect(new URL(page.url()).searchParams.get("conversation")).toBe("session-list-a")
      expect(await errorSurface.count()).toBe(0)
      expect(await loading.count()).toBe(0)
      expect(sessionBoundaryRequests.filter((request) => request.method === "POST")).toEqual([])
    } finally {
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally {
          try { await proxy.close() }
          finally {
            coldSnapshotStatus = undefined
            coldSnapshotResponses.length = 0
            sessionSnapshotRequests = 0
            sessionBoundaryRequests.length = 0
          }
        }
      }
    }
  }, 60_000)

  it("R233 keeps an authenticated deep link recoverable when only its Conversation index read is denied", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: BrowserContext | undefined
    sessionSnapshotRequests = 0
    sessionBoundaryRequests.length = 0
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await context.addInitScript(() => {
        const originalGetItem = Storage.prototype.getItem
        const target = window as unknown as { __kokoroDeniedConversationReads: number }
        target.__kokoroDeniedConversationReads = 0
        Storage.prototype.getItem = function (candidate: string): string | null {
          if (candidate === "kokoro.web.conversations.direct") {
            target.__kokoroDeniedConversationReads += 1
            throw new DOMException("conversation storage denied", "SecurityError")
          }
          return originalGetItem.call(this, candidate)
        }
      })
      await admitBrowserContext(context)
      const page = await context.newPage()
      observeBrowserDiagnostics(page)
      const pageErrors: string[] = []
      page.on("pageerror", (error) => pageErrors.push(error.name))
      const target = `http://localhost:${nextPort}/app?conversation=session-list-a`

      const deniedReads = async (): Promise<number> => page.evaluate(() =>
        (window as unknown as { __kokoroDeniedConversationReads?: number }).__kokoroDeniedConversationReads ?? 0)
        .catch(() => -1)
      const diagnostic = async (stage: string): Promise<string> => {
        const observed = browserDiagnostics.get(page)
        return `${stage} selective Conversation storage diagnostic: ${JSON.stringify({
          denied_conversation_reads: await deniedReads(),
          session_responses: proxy.sessionResponseDiagnostics(),
          snapshot_requests: sessionSnapshotRequests,
          boundary_requests: sessionBoundaryRequests.slice(-12),
          runtime_loading_count: await diagnosticWithin(page.getByTestId("runtime-loading").count(), -1),
          app_frame_loading_count: await diagnosticWithin(page.getByTestId("app-frame-loading").count(), -1),
          body_count: await diagnosticWithin(page.getByText("R143 authoritative conversation A body", { exact: true }).count(), -1),
          composer_count: await diagnosticWithin(page.locator('[data-slot="composer-input"]').count(), -1),
          page_error_categories: pageErrors,
          browser_error_categories: [...observed?.categories ?? []],
          request_failures: observed?.requestFailures ?? [],
          url_path_search: (() => { try { const url = new URL(page.url()); return `${url.pathname}${url.search}` } catch { return "<invalid>" } })(),
        })}`
      }
      const converge = async (stage: "cold" | "reload"): Promise<void> => {
        const sessionBaseline = proxy.sessionResponseDiagnostics().length
        const snapshotBaseline = sessionSnapshotRequests
        const deadline = Date.now() + 12_000
        const remaining = (): number => Math.max(1, deadline - Date.now())
        try {
          const response = stage === "cold"
            ? await page.goto(target, { waitUntil: "domcontentloaded", timeout: remaining() })
            : await page.reload({ waitUntil: "domcontentloaded", timeout: remaining() })
          expect(response?.status()).toBe(200)
          await expect.poll(() => proxy.sessionResponseDiagnostics().slice(sessionBaseline), { timeout: remaining() })
            .toContainEqual(expect.objectContaining({ status: 200, authenticated: true }))
          await expect.poll(deniedReads, { timeout: remaining() }).toBeGreaterThan(0)
          await expect.poll(() => sessionSnapshotRequests, { timeout: remaining() }).toBeGreaterThan(snapshotBaseline)
          await page.getByText("R143 authoritative conversation A body", { exact: true })
            .waitFor({ state: "visible", timeout: remaining() })
          const composer = page.locator('[data-slot="composer-input"]')
          await composer.waitFor({ state: "visible", timeout: remaining() })
          await expect.poll(() => composer.isEnabled(), { timeout: remaining() }).toBe(true)
          expect(await page.getByTestId("runtime-loading").count()).toBe(0)
          expect(await page.getByTestId("app-frame-loading").count()).toBe(0)
          expect(pageErrors).toEqual([])
          expect(`${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(
            "/app?conversation=session-list-a",
          )
          expect(sessionBoundaryRequests.filter((request) => request.method === "POST")).toEqual([])
        } catch (error) {
          throw new Error(await diagnostic(stage), { cause: error })
        }
      }

      await converge("cold")
      await converge("reload")
    } finally {
      sessionSnapshotRequests = 0
      sessionBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 45_000)

  it("R186 bounds an initial snapshot across headers and recovery instead of leaving the workspace loading forever", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    let releaseHeldSnapshot: (() => Promise<void>) | undefined
    let browserSnapshotRequests = 0
    sessionSnapshotRequests = 0
    sessionBoundaryRequests.length = 0
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const conversationA = directList.locator('[data-conversation-id="session-list-a"]')
      await conversationA.click()
      await expect.poll(() => sessionSnapshotRequests, { timeout: 10_000 }).toBe(1)
      await page.getByText("R143 authoritative conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      await expect.poll(() => new URL(page.url()).searchParams.get("conversation"), { timeout: 10_000 })
        .toBe("session-list-a")
      const composer = page.locator('[data-slot="composer-input"]')
      const draft = "R186 snapshot timeout keeps this local draft"
      await composer.fill(draft)
      const successfulSnapshotsBeforeHold = sessionSnapshotRequests

      await page.route(/\/api\/session\/sessions\/session-list-a(?:\?scope=direct)?$/u, async (route) => {
        browserSnapshotRequests += 1
        if (browserSnapshotRequests !== 1) {
          await route.continue()
          return
        }
        await new Promise<void>((resolve) => {
          let released = false
          releaseHeldSnapshot = async () => {
            if (released) return
            released = true
            try { await route.continue() }
            catch { /* an owned deadline may already have aborted the held browser request */ }
            finally { resolve() }
          }
        })
      })
      const heldReload = await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 })
      expect(heldReload?.status()).toBe(200)
      await expect.poll(() => browserSnapshotRequests, { timeout: 10_000 }).toBe(1)
      expect(sessionSnapshotRequests).toBe(successfulSnapshotsBeforeHold)
      expect(await page.getByTestId("app-frame-loading").isVisible()).toBe(true)
      expect(await page.getByText("R143 authoritative conversation A body", { exact: true }).count()).toBe(0)

      const errorSurface = page.getByTestId("app-frame-conversation-error")
      await errorSurface.waitFor({ state: "visible", timeout: 12_000 })
      expect(await page.getByTestId("app-frame-loading").count()).toBe(0)
      expect(sessionSnapshotRequests).toBe(successfulSnapshotsBeforeHold)

      await errorSurface.getByRole("button", { name: /Retry|重试/u }).click()
      await expect.poll(() => browserSnapshotRequests, { timeout: 10_000 }).toBe(2)
      await expect.poll(() => sessionSnapshotRequests, { timeout: 10_000 })
        .toBe(successfulSnapshotsBeforeHold + 1)
      await page.getByText("R143 authoritative conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      expect(await composer.inputValue()).toBe(draft)

      await releaseHeldSnapshot?.()
      expect(await page.getByText("R143 authoritative conversation A body", { exact: true }).count()).toBe(1)
      const snapshotRequestsBeforeReload = sessionSnapshotRequests
      const reload = await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 })
      expect(reload?.status()).toBe(200)
      await page.getByText("R143 authoritative conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      await expect.poll(() => page.locator('[data-slot="composer-input"]').inputValue(), { timeout: 10_000 }).toBe(draft)
      expect(sessionSnapshotRequests).toBeGreaterThan(snapshotRequestsBeforeReload)
    } finally {
      await releaseHeldSnapshot?.()
      sessionSnapshotRequests = 0
      sessionBoundaryRequests.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R188 exercises Direct list, open, rejected rename, non-active delete and an empty local composer through the real rail", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    renameSessionStatus = 503
    renameSessionRequests.length = 0
    deleteSessionRequests.length = 0
    deleteSessionCommitted = false
    deleteSessionBCommitted = false
    sessionSnapshotRequests = 0
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const rowA = directList.locator('[data-slot="sidebar-menu-item"]:has([data-conversation-id="session-list-a"])')
      const rowB = directList.locator('[data-slot="sidebar-menu-item"]:has([data-conversation-id="session-list-b"])')
      const selectA = rowA.locator('[data-conversation-id="session-list-a"]')
      const selectB = rowB.locator('[data-conversation-id="session-list-b"]')
      await selectA.click()
      await expect.poll(() => selectA.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      await page.getByText("R143 authoritative conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      const composer = page.locator('[data-slot="composer-input"]')
      await composer.fill("R188 direct A draft")

      await selectB.click()
      await expect.poll(() => selectB.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      await page.getByText("R188 authoritative conversation B body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      await composer.fill("R188 direct B draft")
      await selectA.click()
      await expect.poll(() => composer.inputValue(), { timeout: 10_000 }).toBe("R188 direct A draft")
      await selectB.click()
      await expect.poll(() => composer.inputValue(), { timeout: 10_000 }).toBe("R188 direct B draft")

      await rowB.getByRole("button", { name: "Rename chat Bounded list beta" }).click()
      const renameInput = directList.locator('[data-slot="sidebar-menu-item"][data-editing="true"]')
        .getByRole("textbox", { name: "Chat title" })
      await renameInput.fill("Rejected owner title")
      await renameInput.press("Enter")
      await expect.poll(() => renameSessionRequests.length, { timeout: 10_000 }).toBe(1)
      expect(renameSessionRequests).toEqual([{
        path: "/v1/sessions/session-list-b/title",
        body: JSON.stringify({ title: "Rejected owner title" }),
      }])
      await directList.getByText("Bounded list beta", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      expect(await directList.getByText("Rejected owner title", { exact: true }).count()).toBe(0)

      const reload = await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 })
      expect(reload?.status()).toBe(200)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const reloadedList = page.locator('[data-conversation-list="direct"]')
      const reloadedA = reloadedList.locator('[data-conversation-id="session-list-a"]')
      await reloadedList.getByText("Bounded list beta", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await reloadedA.click()
      await expect.poll(() => reloadedA.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("true")
      await expect.poll(() => page.locator('[data-slot="composer-input"]').inputValue(), { timeout: 10_000 })
        .toBe("R188 direct A draft")
      const beforeDeleteUrl = page.url()
      await reloadedList.getByRole("button", { name: "Delete chat Bounded list beta" }).click()
      const dialog = page.getByRole("alertdialog")
      await dialog.getByRole("button", { name: "Delete chat", exact: true }).click()
      await expect.poll(() => deleteSessionRequests.length, { timeout: 10_000 }).toBe(1)
      expect(deleteSessionRequests[0]).toEqual({
        url: "/v1/sessions/session-list-b?scope=direct",
        idempotencyKey: expect.stringMatching(/^session-mutation:/u),
      })
      await expect.poll(() => reloadedList.getByText("Bounded list beta", { exact: true }).count(), { timeout: 10_000 }).toBe(0)
      expect(await reloadedA.getAttribute("aria-pressed")).toBe("true")
      expect(page.url()).toBe(beforeDeleteUrl)
      expect(await page.locator('[data-slot="composer-input"]').inputValue()).toBe("R188 direct A draft")

      await page.getByTestId("rail-new-conversation").click()
      await expect.poll(() => reloadedA.getAttribute("aria-pressed"), { timeout: 10_000 }).toBe("false")
      expect(await reloadedList.getByText("New chat", { exact: true }).count()).toBe(0)
      expect(await reloadedList.locator('[data-conversation-id]').count()).toBe(1)
    } finally {
      renameSessionStatus = 200
      renameSessionRequests.length = 0
      deleteSessionRequests.length = 0
      deleteSessionCommitted = false
      deleteSessionBCommitted = false
      sessionSnapshotRequests = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R190 serializes rail renames and reconciles only from post-ACK owner lists", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    renameLifecycleFixture = true
    renameLifecycleLostAck = false
    renameLifecycleTitle = "Bounded list beta"
    failNextRenameLifecycleList = false
    releaseHeldRenameA = undefined
    renameSessionRequests.length = 0
    renameLifecycleListResponses.length = 0
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const rename = async (currentTitle: string, nextTitle: string): Promise<void> => {
        const row = directList.locator('[data-slot="sidebar-menu-item"]:has([data-conversation-id="session-list-b"])')
        await row.getByRole("button", { name: `Rename chat ${currentTitle}` }).click()
        const input = directList.getByRole("textbox", { name: "Chat title" })
        await input.fill(nextTitle)
        await input.press("Enter")
        await directList.getByText(nextTitle, { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      }

      await rename("Bounded list beta", "R190 title A")
      await expect.poll(() => renameSessionRequests.length, { timeout: 10_000 }).toBe(1)
      await rename("R190 title A", "R190 title B")
      expect(renameSessionRequests).toHaveLength(1)

      releaseRenameA()
      await expect.poll(() => renameSessionRequests.length, { timeout: 10_000 }).toBe(2)
      expect(renameSessionRequests.map(({ body }) => JSON.parse(body))).toEqual([
        { title: "R190 title A" },
        { title: "R190 title B" },
      ])
      await expect.poll(() => renameLifecycleListResponses.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
      await directList.getByText("R190 title A", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      expect(await directList.getByText("R190 title B", { exact: true }).count()).toBe(0)

      const reload = await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 })
      expect(reload?.status()).toBe(200)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const reloadedList = page.locator('[data-conversation-list="direct"]')
      const reloadedRow = reloadedList.locator('[data-slot="sidebar-menu-item"]:has([data-conversation-id="session-list-b"])')
      await reloadedList.getByText("R190 title A", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })

      const listsBeforeCanonicalC = renameLifecycleListResponses.length
      await reloadedRow.getByRole("button", { name: "Rename chat R190 title A" }).click()
      await reloadedList.getByRole("textbox", { name: "Chat title" }).fill("R190 canonical C")
      await reloadedList.getByRole("textbox", { name: "Chat title" }).press("Enter")
      await expect.poll(() => renameSessionRequests.length, { timeout: 10_000 }).toBe(3)
      await reloadedList.getByText("R190 canonical C", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await expect.poll(() => renameLifecycleListResponses.length, { timeout: 10_000 }).toBeGreaterThan(listsBeforeCanonicalC)
      expect(renameLifecycleListResponses.at(-1)).toEqual({ status: 200, title: "R190 canonical C" })

      failNextRenameLifecycleList = true
      await reloadedRow.getByRole("button", { name: "Rename chat R190 canonical C" }).click()
      await reloadedList.getByRole("textbox", { name: "Chat title" }).fill("R190 canonical D")
      await reloadedList.getByRole("textbox", { name: "Chat title" }).press("Enter")
      await expect.poll(() => renameSessionRequests.length, { timeout: 10_000 }).toBe(4)
      await expect.poll(() => renameLifecycleListResponses.at(-1)?.status, { timeout: 10_000 }).toBe(503)
      expect(await reloadedList.getByText("R190 title B", { exact: true }).count()).toBe(0)
      expect(await reloadedList.getByText("R190 title A", { exact: true }).count()).toBe(0)

      await reloadedList.getByRole("button", { name: /Retry|重试/u }).click()
      await expect.poll(() => renameLifecycleListResponses.at(-1), { timeout: 10_000 }).toEqual({
        status: 200,
        title: "R190 canonical D",
      })
      await reloadedList.getByText("R190 canonical D", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      expect(await reloadedList.getByText("R190 canonical C", { exact: true }).count()).toBe(0)
    } finally {
      releaseRenameA()
      renameLifecycleFixture = false
      renameLifecycleLostAck = false
      renameLifecycleTitle = "Bounded list beta"
      failNextRenameLifecycleList = false
      releaseHeldRenameA = undefined
      renameSessionRequests.length = 0
      renameLifecycleListResponses.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R190 reconciles a committed rail rename after the owner response is lost", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    renameLifecycleFixture = true
    renameLifecycleLostAck = true
    renameLifecycleTitle = "Bounded list beta"
    failNextRenameLifecycleList = false
    releaseHeldRenameA = undefined
    renameSessionRequests.length = 0
    renameLifecycleListResponses.length = 0
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const directList = page.locator('[data-conversation-list="direct"]')
      const row = directList.locator('[data-slot="sidebar-menu-item"]:has([data-conversation-id="session-list-b"])')
      const listsBeforeRename = renameLifecycleListResponses.length
      await row.getByRole("button", { name: "Rename chat Bounded list beta" }).click()
      const input = directList.getByRole("textbox", { name: "Chat title" })
      await input.fill("R190 lost ACK canonical A")
      await input.press("Enter")

      await expect.poll(() => renameSessionRequests.length, { timeout: 10_000 }).toBe(1)
      expect(JSON.parse(renameSessionRequests[0]?.body ?? "null")).toEqual({ title: "R190 lost ACK canonical A" })
      await expect.poll(() => renameLifecycleListResponses.length, { timeout: 10_000 }).toBeGreaterThan(listsBeforeRename)
      await directList.getByText("R190 lost ACK canonical A", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      expect(await directList.getByText("Bounded list beta", { exact: true }).count()).toBe(0)

      const reload = await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 })
      expect(reload?.status()).toBe(200)
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      await page.locator('[data-conversation-list="direct"]')
        .getByText("R190 lost ACK canonical A", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
    } finally {
      releaseRenameA()
      renameLifecycleFixture = false
      renameLifecycleLostAck = false
      renameLifecycleTitle = "Bounded list beta"
      failNextRenameLifecycleList = false
      releaseHeldRenameA = undefined
      renameSessionRequests.length = 0
      renameLifecycleListResponses.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R231 keeps a Project conversation and draft stable until its exact-scope DELETE ACK, then reloads canonical membership", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    let page: Page | undefined
    projectDeleteFixtureEnabled = true
    projectDeleteStatus = 200
    projectDeleteHeld = true
    projectDeleteCommitted = false
    projectDeleteRequests.length = 0
    projectDeleteScopeGets.length = 0
    releaseProjectDelete = undefined
    sessionSnapshotRequests = 0
    const pathStart = paths.length
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app/project/${projectDeleteProject}`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const projectList = page.locator('[data-conversation-list="project-conversation"]')
      const rowA = projectList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${projectDeleteConversationA}"])`)
      await rowA.getByText("Project conversation A", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      await rowA.locator(`[data-conversation-id="${projectDeleteConversationA}"]`).click()
      await page.getByText("R231 authoritative project conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      const composer = page.locator('[data-slot="composer-input"]')
      const draft = "R231 held project delete preserves this draft"
      await composer.fill(draft)
      const scopeGetsBeforeDelete = projectDeleteScopeGets.length
      const routeBeforeDelete = page.url()

      await rowA.getByRole("button", { name: "Delete chat Project conversation A" }).click()
      const dialog = page.getByRole("alertdialog")
      await dialog.getByRole("button", { name: "Delete chat", exact: true }).click()
      await expect.poll(() => projectDeleteRequests.length, { timeout: 10_000 }).toBe(1)
      expect(projectDeleteRequests).toEqual([{
        url: `/v1/sessions/${projectDeleteConversationA}?project_ref=${projectDeleteProject}`,
        idempotencyKey: expect.stringMatching(/^session-mutation:[0-9a-f-]+$/u),
      }])
      expect(projectDeleteRequests[0]?.url).not.toContain("scope=direct")
      expect(projectDeleteScopeGets).toHaveLength(scopeGetsBeforeDelete)
      expect(page.url()).toBe(routeBeforeDelete)
      expect(await composer.inputValue()).toBe(draft)
      expect(await projectList.getByText("Project conversation A", { exact: true }).count()).toBe(1)
      expect(await projectList.getByText("Project conversation B", { exact: true }).count()).toBe(1)
      expect(await dialog.isVisible()).toBe(true)
      expect(await dialog.getByRole("button", { name: "Delete chat", exact: true }).isDisabled()).toBe(true)

      releaseHeldProjectDelete()
      await expect.poll(() => projectList.getByText("Project conversation A", { exact: true }).count(), { timeout: 10_000 }).toBe(0)
      await expect.poll(() => projectDeleteScopeGets.length, { timeout: 10_000 }).toBe(scopeGetsBeforeDelete + 1)
      expect(projectDeleteScopeGets.at(-1)).toEqual([projectDeleteConversationB])
      expect(projectDeleteRequests).toHaveLength(1)
      expect(new URL(page.url()).pathname).toBe(`/app/project/${projectDeleteProject}`)
      expect(new URL(page.url()).searchParams.get("conversation")).not.toBe(projectDeleteConversationA)
      expect(await composer.inputValue()).toBe("")
      expect(await projectList.getByText("Project conversation B", { exact: true }).count()).toBe(1)

      const scopeGetsBeforeReload = projectDeleteScopeGets.length
      await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      await expect.poll(() => projectDeleteScopeGets.length, { timeout: 10_000 }).toBeGreaterThan(scopeGetsBeforeReload)
      const reloadedProjectList = page.locator('[data-conversation-list="project-conversation"]')
      expect(await reloadedProjectList.getByText("Project conversation A", { exact: true }).count()).toBe(0)
      await reloadedProjectList.getByText("Project conversation B", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })

      await page.locator('a[href="/app"]').first().click()
      const activePage = page
      await expect.poll(() => new URL(activePage.url()).pathname, { timeout: 10_000 }).toBe("/app")
      await expandDesktopRail(page)
      await page.locator('[data-conversation-list="direct"]')
        .getByText("Direct conversation C", { exact: true }).waitFor({ state: "visible", timeout: 10_000 })
      expect(paths.slice(pathStart).some((value) => /\/runs\/[^/]+\/control(?:\?|$)/u.test(value))).toBe(false)
    } finally {
      projectDeleteFixtureEnabled = false
      projectDeleteStatus = 200
      projectDeleteHeld = false
      projectDeleteCommitted = false
      releaseHeldProjectDelete()
      releaseProjectDelete = undefined
      projectDeleteRequests.length = 0
      projectDeleteScopeGets.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

  it("R231 preserves a Project conversation on DELETE 503 and succeeds only after an explicit retry", async () => {
    const proxy = await sessionProbeProxy(nextPort)
    let browser: Browser | undefined
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined
    projectDeleteFixtureEnabled = true
    projectDeleteStatus = 503
    projectDeleteHeld = false
    projectDeleteCommitted = false
    projectDeleteRequests.length = 0
    projectDeleteScopeGets.length = 0
    const pathStart = paths.length
    try {
      browser = await chromium.launch({ headless: true,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "" }, args: ["--proxy-bypass-list=<-loopback>"] })
      context = await browser.newContext()
      await admitBrowserContext(context)
      const page = await context.newPage()
      await page.goto(`http://localhost:${nextPort}/app/project/${projectDeleteProject}`, { waitUntil: "domcontentloaded" })
      await page.locator('[data-server-admitted-shell="true"]').waitFor({ state: "detached", timeout: 15_000 })
      await expandDesktopRail(page)
      const projectList = page.locator('[data-conversation-list="project-conversation"]')
      const rowA = projectList.locator(`[data-slot="sidebar-menu-item"]:has([data-conversation-id="${projectDeleteConversationA}"])`)
      await rowA.locator(`[data-conversation-id="${projectDeleteConversationA}"]`).click()
      await page.getByText("R231 authoritative project conversation A body", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
      const composer = page.locator('[data-slot="composer-input"]')
      const draft = "R231 rejected project delete preserves this draft"
      await composer.fill(draft)
      const routeBeforeDelete = page.url()
      const scopeGetsBeforeDelete = projectDeleteScopeGets.length

      await rowA.getByRole("button", { name: "Delete chat Project conversation A" }).click()
      const dialog = page.getByRole("alertdialog")
      const confirm = dialog.getByRole("button", { name: "Delete chat", exact: true })
      await confirm.click()
      await expect.poll(() => projectDeleteRequests.length, { timeout: 10_000 }).toBe(1)
      await dialog.getByRole("alert").waitFor({ state: "visible", timeout: 10_000 })
      expect(projectDeleteRequests[0]).toEqual({
        url: `/v1/sessions/${projectDeleteConversationA}?project_ref=${projectDeleteProject}`,
        idempotencyKey: expect.stringMatching(/^session-mutation:[0-9a-f-]+$/u),
      })
      expect(projectDeleteScopeGets).toHaveLength(scopeGetsBeforeDelete)
      expect(page.url()).toBe(routeBeforeDelete)
      expect(await composer.inputValue()).toBe(draft)
      expect(await projectList.getByText("Project conversation A", { exact: true }).count()).toBe(1)
      expect(await projectList.getByText("Project conversation B", { exact: true }).count()).toBe(1)
      expect(await confirm.isEnabled()).toBe(true)
      expect(paths.slice(pathStart).some((value) => /\/runs\/[^/]+\/control(?:\?|$)/u.test(value))).toBe(false)

      projectDeleteStatus = 200
      await confirm.click()
      await expect.poll(() => projectDeleteRequests.length, { timeout: 10_000 }).toBe(2)
      expect(projectDeleteRequests.map((entry) => entry.url)).toEqual([
        `/v1/sessions/${projectDeleteConversationA}?project_ref=${projectDeleteProject}`,
        `/v1/sessions/${projectDeleteConversationA}?project_ref=${projectDeleteProject}`,
      ])
      expect(projectDeleteRequests[1]?.idempotencyKey).toMatch(/^session-mutation:[0-9a-f-]+$/u)
      expect(projectDeleteRequests[1]?.idempotencyKey).not.toBe(projectDeleteRequests[0]?.idempotencyKey)
      await expect.poll(() => projectList.getByText("Project conversation A", { exact: true }).count(), { timeout: 10_000 }).toBe(0)
      await expect.poll(() => projectDeleteScopeGets.length, { timeout: 10_000 }).toBe(scopeGetsBeforeDelete + 1)
      expect(projectDeleteScopeGets.at(-1)).toEqual([projectDeleteConversationB])
      expect(new URL(page.url()).pathname).toBe(`/app/project/${projectDeleteProject}`)
      expect(await composer.inputValue()).toBe("")
      expect(paths.slice(pathStart).some((value) => /\/runs\/[^/]+\/control(?:\?|$)/u.test(value))).toBe(false)
    } finally {
      projectDeleteFixtureEnabled = false
      projectDeleteStatus = 200
      projectDeleteHeld = false
      projectDeleteCommitted = false
      releaseHeldProjectDelete()
      releaseProjectDelete = undefined
      projectDeleteRequests.length = 0
      projectDeleteScopeGets.length = 0
      try { await context?.close() }
      finally {
        try { await browser?.close() }
        finally { await proxy.close() }
      }
    }
  }, 60_000)

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
