import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import YAML from "yaml"
import { expect, it } from "vitest"
import { scheduledRunsCursor, validateScheduledRunsError, validateScheduledRunsPage } from "@/contract/scheduled-task-runs"
import { restoreRunHistoryParent } from "./bff-run-history-parent"

const scheduled = "2026-10-21T23:30:00.123456789Z"
const item = { trigger_kind: "calendar" as const, task_id: "task-A", title: "真实运行", project_ref: "project-A", run_id: "run-A", scheduled_for: scheduled, state: "completed", terminal_event_at: "2026-10-21T23:32:00.456Z" }
const query = { limit: 20, taskId: "task-A" }
const identity = { tenantId: "tenant-A", subjectId: "subject-A" }
function cursor(changes: Record<string, unknown> = {}) {
 return `str1_${Buffer.from(JSON.stringify({ ...identity, taskId: "task-A", limit: 20, sort: "occurrence_order_key:C:desc,dispatch_id:C:desc", orderKey: scheduled, dispatchId: "dispatch-Z", ...changes })).toString("base64url")}`
}
const page = (items: unknown[] = [item], next_cursor: string | null = null) => ({ data: { items, next_cursor } })

it("I4 pins all 168 operations and preserves complete public19.1 through the exact inverse", async () => {
 const bytes = await readFile("src/generated/bff-public-openapi.yaml")
 expect(createHash("sha256").update(bytes).digest("hex")).toBe("6574930b3a893a208596e6f27c2f9e09122e759d111a7fdbf2d54c294efc0e8f")
 const spec = YAML.parse(bytes.toString())
 expect(spec.info.version).toBe("20.0.0")
 expect(spec.paths["/v1/scheduled-task-runs"].get.operationId).toBe("listScheduledTaskRuns")
 expect(Object.values(spec.paths).flatMap(path => Object.keys(path as object).filter(key => ["get", "post", "put", "patch", "delete", "head", "options"].includes(key)))).toHaveLength(168)
 expect(createHash("sha256").update(restoreRunHistoryParent(bytes)).digest("hex")).toBe("ac649109f7b394ab894d17352c5f9f106e24e1cbf94e74672569333190adfab5")
})
it("I4 preserves nanosecond text and lossless scalar Unicode identifiers without normalization", () => {
 const unicode = { ...item, task_id: "😀".repeat(255), run_id: "😀".repeat(255), title: "", project_ref: "" }
 expect(validateScheduledRunsPage(page([unicode]), { limit: 1 }).items[0]).toEqual(unicode)
 expect(validateScheduledRunsPage(page(), query, identity).items[0]?.scheduled_for).toBe(scheduled)
})
it.each([
 { ...item, scheduled_for: "2026-02-30T23:30:00.123456789Z" }, { ...item, scheduled_for: "2026-10-21T23:30:00.123Z" },
 { ...item, terminal_event_at: "2026-10-21T23:32:00.456789Z" }, { ...item, state: "admitted" }, { ...item, terminal_event_at: null },
 { ...item, title: "\ud800" }, { ...item, project_ref: "\udfff" }, { ...item, run_id: "😀".repeat(256) }, { ...item, task_id: "different" },
 { ...item, summary: "not a published fact" },
])("I4 rejects invalid closed owner metadata %j", invalid => { expect(() => validateScheduledRunsPage(page([invalid]), query, identity)).toThrow() })
it("I4 rejects duplicate runs, over-limit pages and changed owner time order", () => {
 expect(() => validateScheduledRunsPage(page([item, item]), query, identity)).toThrow()
 expect(() => validateScheduledRunsPage(page([item, { ...item, run_id: "B" }]), { limit: 1 })).toThrow()
 expect(() => validateScheduledRunsPage(page([item, { ...item, run_id: "B", scheduled_for: "2026-10-22T00:00:00.000000000Z" }]), query)).toThrow()
})
it.each([{ tenantId: "foreign" }, { subjectId: "foreign" }, { taskId: null }, { limit: 10 }, { sort: "other" }, { extra: true }])("I4 rejects mismatched cursor scope %j", changes => { expect(() => scheduledRunsCursor(cursor(changes), query, identity)).toThrow() })
it("I4 validates opaque cursor advancement by owner C-byte order, not run id", () => {
 const prior = cursor({ dispatchId: "é" }), next = cursor({ dispatchId: "z" })
 expect(validateScheduledRunsPage(page([item], next), { ...query, cursor: prior }, identity).next_cursor).toBe(next)
 expect(() => validateScheduledRunsPage(page([item], prior), { ...query, cursor: next }, identity)).toThrow()
 expect(() => validateScheduledRunsPage(page([item], prior), { ...query, cursor: prior }, identity)).toThrow()
 expect(() => validateScheduledRunsPage(page([], next), query, identity)).toThrow()
 expect(() => validateScheduledRunsPage(page([item], cursor({ orderKey: "2026-10-20T00:00:00.000000000Z" })), query, identity)).toThrow()
})
it.each([[400, "scheduled_task_runs_input_invalid"], [401, "session_invalid"], [403, "session_forbidden"], [404, "scheduled_task_not_found"], [429, "session_rate_limited"], [500, "internal_error"], [503, "scheduled_task_runs_unavailable"]] as const)("I4 enforces owner error tuple %s %s", (status, code) => {
 const retryable = status === 429 || status === 503
 expect(validateScheduledRunsError({ error: { code, message: "private detail", retryable } }, status)).toEqual({ error: { code, message: code, retryable } })
 expect(() => validateScheduledRunsError({ error: { code, message: "x", retryable: !retryable } }, status)).toThrow()
 expect(() => validateScheduledRunsError({ error: { code: "foreign_code", message: "x", retryable } }, status)).toThrow()
})

it("I6 keeps RSS observation independent from opaque queue position and preserves mixed owner order", () => {
 const rss = { ...item, trigger_kind: "rss", scheduled_for: null, observed_at: "2026-10-20T06:00:00.000Z" }
 const laterObservation = { ...rss, run_id: "rss-2", observed_at: "2026-10-22T09:00:00.000Z" }
 const next = cursor({ orderKey: "2026-10-21T23:29:00.000000001Z" })
 expect(validateScheduledRunsPage(page([rss, laterObservation], next), query, identity).items).toEqual([rss, laterObservation])
 expect(() => validateScheduledRunsPage(page([{ ...rss, scheduled_for: scheduled }]), query)).toThrow()
 expect(() => validateScheduledRunsPage(page([{ ...item, trigger_kind: "calendar", observed_at: rss.observed_at }]), query)).toThrow()
 expect(() => validateScheduledRunsPage(page([rss], cursor({ dispatchId: "A" })), { ...query, cursor: cursor({ dispatchId: "A" }) }, identity)).toThrow()
})
