import { afterEach, describe, expect, it, vi } from "vitest"

import { browserListClient } from "@/ui/shell/page-clients"

describe("页面 Chat client transport selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("显式 live 模式不被开发环境的 preview 开关劫持", async () => {
    vi.stubEnv("NEXT_PUBLIC_SESSION_PREVIEW", "1")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessions: [], next_cursor: null }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await browserListClient({ preview: false }).listSessions()

    expect(fetchMock).toHaveBeenCalledWith("/api/session/sessions?scope=direct", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    })
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((options.signal as AbortSignal).aborted).toBe(false)
  })
})
