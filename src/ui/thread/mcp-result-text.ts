/** Reading projection of an already bounded owner preview, never a result/status decoder. */
export function mcpResultText(raw: string): string[] | null {
  if (!raw.trim()) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch {
    // A cut JSON envelope is not prose. Leave it intact in technical details.
    return /^[\s]*[\[{"]/.test(raw) ? null : [raw]
  }
  if (typeof value === "string") return value.trim() ? [value] : null
  const text: unknown = Array.isArray(value) ? value
    : value !== null && typeof value === "object" && "text" in value ? value.text : null
  return Array.isArray(text) && text.length > 0 && text.every(item => typeof item === "string") && text.some(item => item.trim())
    ? text : null
}
