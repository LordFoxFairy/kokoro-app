// 公共只读线程（SHARE-1）：从公共快照复用 ConversationThread 渲染件——用户气泡 + assistant 文本。
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { parseSharedSessionSnapshot, type SharedSessionSnapshot } from "@/contract/http"
import { BFF_AGENT_FAILURE_TUPLES } from "@/generated/bff-agent-failure"
import { LocaleProvider } from "@/i18n/context"
import { LOCALE_STORAGE_KEY } from "@/i18n/messages"
import * as hydration from "@/core/hydration"
import { SharedThread } from "@/ui/shared/shared-thread"

import { expectedAgentFailureZhCopy, expectedZhCopy, makeFailedSnapshot } from "../core/fixtures"

function snapshot(): SharedSessionSnapshot {
  return {
    session: {
      session_id: "ses_1",
      title: "Shared thread",
      owner_id: "alice",
      created_at: "2026-07-02T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:02.000Z",
    },
    messages: [
      { message_id: "m_u", role: "user", content: "hello from user", status: "completed", created_at: "2026-07-02T00:00:01.000Z" },
      { message_id: "m_a", role: "assistant", content: "hi from assistant", status: "completed", run_id: "run_1", created_at: "2026-07-02T00:00:02.000Z" },
    ],
      files: [],
    deliveries: [],
    deliveries_has_more: false,
    event_watermark: "agui_00000000000000000000000000000002",
    execution_process: null,
  }
}

afterEach(cleanup)

describe("SharedThread", () => {
  it("renders user and assistant messages from the public snapshot", () => {
    render(<SharedThread snapshot={snapshot()} />, { wrapper: LocaleProvider })
    expect(screen.getByText("hello from user")).toBeTruthy()
    expect(screen.getByText("hi from assistant")).toBeTruthy()
  })

  it("renders an empty thread without crashing", () => {
    const empty = snapshot()
    empty.messages = []
    render(<SharedThread snapshot={empty} />, { wrapper: LocaleProvider })
    // 无消息也不抛（只读空线程）。
    expect(screen.queryByText("hello from user")).toBeNull()
  })

  it.each(BFF_AGENT_FAILURE_TUPLES)(
    "renders the safe shared $code retryable=$retryable failure without mutation or raw details",
    (profile) => {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh")
      render(<SharedThread snapshot={parseSharedSessionSnapshot(makeFailedSnapshot(profile))} />, { wrapper: LocaleProvider })
      expect(screen.getByRole("alert")).toBeTruthy()
      expect(screen.getByText(expectedAgentFailureZhCopy(profile.code))).toBeTruthy()
      expect(screen.queryByText(profile.code)).toBeNull()
      expect(screen.queryByText("Agent run failed")).toBeNull()
      expect(screen.queryByRole("button", { name: expectedZhCopy("thread.retry") })).toBeNull()
      expect(document.querySelector('[data-slot="collapsible"]')).toBeNull()
    },
  )

  it("renders a failureless persisted failure as generic safe read-only feedback", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh")
    render(<SharedThread snapshot={parseSharedSessionSnapshot(makeFailedSnapshot(null))} />, { wrapper: LocaleProvider })
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText(expectedZhCopy("fail.generic"))).toBeTruthy()
    expect(screen.queryByText("Agent run failed")).toBeNull()
    expect(screen.queryByRole("button", { name: expectedZhCopy("thread.retry") })).toBeNull()
    expect(document.querySelector('[data-slot="collapsible"]')).toBeNull()
  })
})


it("projects a formally allowed public head away before private thread hydration without mutating the public response", () => {
  const head = { run_id: "private-head", state: "queued" as const, pending_pauses: [] }
  const owner = parseSharedSessionSnapshot({ ...snapshot(), execution_head: head })
  const hydrate = vi.spyOn(hydration, "stateFromSnapshot")
  try {
    render(<SharedThread snapshot={owner} />, { wrapper: LocaleProvider })
    // This public→private projection is the security boundary under test, not
    // an internal rendering sequence or private helper implementation.
    expect(hydrate.mock.calls[0]?.[0]).not.toHaveProperty("execution_head")
    expect(owner.execution_head).toEqual(head)
    expect(screen.getByText("hi from assistant")).toBeVisible()
    expect(screen.queryByRole("status")).toBeNull()
    expect(document.querySelector('[data-slot="collapsible"]')).toBeNull()
  } finally { hydrate.mockRestore() }
})
