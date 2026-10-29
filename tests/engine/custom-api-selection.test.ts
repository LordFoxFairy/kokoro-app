import { expect, it } from "vitest"
import type { ConversationStore } from "@/core/conversations"
import { addConversation } from "@/core/conversations"
import { createSessionEngine } from "@/engine/machine"
import { SessionClientError } from "@/engine/client"
import type { PendingSubmission, SubmissionRecovery } from "@/engine/submission-recovery"
import { createFakeClient, createMemoryStorage, makeReceipt, settle } from "./fakes"
it("freezes independent safe API references in the original pending attempt while later draft choices change", async () => {
  const saved: PendingSubmission[] = []
  const recovery: SubmissionRecovery = { read: () => null, save: value => { saved.push(value); return true }, failure: () => undefined, acknowledged: () => null, acknowledge: () => true, abandon: () => true }
  const client = createFakeClient(), engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null), submissionRecovery: recovery })
  const choices = [{ profileId: "profile:a", expectedStateVersion: "7" }]
  engine.setSelectedCustomApiProfiles!(choices)
  choices[0]!.expectedStateVersion = "999"
  client.nextCreate = async () => { throw new SessionClientError("network", "unknown") }
  expect(engine.submit("Use my selected API")).toBe(true)
  engine.setSelectedCustomApiProfiles!([{ profileId: "profile:next", expectedStateVersion: "8" }])
  await settle()
  expect(saved[0]?.options.selectedCustomApiProfiles).toEqual([{ profileId: "profile:a", expectedStateVersion: "7" }])
  expect(Object.isFrozen(saved[0]?.options.selectedCustomApiProfiles)).toBe(true)
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  client.nextCreate = async () => makeReceipt("retried")
  engine.retry(); await settle()
  expect(saved.at(-1)?.idempotencyKey).toBe(saved[0]?.idempotencyKey)
  expect(saved.at(-1)?.options.selectedCustomApiProfiles).toEqual(saved[0]?.options.selectedCustomApiProfiles)
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "profile:next", expectedStateVersion: "8" }])
  engine.dispose()
})
it("bounds unique API selections and retires them on navigation instead of persisting account preference", async () => {
  const storage = createMemoryStorage(addConversation(addConversation(null, "first", 1), "second", 2))
  const engine = createSessionEngine({ client: createFakeClient(), storage })
  await settle()
  engine.setSelectedCustomApiProfiles!([{ profileId: "api:a", expectedStateVersion: "7" }])
  expect(Object.isFrozen(engine.getSnapshot().selectedCustomApiProfiles?.[0])).toBe(true)
  expect(() => engine.setSelectedCustomApiProfiles!([{ profileId: "a", expectedStateVersion: "1" }, { profileId: "a", expectedStateVersion: "2" }])).toThrow()
  expect(() => engine.setSelectedCustomApiProfiles!(Array.from({ length: 33 }, (_, i) => ({ profileId: `api:${i}`, expectedStateVersion: "1" })))).toThrow()
  expect(JSON.stringify(storage.read())).not.toContain("api:a")
  engine.selectConversation("first"); await settle()
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([])
  engine.dispose()
})
it("sends exact formal API refs and retries their original numeric-version JSON rather than a later selection", async () => {
  const client = createFakeClient(), engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
  engine.setSelectedCustomApiProfiles!([{ profileId: "api:original", expectedStateVersion: "7" }])
  client.nextCreate = async () => { throw new SessionClientError("network", "unknown") }
  expect(engine.submit("Use my API")).toBe(true)
  await settle()
  const first = structuredClone(client.createCalls[0])
  expect(first?.body).toHaveProperty("selected_custom_api_profiles", [{ profile_id: "api:original", expected_state_version: 7 }])
  expect(first?.body).not.toHaveProperty("selected_mcp_connection_ids")
  engine.setSelectedCustomApiProfiles!([{ profileId: "api:later", expectedStateVersion: "8" }])
  client.nextCreate = async () => makeReceipt("original-retry")
  engine.retry(); await settle()
  expect(client.createCalls[1]).toEqual(first)
  engine.dispose()
})
