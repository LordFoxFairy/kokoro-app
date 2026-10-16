import { randomUUID } from "node:crypto"

import type { OidcRpConfig } from "./oidc-provider"
import { requestWithDomain } from "./upstream-http"
import { ProductIdentitySessionRejectedError } from "./product-identity.error"

type ProductIdentity = Readonly<{ userId: string; tenantId: string }>

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index])
}

function parseIdentity(value: unknown): ProductIdentity | null {
  if (typeof value !== "object" || value === null || !exactKeys(value as Record<string, unknown>, ["data", "meta"])) return null
  const envelope = value as Record<string, unknown>
  if (typeof envelope.data !== "object" || envelope.data === null ||
      !exactKeys(envelope.data as Record<string, unknown>, ["tenant_id", "user_id", "platform_admin"]) ||
      typeof envelope.meta !== "object" || envelope.meta === null ||
      !exactKeys(envelope.meta as Record<string, unknown>, ["request_id"])) return null
  const data = envelope.data as Record<string, unknown>
  const meta = envelope.meta as Record<string, unknown>
  if (typeof data.platform_admin !== "boolean" ||
      typeof data.user_id !== "string" || data.user_id.length === 0 || data.user_id.length > 256 ||
      typeof data.tenant_id !== "string" || data.tenant_id.length === 0 || data.tenant_id.length > 256 ||
      typeof meta.request_id !== "string" || meta.request_id.length === 0 || meta.request_id.length > 256) return null
  return { userId: data.user_id, tenantId: data.tenant_id }
}

export async function verifyProductIdentity(
  config: OidcRpConfig,
  access: string,
  expectedSubject: string,
  signal: AbortSignal,
): Promise<void> {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${access}`,
    "x-kokoro-request-id": randomUUID(),
    "x-kokoro-service": "web-bff",
    "x-kokoro-internal-secret": config.relay.secret,
  })
  const response = await requestWithDomain(`${config.relay.bffOrigin}/v1/me`, config.domain, {
    method: "GET", headers, signal, timeoutMs: 5_000, maxResponseBytes: 16_384,
  })
  if (response.status === 401) {
    const mediaType = response.headers.get("content-type") ?? ""
    const noStore = (response.headers.get("cache-control") ?? "").split(",")
      .some((directive) => directive.trim().toLowerCase() === "no-store")
    const requestId = headers.get("x-kokoro-request-id")
    if (/^application\/json(?:\s*;\s*charset\s*=\s*utf-8\s*)?$/iu.test(mediaType) &&
        noStore && response.headers.get("x-request-id") === requestId &&
        !response.headers.has("location") && !response.headers.has("set-cookie")) {
      let raw: unknown
      try { raw = JSON.parse(await response.text()) as unknown }
      catch { signal.throwIfAborted(); throw new Error("Invalid Product identity rejection") }
      signal.throwIfAborted()
      if (typeof raw === "object" && raw !== null &&
          exactKeys(raw as Record<string, unknown>, ["error", "meta"])) {
        const envelope = raw as Record<string, unknown>
        const error = envelope.error
        const meta = envelope.meta
        if (typeof error === "object" && error !== null &&
            exactKeys(error as Record<string, unknown>, ["code", "message"]) &&
            typeof meta === "object" && meta !== null &&
            exactKeys(meta as Record<string, unknown>, ["request_id"])) {
          const failure = error as Record<string, unknown>
          if (failure.code === "session_invalid" && typeof failure.message === "string" &&
              failure.message.trim().length > 0 &&
              (meta as Record<string, unknown>).request_id === requestId) {
            throw new ProductIdentitySessionRejectedError()
          }
        }
      }
      throw new Error("Invalid Product identity rejection")
    }
    await response.body?.cancel().catch(() => undefined)
    signal.throwIfAborted()
    throw new Error("Product identity admission failed")
  }
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error("Product identity admission failed")
  }
  let raw: unknown
  try { raw = JSON.parse(await response.text()) as unknown }
  catch { throw new Error("Invalid Product identity response") }
  const identity = parseIdentity(raw)
  if (identity === null || identity.userId !== expectedSubject || identity.tenantId !== config.tenantId) {
    throw new Error("Product identity mismatch")
  }
}
