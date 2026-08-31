import { describe, expect, it } from "vitest"

import { configuredDomain, forwardedHeaders } from "@/lib/server/domain-context"

describe("deployment domain context", () => {
  it.each([
    ["dev.kokoro.localhost", "dev.kokoro.localhost"],
    ["  APP.Example.COM. ", "app.example.com"],
    ["localhost", "localhost"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(configuredDomain({ KOKORO_DOMAIN: input } as unknown as NodeJS.ProcessEnv)).toBe(expected)
  })

  it.each(["", "   ", "https://app.example.com", "app.example.com/path", "app..example.com", "-bad.example.com", "bad-.example.com", "a:b"]) (
    "rejects invalid domain %s",
    (input) => {
      expect(configuredDomain({ KOKORO_DOMAIN: input } as unknown as NodeJS.ProcessEnv)).toBeNull()
    },
  )

  it("creates the server-owned RFC 7239 Forwarded header", () => {
    expect(forwardedHeaders("  APP.Example.COM. ")).toEqual({ forwarded: "host=app.example.com" })
  })
})
