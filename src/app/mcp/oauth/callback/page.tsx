import { McpOAuthCallback, parseMcpOAuthCallback } from "@/ui/mcp/mcp-oauth-callback"

type CallbackSearchParameters = Record<string, string | readonly string[] | undefined>

function serializeSearchParameters(parameters: CallbackSearchParameters): string {
  const search = new URLSearchParams()
  for (const [name, rawValue] of Object.entries(parameters)) {
    if (rawValue === undefined) continue
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) search.append(name, value)
  }
  return search.toString()
}

export default async function McpOAuthCallbackPage({ searchParams }: { searchParams: Promise<CallbackSearchParameters> }) {
  const parameters = await searchParams
  return <McpOAuthCallback payload={parseMcpOAuthCallback(serializeSearchParameters(parameters))} />
}
