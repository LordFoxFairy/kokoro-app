import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { stateFromSnapshot } from "@/core/hydration"
import { applyChatProjectionEvent } from "@/core/reducer"
import { createSessionStreamState, type SessionDelivery, type SessionStreamState } from "@/core/state"
import { LocaleProvider } from "@/i18n/context"
import { ConversationThread, type ConversationThreadProps } from "@/ui/thread/conversation-thread"
import { makeDeliveryPayload, makeEvent, makeSnapshot, makeSnapshotDelivery } from "../core/fixtures"

afterEach(cleanup)

function delivery(runId: string, title: string, conversationId = "session_1"): SessionDelivery {
  return { conversationId, runId, title, artifactId: title, assetId: `asset_${title}`,
    artifactKind: "document", mime: "text/plain", size: 10, createdAt: "2026-10-27T00:00:00.000Z" }
}

function threadWithRuns(...runs: string[]): SessionStreamState {
  return { ...createSessionStreamState(), messages: runs.flatMap((runId, index) => [
    { id: `user_${index}`, role: "user" as const, runId, content: `request ${index}` },
    { id: `answer_${index}`, role: "assistant" as const, runId, content: `answer ${index}` },
  ]) }
}

function threadElement(thread: SessionStreamState, extra: Partial<ConversationThreadProps> = {}) {
  return <LocaleProvider><ConversationThread sessionId="session_1" thread={thread}
    isStreaming={false} isReconnecting={false} hasFailed={false} canRetryPendingSubmission={false}
    creditRejected={false} onOpenBilling={vi.fn()} onOpenPricing={vi.fn()} onRetry={vi.fn()}
    onOpenDelivery={vi.fn()} mode="fast" stagingByRun={{}} hitlRunId={null} controlError={null}
    {...extra} /></LocaleProvider>
}

function owningTurn(button: HTMLElement) {
  return button.closest('[data-slot="message-scroller-item"]')
}

it("keeps each creation after its own answer, not after a later read-only Run", () => {
  const first = delivery("run_1", "first.md")
  const second = delivery("run_2", "second.md")
  const onOpenDelivery = vi.fn()
  render(threadElement({ ...threadWithRuns("run_1", "run_2", "read_only"), deliveries: [first, second] }, { onOpenDelivery }))
  const firstButton = screen.getByRole("button", { name: "Open delivery first.md" })
  const secondButton = screen.getByRole("button", { name: "Open delivery second.md" })
  expect(owningTurn(firstButton)).toHaveAttribute("data-message-id", "assistant:run_1:turn:0")
  expect(owningTurn(secondButton)).toHaveAttribute("data-message-id", "assistant:run_2:turn:0")
  expect(within(owningTurn(firstButton)! as HTMLElement).getByText("answer 0").compareDocumentPosition(firstButton) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(screen.getAllByRole("button", { name: /^Open delivery / })).toHaveLength(2)
  expect(screen.queryByRole("link", { name: "View all creations" })).not.toBeInTheDocument()
  fireEvent.click(firstButton)
  expect(onOpenDelivery).toHaveBeenCalledWith(first)
})

it("places a Run's creation only at its last existing assistant turn", () => {
  render(threadElement({ ...threadWithRuns("same_run", "same_run", "later"), deliveries: [delivery("same_run", "once.md")] }))
  const button = screen.getByRole("button", { name: "Open delivery once.md" })
  expect(owningTurn(button)).toHaveAttribute("data-message-id", "assistant:same_run:turn:1")
})

it("a late delivery returns to the original Run and remains there across a later answer", () => {
  const thread = threadWithRuns("old", "read_only")
  const view = render(threadElement(thread))
  const event = makeEvent("delivery.created", makeDeliveryPayload({ title: "late.md" }), { session_id: "session_1", run_id: "old" })
  const withDelivery = applyChatProjectionEvent(thread, event)
  view.rerender(threadElement(withDelivery))
  const button = screen.getByRole("button", { name: "Open delivery late.md" })
  expect(owningTurn(button)).toHaveAttribute("data-message-id", "assistant:old:turn:0")
  button.focus()
  view.rerender(threadElement({ ...threadWithRuns("old", "read_only", "next"), deliveries: withDelivery.deliveries }))
  expect(screen.getByRole("button", { name: "Open delivery late.md" })).toBe(button)
  expect(button).toHaveFocus()
  expect(owningTurn(button)).toHaveAttribute("data-message-id", "assistant:old:turn:0")
})

it("snapshot ownership uses the same Run placement without inventing a message association", () => {
  const snapshot = makeSnapshot({ sessionId: "session_1", deliveries: [makeSnapshotDelivery({
    conversation_id: "session_1", run_id: "restored", title: "saved.md",
  })], messages: [
    { message_id: "saved_answer", role: "assistant", run_id: "restored", content: "saved answer", status: "completed", created_at: "2026-10-27T00:00:00Z" },
    { message_id: "later_request", role: "user", content: "read only", status: "completed", created_at: "2026-10-27T00:00:01Z" },
    { message_id: "later_answer", role: "assistant", run_id: "later", content: "read answer", status: "completed", created_at: "2026-10-27T00:00:02Z" },
  ] })
  render(threadElement(stateFromSnapshot(snapshot)))
  expect(owningTurn(screen.getByRole("button", { name: "Open delivery saved.md" })))
    .toHaveAttribute("data-message-id", "assistant:restored:turn:0")
})

it.each([false, true])("an unavailable owner turn keeps one Library entry, never a guessed latest card (hasMore=%s)", (hasMore) => {
  render(threadElement({ ...threadWithRuns("latest"), deliveries: [delivery("outside_window", "older.md")], deliveriesHasMore: hasMore }))
  expect(screen.queryByRole("button", { name: "Open delivery older.md" })).not.toBeInTheDocument()
  expect(screen.getAllByRole("link", { name: "View all creations" })).toHaveLength(1)
  expect(screen.getByRole("link", { name: "View all creations" })).toHaveAttribute("href", "/app/library?tab=artifacts")
})

it("hasMore is a single conversation-level entry, not duplicated for each Run", () => {
  render(threadElement({ ...threadWithRuns("one", "two"), deliveries: [delivery("one", "one.md"), delivery("two", "two.md")], deliveriesHasMore: true }))
  expect(screen.getAllByRole("link", { name: "View all creations" })).toHaveLength(1)
})

it("never renders another conversation's title/actions or exposes its existence through a fallback link", () => {
  render(threadElement({ ...threadWithRuns("matching_run"), deliveries: [delivery("matching_run", "private.md", "other_session")] }))
  expect(screen.queryByText("private.md")).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "View all creations" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument()
})
