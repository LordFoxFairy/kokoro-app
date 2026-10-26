import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { AccountDevicesDialog } from "@/ui/settings/sections/account-devices-dialog"
const sid = { session_id: "current", created_at: "2026-10-14T00:00:00.000Z", expires_at: "2026-10-15T00:00:00.000Z" }
const fetcher = vi.fn()
const reply = (data: unknown) => Response.json(data, { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "id" } })
const page = (others = ["other"]) => ({ data: { current_session: sid, sessions: others.map((session_id) => ({ ...sid, session_id })) }, meta: { request_id: "id", next_cursor: null } })
const renderDialog = () => render(<LocaleProvider><AccountDevicesDialog open readBoundary={{ admitted: true, subject: "alice", generation: 1 }} /></LocaleProvider>)
beforeEach(() => { localStorage.setItem("kokoro.locale", "en"); vi.stubGlobal("fetch", fetcher); fetcher.mockReset().mockResolvedValue(reply(page())) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it("shows only owner dates and unknown device facts; current has no remove", async () => {
  renderDialog(); await screen.findByText("Current session")
  expect(screen.getAllByText("Device information unknown")).toHaveLength(2)
  expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1)
  expect(screen.queryByText(/Chrome|London|online/i)).not.toBeInTheDocument()
  expect(screen.getAllByText(/Created/)).toHaveLength(2); expect(screen.getAllByText(/Expires/)).toHaveLength(2)
  expect(fetcher).toHaveBeenCalledOnce()
})
it("requires confirmation then real matching ACK and subsequent read", async () => {
  renderDialog(); fireEvent.click(await screen.findByRole("button", { name: "Remove" }))
  expect(fetcher).toHaveBeenCalledOnce(); expect(screen.getByText("Remove this sign-in session?")).toBeVisible()
  fetcher.mockResolvedValueOnce(reply({ data: { session_id: "other", revoked: true }, meta: { request_id: "id" } })).mockResolvedValueOnce(reply(page([])))
  fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }))
  await screen.findByText("No other sign-in sessions."); expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual(["GET", "DELETE", "GET"])
})
it("unknown result forbids another removal until explicit read", async () => {
  renderDialog(); fireEvent.click(await screen.findByRole("button", { name: "Remove" }))
  fetcher.mockRejectedValueOnce(new Error("offline")); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }))
  await screen.findByText("Removal result is unknown. Read again to check.")
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled(); expect(fetcher).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "Read again" })); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
})
it("empty and failed initial reads remain distinct and retry reads only", async () => {
  fetcher.mockResolvedValueOnce(reply(page([]))); const view = renderDialog(); await screen.findByText("No other sign-in sessions."); view.unmount()
  fetcher.mockRejectedValueOnce(new Error("offline")); renderDialog(); await act(async () => {}); expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(screen.queryByText("No other sign-in sessions.")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Read again" })); await screen.findByText("Current session")
})
it.each(["success", "failure"])("unknown removal keeps every remove control disabled after More %s", async (outcome) => {
  const first = { ...page(), meta: { request_id: "id", next_cursor: "next" } }
  fetcher.mockResolvedValueOnce(reply(first)); renderDialog()
  fireEvent.click(await screen.findByRole("button", { name: "Remove" }))
  fetcher.mockRejectedValueOnce(new Error("offline")); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }))
  await screen.findByText("Removal result is unknown. Read again to check.")
  if (outcome === "success") fetcher.mockResolvedValueOnce(reply(page(["later"])))
  else fetcher.mockRejectedValueOnce(new Error("read failed"))
  fireEvent.click(screen.getByRole("button", { name: "Load more" }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Remove" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true))
  expect(fetcher.mock.calls.filter((call) => call[1].method === "DELETE")).toHaveLength(1)
})
