/**
 * Parses a current-user MCP JSON body without collapsing duplicate JSON keys.
 *
 * The browser-private MCP adapter must preserve the owner contract's strict
 * object semantics before applying its Zod schema. This stays beside the MCP
 * wire schema instead of borrowing a Project-specific parser.
 */
export function parseMcpConnectorJson(text: string): unknown {
  const value: unknown = JSON.parse(text)
  const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? []
  let cursor = 0

  const visit = (): void => {
    const token = tokens[cursor++]
    if (token === "{") {
      const keys = new Set<string>()
      if (tokens[cursor] === "}") { cursor++; return }
      do {
        const key = JSON.parse(tokens[cursor++]!) as string
        if (keys.has(key)) throw new SyntaxError("Duplicate JSON key")
        keys.add(key)
        cursor++
        visit()
      } while (tokens[cursor++] === ",")
      return
    }
    if (token === "[") {
      if (tokens[cursor] === "]") { cursor++; return }
      do { visit() } while (tokens[cursor++] === ",")
    }
  }

  visit()
  return value
}
