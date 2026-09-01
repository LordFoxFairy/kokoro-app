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

// 落地页 hero 输入带入 composer：把草稿写进「新建未落库」会话的 pending 键——登录回跳 `/` 后
// 工作台 useDraft 以同键读出，composer 天然预填（复用既有草稿机制，跨整页导航由 localStorage 持久）。
export function stashPendingDraft(value: string): void {
  writeDraft(DRAFT_PENDING_KEY, value.trim())
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

export function useDraft(activeId: string | null, mounted: boolean): DraftController {
  const draftKey = activeId ?? DRAFT_PENDING_KEY
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
    writeDraft(pending.key, pending.value)
  }, [])

  const scheduleDraftWrite = useCallback((key: string, value: string) => {
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
      writeDraft(key, value)
    }, DRAFT_WRITE_DEBOUNCE_MS)
    pendingWriteRef.current = { key, value, timer }
  }, [])

  // Flush before switching to another scoped composer and when the shell
  // unmounts. This keeps navigation/refresh lossless while removing the
  // synchronous localStorage read/clone/stringify from every keystroke.
  useEffect(() => () => flushPendingWrite(), [draftKey, flushPendingWrite])

  const draft = !mounted
    ? ""
    : draftEdit !== null && draftEdit.key === draftKey
      ? draftEdit.value
      : readDraft(draftKey)

  const updateDraft = useCallback(
    (value: string) => {
      setDraftEdit({ key: draftKey, value })
      scheduleDraftWrite(draftKey, value)
    },
    [draftKey, scheduleDraftWrite],
  )

  const clearDraft = useCallback(() => {
    setDraftEdit({ key: draftKey, value: "" })
    flushPendingWrite()
    writeDraft(draftKey, "")
  }, [draftKey, flushPendingWrite])

  return { draft, updateDraft, clearDraft }
}
