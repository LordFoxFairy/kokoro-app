import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"

const state = vi.hoisted(() => ({
  source: "error" as "error" | "loading" | "live",
  probeMode: "authenticated" as "authenticated" | "preview",
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }))
vi.mock("@/ui/auth/use-session-state", () => ({
  useSessionProbe: () => ({ state: "pass", mode: state.probeMode }),
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
vi.mock("@/ui/shell/page-clients", () => ({ browserScheduledTaskClient: () => ({}) }))
vi.mock("@/features/app/kokoro-app-surface", () => ({
  KokoroAppSurface: (props: Record<string, unknown>) => (
    <div
      data-testid="app-surface"
      data-brand={props.brandName}
      data-preview={String(props.preview)}
      data-navigation={props.navigation === undefined ? "product" : "runtime"}
      data-feature-flags={props.featureFlags === undefined ? "product" : "runtime"}
    />
  ),
}))

import { AppGate } from "@/ui/auth/app-gate"

beforeEach(() => {
  state.source = "error"
  state.probeMode = "authenticated"
  state.replace.mockClear()
})
afterEach(cleanup)

it("keeps authenticated live Chat available when System presentation is unavailable", () => {
  render(<LocaleProvider><AppGate /></LocaleProvider>)

  const surface = screen.getByTestId("app-surface")
  expect(surface).toHaveAttribute("data-brand", "Kokoro")
  expect(surface).toHaveAttribute("data-preview", "false")
  expect(surface).toHaveAttribute("data-navigation", "product")
  expect(surface).toHaveAttribute("data-feature-flags", "product")
  expect(screen.queryByText("配置不可用")).toBeNull()
  expect(state.replace).not.toHaveBeenCalled()
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
