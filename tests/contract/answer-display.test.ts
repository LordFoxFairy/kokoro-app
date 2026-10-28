import { it, expect } from "vitest"
import { runProcessActivitySchema } from "@/contract/agui-events"
import { chatMessageReadSchema, messageRecordSchema } from "@/contract/chat"
it("preserves owner Skill names/exact path and regenerated answer association only on private assistant reads", () => {
  const value = {
    activity: "skill",
    activity_id: `act_${"a".repeat(64)}`,
    preflight_id: `spf_${"b".repeat(64)}`,
    source_refs: ["skill:pinned"],
    phase: "ready",
    display_skills: [{ source_ref: "skill:pinned", name: "Original", virtual_path: "/.skills/cGlubmVk/SKILL.md" }],
  }
  expect(runProcessActivitySchema.safeParse(value).success).toBe(true)
  const answer = {
    message_id: "answer",
    role: "assistant",
    content: "version2",
    status: "completed",
    created_at: "now",
    run_id: "run",
    regenerated_from_message_id: "old",
  }
  expect(chatMessageReadSchema.safeParse(answer).success).toBe(true)
  expect(messageRecordSchema.safeParse(answer).success).toBe(false)
  expect(chatMessageReadSchema.safeParse({ ...answer, role: "user" }).success).toBe(false)
})
