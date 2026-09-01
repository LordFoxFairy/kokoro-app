import { afterEach, describe, expect, it, vi } from "vitest"

import { createScheduledTaskClient } from "@/features/app/scheduled-task-client"

const wireTask = {
  id: "scheduled_1",
  title: "Daily digest",
  prompt: "Run the digest",
  frequency: "daily",
  time: "08:00",
  timezone: "UTC",
  next_run_at: "2026-09-15T08:00:00.000Z",
  expires_at: "2026-09-30",
  auto_approve: true,
  enabled: true,
  status: "active",
} as const

afterEach(() => vi.restoreAllMocks())

describe("scheduled task HTTP client", () => {
  it("uses the typed list path and maps the wire projection to the surface record", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [wireTask] }), { status: 200 }))

    const tasks = await createScheduledTaskClient(fetcher).listScheduledTasks()

    expect(fetcher).toHaveBeenCalledWith("/api/scheduled-tasks", { cache: "no-store" })
    expect(tasks).toEqual([{
      id: "scheduled_1",
      title: "Daily digest",
      prompt: "Run the digest",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      nextRun: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-09-30",
      autoApprove: true,
      enabled: true,
      status: "active",
    }])
  })

  it("sends strict create and update request bodies and parses mutation receipts", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: { ...wireTask, enabled: false, status: "paused" } }), { status: 200 }))
    const client = createScheduledTaskClient(fetcher)

    await client.createScheduledTask?.({
      title: "Daily digest",
      prompt: "Run the digest",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      expiresAt: "2026-09-30",
      autoApprove: true,
    })
    await client.updateScheduledTask?.("scheduled_1", { enabled: false, status: "paused" })

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/scheduled-tasks", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Daily digest",
        prompt: "Run the digest",
        frequency: "daily",
        time: "08:00",
        timezone: "UTC",
        expires_at: "2026-09-30",
        auto_approve: true,
      }),
    }))
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/scheduled-tasks/scheduled_1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ enabled: false, status: "paused" }),
    }))
  })

  it("parses retry and delete responses while preserving typed HTTP errors", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "resource.version_conflict", code: "resource.version_conflict" }), { status: 409 }))
    const client = createScheduledTaskClient(fetcher)

    await client.retryScheduledTask?.("scheduled_1")
    await client.deleteScheduledTask?.("scheduled_1")
    await expect(client.updateScheduledTask?.("scheduled_1", { enabled: false })).rejects.toMatchObject({
      reason: "http",
      status: 409,
      code: "resource.version_conflict",
    })

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/scheduled-tasks/scheduled_1/retry", expect.objectContaining({ method: "POST" }))
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/scheduled-tasks/scheduled_1", expect.objectContaining({ method: "DELETE" }))
  })

  it("rejects a successful response that is outside the strict response schema", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [{ ...wireTask, extra: true }] }), { status: 200 }))

    await expect(createScheduledTaskClient(fetcher).listScheduledTasks()).rejects.toMatchObject({ reason: "parse" })
  })

  it("reports invalid mutation input as a typed parse error before making a request", async () => {
    const fetcher = vi.fn()

    await expect(createScheduledTaskClient(fetcher).createScheduledTask?.({
      title: "",
      prompt: "Run the digest",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    })).rejects.toMatchObject({ reason: "parse", status: null })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
