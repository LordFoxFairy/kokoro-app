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

import { runDisplaySkillSchema, safeVirtualPathSchema } from "@/contract/answer-actions"
it.each(["ask_question", "ask_wiki_question", "task_read", "desk_tool", "1sk_name"])("does not mistake original %s for a secret-prefix token", name => {
  expect(runDisplaySkillSchema.safeParse({ source_ref: "skill:pinned", name, virtual_path: "/.skills/cGlubmVk/SKILL.md" }).success).toBe(true)
  expect(safeVirtualPathSchema.safeParse(`/workspace/${name}/result.md`).success).toBe(true)
})

import { runDisplaySchema } from "@/contract/answer-actions"
it("requires closed unique original tool adjuncts and rejects unknown status/kind/empty facts", () => {
  const id = `act_${"a".repeat(64)}`
  const fact = { activity_id: id, display_detail: { kind: "mcp_tool", name: "ask_wiki_question" }, status: "failed" }
  const data = { run_id: "original-run", display_skills: [], tool_paths: [], activity_details: [], tool_facts: [fact] }
  expect(runDisplaySchema.safeParse(data).success).toBe(true)
  for (const changed of [
    { ...data, activity_details: [], tool_facts: undefined }, { ...data, activity_details: [], tool_facts: null },
    { ...data, activity_details: [], tool_facts: [{ activity_id: id }] }, { ...data, activity_details: [], tool_facts: [fact, fact] },
    { ...data, activity_details: [], tool_facts: Array.from({ length: 129 }, () => fact) },
    { ...data, activity_details: [], tool_facts: [{ ...fact, status: "completed" }] },
    { ...data, activity_details: [], tool_facts: [{ ...fact, extra: "untrusted" }] },
    { ...data, activity_details: [], tool_facts: [{ ...fact, activity_id: `${id}\n` }] },
    { ...data, activity_details: [], tool_facts: [{ ...fact, display_detail: { kind: "file", name: "ask_wiki_question" } }] },
    { ...data, activity_details: [], tool_facts: [{ ...fact, display_detail: { kind: "mcp_tool", name: "ask_wiki_question", virtual_path: "/workspace/extra" } }] },
  ]) expect(runDisplaySchema.safeParse(changed).success).toBe(false)
  for (const name of ["sk_private", "sk-private", "my_sk_secret", "a/sk_secret", "a.sk-private", " sk_private", "access_token", "password", "id_rsa", "ghp_private", "A\u0000B"]) {
    expect(runDisplaySchema.safeParse({ ...data, activity_details: [], tool_facts: [{ ...fact, display_detail: { kind: "mcp_tool", name } }] }).success).toBe(false)
  }
})
