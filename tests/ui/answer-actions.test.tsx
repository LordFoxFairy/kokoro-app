import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AnswerActions } from "@/ui/thread/answer-actions"
import { LocaleProvider } from "@/i18n/context"
import { negotiateLocale, resolveMessage } from "@/i18n/resolve"
const locale = negotiateLocale(null, [...navigator.languages])
const copyLabel = resolveMessage(locale, "thread.copyAnswer")
const copiedLabel = resolveMessage(locale, "thread.copiedAnswer")
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
const clipboard = () => { const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } }); return writeText }
const feedback = (onChange = vi.fn()) => ({ value: null, positiveLabel: "Good response", negativeLabel: "Bad response", onChange })
describe("AnswerActions", () => {
  it("normal copy-only integration does not expose fake actions and preserves exact clipboard text", async () => {
    const writeText = clipboard()
    render(<AnswerActions text={"first\n\nsecond"} />, { wrapper: LocaleProvider })
    expect(screen.getAllByRole("button")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: copyLabel }))
    await waitFor(() => expect(screen.getByRole("button", { name: copiedLabel })).toBeInTheDocument())
    expect(writeText).toHaveBeenCalledExactlyOnceWith("first\n\nsecond")
  })
  it("supports all four genuine supplied callbacks, controlled feedback and disabled actions", async () => {
    clipboard(); const regenerate = vi.fn(); const change = vi.fn()
    const { rerender } = render(<AnswerActions text="answer" regenerate={{ label: "Regenerate", onClick: regenerate }} feedback={feedback(change)} />, { wrapper: LocaleProvider })
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Regenerate", copyLabel, "Good response", "Bad response"])
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" })); expect(regenerate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Good response" })); expect(change).toHaveBeenLastCalledWith("up")
    expect(screen.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false")
    rerender(<AnswerActions text="answer" feedback={{ ...feedback(change), value: "up" }} />)
    expect(screen.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "Good response" })); expect(change).toHaveBeenLastCalledWith(null)
    rerender(<AnswerActions text="answer" disabled regenerate={{ label: "Regenerate", onClick: regenerate }} feedback={feedback(change)} />)
    for (const button of screen.getAllByRole("button")) { expect(button).toBeDisabled(); fireEvent.click(button) }
    expect(regenerate).toHaveBeenCalledTimes(1)
    expect(change).toHaveBeenCalledTimes(2)
  })
  it("has a real keyboard-focus tooltip and remains a native keyboard button", async () => {
    clipboard(); render(<AnswerActions text="answer" />, { wrapper: LocaleProvider })
    const button = screen.getByRole("button", { name: copyLabel })
    act(() => button.focus())
    expect(button).toHaveFocus()
    expect(button.tagName).toBe("BUTTON")
    expect(await screen.findByRole("tooltip")).toHaveTextContent(copyLabel)
  })
  it("does not claim copied on clipboard failure or allow an empty copy", async () => {
    const writeText = clipboard(); writeText.mockRejectedValue(new Error("permission denied"))
    const { rerender } = render(<AnswerActions text="answer" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByRole("button", { name: copyLabel })); await act(async () => {})
    expect(screen.queryByRole("button", { name: copiedLabel })).not.toBeInTheDocument()
    rerender(<AnswerActions text="" />); expect(screen.getByRole("button", { name: copyLabel })).toBeDisabled()
  })
})

it("does not apply a delayed clipboard success to a different answer", async () => {
  const writeText = clipboard(); let finish!: () => void
  writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  const { rerender } = render(<AnswerActions text="old answer" />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: copyLabel }))
  rerender(<AnswerActions text="new answer" />)
  await act(async () => { finish() })
  expect(screen.getByRole("button", { name: copyLabel })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: copiedLabel })).not.toBeInTheDocument()
  expect(writeText).toHaveBeenCalledExactlyOnceWith("old answer")
})

it("keeps unknown feedback disabled without fabricating a null/negative server vote", () => {
  clipboard(); const change = vi.fn()
  render(<AnswerActions text="answer" feedback={{ ...feedback(change), value: undefined, disabled: true }} />, { wrapper: LocaleProvider })
  for (const label of ["Good response", "Bad response"]) {
    const button = screen.getByRole("button", { name: label })
    expect(button).toBeDisabled()
    expect(button).not.toHaveAttribute("aria-pressed")
    fireEvent.click(button)
  }
  expect(change).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: copyLabel })).toBeEnabled()
})
