import { z, type ZodTypeAny } from "zod"

import { HubClientError, createHubClient } from "./client"
import {
  beginSkillUploadRequestSchema, beginSkillUploadSchema, completeSkillUploadRequestSchema,
  completeSkillUploadSchema, createSkillDraftRequestSchema, skillDraftSchema,
  skillUploadStateSchema, validateSkillDraftSchema, publishSkillDraftSchema,
  publishedPersonalSkillPath, type BeginSkillUploadRequest, type CompleteSkillUploadRequest,
  type CreateSkillDraftRequest, type TransferReference, type PublishedPersonalSkill,
} from "./schemas"

const responseHeaders = (response: Response): boolean =>
  response.headers.get("cache-control") === "no-store"
  && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(response.headers.get("x-request-id") ?? "")
  && /^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "")

const skillErrorCodes = z.enum([
  "invalid_skill_request", "idempotency_key_required", "invalid_idempotency_key", "request_body_too_large",
  "service_auth_failed", "session_authentication_required", "session_invalid", "session_forbidden",
  "session_rate_limited", "product_tenant_not_configured", "product_tenant_forbidden", "skill_not_found",
  "skill_idempotency_conflict", "skill_command_in_progress", "skill_precondition_failed", "skill_rate_limited",
  "iam_admission_unavailable", "skill_dependency_unavailable", "skill_response_invalid",
])
const errorSchema = z.object({ error: z.object({ code: skillErrorCodes, message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()

type CommandErrorFamily = "draft" | "uploadGet" | "mutation"
const allowedErrorStatuses: Record<CommandErrorFamily, ReadonlySet<number>> = {
  draft: new Set([400, 401, 403, 409, 412, 413, 429, 502, 503]),
  uploadGet: new Set([400, 401, 403, 404, 412, 429, 502, 503]),
  mutation: new Set([400, 401, 403, 404, 409, 412, 413, 429, 502, 503]),
}

async function publicCommand<T extends ZodTypeAny>(path: string, method: "GET" | "POST", status: 200 | 201, family: CommandErrorFamily, schema: T, body?: object, key?: string, signal?: AbortSignal): Promise<z.infer<T>> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["content-type"] = "application/json"
  if (key !== undefined) headers["idempotency-key"] = key
  let response: Response
  try {
    response = await fetch(`/api/hub${path}`, {
      method, cache: "no-store", redirect: "error", headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal === undefined ? {} : { signal }),
    })
  } catch {
    throw new HubClientError(signal?.aborted ? "aborted" : "network", "Skill request did not complete", null, null)
  }
  if (!responseHeaders(response)) throw new HubClientError("parse", "invalid Skill response headers", null, response.status)
  let raw: unknown
  try { raw = await response.json() } catch { throw new HubClientError("parse", "invalid Skill JSON", null, response.status) }
  if (response.status !== status) {
    if (!allowedErrorStatuses[family].has(response.status)) throw new HubClientError("parse", "unexpected Skill response status", null, response.status)
    const parsed = errorSchema.safeParse(raw)
    if (!parsed.success || family === "draft" && parsed.data.error.code === "skill_not_found"
      || family === "uploadGet" && ["idempotency_key_required", "invalid_idempotency_key", "request_body_too_large", "skill_idempotency_conflict", "skill_command_in_progress"].includes(parsed.data.error.code)) {
      throw new HubClientError("parse", "invalid Skill error envelope", null, response.status)
    }
    throw new HubClientError("http", parsed.data.error.message, parsed.data.error.code, response.status)
  }
  const parsed = z.object({ data: schema }).strict().safeParse(raw)
  if (!parsed.success) throw new HubClientError("parse", parsed.error.message, null, response.status)
  return parsed.data.data as z.infer<T>
}

function path(id: string, suffix = ""): string { return `${publishedPersonalSkillPath(id)}${suffix}` }

function approvedTransferUrl(reference: TransferReference, pageUrl: string): URL {
  let url: URL
  let page: URL
  try { url = new URL(reference.url); page = new URL(pageUrl) } catch { throw new HubClientError("parse", "invalid transfer reference", null, null) }
  const loopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]"
  const localHttp = page.protocol === "http:" && loopback(page.hostname) && url.protocol === "http:" && loopback(url.hostname)
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.hash || Number.isNaN(Date.parse(reference.expires_at))) {
    throw new HubClientError("parse", "unsafe transfer reference", null, null)
  }
  if (Date.parse(reference.expires_at) <= Date.now()) throw new HubClientError("parse", "expired transfer reference", null, null)
  return url
}

export type SkillPublishClient = {
  createDraft: (body: CreateSkillDraftRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof skillDraftSchema>>
  getUpload: (id: string, signal?: AbortSignal) => Promise<z.infer<typeof skillUploadStateSchema>>
  beginUpload: (id: string, body: BeginSkillUploadRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof beginSkillUploadSchema>>
  putPackage: (reference: TransferReference, file: File, signal?: AbortSignal) => Promise<void>
  completeUpload: (id: string, body: CompleteSkillUploadRequest, key: string, signal?: AbortSignal) => Promise<z.infer<typeof completeSkillUploadSchema>>
  validateDraft: (id: string, attemptId: string, key: string, signal?: AbortSignal) => Promise<z.infer<typeof validateSkillDraftSchema>>
  publishDraft: (id: string, key: string, signal?: AbortSignal) => Promise<z.infer<typeof publishSkillDraftSchema>>
  getPublished: (id: string, signal?: AbortSignal) => Promise<PublishedPersonalSkill>
}

export function createSkillPublishClient(pageUrl = globalThis.location?.href ?? "https://localhost/"): SkillPublishClient {
  return {
    createDraft: (body, key, signal) => publicCommand("/self/skills/drafts", "POST", 201, "draft", skillDraftSchema, createSkillDraftRequestSchema.parse(body), key, signal),
    getUpload: (id, signal) => publicCommand(path(id, "/package-upload"), "GET", 200, "uploadGet", skillUploadStateSchema, undefined, undefined, signal),
    beginUpload: (id, body, key, signal) => publicCommand(path(id, "/package-upload"), "POST", 201, "mutation", beginSkillUploadSchema, beginSkillUploadRequestSchema.parse(body), key, signal),
    putPackage: async (reference, file, signal) => {
      const url = approvedTransferUrl(reference, pageUrl)
      let response: Response
      try {
        response = await fetch(url.href, {
          method: "PUT", body: file, headers: { "content-type": "application/zip" },
          credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", mode: "cors", ...(signal === undefined ? {} : { signal }),
        })
      } catch { throw new HubClientError(signal?.aborted ? "aborted" : "network", "package transfer did not complete", null, null) }
      if (!response.ok) throw new HubClientError("http", "package transfer rejected", null, response.status)
    },
    completeUpload: (id, body, key, signal) => publicCommand(path(id, "/package-upload/complete"), "POST", 200, "mutation", completeSkillUploadSchema, completeSkillUploadRequestSchema.parse(body), key, signal),
    validateDraft: (id, attemptId, key, signal) => publicCommand(path(id, "/validate"), "POST", 200, "mutation", validateSkillDraftSchema, { attempt_id: attemptId }, key, signal),
    publishDraft: (id, key, signal) => publicCommand(path(id, "/publish"), "POST", 200, "mutation", publishSkillDraftSchema, undefined, key, signal),
    getPublished: (id, signal) => createHubClient().getPublishedPersonalSkill(id, signal),
  }
}
