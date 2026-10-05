import { projectResponseSchema } from "@/contract/project"

export class ProjectCreateError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(code)
    this.name = "ProjectCreateError"
  }
}

/** One bounded BFF attempt for a caller-owned intent; never an automatic retry. */
export async function createProject(name: string, idempotencyKey: string, signal: AbortSignal): Promise<{ id: string; slug: string }> {
  if (!name.trim() || !idempotencyKey) throw new ProjectCreateError("project_create_invalid_input")
  if (signal.aborted) throw new ProjectCreateError("project_create_request_aborted")
  const controller = new AbortController()
  const deadlineAt = performance.now() + 10_000
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  let response: Response | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const check = () => {
    const fault = performance.now() >= deadlineAt ? "project_create_request_timeout"
      : signal.aborted || controller.signal.aborted ? "project_create_request_aborted" : null
    if (fault !== null) {
      // A fetch that ignores abort may deliver headers after outer finally.
      // Release that late body here; it must never be read or adopted.
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
      throw new ProjectCreateError(fault)
    }
  }
  const readJson = async (): Promise<unknown> => {
    check()
    if (!response?.body) return JSON.parse("") as unknown
    const bodyReader = response.body.getReader()
    reader = bodyReader
    const decoder = new TextDecoder()
    let text = ""
    try {
      while (true) {
        check()
        const chunk = await bodyReader.read()
        check()
        if (chunk.done) break
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
      check()
      return JSON.parse(text) as unknown
    } finally {
      if (reader === bodyReader) {
        reader = undefined
        bodyReader.releaseLock()
      }
    }
  }
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => { reject(new ProjectCreateError("project_create_request_aborted")); controller.abort() }
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) { abort(); return }
    timer = setTimeout(() => { reject(new ProjectCreateError("project_create_request_timeout")); controller.abort() }, 10_000)
  })
  try {
    return await Promise.race([interrupted, (async () => {
      check()
      try {
        response = await fetch("/api/hub/projects", {
          method: "POST", cache: "no-store", signal: controller.signal,
          headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ name }),
        })
      } catch { check(); throw new ProjectCreateError("project_create_network_error") }
      check()
      if (!response.ok) {
        let code = `project_create_http_${response.status}`
        try {
          const payload = await readJson() as { error?: { code?: unknown } }
          if (typeof payload.error?.code === "string") code = payload.error.code
        } catch { check() /* The status still identifies a failed complete attempt. */ }
        check()
        throw new ProjectCreateError(code, response.status)
      }
      let payload: unknown
      try { payload = await readJson() } catch { check(); throw new ProjectCreateError("project_create_invalid_response", response.status) }
      check()
      const parsed = projectResponseSchema.safeParse(payload)
      check()
      if (!parsed.success) throw new ProjectCreateError("project_create_invalid_response", response.status)
      const project = parsed.data.data.project
      // Canonical identity is required; compatible owner additions stay accepted.
      if (!project.id.trim() || !project.slug.trim() || !project.name || project.id.startsWith("preview-project")) {
        throw new ProjectCreateError("project_create_invalid_response", response.status)
      }
      check()
      return { id: project.id, slug: project.slug }
    })()])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", abort)
    controller.abort()
    if (reader) {
      const pendingReader = reader
      reader = undefined
      // Do not await a non-cooperating underlying cancel promise. Cancellation
      // closes pending reads immediately; releasing our lock is synchronous.
      void pendingReader.cancel().catch(() => undefined)
      pendingReader.releaseLock()
    }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
}
