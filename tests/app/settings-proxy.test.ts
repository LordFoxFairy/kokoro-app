import { beforeEach, describe, expect, it, vi } from "vitest"

const proxyHubRequest = vi.fn()

vi.mock("@/app/api/hub/[...path]/route", () => ({ proxyHubRequest }))

describe("/api/settings/[...path] proxy", () => {
  beforeEach(() => {
    proxyHubRequest.mockReset()
    proxyHubRequest.mockResolvedValue(new Response(null, { status: 204 }))
  })

  it("maps the public settings path onto the Hub settings boundary", async () => {
    const { POST } = await import("@/app/api/settings/[...path]/route")
    const request = new Request("http://localhost/api/settings/developer/api-keys", { method: "POST" })
    const response = await POST(request, { params: Promise.resolve({ path: ["developer", "api-keys"] }) })

    expect(response.status).toBe(204)
    expect(proxyHubRequest).toHaveBeenCalledWith(request, expect.objectContaining({ params: expect.any(Promise) }))
    await expect(proxyHubRequest.mock.calls[0]?.[1].params).resolves.toEqual({
      path: ["settings", "developer", "api-keys"],
    })
  })
})
