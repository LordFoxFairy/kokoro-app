import type { z } from "zod"
import { HubClientError } from "@/hub/client"
import { createSkillLocalImportClient } from "@/hub/skill-local-import-client"
import { localImportBeginRequestSchema, localImportIdSchema, type localImportBeginSchema, type localImportCompleteSchema, type localImportGetSchema, type localImportFinalizeSchema } from "@/hub/skill-local-import.schema"

type Client = ReturnType<typeof createSkillLocalImportClient>
type Stage = "hashing" | "begin" | "put" | "complete" | "finalize" | "get"
type Begin = z.infer<typeof localImportBeginSchema>
type Complete = z.infer<typeof localImportCompleteSchema>
type Current = z.infer<typeof localImportGetSchema>
type Finalized = z.infer<typeof localImportFinalizeSchema>
export type ImportState = Readonly<{ kind: "idle" | "running" | "unknown" | "rejected" | "recoverable" | "reselect" | "expired" | "completed"; stage?: Stage; intentId?: string; code?: string; skill?: Finalized["skill"]; installed?: boolean }>
export const LOCAL_IMPORT_LOCATOR_KEY = "kokoro.skills.local-import.v1"

/** Browser intent state only: the locator never contains commands, proofs or credentials. */
export function createPersonalSkillImportFlow(options: { client: Client; subject: string; storage?: Storage; key?: () => string; hash?: (file: File, signal: AbortSignal) => Promise<string> }) {
  const { client, subject, storage } = options
  let state: ImportState = { kind: "idle" }
  let file: File | undefined
  let beginBody: z.infer<typeof localImportBeginRequestSchema> | undefined
  let beginKey: string | undefined
  let begin: Begin | undefined
  let complete: Complete | undefined
  let completeBody: Parameters<Client["complete"]>[1] | undefined
  let completeKey: string | undefined
  let finalizeKey: string | undefined
  let intentId: string | undefined
  let expiresAt: string | undefined
  let restored: Current | undefined
  let active: { controller: AbortController; stage: Stage } | undefined
  let admitted = true
  const listeners = new Set<() => void>()
  const key = options.key ?? (() => crypto.randomUUID())
  const update = (next: ImportState) => { state = Object.freeze(next); for (const listener of listeners) listener() }
  const removeLocator = () => { try { storage?.removeItem(LOCAL_IMPORT_LOCATOR_KEY) } catch { /* Storage is optional. */ } }
  const saveLocator = () => {
    if (!intentId || !expiresAt) return
    try { storage?.setItem(LOCAL_IMPORT_LOCATOR_KEY, JSON.stringify({ subject, intent_id: intentId, expires_at: expiresAt })) } catch { /* Current in-memory intent still works. */ }
  }
  try {
    const raw: unknown = JSON.parse(storage?.getItem(LOCAL_IMPORT_LOCATOR_KEY) ?? "null")
    if (subject && raw && typeof raw === "object" && !Array.isArray(raw)) {
      const value = raw as Record<string, unknown>
      if (Object.keys(value).sort().join(",") === "expires_at,intent_id,subject" && value.subject === subject && localImportIdSchema.safeParse(value.intent_id).success && typeof value.expires_at === "string" && Date.parse(value.expires_at) > Date.now()) {
        intentId = value.intent_id as string; expiresAt = value.expires_at
        state = { kind: "recoverable", intentId }
      } else removeLocator()
    }
  } catch { removeLocator() }
  const cancel = () => {
    const running = active
    if (!running) return
    active = undefined; running.controller.abort()
    update({ kind: running.stage === "hashing" ? "reselect" : "unknown", stage: running.stage, ...(intentId ? { intentId } : {}) })
  }
  const bindSeries = (series: string) => { const expected = begin?.skill_id ?? restored?.skill_id; if (expected && series !== expected) throw new HubClientError("parse", "local import series mismatch", null, 200) }
  const settle = (current: Pick<Finalized, "skill"> & { installation: Finalized["installation"] | undefined }) => {
    bindSeries(current.skill.series_id)
    update({ kind: "completed", ...(intentId ? { intentId } : {}), skill: current.skill, installed: current.installation?.installed === true && current.installation.enabled })
    removeLocator()
  }
  const run = async (first: Stage) => {
    if (active || !admitted) return
    const running = { controller: new AbortController(), stage: first }
    active = running
    const { signal } = running.controller
    const current = () => { signal.throwIfAborted(); if (active !== running || !admitted) throw new Error("retired import") }
    const stage = (next: Stage) => { current(); running.stage = next; update({ kind: "running", stage: next, ...(intentId ? { intentId } : {}) }) }
    try {
      stage(first)
      if (first === "get") {
        if (!intentId) return
        const value = await client.get(intentId, signal); current(); bindSeries(value.skill_id)
        if (completeBody && value.upload_proof && (value.upload_proof.upload_id !== completeBody.upload_id || value.upload_proof.source_version_id !== completeBody.source_version_id || value.upload_proof.content_sha256 !== completeBody.content_sha256 || value.upload_proof.size_bytes !== String(completeBody.size_bytes))) throw new HubClientError("parse", "local import recovered proof mismatch", null, 200)
        restored = value; expiresAt = value.expires_at; saveLocator()
        if (value.phase === "completed") { if (!value.skill) throw new HubClientError("parse", "completed local import skill missing", null, 200); settle({ skill: value.skill, installation: value.installation }); return }
        if (value.phase === "expired" || value.phase === "rejected") { update({ kind: value.phase === "expired" ? "expired" : "rejected", stage: "get", intentId, ...(value.rejection_code ? { code: value.rejection_code } : {}) }); return }
        if (value.phase === "upload_pending") {
          update({ kind: file && beginBody && beginKey ? "recoverable" : "reselect", stage: "begin", intentId }); return
        }
        update({ kind: "recoverable", stage: "finalize", intentId }); return
      }
      if (first === "hashing") {
        if (!file) return
        const hashTimer = setTimeout(() => running.controller.abort(), 20_000)
        const read = () => typeof file!.arrayBuffer === "function" ? file!.arrayBuffer() : new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("invalid file bytes"))
          reader.onerror = () => reject(reader.error)
          reader.onabort = () => reject(signal.reason)
          const abort = () => reader.abort()
          signal.addEventListener("abort", abort, { once: true })
          reader.onloadend = () => signal.removeEventListener("abort", abort)
          reader.readAsArrayBuffer(file!)
        })
        let abort!: () => void
        const aborted = new Promise<never>((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }) })
        let content_sha256: string
        try {
          content_sha256 = await Promise.race([aborted, options.hash ? options.hash(file, signal) : read().then(async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) => v.toString(16).padStart(2, "0")).join(""))])
        } finally { clearTimeout(hashTimer); signal.removeEventListener("abort", abort) }
        current()
        beginBody = Object.freeze(localImportBeginRequestSchema.parse({ filename: file.name, size_bytes: file.size, content_sha256 }))
        beginKey = key(); stage("begin")
      }
      if (running.stage === "begin") {
        if (!beginBody || !beginKey || !file) { update({ kind: "reselect", ...(intentId ? { intentId } : {}) }); return }
        const value = await client.begin(beginBody, beginKey, signal); current()
        if (intentId && value.intent_id !== intentId) throw new HubClientError("parse", "local import intent mismatch", null, 201)
        bindSeries(value.skill_id); begin = value; intentId = value.intent_id; expiresAt = value.expires_at; saveLocator(); stage("put")
      }
      if (running.stage === "put") {
        if (!begin || !file || !beginBody) { update({ kind: "reselect", ...(intentId ? { intentId } : {}) }); return }
        const ack = await client.putPackage(begin.transfer_reference, file, signal); current()
        completeBody = Object.freeze({ upload_id: begin.upload_id, source_version_id: ack.source_version_id, size_bytes: beginBody.size_bytes, content_sha256: beginBody.content_sha256 })
        completeKey = key(); stage("complete")
      }
      if (running.stage === "complete") {
        if (!intentId || !completeBody || !completeKey) { update({ kind: "reselect", ...(intentId ? { intentId } : {}) }); return }
        const value = await client.complete(intentId, completeBody, completeKey, signal); current(); bindSeries(value.skill_id)
        complete = value
        if (value.scan_state === "infected") { update({ kind: "rejected", stage: "complete", intentId, code: "infected" }); return }
        stage("finalize")
      }
      if (running.stage === "finalize") {
        if (!intentId || (!complete && restored?.phase !== "uploaded")) { update({ kind: "reselect", ...(intentId ? { intentId } : {}) }); return }
        finalizeKey ??= key()
        const value = await client.finalize(intentId, finalizeKey, signal); current(); settle(value)
      }
    } catch (error) {
      if (active !== running) return
      const rejected = error instanceof HubClientError && error.reason === "http" && [400, 401, 403, 404, 409, 412, 413].includes(error.status ?? 0)
      update({ kind: running.stage === "hashing" ? "reselect" : rejected ? "rejected" : "unknown", stage: running.stage, ...(intentId ? { intentId } : {}), ...(error instanceof HubClientError && error.code ? { code: error.code } : {}) })
    } finally { if (active === running) active = undefined }
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => state,
    cancel,
    setAdmitted: (value: boolean) => { admitted = value; if (!value) cancel() },
    retire: (clear: boolean) => { admitted = false; cancel(); file = undefined; beginBody = undefined; beginKey = undefined; completeBody = undefined; completeKey = undefined; finalizeKey = undefined; begin = undefined; complete = undefined; restored = undefined; if (clear) removeLocator() },
    select: (value: File) => { if (active || !admitted || intentId !== undefined || state.kind === "unknown" || state.kind === "recoverable") return Promise.resolve(); const parsed = localImportBeginRequestSchema.safeParse({ filename: value.name, size_bytes: value.size, content_sha256: "0".repeat(64) }); if (!parsed.success) { update({ kind: "reselect", code: "invalid_local_skill_import_request" }); return Promise.resolve() } file = value; return run("hashing") },
    retry: () => run(state.stage ?? (intentId ? "get" : "hashing")),
    restore: () => run("get"),
    continue: () => state.kind === "recoverable" ? run(restored?.phase === "uploaded" ? "finalize" : "begin") : Promise.resolve(),
    replace: () => { if (active) return; removeLocator(); file = undefined; beginBody = undefined; beginKey = undefined; begin = undefined; complete = undefined; completeBody = undefined; completeKey = undefined; finalizeKey = undefined; intentId = undefined; expiresAt = undefined; restored = undefined; update({ kind: "idle" }) },
  }
}
export type PersonalSkillImportFlow = ReturnType<typeof createPersonalSkillImportFlow>
