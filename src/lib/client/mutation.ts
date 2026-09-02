/** Build headers for one user mutation without allowing callers to reuse a stale key. */
export function mutationHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  if (!headers.has("idempotency-key")) headers.set("idempotency-key", `web:${globalThis.crypto.randomUUID()}`)
  return headers
}
