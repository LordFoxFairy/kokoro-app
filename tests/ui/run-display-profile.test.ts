import { act, renderHook, cleanup } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useRunDisplay } from "@/ui/thread/use-run-display"
import type { AnswerActionBoundary } from "@/ui/thread/answer-action-scope"
import { BFF_TOOL_DISPLAY_PROVENANCE } from "@/generated/bff-tool-display"
afterEach(cleanup)
it("invalidates only the per-Run ephemeral display memo on a formal profile upgrade, without automatic reads or commands", async () => {
  const readDisplay = vi.fn(async () => ({ run_id: "old-run", display_skills: [], tool_paths: [], tool_facts: [] }))
  const boundary = { client: { readDisplay }, sessionId: "session", isCurrent: () => true } as unknown as AnswerActionBoundary
  const { result, rerender } = renderHook(() => useRunDisplay(boundary, "old-run"))
  await act(async () => result.current.inspect())
  expect(result.current.facts?.run_id).toBe("old-run")
  const originalProfile = BFF_TOOL_DISPLAY_PROVENANCE.sourceSha256
  try {
    Reflect.set(BFF_TOOL_DISPLAY_PROVENANCE, "sourceSha256", "next-formal-profile")
    rerender()
    expect(result.current.facts).toBeNull()
    expect(readDisplay).toHaveBeenCalledTimes(1)
    await act(async () => { result.current.inspect(); result.current.inspect() })
    expect(readDisplay).toHaveBeenCalledTimes(2)
  } finally { Reflect.set(BFF_TOOL_DISPLAY_PROVENANCE, "sourceSha256", originalProfile) }
})
it("retires a held old-profile read and ignores its late facts after the explicit new-profile read", async () => {
  const id = `act_${"a".repeat(64)}`
  const newer = { run_id: "old-run", display_skills: [], tool_paths: [], tool_facts: [{ activity_id: id, display_detail: { kind: "mcp_tool" as const, name: "ask_wiki_question" } }] }
  let resolveOld!: (value: typeof newer) => void, oldSignal!: AbortSignal
  const readDisplay = vi.fn<AnswerActionBoundary["client"]["readDisplay"]>()
    .mockImplementationOnce((target, signal) => { expect(target.runId).toBe("old-run"); oldSignal = signal; return new Promise(resolve => { resolveOld = resolve }) })
    .mockResolvedValue(newer)
  const boundary = { client: { readDisplay }, sessionId: "session", isCurrent: () => true } as unknown as AnswerActionBoundary
  const { result, rerender } = renderHook(() => useRunDisplay(boundary, "old-run"))
  await act(async () => result.current.inspect())
  const profile = BFF_TOOL_DISPLAY_PROVENANCE.sourceSha256
  try {
    Reflect.set(BFF_TOOL_DISPLAY_PROVENANCE, "sourceSha256", "next-formal-profile")
    rerender()
    expect(oldSignal.aborted).toBe(true)
    expect(readDisplay).toHaveBeenCalledTimes(1)
    await act(async () => result.current.inspect())
    expect(result.current.facts?.tool_facts[0]?.display_detail?.name).toBe("ask_wiki_question")
    await act(async () => resolveOld({ ...newer, tool_facts: [{ activity_id: id, display_detail: { kind: "mcp_tool", name: "old-public-name" } }] }))
    expect(result.current.facts?.tool_facts[0]?.display_detail?.name).toBe("ask_wiki_question")
    expect(readDisplay).toHaveBeenCalledTimes(2)
  } finally { Reflect.set(BFF_TOOL_DISPLAY_PROVENANCE, "sourceSha256", profile) }
})
