import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

import { scheduledTaskExecutionListResponseSchema } from "@/contract/scheduled"
import { BFF_SCHEDULED_EXECUTIONS_SOURCE } from "@/generated/bff-scheduled-executions/provenance"
import { zListScheduledTaskExecutionsResponse } from "@/generated/bff-scheduled-executions/zod.gen"

it("pins the full owner artifact for the narrow scheduled execution read", async () => {
  const pin = JSON.parse(await readFile(join(process.cwd(), "contract/bff-scheduled-executions-source.json"), "utf8"))
  const source = await readFile(join(process.cwd(), "contract/vendor/kokoro-bff", pin.owner_commit, "openapi.yaml"))
  expect(createHash("sha256").update(source).digest("hex")).toBe(pin.source_sha256)
  expect(BFF_SCHEDULED_EXECUTIONS_SOURCE).toEqual(pin)
  const spec = YAML.parse(source.toString("utf8"))
  expect(spec.info.version).toBe(pin.openapi_version)
  expect(spec.paths["/v1/scheduled-tasks/executions"].get.operationId).toBe("listScheduledTaskExecutions")
})

it("keeps owner states and nullable links strict while leaving cursor bytes opaque", () => {
  const item = {
    execution_id: "execution_1", task_id: "task_1", task_title: "Digest",
    occurrence_at: "2026-11-09T08:00:00.000Z", state: "queued", conversation_id: null,
    project_id: null, run_id: "run_1", assistant_message_id: null, completed_at: null,
  }
  const page = { executions: [item], next_cursor: "opaque+/=?" }
  const envelope = { data: page, meta: { request_id: "request_1" } }
  expect(zListScheduledTaskExecutionsResponse.parse(envelope).data).toEqual(page)
  for (const state of ["queued", "admitted", "streaming", "completed", "failed", "cancelled"]) {
    expect(scheduledTaskExecutionListResponseSchema.parse({ ...page, executions: [{ ...item, state }] }).next_cursor).toBe(page.next_cursor)
  }
  for (const invalid of [
    { ...item, state: "submitted" }, { ...item, project_id: undefined },
    { ...item, completed_at: "not-an-instant" }, { ...item, extra: true },
    { ...item, conversation_id: "conv_1" },
    { ...item, conversation_id: "", assistant_message_id: "" },
  ]) expect(scheduledTaskExecutionListResponseSchema.safeParse({ ...page, executions: [invalid] }).success).toBe(false)
  expect(scheduledTaskExecutionListResponseSchema.safeParse({ ...page, extra: true }).success).toBe(false)
  expect(scheduledTaskExecutionListResponseSchema.safeParse({ ...page, next_cursor: "" }).success).toBe(false)
  expect(scheduledTaskExecutionListResponseSchema.safeParse({ ...page, executions: Array(51).fill(item) }).success).toBe(false)
})
