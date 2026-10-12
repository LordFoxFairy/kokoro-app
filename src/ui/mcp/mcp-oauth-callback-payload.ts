export type McpOAuthCallbackPayload = { state: string; code: string } | { state: string; error: string }

function onlyParameter(parameters: URLSearchParams, name: string): string | undefined {
  const values = parameters.getAll(name)
  return values.length === 1 && values[0] !== "" ? values[0] : undefined
}

/** Accept exactly the standard OAuth callback XOR body; never retain it in app state. */
export function parseMcpOAuthCallback(search: string): McpOAuthCallbackPayload | undefined {
  const parameters = new URLSearchParams(search)
  const state = onlyParameter(parameters, "state")
  const code = onlyParameter(parameters, "code")
  const error = onlyParameter(parameters, "error")
  if (state === undefined || (code === undefined && error === undefined) || (code !== undefined && error !== undefined)) return undefined
  return code === undefined ? { state, error: error as string } : { state, code }
}
