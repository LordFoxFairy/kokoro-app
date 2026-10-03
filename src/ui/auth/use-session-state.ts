"use client"

// Product Session 是 HttpOnly；浏览器通过正式 GET /api/auth/session 获取只读在线投影。
// authenticated 或显式本地 preview → pass；anonymous → anonymous；探针未回前 checking。
// preview 只由非生产环境的显式开关启用；网络、超时与畸形响应进入显式故障态，避免 fail-open 或误跳登录。

import { useCallback, useEffect, useRef, useState } from "react"

import { admitBrowserAuthSessionIndexes, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"

/** Local read lifecycle only; BFF still authorizes every Project request. */
export type ProjectReadBoundary = { admitted: boolean; subject: string | null; generation: number }

export type SessionState = "checking" | "pass" | "anonymous" | "unavailable"
export type SessionProbe = {
  state: SessionState
  mode: "checking" | "preview" | "authenticated"
  projectReadBoundary: ProjectReadBoundary
  unavailable: boolean
  requestPending: boolean
  retry: () => void
}

// Preview mode is an explicit local-only opt-in. It is safe to start in the
// pass state because no auth-configured server is present in this mode; the
// production bundle never enables this branch and still waits for the BFF
// session decision before mounting the workbench.
const EXPLICIT_PREVIEW = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SESSION_PREVIEW === "1"

type ResolvedSession =
  | { mode: "authenticated"; subject: string; subjectAtProbeStart: string | null | undefined }
  | { mode: "anonymous"; subject: null }
  | { mode: "unavailable"; subject: null }

let sessionProbeInflight: Promise<ResolvedSession> | null = null
let admittedSubject: string | null = null

function requestSessionMode(): Promise<ResolvedSession> {
  if (sessionProbeInflight !== null) return sessionProbeInflight

  // Keep the request shared across Strict Mode effect replay, focus events and
  // concurrent shell mounts. The promise is cleared after settlement so a
  // later visibility check still observes session expiry.
  const request = Promise.resolve()
    .then(async () => {
      let subjectAtProbeStart: string | null | undefined
      try { subjectAtProbeStart = readBrowserAuthIndexSubject() }
      catch { subjectAtProbeStart = undefined }
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
        if (response.status !== 200) return { mode: "unavailable" as const, subject: null }
        const raw: unknown = await response.json()
        if (typeof raw !== "object" || raw === null) return { mode: "unavailable" as const, subject: null }
        const authenticated = (raw as { authenticated?: unknown }).authenticated
        if (authenticated === false) return { mode: "anonymous" as const, subject: null }
        const subject = (raw as { subject?: unknown }).subject
        if (authenticated !== true || typeof subject !== "string" || subject.trim() === "") {
          return { mode: "unavailable" as const, subject: null }
        }
        return { mode: "authenticated" as const, subject, subjectAtProbeStart }
      } finally {
        window.clearTimeout(timer)
      }
    })
    .catch(() => ({ mode: "unavailable" as const, subject: null }))
  sessionProbeInflight = request
  const clear = (): void => {
    if (sessionProbeInflight === request) sessionProbeInflight = null
  }
  void request.then(clear, clear)
  return request
}

export function useSessionProbe(): SessionProbe {
  const [retryGeneration, setRetryGeneration] = useState(0)
  const generationRef = useRef(0)
  const [probe, setProbe] = useState<SessionProbe>(() => ({
    state: EXPLICIT_PREVIEW ? "pass" : "checking",
    mode: EXPLICIT_PREVIEW ? "preview" : "checking",
    projectReadBoundary: { admitted: false, subject: null, generation: 0 },
    unavailable: false,
    requestPending: false,
    retry: () => undefined,
  }))
  const retry = useCallback(() => {
    setProbe((current) => current.mode === "authenticated"
      ? { ...current, requestPending: true }
      : { ...current, state: "checking", unavailable: false, requestPending: true })
    setRetryGeneration((current) => current + 1)
  }, [])

  useEffect(() => {
    if (EXPLICIT_PREVIEW) return
    let live = true
    const check = (): void => {
      const currentGeneration = ++generationRef.current
      // Preserve the mounted Chat while revoking Project reads, even when a
      // recheck returns the same subject. This generation never goes on wire.
      setProbe((current) => ({ ...current, requestPending: true, projectReadBoundary: {
        admitted: false,
        subject: current.projectReadBoundary.subject,
        generation: currentGeneration,
      } }))
      void requestSessionMode().then((resolved) => {
        if (!live || generationRef.current !== currentGeneration) return
        if (resolved.mode === "unavailable") {
          setProbe((current) => current.mode === "authenticated"
            ? { ...current, unavailable: true, requestPending: false, retry,
              projectReadBoundary: { admitted: false, subject: current.projectReadBoundary.subject, generation: currentGeneration } }
            : { state: "unavailable", mode: "checking", unavailable: true, requestPending: false, retry,
              projectReadBoundary: { admitted: false, subject: null, generation: currentGeneration } })
          return
        }
        if (resolved.mode === "authenticated") {
          try {
            if (resolved.subjectAtProbeStart === undefined ||
              !admitBrowserAuthSessionIndexes(resolved.subject, resolved.subjectAtProbeStart)) {
              setProbe((current) => current.mode === "authenticated"
                ? { ...current, unavailable: true, requestPending: false, retry,
                  projectReadBoundary: { admitted: false, subject: current.projectReadBoundary.subject, generation: currentGeneration } }
                : { state: "unavailable", mode: "checking", unavailable: true, requestPending: false, retry,
                  projectReadBoundary: { admitted: false, subject: null, generation: currentGeneration } })
              return
            }
            if (admittedSubject === null) {
              admittedSubject = resolved.subject
            } else if (admittedSubject !== resolved.subject) {
              window.location.reload()
              return
            }
          } catch {
            setProbe((current) => current.mode === "authenticated"
              ? { ...current, unavailable: true, requestPending: false, retry,
                projectReadBoundary: { admitted: false, subject: current.projectReadBoundary.subject, generation: currentGeneration } }
              : { state: "unavailable", mode: "checking", unavailable: true, requestPending: false, retry,
                projectReadBoundary: { admitted: false, subject: null, generation: currentGeneration } })
            return
          }
        }
        setProbe({
          state: resolved.mode === "authenticated" ? "pass" : "anonymous",
          mode: resolved.mode === "authenticated" ? "authenticated" : "checking",
          projectReadBoundary: { admitted: resolved.mode === "authenticated", subject: resolved.subject, generation: currentGeneration },
          unavailable: false,
          requestPending: false,
          retry,
        })
      })
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
  }, [retry, retryGeneration])

  return probe
}

export function useSessionState(): SessionState {
  return useSessionProbe().state
}
