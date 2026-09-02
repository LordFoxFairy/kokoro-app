import { describe, expect, it } from "vitest"

import { mutationHeaders } from "@/lib/client/mutation"

describe("mutationHeaders", () => {
  it("creates a request-scoped idempotency key when the caller omits one", () => {
    const headers = mutationHeaders({ "content-type": "application/json" })

    expect(headers.get("content-type")).toBe("application/json")
    expect(headers.get("idempotency-key")).toMatch(/^web:[0-9a-f-]{36}$/u)
  })

  it("preserves an explicit key for retries of the same command", () => {
    const headers = mutationHeaders({ "idempotency-key": "web:retry-1" })

    expect(headers.get("idempotency-key")).toBe("web:retry-1")
  })
})
