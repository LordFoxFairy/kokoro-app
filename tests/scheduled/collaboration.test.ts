import { expect, it, vi } from "vitest"
import { createScheduledTaskClient } from "@/features/scheduled-tasks"
import { scheduledTaskDetailsSchema, scheduledTaskRecordSchema } from "@/contract/scheduled"
const legacyAck = {
  id: "task-a",
  title: "Task",
  prompt: "Run",
  frequency: "daily",
  time: "08:00",
  timezone: "UTC",
  next_run_at: null,
  auto_approve: false,
  enabled: false,
  status: "paused",
}
it("requires real revision/executor on current reads without inventing them in historical ACKs", () => {
  expect(scheduledTaskRecordSchema.parse(legacyAck)).not.toHaveProperty("revision")
  expect(scheduledTaskDetailsSchema.safeParse({ ...legacyAck, scheduling_state: "paused" }).success).toBe(false)
  expect(
    scheduledTaskDetailsSchema.parse({ ...legacyAck, scheduling_state: "paused", revision: 28, execution_actor_id: null }),
  ).toMatchObject({ revision: 28, execution_actor_id: null })
})
it("freezes PATCH CAS with its original unknown command and never silently rebases it onto a fresher revision", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("lost ACK"))
    .mockResolvedValueOnce(Response.json({ task: legacyAck }))
  const client = createScheduledTaskClient(fetcher)
  const patch = { enabled: false }
  await expect(client.updateScheduledTask("task-a", patch, 28)).rejects.toMatchObject({ reason: "network" })
  expect(new Headers(fetcher.mock.calls[0]![1].headers).get("if-match")).toBe('"28"')
  await expect(client.updateScheduledTask("task-a", patch, 29)).rejects.toMatchObject({ reason: "network" })
  expect(fetcher).toHaveBeenCalledOnce()
  await client.updateScheduledTask("task-a", patch, 28)
  expect(new Headers(fetcher.mock.calls[1]![1].headers).get("if-match")).toBe('"28"')
  expect(new Headers(fetcher.mock.calls[0]![1].headers).get("idempotency-key")).toBe(
    new Headers(fetcher.mock.calls[1]![1].headers).get("idempotency-key"),
  )
})
