"use client"

// Product Session 是 HttpOnly；浏览器通过正式 GET /api/auth/session 获取只读在线投影。
// authenticated 或显式本地 preview → pass；anonymous → anonymous；探针未回前 checking。
// preview 只由非生产环境的显式开关启用，网络失败按匿名处理，避免生产环境 fail-open。

import { useEffect, useState } from "react"

export type SessionState = "checking" | "pass" | "anonymous"
export type SessionProbe = {
  state: SessionState
  mode: "checking" | "preview" | "authenticated"
}

// Preview mode is an explicit local-only opt-in. It is safe to start in the
// pass state because no auth-configured server is present in this mode; the
// production bundle never enables this branch and still waits for the BFF
// session decision before mounting the workbench.
const EXPLICIT_PREVIEW = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SESSION_PREVIEW === "1"

type ResolvedSessionMode = "authenticated" | "preview" | "anonymous"

let sessionProbeInflight: Promise<ResolvedSessionMode> | null = null

function requestSessionMode(): Promise<ResolvedSessionMode> {
  if (sessionProbeInflight !== null) return sessionProbeInflight

  // Keep the request shared across Strict Mode effect replay, focus events and
  // concurrent shell mounts. The promise is cleared after settlement so a
  // later visibility check still observes session expiry.
  const request = Promise.resolve()
    .then(async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" })
      if (!response.ok) return "anonymous" as const
      const raw: unknown = await response.json()
      return typeof raw === "object" && raw !== null && (raw as { authenticated?: unknown }).authenticated === true
        ? "authenticated"
        : "anonymous"
    })
    .catch(() => "anonymous" as const)
  sessionProbeInflight = request
  const clear = (): void => {
    if (sessionProbeInflight === request) sessionProbeInflight = null
  }
  void request.then(clear, clear)
  return request
}

function probeFromMode(mode: ResolvedSessionMode): SessionProbe {
  if (mode === "anonymous") {
    return { state: "anonymous", mode: "checking" }
  }
  return { state: "pass", mode }
}

export function useSessionProbe(): SessionProbe {
  const [probe, setProbe] = useState<SessionProbe>(() =>
    EXPLICIT_PREVIEW ? { state: "pass", mode: "preview" } : { state: "checking", mode: "checking" },
  )

  useEffect(() => {
    if (EXPLICIT_PREVIEW) return
    let live = true
    const check = (): void => {
      void requestSessionMode().then((resolved) => live && setProbe(probeFromMode(resolved)))
    }
    check()
    // 聚焦、重新可见和每两分钟重查在线 Product Session；过期或撤销后转匿名闸，
    // 避免工作台继续展示失效会话并让后续 API 401 裸露给用户。
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        check()
      }
    }
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", onVisible)
    const timer = setInterval(onVisible, 120_000)
    return () => {
      live = false
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", onVisible)
      clearInterval(timer)
    }
  }, [])

  return probe
}

export function useSessionState(): SessionState {
  return useSessionProbe().state
}
