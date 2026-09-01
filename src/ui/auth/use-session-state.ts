"use client"

// 会话态探针 hook（AUTH-P0）：httpOnly 信封浏览器读不到，须服务端 `/api/auth/session-state` 裁决。
// authenticated/preview → "pass"（放行）；anonymous → "anonymous"（挡门/落地页）；探针未回前 "checking"。
// 只有服务端明确返回 preview 才进入预览；探针网络失败按匿名处理，避免生产环境 fail-open。

import { useEffect, useState } from "react"

export type SessionState = "checking" | "pass" | "anonymous"
export type SessionProbe = { state: SessionState; mode: "checking" | "preview" | "authenticated" }

// Preview mode is an explicit local-only opt-in. It is safe to start in the
// pass state because no auth-configured server is present in this mode; the
// production bundle never enables this branch and still waits for the BFF
// session decision before mounting the workbench.
const EXPLICIT_PREVIEW = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SESSION_PREVIEW === "1"

function parseProbe(raw: unknown): "authenticated" | "preview" | "anonymous" {
  if (typeof raw === "object" && raw !== null && "state" in raw) {
    const state = (raw as { state: unknown }).state
    if (state === "authenticated" || state === "preview") {
      return state
    }
  }
  return "anonymous"
}

let sessionProbeInflight: Promise<ReturnType<typeof parseProbe>> | null = null

function requestSessionMode(): Promise<ReturnType<typeof parseProbe>> {
  if (sessionProbeInflight !== null) return sessionProbeInflight

  // Keep the request shared across Strict Mode effect replay, focus events and
  // concurrent shell mounts. The promise is cleared after settlement so a
  // later visibility check still observes session expiry.
  const request = Promise.resolve().then(async () => {
    const response = await fetch("/api/auth/session-state", { cache: "no-store" })
    if (!response.ok) return "anonymous" as const
    return parseProbe(await response.json())
  }).catch(() => "anonymous" as const)
  sessionProbeInflight = request
  const clear = (): void => {
    if (sessionProbeInflight === request) sessionProbeInflight = null
  }
  void request.then(clear, clear)
  return request
}

function probeFromMode(mode: ReturnType<typeof parseProbe>): SessionProbe {
  if (mode === "anonymous") {
    return { state: "anonymous", mode: "checking" }
  }
  return { state: "pass", mode }
}

export function useSessionProbe(): SessionProbe {
  const [probe, setProbe] = useState<SessionProbe>(() => EXPLICIT_PREVIEW
    ? { state: "pass", mode: "preview" }
    : { state: "checking", mode: "checking" })

  useEffect(() => {
    if (EXPLICIT_PREVIEW) return
    let live = true
    const check = (): void => {
      void requestSessionMode()
        .then((resolved) => live && setProbe(probeFromMode(resolved)))
    }
    check()
    // 复检会话:信封 cookie 随 magic-link TTL 过期（默认 900s），长会话会失效。聚焦/重新可见/每 2 分钟
    // 复检——过期即翻 anonymous,由页面匿名闸送回登录页,避免各处 API 401 裸报"加载失败"。
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
