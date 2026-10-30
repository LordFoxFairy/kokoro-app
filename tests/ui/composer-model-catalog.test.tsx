import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { createSessionEngine } from "@/engine/machine"
import * as pageClients from "@/ui/shell/page-clients"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"
import type { ConversationStore } from "@/core/conversations"

let originalUrl: string
beforeEach(() => {
  originalUrl = window.location.href
  // The real shell reads history as well as Next's pathname.
  window.history.replaceState(null, "", "/app")
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.history.replaceState(null, "", originalUrl) })

it("ordinary new chat exposes the business catalog before the first submission", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  const boundary = { admitted: true, subject: "catalog-first-submit-reader", generation: 1 }
  window.localStorage.setItem(pageClients.AUTH_INDEX_SUBJECT_KEY, boundary.subject)
  const client = createFakeClient()
  client.listModels = async () => ({ models: [{ provider: "provider", name: "chat/business", is_default: true,
    display_name: "Business chat", model_id: "11111111-1111-4111-8111-111111111111",
    revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333",
    feature_key: "chat", request_model: "vendor-model" }], next_cursor: null })
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" projectReadBoundary={boundary} /></LocaleProvider></ThemeProvider>)
    await act(async () => { await settle() })
    fireEvent.pointerDown(screen.getByRole("button", { name: "Switch model: Business chat" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Business chat" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Chat input" }), { target: { value: "selected first request" } })
    fireEvent.submit(screen.getByRole("form", { name: "Message editor" }))
    await act(async () => { await settle() })
    expect(client.createCalls[0]?.body.model).toBe("chat/business")
  } finally { engine.dispose() }
})
