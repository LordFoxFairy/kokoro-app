import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  bffErrorEnvelopeSchema,
  bffErrorResponse,
  bffSuccessEnvelopeSchema,
  requestIdForRequest,
  responseHeadersWithRequestId,
  webErrorResponse,
} from "@/lib/server/bff-response"

describe("Web BFF response contract", () => {
  it("uses one request id for the upstream request and public response header", () => {
    const request = new Request("https://app.example/api/test", {
      headers: { "x-kokoro-request-id": "request-from-browser" },
    })

    expect(requestIdForRequest(request)).toBe("request-from-browser")
    expect(responseHeadersWithRequestId("request-from-bff").get("x-request-id")).toBe("request-from-bff")
  })

  it("emits local failures in the canonical nested error envelope", async () => {
    const response = webErrorResponse("bff_not_configured", 503, "request-local")

    expect(response.status).toBe(503)
    expect(response.headers.get("x-request-id")).toBe("request-local")
    expect(await response.json()).toEqual({
      error: { code: "bff_not_configured", message: "bff_not_configured" },
      meta: { request_id: "request-local" },
    })
  })

  it("preserves BFF error.code/message and meta.request_id without flattening", async () => {
    const upstream = new Response("", { status: 409 })
    const response = bffErrorResponse(upstream, {
      error: { code: "checkout_conflict", message: "Checkout already exists" },
      meta: { request_id: "request-bff", retryable: false },
    }, "checkout_failed", "request-web")

    expect(response.status).toBe(409)
    expect(response.headers.get("x-request-id")).toBe("request-bff")
    expect(await response.json()).toEqual({
      error: { code: "checkout_conflict", message: "Checkout already exists" },
      meta: { request_id: "request-bff", retryable: false },
    })
  })

  it("normalizes malformed upstream errors while preserving the upstream error status", async () => {
    const upstream = new Response("not-json", {
      status: 429,
      headers: { "x-request-id": "request-upstream", "retry-after": "30" },
    })
    const response = bffErrorResponse(upstream, null, "billing_error", "request-web")

    expect(response.status).toBe(429)
    expect(response.headers.get("x-request-id")).toBe("request-upstream")
    expect(response.headers.get("retry-after")).toBe("30")
    expect(await response.json()).toEqual({
      error: { code: "billing_error", message: "billing_error" },
      meta: { request_id: "request-upstream" },
    })
  })

  it("requires request metadata on BFF success and error envelopes", () => {
    expect(bffSuccessEnvelopeSchema(z.object({})).safeParse({ data: {}, meta: { request_id: "request-1" } }).success).toBe(true)
    expect(bffSuccessEnvelopeSchema(z.object({})).safeParse({ data: {} }).success).toBe(false)
    expect(bffErrorEnvelopeSchema.safeParse({
      error: { code: "error", message: "message" },
      meta: { request_id: "request-1" },
    }).success).toBe(true)
  })
})
