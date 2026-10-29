import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ComponentType } from "react"

import { LocaleProvider } from "@/i18n/context"

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "share-1" }),
}))

vi.mock("@/system/use-runtime-manifest", () => ({
  useRuntimeManifest: () => ({
    manifest: {
      brand: { name: "Acme Site", mark: "A", logoUrl: undefined },
    },
  }),
}))

function renderPage(Page: ComponentType) {
  return render(<Page />, { wrapper: LocaleProvider })
}

const snapshot = {
  session: {
    session_id: "session-1",
    title: "A shared task",
    owner_id: "owner-1",
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:01.000Z",
  },
  messages: [],
  execution_process: null,
  files: [],
  deliveries: [],
  deliveries_has_more: false,
  event_watermark: null,
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("SharedPage", () => {
  it("uses the runtime site skin on the public ready header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: snapshot, meta: { request_id: "req-share-read" } }), { status: 200 })))

    const { default: SharedPage } = await import("@/app/shared/[id]/page")
    renderPage(SharedPage)

    expect(await screen.findByRole("heading", { name: "A shared task" })).toBeTruthy()
    expect(screen.getByText("Acme Site")).toBeTruthy()
    expect(screen.getByText("A")).toBeTruthy()
  })

  it("renders a shadcn empty state for revoked or missing shares", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    const { default: SharedPage } = await import("@/app/shared/[id]/page")
    renderPage(SharedPage)

    expect(await screen.findByTestId("shared-notfound")).toHaveAttribute("data-testid", "shared-notfound")
    expect(screen.getByTestId("shared-notfound").querySelector('[data-slot="empty"]')).toBeTruthy()
    expect(screen.getByText("Acme Site")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to Kokoro" })).toBeTruthy()
  })
})

// The public adapter preserves the owner envelope; no test-only bare snapshot.
it.each([
  ["dependency failure", 503, null],
  ["bare snapshot", 200, snapshot],
  ["private process", 200, { data: { ...snapshot, execution_process: { run_id: "private" } }, meta: { request_id: "req-1" } }],
  ["unexpected field", 200, { data: snapshot, meta: { request_id: "req-1" }, private_token: "not-for-public" }],
])("does not claim revocation or render private data on %s", async (_name, status, body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body === null ? null : JSON.stringify(body), { status })))
  const { default: SharedPage } = await import("@/app/shared/[id]/page")
  renderPage(SharedPage)
  expect(await screen.findByText("Shared content could not be displayed.")).toBeVisible()
  expect(screen.queryByText("The link may have been revoked, or the session deleted.")).toBeNull()
  expect(screen.queryByTestId("shared-page")).toBeNull()
})
