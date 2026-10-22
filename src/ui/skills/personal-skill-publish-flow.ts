import { HubClientError } from "@/hub/client"
import { skillPublicationPreconditionSchema, type SkillPublicationPrecondition, createPersonalSkillVersionRequestSchema, createPersonalSkillVersionSchema, createSkillDraftRequestSchema, skillZipFilenameSchema, skillDraftSchema, managedPersonalSkillSchema, skillUploadStateSchema, beginSkillUploadSchema, completeSkillUploadSchema, validateSkillDraftSchema, publishSkillDraftSchema, skillSourceVersionSchema, type ManagedPersonalSkill, type BeginSkillUploadRequest, type CompleteSkillUploadRequest, type ValidateSkillDraftRequest, type SkillPublishRequest } from "@/hub/schemas"
import type { SkillPublishClient } from "@/hub/skill-publish-client"

export type PublishStage = "hashing" | "draft" | "upload" | "scanning" | "validating" | "publishing" | "checking"
export type PublishInput = { file: File; display_name: string; summary: string; tags: string[]; example_prompts?: string[] | undefined; category_keys?: ManagedPersonalSkill["category_keys"] | undefined; audience: SkillPublishRequest["audience"] }
export type PublishReceipt = { source_ref: string; revision: string }
type Draft = { skill_id: string; series_id: string; revision: string; state_version: string }
type Begin = Awaited<ReturnType<SkillPublishClient["beginUpload"]>>
type Complete = Awaited<ReturnType<SkillPublishClient["completeUpload"]>>
type Validated = Awaited<ReturnType<SkillPublishClient["validateDraft"]>>
type Upload = Awaited<ReturnType<SkillPublishClient["getUpload"]>>

export class SkillPublishPending extends Error { constructor() { super("Skill scan is still pending"); this.name = "SkillPublishPending" } }
export class SkillPublishRestartRequired extends Error { constructor() { super("Skill upload attempt is no longer current"); this.name = "SkillPublishRestartRequired" } }
export class SkillPublishUncertain extends Error {
  readonly skillId: string
  constructor(skillId: string) { super("Skill publish receipt is unknown"); this.name = "SkillPublishUncertain"; this.skillId = skillId }
}

export type PersonalSkillPublishSession = {
  readonly input: Readonly<Omit<PublishInput, "file"> & { file: File | null }>
  readonly expectedPublication: Readonly<SkillPublicationPrecondition>
  readonly keys: Readonly<{ draft: string; begin: string; complete: string; validate: string; publish: string }>
  readonly versionBase?: ManagedPersonalSkill
  readonly resumed?: ManagedPersonalSkill
  readonly draftBody: Readonly<{ display_name: string; summary: string; tags: string[] }>
  hash?: string
  draft?: Draft
  draftUncertain: boolean
  uploadChecked: boolean
  observed?: Upload
  beginBody?: Readonly<BeginSkillUploadRequest>
  begin?: Begin
  putAttempted: boolean
  putDone: boolean
  sourceVersionId?: string
  completeBody?: Readonly<CompleteSkillUploadRequest>
  complete?: Complete
  scanPaused: boolean
  validateBody?: Readonly<ValidateSkillDraftRequest>
  validated?: Validated
  publishBody?: Readonly<SkillPublishRequest>
  publishAttempted: boolean
  receipt?: PublishReceipt
  running: boolean
}

function key(): string { return `skill-web:${crypto.randomUUID()}` }
function assertCurrent(signal?: AbortSignal): void {
  if (signal?.aborted) throw new HubClientError("aborted", "Skill publish cancelled", null, null)
}
function assertSame(value: boolean): asserts value {
  if (!value) throw new HubClientError("parse", "Skill command identity or phase mismatch", null, null)
}
async function retryLostTransport<T>(operation: () => Promise<T>, signal?: AbortSignal, automatic = true): Promise<T> {
  try { return await operation() } catch (error) {
    if (!automatic || !(error instanceof HubClientError) || error.reason !== "network") throw error
    assertCurrent(signal)
    return operation()
  }
}
async function defaultHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
function checkFile(file: File): void {
  if (!/\.zip$/iu.test(file.name) || file.size < 1 || file.size > 33554432 || !["", "application/zip", "application/x-zip-compressed"].includes(file.type) || !skillZipFilenameSchema.safeParse(file.name).success) {
    throw new HubClientError("parse", "Select one owner-valid ZIP package up to 32 MiB", "invalid_skill_request", 400)
  }
}
function newSession(input: PersonalSkillPublishSession["input"], expectedPublication: SkillPublicationPrecondition, resumed?: ManagedPersonalSkill): PersonalSkillPublishSession {
  const parsed = createSkillDraftRequestSchema.parse({ display_name: input.display_name, summary: input.summary, tags: input.tags })
  if (!['owner', 'tenant', 'catalog'].includes(input.audience)) throw new HubClientError("parse", "Explicit publication audience required", "invalid_skill_request", 400)
  if (input.file) checkFile(input.file)
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 65_536) throw new HubClientError("parse", "Skill draft metadata exceeds 65,536 bytes", "request_body_too_large", 413)
  const publication = skillPublicationPreconditionSchema.parse(expectedPublication)
  const tags = Object.freeze([...parsed.tags]) as unknown as string[]
  return {
    input: Object.freeze({ ...parsed, tags, file: input.file, audience: input.audience }),
    expectedPublication: publication === null ? null : Object.freeze(publication),
    draftBody: Object.freeze({ ...parsed, tags }),
    keys: Object.freeze({ draft: key(), begin: key(), complete: key(), validate: key(), publish: key() }),
    ...(resumed ? { resumed: managedPersonalSkillSchema.parse(resumed), draft: { skill_id: resumed.skill_id, series_id: resumed.series_id, revision: resumed.revision, state_version: resumed.product.state_version } } : {}),
    draftUncertain: false, uploadChecked: false, putAttempted: false, putDone: false, scanPaused: false, publishAttempted: false, running: false,
  }
}
export function createPersonalSkillPublishSession(input: PublishInput): PersonalSkillPublishSession { return newSession(input, null) }
export function createResumedSkillPublishSession(base: ManagedPersonalSkill, audience: SkillPublishRequest["audience"], expectedPublication: SkillPublicationPrecondition, replacement?: File): PersonalSkillPublishSession {
  const current = managedPersonalSkillSchema.parse(base)
  assertSame(current.status === "draft")
  return newSession({ file: replacement ?? null, display_name: current.name, summary: current.summary, tags: current.tags, audience }, expectedPublication, current)
}
function newPersonalVersionSession(current: ManagedPersonalSkill, input: PublishInput, expectedPublication: SkillPublicationPrecondition): PersonalSkillPublishSession {
  assertSame(expectedPublication !== null && current.product.source_kind === "personal" && input.audience === "owner")
  if (!input.file) throw new SkillPublishRestartRequired()
  const metadata = createPersonalSkillVersionRequestSchema.parse({ display_name: input.display_name, summary: input.summary, tags: input.tags, example_prompts: input.example_prompts ?? current.example_prompts, category_keys: input.category_keys ?? current.category_keys })
  const session = newSession({ ...input, audience: "owner" }, expectedPublication)
  return { ...session, versionBase: current, draftBody: Object.freeze({ ...metadata, tags: Object.freeze([...metadata.tags]) as unknown as string[], example_prompts: Object.freeze([...metadata.example_prompts]), category_keys: Object.freeze([...metadata.category_keys]) }) }
}
export function createPersonalSkillVersionSession(base: ManagedPersonalSkill, input: PublishInput, expectedPublication: SkillPublicationPrecondition): PersonalSkillPublishSession {
  const current = managedPersonalSkillSchema.parse(base)
  assertSame(["active", "disabled"].includes(current.status))
  return newPersonalVersionSession(current, input, expectedPublication)
}
export function createPersonalSkillRestoreSession(base: ManagedPersonalSkill, file: File, expectedPublication: SkillPublicationPrecondition): PersonalSkillPublishSession {
  const current = managedPersonalSkillSchema.parse(base)
  assertSame(["active", "disabled", "withdrawn"].includes(current.status))
  return newPersonalVersionSession(current, {file, display_name: current.name, summary: current.summary, tags: current.tags, example_prompts: current.example_prompts, category_keys: current.category_keys, audience: "owner"}, expectedPublication)
}
async function recoverPublished(client: SkillPublishClient, draft: Draft, body: Readonly<SkillPublishRequest>, signal?: AbortSignal): Promise<PublishReceipt | null> {
  try {
    const published = managedPersonalSkillSchema.parse(await client.getPublished(draft.skill_id, signal))
    assertCurrent(signal)
    assertSame(published.skill_id === draft.skill_id && published.source_ref === `skill:${draft.skill_id}` && published.series_id === draft.series_id && published.revision === draft.revision)
    if (published.status === "draft") return null
    assertSame(published.status === "active" && published.product.publication_audience === body.audience && BigInt(published.product.state_version) > BigInt(body.expected_state_version))
    return { source_ref: published.source_ref, revision: published.revision }
  } catch (error) {
    if (error instanceof HubClientError && error.reason === "http" && error.status === 404 && error.code === "skill_not_found") return null
    if (error instanceof HubClientError && (error.reason === "aborted" || error.reason === "http" && [401, 403].includes(error.status ?? 0))) throw error
    assertCurrent(signal)
    throw new SkillPublishUncertain(draft.skill_id)
  }
}
function sameAttempt(state: { skill_id: string; attempt_epoch: string; attempt_id?: string | undefined; upload_id?: string | undefined }, original: { skill_id: string; attempt_epoch: string; attempt_id?: string | undefined; upload_id?: string | undefined }): boolean {
  return state.skill_id === original.skill_id && state.attempt_id !== undefined && state.attempt_id === original.attempt_id && state.attempt_epoch === original.attempt_epoch && (original.upload_id === undefined || state.upload_id === original.upload_id)
}

export async function runPersonalSkillPublishSession(client: SkillPublishClient, session: PersonalSkillPublishSession, options: { signal?: AbortSignal; onStage?: (stage: PublishStage) => void; hash?: (file: File) => Promise<string> } = {}): Promise<PublishReceipt> {
  if (session.running) throw new HubClientError("parse", "Skill publish is already running", null, null)
  session.running = true
  const { signal, onStage } = options
  const input = session.input
  try {
    assertCurrent(signal)
    if (session.receipt) return session.receipt
    if (input.file && !session.hash) {
      onStage?.("hashing")
      const hash = await (options.hash ?? defaultHash)(input.file)
      assertCurrent(signal); assertSame(/^[a-f0-9]{64}$/u.test(hash)); session.hash = hash
    }
    if (!session.draft) {
      onStage?.("draft")
      const created = await retryLostTransport(async () => {
        const previouslyUncertain = session.draftUncertain
        session.draftUncertain = true
        try {
          const created = session.versionBase
            ? createPersonalSkillVersionSchema.parse(await client.createVersion(session.versionBase.skill_id, createPersonalSkillVersionRequestSchema.parse(session.draftBody), session.keys.draft, signal))
            : skillDraftSchema.parse(await client.createDraft(session.draftBody, session.keys.draft, signal))
          if (session.versionBase) assertSame(created.series_id === session.versionBase.series_id && created.skill_id !== session.versionBase.skill_id && BigInt(created.revision) > BigInt(session.versionBase.revision))
          assertCurrent(signal)
          return { ...created, revision: String(created.revision) }
        } catch (error) {
          // A later rejection cannot retire an earlier creation with a lost ACK.
          const rejected = error instanceof HubClientError && error.reason === "http" && [400, 401, 403, 404, 409, 412, 413].includes(error.status ?? 0) && error.code !== "skill_command_in_progress"
          session.draftUncertain = previouslyUncertain || !rejected
          throw error
        }
      }, signal, session.versionBase === undefined)
      assertCurrent(signal)
      session.draft = created
      session.draftUncertain = false
    }
    const draft = session.draft
    if (session.publishAttempted) {
      assertSame(session.publishBody !== undefined)
      onStage?.("checking")
      const recovered = await recoverPublished(client, draft, session.publishBody, signal)
      if (recovered) { session.receipt = recovered; return recovered }
    }
    if (!session.uploadChecked) {
      if (session.resumed) {
        const current = managedPersonalSkillSchema.parse(await client.getManaged(draft.skill_id, signal))
        assertCurrent(signal)
        assertSame(current.skill_id === draft.skill_id && current.series_id === draft.series_id && current.revision === draft.revision && current.status === "draft" && current.product.state_version === draft.state_version)
      }
      const state = skillUploadStateSchema.parse(await client.getUpload(draft.skill_id, signal))
      assertCurrent(signal)
      assertSame(state.skill_id === draft.skill_id && state.state_version === draft.state_version)
      if (!session.resumed) assertSame(state.phase === "none" && state.attempt_epoch === "0")
      if (session.resumed && !input.file && !['uploaded', 'validated'].includes(state.phase)) throw new SkillPublishRestartRequired()
      session.observed = state
      session.uploadChecked = true
    }
    const observed = session.observed!
    if (input.file) {
      if (!session.hash) {
        onStage?.("hashing")
        const hash = await (options.hash ?? defaultHash)(input.file)
        assertCurrent(signal); assertSame(/^[a-f0-9]{64}$/u.test(hash)); session.hash = hash
      }
      if (!session.beginBody) session.beginBody = Object.freeze({ filename: input.file.name, mime_type: "application/zip", size_bytes: input.file.size, content_sha256: session.hash, expected_state_version: observed.state_version, ...('attempt_id' in observed ? { replaces_attempt_id: observed.attempt_id } : {}) })
      if (!session.begin) {
        onStage?.("upload")
        const begun = beginSkillUploadSchema.parse(await retryLostTransport(() => client.beginUpload(draft.skill_id, session.beginBody!, session.keys.begin, signal), signal, session.versionBase === undefined))
        assertCurrent(signal); assertSame(begun.skill_id === draft.skill_id)
        if ('attempt_id' in observed) assertSame(begun.attempt_id !== observed.attempt_id && BigInt(begun.attempt_epoch) > BigInt(observed.attempt_epoch))
        assertSame(BigInt(begun.state_version) >= BigInt(session.beginBody.expected_state_version))
        session.begin = begun
      }
      if (!session.putDone) {
        onStage?.("upload")
        if (session.putAttempted) {
          const refreshed = beginSkillUploadSchema.parse(await client.beginUpload(draft.skill_id, session.beginBody, session.keys.begin, signal))
          assertCurrent(signal); assertSame(sameAttempt(refreshed, session.begin) && refreshed.upload_id === session.begin.upload_id && refreshed.state_version === session.begin.state_version)
          session.begin = refreshed
        }
        session.putAttempted = true
        const transfer = await client.putPackage(session.begin.transfer_reference, input.file, signal)
        assertCurrent(signal)
        session.sourceVersionId = skillSourceVersionSchema.parse(transfer.source_version_id)
        session.putDone = true
      }
      const begin = session.begin
      if (!session.completeBody) session.completeBody = Object.freeze({ attempt_id: begin.attempt_id, upload_id: begin.upload_id, content_sha256: session.hash, size_bytes: input.file.size, source_version_id: session.sourceVersionId!, expected_state_version: begin.state_version })
      if (!session.complete) {
        onStage?.("scanning")
        const completed = completeSkillUploadSchema.parse(await retryLostTransport(() => client.completeUpload(draft.skill_id, session.completeBody!, session.keys.complete, signal), signal, session.versionBase === undefined))
        assertCurrent(signal); assertSame(sameAttempt(completed, begin) && completed.upload_id === begin.upload_id && completed.content_sha256 === session.hash && BigInt(completed.state_version) >= BigInt(begin.state_version))
        session.complete = completed
      }
    }
    if (!session.validated && !(session.resumed && !input.file && observed.phase === "validated")) {
      const source = session.complete ?? observed
      assertSame('attempt_id' in source)
      if (session.scanPaused || session.validateBody !== undefined) {
        const state = skillUploadStateSchema.parse(await client.getUpload(draft.skill_id, signal))
        assertCurrent(signal)
        if (!sameAttempt(state, source) || !['uploaded', 'validated'].includes(state.phase)) throw new SkillPublishRestartRequired()
      }
      if (session.complete && session.complete.scan_state !== "clean" && !session.scanPaused) { session.scanPaused = true; throw new SkillPublishPending() }
      if (!session.validateBody) session.validateBody = Object.freeze({ attempt_id: source.attempt_id, expected_state_version: source.state_version })
      onStage?.("validating")
      let validated: Validated
      try { validated = validateSkillDraftSchema.parse(await retryLostTransport(() => client.validateDraft(draft.skill_id, session.validateBody!, session.keys.validate, signal), signal, session.versionBase === undefined)) }
      catch (error) {
        if (error instanceof HubClientError && session.complete && session.complete.scan_state !== "clean" && ((error.status === 412 && error.code === "skill_precondition_failed") || (error.status === 409 && error.code === "skill_command_in_progress"))) throw new SkillPublishPending()
        throw error
      }
      assertCurrent(signal); assertSame(validated.skill_id === draft.skill_id && validated.series_id === draft.series_id && BigInt(validated.state_version) >= BigInt(session.validateBody.expected_state_version))
      session.validated = validated
    }
    if (!session.publishBody) session.publishBody = Object.freeze({ audience: input.audience, expected_publication: session.expectedPublication, expected_state_version: session.validated?.state_version ?? observed.state_version })
    onStage?.("publishing"); session.publishAttempted = true
    try {
      const published = publishSkillDraftSchema.parse(await retryLostTransport(() => client.publishDraft(draft.skill_id, session.publishBody!, session.keys.publish, signal), signal, session.versionBase === undefined))
      assertCurrent(signal); assertSame(published.source_ref === `skill:${draft.skill_id}` && published.revision === draft.revision && BigInt(published.state_version) > BigInt(session.publishBody.expected_state_version))
      session.receipt = { source_ref: published.source_ref, revision: published.revision }; return session.receipt
    } catch (error) {
      assertCurrent(signal)
      if (error instanceof HubClientError && error.reason === "http" && error.status !== null && error.status < 500) { session.publishAttempted = false; throw error }
      onStage?.("checking")
      const recovered = await recoverPublished(client, draft, session.publishBody, signal)
      if (!recovered) throw new SkillPublishUncertain(draft.skill_id)
      session.receipt = recovered; return recovered
    }
  } finally { session.running = false }
}
export function publishPersonalSkill(client: SkillPublishClient, input: PublishInput, options: { signal?: AbortSignal; onStage?: (stage: PublishStage) => void; hash?: (file: File) => Promise<string> } = {}): Promise<PublishReceipt> {
  return runPersonalSkillPublishSession(client, createPersonalSkillPublishSession(input), options)
}
