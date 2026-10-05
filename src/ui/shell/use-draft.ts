"use client"

// 未发送草稿 controller：按会话持久化（切会话/刷新都保留，in-memory useState 会丢）。空串=无草稿。
// 与会话 store 分键：逐键改动不惊动引擎、也不跨 tab 抢占（草稿是本地正在编辑态）。
// 键控派生（非 effect 同步 setState）：mounted 门控保证 SSR/水合首帧一致（服务端无 localStorage）。

import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

import { createPersistedStore } from "@/lib/persisted-store"

// 无活跃会话（新建未落库）时的草稿键。
const DRAFT_PENDING_KEY = "__pending__"
const DRAFT_WRITE_DEBOUNCE_MS = 200

const draftStore = createPersistedStore({
  key: "kokoro.web.drafts",
  schema: z.record(z.string(), z.string()),
})

function readDraft(key: string): string {
  return draftStore.read()?.[key] ?? ""
}

function writeDraft(key: string, value: string): void {
  const all = draftStore.read() ?? {}
  if (value === "") {
    if (!(key in all)) return
    const next = { ...all }
    delete next[key]
    draftStore.write(next)
  } else {
    draftStore.write({ ...all, [key]: value })
  }
}

// Mounted Skills prompt handoff reuses the current actor’s pending composer.
// Anonymous landing input uses the separate one-shot handoff below.
export function stashPendingDraft(value: string): void {
  writeDraft(DRAFT_PENDING_KEY, value.trim())
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
  writeDraft(DRAFT_PENDING_KEY, "")
}

/** Seed a draft after the shell has synchronously allocated a new session id. */
export function stashConversationDraft(id: string, value: string): void {
  writeDraft(id, value.trim())
}

export type DraftController = {
  draft: string
  updateDraft: (value: string) => void
  clearDraft: () => void
}

// A hook-local write capability over the existing cache marker, not identity.
// Method closures stay stable across renders without reading React refs in render.
function createDraftActorFence() {
  let marker: string | null = null
  let captured = false
  let retired = false
  const readMarker = () => {
    try { return window.localStorage.getItem("kokoro.web.auth-index-subject") }
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

export function useDraft(activeId: string | null, mounted: boolean, projectRef?: string): DraftController {
  // A project without a conversation is still a distinct composer. Reusing
  // __pending__ here would overwrite a newer direct-chat draft during an
  // asynchronous project-create handoff.
  const draftKey = activeId ?? (projectRef ? `__project__:${encodeURIComponent(projectRef)}` : DRAFT_PENDING_KEY)
  const [actor] = useState(createDraftActorFence)
  const actorAtRender = actor.observe(mounted)
  const [draftEdit, setDraftEdit] = useState<{ key: string; value: string } | null>(null)
  const pendingWriteRef = useRef<{
    key: string
    value: string
    timer: ReturnType<typeof setTimeout>
  } | null>(null)

  const flushPendingWrite = useCallback(() => {
    const pending = pendingWriteRef.current
    if (pending === null) return
    clearTimeout(pending.timer)
    pendingWriteRef.current = null
    if (actor.current()) writeDraft(pending.key, pending.value)
  }, [actor])

  const scheduleDraftWrite = useCallback((key: string, value: string) => {
    if (!actor.current()) return
    const previous = pendingWriteRef.current
    if (previous !== null) {
      clearTimeout(previous.timer)
      if (previous.key !== key) {
        writeDraft(previous.key, previous.value)
      }
    }
    const timer = setTimeout(() => {
      if (pendingWriteRef.current?.timer !== timer) return
      pendingWriteRef.current = null
      if (actor.current()) writeDraft(key, value)
    }, DRAFT_WRITE_DEBOUNCE_MS)
    pendingWriteRef.current = { key, value, timer }
  }, [actor])

  // Flush before switching to another scoped composer and when the shell
  // unmounts. This keeps navigation/refresh lossless while removing the
  // synchronous localStorage read/clone/stringify from every keystroke.
  useEffect(() => () => flushPendingWrite(), [draftKey, flushPendingWrite])

  // A document navigation can discard the React tree before passive-effect
  // cleanup runs. pagehide is the browser-owned last chance to persist the
  // already captured exact key/value without extending the debounce window.
  useEffect(() => {
    const flushOnPageHide = () => flushPendingWrite()
    window.addEventListener("pagehide", flushOnPageHide)
    return () => window.removeEventListener("pagehide", flushOnPageHide)
  }, [flushPendingWrite])

  const draft = !actorAtRender.current
    ? ""
    : draftEdit !== null && draftEdit.key === draftKey
      ? draftEdit.value
      : readDraft(draftKey)

  const updateDraft = useCallback(
    (value: string) => {
      if (!mounted || !actor.commit(actorAtRender.marker)) return
      setDraftEdit({ key: draftKey, value })
      scheduleDraftWrite(draftKey, value)
    },
    [draftKey, mounted, actorAtRender.marker, actor, scheduleDraftWrite],
  )

  const clearDraft = useCallback(() => {
    if (!mounted || !actor.commit(actorAtRender.marker)) return
    setDraftEdit({ key: draftKey, value: "" })
    flushPendingWrite()
    writeDraft(draftKey, "")
  }, [draftKey, mounted, actorAtRender.marker, actor, flushPendingWrite])

  return { draft, updateDraft, clearDraft }
}
