import { z } from "zod"

export const projectDownloadMaxBytes = 1_048_576
export const projectDownloadBrowserCache = "private, no-store, max-age=0"
export const projectDownloadSelector = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u)
export const projectDownloadIntentSchema = z.object({
  projectRef: projectDownloadSelector, assetId: projectDownloadSelector,
  filename: z.string().min(1).max(255).regex(/^[^\u0000-\u001f\u007f/\\]+$/u),
  mimeType: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu),
  sizeBytes: z.string().regex(/^(0|[1-9][0-9]*)$/u).refine(value => BigInt(value) <= BigInt(projectDownloadMaxBytes)),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict()
export type ProjectResourceDownloadIntent = z.infer<typeof projectDownloadIntentSchema>
export const projectDownloadErrorSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
  meta: z.object({ request_id: z.string().min(1) }).passthrough(),
}).strict()

/** Boundary-specific cache is exact; owner credentials and redirect targets never reach the browser. */
export function projectDownloadHeadersValid(headers: Headers, boundary: "owner" | "browser", requestId?: string): boolean {
  const id = headers.get("x-request-id")
  return headers.get("cache-control") === (boundary === "owner" ? "no-store" : projectDownloadBrowserCache)
    && headers.get("referrer-policy") === "no-referrer" && headers.get("x-content-type-options") === "nosniff"
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id ?? "") && (requestId === undefined || requestId === id)
    && !["set-cookie", "location", "content-encoding"].some(name => headers.has(name))
}

export function projectDownloadMetadata(headers: Headers): { filename: string; mimeType: string; length: number } | null {
  const mimeType = headers.get("content-type") ?? "", length = headers.get("content-length") ?? ""
  const match = /^attachment; filename="([\x20-\x7e]*)"; filename\*=UTF-8''([A-Za-z0-9._~!%-]+)$/u.exec(headers.get("content-disposition") ?? "")
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(mimeType)
    || !/^(0|[1-9][0-9]*)$/u.test(length) || BigInt(length) > BigInt(projectDownloadMaxBytes)
    || !match || /["\\;]/u.test(match[1] ?? "")) return null
  try {
    const filename = decodeURIComponent(match[2] ?? "")
    if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f/\\]/u.test(filename)) return null
    return { filename, mimeType, length: Number(length) }
  } catch { return null }
}

export function projectDownloadOwnerStatus(status: number): boolean {
  return [400, 401, 403, 404, 429, 502, 503].includes(status)
}
