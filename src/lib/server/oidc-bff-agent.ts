import "server-only"

import http, { type ClientRequest, type RequestOptions } from "node:http"
import https from "node:https"
import { Socket } from "node:net"

import { IAM_RELAY_POLICY } from "./iam-relay-policy"

// openid-client v5's timeout only covers headers. Its response iterator has no
// size or absolute-time bound, so each backchannel request gets its own agent.
export function boundedOidcBffAgent(url: URL, signal: AbortSignal): http.Agent | https.Agent {
  const agent = url.protocol === "https:" ? new https.Agent({ keepAlive: false }) : new http.Agent({ keepAlive: false })
  const target = agent as http.Agent & { addRequest(request: ClientRequest, options: RequestOptions): void }
  const addRequest = target.addRequest.bind(agent)
  target.addRequest = (request: ClientRequest, options: RequestOptions): void => {
    let received = 0
    let ended = false
    const cleanup = (): void => {
      if (ended) return
      ended = true
      clearTimeout(deadline)
      signal.removeEventListener("abort", onAbort)
      agent.destroy()
    }
    const onAbort = (): void => { request.destroy(new Error("RP browser request cancelled")) }
    const deadline = setTimeout(() => request.destroy(new Error("RP BFF request exceeded deadline")), IAM_RELAY_POLICY.maxDurationMs)
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      // Node does not emit error/close for destroy() before ClientRequest has a
      // socket. A detached socket gives the request a terminal event without
      // opening any upstream connection.
      request.onSocket(new Socket())
      onAbort()
      cleanup()
      return
    }
    request.once("socket", (assignedSocket) => {
      assignedSocket.once("close", cleanup)
    })
    request.once("response", (response) => {
      for (const value of response.rawHeaders) received += Buffer.byteLength(value) + 2
      if (received > IAM_RELAY_POLICY.maxHeaderBytes) request.destroy(new Error("RP BFF headers exceeded byte limit"))
      const declared = response.headers["content-length"]
      if (declared !== undefined && Number(declared) + received > IAM_RELAY_POLICY.maxResponseBytes) {
        request.destroy(new Error("RP BFF response exceeded byte limit"))
      }
      const push = response.push.bind(response)
      response.push = (chunk: unknown, encoding?: BufferEncoding): boolean => {
        if (chunk !== null && chunk !== undefined) {
          received += typeof chunk === "string" ? Buffer.byteLength(chunk, encoding) : Buffer.from(chunk as Uint8Array).byteLength
          if (received > IAM_RELAY_POLICY.maxResponseBytes) {
            request.destroy(new Error("RP BFF response exceeded byte limit"))
            return false
          }
        }
        return push(chunk, encoding)
      }
      response.once("end", cleanup)
      response.once("close", cleanup)
    })
    request.once("error", cleanup)
    addRequest(request, options)
  }
  return agent
}
