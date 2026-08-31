#!/usr/bin/env node

import http from "node:http"
import https from "node:https"

const baseUrl = process.env.KOKORO_WEB_URL?.trim()
const deploymentDomain = process.env.KOKORO_DOMAIN?.trim()
const requestHost = process.env.KOKORO_WEB_HOST?.trim()
const locale = process.env.KOKORO_SMOKE_LOCALE?.trim() || "en-US"

if (!baseUrl) {
  console.error("KOKORO_WEB_URL is required")
  process.exit(2)
}
if (!deploymentDomain) {
  console.error("KOKORO_DOMAIN is required")
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

function containsForbiddenIdentity(value, path = "$") {
  if (Array.isArray(value)) return value.some((entry, index) => containsForbiddenIdentity(entry, `${path}[${index}]`))
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => {
      if (["tenantId", "tenant_id", "workloadToken", "workload_token", "iamAccessToken"].includes(key)) {
        throw new Error(`browser response contains forbidden identity field at ${path}.${key}`)
      }
      return containsForbiddenIdentity(entry, `${path}.${key}`)
    })
  }
  return false
}

async function get(path, headers = {}) {
  const url = new URL(path, target)
  const transport = url.protocol === "https:" ? https : http
  const response = await new Promise((resolve, reject) => {
    const request = transport.request(url, { headers: { ...requestHeaders, ...headers } }, (incoming) => {
      const chunks = []
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }))
    })
    request.on("error", reject)
    request.end()
  })
  const text = response.text
  let body = null
  try { body = text.length > 0 ? JSON.parse(text) : null } catch { /* status-only response */ }
  return { response: { status: response.status }, body }
}

try {
  const sessionState = await get("/api/auth/session-state")
  assert(sessionState.response.status === 200, `session state returned ${sessionState.response.status}`)
  const preview = sessionState.body?.state === "preview"

  const manifest = await get(`/api/system/runtime-manifest?product_id=kokoro&locale=${encodeURIComponent(locale)}&surface_id=user-web`)
  if (preview) {
    // Preview mode intentionally has no System upstream. The app uses the
    // deterministic local manifest fixture instead of pretending that a
    // backend manifest was available; keep this smoke path honest while
    // preserving the strict 200/product check for every live deployment.
    assert(manifest.response.status === 503, `preview runtime manifest returned ${manifest.response.status}`)
    assert(manifest.body?.error === "system_runtime_unavailable", "preview runtime manifest error mismatch")
  } else {
    assert(manifest.response.status === 200, `runtime manifest returned ${manifest.response.status}`)
    assert(manifest.body?.data?.productId === "kokoro", "runtime manifest product mismatch")
  }
  containsForbiddenIdentity(manifest.body)

  const app = await get("/app", { accept: "text/html" })
  assert(app.response.status === 200, `app returned ${app.response.status}`)
  assert(!/(tenantId|tenant_id|workloadToken|workload_token|iamAccessToken)/u.test(app.text), "app HTML contains forbidden identity field")

  if (process.env.KOKORO_SESSION_COOKIE?.trim() && process.env.KOKORO_SESSION_PROBE_PATH?.trim()) {
    const session = await get(process.env.KOKORO_SESSION_PROBE_PATH, {
      cookie: process.env.KOKORO_SESSION_COOKIE,
      accept: "text/event-stream, application/json",
    })
    assert(session.response.status < 500, `session probe returned ${session.response.status}`)
  }

  console.log(`Kokoro smoke passed: ${deploymentDomain}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
