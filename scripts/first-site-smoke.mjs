#!/usr/bin/env node

import http from "node:http"
import https from "node:https"

const baseUrl = process.env.KOKORO_WEB_URL?.trim()
const deploymentDomain = process.env.KOKORO_DOMAIN?.trim()
const requestHost = process.env.KOKORO_WEB_HOST?.trim()
const locale = process.env.KOKORO_SMOKE_LOCALE?.trim() || "en-US"
const mode = process.env.KOKORO_SMOKE_MODE?.trim() || "live"

if (!baseUrl) {
  console.error("KOKORO_WEB_URL is required")
  process.exit(2)
}
if (!deploymentDomain) {
  console.error("KOKORO_DOMAIN is required")
  process.exit(2)
}
if (!["live", "preview", "liveness"].includes(mode)) {
  console.error("KOKORO_SMOKE_MODE must be live, preview, or liveness")
  process.exit(2)
}

const target = new URL(baseUrl)
const requestHeaders = {
  accept: "application/json",
  // Local *.localhost names can resolve to IPv6 while `next dev` is bound to
  // IPv4 on some hosts. Keep the canonical deployment domain in the Host
  // header without forcing the smoke runner to connect through that DNS name.
  ...(requestHost ? { host: requestHost } : {}),
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertNoInternalIdentity(text, label) {
  assert(!/(tenantId|tenant_id|workloadToken|workload_token|iamAccessToken)/u.test(text), `${label} contains forbidden identity field`)
}

function assertPrivateResponse(response, label, allowPreviewNoCache = false) {
  assert(response.headers["x-content-type-options"] === "nosniff", `${label} missing nosniff`)
  const cache = String(response.headers["cache-control"] ?? "")
  assert(cache.includes("no-store") || (allowPreviewNoCache && cache.includes("no-cache")), `${label} must not be publicly cached`)
}

async function get(path, headers = {}) {
  const url = new URL(path, target)
  const transport = url.protocol === "https:" ? https : http
  const response = await new Promise((resolve, reject) => {
    const request = transport.request(url, { headers: { ...requestHeaders, ...headers } }, (incoming) => {
      const chunks = []
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, text: Buffer.concat(chunks).toString("utf8") }))
    })
    request.on("error", reject)
    request.end()
  })
  const text = response.text
  let body = null
  try { body = text.length > 0 ? JSON.parse(text) : null } catch { /* status-only response */ }
  return { response: { status: response.status, headers: response.headers }, body, text }
}

try {
  // Liveness is independent of RP/BFF/IAM configuration. This public page
  // cannot certify dependency readiness or an authenticated Product Session.
  const home = await get("/", { accept: "text/html" })
  assert(home.response.status === 200, `public page returned ${home.response.status}`)
  assert(home.response.headers["x-content-type-options"] === "nosniff", "public page missing nosniff")
  assert(home.response.headers["x-frame-options"] === "DENY", "public page missing frame denial")
  assert(String(home.response.headers["content-type"] ?? "").includes("text/html"), "public page is not HTML")
  assert(home.text.includes("Kokoro"), "public Kokoro page is missing")
  assertNoInternalIdentity(home.text, "public HTML")

  if (mode !== "liveness") {
    const manifest = await get(`/api/system/runtime-manifest?product_id=kokoro&locale=${encodeURIComponent(locale)}&surface_id=user-web`)
    if (mode === "preview") {
      assert(manifest.response.status === 503, `preview runtime manifest returned ${manifest.response.status}`)
      assert(manifest.body?.error?.code === "system_runtime_unavailable", "preview runtime manifest error mismatch")
    } else {
      assert(manifest.response.status === 200, `live runtime manifest returned ${manifest.response.status}`)
      assert(manifest.body?.data?.productId === "kokoro", "live runtime manifest product mismatch")
    }
    assertPrivateResponse(manifest.response, "runtime manifest")
    assertNoInternalIdentity(manifest.text, "runtime manifest")

    const sessionCookie = process.env.KOKORO_SESSION_COOKIE?.trim()
    const app = await get("/app", { accept: "text/html", ...(sessionCookie ? { cookie: sessionCookie } : {}) })
    if (mode === "live" && !sessionCookie && [302, 303, 307, 308].includes(app.response.status)) {
      assert(app.response.headers.location === "/login", "anonymous app redirect must target /login")
    } else {
      assert(app.response.status === 200, `app returned ${app.response.status}`)
    }
    // Next dev may replace the preview-only shell's proxy no-store with
    // no-cache; live authenticated HTML must still retain no-store.
    assertPrivateResponse(app.response, "app", mode === "preview")
    assertNoInternalIdentity(app.text, "app HTML")
    if (mode === "live" && sessionCookie) {
      const session = await get("/api/auth/session", { cookie: sessionCookie })
      assert(session.response.status === 200 && session.body?.authenticated === true,
        `authenticated Product Session probe returned ${session.response.status} without admission`)
      assertPrivateResponse(session.response, "Product Session")
      assertNoInternalIdentity(session.text, "Product Session")
    }
  }

  if (mode === "live" && process.env.KOKORO_SESSION_COOKIE?.trim() && process.env.KOKORO_SESSION_PROBE_PATH?.trim()) {
    const session = await get(process.env.KOKORO_SESSION_PROBE_PATH, {
      cookie: process.env.KOKORO_SESSION_COOKIE,
      accept: "text/event-stream, application/json",
    })
    assert(session.response.status < 500, `session probe returned ${session.response.status}`)
  }

  console.log(`Kokoro ${mode} smoke passed: ${deploymentDomain}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
