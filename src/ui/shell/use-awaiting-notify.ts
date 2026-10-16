"use client"

// 跨会话待批可见性 controller（HITL-NOTIFY）：活跃会话进入 waiting 即登记注册表、离开即销账；
// 切走后活跃会话变了但注册表保留原会话待批徽标（单活跃流下这是唯一跨会话来源）。
// 标签页 title 前缀：任一会话待批即 ●+计数，切走仍可见「有事等你」；系统投递由真实任务事件订阅独立负责。

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useSyncExternalStore } from "react"

import { useT } from "@/i18n/context"
import type { SessionEngine } from "@/engine/engine-types"
import { DEFAULT_WEB_TITLE } from "@/config/brand"
import { readAwaiting, serverAwaiting, resetAwaiting, setAwaiting, subscribeAwaiting } from "@/ui/hitl/awaiting-store"

type Translate = ReturnType<typeof useT>

export function useAwaitingNotify(
  activeId: string | null,
  machinePhase: string,
  t: Translate,
  brandName?: string,
  identity = "anonymous",
  engine?: SessionEngine | null,
): ReadonlySet<string> {
  const awaitingIds = useSyncExternalStore(subscribeAwaiting, readAwaiting, serverAwaiting)
  const previousResource = useRef<{ identity: string; engine: SessionEngine | null | undefined } | null>(null)
  const retiredProjection = useRef<{ activeId: string | null; phase: string } | null>(null)
  const currentProjection = useEffectEvent(() => ({ activeId, phase: machinePhase }))
  useLayoutEffect(() => {
    const previous = previousResource.current
    if (previous && previous.identity !== identity && previous.engine === engine) retiredProjection.current = currentProjection()
    else retiredProjection.current = null
    previousResource.current = { identity, engine }
    resetAwaiting()
    return resetAwaiting
  }, [identity, engine])
  useEffect(() => {
    if (activeId === null) {
      return
    }
    const retired = retiredProjection.current
    if (retired && retired.activeId === activeId && retired.phase === machinePhase) return
    retiredProjection.current = null
    const isAwaiting = machinePhase === "waiting"
    setAwaiting(activeId, isAwaiting)
  }, [activeId, machinePhase, t, identity, engine])

  useEffect(() => {
    // Runtime skin owns the browser title too; do not leak the default product
    // name into a separately branded site.
    const baseTitle = brandName ? `${brandName} Web` : DEFAULT_WEB_TITLE
    document.title = awaitingIds.size > 0 ? `● (${awaitingIds.size}) ${baseTitle}` : baseTitle
    return () => { document.title = baseTitle }
  }, [awaitingIds, brandName])

  return awaitingIds
}
