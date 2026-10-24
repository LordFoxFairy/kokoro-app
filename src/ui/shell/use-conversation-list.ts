"use client"

// 会话清单 controller（SESS-LIST / CONV-UX）：服务端水合清单 + 乐观标题覆写 + 新建/切换/删除/重命名。
// 清单本体来自 session GET /sessions（换浏览器见同列表），localStorage 不再作真源；新建/切换/删除/
// 开跑收尾后 refresh 重取首页。活跃会话若未在服务端清单出现（新建未落库/未及刷新）合成置顶项不消失。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { conversationTitle } from "@/core/conversations"
import { SessionClientError } from "@/engine/client"
import type { EngineSnapshot } from "@/engine/machine"
import type { SessionEngine } from "@/engine/machine"
import { useSessionList } from "@/ui/rail/use-session-list"

import { useActiveArchiveState } from "./use-active-archive-state"
import type { ArchiveState } from "@/lib/archived-tasks.schema"
import { browserListClient } from "./page-clients"
import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"

type Thread = EngineSnapshot["thread"]

type ConversationEntry = { id: string; title: string; submissionUnconfirmed?: boolean }

export type ConversationListController = {
  archiveStatus?: "draft" | "unconfirmed" | "unarchived" | "archived" | "unknown" | "missing"
  archiveStateError?: boolean
  retryArchiveState?: () => void
  conversations: ConversationEntry[]
  loading: boolean
  loadingMore: boolean
  error: boolean
  refresh: () => void
  hasMore: boolean
  loadMore: () => void
  deleteConversation: (id: string) => Promise<boolean>
  renameConversation: (id: string, title: string) => void
}

export function useConversationList(params: {
  engine: SessionEngine | null
  preview?: boolean
  activeId: string | null
  thread: Thread
  isStreaming: boolean
  /** False while another scope owns the engine, or its lease/snapshot is not ready. */
  observeRunStatus?: boolean
  scope?: SessionScope
  archiveRevision?: number
  archiveReceipt?: ArchiveState | null
  scopeRevision?: number
  readBoundary?: { identity: string; admitted: boolean }
  onDeleteConfirmed?: (scope: SessionScope, id: string) => void
}): ConversationListController {
  const {
    engine, preview = false, activeId, thread, isStreaming, observeRunStatus = true,
    scope = DIRECT_SESSION_SCOPE, scopeRevision = 0, archiveRevision = 0, archiveReceipt, readBoundary, onDeleteConfirmed,
  } = params

  const [listRefresh, setListRefresh] = useState(scopeRevision)
  const listRefreshRef = useRef(scopeRevision)
  const currentScopeKey = sessionScopeKey(scope)
  const observedScopeRevisionRef = useRef({ scopeKey: currentScopeKey, revision: scopeRevision, archiveRevision })
  const listClient = browserListClient({ preview })
  const lifecycleIdentity = useMemo(() => ({ client: listClient, scopeKey: currentScopeKey, identity: readBoundary?.identity, admitted: readBoundary?.admitted ?? true }), [currentScopeKey, listClient, readBoundary?.identity, readBoundary?.admitted])
  type LifecycleToken = { identity: typeof lifecycleIdentity; active: boolean; controllers: Set<AbortController> }
  const lifecycleRef = useRef<LifecycleToken | null>(null)
  type RenameOverlay = { title: string; sequence: number; reconcileAfter: number | null; lifecycle: LifecycleToken }
  type RenameIntent = { title: string; sequence: number; lifecycle: LifecycleToken }
  type RenameQueue = { running: boolean; latest: RenameIntent | null; reconcileLifecycles: Set<LifecycleToken> }
  const [titleOverrides, setTitleOverrides] = useState<Record<string, RenameOverlay>>({})
  const renameSequenceRef = useRef(0)
  const renameQueuesRef = useRef(new Map<string, RenameQueue>())
  const handleFirstPageSettled = useCallback((settled: {
    scopeKey: string
    refreshSignal: number
    requestGeneration: number
    success: boolean
  }) => {
    if (!settled.success) return
    setTitleOverrides((previous) => {
      let changed = false
      const next = { ...previous }
      for (const [id, overlay] of Object.entries(previous)) {
        if (
          overlay.lifecycle.identity.client === listClient
          && overlay.lifecycle.identity.scopeKey === settled.scopeKey
          && overlay.reconcileAfter !== null
          && settled.refreshSignal >= overlay.reconcileAfter
        ) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [listClient])
  const sessionList = useSessionList(listClient, listRefresh, scope, handleFirstPageSettled, readBoundary)
  useLayoutEffect(() => {
    const token: LifecycleToken = { identity: lifecycleIdentity, active: lifecycleIdentity.admitted, controllers: new Set<AbortController>() }
    lifecycleRef.current = token
    return () => {
      token.active = false
      for (const controller of token.controllers) controller.abort()
      token.controllers.clear()
      if (lifecycleRef.current === token) lifecycleRef.current = null
    }
  }, [lifecycleIdentity])

  const requestListRefresh = useCallback((): number => {
    const next = listRefreshRef.current + 1
    listRefreshRef.current = next
    setListRefresh(next)
    return next
  }, [])

  useEffect(() => {
    const previous = observedScopeRevisionRef.current
    observedScopeRevisionRef.current = { scopeKey: currentScopeKey, revision: scopeRevision, archiveRevision }
    // Entering a scope already starts its canonical first-page GET. Only a
    // revision change while that same scope has been observed needs a second,
    // explicitly post-ACK request.
    if (previous.scopeKey !== currentScopeKey || (previous.revision === scopeRevision && previous.archiveRevision === archiveRevision)) return
    requestListRefresh()
  }, [currentScopeKey, requestListRefresh, scopeRevision, archiveRevision])

  // 当前活跃会话若尚未在服务端清单出现：仅在它已有真实内容时合成置顶项。
  // 空工作区不应在「最近」里出现一个没有任何历史的“新对话”行；这会让
  // 首屏看起来像已经有一条任务，也不符合 Manus/Codex 的空工作台语义。
  const activeInList = activeId !== null && sessionList.entries.some((entry) => entry.id === activeId)
  const activeHasContent = thread.messages.length > 0 || Boolean(thread.meta?.title?.trim())
  const engineView = engine?.getSnapshot?.()
  const archiveState = useActiveArchiveState({pendingSubmission:engineView?.store?.activeId===activeId && engineView.hasPendingSubmission===true,ownerConfirmed:engineView?.ownerConfirmedSessionId===activeId,identity:lifecycleIdentity,admitted:!preview && readBoundary?.admitted===true,id:activeId,inList:activeInList,listSettled:!sessionList.loading,hasContent:activeHasContent,locallyCreated:engine?.getSnapshot?.().locallyCreatedSessionId===activeId,revision:archiveRevision,refresh:listRefresh,onPersisted:()=>{if(engine?.getSnapshot?.().locallyCreatedSessionId===activeId)engine.retireLocalCreationProvenance()},...(archiveReceipt===undefined?{}:{receipt:archiveReceipt})})
  const receiptKey = archiveReceipt ? JSON.stringify(archiveReceipt) : null
  const [archiveFence, setArchiveFence] = useState(() => ({ identity: lifecycleIdentity, revision: archiveRevision, receiptKey, beforeRefresh: listRefresh - 1 }))
  let currentArchiveFence = archiveFence
  if (archiveFence.identity !== lifecycleIdentity || archiveFence.revision !== archiveRevision || archiveFence.receiptKey !== receiptKey) {
    // A newly mounted scope starts its read after the receipt; an existing scope
    // waits for the explicit post-ACK refresh to supersede its old page.
    currentArchiveFence = { identity: lifecycleIdentity, revision: archiveRevision, receiptKey, beforeRefresh: listRefresh - (archiveFence.identity !== lifecycleIdentity ? 1 : 0) }
    setArchiveFence(currentArchiveFence)
  }
  const postReceiptPage=sessionList.settledFirstPage?.success===true && sessionList.settledFirstPage.refreshSignal>currentArchiveFence.beforeRefresh
  const activeMessages = activeId === null ? null : thread.messages
  const activeTitle = activeId === null ? undefined : thread.meta?.title
  const unscopedBoundary = readBoundary === undefined
  const conversations = useMemo(() => {
    const withOverride = (id: string, title: string): string => {
      const overlay = titleOverrides[id]
      return overlay?.lifecycle.identity === lifecycleIdentity ? overlay.title : title
    }
    const visibleEntries = sessionList.entries.filter(entry => !(entry.id !== activeId && !postReceiptPage && archiveReceipt?.archived_at != null && entry.id === archiveReceipt.session_id) && !(entry.id === activeId && archiveState.status === "archived"))
    const entries = visibleEntries.map(entry => ({ id: entry.id, title: withOverride(entry.id, entry.title) }))
    return lifecycleIdentity.admitted && activeId !== null && !activeInList && activeHasContent && (preview || archiveState.synthetic || (unscopedBoundary && archiveState.status === "unarchived"))
      ? [{ id: activeId, title: withOverride(activeId, activeTitle ?? conversationTitle(activeMessages ?? [])), ...(archiveState.status === "unconfirmed" ? { submissionUnconfirmed: true } : {}) }, ...entries]
      : entries
  }, [activeId, activeInList, activeHasContent, lifecycleIdentity, sessionList.entries, activeMessages, activeTitle, titleOverrides, postReceiptPage, archiveReceipt, archiveState.status, archiveState.synthetic, preview, unscopedBoundary])

  // run 收尾（streaming→idle 落沿）即刷新清单：首条消息落库后新会话进服务端列表，标题也随之更新。
  const observedRunRef = useRef<{ identity: typeof lifecycleIdentity; streaming: boolean } | null>(null)
  useEffect(() => {
    // Navigation is not a run-completed event. Preserve the last observation
    // until this exact scope's engine is available again, and never compare
    // an old subject/scope's stream against another lifecycle's idle state.
    if (!observeRunStatus) return
    const previous = observedRunRef.current
    if (previous?.identity === lifecycleIdentity && previous.streaming && !isStreaming) {
      requestListRefresh()
    }
    observedRunRef.current = { identity: lifecycleIdentity, streaming: isStreaming }
  }, [isStreaming, lifecycleIdentity, observeRunStatus, requestListRefresh])

  const refresh = useCallback(() => {
    requestListRefresh()
  }, [requestListRefresh])

  const deleteFlight = useRef<{ id: string; lifecycle: LifecycleToken; promise: Promise<boolean> } | null>(null)
  const deleteConversation = useCallback((id: string): Promise<boolean> => {
    const lifecycle = lifecycleRef.current
    if (!lifecycle?.active) return Promise.resolve(false)
    const existing = deleteFlight.current
    if (existing?.lifecycle === lifecycle) return existing.id === id ? existing.promise : Promise.resolve(false)
    const controller = new AbortController()
    lifecycle.controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), 10_000)
    const operation = engine ? engine.deleteConversation(id) : listClient.deleteSession(id, scope, controller.signal).then(() => true)
    const promise = operation.then((confirmed) => {
      if (!confirmed || !lifecycle.active || lifecycleRef.current !== lifecycle) return false
      onDeleteConfirmed?.(scope, id)
      requestListRefresh()
      return true
    }).catch(() => false).finally(() => {
      clearTimeout(timer)
      lifecycle.controllers.delete(controller)
      if (deleteFlight.current?.promise === promise) deleteFlight.current = null
    })
    deleteFlight.current = { id, lifecycle, promise }
    return promise
  }, [engine, listClient, onDeleteConfirmed, requestListRefresh, scope])

  const drainRenameQueue = useCallback((id: string, queue: RenameQueue): void => {
    if (queue.running) return
    queue.running = true
    void (async () => {
      while (queue.latest !== null) {
        const intent = queue.latest
        queue.latest = null
        if (!intent.lifecycle.active || lifecycleRef.current !== intent.lifecycle) continue
        let succeeded = false
        try {
          await listClient.renameSession(id, intent.title)
          succeeded = true
          queue.reconcileLifecycles.add(intent.lifecycle)
        } catch (error) {
          succeeded = false
          const explicitOwnerRejection = error instanceof SessionClientError
            && error.reason === "http"
            && error.code !== null
            && new Set(["title_too_long", "session_forbidden", "session_not_found"]).has(error.code)
          if (!explicitOwnerRejection) queue.reconcileLifecycles.add(intent.lifecycle)
        }
        const stillCommitted = intent.lifecycle.active && lifecycleRef.current === intent.lifecycle
        const newerQueued = queue.latest !== null
        if (newerQueued) continue
        const needsReconcile = queue.reconcileLifecycles.has(intent.lifecycle)
        queue.reconcileLifecycles.delete(intent.lifecycle)
        if (!stillCommitted) continue
        if (needsReconcile) {
          const reconcileAfter = requestListRefresh()
          setTitleOverrides((previous) => {
            const current = previous[id]
            return current?.sequence === intent.sequence && current.lifecycle === intent.lifecycle
              ? { ...previous, [id]: { ...current, reconcileAfter } }
              : previous
          })
        } else if (!succeeded) {
          setTitleOverrides((previous) => {
            const current = previous[id]
            if (current?.sequence !== intent.sequence || current.lifecycle !== intent.lifecycle) return previous
            const next = { ...previous }
            delete next[id]
            return next
          })
        }
      }
      queue.running = false
      queue.reconcileLifecycles.clear()
      if (renameQueuesRef.current.get(id) === queue) renameQueuesRef.current.delete(id)
    })()
  }, [listClient, requestListRefresh])

  // Same-session intents are serialized and collapsed to the latest queued
  // title, so an older PATCH can never commit after a newer one. The optimistic
  // title survives ACK until a genuinely post-ACK owner GET succeeds.
  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim()
    if (trimmed === "") return
    const committedLifecycle = lifecycleRef.current
    if (committedLifecycle === null || !committedLifecycle.active) return
    const sequence = ++renameSequenceRef.current
    const intent = { title: trimmed, sequence, lifecycle: committedLifecycle }
    setTitleOverrides((previous) => ({
      ...previous,
      [id]: { ...intent, reconcileAfter: null },
    }))
    const queue = renameQueuesRef.current.get(id) ?? { running: false, latest: null, reconcileLifecycles: new Set<LifecycleToken>() }
    queue.latest = intent
    renameQueuesRef.current.set(id, queue)
    drainRenameQueue(id, queue)
  }, [drainRenameQueue])

  return useMemo(() => ({
    archiveStatus: archiveState.status, archiveStateError:archiveState.error, retryArchiveState:archiveState.retry,
    conversations,
    loading: sessionList.loading,
    loadingMore: sessionList.loadingMore,
    error: sessionList.error,
    refresh,
    hasMore: sessionList.hasMore,
    loadMore: sessionList.loadMore,
    deleteConversation,
    renameConversation,
  }), [archiveState.status, archiveState.error, archiveState.retry, conversations, sessionList.loading, sessionList.loadingMore, sessionList.error, sessionList.hasMore,
    sessionList.loadMore, refresh, deleteConversation, renameConversation])
}
