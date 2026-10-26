import { afterEach, describe, expect, it, vi } from "vitest"

import { createScheduledTaskClient, pendingScheduledTaskCreate } from "@/features/scheduled-tasks"

const wireTask = { trigger_kind: "calendar" as const,
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
  it("forwards the selected calendar rule as a complete PATCH and never submits owner next or retired anchors", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
    const client = createScheduledTaskClient(fetcher)
    const rules = [{ frequency: "weekly" as const, weekdays: [1, 4] }, { frequency: "monthly" as const, monthDays: [1, 31] }, { frequency: "once" as const, localDate: "2030-02-28" }]
    for (const rule of rules) {
      const draft = { triggerKind: "calendar" as const, title: "Rule", prompt: "Run", time: "09:00", timezone: "Asia/Tokyo", autoApprove: false, ...rule }
      await client.createScheduledTask(draft)
      await client.updateScheduledTask("scheduled_1", { triggerKind: "calendar", time: draft.time, timezone: draft.timezone, ...rule })
    }
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body))).toMatchObject([
      { weekdays: [1, 4] }, { weekdays: [1, 4] }, { month_days: [1, 31] }, { month_days: [1, 31] }, { local_date: "2030-02-28" }, { local_date: "2030-02-28" },
    ])
    await expect(client.updateScheduledTask("scheduled_1", { weekdays: [2] })).rejects.toMatchObject({ reason: "parse" })
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it("keeps an old command snapshot separate from current read facts and rejects an unpaired read", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [{ ...wireTask, title: "Current rule", scheduling_state: "pending", next_run_at: null }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [wireTask] }), { status: 200 }))
    const client = createScheduledTaskClient(fetcher)
    const receipt = await client.updateScheduledTask("scheduled_1", { enabled: false })
    expect(receipt.title).toBe("Daily digest")
    expect(receipt).not.toHaveProperty("schedulingState")
    expect(await client.listScheduledTasks()).toMatchObject([{ title: "Current rule", schedulingState: "pending", nextRun: null }])
    expect(receipt.title).toBe("Daily digest")
    await expect(client.listScheduledTasks()).rejects.toMatchObject({ reason: "parse", status: 200 })
  })

  it("joins an in-flight original create when its dialog is reopened instead of dispatching a competing retry", async () => {
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => {
      resolve = done
    })
    const fetcher = vi.fn().mockReturnValue(pending)
    const client = createScheduledTaskClient(fetcher)
    const draft = { triggerKind: "calendar" as const,
      title: "Digest",
      prompt: "Run it",
      frequency: "daily" as const,
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    }
    const first = client.createScheduledTask(draft)
    const reopened = client.createScheduledTask(draft)
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolve(new Response(JSON.stringify({ task: wireTask }), { status: 200 }))
    await expect(first).resolves.toMatchObject({ id: "scheduled_1" })
    await expect(reopened).resolves.toMatchObject({ id: "scheduled_1" })
    expect(pendingScheduledTaskCreate(client)).toBeUndefined()
  })

  it("keeps a previously unknown identity through an authentication rejection", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("unreachable", { status: 502 }))
      .mockResolvedValueOnce(new Response("session recheck", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task: wireTask }), { status: 200 }),
      )
    const client = createScheduledTaskClient(fetcher)
    await expect(
      client.retryScheduledTask("scheduled_1"),
    ).rejects.toMatchObject({ status: 502 })
    await expect(
      client.retryScheduledTask("scheduled_1"),
    ).rejects.toMatchObject({ status: 401 })
    await client.retryScheduledTask("scheduled_1")
    expect(
      new Set(
        fetcher.mock.calls.map(([, init]) =>
          new Headers(init?.headers).get("Idempotency-Key"),
        ),
      ).size,
    ).toBe(1)
  })

  it("retains an unknown create draft outside its dialog and blocks replacement in the same context", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("unreachable", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task: wireTask }), { status: 200 }),
      )
    const client = createScheduledTaskClient(fetcher)
    const draft = { triggerKind: "calendar" as const,
      title: "Weekly digest",
      prompt: "Run the digest",
      frequency: "weekly" as const,
      time: "08:00",
      timezone: "UTC",
      weekdays: [2, 4],
      autoApprove: false,
    }
    const frozenDraft = structuredClone(draft)
    await expect(client.createScheduledTask(draft)).rejects.toMatchObject({
      status: 502,
    })
    draft.weekdays.push(6)
    const exposed = pendingScheduledTaskCreate(client)!
    exposed.weekdays!.push(0)
    expect(pendingScheduledTaskCreate(client)).toEqual(frozenDraft)
    await expect(
      client.createScheduledTask({ ...draft, title: "Different" }),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await client.createScheduledTask(frozenDraft)
    expect(pendingScheduledTaskCreate(client)).toBeUndefined()
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(fetcher.mock.calls[0]?.[1]?.body)
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      weekdays: frozenDraft.weekdays,
    })
    expect(
      new Set(
        fetcher.mock.calls.map(([, init]) =>
          new Headers(init?.headers).get("Idempotency-Key"),
        ),
      ).size,
    ).toBe(1)
  })

  it("freezes dispatch during admission recheck and retains the original command after a late ACK", async () => {
    let generation: number | null = 1
    let resolve!: (value: unknown) => void
    const body = new Promise((done) => {
      resolve = done
    })
    const response = new Response()
    vi.spyOn(response, "json").mockImplementation(() => body)
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task: wireTask }), { status: 200 }),
      )
    const client = createScheduledTaskClient(fetcher, () => generation)
    const save = client.retryScheduledTask("scheduled_1")
    await Promise.resolve()
    generation = null
    resolve({ task: wireTask })
    await expect(save).rejects.toMatchObject({ reason: "network" })
    await expect(client.listScheduledTasks()).rejects.toMatchObject({
      reason: "network",
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    generation = 2
    await client.retryScheduledTask("scheduled_1")
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key"),
    ).toBe(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"),
    )
  })

  it("uses the typed list path and maps the wire projection to the surface record", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [{ ...wireTask, scheduling_state: "active" }] }), { status: 200 }))

    const tasks = await createScheduledTaskClient(fetcher).listScheduledTasks()

    expect(fetcher).toHaveBeenCalledWith("/api/scheduled-tasks", { cache: "no-store" })
    expect(tasks).toEqual([{ triggerKind: "calendar" as const,
      id: "scheduled_1",
      title: "Daily digest",
      prompt: "Run the digest",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      nextRun: "2026-09-15T08:00:00.000Z",
      schedulingState: "active",
      expiresAt: "2026-09-30T23:59:59.999Z",
      autoApprove: true,
      enabled: true,
      status: "active",
    }])
  })

  it("preserves owner null and confirmed-string next runs from an actual Response", async () => {
    const confirmedNextRun = "2026-10-15T08:00:00.000Z"
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      tasks: [
        { ...wireTask, id: "scheduled_paused", scheduling_state: "active", status: "paused", enabled: false, next_run_at: null },
        { ...wireTask, id: "scheduled_confirmed", scheduling_state: "active", next_run_at: confirmedNextRun },
      ],
    }), { status: 200 })

    const tasks = await createScheduledTaskClient(fetcher).listScheduledTasks()

    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({ id: "scheduled_paused", nextRun: null, schedulingState: "active" })
    expect(tasks[1]).toMatchObject({ id: "scheduled_confirmed", nextRun: confirmedNextRun })
  })

  it("sends strict create and update request bodies and parses mutation receipts", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: wireTask }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task: { ...wireTask, enabled: false, status: "paused" } }), { status: 200 }))
    const client = createScheduledTaskClient(fetcher)

    await client.createScheduledTask({ triggerKind: "calendar" as const,
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
      body: JSON.stringify({ trigger_kind: "calendar" as const,
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

    await expect(createScheduledTaskClient(fetcher).createScheduledTask({ triggerKind: "calendar" as const,
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
  it.each([408, 425, 500, 502, 503, 504, 409])(
    "keeps the original command for an uncertain HTTP %s result",
    async (status) => {
      const code =
        status === 409
          ? "idempotency_in_progress"
          : "scheduled_tasks_unreachable"
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "pending", code }), { status }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ task: wireTask }), { status: 200 }),
        )
      const client = createScheduledTaskClient(fetcher)
      await expect(
        client.retryScheduledTask("scheduled_1"),
      ).rejects.toMatchObject({ status })
      await client.retryScheduledTask("scheduled_1")
      expect(
        new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key"),
      ).toBe(
        new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"),
      )
    },
  )

  it.each(["update", "retry"] as const)(
    "rejects a %s ACK for another task without retiring the command",
    async (operation) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ task: { ...wireTask, id: "another_task" } }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ task: wireTask }), { status: 200 }),
        )
      const client = createScheduledTaskClient(fetcher)
      const submit = () =>
        operation === "update"
          ? client.updateScheduledTask("scheduled_1", { enabled: false })
          : client.retryScheduledTask("scheduled_1")
      await expect(submit()).rejects.toMatchObject({ reason: "parse" })
      await submit()
      expect(
        new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key"),
      ).toBe(
        new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"),
      )
    },
  )
})

describe("R80 scheduled task project association client", () => {
  it("accepts the canonical project ID in an ACK when the request used its supported slug", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            task: { ...wireTask, project_id: "project_canonical" },
          }),
          { status: 201 },
        ),
      )
    const client = createScheduledTaskClient(fetcher)
    const task = await client.createScheduledTask({ triggerKind: "calendar" as const,
      projectId: "my-project",
      title: "Digest",
      prompt: "Run it",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    })
    expect(task.projectId).toBe("project_canonical")
    expect(pendingScheduledTaskCreate(client, "my-project")).toBeUndefined()
  })

  it("sends projectId only as project_id in the collection POST body and maps the owner receipt", async () => {
    const projectTask = { ...wireTask, project_id: "project/真实" }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task: projectTask }), { status: 201 }))

    const task = await createScheduledTaskClient(fetcher).createScheduledTask({ triggerKind: "calendar" as const,
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
      body: JSON.stringify({ trigger_kind: "calendar" as const,
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
    const personal = { triggerKind: "calendar" as const,
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
    const draft = { triggerKind: "calendar" as const,
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

it("I6 freezes every RSS condition clause and reuses the exact unknown body and key after reopening", async () => {
  const ack = { id: "rss-1", title: "Feed", prompt: "Summarize", trigger_kind: "rss", feed_url: "https://news.example.com/feed", conditions: [[{ field: "title", operator: "contains", value: "release" }]], next_run_at: null, auto_approve: false, enabled: true, status: "active" }
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(Response.json({ task: ack }))
  const client = createScheduledTaskClient(fetcher)
  const draft = { triggerKind: "rss" as const, title: "Feed", prompt: "Summarize", feedUrl: ack.feed_url, conditions: [[{ field: "title" as const, operator: "contains" as const, value: "release" }]], autoApprove: false }
  const original = structuredClone(draft)
  await expect(client.createScheduledTask(draft)).rejects.toMatchObject({ status: 503 })
  draft.conditions[0]![0]!.value = "mutated caller"
  const exposed = pendingScheduledTaskCreate(client)!
  if (exposed.triggerKind !== "rss") throw new Error("Expected RSS intent")
  exposed.conditions[0]![0]!.value = "mutated recovered clone"
  expect(pendingScheduledTaskCreate(client)).toEqual(original)
  await expect(client.createScheduledTask(draft)).rejects.toThrow("Recover the original")
  expect(fetcher).toHaveBeenCalledTimes(1)
  const result = await client.createScheduledTask(original)
  expect(result).toMatchObject({ triggerKind: "rss", feedUrl: ack.feed_url, conditions: original.conditions, nextRun: null })
  expect(result).not.toHaveProperty("feedState")
  const first = fetcher.mock.calls[0]![1]!, second = fetcher.mock.calls[1]![1]!
  expect(second.body).toBe(first.body)
  expect(new Headers(second.headers).get("Idempotency-Key")).toBe(new Headers(first.headers).get("Idempotency-Key"))
  expect(JSON.parse(String(second.body))).toEqual({ trigger_kind: "rss", title: "Feed", prompt: "Summarize", feed_url: ack.feed_url, conditions: original.conditions, auto_approve: false })
  expect(pendingScheduledTaskCreate(client)).toBeUndefined()
})
