"use client"

// 公共只读线程（SHARE-1）：从公共快照重建线程状态，复用 ConversationThread 渲染件——
// 无输入框、无控制面、无 HITL、无重试。deliveries 公共下载面 V1 不做，故 sessionId 传 null
// 令成果区收起（不暴露不可用的鉴权下载按钮）；files 字节端点亦不开放公共面。

import type { SessionSnapshot } from "@/contract/http"
import { stateFromSnapshot } from "@/core/hydration"
import { ConversationThread } from "@/ui/thread/conversation-thread"

const NO_STAGING: Record<string, Record<string, never>> = {}

export function SharedThread({ snapshot, brandName }: { snapshot: SessionSnapshot; brandName?: string }) {
  const thread = stateFromSnapshot(snapshot)
  return (
    <ConversationThread
      {...(brandName === undefined ? {} : { brandName })}
      // sessionId=null：成果/文件下载面不开放公共读，DeliverySection 据此收起。
      sessionId={null}
      thread={thread}
      isStreaming={false}
      isReconnecting={false}
      hasFailed={thread.runStatus === "failed"}
      canRetryPendingSubmission={false}
      creditRejected={false}
      onOpenBilling={() => {}}
      onOpenPricing={() => {}}
      onRetry={() => {}}
      mode="fast"
      stagingByRun={NO_STAGING}
      hitlRunId={null}
      controlError={null}
      showTaskTitle={false}
    />
  )
}
