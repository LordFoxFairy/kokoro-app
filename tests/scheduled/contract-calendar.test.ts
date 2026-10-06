import { describe, expect, it } from "vitest"

import {
  scheduledTaskCreateRequestSchema,
  scheduledTaskPatchRequestSchema,
  scheduledTaskRecordSchema,
} from "@/contract/scheduled"
import {
  isScheduledTaskRecord,
  nextPreviewRun,
  scheduledDateKey,
  startOfMonth,
} from "@/features/scheduled-tasks"

const requiredRecord = {
  id: "scheduled_1",
  title: "Digest",
  prompt: "Run it",
  frequency: "daily",
  time: "08:00",
  timezone: "America/New_York",
  next_run_at: null,
  auto_approve: false,
  enabled: true,
  status: "active",
} as const

const requiredCreate = {
  title: "Digest",
  prompt: "Run it",
  frequency: "daily",
  time: "08:00",
  timezone: "America/New_York",
  auto_approve: false,
} as const

describe("scheduled task UTC contract", () => {
  it("requires nullable next_run_at and accepts only owner UTC instants when present", () => {
    const completeRecord = {
      ...requiredRecord,
      next_run_at: "2026-09-15T08:00:00.000Z",
    }
    for (const field of [
      "id",
      "title",
      "prompt",
      "frequency",
      "time",
      "timezone",
      "next_run_at",
      "auto_approve",
      "enabled",
      "status",
    ] as const) {
      const missingRequiredField: Record<string, unknown> = { ...completeRecord }
      delete missingRequiredField[field]
      expect(
        scheduledTaskRecordSchema.safeParse(missingRequiredField).success,
        `owner record must require ${field}`,
      ).toBe(false)
    }
    expect(scheduledTaskRecordSchema.safeParse(requiredRecord).success).toBe(true)
    expect(scheduledTaskRecordSchema.safeParse({
      ...requiredRecord,
      next_run_at: "2026-09-15T08:00:00.000Z",
      expires_at: "2026-09-30T23:59:59.999Z",
    }).success).toBe(true)
    expect(scheduledTaskRecordSchema.safeParse({
      id: requiredRecord.id,
      title: requiredRecord.title,
      prompt: requiredRecord.prompt,
      frequency: requiredRecord.frequency,
      time: requiredRecord.time,
      timezone: requiredRecord.timezone,
      auto_approve: requiredRecord.auto_approve,
      enabled: requiredRecord.enabled,
      status: requiredRecord.status,
    }).success).toBe(false)
    expect(scheduledTaskRecordSchema.safeParse({ ...requiredRecord, expires_at: "2026-09-30" }).success).toBe(false)
    expect(scheduledTaskRecordSchema.safeParse({ ...requiredRecord, expires_at: "2026-09-30T23:59:59.999+00:00" }).success).toBe(false)
  })

  it("uses an optional UTC recurrence anchor for create and PATCH without accepting owner next_run_at", () => {
    expect(scheduledTaskCreateRequestSchema.safeParse({
      ...requiredCreate,
      recurrence_anchor_at: "2026-09-15T08:00:00.000Z",
      expires_at: "2026-09-30T23:59:59.999Z",
    }).success).toBe(true)
    expect(scheduledTaskPatchRequestSchema.safeParse({
      recurrence_anchor_at: "2026-09-15T08:00:00.000Z",
    }).success).toBe(true)
    expect(scheduledTaskCreateRequestSchema.safeParse({ ...requiredCreate }).success).toBe(true)
    expect(scheduledTaskPatchRequestSchema.safeParse({})).toMatchObject({ success: true })
    expect(scheduledTaskCreateRequestSchema.safeParse({
      ...requiredCreate,
      next_run_at: "2026-09-15T08:00:00.000Z",
    }).success).toBe(false)
    expect(scheduledTaskPatchRequestSchema.safeParse({
      next_run_at: "2026-09-15T08:00:00.000Z",
    }).success).toBe(false)
    expect(scheduledTaskCreateRequestSchema.safeParse({
      ...requiredCreate,
      recurrence_anchor_at: "2026-09-15T08:00:00.000+00:00",
    }).success).toBe(false)
    expect(scheduledTaskCreateRequestSchema.safeParse({ ...requiredCreate, expires_at: "2026-09-30" }).success).toBe(false)
    expect(scheduledTaskCreateRequestSchema.safeParse({ ...requiredCreate, expires_at: null }).success).toBe(false)
    expect(scheduledTaskPatchRequestSchema.parse({ expires_at: null })).toEqual({ expires_at: null })
  })

  it("requires a valid IANA timezone at every wire boundary", () => {
    expect(scheduledTaskCreateRequestSchema.safeParse({ ...requiredCreate, timezone: "Mars/Olympus" }).success).toBe(false)
    expect(scheduledTaskRecordSchema.safeParse({ ...requiredRecord, timezone: "Mars/Olympus" }).success).toBe(false)
  })
})

describe("scheduled task IANA calendar", () => {
  it("groups a UTC instant by the explicit display timezone across midnight", () => {
    expect(scheduledDateKey("2026-09-15T00:30:00.000Z", "America/Los_Angeles")).toBe("2026-09-14")
    expect(scheduledDateKey("2026-09-15T00:30:00.000Z", "Asia/Tokyo")).toBe("2026-09-15")
  })

  it("builds the visible month from the explicit display timezone", () => {
    const instant = new Date("2026-10-01T00:30:00.000Z")

    expect(startOfMonth(instant, "America/Los_Angeles").toISOString()).toBe("2026-09-01T00:00:00.000Z")
    expect(startOfMonth(instant, "Asia/Tokyo").toISOString()).toBe("2026-10-01T00:00:00.000Z")
  })

  it("computes daily preview runs across the spring DST transition", () => {
    const now = new Date("2026-03-08T06:00:00.000Z")

    expect(nextPreviewRun("03:30", "daily", "America/New_York", now)).toBe("2026-03-08T07:30:00.000Z")
    expect(nextPreviewRun("02:30", "daily", "America/New_York", now)).toBe("2026-03-08T07:30:00.000Z")
  })

  it("chooses the first matching instant when fall DST repeats a local time", () => {
    const now = new Date("2026-11-01T04:00:00.000Z")

    expect(nextPreviewRun("01:30", "daily", "America/New_York", now)).toBe("2026-11-01T05:30:00.000Z")
  })

  it("advances a weekly local date without freezing the old UTC offset", () => {
    const now = new Date("2026-03-04T15:00:00.000Z")

    expect(nextPreviewRun("08:00", "weekly", "America/New_York", now)).toBe("2026-03-11T12:00:00.000Z")
  })
})

describe("scheduled task runtime record guard", () => {
  it("preserves nullable owner next-run state while validating every optional field", () => {
    expect(isScheduledTaskRecord({
      ...requiredRecord,
      timezone: "America/New_York",
      nextRun: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-09-30T23:59:59.999Z",
      autoApprove: true,
      enabled: true,
      status: "active",
    })).toBe(true)
    expect(isScheduledTaskRecord({ ...requiredRecord, nextRun: null })).toBe(true)
    expect(isScheduledTaskRecord({ ...requiredRecord, timezone: 42 })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, nextRun: "tomorrow" })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, expiresAt: "2026-09-30" })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, autoApprove: "yes" })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, enabled: 1 })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, status: "done" })).toBe(false)
  })
})

describe("R80 project-associated scheduled task contract", () => {
  it("accepts only an exact optional project_id on create and owner records while excluding it from patch", () => {
    for (const project_id of ["project_1", "project slug", "项目/一"]) {
      expect(scheduledTaskCreateRequestSchema.safeParse({ ...requiredCreate, project_id }).success).toBe(true)
      expect(scheduledTaskRecordSchema.safeParse({ ...requiredRecord, project_id }).success).toBe(true)
    }

    for (const project_id of ["", " ", " project_1", "project_1 ", null]) {
      expect(scheduledTaskCreateRequestSchema.safeParse({ ...requiredCreate, project_id }).success).toBe(false)
      expect(scheduledTaskRecordSchema.safeParse({ ...requiredRecord, project_id }).success).toBe(false)
    }
    expect(scheduledTaskCreateRequestSchema.safeParse({ ...requiredCreate, project_ref: "project_1" }).success).toBe(false)
    expect(scheduledTaskPatchRequestSchema.safeParse({ project_id: "project_1" }).success).toBe(false)
  })

  it("keeps the runtime record guard aligned with the exact owner project reference", () => {
    expect(isScheduledTaskRecord({ ...requiredRecord, projectId: "project_1" })).toBe(true)
    expect(isScheduledTaskRecord({ ...requiredRecord, projectId: " project_1" })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, projectId: "project_1 " })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, projectId: 42 })).toBe(false)
  })
})
