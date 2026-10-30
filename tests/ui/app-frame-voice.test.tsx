import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useRef, useState } from "react"
import { AppFrameComposer } from "@/components/blocks/app-frame/app-frame-composer"
import { LocaleProvider } from "@/i18n/context"

function Harness({ preview = false, onSubmit }: { preview?: boolean; onSubmit: () => void }) {
  const [draft, setDraft] = useState("Existing draft")
  const composerRef = useRef<HTMLTextAreaElement>(null)
  return <AppFrameComposer
    preview={preview} brandName="Kokoro" projectWorkspace={false} hasMessages={true} creationIntent={null} onCreationIntentDismiss={() => {}}
    workspaceCapabilities={{ instructions: false, connectors: false, resources: false, skills: false, projectConversations: false }}
    onOpenSettings={() => {}} onOpenMcpCatalog={() => {}}
    draft={draft} onDraftChange={setDraft} onKeyDown={() => {}} onSubmit={event => { event.preventDefault(); onSubmit() }}
    isStreaming={false} canSend={true} onStop={() => {}} composerRef={composerRef} mode="fast" onModeChange={() => {}} modeLocked={false}
    models={[]} selectedModel={null} onModelChange={() => {}} modelLocked={false}
  />
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv("NODE_ENV", "development")
  window.localStorage.setItem("kokoro.locale", "en")
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); window.localStorage.clear() })

it("a live development conversation never invents a transcript when speech recognition is absent", () => {
  const onSubmit = vi.fn()
  render(<Harness onSubmit={onSubmit} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: "Voice input" }))
  act(() => vi.advanceTimersByTime(1500))
  expect(screen.getByRole("textbox", { name: "Chat input" })).toHaveValue("Existing draft")
  expect(screen.getByRole("button", { name: "Voice input" })).toHaveAttribute("data-state", "error")
  expect(onSubmit).not.toHaveBeenCalled()
})

it("only an explicitly requested preview may demonstrate a transcript without submitting", () => {
  const onSubmit = vi.fn()
  render(<Harness preview onSubmit={onSubmit} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: "Voice input" }))
  act(() => vi.advanceTimersByTime(1500))
  expect(screen.getByRole("textbox", { name: "Chat input" })).not.toHaveValue("Existing draft")
  expect(onSubmit).not.toHaveBeenCalled()
})
