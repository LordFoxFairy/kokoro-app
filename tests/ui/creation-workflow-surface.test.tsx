import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { CreationWorkflowSurface } from "@/features/app/creation-workflow-surface"

afterEach(() => cleanup())

describe("creation workflow surface", () => {
  it("renders four presentation templates and applies a selected template prompt", () => {
    const onPrompt = vi.fn()
    render(
      <LocaleProvider>
        <CreationWorkflowSurface intent="presentation" onPrompt={onPrompt} />
      </LocaleProvider>,
    )

    expect(screen.getAllByTestId("presentation-template")).toHaveLength(4)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Slide count: 8 - 12" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "12 - 16" }))
    expect(screen.getByRole("button", { name: "Slide count: 12 - 16" })).toBeInTheDocument()

    fireEvent.click(screen.getAllByTestId("presentation-template")[3])
    expect(onPrompt).toHaveBeenCalledWith("Quarterly business review", "presentation")
  })
})
