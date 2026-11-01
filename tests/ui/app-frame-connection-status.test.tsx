import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { AppFrameConnectionStatus } from "@/components/blocks/app-frame/app-frame-status-surfaces"
import { LocaleProvider } from "@/i18n/context"

afterEach(cleanup)

it("keeps transient reconnecting quiet and offers no duplicate reconnect action", () => {
  localStorage.setItem("kokoro.locale", "zh")
  const reconnect = vi.fn()
  render(<LocaleProvider><AppFrameConnectionStatus connection={{ status: "reconnecting" }} onReconnect={reconnect} /></LocaleProvider>)
  expect(screen.getByRole("status", { name: "重连中…" })).toHaveClass("sr-only")
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(reconnect).not.toHaveBeenCalled()
})

it.each(["http", "network", "parse", "timeout"] as const)("shows an explicit safe recovery action for unavailable %s without exposing the raw reason", reason => {
  localStorage.setItem("kokoro.locale", "zh")
  const reconnect = vi.fn(), submit = vi.fn(event => event.preventDefault())
  const view = (pending = false) => <LocaleProvider><form onSubmit={submit}>
    <AppFrameConnectionStatus connection={pending ? { status: "reconnecting" } : { status: "unavailable", reason }} onReconnect={reconnect} />
  </form></LocaleProvider>
  const { rerender } = render(view())
  const status = screen.getByRole("status", { name: "连接暂时中断" })
  expect(status).not.toHaveClass("sr-only")
  expect(status).toHaveTextContent("连接暂时中断")
  expect(status).not.toHaveTextContent(reason)
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  const button = screen.getByRole("button", { name: "重新连接" })
  expect(button).toHaveAttribute("type", "button")
  button.focus()
  expect(button).toHaveFocus()
  // jsdom has no Enter default action; click is the native button activation.
  fireEvent.keyDown(button, { key: "Enter" })
  fireEvent.click(button)
  fireEvent.keyUp(button, { key: "Enter" })
  expect(reconnect).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
  rerender(view(true))
  expect(screen.queryByRole("button", { name: "重新连接" })).not.toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveClass("sr-only")
})
