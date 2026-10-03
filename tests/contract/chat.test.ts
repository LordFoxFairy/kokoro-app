import { describe, expect, it } from "vitest"

import { sessionSnapshotSchema } from "@/contract/chat"

const activityId = `act_${"a".repeat(64)}`
const segmentId = `seg_${"b".repeat(64)}`

function public7Snapshot(executionProcess: unknown) {
  return {
    session: {
      session_id: "ses_r135",
      title: "R135",
      owner_id: "user_1",
      created_at: "2026-10-03T00:00:00Z",
      updated_at: "2026-10-03T00:00:01Z",
    },
    files: [],
    deliveries: [],
    deliveries_has_more: false,
    event_watermark: "agui_00000000000000000000000000000011",
    execution_process: executionProcess,
  }
}

describe("R135 public7 snapshot process contract", () => {
  it("accepts the required nullable process without making messages required", () => {
    expect(sessionSnapshotSchema.parse(public7Snapshot(null))).toMatchObject({ execution_process: null })
  })

  it("distinguishes unobserved todos from an explicit ordered clear", () => {
    const base = { run_id: "run_a", activities: [], next_cursor: null }
    expect(sessionSnapshotSchema.parse(public7Snapshot({ ...base, todos: null }))).toMatchObject({
      execution_process: { todos: null },
    })
    expect(sessionSnapshotSchema.parse(public7Snapshot({ ...base, todos: [] }))).toMatchObject({
      execution_process: { todos: [] },
    })
  })

  it("accepts the closed safe tool activity and rejects raw private fields", () => {
    const safe = {
      activity: "tool",
      activity_id: activityId,
      segment_id: segmentId,
      status: "running",
      display_code: "tool.execution",
    }
    const process = { run_id: "run_a", todos: null, activities: [safe], next_cursor: null }
    expect(sessionSnapshotSchema.parse(public7Snapshot(process))).toMatchObject({ execution_process: process })
    expect(() => sessionSnapshotSchema.parse(public7Snapshot({
      ...process,
      activities: [{ ...safe, name: "private", args: { token: "secret" } }],
    }))).toThrow()
  })

  it("counts todo content by Unicode scalar and enforces the Skill conditional shape", () => {
    const skill = {
      activity: "skill",
      activity_id: activityId,
      preflight_id: `spf_${"c".repeat(64)}`,
      source_refs: ["skill:alpha"],
      phase: "ready",
    }
    const accepted = public7Snapshot({
      run_id: "run_a",
      todos: [{ content: "😀".repeat(1024), status: "pending" }],
      activities: [skill],
      next_cursor: null,
    })
    expect(() => sessionSnapshotSchema.parse(accepted)).not.toThrow()
    expect(() => sessionSnapshotSchema.parse(public7Snapshot({
      run_id: "run_a", todos: null, activities: [{ ...skill, error_code: null }], next_cursor: null,
    }))).toThrow()
  })
})
