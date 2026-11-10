import { expect, it, vi } from "vitest"
import { AgentClientError, createAgentClient } from "@/agents/client"

const setupId = "a".repeat(32)
const data = { platform: "telegram", status: "awaiting_telegram", state_version: "2", setup_id: setupId,
  continue_url: `https://t.me/KokoroFixtureBot?start=${setupId}`, expires_at: "2026-08-30T14:30:00+08:00" }
const command = { action: "start", expected_state_version: "1" } as const
const response = (raw: unknown, status = 200) => Response.json(raw, { status, headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "req_1" } })

it("Agent client 验证同源 POST 的正式 envelope、版本和 setup 链接", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ data, meta: { request_id: "req_1" } }))
    .mockResolvedValueOnce(response({ data: { ...data, continue_url: "https://t.me/KokoroFixtureBot?start=different" }, meta: { request_id: "req_1" } }))
  const client = createAgentClient(fetcher)
  await expect(client.changeConnection("telegram", command)).resolves.toEqual(data)
  expect(fetcher).toHaveBeenCalledWith("/api/agents/connections/setup?platform=telegram", expect.objectContaining({ method: "POST", body: JSON.stringify(command) }))
  await expect(client.connectionSetup("telegram")).rejects.toBeInstanceOf(AgentClientError)
})

it("Agent client 取消到达 fetch，预取消零请求；保留正式 412", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({
    error: { code: "agent_connection_precondition_failed", message: "stale" }, meta: { request_id: "req_1" },
  }, 412))
  const controller = new AbortController()
  const client = createAgentClient(fetcher)
  await expect(client.changeConnection("telegram", command, controller.signal)).rejects.toMatchObject({ status: 412, code: "agent_connection_precondition_failed" })
  const sent = fetcher.mock.calls[0]?.[1]?.signal
  controller.abort()
  expect(sent?.aborted).toBe(true)
  await expect(client.connectionSetup("telegram", controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
