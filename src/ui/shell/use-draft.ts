"use client"

// 未发送草稿 controller：按原会话、待创建或项目槽位持久化文本与 opaque refs。
// 与会话 store 分键：逐键改动不惊动引擎、也不跨 tab 抢占（草稿是本地正在编辑态）。
// 键控派生（非 effect 同步 setState）：mounted 门控保证 SSR/水合首帧一致（服务端无 localStorage）。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"

import { selectedResourceRefsSchema, type SelectedResourceRef } from "@/contract/chat"
import { createPersistedStore } from "@/lib/persisted-store"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

// 无活跃会话（新建未落库）时的草稿键。
const DRAFT_PENDING_KEY = "__pending__"
const DRAFT_WRITE_DEBOUNCE_MS = 200
export const DRAFTS_STORAGE_KEY = "kokoro.web.drafts"
const SUBJECT_KEY = "kokoro.web.auth-index-subject"
const scopedDraftSchema = z.object({
  subject: z.string().min(1), tenant: z.string().min(1),
  text: z.string(), refs: selectedResourceRefsSchema,
}).strict()
const draftSchema = z.record(z.string(), z.union([z.string(), scopedDraftSchema]))
type ScopedDraft = z.infer<typeof scopedDraftSchema>
type DraftOwner = Pick<ScopedDraft, "subject" | "tenant">
type Draft = string | ScopedDraft
const EMPTY_REFS: readonly SelectedResourceRef[] = Object.freeze([])
let verifiedDraftOwner: DraftOwner | null = null

/** Bound only by the existing native session admission; never inferred from disk. */
export function bindVerifiedDraftOwner(subject: string | null, tenant?: string): void {
  if (!subject || !tenant) verifiedDraftOwner = null
  else if (verifiedDraftOwner?.subject !== subject || verifiedDraftOwner.tenant !== tenant) verifiedDraftOwner = { subject, tenant }
}

function ownedBy(value: ScopedDraft, owner: DraftOwner | null): boolean {
  return owner?.subject === value.subject && owner.tenant === value.tenant
}

const textOf = (value: Draft) => typeof value === "string" ? value : value.text
const refsOf = (value: Draft): readonly SelectedResourceRef[] => typeof value === "string" ? EMPTY_REFS : value.refs
const withText = (value: Draft, text: string): Draft => typeof value === "string" ? text : { ...value, text }
const isEmpty = (value: Draft) => textOf(value) === "" && refsOf(value).length === 0
const sameRefs = (left: readonly SelectedResourceRef[], right: readonly SelectedResourceRef[]) =>
  JSON.stringify(left) === JSON.stringify(right)

const draftStore = createPersistedStore({
  key: DRAFTS_STORAGE_KEY,
  schema: draftSchema,
})

function readDraft(key: string, owner: DraftOwner | null): Draft {
  const value = draftStore.read()?.[key] ?? ""
  return typeof value === "string" || ownedBy(value, owner) ? value : ""
}

function writeDraft(key: string, value: Draft, owner: DraftOwner | null, replaces: DraftOwner | null = null): void {
  const all = draftStore.read() ?? {}
  const existing = all[key]
  if (existing !== undefined && typeof existing !== "string" &&
    !ownedBy(existing, owner) && (owner === null || isEmpty(value) || !ownedBy(existing, replaces))) return
  if (isEmpty(value)) {
    if (existing === undefined) return
    const next = { ...all }
    delete next[key]
    draftStore.write(next)
  } else {
    draftStore.write({ ...all, [key]: value })
  }
}

function handoffOwner(): DraftOwner | null {
  try {
    return window.localStorage.getItem(SUBJECT_KEY) === verifiedDraftOwner?.subject ? verifiedDraftOwner : null
  } catch { return null }
}

function stashText(key: string, value: string): void {
  const owner = handoffOwner()
  const existing = draftStore.read()?.[key]
  writeDraft(key, value.trim(), owner, typeof existing === "object" ? existing : null)
}

// Mounted Skills prompt handoff reuses the current actor’s pending composer.
// Anonymous landing input uses the separate one-shot handoff below.
export function stashPendingDraft(value: string): void {
  stashText(DRAFT_PENDING_KEY, value)
}

/** Explicit native-admission handoff: storage errors must remain observable. */
export function writeLandingPendingDraft(prompt: string): void {
  const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY)
  const drafts = raw === null ? {} : draftSchema.parse(JSON.parse(raw))
  window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify({ ...drafts, [DRAFT_PENDING_KEY]: prompt }))
}

// Explicit landing input is not part of an unknown actor's private draft map.
// sessionStorage isolates normal tabs; copied/duplicated tabs can inherit it.
const LANDING_PROMPT_KEY = "kokoro.web.anonymous-prompt-handoff"
export const LANDING_PROMPT_MAX_LENGTH = 65536

export function stashLandingPrompt(value: string): void {
  window.sessionStorage.removeItem(LANDING_PROMPT_KEY)
  const prompt = value.trim()
  if (prompt === "") return
  if (prompt.length > LANDING_PROMPT_MAX_LENGTH) throw new Error("landing prompt too large")
  window.sessionStorage.setItem(LANDING_PROMPT_KEY, JSON.stringify([1, Date.now(), prompt]))
}

/** Take once before checking the closed record; storage failure must propagate. */
export function consumeLandingPrompt(): string | null {
  const raw = window.sessionStorage.getItem(LANDING_PROMPT_KEY)
  window.sessionStorage.removeItem(LANDING_PROMPT_KEY)
  if (raw === null || raw.length > LANDING_PROMPT_MAX_LENGTH * 6 + 64) return null
  let record: unknown
  try { record = JSON.parse(raw) } catch { return null }
  const now = Date.now()
  if (!Array.isArray(record) || record.length !== 3 || record[0] !== 1 ||
    typeof record[1] !== "number" || !Number.isSafeInteger(record[1]) || record[1] < 0 ||
    record[1] > now || now - record[1] > 300_000 ||
    typeof record[2] !== "string" || record[2].length === 0 || record[2].length > LANDING_PROMPT_MAX_LENGTH ||
    record[2] !== record[2].trim()) return null
  return record[2]
}

/** Clear the route-neutral draft slot before a mounted surface handoff. */
export function clearPendingDraft(): void {
  const owner = handoffOwner()
  writeDraft(DRAFT_PENDING_KEY, withText(readDraft(DRAFT_PENDING_KEY, owner), ""), owner)
}

/** Seed a draft after the shell has synchronously allocated a new session id. */
export function stashConversationDraft(id: string, value: string): void {
  stashText(id, value)
}

export type DraftController = {
  draft: string
  resourceRefs: readonly SelectedResourceRef[]
  resourcesAvailable: boolean
  readCurrentDraft: () => { text: string; refs: readonly SelectedResourceRef[] } | null
  updateDraft: (value: string) => void
  updateResourceRefs: (refs: readonly SelectedResourceRef[]) => void
  clearDraft: (keepResources?: boolean) => void
  restoreDraft: (value: string, refs?: readonly SelectedResourceRef[]) => boolean
}

// A hook-local write capability over the existing cache marker, not identity.
// Method closures stay stable across renders without reading React refs in render.
function createDraftActorFence() {
  let marker: string | null = null
  let captured = false
  let retired = false
  const readMarker = () => {
    try { return window.localStorage.getItem(SUBJECT_KEY) }
    catch { retired = true; return null }
  }
  const current = () => {
    if (retired) return false
    const latest = readMarker()
    if (captured && latest !== marker) retired = true
    return !retired && latest === marker
  }
  return {
    observe(mounted: boolean) {
      if (!mounted || typeof window === "undefined") return { marker: null, current: false }
      if (!captured && !retired) {
        marker = readMarker()
        // An idle hydrated boot shell may precede the first verified marker.
        captured = marker !== null
      }
      return { marker, current: current() }
    },
    current,
    commit(expectedMarker: string | null) {
      if (expectedMarker !== marker || !current()) return false
      // A null-marker preview/anonymous writer becomes owned once it mutates;
      // it must retire rather than upgrade a pending write to a verified actor.
      captured = true
      return true
    },
  }
}

export function useDraft(activeId: string | null, mounted: boolean, projectRef?: string, boundary?: ProjectReadBoundary): DraftController {
  const draftKey = activeId ?? (projectRef ? `__project__:${encodeURIComponent(projectRef)}` : DRAFT_PENDING_KEY)
  const [actor] = useState(createDraftActorFence)
  const enabled = mounted && boundary?.admitted !== false
  const actorAtRender = actor.observe(enabled)
  const owner = boundary?.admitted && verifiedDraftOwner?.subject === boundary.subject &&
    verifiedDraftOwner.tenant === boundary.tenant ? verifiedDraftOwner : null
  const generation = boundary?.generation
  const admitted = boundary?.admitted !== false
  const access = useMemo(() => ({ owner, generation, admitted }), [owner, generation, admitted])
  const scope = useMemo(() => ({ key: draftKey, access, enabled }), [draftKey, access, enabled])
  type Scope = typeof scope
  type Access = typeof access
  type Edit = { scope: Scope; value: Draft }
  type PendingWrite = Edit & { replaces: DraftOwner | null; timer: ReturnType<typeof setTimeout> }
  const committed = useRef<{ scope: Scope; mounted: boolean; retired: boolean } | null>(null)
  const [draftEdit, setDraftEdit] = useState<Edit | null>(null)
  const latestEdit = useRef<Edit | null>(null)
  const pendingWriteRef = useRef<PendingWrite | null>(null)

  useLayoutEffect(() => {
    const previous = committed.current
    const lease = { scope, mounted: true, retired: previous?.scope.access === scope.access && previous.retired }
    committed.current = lease
    return () => { lease.mounted = false }
  }, [scope])

  const accessIsCurrent = useCallback((candidate: Access) =>
    committed.current?.scope.access === candidate && !committed.current.retired &&
    candidate.admitted && (candidate.owner === null || candidate.owner === verifiedDraftOwner), [])

  const takePendingWrite = useCallback(() => {
    const pending = pendingWriteRef.current
    if (pending !== null) clearTimeout(pending.timer)
    pendingWriteRef.current = null
    return pending
  }, [])
  const writePending = useCallback((pending: PendingWrite | null) => {
    if (pending !== null && accessIsCurrent(pending.scope.access) && actor.current())
      writeDraft(pending.scope.key, pending.value, pending.scope.access.owner, pending.replaces)
  }, [accessIsCurrent, actor])
  const flushPendingWrite = useCallback(() => writePending(takePendingWrite()), [takePendingWrite, writePending])

  // A scope transition saves the departing draft, but an admission transition
  // never lets a debounced edit run under the replacement generation.
  useEffect(() => () => flushPendingWrite(), [draftKey, flushPendingWrite])
  useLayoutEffect(() => {
    const onPageHide = () => {
      flushPendingWrite()
      if (owner !== null && committed.current?.scope.access === access) committed.current.retired = true
    }
    // Native dispatch can commit the auth listener's retirement between
    // callbacks. Flush the current lease before those non-capture listeners.
    window.addEventListener("pagehide", onPageHide, true)
    return () => window.removeEventListener("pagehide", onPageHide, true)
  }, [access, owner, flushPendingWrite])

  const visible = actorAtRender.current
  const stored = visible && draftEdit?.scope !== scope ? draftStore.read()?.[draftKey] ?? "" : ""
  // A new edit may claim this slot from a different tenant's hidden record,
  // but its later timer cannot overwrite a different owner who wrote meanwhile.
  const foreign = typeof stored !== "string" && !ownedBy(stored, owner) ? stored : null
  const value = !visible ? "" : draftEdit?.scope === scope ? draftEdit.value : foreign === null ? stored : ""
  const isCurrent = useCallback(() => scope.enabled && committed.current?.scope === scope && committed.current.mounted &&
    accessIsCurrent(scope.access) && actor.commit(actorAtRender.marker), [accessIsCurrent, actor, actorAtRender.marker, scope])
  const latestValue = useCallback(() => latestEdit.current?.scope === scope ? latestEdit.current.value : value, [scope, value])
  const readCurrentDraft = useCallback(() => {
    if (!isCurrent()) return null
    const current = latestValue()
    return { text: textOf(current), refs: refsOf(current) }
  }, [isCurrent, latestValue])

  const publish = useCallback((next: Draft) => {
    const edit = { scope, value: next }
    latestEdit.current = edit
    setDraftEdit(edit)
    return edit
  }, [scope])
  const update = useCallback((next: Draft) => {
    const edit = publish(next)
    const previous = takePendingWrite()
    if (previous?.scope.key !== scope.key) writePending(previous)
    const timer = setTimeout(() => {
      if (pendingWriteRef.current?.timer === timer) flushPendingWrite()
    }, DRAFT_WRITE_DEBOUNCE_MS)
    const replaces = previous?.scope === scope ? previous.replaces
      : foreign === null ? null : { subject: foreign.subject, tenant: foreign.tenant }
    pendingWriteRef.current = { ...edit, replaces, timer }
  }, [flushPendingWrite, foreign, publish, scope, takePendingWrite, writePending])
  const updateDraft = useCallback((text: string) => {
    if (isCurrent()) update(withText(latestValue(), text))
  }, [isCurrent, latestValue, update])
  const updateResourceRefs = useCallback((refs: readonly SelectedResourceRef[]) => {
    if (!owner || !isCurrent()) return
    const next = selectedResourceRefsSchema.safeParse(refs)
    const current = latestValue()
    if (next.success && !sameRefs(refsOf(current), next.data)) update({ ...owner, text: textOf(current), refs: next.data })
  }, [isCurrent, latestValue, owner, update])
  const clearDraft = useCallback((keepResources = false) => {
    if (!isCurrent()) return
    const next = keepResources ? withText(latestValue(), "") : ""
    const pending = takePendingWrite()
    if (pending?.scope.key !== scope.key) writePending(pending)
    publish(next)
    writeDraft(scope.key, next, owner)
  }, [isCurrent, latestValue, owner, publish, scope, takePendingWrite, writePending])

  const restoreDraft = useCallback((text: string, refs?: readonly SelectedResourceRef[]): boolean => {
    if (!isCurrent()) return false
    const parsed = refs === undefined ? undefined : selectedResourceRefsSchema.safeParse(refs)
    if (parsed?.success === false || (parsed?.data.length && owner === null)) return false
    const originalRefs = parsed?.data
    const conflicts = (existing: Draft) => !isEmpty(existing) &&
      ((textOf(existing) !== "" && textOf(existing) !== text) ||
        (originalRefs !== undefined && !sameRefs(refsOf(existing), originalRefs)))
    const local = latestValue()
    if (conflicts(local)) return false
    let next: Draft
    // Retiring a rejected command requires confirmed durable restoration of the
    // exact intent. Steer has no refs; preserve any current, unsent selection.
    try {
      const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY)
      const all = raw === null ? {} : draftSchema.parse(JSON.parse(raw))
      const disk = all[scope.key] ?? ""
      if ((typeof disk !== "string" && !ownedBy(disk, owner)) || conflicts(disk)) return false
      const hasLocalWrite = pendingWriteRef.current?.scope === scope
      if (originalRefs === undefined && !isEmpty(disk) && (hasLocalWrite || !isEmpty(local)) &&
        !sameRefs(refsOf(local), refsOf(disk))) return false
      next = owner !== null && originalRefs?.length
        ? { ...owner, text, refs: originalRefs }
        : withText(!hasLocalWrite && isEmpty(local) ? disk : local, text)
      if (JSON.stringify(disk) !== JSON.stringify(next)) {
        const replacement = JSON.stringify({ ...all, [scope.key]: next })
        window.localStorage.setItem(DRAFTS_STORAGE_KEY, replacement)
        if (window.localStorage.getItem(DRAFTS_STORAGE_KEY) !== replacement) return false
      }
    } catch { return false }
    if (pendingWriteRef.current?.scope.key === scope.key) takePendingWrite()
    publish(next)
    return true
  }, [isCurrent, latestValue, owner, publish, scope, takePendingWrite])

  return { draft: textOf(value), resourceRefs: refsOf(value), resourcesAvailable: visible && owner !== null,
    readCurrentDraft, updateDraft, updateResourceRefs, clearDraft, restoreDraft }
}
