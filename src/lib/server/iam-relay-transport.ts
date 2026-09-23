import { IAM_RELAY_POLICY } from "./iam-relay-policy"

export type IamRelayUpstream = Readonly<{
  status: number
  headers: Headers
  setCookies: readonly string[]
  body: Uint8Array
}>

export class IamRelayTransportError extends Error {
  constructor() {
    super("IAM relay upstream unavailable")
    this.name = "IamRelayTransportError"
  }
}

function responseHeaderBytes(headers: Headers, setCookies: readonly string[]): number {
  let bytes = 2
  for (const [name, value] of headers) {
    if (name !== "set-cookie") bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
  }
  for (const value of setCookies) bytes += Buffer.byteLength(value) + 14
  return bytes
}

function declaredLength(headers: Headers): number | null {
  const raw = headers.get("content-length")
  if (raw === null) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

export async function requestIamRelay(input: Readonly<{
  url: string
  method?: "GET" | "POST"
  body?: Uint8Array
  headers: Headers
  signal: AbortSignal
  timeoutMs: number
  maxRequestBytes?: number
  maxResponseBytes: number
  maxHeaderBytes: number
}>): Promise<IamRelayUpstream> {
  const controller = new AbortController()
  const onAbort = (): void => controller.abort(input.signal.reason)
  if (input.signal.aborted) onAbort()
  else input.signal.addEventListener("abort", onAbort, { once: true })
  const timer = setTimeout(
    () => controller.abort(new IamRelayTransportError()),
    Math.max(1, Math.min(input.timeoutMs, IAM_RELAY_POLICY.maxDurationMs)),
  )
  try {
    const target = new URL(input.url)
    if (
      (target.protocol !== "http:" && target.protocol !== "https:") ||
      target.username !== "" || target.password !== "" || target.hash !== ""
    ) throw new IamRelayTransportError()
    const method = input.method ?? "GET"
    if (
      (method === "GET" && input.body !== undefined) ||
      (method === "POST" && (input.body === undefined || input.body.byteLength > Math.min(
        input.maxRequestBytes ?? IAM_RELAY_POLICY.maxRequestBodyBytes,
        IAM_RELAY_POLICY.maxRequestBodyBytes,
      )))
    ) throw new IamRelayTransportError()
    if (controller.signal.aborted) throw new IamRelayTransportError()

    const response = await fetch(target, {
      method,
      ...(input.body === undefined ? {} : { body: Buffer.from(input.body) }),
      headers: input.headers,
      redirect: "manual",
      signal: controller.signal,
    })
    const setCookies = response.headers.getSetCookie()
    const headerCap = Math.min(input.maxHeaderBytes, IAM_RELAY_POLICY.maxHeaderBytes)
    if (responseHeaderBytes(response.headers, setCookies) > headerCap) {
      controller.abort()
      await response.body?.cancel().catch(() => undefined)
      throw new IamRelayTransportError()
    }
    const bodyCap = Math.min(input.maxResponseBytes, IAM_RELAY_POLICY.maxResponseBytes)
    const length = declaredLength(response.headers)
    if (length !== null && length > bodyCap) {
      controller.abort()
      await response.body?.cancel().catch(() => undefined)
      throw new IamRelayTransportError()
    }

    const chunks: Uint8Array[] = []
    let total = 0
    if (response.body !== null) {
      const reader = response.body.getReader()
      try {
        while (true) {
          const result = await reader.read()
          if (result.done) break
          total += result.value.byteLength
          if (total > bodyCap) {
            controller.abort()
            await reader.cancel().catch(() => undefined)
            throw new IamRelayTransportError()
          }
          chunks.push(result.value)
        }
      } finally {
        reader.releaseLock()
      }
    }
    const body = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { status: response.status, headers: response.headers, setCookies, body }
  } catch {
    throw new IamRelayTransportError()
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener("abort", onAbort)
  }
}
