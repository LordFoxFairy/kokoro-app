import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"

const state = vi.hoisted(() => ({
  source: "error" as "error" | "loading" | "live",
  probeMode: "authenticated" as "authenticated" | "preview" | "checking",
  probeState: "pass" as "pass" | "checking" | "anonymous" | "unavailable",
  pathname: "/app",
  openProductSignIn: vi.fn(),
  retry: vi.fn(),
  probeOptions: vi.fn(),
  unavailable: false,
  pending: false,
  reportReadUnauthorized: vi.fn(async () => true),
}))

const router = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => router,
}))
vi.mock("@/ui/auth/product-auth-client", () => ({ openProductSignIn: state.openProductSignIn }))
vi.mock("@/ui/auth/use-session-state", () => ({
  useSessionProbe: (options: unknown) => { state.probeOptions(options); return ({
    state: state.probeState,
    mode: state.probeMode,
    retry: state.retry,
    projectReadBoundary: { admitted: state.probeMode === "authenticated" && !state.unavailable, subject: state.probeMode === "authenticated" ? "reader" : null, generation: 1 },
    unavailable: state.unavailable,
    requestPending: state.pending,
    reportReadUnauthorized: state.reportReadUnauthorized,
  }) },
}))
vi.mock("@/system/use-runtime-manifest", () => ({
  useRuntimeManifest: () => ({
    source: state.source,
    manifest: {
      brand: { name: "Untrusted runtime brand", mark: "?" },
      navigation: [{ key: "runtime-only", label: "Runtime only", icon: "✦" }],
      featureFlags: [{ key: "runtime-only", enabled: true }],
    },
    retry: vi.fn(),
  }),
}))
vi.mock("@/features/app/kokoro-app-surface", () => ({
  KokoroAppSurface: (props: Record<string, unknown>) => (
    <div
      data-testid="app-surface"
      data-brand={props.brandName}
      data-preview={String(props.preview)}
      data-booting={String(props.booting)}
      data-admitted={String((props.projectReadBoundary as { admitted?: boolean } | undefined)?.admitted)}
      data-navigation={props.navigation === undefined ? "product" : "runtime"}
      data-feature-flags={props.featureFlags === undefined ? "product" : "runtime"}
    />
  ),
}))

import { AppGate } from "@/ui/auth/app-gate"
import * as pageClients from "@/ui/shell/page-clients"

it("captures the verified Product data epoch for engine parts reads, not the replacement render", async () => {
  state.probeMode = "authenticated"; state.probeState = "pass"; state.unavailable = false
  const bind = vi.spyOn(pageClients, "bindBrowserMessagePartsReadRecheck")
  const view = render(<LocaleProvider><AppGate /></LocaleProvider>)
  try {
    const capture = bind.mock.calls.at(-1)![0]
    expect(capture("other-actor")).toBeUndefined()
    const recover = capture("reader")!
    state.unavailable = true
    view.rerender(<LocaleProvider><AppGate /></LocaleProvider>)
    expect(bind.mock.calls.at(-1)![0]("reader")).toBeUndefined()
    const signal = new AbortController().signal
    await expect(recover(signal)).resolves.toBe(true)
    expect(state.reportReadUnauthorized).toHaveBeenLastCalledWith({ subject: "reader", generation: 1, signal })
  } finally { view.unmount(); bind.mockRestore() }
})

beforeEach(() => {
  state.source = "error"
  state.probeMode = "authenticated"
  state.probeState = "pass"
  state.pathname = "/app"
  state.openProductSignIn.mockClear()
  state.retry.mockClear()
  state.probeOptions.mockClear()
  router.refresh.mockClear()
  state.unavailable = false
  state.pending = false
})
afterEach(() => {
  cleanup()
  window.history.replaceState({}, "", "/")
  vi.useRealTimers()
})

it("keeps authenticated live Chat available when System presentation is unavailable", () => {
  render(<LocaleProvider><AppGate /></LocaleProvider>)

  const surface = screen.getByTestId("app-surface")
  expect(surface).toHaveAttribute("data-brand", "Kokoro")
  expect(surface).toHaveAttribute("data-preview", "false")
  expect(surface).toHaveAttribute("data-navigation", "product")
  expect(surface).toHaveAttribute("data-feature-flags", "product")
  expect(screen.queryByText("配置不可用")).toBeNull()
  expect(state.openProductSignIn).not.toHaveBeenCalled()
})

it("does not block the authenticated workbench while optional presentation loads", () => {
  state.source = "loading"
  render(<LocaleProvider><AppGate /></LocaleProvider>)
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-preview", "false")
})

it("uses verified System presentation when it is available", () => {
  state.source = "live"
  render(<LocaleProvider><AppGate /></LocaleProvider>)
  const surface = screen.getByTestId("app-surface")
  expect(surface).toHaveAttribute("data-brand", "Untrusted runtime brand")
  expect(surface).toHaveAttribute("data-navigation", "runtime")
  expect(surface).toHaveAttribute("data-feature-flags", "runtime")
})

it("silently rechecks a server admission failure without replacing an already verified workbench", async () => {
  vi.useFakeTimers();
  render(<LocaleProvider><AppGate serverUnavailable /></LocaleProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-booting", "false");
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-preview", "false");
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  await vi.advanceTimersByTimeAsync(1_000); expect(router.refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3_000); expect(router.refresh).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30_000); expect(router.refresh).toHaveBeenCalledTimes(2);
  expect(state.openProductSignIn).not.toHaveBeenCalled();
});

it("renders only the concentrated booting composition while server admission awaits the browser probe", () => {
  state.probeMode = "checking"
  state.probeState = "checking"
  render(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)

  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-booting", "true")
  expect(screen.queryByTestId("runtime-loading")).toBeNull()
})

it("retains the server-admitted shell without mounting private Runtime when the first probe is unavailable", () => {
  state.probeMode = "checking"
  state.probeState = "unavailable"
  render(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)

  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-booting", "true")
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting")
})

it("starts native sign-in once for one anonymous generation without restoring private Runtime", () => {
  state.probeState = "anonymous"
  state.probeMode = "checking"
  const view = render(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)

  expect(state.openProductSignIn).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-booting", "true")
  expect(screen.queryByRole("alert")).toBeNull()
  view.rerender(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)
  expect(state.openProductSignIn).toHaveBeenCalledTimes(1)
})

it("allows a new native sign-in only after leaving and re-entering anonymous state", () => {
  state.probeState = "anonymous"
  const view = render(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)
  expect(state.openProductSignIn).toHaveBeenCalledTimes(1)

  state.probeState = "pass"
  state.probeMode = "authenticated"
  view.rerender(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-booting", "false")

  state.probeState = "anonymous"
  state.probeMode = "checking"
  view.rerender(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)
  expect(state.openProductSignIn).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole("alert")).toBeNull()
})

it("keeps the data-free shell when native sign-in throws synchronously", () => {
  state.probeState = "anonymous"
  state.probeMode = "checking"
  state.openProductSignIn.mockImplementationOnce(() => { throw new Error("navigation failed") })
  render(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)

  expect(state.openProductSignIn).toHaveBeenCalledTimes(1)
  expect(state.retry).not.toHaveBeenCalled()
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-booting", "true")
})


it("does not let a stale RSC login pathname suppress actual mounted product sign-in", () => {
  state.pathname = "/login"
  state.probeState = "anonymous"
  state.probeMode = "checking"
  window.history.replaceState({}, "", "/app?conversation=conv_00000000-0000-4000-8000-000000000302")
  render(<LocaleProvider><AppGate /></LocaleProvider>)
  expect(state.openProductSignIn).toHaveBeenCalledOnce()
})
it("does not start a login loop from an actual login document with stale RSC product pathname", () => {
  state.probeState = "anonymous"
  state.probeMode = "checking"
  window.history.replaceState({}, "", "/login")
  render(<LocaleProvider><AppGate /></LocaleProvider>)
  expect(state.openProductSignIn).not.toHaveBeenCalled()
})


it("keeps the same public surface during silent recovery and verified admission", () => {
  state.probeMode = "checking"; state.probeState = "checking";
  const view = render(<LocaleProvider><AppGate /></LocaleProvider>);
  const surface = screen.getByTestId("app-surface");
  state.probeState = "unavailable"; state.unavailable = true;
  view.rerender(<LocaleProvider><AppGate /></LocaleProvider>);
  expect(screen.getByTestId("app-surface")).toBe(surface);
  expect(surface).toHaveAttribute("data-booting", "true");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  state.probeState = "pass"; state.probeMode = "authenticated"; state.unavailable = false;
  view.rerender(<LocaleProvider><AppGate /></LocaleProvider>);
  expect(screen.getByTestId("app-surface")).toBe(surface);
  expect(surface).toHaveAttribute("data-booting", "false");
  expect(surface).toHaveAttribute("data-admitted", "true");
  expect(screen.queryByRole("status")).toBeNull();
});
it("keeps the verified presentation during an outage, but revokes owner access without showing a diagnostic overlay", () => {
  state.pending = true;
  const view = render(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>);
  const surface = screen.getByTestId("app-surface");
  expect(surface).toHaveAttribute("data-booting", "false");
  state.pending = false; state.unavailable = true;
  view.rerender(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>);
  expect(screen.getByTestId("app-surface")).toBe(surface);
  expect(surface).toHaveAttribute("data-booting", "false");
  expect(surface).toHaveAttribute("data-admitted", "false");
  expect(surface).toHaveAttribute("data-preview", "false");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
});


it.each(["visibilitychange", "pageshow"])("resumes bounded server admission checks on %s after a hidden timer", async event => {
  vi.useFakeTimers()
  let visibility: DocumentVisibilityState = "hidden"
  const visible = vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility)
  try {
    render(<LocaleProvider><AppGate serverUnavailable /></LocaleProvider>)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(router.refresh).not.toHaveBeenCalled()
    visibility = "visible"
    if (event === "visibilitychange") document.dispatchEvent(new Event(event))
    else window.dispatchEvent(new Event(event))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(router.refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(33_000)
    expect(router.refresh).toHaveBeenCalledTimes(2)
    expect(state.openProductSignIn).not.toHaveBeenCalled()
  } finally { visible.mockRestore() }
})


it("uses the server-admitted boolean only as a cold CSRF-read hint while Runtime stays gated", () => {
  state.probeMode = "checking"
  state.probeState = "checking"
  render(<LocaleProvider><AppGate serverAdmitted /></LocaleProvider>)
  expect(state.probeOptions).toHaveBeenCalledWith({ serverUnavailable: false, serverAdmitted: true })
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-booting", "true")
  expect(screen.getByTestId("app-surface")).toHaveAttribute("data-admitted", "false")
})
