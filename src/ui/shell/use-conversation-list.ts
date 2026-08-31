"use client"

// 会话清单 controller（SESS-LIST / CONV-UX）：服务端水合清单 + 乐观标题覆写 + 新建/切换/删除/重命名。
// 清单本体来自 session GET /sessions（换浏览器见同列表），localStorage 不再作真源；新建/切换/删除/
// 开跑收尾后 refresh 重取首页。活跃会话若未在服务端清单出现（新建未落库/未及刷新）合成置顶项不消失。

import { useCallback, useEffect, useRef, useState } from "react"

import { conversationTitle } from "@/core/conversations"
import type { EngineSnapshot } from "@/engine/machine"
import type { SessionEngine } from "@/engine/machine"
import { useSessionList } from "@/ui/rail/use-session-list"

import { browserListClient } from "./page-clients"
import { DIRECT_SESSION_SCOPE, type SessionScope } from "@/engine/session-scope"

type Thread = EngineSnapshot["thread"]

type ConversationEntry = { id: string; title: string }

export type ConversationListController = {
  conversations: ConversationEntry[]
  loading: boolean
  loadingMore: boolean
  error: boolean
  refresh: () => void
  hasMore: boolean
  loadMore: () => void
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  startNewChat: () => void
}

export function useConversationList(params: {
  engine: SessionEngine | null
  preview?: boolean
  activeId: string | null
  thread: Thread
  isStreaming: boolean
  focusComposer: () => void
  scope?: SessionScope
}): ConversationListController {
  const { engine, preview = false, activeId, thread, isStreaming, focusComposer, scope = DIRECT_SESSION_SCOPE } = params

  const [listRefresh, setListRefresh] = useState(0)
  const listClient = browserListClient({ preview })
  const sessionList = useSessionList(listClient, listRefresh, scope)
  // 会话重命名乐观覆写：改题即刻反映，服务端回执前先展示新题；失败回滚（删除覆写）。成功后覆写与
  // 服务端清单最终一致（值相同，展示无差），故无需额外对账 effect。
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({})
  const withOverride = (id: string, title: string): string => titleOverrides[id] ?? title

  // 当前活跃会话若尚未在服务端清单出现：仅在它已有真实内容时合成置顶项。
  // 空工作区不应在「最近」里出现一个没有任何历史的“新对话”行；这会让
  // 首屏看起来像已经有一条任务，也不符合 Manus/Codex 的空工作台语义。
  const activeInList = activeId !== null && sessionList.entries.some((entry) => entry.id === activeId)
  const activeHasContent = thread.messages.length > 0 || Boolean(thread.meta?.title?.trim())
  const conversations =
    activeId !== null && !activeInList && activeHasContent
      ? [
          { id: activeId, title: withOverride(activeId, thread.meta?.title ?? conversationTitle(thread.messages)) },
          ...sessionList.entries.map((entry) => ({ id: entry.id, title: withOverride(entry.id, entry.title) })),
        ]
      : sessionList.entries.map((entry) => ({ id: entry.id, title: withOverride(entry.id, entry.title) }))

  // run 收尾（streaming→idle 落沿）即刷新清单：首条消息落库后新会话进服务端列表，标题也随之更新。
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setListRefresh((n) => n + 1)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  const startNewChat = useCallback(() => {
    // 不清 draft：newConversation 换 activeId 后，草稿 controller 会加载新会话自己的草稿。
    engine?.newConversation()
    focusComposer()
  }, [engine, focusComposer])

  const refresh = useCallback(() => {
    setListRefresh((n) => n + 1)
  }, [])

  const selectConversation = useCallback(
    (id: string) => {
      // 不清 draft：切 activeId 后草稿 controller 加载目标会话草稿（切走的草稿已落盘保留）。
      engine?.openConversation(id)
      focusComposer()
    },
    [engine, focusComposer],
  )

  const deleteConversation = useCallback(
    (id: string) => {
      engine?.deleteConversation(id)
      // 软删后重取清单：服务端软删项即刻不出（本地乐观移除由引擎处理）。
      setListRefresh((n) => n + 1)
    },
    [engine],
  )

  // 会话重命名（CONV-UX）：乐观置题 → PATCH /sessions/{id}/title；成功重取清单对账，失败回滚覆写。
  // 空题/未变化直接忽略（不发请求）。长度上限由端点收口（超 256 → 422 → 回滚）。
  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim()
    if (trimmed === "") return
    setTitleOverrides((prev) => ({ ...prev, [id]: trimmed }))
    void listClient
      .renameSession(id, trimmed)
      .then(() => {
        setListRefresh((n) => n + 1)
      })
      .catch(() => {
        setTitleOverrides((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
      })
  }, [listClient])

  return {
    conversations,
    loading: sessionList.loading,
    loadingMore: sessionList.loadingMore,
    error: sessionList.error,
    refresh,
    hasMore: sessionList.hasMore,
    loadMore: sessionList.loadMore,
    selectConversation,
    deleteConversation,
    renameConversation,
    startNewChat,
  }
}
