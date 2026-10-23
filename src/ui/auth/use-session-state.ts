"use client"

// Product Session 是 HttpOnly；GET 获取只读投影，可见页周期消费现有 CSRF POST 续期。
// authenticated 或显式本地 preview → pass；anonymous → anonymous；探针未回前 checking。
// preview 只由非生产环境的显式开关启用；网络、超时与畸形响应进入显式故障态，避免 fail-open 或误跳登录。

import { useCallback, useEffect, useRef, useState } from "react"

import { refreshProductSession } from "@/ui/auth/product-auth-client"

import {
  AUTH_INDEX_SUBJECT_KEY,
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
type SessionObservation = { indexSubject: string | null | undefined; retired: boolean }
type SharedSessionCheck = { observation: SessionObservation; result: Promise<ResolvedSession> }
let sessionProbeInflight: SharedSessionCheck | null = null
let lastIdentityStorageEvent: StorageEvent | null = null
let sessionProbeController: AbortController | null = null
let admittedSubject: string | null = null
let nextRefreshAt: number | null = null
// An uncertain mutation is never replayed. Only a trusted current-cookie read
// can establish a new, future renewal window.
let refreshUnconfirmed = false
let refreshSubject: string | null = null
let documentSuspended = false

function requestSessionMode(indexSubject: string | null | undefined): SharedSessionCheck {
  if (sessionProbeInflight !== null) return sessionProbeInflight
  const observation = { indexSubject, retired: false }
  if (documentSuspended) return { observation, result: Promise.resolve({ mode: "unavailable", subject: null }) }

  const controller = new AbortController()
  sessionProbeController = controller
  const { signal } = controller
  const assertCurrent = (): void => {
    signal.throwIfAborted()
    if (observation.retired) throw new Error("Product session probe retired")
  }
  let abort!: () => void
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason ?? new Error("Product session probe aborted"))
    signal.addEventListener("abort", abort, { once: true })
  })
  const timer = window.setTimeout(() => controller.abort(), 10_000)
  // Both abort-aware fetch and an uncooperative late body must settle within
  // the same budget. Every dispatch checks the signal; losing work cannot POST.
  const work = Promise.resolve().then(async (): Promise<ResolvedSession> => {
    assertCurrent()
    const subjectAtProbeStart = observation.indexSubject
    const recovering = refreshUnconfirmed
    type ReadSession = ResolvedSession | { mode: "refresh-required"; subject: string }
    const read = async (): Promise<ReadSession> => {
      assertCurrent()
      const response = await fetch("/api/auth/session", { cache: "no-store", signal })
      assertCurrent()
      if (response.status !== 200) return { mode: "unavailable", subject: null }
      const raw: unknown = await response.json()
      assertCurrent()
      if (typeof raw !== "object" || raw === null) return { mode: "unavailable", subject: null }
      const authenticated = (raw as { authenticated?: unknown }).authenticated
      const subject = (raw as { subject?: unknown }).subject
      if (authenticated === false) {
        const value = raw as Record<string, unknown>
        if (Object.keys(value).length === 1) return { mode: refreshUnconfirmed ? "unavailable" : "anonymous", subject: null }
        if (Object.keys(value).length === 4 && value.refresh_required === true && typeof subject === "string" && subject.trim() !== "" &&
          typeof value.expires_at === "number" && Number.isFinite(value.expires_at) && value.expires_at > Date.now())
          return { mode: "refresh-required", subject }
        return { mode: "unavailable", subject: null }
      }
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
    let initial: ReadSession | undefined
    if (!due) {
      initial = await read()
      if (recovering) return initial.mode === "authenticated" && initial.subject === refreshSubject
        ? { ...initial, renewalConfirmed: true } : { mode: "unavailable", subject: null }
      if (initial.mode !== "authenticated" && initial.mode !== "refresh-required") return initial
      if (!cold && initial.mode === "authenticated") return initial
      if (!cold && initial.subject !== admittedSubject) return { mode: "unavailable", subject: null }
      if (subjectAtProbeStart === undefined) return { mode: "unavailable", subject: null }
      const currentIndex = readBrowserAuthIndexSubject()
      if (currentIndex !== subjectAtProbeStart && currentIndex !== initial.subject) {
        return { mode: "unavailable", subject: null }
      }
      expectedSubject = initial.subject
    }
    if (cold || due || initial?.mode === "refresh-required") {
      nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS
      const refreshed = await refreshProductSession(signal, () => {
        assertCurrent()
        refreshUnconfirmed = true
        refreshSubject = expectedSubject
      })
      assertCurrent()
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
    return { mode: "unavailable", subject: null }

  })
  const request = Promise.race([work, aborted])
    .catch((): ResolvedSession => ({ mode: "unavailable", subject: null }))
    .finally(() => {
      window.clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      if (sessionProbeController === controller) sessionProbeController = null
    })
  const shared = { observation, result: request }
  sessionProbeInflight = shared
  const clear = (): void => {
    if (sessionProbeInflight === shared) sessionProbeInflight = null
  }
  void request.then(clear, clear)
  return shared
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
    // A browser return commonly emits focus and visibilitychange in the same
    // turn. They describe one check, separate from the admitted data lifecycle.
    let pendingCheck: SessionObservation | null = null
    let recoveryAttempt = 0
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined
    const recoveryDelays = [1_000, 3_000]
    const scheduleRecovery = () => {
      if (!live || recoveryTimer !== undefined || recoveryAttempt >= recoveryDelays.length) return
      recoveryTimer = setTimeout(() => {
        recoveryTimer = undefined
        if (document.visibilityState === "visible" && !documentSuspended) check()
      }, recoveryDelays[recoveryAttempt++])
    }
    const retireChangedSubject = (): string | null | undefined => {
      let indexSubject: string | null | undefined
      try { indexSubject = readBrowserAuthIndexSubject() }
      catch { indexSubject = undefined }
      if (pendingCheck !== null && indexSubject !== pendingCheck.indexSubject) pendingCheck.retired = true
      if (sessionProbeInflight !== null && indexSubject !== sessionProbeInflight.observation.indexSubject)
        sessionProbeInflight.observation.retired = true
      // A cross-tab identity change retires data even while a probe is pending.
      // The browser marker can revoke existing admission, never establish it.
      if (admittedSubject !== null && indexSubject !== admittedSubject) {
        browserConversationMoveCoordinator().suspendVerifiedSubject(admittedSubject)
        setProbe((current) => ({ ...current, projectReadBoundary: {
          ...current.projectReadBoundary, admitted: false, generation: generationRef.current,
        } }))
      }
      return indexSubject
    }
    const check = (): void => {
      const indexSubject = retireChangedSubject()
      if (pendingCheck !== null) return
      const request = requestSessionMode(indexSubject)
      const checking = request.observation
      pendingCheck = checking
      const currentGeneration = ++generationRef.current
      // Probe epochs fence asynchronous results; data generations change only
      // on actual admission/retirement. A routine check does not invalidate
      // every business read. Each request still has server-side authorization.
      setProbe((current) => ({ ...current, requestPending: true,
        projectReadBoundary: current.projectReadBoundary.admitted && current.projectReadBoundary.subject === indexSubject
          ? current.projectReadBoundary
          : { admitted: false, subject: current.projectReadBoundary.subject, generation: currentGeneration },
      }))
      void request.result.then((resolved) => {
        if (!live || generationRef.current !== currentGeneration) return
        pendingCheck = null
        if (resolved.mode === "unavailable" || checking.retired) {
          scheduleRecovery()
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
              setProbe({ state: "checking", mode: "checking", unavailable: false, requestPending: false, retry,
                projectReadBoundary: { admitted: false, subject: null, generation: currentGeneration } })
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
        clearTimeout(recoveryTimer)
        recoveryTimer = undefined
        recoveryAttempt = 0
        setProbe((current) => ({
          state: resolved.mode === "authenticated" ? "pass" : "anonymous",
          mode: resolved.mode === "authenticated" ? "authenticated" : "checking",
          projectReadBoundary: resolved.mode === "authenticated" && current.projectReadBoundary.admitted && current.projectReadBoundary.subject === resolved.subject
            ? current.projectReadBoundary
            : { admitted: resolved.mode === "authenticated", subject: resolved.subject, generation: currentGeneration },
          unavailable: false,
          requestPending: false,
          retry,
        }))
      })
    }
    check()
    // A hidden tab does not rotate credentials. A due visible return renews
    // before an expired-access GET can misclassify the still-valid session.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") check()
    }
    const onStorage = (event: StorageEvent): void => {
      // Other tabs also save drafts and preferences; those are not auth events.
      if (event.storageArea !== window.localStorage || (event.key !== null && event.key !== AUTH_INDEX_SUBJECT_KEY)) return
      // Storage events are queued: current storage may already be A after A→B→A.
      // Revoke the shared observation so late subscribers cannot accept it either.
      const changed = event.key === null || event.oldValue !== event.newValue
      if (changed) {
        // Each hook receives the same event. Retire only the check preceding
        // that event, not the fresh check already started by another listener.
        if (lastIdentityStorageEvent !== event) {
          lastIdentityStorageEvent = event
          if (sessionProbeInflight !== null) sessionProbeInflight.observation.retired = true
        }
        browserConversationMoveCoordinator().suspendVerifiedSubject(admittedSubject)
        setProbe((current) => ({ ...current, projectReadBoundary: {
          ...current.projectReadBoundary, admitted: false, generation: generationRef.current,
        } }))
      }
      if (retireChangedSubject() !== admittedSubject || changed) onVisible()
    }
    const onPageHide = (): void => {
      documentSuspended = true
      pendingCheck = null
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
    window.addEventListener("online", onVisible)
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("storage", onStorage)
    const timer = setInterval(onVisible, REFRESH_INTERVAL_MS)
    return () => {
      live = false
      window.removeEventListener("online", onVisible)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("storage", onStorage)
      clearInterval(timer)
      clearTimeout(recoveryTimer)
    }
  }, [retry, retryGeneration, serverUnavailable])

  return probe
}

export function useSessionState(): SessionState {
  return useSessionProbe().state
}
