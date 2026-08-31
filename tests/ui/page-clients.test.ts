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
      new Response(JSON.stringify({ sessions: [] }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await browserListClient({ preview: false }).listSessions()

    expect(fetchMock).toHaveBeenCalledWith("/api/session/sessions?scope=direct", { cache: "no-store" })
  })
})
