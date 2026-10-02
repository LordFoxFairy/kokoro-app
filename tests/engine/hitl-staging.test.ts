import { describe, expect, it } from "vitest"

import {
  buildResumeDecisions,
  stageDecision,
  type StagedDecisions,
  type ToolDecision,
} from "@/engine/hitl-staging"
import { interactionStateSchema, type InteractionItem, type InteractionState } from "@/contract/control"

function items(ids: string[], allowed: InteractionItem["allowed_decisions"] = ["approve", "reject", "respond", "submit"]): InteractionItem[] {
  return ids.map((id) => ({ item_id: id, request_id: `request:${id}`, kind: "tool_approval", allowed_decisions: allowed,
    display: { name: "w", description: "public action", editable: false, input_schema: {} } }))
}
function collection(state: InteractionState | null): InteractionItem[] {
  return state?.groups.flatMap((group) => group.items) ?? []
}

function staged(entries: [string, ToolDecision][]): StagedDecisions {
  return new Map(entries)
}

describe("完整交互集合：owner groups 为唯一凑帧判据", () => {
  it("从 full state 读取所有 groups/items，保留 owner 顺序", () => {
    const state: InteractionState = { interaction_revision: 1, pause_revision: 1, pause_ref: "pause_1", phase: "waiting", action_result: null,
      groups: [{ group_id: "g1", items: items(["tool_1"]) }, { group_id: "g2", items: items(["tool_2"]) }] }
    expect(collection(state).map((item) => item.item_id)).toEqual(["tool_1", "tool_2"])
  })
  it("无 full state → 空集合", () => { expect(collection(null)).toEqual([]) })
  it("非 pending owner 状态 → 空集合", () => {
    expect(collection({ interaction_revision: 1, pause_revision: 0, pause_ref: null, phase: "active", action_result: null, groups: [] })).toEqual([])
  })
  it("pending 但缺完整集合的旧落盘被拒绝，不猜测待决项", () => {
    expect(interactionStateSchema.safeParse({ interaction_revision: 1, pause_revision: 1, pause_ref: "pause_1", phase: "waiting", action_result: null }).success).toBe(false)
  })
})

describe("buildResumeDecisions：凑齐才提交", () => {
  it("部分决策未凑齐返回 null", () => {
    const decisions = buildResumeDecisions(
      staged([["tool_1", { type: "approve" }]]),
      items(["tool_1", "tool_2"]),
    )
    expect(decisions).toBeNull()
  })

  it("空待批集合永不提交", () => {
    expect(buildResumeDecisions(staged([["tool_1", { type: "approve" }]]), [])).toBeNull()
  })

  it("凑齐后按 groups/items 顺序产出契约决策（部分拒绝）", () => {
    const frame = staged([
      ["tool_2", { type: "reject" }],
      ["tool_1", { type: "approve" }],
      ["tool_3", { type: "respond", message: "use option b" }],
    ])
    const decisions = buildResumeDecisions(frame, items(["tool_1", "tool_2", "tool_3"]))
    expect(decisions).toEqual([
      { type: "approve", item_id: "tool_1" },
      { type: "reject", item_id: "tool_2" },
      { type: "respond", item_id: "tool_3", response: "use option b" },
    ])
    expect(decisions?.filter((decision) => decision.type === "reject").map((decision) => decision.item_id)).toEqual(["tool_2"])
  })

  it("submit 决策映射为契约 SubmitDecision（锚字段 item_id）", () => {
    const frame = staged([["tool_1", { type: "submit", value: { otp: "123456" } }]])
    expect(buildResumeDecisions(frame, items(["tool_1"]))).toEqual([
      { type: "submit", item_id: "tool_1", value: { otp: "123456" } },
    ])
    expect(buildResumeDecisions(frame, items(["tool_1"]))?.some((decision) => decision.type === "reject")).toBe(false)
  })

  it("stageDecision 不可变：改写决策产生新 Map 且可覆盖", () => {
    const first = stageDecision(new Map(), "tool_1", { type: "approve" })
    const second = stageDecision(first, "tool_1", { type: "reject" })
    expect(first.get("tool_1")).toEqual({ type: "approve" })
    expect(second.get("tool_1")).toEqual({ type: "reject" })
    expect(second).not.toBe(first)
  })
})
