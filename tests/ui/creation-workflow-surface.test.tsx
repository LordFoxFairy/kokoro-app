import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { LocaleProvider } from "@/i18n/context"
import { CreationWorkflowSurface } from "@/features/app/creation-workflow-surface"

afterEach(() => cleanup())

describe("creation workflow surface", () => {
  it("writes and replaces the explicit range in the editable draft, and the chosen template retains it", () => {
    const onPrompt = vi.fn()
    function Harness() {
      const [draft, setDraft] = useState("User-authored body.")
      return <>
        <textarea aria-label="Editable draft" value={draft} onChange={event => setDraft(event.target.value)} />
        <CreationWorkflowSurface intent="presentation" draft={draft} onPrompt={(next, intent) => { onPrompt(next, intent); setDraft(next) }} />
      </>
    }
    render(<LocaleProvider><Harness /></LocaleProvider>)

    expect(screen.getAllByTestId("presentation-template")).toHaveLength(4)
    const input = screen.getByRole("textbox", { name: "Editable draft" })
    fireEvent.pointerDown(screen.getByRole("button", { name: "Slide count: 8 - 12" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "12 - 16" }))
    expect(input).toHaveValue("User-authored body.\n\nSlide count: 12 - 16")

    fireEvent.change(input, { target: { value: "User-authored body, edited.\n\nSlide count: 12 - 16" } })
    fireEvent.pointerDown(screen.getByRole("button", { name: "Slide count: 12 - 16" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "16 - 20" }))
    expect(input).toHaveValue("User-authored body, edited.\n\nSlide count: 16 - 20")

    fireEvent.click(screen.getByRole("button", { name: "Quarterly business review" }))
    expect(onPrompt).toHaveBeenLastCalledWith("Quarterly business review\n\nSlide count: 16 - 20", "presentation")
    expect(input).toHaveValue("Quarterly business review\n\nSlide count: 16 - 20")
  })

  it("recovers the choice from restored text and leaves an over-limit option unapplied", () => {
    const onPrompt = vi.fn()
    const draw = (draft: string) => <LocaleProvider><CreationWorkflowSurface intent="presentation" draft={draft} onPrompt={onPrompt} /></LocaleProvider>
    const restored = "Keep the original body.\r\n\r\n幻灯片数量：12 - 16"
    const view = render(draw(restored))
    fireEvent.pointerDown(screen.getByRole("button", { name: "Slide count: 12 - 16" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "4 - 8" }))
    expect(onPrompt).toHaveBeenCalledExactlyOnceWith("Keep the original body.\r\n\r\nSlide count: 4 - 8", "presentation")

    onPrompt.mockClear()
    view.rerender(draw("x".repeat(4000)))
    fireEvent.pointerDown(screen.getByRole("button", { name: "Slide count: 8 - 12" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "8 - 12" }))
    expect(screen.getByRole("status")).toHaveTextContent("This option would exceed 4000 characters")
    expect(onPrompt).not.toHaveBeenCalled()
  })
})
