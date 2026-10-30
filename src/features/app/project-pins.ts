import { HubClientError, hasHubNoStoreDirective } from "@/hub/client"
import { parseMcpConnectorJson } from "@/hub/mcp-connector-json"
import { projectPinIdSchema, projectPinQuerySchema, setProjectPinRequestSchema, parseProjectPinList, parseProjectPinState, projectPinErrorAllowed, type ProjectPinQuery } from "@/generated/bff-project-pins"
export type { ProjectPinPage, ProjectPinState, ProjectPinItem } from "@/generated/bff-project-pins"

/** One finite request. Unknown writes never schedule another PUT. */
export function createProjectPinsClient() {
  const request = async <T>(path:string,input:unknown|undefined,parse:(raw:unknown)=>T,caller?:AbortSignal):Promise<T> => {
    const controller = new AbortController(),
      signal = caller
        ? AbortSignal.any([caller, controller.signal])
        : controller.signal;
    const deadlineAt = performance.now() + 10_000,
      timer = setTimeout(() => controller.abort(), 10_000);
    let response: Response | undefined;
    const check = () => {
      signal.throwIfAborted();
      if (performance.now() >= deadlineAt)
        throw Error("project_pin_deadline");
    };
    const within = <T>(work: Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        const stop = () => reject(signal.reason);
        signal.addEventListener("abort", stop, { once: true });
        void work
          .then(resolve, reject)
          .finally(() => signal.removeEventListener("abort", stop));
        if (signal.aborted) stop();
      });
    try {
      check();
      response = await within(
        fetch(
          path,
          {
            method: input ? "PUT" : "GET",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            signal,
            headers: {
              accept: "application/json",
              ...(input ? { "content-type": "application/json" } : {}),
            },
            ...(input ? { body: JSON.stringify(input) } : {}),
          },
        ).then((value) => {
          if (signal.aborted) void value.body?.cancel().catch(() => undefined);
          return value;
        }),
      );
      check();
      if (response === undefined) throw new HubClientError("network", "Project pin response missing", null, null);
      const invalid = () =>
        new HubClientError(
          "parse",
          "Invalid project pin response",
          null,
          response?.status ?? null,
        );
      if (
        !hasHubNoStoreDirective(response.headers) ||
        !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
          response.headers.get("content-type") ?? "",
        ) ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(
          response.headers.get("x-request-id") ?? "",
        ) ||
        response.body === null
      )
        throw invalid();
      const length = response.headers.get("content-length"),
        retryAfter = response.headers.get("retry-after");
      if (
        length !== null &&
        (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > 65536)
      )
        throw invalid();
      if (
        retryAfter !== null &&
        (response.status !== 429 ||
          !/^[1-9][0-9]{0,4}$/u.test(retryAfter) ||
          Number(retryAfter) > 86400)
      )
        throw invalid();
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        for (;;) {
          const next = await within(reader.read());
          check();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 65536) throw invalid();
          chunks.push(next.value);
        }
      } finally {
        signal.removeEventListener("abort", cancel);
        cancel();
        reader.releaseLock();
      }
      if (length !== null && Number(length) !== size) throw invalid();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let raw: unknown
      try { raw = parseMcpConnectorJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw invalid() }
      check()
      if (response.status !== 200) {
        const fault = projectPinErrorAllowed(response.status, raw)
        if (!fault || fault.meta.request_id !== response.headers.get("x-request-id")) throw invalid()
        throw new HubClientError("http", "Project pin request failed", fault.error.code, response.status)
      }
      try { return parse(raw) } catch { throw invalid() }
    } catch (error) {
      if (error instanceof HubClientError) throw error;
      throw new HubClientError(
        caller?.aborted ? "aborted" : "network",
        "Project pin request did not complete",
        null,
        null,
      );
    } finally {
      clearTimeout(timer);
      void response?.body?.cancel().catch(() => undefined);
    }
  };
  return {
    list: (query: ProjectPinQuery, signal?:AbortSignal) => {
      query=projectPinQuerySchema.parse(query)
      const params=new URLSearchParams()
      for(const [key,value] of Object.entries(query)) if(value!==undefined) params.set(key,String(value))
      return request(`/api/hub/self/project-pins${params.size?`?${params}`:""}`,undefined,raw=>parseProjectPinList(raw,query),signal)
    },
    set: (id:string,isPinned:boolean,signal?:AbortSignal) => {
      projectPinIdSchema.parse(id)
      const input=setProjectPinRequestSchema.parse({is_pinned:isPinned})
      return request(`/api/hub/projects/${encodeURIComponent(id)}/pin`,input,raw=>parseProjectPinState(raw,id,isPinned),signal)
    },
  }
}
export type ProjectPinsClient=ReturnType<typeof createProjectPinsClient>
