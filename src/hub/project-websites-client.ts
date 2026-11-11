import { PROJECT_WEBSITES_BODY_LIMIT, projectWebsitesProjectIdSchema, type ProjectWebsitesState } from "@/generated/bff-project-websites"
import { projectResourceErrorEnvelopeSchema } from "@/generated/bff-project-resource"
import { hasHubNoStoreDirective } from "./client"
import { parseProjectWebsitesState, sameProjectWebsites } from "./project-websites.schema"

type ProjectWebsitesResult = { kind: "ok"; state: ProjectWebsitesState } | { kind: "stale" | "denied" | "rejected" | "unknown" }

async function request(projectId: string, signal: AbortSignal, replace?: { original: ProjectWebsitesState; websites: string[] }): Promise<ProjectWebsitesResult> {
  if (!projectWebsitesProjectIdSchema.safeParse(projectId).success) return { kind: "rejected" }
  const joined = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
  try {
    joined.throwIfAborted()
    const response = await fetch(`/api/hub/projects/${projectId}/websites`, {
      method: replace ? "PUT" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined,
      headers: { accept: "application/json", ...(replace ? { "content-type": "application/json" } : {}) },
      ...(replace ? { body: JSON.stringify({ websites: replace.websites, expected_state_version: replace.original.state_version }) } : {}),
    })
    joined.throwIfAborted()
    const requestId = response.headers.get("x-request-id")
    const length = response.headers.get("content-length")
    if (!requestId || !hasHubNoStoreDirective(response.headers) || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") ||
      (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > PROJECT_WEBSITES_BODY_LIMIT))) {
      void response.body?.cancel().catch(() => undefined)
      return { kind: "unknown" }
    }
    // The only same-origin adapter applies the streaming cap before relaying JSON.
    const raw: unknown = await response.json()
    joined.throwIfAborted()
    if (response.status === 200) {
      const state = parseProjectWebsitesState(raw, projectId)
      if (state === null) return { kind: "unknown" }
      if (replace) {
        const expected = Number(replace.original.state_version) + (sameProjectWebsites(replace.original.websites, replace.websites) ? 0 : 1)
        if (Number(state.state_version) !== expected || !sameProjectWebsites(state.websites, replace.websites)) return { kind: "unknown" }
      }
      return { kind: "ok", state }
    }
    const error = projectResourceErrorEnvelopeSchema.safeParse(raw)
    if (!error.success || error.data.meta.request_id !== requestId) return { kind: "unknown" }
    if ([401, 403, 404].includes(response.status)) return { kind: "denied" }
    if (replace && response.status === 412 && error.data.error.code === "project_websites_precondition_failed") return { kind: "stale" }
    if (replace && [400, 413].includes(response.status)) return { kind: "rejected" }
    return { kind: "unknown" }
  } catch { return { kind: "unknown" } }
}

export const projectWebsitesClient = {
  get: (projectId: string, signal: AbortSignal) => request(projectId, signal),
  replace: (original: ProjectWebsitesState, websites: string[], signal: AbortSignal) => request(original.project_id, signal, { original, websites }),
}
