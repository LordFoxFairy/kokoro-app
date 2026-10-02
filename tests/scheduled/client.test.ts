import { afterEach, describe, expect, it, vi } from "vitest"

import { createScheduledTaskClient } from "@/features/scheduled-tasks"

const wireTask = {
  id: "scheduled_1",
  title: "Daily digest",
  prompt: "Run the digest",
  frequency: "daily",
  time: "08:00",
  timezone: "UTC",
  next_run_at: "2026-09-15T08:00:00.000Z",
  expires_at: "2026-09-30T23:59:59.999Z",
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
      expiresAt: "2026-09-30T23:59:59.999Z",
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

    await client.createScheduledTask({
      title: "Daily digest",
      prompt: "Run the digest",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      expiresAt: "2026-09-30T23:59:59.999Z",
      autoApprove: true,
    })
    await client.updateScheduledTask("scheduled_1", { enabled: false, status: "paused" })

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/scheduled-tasks", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "content-type": "application/json", "Idempotency-Key": expect.any(String) }),
      body: JSON.stringify({
        title: "Daily digest",
        prompt: "Run the digest",
        frequency: "daily",
        time: "08:00",
        timezone: "UTC",
        expires_at: "2026-09-30T23:59:59.999Z",
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

    await client.retryScheduledTask("scheduled_1")
    await client.deleteScheduledTask("scheduled_1")
    await expect(client.updateScheduledTask("scheduled_1", { enabled: false })).rejects.toMatchObject({
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

    await expect(createScheduledTaskClient(fetcher).createScheduledTask({
      title: "",
      prompt: "Run the digest",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    })).rejects.toMatchObject({ reason: "parse", status: null })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("sends an explicit null when an update clears expiry", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task: { ...wireTask, expires_at: undefined } }), { status: 200 }))

    await createScheduledTaskClient(fetcher).updateScheduledTask("scheduled_1", { expiresAt: null })

    expect(fetcher).toHaveBeenCalledWith("/api/scheduled-tasks/scheduled_1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ expires_at: null }),
    }))
  })

  it("reuses one command identity after an unknown network result and rotates it after success", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
    const client = createScheduledTaskClient(fetcher)
    const patch = { enabled: false, status: "paused" as const }

    await expect(client.updateScheduledTask("scheduled_1", patch)).rejects.toMatchObject({ reason: "network" })
    await client.updateScheduledTask("scheduled_1", patch)
    await client.updateScheduledTask("scheduled_1", patch)

    const firstKey = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")
    const retryKey = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key")
    const nextIntentKey = new Headers(fetcher.mock.calls[2]?.[1]?.headers).get("Idempotency-Key")
    expect(firstKey).toBeTruthy()
    expect(retryKey).toBe(firstKey)
    expect(nextIntentKey).not.toBe(firstKey)
  })

  it("rotates command identity after a definitive business failure", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "task.conflict", code: "task.conflict" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
    const client = createScheduledTaskClient(fetcher)

    await expect(client.retryScheduledTask("scheduled_1")).rejects.toMatchObject({ reason: "http", status: 409 })
    await client.retryScheduledTask("scheduled_1")

    const failedKey = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")
    const nextKey = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key")
    expect(nextKey).not.toBe(failedKey)
  })
})

describe("R80 scheduled task project association client", () => {
  it("sends projectId only as project_id in the collection POST body and maps the owner receipt", async () => {
    const projectTask = { ...wireTask, project_id: "project/真实" }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task: projectTask }), { status: 201 }))

    const task = await createScheduledTaskClient(fetcher).createScheduledTask({
      projectId: "project/真实",
      title: "Project digest",
      prompt: "Run it",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    })

    expect(fetcher).toHaveBeenCalledWith("/api/scheduled-tasks", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        project_id: "project/真实",
        title: "Project digest",
        prompt: "Run it",
        frequency: "daily",
        time: "08:00",
        timezone: "UTC",
        auto_approve: false,
      }),
    }))
    expect(task).toMatchObject({ id: "scheduled_1", projectId: "project/真实" })
  })

  it("keeps personal create and patch free of project association and preserves typed project 404", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Project was not found", code: "project_not_found" }), { status: 404 }))
    const client = createScheduledTaskClient(fetcher)
    const personal = {
      title: "Personal digest",
      prompt: "Run it",
      frequency: "daily" as const,
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    }

    await client.createScheduledTask(personal)
    await client.updateScheduledTask("scheduled_1", { title: "Renamed" })
    await expect(client.createScheduledTask({ ...personal, projectId: "missing" })).rejects.toMatchObject({
      reason: "http",
      status: 404,
      code: "project_not_found",
    })

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/scheduled-tasks")
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).not.toHaveProperty("project_id")
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).not.toHaveProperty("project_id")
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/scheduled-tasks")
  })

  it("keeps unknown project creates on their original command identity without sharing it across contexts", async () => {
    const projectA = { ...wireTask, id: "scheduled_a", project_id: "project-a" }
    const projectB = { ...wireTask, id: "scheduled_b", project_id: "project-b" }
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: projectB }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: projectA }), { status: 201 }))
    const client = createScheduledTaskClient(fetcher)
    const draft = {
      title: "Project digest",
      prompt: "Run it",
      frequency: "daily" as const,
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    }

    await expect(client.createScheduledTask({ ...draft, projectId: "project-a" })).rejects.toMatchObject({ reason: "network" })
    await client.createScheduledTask({ ...draft, projectId: "project-b" })
    await client.createScheduledTask({ ...draft, projectId: "project-a" })

    const projectAKey = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")
    const projectBKey = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key")
    const projectARetryKey = new Headers(fetcher.mock.calls[2]?.[1]?.headers).get("Idempotency-Key")
    expect(projectAKey).toBeTruthy()
    expect(projectBKey).not.toBe(projectAKey)
    expect(projectARetryKey).toBe(projectAKey)
  })
})
