// Complete owner collection is the sole staging boundary.
import { resumeDecisionSchema, type InteractionItem, type ResumeDecision } from "@/contract/control"
export type ToolDecision =
  | { type: "approve"; args?: Record<string, unknown> | null }
  | { type: "edit"; args: Record<string, unknown> }
  | { type: "reject"; reason?: string | null }
  | { type: "respond"; message: string }
  | { type: "submit"; value: Record<string, unknown> }
export type StagedDecisions = ReadonlyMap<string, ToolDecision>
export function stageDecision(staged: StagedDecisions, itemId: string, decision: ToolDecision): StagedDecisions {
  return new Map([...staged, [itemId, decision]])
}
export function buildResumeDecisions(staged: StagedDecisions, items: readonly InteractionItem[]): ResumeDecision[] | null {
  if (!items.length || staged.size !== items.length) return null
  const decisions: ResumeDecision[] = []
  for (const item of items) {
    const decision = staged.get(item.item_id)
    if (!decision || !item.allowed_decisions.includes(decision.type)) return null
    const raw = decision.type === "respond" ? { type: decision.type, item_id: item.item_id, response: decision.message } : { ...decision, item_id: item.item_id }
    const parsed = resumeDecisionSchema.safeParse(raw)
    if (!parsed.success) return null
    decisions.push(parsed.data)
  }
  return decisions
}
