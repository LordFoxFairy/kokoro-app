import { z, type ZodTypeAny } from "zod"
import { putSkillPackage } from "./skill-package-transfer"

import { HubClientError, hasHubNoStoreDirective } from "./client"
import {
  createPersonalSkillVersionRequestSchema, createPersonalSkillVersionSchema, withdrawPersonalSkillRequestSchema, withdrawPersonalSkillSchema,
  beginSkillUploadRequestSchema, beginSkillUploadSchema, completeSkillUploadRequestSchema,
  completeSkillUploadSchema, createSkillDraftRequestSchema, skillDraftSchema,
  skillUploadStateSchema, validateSkillDraftSchema, publishSkillDraftSchema,
  skillCommandPath, managedPersonalSkillPath, transferReferenceSchema, skillSourceVersionSchema, validateSkillDraftRequestSchema, skillPublishRequestSchema, managedPersonalSkillSchema, managedPersonalSkillPageSchema,
  type ValidateSkillDraftRequest, type SkillPublishRequest, type ManagedPersonalSkill, type BeginSkillUploadRequest, type CompleteSkillUploadRequest,
  type CreateSkillDraftRequest, type TransferReference,
} from "./schemas"

const responseHeaders = (response: Response): boolean =>
  hasHubNoStoreDirective(response.headers)
  && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(response.headers.get("x-request-id") ?? "")
  && /^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "")

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()
const managedErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string().min(1) }).strict(), meta: z.object({ request_id: z.string().min(1).max(256) }).strict() }).strict()
type SkillOperation = "createDraft" | "getUpload" | "beginUpload" | "completeUpload" | "validateDraft" | "publishDraft" | "managedList" | "managedDetail" | "createVersion" | "withdraw"
// Each operation is pinned independently; a known code is not valid at every status.
const operationErrorPairs: Record<SkillOperation, Readonly<Record<number, readonly string[]>>> = {
  createVersion: { 400: ["invalid_skill_request", "idempotency_key_required", "invalid_idempotency_key"], 401: ["session_authentication_required", "session_invalid"], 403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden", "skill_forbidden"], 404: ["skill_not_found"], 409: ["skill_idempotency_conflict", "skill_command_in_progress"], 412: ["skill_precondition_failed"], 413: ["request_body_too_large"], 429: ["session_rate_limited", "skill_rate_limited"], 502: ["skill_response_invalid"], 503: ["product_tenant_not_configured", "iam_admission_unavailable", "skill_dependency_unavailable"] },
  withdraw: { 400: ["invalid_skill_request", "idempotency_key_required", "invalid_idempotency_key"], 401: ["session_authentication_required", "session_invalid"], 403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden", "skill_forbidden"], 404: ["skill_not_found"], 409: ["skill_idempotency_conflict", "skill_command_in_progress"], 412: ["skill_precondition_failed"], 413: ["request_body_too_large"], 429: ["session_rate_limited", "skill_rate_limited"], 502: ["skill_response_invalid"], 503: ["product_tenant_not_configured", "iam_admission_unavailable", "skill_dependency_unavailable"] },
  "createDraft": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "getUpload": {
    "400": [
      "invalid_skill_request"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "beginUpload": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "completeUpload": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "validateDraft": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "publishDraft": {
    "400": [
      "invalid_skill_request",
      "idempotency_key_required",
      "invalid_idempotency_key"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden",
      "skill_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "409": [
      "skill_idempotency_conflict",
      "skill_command_in_progress"
    ],
    "412": [
      "skill_precondition_failed"
    ],
    "413": [
      "request_body_too_large"
    ],
    "429": [
      "session_rate_limited",
      "skill_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "managedList": {
    "400": [
      "invalid_skill_request"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden"
    ],
    "429": [
      "session_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  },
  "managedDetail": {
    "400": [
      "invalid_skill_request"
    ],
    "401": [
      "session_authentication_required",
      "session_invalid"
    ],
    "403": [
      "service_auth_failed",
      "session_forbidden",
      "product_tenant_forbidden"
    ],
    "404": [
      "skill_not_found"
    ],
    "429": [
      "session_rate_limited"
    ],
    "502": [
      "skill_response_invalid"
    ],
    "503": [
      "product_tenant_not_configured",
      "iam_admission_unavailable",
      "skill_dependency_unavailable"
    ]
  }
}

async function publicCommand<T extends ZodTypeAny>(path: string, method: "GET" | "POST", status: 200 | 201, operation: SkillOperation, schema: T, body?: object, key?: string, signal?: AbortSignal): Promise<z.infer<T>> {
  const managed = operation === "managedList" || operation === "managedDetail" || operation === "createVersion" || operation === "withdraw"
  const lifecycle = operation === "createVersion" || operation === "withdraw"
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), 10_000)
  const joined = signal === undefined ? deadline.signal : AbortSignal.any([signal, deadline.signal])
  let response: Response | undefined
  const bounded = <T,>(work: Promise<T>): Promise<T> => {
    if (!lifecycle) return work
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(joined.reason)
      joined.addEventListener("abort", abort, { once: true })
      void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
      if (joined.aborted) abort()
    })
  }
  try {
    joined.throwIfAborted()
    const headers: Record<string, string> = {}
    if (body !== undefined) headers["content-type"] = "application/json"
    if (key !== undefined) headers["idempotency-key"] = key
    try {
      response = await bounded(fetch(`/api/hub${path}`, {
        method, cache: "no-store", redirect: "error", headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: joined,
      }).then(value => { if (lifecycle && joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    } catch {
      throw new HubClientError(signal?.aborted ? "aborted" : "network", "Skill request did not complete", null, null)
    }
    if (response === undefined) throw new HubClientError("network", "Missing Skill response", null, null)
    if (lifecycle) {
      const retryAfter = response.headers.get("retry-after")
      if (retryAfter !== null && (response.status !== 429 || !/^(?:[1-9][0-9]{0,3}|[1-7][0-9]{4}|8[0-5][0-9]{3}|86[0-3][0-9]{2}|86400)$/u.test(retryAfter))) throw new HubClientError("parse", "Invalid lifecycle retry delay", null, response.status)
    }
    if (!responseHeaders(response)) throw new HubClientError("parse", "invalid Skill response headers", null, response.status)
    let raw: unknown
    const declared = response.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)) throw new HubClientError("parse", "Skill response is too large", null, response.status)
    if (response.body === null) throw new HubClientError("parse", "Skill response body missing", null, response.status)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        joined.throwIfAborted()
        const part = await bounded(reader.read())
        joined.throwIfAborted()
        if (part.done) break
        size += part.value.byteLength
        if (size > 1_048_576) throw new HubClientError("parse", "Skill response is too large", null, response.status)
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw new HubClientError("parse", "invalid Skill JSON", null, response.status) }
    if (response.status !== status) {
      const parsed = (managed ? managedErrorSchema : errorSchema).safeParse(raw)
      if (!parsed.success || !operationErrorPairs[operation][response.status]?.includes(parsed.data.error.code)) {
        throw new HubClientError("parse", "invalid Skill error code/status pair or envelope", null, response.status)
      }
      if (managed && "meta" in parsed.data && z.object({ request_id: z.string() }).parse(parsed.data.meta).request_id !== response.headers.get("x-request-id")) throw new HubClientError("parse", "managed Skill request ID mismatch", null, response.status)
      throw new HubClientError("http", parsed.data.error.message, parsed.data.error.code, response.status)
    }
    const parsed = (managed ? z.object({ data: schema, meta: z.object({ request_id: z.string().min(1).max(128) }).strict() }).strict() : z.object({ data: schema }).strict()).safeParse(raw)
    if (managed && parsed.success && "meta" in parsed.data && z.object({ request_id: z.string() }).parse(parsed.data.meta).request_id !== response.headers.get("x-request-id")) throw new HubClientError("parse", "managed Skill request ID mismatch", null, response.status)
    if (!parsed.success) throw new HubClientError("parse", parsed.error.message, null, response.status)
    joined.throwIfAborted()
    return parsed.data.data as z.infer<T>
  } catch (error) {
    if (error instanceof HubClientError) throw error
    throw new HubClientError(signal?.aborted ? "aborted" : joined.aborted ? "network" : "parse", "Skill response did not complete", null, response?.status ?? null)
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined) }
}

function path(id: string, suffix = ""): string { return `${skillCommandPath(id)}${suffix}` }

export type SkillPublishClient = {
  createVersion: (id: string, body: z.infer<typeof createPersonalSkillVersionRequestSchema>, key: string, signal?: AbortSignal) => Promise<z.infer<typeof createPersonalSkillVersionSchema>>
  withdraw: (id: string, body: z.infer<typeof withdrawPersonalSkillRequestSchema>, key: string, signal?: AbortSignal) => Promise<z.infer<typeof withdrawPersonalSkillSchema>>
  createDraft: (body: CreateSkillDraftRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof skillDraftSchema>>
  getUpload: (id: string, signal?: AbortSignal) => Promise<z.infer<typeof skillUploadStateSchema>>
  beginUpload: (id: string, body: BeginSkillUploadRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof beginSkillUploadSchema>>
  putPackage: (reference: TransferReference, file: File, signal?: AbortSignal) => Promise<{ source_version_id: string }>
  completeUpload: (id: string, body: CompleteSkillUploadRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof completeSkillUploadSchema>>
  validateDraft: (id: string, body: ValidateSkillDraftRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof validateSkillDraftSchema>>
  publishDraft: (id: string, body: SkillPublishRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof publishSkillDraftSchema>>
  getPublished: (id: string, signal?: AbortSignal) => Promise<ManagedPersonalSkill>
  listPublished: (cursor?: string, signal?: AbortSignal) => Promise<z.infer<typeof managedPersonalSkillPageSchema>>
  listDrafts: (cursor?: string, signal?: AbortSignal) => Promise<z.infer<typeof managedPersonalSkillPageSchema>>
  getManaged: (id: string, signal?: AbortSignal) => Promise<ManagedPersonalSkill>
}

export function createSkillPublishClient(pageUrl = globalThis.location?.href ?? "https://localhost/"): SkillPublishClient {
  return {
    createVersion: async (id, body, key, signal) => {
      const base = managedPersonalSkillPath(id).replace("/managed/", "/")
      const ack = await publicCommand(`${base}/versions`, "POST", 201, "createVersion", createPersonalSkillVersionSchema, createPersonalSkillVersionRequestSchema.parse(body), key, signal)
      if (ack.skill_id === id) throw new HubClientError("parse", "Version ACK reused the base revision", null, 201)
      return ack
    },
    withdraw: async (id, body, key, signal) => {
      const input = withdrawPersonalSkillRequestSchema.parse(body)
      const base = managedPersonalSkillPath(id).replace("/managed/", "/")
      const ack = await publicCommand(`${base}/withdraw`, "POST", 200, "withdraw", withdrawPersonalSkillSchema, input, key, signal)
      if (ack.source_ref !== `skill:${id}` || BigInt(ack.state_version) <= BigInt(input.expected_state_version)) throw new HubClientError("parse", "Withdrawal ACK resource or CAS mismatch", null, 200)
      return ack
    },
    createDraft: (body, key, signal) => publicCommand("/self/skills/drafts", "POST", 201, "createDraft", skillDraftSchema, createSkillDraftRequestSchema.parse(body), key, signal),
    getUpload: (id, signal) => publicCommand(path(id, "/package-upload"), "GET", 200, "getUpload", skillUploadStateSchema, undefined, undefined, signal),
    beginUpload: (id, body, key, signal) => publicCommand(path(id, "/package-upload"), "POST", 201, "beginUpload", beginSkillUploadSchema, beginSkillUploadRequestSchema.parse(body), key, signal),
    putPackage: async (reference, file, signal) => {
      const ack = await putSkillPackage(transferReferenceSchema.parse(reference), file, pageUrl, 60_000, signal)
      if (!skillSourceVersionSchema.safeParse(ack.source_version_id).success) throw new HubClientError("parse", "package transfer version ACK missing or invalid", null, 200)
      return ack
    },
    completeUpload: (id, body, key, signal) => publicCommand(path(id, "/package-upload/complete"), "POST", 200, "completeUpload", completeSkillUploadSchema, completeSkillUploadRequestSchema.parse(body), key, signal),
    validateDraft: (id, body, key, signal) => publicCommand(path(id, "/validate"), "POST", 200, "validateDraft", validateSkillDraftSchema, validateSkillDraftRequestSchema.parse(body), key, signal),
    publishDraft: (id, body, key, signal) => publicCommand(path(id, "/publish"), "POST", 200, "publishDraft", publishSkillDraftSchema, skillPublishRequestSchema.parse(body), key, signal),
    getPublished: (id, signal) => publicCommand(managedPersonalSkillPath(id), "GET", 200, "managedDetail", managedPersonalSkillSchema, undefined, undefined, signal),
    getManaged: (id, signal) => publicCommand(managedPersonalSkillPath(id), "GET", 200, "managedDetail", managedPersonalSkillSchema, undefined, undefined, signal),
    listPublished: (cursor, signal) => publicCommand(`/self/skills/managed?status=active&limit=50${cursor === undefined ? "" : `&cursor=${encodeURIComponent(z.string().min(1).max(2048).parse(cursor))}`}`, "GET", 200, "managedList", managedPersonalSkillPageSchema, undefined, undefined, signal),
    listDrafts: (cursor, signal) => publicCommand(`/self/skills/managed?status=draft&limit=50${cursor === undefined ? "" : `&cursor=${encodeURIComponent(z.string().min(1).max(2048).parse(cursor))}`}`, "GET", 200, "managedList", managedPersonalSkillPageSchema, undefined, undefined, signal),
  }
}
