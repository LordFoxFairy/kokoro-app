"use client"

// Product Session 是 HttpOnly；GET 获取只读投影，可见页周期消费现有 CSRF POST 续期。
// authenticated 或显式本地 preview → pass；anonymous → anonymous；探针未回前 checking。
// preview 只由非生产环境的显式开关启用；网络、超时与畸形响应进入显式故障态，避免 fail-open 或误跳登录。

import { useCallback, useEffect, useRef, useState } from "react"

import { refreshProductSession } from "@/ui/auth/product-auth-client"

import {
  admitBrowserAuthSessionIndexes,
  browserConversationMoveCoordinator,
  readBrowserAuthIndexSubject,
} from "@/ui/shell/page-clients"

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
  | { mode: "authenticated"; subject: string; subjectAtProbeStart: string | null | undefined; renewalConfirmed: boolean }
  | { mode: "anonymous"; subject: null }
  | { mode: "unavailable"; subject: null }

const REFRESH_INTERVAL_MS = 120_000
let sessionProbeInflight: Promise<ResolvedSession> | null = null
let sessionProbeController: AbortController | null = null
let admittedSubject: string | null = null
let nextRefreshAt: number | null = null
// An uncertain mutation is never replayed. Only a trusted current-cookie read
// can establish a new, future renewal window.
let refreshUnconfirmed = false
let refreshSubject: string | null = null
let documentSuspended = false

function requestSessionMode(): Promise<ResolvedSession> {
  if (sessionProbeInflight !== null) return sessionProbeInflight
  if (documentSuspended) return Promise.resolve({ mode: "unavailable", subject: null })

  const controller = new AbortController()
  sessionProbeController = controller
  const { signal } = controller
  let abort!: () => void
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason ?? new Error("Product session probe aborted"))
    signal.addEventListener("abort", abort, { once: true })
  })
  const timer = window.setTimeout(() => controller.abort(), 10_000)
  // Both abort-aware fetch and an uncooperative late body must settle within
  // the same budget. Every dispatch checks the signal; losing work cannot POST.
  const work = Promise.resolve().then(async (): Promise<ResolvedSession> => {
    signal.throwIfAborted()
    let subjectAtProbeStart: string | null | undefined
    try { subjectAtProbeStart = readBrowserAuthIndexSubject() }
    catch { subjectAtProbeStart = undefined }
    const recovering = refreshUnconfirmed
    const read = async (): Promise<ResolvedSession> => {
      signal.throwIfAborted()
      const response = await fetch("/api/auth/session", { cache: "no-store", signal })
      signal.throwIfAborted()
      if (response.status !== 200) return { mode: "unavailable", subject: null }
      const raw: unknown = await response.json()
      signal.throwIfAborted()
      if (typeof raw !== "object" || raw === null) return { mode: "unavailable", subject: null }
      const authenticated = (raw as { authenticated?: unknown }).authenticated
      if (authenticated === false) return { mode: refreshUnconfirmed ? "unavailable" : "anonymous", subject: null }
      const subject = (raw as { subject?: unknown }).subject
      if (authenticated !== true || typeof subject !== "string" || subject.trim() === "") {
        return { mode: "unavailable", subject: null }
      }
      return { mode: "authenticated", subject, subjectAtProbeStart, renewalConfirmed: false }
    }
    const cold = admittedSubject === null && !recovering
    const due = admittedSubject !== null && subjectAtProbeStart === admittedSubject &&
      document.visibilityState === "visible" && !recovering &&
      nextRefreshAt !== null && Date.now() >= nextRefreshAt
    let expectedSubject = admittedSubject
    if (cold) {
      // A cold document may inherit an access token with only seconds left.
      // Read first, then renew within this same budget before mounting Runtime.
      const initial = await read()
      if (initial.mode !== "authenticated") return initial
      if (subjectAtProbeStart === undefined) return { mode: "unavailable", subject: null }
      const currentIndex = readBrowserAuthIndexSubject()
      if (currentIndex !== subjectAtProbeStart && currentIndex !== initial.subject) {
        return { mode: "unavailable", subject: null }
      }
      expectedSubject = initial.subject
    }
    if (cold || due) {
      nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS
      refreshUnconfirmed = true
      refreshSubject = expectedSubject
      const refreshed = await refreshProductSession(signal)
      signal.throwIfAborted()
      if (refreshed.mode === "authenticated") {
        if (refreshed.subject !== expectedSubject) return { mode: "unavailable", subject: null }
        return { ...refreshed, subjectAtProbeStart, renewalConfirmed: true }
      }
      // Another tab can win CAS. Confirm only the original subject, once.
      const confirmed = await read()
      return confirmed.mode === "authenticated" && confirmed.subject === expectedSubject
        ? { ...confirmed, renewalConfirmed: true }
        : { mode: "unavailable", subject: null }
    }
    const resolved = await read()
    if (!recovering) return resolved
    return resolved.mode === "authenticated" && resolved.subject === refreshSubject
      ? { ...resolved, renewalConfirmed: true }
      : { mode: "unavailable", subject: null }

  })
  const request = Promise.race([work, aborted])
    .catch((): ResolvedSession => ({ mode: "unavailable", subject: null }))
    .finally(() => {
      window.clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      if (sessionProbeController === controller) sessionProbeController = null
    })
  sessionProbeInflight = request
  const clear = (): void => {
    if (sessionProbeInflight === request) sessionProbeInflight = null
  }
  void request.then(clear, clear)
  return request
}

export function useSessionProbe(options: Readonly<{ serverUnavailable?: boolean }> = {}): SessionProbe {
  const serverUnavailable = options.serverUnavailable === true
  const [retryGeneration, setRetryGeneration] = useState(0)
  const generationRef = useRef(0)
  const [probe, setProbe] = useState<SessionProbe>(() => ({
    state: EXPLICIT_PREVIEW ? "pass" : serverUnavailable ? "unavailable" : "checking",
    mode: EXPLICIT_PREVIEW ? "preview" : "checking",
    projectReadBoundary: { admitted: false, subject: null, generation: 0 },
    unavailable: serverUnavailable,
    requestPending: false,
    retry: () => undefined,
  }))
  const retry = useCallback(() => {
    if (serverUnavailable) return
    setProbe((current) => current.mode === "authenticated"
      ? { ...current, requestPending: true }
      : { ...current, state: "checking", unavailable: false, requestPending: true })
    setRetryGeneration((current) => current + 1)
  }, [serverUnavailable])

  useEffect(() => {
    if (EXPLICIT_PREVIEW || serverUnavailable) return
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
          browserConversationMoveCoordinator().suspendVerifiedSubject(admittedSubject)
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
              browserConversationMoveCoordinator().revokeSubject()
              window.location.reload()
              return
            }
            browserConversationMoveCoordinator().admitVerifiedSubject(resolved.subject)
            if (nextRefreshAt === null || resolved.renewalConfirmed) {
              nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS
              refreshUnconfirmed = false
              refreshSubject = null
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
        if (resolved.mode === "anonymous") {
          browserConversationMoveCoordinator().revokeSubject()
          admittedSubject = null
          nextRefreshAt = null
          refreshUnconfirmed = false
          refreshSubject = null
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
    // A hidden tab does not rotate credentials. A due visible return renews
    // before an expired-access GET can misclassify the still-valid session.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") check()
    }
    const onPageHide = (): void => {
      documentSuspended = true
      ++generationRef.current
      sessionProbeController?.abort()
      // A persisted pageshow may run before the aborted promise settles. Its
      // fresh chain is protected from the old chain's guarded finally/clear.
      sessionProbeInflight = null
      setProbe((current) => ({ ...current, requestPending: false, projectReadBoundary: {
        ...current.projectReadBoundary, admitted: false, generation: generationRef.current,
      } }))
    }
    const onPageShow = (): void => {
      documentSuspended = false
      onVisible()
    }
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", onPageShow)
    const timer = setInterval(onVisible, REFRESH_INTERVAL_MS)
    return () => {
      live = false
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", onPageShow)
      clearInterval(timer)
    }
  }, [retry, retryGeneration, serverUnavailable])

  return probe
}

export function useSessionState(): SessionState {
  return useSessionProbe().state
}
