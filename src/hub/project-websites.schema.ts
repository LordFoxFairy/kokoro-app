import { PROJECT_WEBSITE_URL_MAX_BYTES, projectWebsiteUrlsSchema, projectWebsitesResponseSchema } from "@/generated/bff-project-websites"

/** Public 28.31 semantic URL constraints not expressible as generated JSON Schema. Never fetches an address. */
export function canonicalProjectWebsite(raw: string): string | null {
  const authority = /^https?:\/\/([^/?#]+)/iu.exec(raw)?.[1]
  if (!authority || authority.includes("@") || /[\\\s\p{Cc}\p{Cf}\p{Cs}]/u.test(raw) ||
    new TextEncoder().encode(raw).byteLength > PROJECT_WEBSITE_URL_MAX_BYTES) return null
  try {
    const url = new URL(raw)
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" &&
      url.username === "" && url.password === "" && new TextEncoder().encode(url.href).byteLength <= PROJECT_WEBSITE_URL_MAX_BYTES
      ? url.href : null
  } catch { return null }
}

export function canonicalProjectWebsites(values: readonly string[]): string[] | null {
  if (!projectWebsiteUrlsSchema.safeParse(values).success) return null
  const normalized: string[] = []
  for (const value of values) {
    const url = canonicalProjectWebsite(value)
    if (url === null || normalized.includes(url)) return null
    normalized.push(url)
  }
  return normalized.sort()
}

export function sameProjectWebsites(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((url, index) => url === right[index])
}

export function parseProjectWebsitesState(raw: unknown, projectId: string) {
  const result = projectWebsitesResponseSchema.safeParse(raw)
  if (!result.success || result.data.data.project_id !== projectId) return null
  const state = result.data.data
  const canonical = canonicalProjectWebsites(state.websites)
  return canonical !== null && sameProjectWebsites(state.websites, canonical) ? state : null
}
