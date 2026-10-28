import { describe, expect, it } from "vitest"
import { mergeFinalAnswerReference } from "@/core/final-answer-reference"
import { completedTurnSections } from "@/ui/thread/completed-turn-sections"
import { groupSegments } from "@/core/projections"
import type { SessionMessage } from "@/core/state"

describe("final answer identity, not last visible text", () => {
  it("uses exact public revisions and rejects same-version identity drift", () => {
    const known = { segmentId: "answer", revision: "9007199254740995" }
    expect(mergeFinalAnswerReference(known, { segmentId: null, revision: "9007199254740994" })).toBe(known)
    expect(() => mergeFinalAnswerReference(known, { segmentId: "other", revision: known.revision })).toThrow()
    expect(mergeFinalAnswerReference(known, { ...known, revision: "9007199254740996" })).toEqual({ ...known, revision: "9007199254740996" })
  })
  const messages: Record<string, SessionMessage> = {
    stage: { id: "stage", role: "assistant", runId: "run", content: "Checking the repository", textState: "completed" },
    answer: { id: "answer", role: "assistant", runId: "run", content: "The result", textState: "completed" },
  }
  const segments = groupSegments([{ kind: "text", seq: "1", segmentId: "stage" }, { kind: "text", seq: "5", segmentId: "answer" }], [], messages)
  const args = { runId: "run", succeeded: true, partsComplete: true, finalSegmentId: "answer", segments, messagesById: messages }
  it("separates only explicit complete final text and keeps process order", () => {
    expect(completedTurnSections(args)).toEqual({ process: [segments[0]], final: segments[1] })
  })
  it("keeps partial, cancelled, missing and cross-run text readable without guessing", () => {
    expect(completedTurnSections({ ...args, partsComplete: false })).toBeNull()
    expect(completedTurnSections({ ...args, succeeded: false })).toBeNull()
    expect(completedTurnSections({ ...args, finalSegmentId: undefined })).toBeNull()
    expect(completedTurnSections({ ...args, messagesById: { ...messages, answer: { ...messages.answer!, textState: "streaming" } } })).toBeNull()
    expect(completedTurnSections({ ...args, runId: "other" })).toBeNull()
  })
  it("does not move the final answer across later real content", () => {
    expect(completedTurnSections({ ...args, finalSegmentId: "stage" })).toBeNull()
  })
})

import { stateFromSnapshot } from "@/core/hydration"
import { applyChatProjectionEvents, mergeMessageParts, preserveMessageParts } from "@/core/reducer"
import { makeEvent, makeSnapshot } from "./fixtures"
import { parseSessionSnapshot } from "@/contract/chat"
const history = (revision: string, final?: string) => stateFromSnapshot(parseSessionSnapshot({ ...makeSnapshot(), messages: [{ message_id: "owner", run_id: "run", role: "assistant", status: "completed", created_at: "now", content: null, rendering: { mode: "ordered", format_version: 1, revision, event_watermark: null, parts_cursor: "opaque", ...(final ? { final_segment_id: final } : {}) } }] }))
it("keeps live final identity through unrelated frames and an older snapshot/page", () => {
  let state = history("4")
  state = applyChatProjectionEvents(state, [makeEvent("run.completed", { status: "completed", final_segment_id: "answer" }, { run_id: "run", publicSequence: "9" })])
  state = applyChatProjectionEvents(state, [makeEvent("message.delta", { segment_id: "other", delta: "later unrelated turn" }, { run_id: "other", publicSequence: "10" })])
  expect(state.finalAnswersByRun?.run).toEqual({ segmentId: "answer", revision: "9" })
  state = mergeMessageParts(state, { message_id: "owner", run_id: "run", revision: "4", items: [] }, [], true)
  expect(state.finalAnswersByRun?.run).toEqual({ segmentId: "answer", revision: "9" })
  state = preserveMessageParts(state, history("3"))
  expect(state.finalAnswersByRun?.run).toEqual({ segmentId: "answer", revision: "9" })
  expect(state.messageParts?.owner?.revision).toBe("4")
})
it("hydrates the exact identity but waits for a complete current body", () => {
  const state = history("9", "answer")
  expect(state.finalAnswersByRun?.run).toEqual({ segmentId: "answer", revision: "9" })
  expect(state.messageParts?.owner).toMatchObject({ status: "unread", finalSegmentId: "answer" })
  expect(state.messages.some(message => message.id === "answer")).toBe(false)
})
