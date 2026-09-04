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
  frequency: "daily",
  time: "08:00",
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
  it("accepts owner ISO instants and rejects date-only or offset timestamps", () => {
    expect(scheduledTaskRecordSchema.safeParse({
      ...requiredRecord,
      next_run_at: "2026-09-15T08:00:00.000Z",
      expires_at: "2026-09-30T23:59:59.999Z",
    }).success).toBe(true)
    expect(scheduledTaskRecordSchema.safeParse({ ...requiredRecord, expires_at: "2026-09-30" }).success).toBe(false)
    expect(scheduledTaskRecordSchema.safeParse({ ...requiredRecord, expires_at: "2026-09-30T23:59:59.999+00:00" }).success).toBe(false)
  })

  it("uses an ISO instant for create and explicit null only for patch clear", () => {
    expect(scheduledTaskCreateRequestSchema.safeParse({
      ...requiredCreate,
      expires_at: "2026-09-30T23:59:59.999Z",
    }).success).toBe(true)
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
  it("validates every optional field instead of admitting malformed storage data", () => {
    expect(isScheduledTaskRecord({
      ...requiredRecord,
      timezone: "America/New_York",
      nextRun: "2026-09-15T08:00:00.000Z",
      expiresAt: "2026-09-30T23:59:59.999Z",
      autoApprove: true,
      enabled: true,
      status: "active",
    })).toBe(true)
    expect(isScheduledTaskRecord({ ...requiredRecord, timezone: 42 })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, nextRun: "tomorrow" })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, expiresAt: "2026-09-30" })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, autoApprove: "yes" })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, enabled: 1 })).toBe(false)
    expect(isScheduledTaskRecord({ ...requiredRecord, status: "done" })).toBe(false)
  })
})
