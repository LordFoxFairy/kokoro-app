import { HubClientError } from "@/hub/client"
import { createSkillDraftRequestSchema, type CreateSkillDraftRequest } from "@/hub/schemas"
import type { SkillPublishClient } from "@/hub/skill-publish-client"

export type PublishStage = "hashing" | "draft" | "upload" | "scanning" | "validating" | "publishing" | "checking"
export type PublishInput = CreateSkillDraftRequest & { file: File }
export type PublishReceipt = { source_ref: string; revision: string }

export class SkillPublishUncertain extends Error {
  readonly skillId: string
  constructor(skillId: string) { super("Skill publish receipt is unknown"); this.name = "SkillPublishUncertain"; this.skillId = skillId }
}

function key(): string { return `skill-web:${crypto.randomUUID()}` }
function assertCurrent(signal?: AbortSignal): void {
  if (signal?.aborted) throw new HubClientError("aborted", "Skill publish cancelled", null, null)
}
function assertSame(value: boolean): void {
  if (!value) throw new HubClientError("parse", "Skill command identity or phase mismatch", null, null)
}
async function retryLostTransport<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await operation() } catch (error) {
    if (!(error instanceof HubClientError) || error.reason !== "network") throw error
    assertCurrent(signal)
    // Replay the identical command closure, body and idempotency key once.
    return operation()
  }
}
async function defaultHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function publishPersonalSkill(
  client: SkillPublishClient,
  input: PublishInput,
  options: { signal?: AbortSignal; onStage?: (stage: PublishStage) => void; hash?: (file: File) => Promise<string> } = {},
): Promise<PublishReceipt> {
  createSkillDraftRequestSchema.parse({ display_name: input.display_name, summary: input.summary, tags: input.tags })
  if (!/\.zip$/iu.test(input.file.name) || input.file.size < 1 || input.file.size > 33554432 || !["", "application/zip", "application/x-zip-compressed"].includes(input.file.type)) {
    throw new HubClientError("parse", "Select one ZIP package up to 32 MiB", null, null)
  }
  const { signal, onStage } = options
  assertCurrent(signal)
  onStage?.("hashing")
  const contentSha256 = await (options.hash ?? defaultHash)(input.file)
  assertSame(/^[a-f0-9]{64}$/u.test(contentSha256))
  assertCurrent(signal)
  onStage?.("draft")
  const draftKey = key()
  const draftBody = { display_name: input.display_name, summary: input.summary, tags: input.tags }
  const draft = await retryLostTransport(() => client.createDraft(draftBody, draftKey, signal), signal)
  assertCurrent(signal)
  const state = await client.getUpload(draft.skill_id, signal)
  assertSame(state.skill_id === draft.skill_id && state.phase === "none" && state.attempt_epoch === "0")
  onStage?.("upload")
  const beginKey = key()
  const beginBody = {
    filename: input.file.name, mime_type: "application/zip", size_bytes: input.file.size, content_sha256: contentSha256,
  } as const
  const begin = await retryLostTransport(() => client.beginUpload(draft.skill_id, beginBody, beginKey, signal), signal)
  assertSame(begin.skill_id === draft.skill_id)
  assertCurrent(signal)
  await client.putPackage(begin.transfer_reference, input.file, signal)
  assertCurrent(signal)
  onStage?.("scanning")
  const completeKey = key()
  const completeBody = {
    attempt_id: begin.attempt_id, upload_id: begin.upload_id, content_sha256: contentSha256, size_bytes: input.file.size,
  }
  const complete = await retryLostTransport(() => client.completeUpload(draft.skill_id, completeBody, completeKey, signal), signal)
  assertSame(complete.skill_id === draft.skill_id && complete.attempt_id === begin.attempt_id
    && complete.upload_id === begin.upload_id && complete.attempt_epoch === begin.attempt_epoch
    && complete.phase === "uploaded" && complete.content_sha256 === contentSha256)
  assertCurrent(signal)
  onStage?.("validating")
  const validateKey = key()
  const validated = await retryLostTransport(() => client.validateDraft(draft.skill_id, begin.attempt_id, validateKey, signal), signal)
  assertSame(validated.skill_id === draft.skill_id && validated.series_id === draft.series_id && validated.valid)
  assertCurrent(signal)
  onStage?.("publishing")
  const publishKey = key()
  try {
    const published = await retryLostTransport(() => client.publishDraft(draft.skill_id, publishKey, signal), signal)
    assertCurrent(signal)
    assertSame(published.status === "active" && published.source_ref === `skill:${draft.skill_id}`)
    return { source_ref: published.source_ref, revision: published.revision }
  } catch (error) {
    assertCurrent(signal)
    // A lost/invalid ACK is never inferred from CLEAN or validation. The only
    // recovery is the owner-authoritative personal ACTIVE by-ID projection.
    if (error instanceof HubClientError && !["network", "parse"].includes(error.reason)) throw error
    onStage?.("checking")
    try {
      const published = await client.getPublished(draft.skill_id)
      assertCurrent(signal)
      assertSame(published.skill_id === draft.skill_id && published.source_ref === `skill:${draft.skill_id}` && published.status === "active")
      return { source_ref: published.source_ref, revision: published.revision }
    } catch {
      throw new SkillPublishUncertain(draft.skill_id)
    }
  }
}
