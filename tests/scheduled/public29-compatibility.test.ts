import { expect, it, vi } from "vitest"
import { scheduledTaskCreateRequestSchema, scheduledTaskListResponseSchema } from "@/contract/scheduled"
import { createScheduledTaskClient } from "@/features/scheduled-tasks"

const calendar = { trigger_kind: "calendar", id: "calendar-29", title: "Calendar", prompt: "Digest", frequency: "daily", time: "08:00", timezone: "UTC", next_run_at: null, auto_approve: false, enabled: true, status: "active" } as const
const rss = { trigger_kind: "rss", id: "rss-29", title: "Feed", prompt: "Digest", feed_url: "https://news.example.com/rss", conditions: [], next_run_at: null, auto_approve: false, enabled: true, status: "active" } as const

it("sends the explicit calendar trigger required by Public29 without changing its rule", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ task: calendar }), { status: 200 }))
  const draft = { triggerKind: "calendar" as const, title: calendar.title, prompt: calendar.prompt, frequency: calendar.frequency, time: calendar.time, timezone: calendar.timezone, autoApprove: false }
  const pending = createScheduledTaskClient(fetcher).createScheduledTask(draft)
  // Attach settlement before inspecting the independently observable request.
  const result = pending.then(task => ({ task }), error => ({ error }))
  expect(fetcher).toHaveBeenCalledOnce()
  const init = fetcher.mock.calls[0]?.[1]
  expect(JSON.parse(String(init?.body))).toMatchObject({ trigger_kind: "calendar", frequency: "daily", time: "08:00", timezone: "UTC" })
  expect(await result).toMatchObject({ task: { id: calendar.id, triggerKind: "calendar" } })
})

it("accepts current RSS facts alongside calendar facts without inventing a calendar next run", () => {
  const rssCreate = { trigger_kind: rss.trigger_kind, title: rss.title, prompt: rss.prompt, feed_url: rss.feed_url, conditions: rss.conditions, auto_approve: rss.auto_approve }
  expect(scheduledTaskCreateRequestSchema.parse(rssCreate)).toEqual(rssCreate)
  const current = { tasks: [
    { ...calendar, scheduling_state: "pending" },
    { ...rss, scheduling_state: "active", feed_state: "active", last_checked_at: null, next_check_at: "2026-11-02T08:00:00.000Z", error_code: null },
  ] }
  expect(scheduledTaskListResponseSchema.parse(current)).toEqual(current)
  expect(scheduledTaskListResponseSchema.safeParse({ tasks: [{ ...current.tasks[1], next_run_at: "2026-11-03T08:00:00.000Z" }] }).success).toBe(false)
})
