import { describe, expect, it } from "vitest"
import { createSessionEngine } from "@/engine/machine"
import type { CreateMessageArgs } from "@/engine/execution-adapter"
import type { ConversationStore } from "@/core/conversations"
import { SessionClientError } from "@/engine/client"
import { createFakeClient, createMemoryStorage, settle } from "./fakes"

type Intent = CreateMessageArgs & { optimisticUserId: string }
function journal() {
  let pending: { submission: Intent; failureCode: string | null } | null = null
  return {
    read: () => pending,
    save: (submission: Intent) => { pending = { submission: structuredClone(submission), failureCode: null }; return true },
    failure: (_submission: Intent, code: string) => { if (pending) pending.failureCode = code },
    acknowledged: () => null,
    acknowledge: () => { pending = null; return true },
    abandon: () => { pending = null; return true },
  }
}

describe("first submission survives document recreation without dispatching", () => {
  it("503 followed by reload and owner404 keeps original text/key/options for manual retry", async () => {
    const storage = createMemoryStorage<ConversationStore>()
    const recovery = journal()
    const first = createFakeClient()
    first.nextCreate = () => Promise.reject(new SessionClientError("http", "agent_not_configured", "agent_not_configured"))
    const engine = createSessionEngine({ client: first, storage, ...{ submissionRecovery: recovery } })
    engine.newConversation()
    engine.setModel("exact-model")
    engine.setSelectedMcpConnectionIds(["connection-one"])
    expect(engine.submit("original text")).toBe(true)
    await settle()
    const original = first.createCalls[0]
    if (!original) throw new Error("missing original request")
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    engine.dispose()

    const second = createFakeClient()
    second.nextCreate = () => Promise.reject(new Error("offline"))
    const restored = createSessionEngine({ client: second, storage, ...{ submissionRecovery: recovery } })
    await settle()
    expect(second.snapshotCalls).toEqual([original.sessionId])
    expect(second.createCalls).toEqual([])
    expect(restored.getSnapshot().missingSessionId).toBeUndefined()
    expect(restored.getSnapshot().thread.messages.map(row => row.content)).toContain("original text")
    expect(restored.getSnapshot().canRetryPendingSubmission).toBe(true)
    restored.setModel("changed-after-reload")
    restored.setSelectedMcpConnectionIds([])
    restored.retry()
    await settle()
    expect(second.createCalls).toEqual([original])
    restored.dispose()
  })

  it("does not send or consume a local draft when recovery storage rejects the write", () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>()
    let retired = 0
    const engine = createSessionEngine({ client, storage,
      draftLifecycle: { isUnsubmitted: () => true, retire: () => { retired++; return true } },
      ...{ submissionRecovery: { ...journal(), save: () => false } },
    })
    engine.newConversation()
    expect(engine.submit("keep input")).toBe(false)
    expect(client.createCalls).toEqual([])
    expect(retired).toBe(0)
    expect(engine.getSnapshot().notice?.key).toBe("chat.localDraftPersistenceFailed")
    engine.dispose()
  })
})
