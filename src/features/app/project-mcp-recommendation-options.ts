import type { HubClient } from "@/hub/client"
import type { McpConnector, McpConnectorProvider } from "@/hub/mcp-connector.schema"
import type { CustomApiProfile } from "@/hub/custom-api.schema"
import { projectMcpRecommendationRefSchema } from "@/generated/bff-project-mcp-recommendations"
import type { ProjectMcpRecommendationRef } from "@/hub/project-mcp-recommendations-client"

export type ProjectMcpRecommendationOption = {
  id: string
  ref: ProjectMcpRecommendationRef
  label: string
  search: string
  source: { kind: "provider"; value: McpConnectorProvider } | { kind: "mcp_connector"; value: McpConnector } | { kind: "custom_api"; value: CustomApiProfile }
}
export const projectMcpRecommendationKey = (ref: ProjectMcpRecommendationRef) => JSON.stringify([ref.kind,
  ref.kind === "provider" ? ref.provider_key : ref.kind === "mcp_connector" ? ref.connector_id : ref.profile_id])

/** One bounded complete scan of the three existing safe sources. No detail/secret reads. */
export async function readProjectMcpRecommendationOptions(hub: HubClient, caller: AbortSignal): Promise<readonly ProjectMcpRecommendationOption[]> {
  const controller = new AbortController(), signal = AbortSignal.any([caller, controller.signal])
  const timer = setTimeout(() => controller.abort(), 10_000)
  const scan = async <T,>(read: (cursor?: string) => Promise<{ rows: readonly T[]; next: string | null }>, id: (row: T) => string) => {
    const rows: T[] = [], ids = new Set<string>(), cursors = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < 50; page++) {
      signal.throwIfAborted()
      const next = await read(cursor)
      signal.throwIfAborted()
      for (const row of next.rows) {
        const key = id(row)
        if (ids.has(key)) throw Error("recommendation_directory_duplicate")
        ids.add(key); rows.push(row)
      }
      if (next.next === null) return rows
      if (cursors.has(next.next)) throw Error("recommendation_directory_cursor_cycle")
      cursors.add(next.next); cursor = next.next
    }
    throw Error("recommendation_directory_budget")
  }
  let stop = () => {}
  try {
    const cancelled = new Promise<never>((_, reject) => {
      stop = () => reject(Error("recommendation_directory_retired"))
      signal.addEventListener("abort", stop, { once: true })
      if (signal.aborted) stop()
    })
    const work = async () => {
      if (!hub.listCustomApis) throw Error("recommendation_custom_api_unavailable")
      const [providers, connectors, profiles] = await Promise.all([
        scan(async cursor => { const page = await hub.listMcpConnectorProviders({ limit: 100, ...(cursor ? { cursor } : {}) }, signal); return { rows: page.items, next: page.next_cursor } }, row => row.provider_key),
        scan(async cursor => { const page = await hub.listMcpConnectors({ limit: 100, ...(cursor ? { cursor } : {}) }, signal); return { rows: page.items, next: page.next_cursor } }, row => row.connector_id),
        scan(async cursor => { const page = await hub.listCustomApis!({ limit: 100, ...(cursor ? { cursor } : {}) }, signal); return { rows: page.items, next: page.page.next_cursor } }, row => row.profile_id),
      ])
      signal.throwIfAborted()
      const options: ProjectMcpRecommendationOption[] = []
      const add = (ref: ProjectMcpRecommendationRef, label: string, description: string | undefined, source: ProjectMcpRecommendationOption["source"]) => {
        // A catalog entry outside the formal recommendation locator grammar is not selectable.
        if (!projectMcpRecommendationRefSchema.safeParse(ref).success) return
        options.push({ id: projectMcpRecommendationKey(ref), ref, label, search: `${label}\n${description ?? ""}`.toLocaleLowerCase(), source })
      }
      for (const value of providers) add({ kind: "provider", provider_key: value.provider_key }, value.display_name, value.description, { kind: "provider", value })
      for (const value of connectors) if (value.connector_type === "mcp" && value.status !== "revoked")
        add({ kind: "mcp_connector", connector_id: value.connector_id }, value.display_name ?? value.provider_key, value.description, { kind: "mcp_connector", value })
      for (const value of profiles) add({ kind: "custom_api", profile_id: value.profile_id }, value.name, value.instructions, { kind: "custom_api", value })
      return options
    }
    return await Promise.race([work(), cancelled])
  } finally { clearTimeout(timer); signal.removeEventListener("abort", stop); controller.abort() }
}
