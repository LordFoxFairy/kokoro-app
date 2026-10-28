import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { SegmentProcess } from "@/ui/thread/segment-process"
import { useRunDisplay } from "@/ui/thread/use-run-display"
import { LocaleProvider } from "@/i18n/context"
import type { AnswerActionBoundary } from "@/ui/thread/answer-action-scope"
import type { RunProcessActivity } from "@/contract/chat"
import { BFF_TOOL_DISPLAY_PROVENANCE } from "@/generated/bff-tool-display"
import { SessionClientError } from "@/engine/client-error"
let visible = true
const intersections = new Set<(visible: boolean) => void>()
beforeEach(() => {
  visible = true
  vi.stubGlobal("IntersectionObserver", class {
    private publish: (visible: boolean) => void
    constructor(callback: IntersectionObserverCallback) { this.publish = value => callback([{ isIntersecting: value } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    observe() { intersections.add(this.publish); this.publish(visible) }
    disconnect() { intersections.delete(this.publish) }
  })
})
const key = "kokoro.web.process-disclosure"
const activity = (id: string): RunProcessActivity => ({ activity: "tool", activity_id: id, segment_id: "source", status: "completed", display_code: "tool.mcp.call" })
const facts = { run_id: "run", display_skills: [], tool_paths: [], activity_details: [], tool_facts: [] }
function Harness({ boundary, segmentId, live = false, single = false, empty = false, renderRevision = 0 }: {
  boundary: AnswerActionBoundary; segmentId: string; live?: boolean; single?: boolean; empty?: boolean; renderRevision?: number
}) {
  const display = useRunDisplay(boundary, "run")
  return <LocaleProvider><div data-render={renderRevision}><SegmentProcess segmentId={segmentId} live={live}
    activities={empty ? [] : single ? [activity("call")] : [activity("call-1"), activity("call-2")]}
    onVisible={display.ensureRead}
    {...(display.facts === null ? { onInspect: display.inspect } : {})} /></div></LocaleProvider>
}
function fixture() {
  const readDisplay = vi.fn<AnswerActionBoundary["client"]["readDisplay"]>().mockResolvedValue(facts)
  const boundary = { client: { readDisplay }, sessionId: "session", isCurrent: () => true } as unknown as AnswerActionBoundary
  return { readDisplay, boundary }
}
afterEach(() => { cleanup(); localStorage.removeItem(key); intersections.clear(); vi.unstubAllGlobals() })
it("cold-mounts an explicitly persisted expanded process and restores exactly one owner read in StrictMode", async () => {
  localStorage.setItem(key, JSON.stringify({ "restored-cold": true }))
  const f = fixture()
  render(<StrictMode><Harness boundary={f.boundary} segmentId="restored-cold" /></StrictMode>)
  expect(screen.getByRole("button", { name: /Tool calls: 2/u })).toHaveAttribute("aria-expanded", "true")
  await waitFor(() => expect(f.readDisplay).toHaveBeenCalledTimes(1))
  expect(f.readDisplay.mock.calls[0]?.[0]).toEqual({ sessionId: "session", runId: "run" })
})
it("a restored expanded process re-reads once after a formal display profile update, without another toggle", async () => {
  localStorage.setItem(key, JSON.stringify({ "restored-profile": true }))
  const f = fixture(), profile = BFF_TOOL_DISPLAY_PROVENANCE.sourceSha256
  const { rerender } = render(<Harness boundary={f.boundary} segmentId="restored-profile" />)
  await waitFor(() => expect(f.readDisplay).toHaveBeenCalledTimes(1))
  try {
    Reflect.set(BFF_TOOL_DISPLAY_PROVENANCE, "sourceSha256", "next-formal-profile")
    rerender(<Harness boundary={f.boundary} segmentId="restored-profile" renderRevision={1} />)
    await waitFor(() => expect(f.readDisplay).toHaveBeenCalledTimes(2))
  } finally { Reflect.set(BFF_TOOL_DISPLAY_PROVENANCE, "sourceSha256", profile) }
})
it.each([429, 503])("does not turn a restored process %s into an automatic retry loop", async status => {
  localStorage.setItem(key, JSON.stringify({ "restored-rejected": true }))
  const f = fixture()
  f.readDisplay.mockRejectedValue(new SessionClientError("http", "unavailable", "run_display_unavailable", status))
  const { rerender } = render(<Harness boundary={f.boundary} segmentId="restored-rejected" />)
  await waitFor(() => expect(f.readDisplay).toHaveBeenCalledTimes(1))
  for (let revision = 1; revision <= 3; revision++) {
    rerender(<Harness boundary={f.boundary} segmentId="restored-rejected" renderRevision={revision} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
  expect(f.readDisplay).toHaveBeenCalledTimes(1)
})
it.each(["closed", "default-live", "default-single"] as const)("does not scan a %s process when offscreen", async mode => {
  visible = false
  const f = fixture()
  render(<Harness boundary={f.boundary} segmentId={`not-human-${mode}`} live={mode === "default-live"} single={mode === "default-single"} />)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(f.readDisplay).toHaveBeenCalledTimes(0)
})

it("does not inspect an empty restored segment before real activities arrive", async () => {
  localStorage.setItem(key, JSON.stringify({ "restored-empty": true }))
  const f = fixture()
  const { rerender } = render(<StrictMode><Harness boundary={f.boundary} segmentId="restored-empty" empty /></StrictMode>)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(f.readDisplay).toHaveBeenCalledTimes(0)
  rerender(<StrictMode><Harness boundary={f.boundary} segmentId="restored-empty" /></StrictMode>)
  await waitFor(() => expect(f.readDisplay).toHaveBeenCalledTimes(1))
})

it("a visible single row reads once without opening Canvas; offscreen repeated entry never retries", async () => {
  visible = false
  const f = fixture()
  render(<Harness boundary={f.boundary} segmentId="visible-single" single />)
  await act(async () => {})
  expect(f.readDisplay).not.toHaveBeenCalled()
  await act(async () => { for (const publish of intersections) publish(true) })
  await waitFor(() => expect(f.readDisplay).toHaveBeenCalledTimes(1))
  await act(async () => { for (const publish of intersections) { publish(false); publish(true) } })
  expect(f.readDisplay).toHaveBeenCalledTimes(1)
})
it.each([429, 503])("visibility transitions do not retry a real %s error", async status => {
  const f = fixture()
  f.readDisplay.mockRejectedValue(new SessionClientError("http", "unavailable", "run_display_unavailable", status))
  render(<Harness boundary={f.boundary} segmentId="visible-error" single />)
  await waitFor(() => expect(f.readDisplay).toHaveBeenCalledTimes(1))
  await act(async () => { for (const publish of intersections) { publish(false); publish(true) } })
  expect(f.readDisplay).toHaveBeenCalledTimes(1)
})
