"use client"

// 跨会话待批可见性 controller（HITL-NOTIFY）：活跃会话进入 awaiting-hitl 即登记注册表、离开即销账；
// 切走后活跃会话变了但注册表保留原会话待批徽标（单活跃流下这是唯一跨会话来源）。
// 标签页 title 前缀：任一会话待批即 ●+计数，切走仍可见「有事等你」；新进入待批才弹系统通知。

import { useEffect, useRef, useSyncExternalStore } from "react"

import { useT } from "@/i18n/context"
import { DEFAULT_WEB_TITLE } from "@/config/brand"
import { notifyAwaiting } from "@/ui/hitl/awaiting-notify"
import { readAwaiting, serverAwaiting, setAwaiting, subscribeAwaiting } from "@/ui/hitl/awaiting-store"

type Translate = ReturnType<typeof useT>

export function useAwaitingNotify(
  activeId: string | null,
  machinePhase: string,
  t: Translate,
  brandName?: string,
): ReadonlySet<string> {
  const awaitingIds = useSyncExternalStore(subscribeAwaiting, readAwaiting, serverAwaiting)
  const prevAwaitingRef = useRef(false)
  useEffect(() => {
    if (activeId === null) {
      return
    }
    const isAwaiting = machinePhase === "awaiting-hitl"
    setAwaiting(activeId, isAwaiting)
    // 新进入待批（非重渲染重复）才弹系统通知：拒绝/不支持静默。
    if (isAwaiting && !prevAwaitingRef.current) {
      notifyAwaiting(t("hitl.notifyTitle"), t("hitl.notifyBody"))
    }
    prevAwaitingRef.current = isAwaiting
  }, [activeId, machinePhase, t])

  useEffect(() => {
    // Runtime skin owns the browser title too; do not leak the default product
    // name into a separately branded site.
    const baseTitle = brandName ? `${brandName} Web` : DEFAULT_WEB_TITLE
    document.title = awaitingIds.size > 0 ? `● (${awaitingIds.size}) ${baseTitle}` : baseTitle
  }, [awaitingIds, brandName])

  return awaitingIds
}
