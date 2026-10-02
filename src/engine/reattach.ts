import type { SessionSnapshot } from "@/contract/http"
import type { ExecutionHead } from "@/contract/chat"
export const REATTACH_TIMEOUT_MS = 90_000
export type ReattachPlan = { runId: string; state: ExecutionHead["state"] }
export function reattachPlanFromSnapshot(snapshot: SessionSnapshot): ReattachPlan | null {
  const head = snapshot.execution_head
  return head ? { runId: head.run_id, state: head.state } : null
}
