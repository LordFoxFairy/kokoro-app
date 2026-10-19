import { HubClientError, hasHubNoStoreDirective } from "./client";
import { projectSkillIdSchema, projectSkillSelectionInputSchema, projectSkillSelectionSchema, type ProjectSkillSelection } from "./project-skills.schema";
import { installationKeySchema, installationErrorSchema } from "./schemas";

async function request(projectId: string, input?: { installation_ids: string[] }, key?: string, signal?: AbortSignal): Promise<ProjectSkillSelection> {
  const controller = new AbortController()
  const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  const timer = setTimeout(() => controller.abort(), 10_000)
  let response: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    response = await within(fetch(`/api/hub/projects/${encodeURIComponent(projectId)}/skill-selection`, {
      method: input === undefined ? "GET" : "PUT", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined,
      headers: { accept: "application/json", ...(input === undefined ? {} : { "content-type": "application/json", "idempotency-key": key! }) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    joined.throwIfAborted()
    if (response === undefined) throw new HubClientError("network", "Project Skill selection response missing", null, null)
    const invalid = () => new HubClientError("parse", "invalid Project Skill selection response", null, response!.status)
    if (!hasHubNoStoreDirective(response.headers) || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(response.headers.get("x-request-id") ?? "") || response.body === null) throw invalid()
    const declared = response.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 65_536)) throw invalid()
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let count = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        const part = await within(reader.read())
        joined.throwIfAborted()
        if (part.done) break
        count += part.value.byteLength
        if (count > 65_536) throw invalid()
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== count) throw invalid()
    const bytes = new Uint8Array(count)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw invalid() }
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter !== null && (response.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter))) throw invalid();
    if (response.status !== 200) {
      const error = installationErrorSchema.safeParse(raw);
      if (!error.success || ![400, 401, 403, 404, 405, 409, 412, 413, 429, 502, 503, 504].includes(response.status)) throw invalid();
      throw new HubClientError("http", error.data.error.message, error.data.error.code, response.status, error.data.error.retryable, response.headers.get("x-request-id"), retryAfter);
    }
    const parsed = projectSkillSelectionSchema.safeParse(raw);
    if (!parsed.success || parsed.data.data.project_id !== projectId
      || (input !== undefined && JSON.stringify(parsed.data.data.installation_ids) !== JSON.stringify(input.installation_ids))) throw invalid();
    return parsed.data.data;
  } catch (error) {
    if (error instanceof HubClientError) throw error;
    throw new HubClientError(signal?.aborted ? "aborted" : "network", "Project Skill selection request did not complete", null, null);
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined); }
}

export function createProjectSkillSelectionClient(project: string) {
  const projectId = projectSkillIdSchema.parse(project);
  return {
    get: (signal?: AbortSignal) => request(projectId, undefined, undefined, signal),
    replace: (installationIds: readonly string[], key: string, signal?: AbortSignal) => request(projectId,
      projectSkillSelectionInputSchema.parse({ installation_ids: [...installationIds] }), installationKeySchema.parse(key), signal),
  };
}
