import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { createHubClient, type HubClient } from "@/hub/client"
import { McpReadFeedback } from "@/ui/mcp/mcp-read-feedback"
import { useMcpProviderDirectory } from "@/ui/mcp/use-mcp-provider-directory"
import { useMcpProviderRelations } from "@/ui/mcp/use-mcp-provider-relations"

afterEach(cleanup)
const seed = { items: [], next_cursor: "tail" }

function Directory({ client, tail }: { client: HubClient; tail: boolean }) {
  const read = useMcpProviderDirectory({ client, identity: "focus", admitted: true, readGeneration: 0,
    seed, query: tail ? "" : "workflow", category: tail ? "all" : "development" })
  return <><input aria-label="Search" /><button onClick={read.loadMore}>More</button>
    {read.error || read.retrying ? <McpReadFeedback message="Directory failed" retryLabel="Retry directory" busy={read.retrying} onRetry={read.retry} /> : null}</>
}
function Relations({ client }: { client: HubClient }) {
  const read = useMcpProviderRelations({ client, identity: "focus", admitted: true, readGeneration: 0, enabled: true, refreshKey: 0 })
  return <><input aria-label="Search" />{read.error || read.retrying ?
    <McpReadFeedback message="Relations failed" retryLabel="Retry relations" busy={read.retrying} onRetry={read.retry} /> : null}</>
}

// Native Enter dispatches click; explicitly dispatch it because jsdom has no keyboard default actions.
function enter(button: HTMLElement) { fireEvent.keyDown(button, { key: "Enter" }); fireEvent.click(button); fireEvent.keyUp(button, { key: "Enter" }) }

it.each([false, true])("keeps the directory retry node and keyboard focus through a second failure (tail=%s)", async tail => {
  let reject!: (reason: Error) => void
  const list = vi.fn().mockRejectedValueOnce(Error("first"))
    .mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    .mockResolvedValueOnce({ items: [], next_cursor: null })
  const client = { ...createHubClient(), listMcpConnectorProviders: list }
  render(<Directory client={client} tail={tail} />)
  if (tail) fireEvent.click(screen.getByText("More"))
  const button = await screen.findByRole("button", { name: "Retry directory" })
  button.focus()
  enter(button)
  expect(button.isConnected).toBe(true)
  expect(button).toBeDisabled()
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
  // Chromium may blur a button when it becomes disabled.
  button.blur()
  await act(async () => reject(Error("second")))
  expect(screen.getByRole("button", { name: "Retry directory" })).toBe(button)
  expect(button).toHaveFocus()
  expect(button).toBeEnabled()
  enter(button)
  await waitFor(() => expect(screen.queryByText("Directory failed")).not.toBeInTheDocument())
  expect(list).toHaveBeenCalledTimes(3)
  expect(list.mock.calls[1]![0]).toEqual(tail ? { limit: 100, cursor: "tail" } : { limit: 100, query: "workflow", category_key: "development" })
})

it.each([false, true])("keeps relation retry pending and respects moved focus (moved=%s)", async moved => {
  let reject!: (reason: Error) => void
  const list = vi.fn().mockRejectedValueOnce(Error("first"))
    .mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    .mockResolvedValueOnce({ items: [], next_cursor: null })
  const client = { ...createHubClient(), listMcpConnectors: list }
  render(<Relations client={client} />)
  const button = await screen.findByRole("button", { name: "Retry relations" })
  button.focus()
  enter(button)
  expect(button.isConnected).toBe(true)
  expect(button).toBeDisabled()
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  if (moved) { screen.getByRole("textbox").focus(); screen.getByRole("textbox").blur() }
  else button.blur()
  await act(async () => reject(Error("second")))
  expect(screen.getByRole("button", { name: "Retry relations" })).toBe(button)
  expect(moved ? document.body : button).toHaveFocus()
  expect(button).toBeEnabled()
  if (!moved) {
    enter(button)
    await waitFor(() => expect(screen.queryByText("Relations failed")).not.toBeInTheDocument())
    expect(list).toHaveBeenCalledTimes(3)
  }
})
