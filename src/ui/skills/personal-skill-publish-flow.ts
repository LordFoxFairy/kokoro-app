import { HubClientError } from "@/hub/client"
import { createSkillDraftRequestSchema, skillZipFilenameSchema } from "@/hub/schemas"
import type { SkillPublishClient } from "@/hub/skill-publish-client"

export type PublishStage = "hashing" | "draft" | "upload" | "scanning" | "validating" | "publishing" | "checking"
export type PublishInput = { file: File; display_name: string; summary: string; tags: string[] }
export type PublishReceipt = { source_ref: string; revision: string }
type Draft = Awaited<ReturnType<SkillPublishClient["createDraft"]>>
type Begin = Awaited<ReturnType<SkillPublishClient["beginUpload"]>>
type Complete = Awaited<ReturnType<SkillPublishClient["completeUpload"]>>
type Validated = Awaited<ReturnType<SkillPublishClient["validateDraft"]>>

export class SkillPublishPending extends Error {
  constructor() { super("Skill scan is still pending"); this.name = "SkillPublishPending" }
}
export class SkillPublishRestartRequired extends Error {
  constructor() { super("Skill upload attempt is no longer current"); this.name = "SkillPublishRestartRequired" }
}
export class SkillPublishUncertain extends Error {
  readonly skillId: string
  constructor(skillId: string) { super("Skill publish receipt is unknown"); this.name = "SkillPublishUncertain"; this.skillId = skillId }
}

export type PersonalSkillPublishSession = {
  readonly input: PublishInput
  readonly keys: { draft: string; begin: string; complete: string; validate: string; publish: string }
  hash?: string
  draft?: Draft
  uploadChecked: boolean
  begin?: Begin
  putAttempted: boolean
  putDone: boolean
  complete?: Complete
  scanPaused: boolean
  validated?: Validated
  publishAttempted: boolean
  receipt?: PublishReceipt
  running: boolean
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
    return operation() // identical command closure, body and idempotency key
  }
}
async function defaultHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
async function recoverPublished(client: SkillPublishClient, id: string, signal?: AbortSignal): Promise<PublishReceipt | null> {
  try {
    const published = await client.getPublished(id, signal)
    assertCurrent(signal)
    assertSame(published.skill_id === id && published.source_ref === `skill:${id}` && published.status === "active")
    return { source_ref: published.source_ref, revision: published.revision }
  } catch (error) {
    if (error instanceof HubClientError && error.reason === "http" && error.status === 404 && error.code === "skill_not_found") return null
    if (error instanceof HubClientError && (error.reason === "aborted" || error.reason === "http" && [401, 403].includes(error.status ?? 0))) throw error
    if (signal?.aborted) assertCurrent(signal)
    throw new SkillPublishUncertain(id)
  }
}

export function createPersonalSkillPublishSession(input: PublishInput): PersonalSkillPublishSession {
  const body = createSkillDraftRequestSchema.parse({ display_name: input.display_name, summary: input.summary, tags: input.tags })
  if (!/\.zip$/iu.test(input.file.name) || input.file.size < 1 || input.file.size > 33554432 || !["", "application/zip", "application/x-zip-compressed"].includes(input.file.type)) {
    throw new HubClientError("parse", "Select one ZIP package up to 32 MiB", "invalid_skill_request", 400)
  }
  if (!skillZipFilenameSchema.safeParse(input.file.name).success) throw new HubClientError("parse", "Invalid ZIP filename", "invalid_skill_request", 400)
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 65_536) throw new HubClientError("parse", "Skill draft metadata exceeds 65,536 bytes", "request_body_too_large", 413)
  return {
    input: { ...body, file: input.file },
    keys: { draft: key(), begin: key(), complete: key(), validate: key(), publish: key() },
    uploadChecked: false, putAttempted: false, putDone: false, scanPaused: false, publishAttempted: false, running: false,
  }
}

export async function runPersonalSkillPublishSession(
  client: SkillPublishClient,
  session: PersonalSkillPublishSession,
  options: { signal?: AbortSignal; onStage?: (stage: PublishStage) => void; hash?: (file: File) => Promise<string> } = {},
): Promise<PublishReceipt> {
  if (session.running) throw new HubClientError("parse", "Skill publish is already running", null, null)
  session.running = true
  const { signal, onStage } = options
  const input = session.input
  try {
    assertCurrent(signal)
    if (session.receipt) return session.receipt
    if (!session.hash) {
      onStage?.("hashing")
      const hash = await (options.hash ?? defaultHash)(input.file)
      assertSame(/^[a-f0-9]{64}$/u.test(hash))
      session.hash = hash
    }
    assertCurrent(signal)
    if (!session.draft) {
      onStage?.("draft")
      const body = { display_name: input.display_name, summary: input.summary, tags: input.tags }
      session.draft = await retryLostTransport(() => client.createDraft(body, session.keys.draft, signal), signal)
    }
    const draft = session.draft
    assertCurrent(signal)
    if (!session.uploadChecked) {
      const state = await client.getUpload(draft.skill_id, signal)
      assertSame(state.skill_id === draft.skill_id && state.phase === "none" && state.attempt_epoch === "0")
      session.uploadChecked = true
    }
    const beginBody = { filename: input.file.name, mime_type: "application/zip" as const, size_bytes: input.file.size, content_sha256: session.hash }
    if (!session.begin) {
      onStage?.("upload")
      session.begin = await retryLostTransport(() => client.beginUpload(draft.skill_id, beginBody, session.keys.begin, signal), signal)
      assertSame(session.begin.skill_id === draft.skill_id)
    }
    if (!session.putDone) {
      onStage?.("upload")
      if (session.putAttempted) {
        // Same-key replay may refresh the short-lived URL without replacing the attempt.
        const refreshed = await client.beginUpload(draft.skill_id, beginBody, session.keys.begin, signal)
        assertSame(refreshed.skill_id === draft.skill_id && refreshed.attempt_id === session.begin.attempt_id
          && refreshed.upload_id === session.begin.upload_id && refreshed.attempt_epoch === session.begin.attempt_epoch)
        session.begin = refreshed
      }
      session.putAttempted = true
      await client.putPackage(session.begin.transfer_reference, input.file, signal)
      assertCurrent(signal)
      session.putDone = true
    }
    const begin = session.begin
    if (!session.complete) {
      onStage?.("scanning")
      const body = { attempt_id: begin.attempt_id, upload_id: begin.upload_id, content_sha256: session.hash, size_bytes: input.file.size }
      session.complete = await retryLostTransport(() => client.completeUpload(draft.skill_id, body, session.keys.complete, signal), signal)
      assertSame(session.complete.skill_id === draft.skill_id && session.complete.attempt_id === begin.attempt_id
        && session.complete.upload_id === begin.upload_id && session.complete.attempt_epoch === begin.attempt_epoch
        && session.complete.phase === "uploaded" && session.complete.content_sha256 === session.hash)
    }
    assertCurrent(signal)
    if (!session.validated) {
      onStage?.("scanning")
      if (session.scanPaused) {
        const state = await client.getUpload(draft.skill_id, signal)
        if (state.skill_id !== draft.skill_id || !["uploaded", "validated"].includes(state.phase)
          || !("attempt_id" in state) || state.attempt_id !== begin.attempt_id
          || !("upload_id" in state) || state.upload_id !== begin.upload_id
          || state.attempt_epoch !== begin.attempt_epoch) throw new SkillPublishRestartRequired()
      }
      if (session.complete.scan_state !== "clean" && !session.scanPaused) {
        session.scanPaused = true
        throw new SkillPublishPending()
      }
      onStage?.("validating")
      try {
        session.validated = await retryLostTransport(() => client.validateDraft(draft.skill_id, begin.attempt_id, session.keys.validate, signal), signal)
      } catch (error) {
        if (error instanceof HubClientError && session.complete.scan_state !== "clean"
          && ((error.status === 412 && error.code === "skill_precondition_failed") || (error.status === 409 && error.code === "skill_command_in_progress"))) {
          throw new SkillPublishPending()
        }
        throw error
      }
      assertSame(session.validated.skill_id === draft.skill_id && session.validated.series_id === draft.series_id && session.validated.valid)
    }
    assertCurrent(signal)
    if (session.publishAttempted) {
      onStage?.("checking")
      const recovered = await recoverPublished(client, draft.skill_id, signal)
      if (recovered !== null) {
        session.receipt = recovered
        return recovered
      }
      // A second explicit check has confirmed that this draft is still not
      // ACTIVE. Replay the original zero-byte Publish with the original key;
      // never create a new Draft or key for this browser intention.
    }
    onStage?.("publishing")
    session.publishAttempted = true
    try {
      const published = await retryLostTransport(() => client.publishDraft(draft.skill_id, session.keys.publish, signal), signal)
      assertCurrent(signal)
      assertSame(published.status === "active" && published.source_ref === `skill:${draft.skill_id}`)
      session.receipt = { source_ref: published.source_ref, revision: published.revision }
      return session.receipt
    } catch (error) {
      assertCurrent(signal)
      if (error instanceof HubClientError && error.reason === "http" && error.status !== null && error.status < 500) {
        session.publishAttempted = false
        throw error
      }
      onStage?.("checking")
      const recovered = await recoverPublished(client, draft.skill_id, signal)
      if (recovered === null) throw new SkillPublishUncertain(draft.skill_id)
      session.receipt = recovered
      return recovered
    }
  } finally {
    session.running = false
  }
}

export function publishPersonalSkill(
  client: SkillPublishClient,
  input: PublishInput,
  options: { signal?: AbortSignal; onStage?: (stage: PublishStage) => void; hash?: (file: File) => Promise<string> } = {},
): Promise<PublishReceipt> {
  return runPersonalSkillPublishSession(client, createPersonalSkillPublishSession(input), options)
}
