import { expect, it } from "vitest"
import { parseSessionSnapshot } from "@/contract/chat"
const access = { project_id: "project-a", role: "viewer", expires_at: null, access_version: "1", capabilities: ["read"] }
const snapshot = { session: { session_id: "chat-a", title: "Project", owner_id: "peer", created_at: "2026-11-13T00:00:00Z", updated_at: "2026-11-13T00:00:00Z" }, files: [], deliveries: [], deliveries_has_more: false, execution_process: null, event_watermark: null }
it("accepts a safe Project peer busy head with no private process and requires explicit controls", () => {
 const value = { ...snapshot, project_access: access, execution_head: { run_id: "run-peer", state: "active", pending_pauses: [], can_control: false } }
 expect(parseSessionSnapshot(value)).toEqual(value)
 expect(() => parseSessionSnapshot({ ...value, execution_head: { run_id: "run-peer", state: "active", pending_pauses: [] } })).toThrow()
 expect(() => parseSessionSnapshot({ ...value, execution_process: { run_id: "run-peer", todos: null, activities: [], next_cursor: null } })).toThrow()
})
it("accepts a Project FINAL delivery without private asset identity, but not on a direct read", () => {
 const delivery = { conversation_id: "chat-a", artifact_id: "artifact-a", artifact_kind: "document", title: "FINAL", mime: "text/plain", size: 2, run_id: "run-peer", created_at: "2026-11-13T00:00:00Z" }
 expect(parseSessionSnapshot({ ...snapshot, project_access: access, deliveries: [delivery] }).deliveries).toEqual([delivery])
 expect(() => parseSessionSnapshot({ ...snapshot, deliveries: [delivery] })).toThrow()
})
