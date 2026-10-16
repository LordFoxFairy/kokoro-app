import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { CommunicationPreferencesSection } from "@/ui/settings/sections/communication-preferences-section"
import { DEFAULT_COMMUNICATION_PREFERENCES, readCommunicationPreferences, subscribeCommunicationPreferences, writeCommunicationPreferences } from "@/ui/notifications/communication-preferences"

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); vi.unstubAllGlobals() })
describe("communication preference truth", () => {
  it("reports failed persistence rather than acknowledging a save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    expect(writeCommunicationPreferences(DEFAULT_COMMUNICATION_PREFERENCES, "subject-a")).toBe(false)
  })
  it("does not offer an unsupported marketing subscription", () => {
    render(<LocaleProvider><CommunicationPreferencesSection /></LocaleProvider>)
    const switches = screen.getAllByRole("switch")
    expect(switches[2]).toBeDisabled()
    expect(switches[3]).toBeDisabled()
  })
})


const boundary = { admitted: true, subject: "subject-a", generation: 1 }
function notifications(permission: NotificationPermission = "granted") {
  const fixture = vi.fn(function NotificationFixture() {})
  const request = vi.fn().mockResolvedValue("granted")
  Object.defineProperties(fixture, { permission: { value: permission }, requestPermission: { value: request } })
  vi.stubGlobal("Notification", fixture)
  return request
}
function section(readBoundary = boundary, preview = false) {
  return <LocaleProvider><CommunicationPreferencesSection readBoundary={readBoundary} preview={preview} /></LocaleProvider>
}
describe("subject storage and admitted settings lifecycle", () => {
  it("never migrates global preferences or leaks another subject and forces marketing false", () => {
    localStorage.setItem("kokoro.communication-preferences", JSON.stringify({ browser_notifications: true }))
    expect(readCommunicationPreferences("subject-a").browser_notifications).toBe(false)
    expect(writeCommunicationPreferences({ ...DEFAULT_COMMUNICATION_PREFERENCES, browser_notifications: true, product_updates: true, brand_ads: true }, "subject-a")).toBe(true)
    expect(readCommunicationPreferences("subject-a")).toEqual({ ...DEFAULT_COMMUNICATION_PREFERENCES, browser_notifications: true })
    expect(readCommunicationPreferences("subject-b")).toEqual(DEFAULT_COMMUNICATION_PREFERENCES)
    expect(JSON.parse(localStorage.getItem("kokoro.communication-preferences")!).browser_notifications).toBe(true)
  })
  it("broadcasts only successful writes and leaves previous value on storage failure", () => {
    const listener = vi.fn(); const unsubscribe = subscribeCommunicationPreferences("subject-a", listener)
    writeCommunicationPreferences({ ...DEFAULT_COMMUNICATION_PREFERENCES, sound_notifications: true }, "subject-a")
    expect(listener).toHaveBeenCalledTimes(1)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    expect(writeCommunicationPreferences(DEFAULT_COMMUNICATION_PREFERENCES, "subject-a")).toBe(false)
    expect(readCommunicationPreferences("subject-a").sound_notifications).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1); unsubscribe()
  })
  it("shows save failure and retains unchecked UI without optimistic success", async () => {
    notifications(); render(section())
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    fireEvent.click(screen.getAllByRole("switch")[0]!)
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not save/)
    expect(screen.getAllByRole("switch")[0]).toHaveAttribute("aria-checked", "false")
  })
  it("requests permission only from gesture and reports denial without saving", async () => {
    const request = notifications("default"); request.mockResolvedValue("denied")
    render(section()); expect(request).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole("switch")[0]!)
    await screen.findByRole("alert")
    expect(request).toHaveBeenCalledTimes(1)
    expect(readCommunicationPreferences("subject-a").browser_notifications).toBe(false)
  })
  it("rejects late permission after subject/generation retirement", async () => {
    const request = notifications("default"); let resolve!: (permission: string) => void
    request.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const view = render(section()); fireEvent.click(screen.getAllByRole("switch")[0]!)
    view.rerender(section({ ...boundary, subject: "subject-b", generation: 2 }))
    await act(async () => { resolve("granted") })
    expect(readCommunicationPreferences("subject-a").browser_notifications).toBe(false)
    expect(readCommunicationPreferences("subject-b").browser_notifications).toBe(false)
    expect(screen.queryByRole("status")).toBeNull()
  })
  it("renders preview/unadmitted/unsupported controls disabled without permission request", () => {
    const request = notifications()
    const view = render(section(boundary, true))
    expect(screen.getAllByRole("switch").every((element) => element.hasAttribute("disabled"))).toBe(true)
    view.rerender(section({ ...boundary, admitted: false }))
    expect(screen.getAllByRole("switch").every((element) => element.hasAttribute("disabled"))).toBe(true)
    vi.stubGlobal("Notification", undefined); view.rerender(section(boundary))
    expect(screen.getAllByRole("switch")[0]).toBeDisabled()
    expect(request).not.toHaveBeenCalled()
  })
  it("saves current-subject preference and re-reads same subject storage events", async () => {
    notifications(); render(section())
    fireEvent.click(screen.getAllByRole("switch")[0]!)
    await waitFor(() => expect(screen.getAllByRole("switch")[0]).toHaveAttribute("aria-checked", "true"))
    act(() => {
      localStorage.removeItem("kokoro.communication-preferences.subject.subject-a")
      window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.communication-preferences.subject.subject-a", storageArea: localStorage }))
    })
    expect(screen.getAllByRole("switch")[0]).toHaveAttribute("aria-checked", "false")
  })
})

it("restored sound preference is visibly locked until another explicit gesture; never autoplays", async () => {
  const context = { state: "suspended", onstatechange: null, resume: vi.fn(async () => { context.state = "running" }), close: vi.fn(async () => {}) }
  const constructor = vi.fn(function AudioFixture() { return context })
  vi.stubGlobal("AudioContext", constructor)
  writeCommunicationPreferences({ ...DEFAULT_COMMUNICATION_PREFERENCES, sound_notifications: true }, boundary.subject)
  render(section())
  expect(screen.getAllByRole("switch")[1]).toHaveAttribute("aria-checked", "true")
  const enable = screen.getByRole("button", { name: "Enable audio on this page" })
  expect(constructor).not.toHaveBeenCalled()
  fireEvent.click(enable)
  await waitFor(() => expect(screen.queryByRole("button", { name: "Enable audio on this page" })).toBeNull())
  expect(constructor).toHaveBeenCalledTimes(1)
  expect(context.resume).toHaveBeenCalledTimes(1)
  const { retireCompletionSound } = await import("@/ui/notifications/task-completion-sound")
  retireCompletionSound(JSON.stringify([boundary.subject]))
})

it("keeps already unlocked sound across same-subject admission rechecks but retires pending permission generation", async () => {
  const context = { state: "suspended", onstatechange: null, resume: vi.fn(async () => { context.state = "running" }), close: vi.fn(async () => {}) }
  const constructor = vi.fn(function AudioFixture() { return context })
  vi.stubGlobal("AudioContext", constructor)
  const request = notifications("default"); let resolve!: (permission: string) => void
  request.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const rendered = render(section())
  fireEvent.click(screen.getAllByRole("switch")[1]!)
  await waitFor(() => expect(screen.getAllByRole("switch")[1]).toHaveAttribute("aria-checked", "true"))
  fireEvent.click(screen.getAllByRole("switch")[0]!)
  rendered.rerender(section({ ...boundary, admitted: false, generation: 2 }))
  rendered.rerender(section({ ...boundary, admitted: true, generation: 2 }))
  await act(async () => { resolve("granted") })
  expect(readCommunicationPreferences(boundary.subject).browser_notifications).toBe(false)
  expect(screen.getAllByRole("switch")[1]).toHaveAttribute("aria-checked", "true")
  expect(screen.queryByRole("button", { name: "Enable audio on this page" })).toBeNull()
  expect(constructor).toHaveBeenCalledTimes(1)
  expect(context.close).not.toHaveBeenCalled()
  const { retireCompletionSound } = await import("@/ui/notifications/task-completion-sound")
  retireCompletionSound(JSON.stringify([boundary.subject]))
})

it("late old-generation sound resume cannot retire a successful new-generation gesture", async () => {
  let resolve!: () => void
  const context = { state: "suspended", onstatechange: null, resume: vi.fn(async () => { context.state = "running" }), close: vi.fn(async () => {}) }
  context.resume.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
  vi.stubGlobal("AudioContext", vi.fn(function AudioFixture() { return context }))
  const rendered = render(section())
  fireEvent.click(screen.getAllByRole("switch")[1]!)
  rendered.rerender(section({ ...boundary, admitted: false, generation: 2 }))
  rendered.rerender(section({ ...boundary, admitted: true, generation: 2 }))
  fireEvent.click(screen.getAllByRole("switch")[1]!)
  await waitFor(() => expect(screen.getAllByRole("switch")[1]).toHaveAttribute("aria-checked", "true"))
  await act(async () => { resolve() })
  expect(context.close).not.toHaveBeenCalled()
  expect(readCommunicationPreferences(boundary.subject).sound_notifications).toBe(true)
  const { completionSoundState, retireCompletionSound } = await import("@/ui/notifications/task-completion-sound")
  expect(completionSoundState(JSON.stringify([boundary.subject]))).toBe("ready")
  retireCompletionSound(JSON.stringify([boundary.subject]))
})
