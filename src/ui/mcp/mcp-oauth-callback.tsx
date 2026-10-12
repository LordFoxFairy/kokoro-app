"use client"

import { useEffect, useMemo, useState } from "react"

import { createHubClient, type HubClient } from "@/hub/client"
import type { McpOAuthCallbackPayload } from "./mcp-oauth-callback-payload"

type CallbackState = "completing" | "failed"

export function McpOAuthCallback({ payload, client, onComplete }: { payload: McpOAuthCallbackPayload | undefined; client?: HubClient; onComplete?: () => void }) {
  const [state, setState] = useState<CallbackState>("completing")
  const hubClient = useMemo(() => client ?? createHubClient(), [client])

  useEffect(() => {
    if (payload === undefined) return
    let active = true
    void hubClient.completeMcpConnectorAuthorization(payload).then(
      () => {
        if (!active) return
        if (onComplete !== undefined) onComplete()
        else window.location.replace("/app/plugins")
      },
      () => { if (active) setState("failed") },
    )
    return () => { active = false }
  }, [hubClient, onComplete, payload])

  if (payload === undefined || state === "failed") {
    return <main><h1>连接器授权未完成</h1><p>授权已取消、已过期或无法验证。</p><a href="/app/plugins">返回连接器</a></main>
  }
  return <main aria-busy="true"><h1>正在完成连接器授权</h1><p>请稍候。</p></main>
}
