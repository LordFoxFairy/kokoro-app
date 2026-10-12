"use client"

import { useEffect, useMemo, useState } from "react"

import { createHubClient, type HubClient } from "@/hub/client"

type CallbackPayload = { state: string; code: string } | { state: string; error: string }
type CallbackState = "completing" | "failed"

function onlyParameter(parameters: URLSearchParams, name: string): string | undefined {
  const values = parameters.getAll(name)
  return values.length === 1 && values[0] !== "" ? values[0] : undefined
}

/** Accept exactly the standard OAuth callback XOR body; never retain it in app state. */
export function parseMcpOAuthCallback(search: string): CallbackPayload | undefined {
  const parameters = new URLSearchParams(search)
  const state = onlyParameter(parameters, "state")
  const code = onlyParameter(parameters, "code")
  const error = onlyParameter(parameters, "error")
  if (state === undefined || (code === undefined && error === undefined) || (code !== undefined && error !== undefined)) return undefined
  return code === undefined ? { state, error: error as string } : { state, code }
}

export function McpOAuthCallback({ payload, client, onComplete }: { payload: CallbackPayload | undefined; client?: HubClient; onComplete?: () => void }) {
  const [state, setState] = useState<CallbackState>("completing")
  const hubClient = useMemo(() => client ?? createHubClient(), [client])

  useEffect(() => {
    if (payload === undefined) return
    let active = true
    void hubClient.completeMcpSelfConnectorAuthorization(payload).then(
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
