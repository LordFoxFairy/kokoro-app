import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { Readable } from "node:stream"

import { forwardedHeaders } from "./domain-context"

function responseHeaders(input: import("node:http").IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value)
  }
  return headers
}

function headersWithForwardedHost(headers: HeadersInit | undefined, domain: string): Record<string, string> {
  const result = new Headers(headers)
  // Host and legacy/custom tenant headers are transport-owned. Dropping them
  // prevents a caller-provided value from becoming a second isolation signal.
  result.delete("host")
  result.delete("forwarded")
  result.delete("x-forwarded-host")
  result.delete("x-forwarded-proto")
  result.delete("x-forwarded-for")
  // X-Domain is not a standard proxy context header and is never a tenant
  // authority. Drop it centrally so a future route cannot accidentally
  // reintroduce the legacy browser-controlled signal.
  result.delete("x-domain")
  result.delete("x-kokoro-tenant-id")
  result.delete("x-kokoro-site-id")
  // Set after copying caller values so a browser-forwarded or stale internal
  // value can never override the deployment's server-only context.
  for (const [name, value] of Object.entries(forwardedHeaders(domain))) result.set(name, value)
  return Object.fromEntries(result.entries())
}

type RequestWithDomainOptions = {
  method: string
  headers?: HeadersInit
  body?: ArrayBuffer
  signal?: AbortSignal
}

/** Server-only HTTP transport. Every upstream request carries RFC 7239 Forwarded. */
export function requestWithDomain(
  url: string,
  domain: string,
  options: RequestWithDomainOptions,
): Promise<Response> {
  const target = new URL(url)
  const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const client = requestFn(target, {
      method: options.method,
      headers: headersWithForwardedHost(options.headers, domain),
      signal: options.signal,
    }, (response) => {
      const stream = response.statusCode === 204 ? undefined : Readable.toWeb(response) as ReadableStream<Uint8Array>
      resolve(new Response(stream, { status: response.statusCode ?? 502, headers: responseHeaders(response.headers) }))
    })
    client.on("error", reject)
    if (options.body !== undefined) client.write(Buffer.from(options.body))
    client.end()
  })
}

/** JSON-oriented variant used by System runtime manifest. */
export function getJsonWithDomain(
  url: URL,
  domain: string,
  headers?: HeadersInit,
  signal?: AbortSignal,
): Promise<Response> {
  const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const client = requestFn(url, {
      method: "GET",
      headers: headersWithForwardedHost(headers, domain),
      signal,
    }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
      response.on("end", () => {
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 502, headers: responseHeaders(response.headers) }))
      })
      response.on("error", reject)
    })
    client.on("error", reject)
    client.end()
  })
}

/** Fetch variant for upstream calls that do not need Node's streaming request client. */
export function fetchWithDomain(
  input: string | URL,
  domain: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: headersWithForwardedHost(init.headers, domain),
  })
}
