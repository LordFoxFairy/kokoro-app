/** Limited navigation intent only; this value never grants product access. */
export type ProductReturnTarget = string & { readonly __productReturnTarget: unique symbol }
export const DEFAULT_PRODUCT_RETURN_TARGET = "/app" as ProductReturnTarget

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const PROJECT = new RegExp(`^project_${UUID}$`, "u")
const CONVERSATION = new RegExp(`^conv_${UUID}$`, "u")
const LIBRARY_TYPES = new Set(["all", "slides", "websites", "documents", "spreadsheets", "images", "media", "other"])
const SURFACES = new Set(["/app", "/app/agents", "/app/plugins", "/app/scheduled", "/app/library", "/app/skills"])

/** Parse before URL normalization; reject encoded paths and ambiguous query input. */
export function parseProductReturnTarget(raw: string): ProductReturnTarget | null {
  if (raw.length === 0 || raw.length > 2048 || /[\\\u0000-\u001f\u007f#]/u.test(raw)) return null
  const separator = raw.indexOf("?")
  const pathname = separator === -1 ? raw : raw.slice(0, separator)
  if (pathname.startsWith("/skills/shared/")) {
    if (separator !== -1) return null
    const value = pathname.slice("/skills/shared/".length)
    try {
      const id = decodeURIComponent(value)
      return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id) && encodeURIComponent(id) === value ? pathname as ProductReturnTarget : null
    } catch { return null }
  }
  const project = pathname.startsWith("/app/project/") && PROJECT.test(pathname.slice("/app/project/".length))
  if (!SURFACES.has(pathname) && !project) return null
  if (separator === -1) return pathname as ProductReturnTarget
  const search = raw.slice(separator + 1)
  if (!search || search.includes("?")) return null
  // URLSearchParams otherwise silently repairs malformed escapes/UTF-8.
  for (const component of search.split("&")) {
    if (!component || !component.includes("=")) return null
    try { decodeURIComponent(component.replace(/\+/gu, " ")) } catch { return null }
  }
  const query = new URLSearchParams(search)
  const seen = new Set<string>()
  const canonical = new URLSearchParams()
  for (const [key, value] of query) {
    if (seen.has(key) || value.length === 0 || /[\\\u0000-\u001f\u007f]/u.test(value)) return null
    seen.add(key)
    if (pathname === "/app" || project) {
      if (key !== "conversation" || !CONVERSATION.test(value)) return null
    } else if (pathname === "/app/scheduled") {
      if (key === "tab") { if (value !== "calendar" && value !== "list") return null; if (value === "calendar") continue }
      else if (key !== "project_id" || !PROJECT.test(value)) return null
    } else if (pathname === "/app/library") {
      if (key === "tab") { if (value !== "artifacts") return null }
      else if (key === "type") { if (!LIBRARY_TYPES.has(value)) return null; if (value === "all") continue }
      else if (key === "view") { if (value !== "grid" && value !== "list") return null; if (value === "grid") continue }
      else if (key === "favorites") { if (value !== "1") return null }
      else if (key !== "q" || value.length > 512) return null
    } else return null
    canonical.set(key, value)
  }
  canonical.sort()
  const suffix = canonical.toString()
  const result = suffix ? `${pathname}?${suffix}` : pathname
  return result.length <= 2048 ? result as ProductReturnTarget : null
}
