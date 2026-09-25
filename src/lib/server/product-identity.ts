import { randomUUID } from "node:crypto"

import type { OidcRpConfig } from "./oidc-provider"
import { requestWithDomain } from "./upstream-http"

type ProductIdentity = Readonly<{ userId: string; tenantId: string }>

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index])
}

function parseIdentity(value: unknown): ProductIdentity | null {
  if (typeof value !== "object" || value === null || !exactKeys(value as Record<string, unknown>, ["data", "meta"])) return null
  const envelope = value as Record<string, unknown>
  if (typeof envelope.data !== "object" || envelope.data === null ||
      !exactKeys(envelope.data as Record<string, unknown>, ["tenant_id", "user_id"]) ||
      typeof envelope.meta !== "object" || envelope.meta === null ||
      !exactKeys(envelope.meta as Record<string, unknown>, ["request_id"])) return null
  const data = envelope.data as Record<string, unknown>
  const meta = envelope.meta as Record<string, unknown>
  if (typeof data.user_id !== "string" || data.user_id.length === 0 || data.user_id.length > 256 ||
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
