import { expect, it, vi } from "vitest"

import { AgentClientError, createAgentClient } from "@/agents/client"
import { createPreviewAgentClient } from "@/agents/preview-client"

const setup = {
  platform: "telegram",
  status: "disconnected",
  qr_value: "https://agents.fixture.test/connect?platform=telegram",
  continue_url: "https://agents.fixture.test/continue?platform=telegram",
  expires_at: "2026-08-30T06:30:00.000Z",
} as const

it("Agent client 请求同源 setup 端点并校验 wire", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(setup), {
    status: 200,
    headers: { "content-type": "application/json" },
  }))

  await expect(createAgentClient(fetcher).connectionSetup("telegram")).resolves.toEqual(setup)
  expect(fetcher).toHaveBeenCalledWith(
    "/api/agents/connections/setup?platform=telegram",
    { cache: "no-store" },
  )
})

it("Agent client 拒绝平台不一致或缺字段的后端响应", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    ...setup,
    platform: "unknown",
  }), { status: 200 }))

  await expect(createAgentClient(fetcher).connectionSetup("telegram")).rejects.toBeInstanceOf(AgentClientError)
})

it("Agent client 保留 HTTP 状态供 UI 区分重试", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))

  await expect(createAgentClient(fetcher).connectionSetup("slack")).rejects.toMatchObject({ status: 503 })
})

it("Agent setup 原 signal 到达 fetch；预取消不发请求，正式 UTC offset 可读", async () => {
  const withOffset = { ...setup, expires_at: "2026-08-30T14:30:00+08:00" }
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(withOffset))
  const client = createAgentClient(fetcher)
  const controller = new AbortController()
  const read = client.connectionSetup("telegram", controller.signal)
  await expect(read).resolves.toEqual(withOffset)
  expect(fetcher).toHaveBeenCalledWith("/api/agents/connections/setup?platform=telegram", { cache: "no-store", signal: controller.signal })

  controller.abort()
  await expect(client.connectionSetup("telegram", controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  expect(fetcher).toHaveBeenCalledTimes(1)
  fetcher.mockResolvedValueOnce(Response.json({ ...setup, expires_at: "2026-08-30T14:30:00+0800" }))
  await expect(client.connectionSetup("telegram")).rejects.toBeInstanceOf(AgentClientError)
})

it("preview client 为三个平台返回隔离的合成连接投影", async () => {
  const client = createPreviewAgentClient()
  const telegram = await client.connectionSetup("telegram")
  const line = await client.connectionSetup("line")
  const slack = await client.connectionSetup("slack")

  expect(telegram.qr_value).toContain("platform=telegram")
  expect(line.qr_value).toContain("platform=line")
  expect(slack.continue_url).toContain("platform=slack")
  expect([telegram, line, slack].every((value) => !JSON.stringify(value).includes("tenant_id"))).toBe(true)
})
