import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { McpConnector, McpConnectorProvider } from "@/hub/mcp-connector.schema"
import type { CustomApiProfile } from "@/hub/custom-api.schema"
import { LocaleProvider } from "@/i18n/context"
import { McpPersonalServerGallery } from "@/ui/mcp/mcp-personal-server-gallery"
import { McpCustomApiGallery } from "@/ui/mcp/mcp-custom-api-gallery"
import { McpProviderDirectory } from "@/ui/mcp/mcp-provider-directory"
import { McpConnectorCard } from "@/ui/mcp/mcp-connector-card"
import { McpCustomApiCard } from "@/ui/mcp/mcp-custom-api-card"

afterEach(cleanup)
const name = "QA [MCP]+ / [mcp]+ <img src=x>"
const connector: McpConnector = { connector_id: "search-connector", server_id: "search-server", provider_key: "search-provider", connector_type: "mcp", display_name: name, description: "Literal search description", status: "active", enabled: true, availability: "available", approved_scopes: [], state_version: "2" }
const api: CustomApiProfile = { profile_id: "search-api", name, instructions: "Literal search description", state_version: "2", environment: [], created_at: "2026-10-26T00:00:00Z", updated_at: "2026-10-26T00:00:00Z" }
const provider: McpConnectorProvider = { provider_key: "search-provider", display_name: name, directory_type: "app", category_keys: [], example_prompts: [], enabled: true, state_version: "1" }

it.each(["personal", "api", "provider"] as const)("highlights literal query hits in %s plaza names without changing the accessible action or inserting markup", kind => {
  const select = vi.fn()
  const query = " [mcp]+ "
  const content = kind === "personal"
    ? <McpPersonalServerGallery connectors={[connector]} providers={[]} admitted confirmed query={query} category="all" onSelect={select} />
    : kind === "api"
      ? <McpCustomApiGallery profiles={[api]} admitted confirmed query={query} category="all" onSelect={select} />
      : <McpProviderDirectory providers={[provider]} presentation="plaza" query={query} categoryFilter="all" onCategoryFilterChange={vi.fn()} onSelectProvider={select} />
  const { container } = render(<LocaleProvider>{content}</LocaleProvider>)
  const action = screen.getByRole("button", { name })
  expect(Array.from(action.querySelectorAll("mark"), mark => mark.textContent)).toEqual(["[MCP]+", "[mcp]+"])
  expect(action).toHaveTextContent(name)
  expect(container.querySelector("img[src=x]")).toBeNull()
  fireEvent.click(action)
  expect(select).toHaveBeenCalledWith(kind === "personal" ? connector : kind === "api" ? api : provider, action)
})

it("does not mark management names or blank/unmatched plaza queries", () => {
  const select = vi.fn()
  const view = render(<LocaleProvider><ul><McpConnectorCard connector={connector} searchQuery="[MCP]+" onSelect={select} /><McpCustomApiCard profile={api} searchQuery="[MCP]+" onSelect={select} /></ul></LocaleProvider>)
  expect(view.container.querySelector("mark")).toBeNull()
  view.rerender(<LocaleProvider><McpProviderDirectory providers={[provider]} query="[MCP]+" categoryFilter="all" onCategoryFilterChange={vi.fn()} onSelectProvider={select} /></LocaleProvider>)
  expect(view.container.querySelector("mark")).toBeNull()
  for (const query of ["", "   ", "not-present"]) {
    view.rerender(<LocaleProvider><McpProviderDirectory providers={[provider]} presentation="plaza" query={query} categoryFilter="all" onCategoryFilterChange={vi.fn()} onSelectProvider={select} /></LocaleProvider>)
    expect(view.container.querySelector("mark")).toBeNull()
    expect(screen.getByRole("button", { name })).toBeInTheDocument()
  }
})

it("treats every regex metacharacter and HTML-looking name as literal text", () => {
  const query = ".*+?^${}()|[]\\"
  const displayName = `${query} <img src=x>`
  const view = render(<LocaleProvider><McpProviderDirectory providers={[{ ...provider, display_name: displayName }]} presentation="plaza" query={query} categoryFilter="all" onCategoryFilterChange={vi.fn()} onSelectProvider={vi.fn()} /></LocaleProvider>)
  expect(view.container.querySelector("mark")).toHaveTextContent(query)
  expect(screen.getByRole("button", { name: displayName })).toHaveTextContent(displayName)
  view.rerender(<LocaleProvider><McpProviderDirectory providers={[{ ...provider, display_name: displayName }]} presentation="plaza" query="<img src=x>" categoryFilter="all" onCategoryFilterChange={vi.fn()} onSelectProvider={vi.fn()} /></LocaleProvider>)
  expect(view.container.querySelector("mark")).toHaveTextContent("<img src=x>")
  expect(view.container.querySelector("img[src=x]")).toBeNull()
})
