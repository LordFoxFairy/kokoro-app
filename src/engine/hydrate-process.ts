import type { SessionSnapshot } from "@/contract/http"
import type { SessionClient } from "./client"
import type { SessionScope } from "./session-scope"

export async function fetchCompleteSnapshot(client: SessionClient, sessionId: string, scope: SessionScope, signal: AbortSignal, retryExpired = true): Promise<SessionSnapshot | null> {
  const snapshot = await client.fetchSnapshot(sessionId, { signal })
  signal.throwIfAborted()
  if (snapshot === null || snapshot.execution_process === null) return snapshot
  const process = snapshot.execution_process
  const activities = [...process.activities]
  const identities = new Set(activities.map((item) => item.activity_id))
  if (identities.size !== activities.length) throw new Error("duplicate process activity")
  if (process.next_cursor === null) return snapshot
  const watermark = snapshot.event_watermark
  if (watermark === null) throw new Error("process pagination requires a snapshot watermark")
  const cursors = new Set<string>()
  let cursor: string | null = process.next_cursor
  try {
    while (cursor !== null) {
      if (cursors.has(cursor)) throw new Error("process cursor loop")
      cursors.add(cursor)
      const page = await client.fetchRunProcessPage({ sessionId, runId: process.run_id, watermark, cursor, scope, signal })
      signal.throwIfAborted()
      if (page.run_id !== process.run_id || page.event_watermark !== watermark) throw new Error("process page identity mismatch")
      for (const activity of page.activities) {
        if (identities.has(activity.activity_id)) throw new Error("duplicate process activity")
        identities.add(activity.activity_id)
        activities.push(activity)
      }
      cursor = page.next_cursor
    }
  } catch (error) {
    if (retryExpired && error instanceof Error && "code" in error && error.code === "process_cursor_expired") return fetchCompleteSnapshot(client, sessionId, scope, signal, false)
    throw error
  }
  signal.throwIfAborted()
  return { ...snapshot, execution_process: { ...process, activities, next_cursor: null } }
}
