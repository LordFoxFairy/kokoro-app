import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HubClient } from "@/hub/client"
import { McpOAuthCallback } from "@/ui/mcp/mcp-oauth-callback"
import { parseMcpOAuthCallback } from "@/ui/mcp/mcp-oauth-callback-payload"

afterEach(() => { cleanup() })

describe("parseMcpOAuthCallback", () => {
  it("accepts exactly one standard success callback", () => {
    expect(parseMcpOAuthCallback("?state=opaque-state&code=authorization-code")).toEqual({ state: "opaque-state", code: "authorization-code" })
  })

  it("accepts exactly one standard provider-denied callback", () => {
    expect(parseMcpOAuthCallback("?state=opaque-state&error=access_denied")).toEqual({ state: "opaque-state", error: "access_denied" })
  })

  it("rejects malformed, duplicate, and ambiguous callback query values", () => {
    expect(parseMcpOAuthCallback("?code=authorization-code")).toBeUndefined()
    expect(parseMcpOAuthCallback("?state=one&state=two&code=authorization-code")).toBeUndefined()
    expect(parseMcpOAuthCallback("?state=opaque-state&code=authorization-code&error=access_denied")).toBeUndefined()
  })

  it("posts the provider callback through the same-origin Hub client before returning to connectors", async () => {
    const completeMcpConnectorAuthorization = vi.fn().mockResolvedValue({ connector: { connector_id: "connector-one" } })
    const onComplete = vi.fn()
    render(<McpOAuthCallback
      client={{ completeMcpConnectorAuthorization } as unknown as HubClient}
      payload={{ state: "opaque-state", code: "authorization-code" }}
      onComplete={onComplete}
    />)

    await waitFor(() => expect(completeMcpConnectorAuthorization).toHaveBeenCalledWith({ state: "opaque-state", code: "authorization-code" }))
    expect(onComplete).toHaveBeenCalledOnce()
    expect(screen.getByRole("heading", { name: "正在完成连接器授权" })).toBeInTheDocument()
  })
})
