import { mcpPublicationErrorPolicy } from "./mcp-project-publication-error";
import { HubClientError, hasHubNoStoreDirective } from "./client";
import { publicationIdSchema, publicationErrorSchema, mcpPublicationInputSchema, parseMcpPublicationAck, parseMcpPublicationPage, type McpPublicationIdentity } from "./mcp-project-publication.schema";
async function request<T>(path: string, parse: (raw: unknown) => T, input?: unknown, key?: string, signal?: AbortSignal): Promise<T> {
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
    response = await within(fetch(`/api/hub${path}`, {
      method: input === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined,
      headers: { accept: "application/json", ...(input === undefined ? {} : { "content-type": "application/json", "idempotency-key": key! }) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    joined.throwIfAborted()
    if (response === undefined) throw new HubClientError("network", "MCP project publication response missing", null, null)
    const invalid = () => new HubClientError("parse", "invalid MCP project publication response", null, response!.status)
    if (!hasHubNoStoreDirective(response.headers) || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(response.headers.get("x-request-id") ?? "") || response.body === null) throw invalid()
    const declared = response.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 262_144)) throw invalid()
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
        if (count > 262_144) throw invalid()
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
      const error = publicationErrorSchema.safeParse(raw);
      if (!error.success || !mcpPublicationErrorPolicy(response.status, error.data.error)) throw invalid();
      throw new HubClientError("http", error.data.error.message, error.data.error.code, response.status, error.data.error.retryable, response.headers.get("x-request-id"), retryAfter);
    }
    try { return parse(raw); } catch { throw invalid(); }

  } catch (error) {
    if (error instanceof HubClientError) throw error;
    throw new HubClientError(signal?.aborted ? "aborted" : "network", "MCP project publication request did not complete", null, null);
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined); }
}

export function createMcpProjectPublicationClient() {
  const validate = (original: McpPublicationIdentity) => { const { server_id, ...body } = original; return { ...mcpPublicationInputSchema.parse(body), server_id: publicationIdSchema.parse(server_id) }; };
  return {
    list: (project: string, cursor?: string, signal?: AbortSignal) => {
      publicationIdSchema.parse(project);
      if (cursor !== undefined && !/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u.test(cursor)) throw new Error("publication_cursor_invalid");
      return request(`/projects/${encodeURIComponent(project)}/mcp-pins?limit=100${cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`}`, raw => parseMcpPublicationPage(raw, project, cursor), undefined, undefined, signal);
    },
    publish: (original: McpPublicationIdentity, key: string, signal?: AbortSignal) => {
      const { server_id, ...body } = validate(original);
      return request(`/mcp/servers/${encodeURIComponent(server_id)}/project-publications`, raw => parseMcpPublicationAck(raw, original), body, publicationIdSchema.parse(key), signal);
    },
    receipt: (original: McpPublicationIdentity, key: string, signal?: AbortSignal) => request("/mcp/project-publication-receipts", raw => parseMcpPublicationAck(raw, original, true), { publication: validate(original) }, publicationIdSchema.parse(key), signal),
  };
}
export type McpProjectPublicationClient = ReturnType<typeof createMcpProjectPublicationClient>;
