import type { ProjectMcpRecommendationRef } from "@/hub/project-mcp-recommendations-client"
import { selectedMcpConnectionIdsSchema } from "@/contract/chat"
import type { ComposerConnection } from "@/ui/shell/use-composer-connections"

/** Input is a complete current-user catalog, never a recommendation's execution permission. */
export function projectMcpDefaultSelection(refs: readonly ProjectMcpRecommendationRef[], connections: readonly ComposerConnection[]): readonly string[] | null {
  const ids = new Set<string>()
  for (const ref of refs) {
    if (ref.kind === "custom_api") continue // This configuration type has no issued Run mapping.
    const matches = connections.filter(item => item.selectable && item.availability === "available" &&
      (ref.kind === "provider" ? item.providerKey === ref.provider_key : item.connectorId === ref.connector_id))
    if (matches.length === 1) ids.add(matches[0]!.id) // Ambiguous/missing sources stay for explicit user choice.
  }
  const parsed = selectedMcpConnectionIdsSchema.safeParse([...ids])
  return parsed.success ? parsed.data : null // Never truncate to fit an execution request.
}
