import { beforeEach, describe, expect, it, vi } from "vitest"

const proxyHubRequest = vi.fn()

vi.mock("@/app/api/hub/[...path]/route", () => ({ proxyHubRequest }))

describe("/api/mail/[...path] proxy", () => {
  beforeEach(() => {
    proxyHubRequest.mockReset()
    proxyHubRequest.mockResolvedValue(new Response(null, { status: 204 }))
  })

  it("maps the public inbox path onto the Hub mail boundary", async () => {
    const { GET } = await import("@/app/api/mail/[...path]/route")
    const request = new Request("http://localhost/api/mail/inbox?limit=50")
    const response = await GET(request, { params: Promise.resolve({ path: ["inbox"] }) })

    expect(response.status).toBe(204)
    expect(proxyHubRequest).toHaveBeenCalledWith(request, expect.objectContaining({ params: expect.any(Promise) }))
    await expect(proxyHubRequest.mock.calls[0]?.[1].params).resolves.toEqual({ path: ["mail", "inbox"] })
  })

  it("maps mutation paths without bypassing the shared proxy", async () => {
    const { POST } = await import("@/app/api/mail/[...path]/route")
    const request = new Request("http://localhost/api/mail/workflows", { method: "POST" })
    await POST(request, { params: Promise.resolve({ path: ["workflows"] }) })

    await expect(proxyHubRequest.mock.calls[0]?.[1].params).resolves.toEqual({ path: ["mail", "workflows"] })
  })
})
