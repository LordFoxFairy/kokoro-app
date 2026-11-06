"use client"

// IAM native session 是 HttpOnly；GET 读取受信安全状态，原生 rolling 由 owner 承接，浏览器不另发 refresh 或重放凭据。
// authenticated 或显式本地 preview → pass；anonymous → anonymous；探针未回前 checking。
// preview 只由非生产环境的显式开关启用；网络、超时与畸形响应进入显式故障态，避免 fail-open 或误跳登录。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { browserAuthSessionErrorSchemas, browserAuthSessionResponseSchema, type BrowserAuthSession } from "@/generated/bff-auth-session"

import type { ProductRead401, ProductReadRecheck } from "./product-read-recheck-context"

import {
  AUTH_INDEX_SUBJECT_KEY,
  admitBrowserAuthSessionIndexes,
  browserConversationMoveCoordinator,
  readBrowserAuthIndexSubject,
} from "@/ui/shell/page-clients"

/** Local read lifecycle only; BFF still authorizes every Project request. */
export type ProjectReadBoundary = {
  admitted: boolean
  subject: string | null
  generation: number
  tenant?: string
  authInvalidationHint?: string | null
}

export type SessionState = "checking" | "pass" | "anonymous" | "forbidden" | "unavailable"
export type SessionProbe = {
  state: SessionState
  mode: "checking" | "preview" | "authenticated"
  projectReadBoundary: ProjectReadBoundary
  unavailable: boolean
  requestPending: boolean
  retry: () => void
  reportReadUnauthorized: ProductReadRecheck
  readRecoveryBlocked: boolean
}

// Preview mode is an explicit local-only opt-in. It is safe to start in the
// pass state because no auth-configured server is present in this mode; the
// production bundle never enables this branch and still waits for the BFF
// session decision before mounting the workbench.
const EXPLICIT_PREVIEW = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SESSION_PREVIEW === "1"

type ResolvedSession =
  | { mode: "authenticated"; subject: string; tenant: string; subjectAtProbeStart: string | null | undefined }
  | { mode: "anonymous"; subject: null }
  | { mode: "forbidden" | "unavailable"; subject: null }

type ReadRecoveryAdmission = {
  subject: string; generation: number; admittedGeneration: number | null; retired: boolean;
  result: Promise<boolean>; settle: (accepted: boolean) => void;
}

const SESSION_CHECK_INTERVAL_MS = 120_000
const AUTH_INVALIDATION_KEY = "kokoro.web.auth-invalidation"
type SessionObservation = { indexSubject: string | null | undefined; invalidationHint: string | null | undefined; retired: boolean }
type SharedSessionCheck = { observation: SessionObservation; result: Promise<ResolvedSession> }
let sessionProbeInflight: SharedSessionCheck | null = null
let lastIdentityStorageEvent: StorageEvent | null = null
let sessionProbeController: AbortController | null = null
let admittedSubject: string | null = null
let admittedTenant: string | null = null
let documentSuspended = false

export function readBrowserInvalidationHint(): string | null | undefined {
  try { return window.localStorage.getItem(AUTH_INVALIDATION_KEY) } catch { return undefined }
}

function requestSessionMode(indexSubject: string | null | undefined, invalidationHint: string | null | undefined): SharedSessionCheck {
  if (sessionProbeInflight !== null) return sessionProbeInflight
  const observation = { indexSubject, invalidationHint, retired: false }
  if (documentSuspended) return { observation, result: Promise.resolve({ mode: "unavailable", subject: null }) }

  const controller = new AbortController()
  sessionProbeController = controller
  const { signal } = controller
  const assertCurrent = (checkInvalidation = false): void => {
    signal.throwIfAborted()
    if (observation.retired || checkInvalidation && (observation.invalidationHint === undefined || readBrowserInvalidationHint() !== observation.invalidationHint))
      throw new Error("Product session probe retired")
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
    const read = async (): Promise<ResolvedSession> => {
      assertCurrent()
      const response = await fetch("/api/auth/session", { cache: "no-store", signal })
      assertCurrent(true)
      if (response.status === 403) {
        const error=browserAuthSessionErrorSchemas[403].safeParse(await response.json())
        assertCurrent(true)
        return { mode: error.success ? "forbidden" : "unavailable", subject: null }
      }
      if (response.status !== 200) return { mode: "unavailable", subject: null }
      const raw: unknown = await response.json()
      assertCurrent(true)
      const parsed = browserAuthSessionResponseSchema.safeParse(raw)
      if (!parsed.success) return { mode: "unavailable", subject: null }
      const observed = parsed.data.data
      if (!observed.authenticated) return { mode: "anonymous", subject: null }
      if (Date.parse(observed.expires_at) <= Date.now()) return { mode: "unavailable", subject: null }
      return { mode: "authenticated", subject: observed.subject, tenant: observed.tenant_id, subjectAtProbeStart }
    }
    return read()

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

/** SSR has no browser request-start marker. A conflicting browser owner needs a fresh GET. */
function canHydrateServerObservation(observed: BrowserAuthSession | undefined, indexSubject: string | null | undefined, invalidationHint: string | null | undefined): observed is BrowserAuthSession {
  if (observed === undefined || documentSuspended || indexSubject === undefined || invalidationHint !== null) return false
  if (!observed.authenticated) return indexSubject === null
  return Date.parse(observed.expires_at) > Date.now() && (indexSubject === null || indexSubject === observed.subject) &&
    (admittedSubject === null || admittedSubject === observed.subject && admittedTenant === observed.tenant_id)
}

export function useSessionProbe(options: Readonly<{ serverUnavailable?: boolean; initialSession?: BrowserAuthSession }> = {}): SessionProbe {
  const serverUnavailable = options.serverUnavailable === true
  const initialSession = useRef(options.initialSession)
  const [retryGeneration, setRetryGeneration] = useState(0)
  const generationRef = useRef(0)
  // Server and browser render the same inactive first frame. Browser context is checked only after commit.
  const [probe, setProbe] = useState<Omit<SessionProbe, "reportReadUnauthorized" | "readRecoveryBlocked">>(() => ({
    state: EXPLICIT_PREVIEW ? "pass" : serverUnavailable ? "unavailable" : "checking",
    mode: EXPLICIT_PREVIEW ? "preview" : "checking",
    projectReadBoundary: { admitted: false, subject: null, generation: 0 },
    unavailable: serverUnavailable,
    requestPending: false,
    retry: () => undefined,
  }))
  const admissionRef = useRef(probe.projectReadBoundary)
  const readEpisode = useRef({ spent: false, recovering: false })
  const readRecoveryAdmission = useRef<ReadRecoveryAdmission | null>(null)
  const retireReadRecovery = useCallback(() => {
    const recovery = readRecoveryAdmission.current
    if (recovery) { recovery.retired = true; recovery.settle(false); readRecoveryAdmission.current = null }
  }, [])
  const [readRecoveryBlocked, setReadRecoveryBlocked] = useState(false)
  useLayoutEffect(() => {
    const boundary = probe.projectReadBoundary
    admissionRef.current = boundary
    const recovery = readRecoveryAdmission.current
    if (probe.unavailable || serverUnavailable) retireReadRecovery()
    else if (recovery && !recovery.retired && boundary.admitted && boundary.subject === recovery.subject && boundary.generation !== recovery.generation) {
      recovery.admittedGeneration = boundary.generation
      recovery.settle(true)
    }
  }, [probe.projectReadBoundary, probe.unavailable, serverUnavailable, retireReadRecovery])
  useEffect(() => retireReadRecovery, [retireReadRecovery])
  const retry = useCallback(() => {
    if (serverUnavailable) return
    retireReadRecovery()
    readEpisode.current = { spent: false, recovering: false }
    setReadRecoveryBlocked(false)
    setProbe((current) => current.mode === "authenticated"
      ? { ...current, requestPending: true }
      : { ...current, state: "checking", unavailable: false, requestPending: true })
    setRetryGeneration((current) => current + 1)
  }, [serverUnavailable, retireReadRecovery])
  const reportReadUnauthorized = useCallback<ProductReadRecheck>((read) => {
    const current = admissionRef.current
    if (EXPLICIT_PREVIEW || serverUnavailable || documentSuspended || read.signal.aborted ||
      read.subject === null || admittedSubject !== read.subject) return undefined
    try { if (readBrowserAuthIndexSubject() !== read.subject) return undefined } catch { return undefined }
    const waitForAdmission = (recovery: ReadRecoveryAdmission, proof: ProductRead401): Promise<boolean> => new Promise(resolve => {
      let done = false
      const finish = (accepted: boolean) => {
        if (done) return
        done = true
        proof.signal.removeEventListener("abort", abort)
        const latest = admissionRef.current
        let markerMatches = false
        try { markerMatches = readBrowserAuthIndexSubject() === recovery.subject } catch { /* No trusted browser identity. */ }
        resolve(accepted && !proof.signal.aborted && !recovery.retired && !documentSuspended && markerMatches &&
          latest.admitted && latest.subject === recovery.subject && latest.generation === recovery.admittedGeneration)
      }
      const abort = () => finish(false)
      proof.signal.addEventListener("abort", abort, { once: true })
      if (proof.signal.aborted) abort()
      void recovery.result.then(finish)
    })
    // A sibling GET may receive401 after the first report synchronously retired
    // its data epoch. Join only that exact episode, never a replacement actor.
    const existing = readRecoveryAdmission.current
    if (existing && !existing.retired && existing.subject === read.subject && existing.generation === read.generation)
      return waitForAdmission(existing, read)
    if (!current.admitted || current.subject !== read.subject || current.generation !== read.generation) return undefined
    // Revoke synchronously: sibling/late g1 failures cannot interrupt its recovery.
    const exhausted = readEpisode.current.spent
    retireReadRecovery()
    let recovery: ReadRecoveryAdmission | undefined
    if (!exhausted) {
      let settle!: ReadRecoveryAdmission["settle"]
      const result = new Promise<boolean>(resolve => { settle = resolve })
      recovery = { subject: read.subject, generation: read.generation, admittedGeneration: null, retired: false, result, settle }
      readRecoveryAdmission.current = recovery
    }
    readEpisode.current = { spent: true, recovering: !exhausted }
    const retired = { ...current, admitted: false, generation: ++generationRef.current }
    admissionRef.current = retired
    setReadRecoveryBlocked(exhausted)
    setProbe(value => ({ ...value, projectReadBoundary: retired, requestPending: !exhausted, unavailable: exhausted }))
    // Effect replacement retires the old subscriber, not the shared auth work.
    // In particular an in-progress CAS/unknown POST must continue unchanged.
    if (!exhausted) setRetryGeneration(value => value + 1)
    if (recovery) return waitForAdmission(recovery, read)
    return undefined
  }, [serverUnavailable, retireReadRecovery])

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
        retireReadRecovery()
        browserConversationMoveCoordinator().suspendVerifiedSubject(admittedSubject)
        admissionRef.current = { ...admissionRef.current, admitted: false }
        setProbe((current) => ({ ...current, projectReadBoundary: {
          ...current.projectReadBoundary, admitted: false, generation: generationRef.current,
        } }))
      }
      return indexSubject
    }
    const check = (): void => {
      const indexSubject = retireChangedSubject()
      const invalidationHint = readBrowserInvalidationHint()
      if (pendingCheck !== null && invalidationHint !== pendingCheck.invalidationHint) pendingCheck.retired = true
      if (sessionProbeInflight !== null && invalidationHint !== sessionProbeInflight.observation.invalidationHint)
        sessionProbeInflight.observation.retired = true
      if (pendingCheck !== null) return
      const candidate = initialSession.current
      initialSession.current = undefined
      const serverObservation = canHydrateServerObservation(candidate, indexSubject, invalidationHint) ? candidate : undefined
      const request: SharedSessionCheck = serverObservation === undefined
        ? requestSessionMode(indexSubject, invalidationHint)
        : { observation: { indexSubject, invalidationHint, retired: false }, result: Promise.resolve(serverObservation.authenticated
          ? { mode: "authenticated", subject: serverObservation.subject, tenant: serverObservation.tenant_id, subjectAtProbeStart: undefined }
          : { mode: "anonymous", subject: null }) }
      const checking = request.observation
      pendingCheck = checking
      const currentGeneration = ++generationRef.current
      const readRecovery = readEpisode.current.recovering
      // Probe epochs fence asynchronous results; data generations change only
      // on actual admission/retirement. A routine check does not invalidate
      // every business read. Each request still has server-side authorization.
      if (serverObservation === undefined) setProbe((current) => ({ ...current, requestPending: true,
        projectReadBoundary: current.projectReadBoundary.admitted && current.projectReadBoundary.subject === indexSubject
          ? current.projectReadBoundary
          : { admitted: false, subject: current.projectReadBoundary.subject, generation: currentGeneration },
      }))
      void request.result.then((resolved) => {
        // A retired result still releases its own scheduler slot. It cannot
        // clear a newer observation or publish admission across the epoch fence.
        if (pendingCheck === checking) pendingCheck = null
        if (!live || generationRef.current !== currentGeneration) return
        let bootstrapIndex: string | null | undefined
        if (serverObservation !== undefined) {
          try { bootstrapIndex = readBrowserAuthIndexSubject() } catch { /* A fresh GET is required. */ }
          if (!canHydrateServerObservation(serverObservation, bootstrapIndex, readBrowserInvalidationHint())) {
            // A missed/queued storage event can invalidate SSR before this microtask. Never publish it first.
            admissionRef.current = { ...admissionRef.current, admitted: false }
            check()
            return
          }
        } else if (checking.invalidationHint === undefined || readBrowserInvalidationHint() !== checking.invalidationHint) {
          checking.retired = true
        }
        if (resolved.mode === "forbidden" && !checking.retired) {
          retireReadRecovery()
          browserConversationMoveCoordinator().suspendVerifiedSubject(admittedSubject)
          admissionRef.current = { admitted: false, subject: null, generation: currentGeneration }
          setProbe({ state: "forbidden", mode: "checking", unavailable: true, requestPending: false, retry,
            projectReadBoundary: admissionRef.current })
          return
        }
        if (resolved.mode === "unavailable" || checking.retired) {
          admissionRef.current = { ...admissionRef.current, admitted: false }
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
            // A server observation never claims that hydration-time storage was its request start.
            // Recheck bootstrap eligibility before touching indexes; real GETs retain their own start marker.
            const indexAtAdmission = serverObservation === undefined ? resolved.subjectAtProbeStart : bootstrapIndex
            if (indexAtAdmission === undefined ||
              !admitBrowserAuthSessionIndexes(resolved.subject, indexAtAdmission)) {
              admissionRef.current = { ...admissionRef.current, admitted: false }
              setProbe((current) => current.mode === "authenticated"
                ? { ...current, unavailable: true, requestPending: false, retry,
                  projectReadBoundary: { admitted: false, subject: current.projectReadBoundary.subject, generation: currentGeneration } }
                : { state: "unavailable", mode: "checking", unavailable: true, requestPending: false, retry,
                  projectReadBoundary: { admitted: false, subject: null, generation: currentGeneration } })
              return
            }
            if (admittedSubject === null) {
              admittedSubject = resolved.subject
              admittedTenant = resolved.tenant
            } else if (admittedSubject !== resolved.subject || admittedTenant !== resolved.tenant) {
              retireReadRecovery()
              browserConversationMoveCoordinator().revokeSubject()
              admissionRef.current = { ...admissionRef.current, admitted: false }
              setProbe({ state: "checking", mode: "checking", unavailable: false, requestPending: false, retry,
                projectReadBoundary: { admitted: false, subject: null, generation: currentGeneration } })
              window.location.reload()
              return
            }
            browserConversationMoveCoordinator().admitVerifiedSubject(resolved.subject)
            setReadRecoveryBlocked(false)
            // A recovery's own GET success never buys another 401 retry.
            if (!readRecovery) readEpisode.current.spent = false
            readEpisode.current.recovering = false
          } catch {
            admissionRef.current = { ...admissionRef.current, admitted: false }
            setProbe((current) => current.mode === "authenticated"
              ? { ...current, unavailable: true, requestPending: false, retry,
                projectReadBoundary: { admitted: false, subject: current.projectReadBoundary.subject, generation: currentGeneration } }
              : { state: "unavailable", mode: "checking", unavailable: true, requestPending: false, retry,
                projectReadBoundary: { admitted: false, subject: null, generation: currentGeneration } })
            return
          }
        }
        if (resolved.mode === "anonymous") {
          retireReadRecovery()
          admissionRef.current = { ...admissionRef.current, admitted: false }
          readEpisode.current = { spent: false, recovering: false }
          setReadRecoveryBlocked(false)
          browserConversationMoveCoordinator().revokeSubject()
          admittedSubject = null
          admittedTenant = null
        }
        clearTimeout(recoveryTimer)
        recoveryTimer = undefined
        recoveryAttempt = 0
        setProbe((current) => {
          const previous = current.projectReadBoundary
          const sameAdmission = resolved.mode === "authenticated" && previous.admitted &&
            previous.subject === resolved.subject && previous.tenant === resolved.tenant
          const authInvalidationHint = checking.invalidationHint
          return {
            state: resolved.mode === "authenticated" ? "pass" : "anonymous",
            mode: resolved.mode === "authenticated" ? "authenticated" : "checking",
            projectReadBoundary: resolved.mode === "authenticated"
              ? sameAdmission && previous.authInvalidationHint === authInvalidationHint
                ? previous
                : { admitted: true, subject: resolved.subject, tenant: resolved.tenant,
                    generation: sameAdmission ? previous.generation : currentGeneration,
                    ...(authInvalidationHint === undefined ? {} : { authInvalidationHint }) }
              : { admitted: false, subject: null, generation: currentGeneration },
            unavailable: false,
            requestPending: false,
            retry,
          }
        })
      })
    }
    check()
    // A hidden tab does not poll. A visible return performs one bounded native GET.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") check()
    }
    const onStorage = (event: StorageEvent): void => {
      // Other tabs also save drafts and preferences; those are not auth events.
      if (event.storageArea !== window.localStorage || (event.key !== null && event.key !== AUTH_INDEX_SUBJECT_KEY && event.key !== AUTH_INVALIDATION_KEY)) return
      // Storage events are queued: current storage may already be A after A→B→A.
      // Revoke the shared observation so late subscribers cannot accept it either.
      const changed = event.key === null || event.oldValue !== event.newValue
      if (changed) {
        retireReadRecovery()
        // Each hook receives the same event. Retire only the check preceding
        // that event, not the fresh check already started by another listener.
        if (lastIdentityStorageEvent !== event) {
          lastIdentityStorageEvent = event
          if (sessionProbeInflight !== null) sessionProbeInflight.observation.retired = true
        }
        browserConversationMoveCoordinator().suspendVerifiedSubject(admittedSubject)
        admissionRef.current = { ...admissionRef.current, admitted: false }
        setProbe((current) => ({ ...current, projectReadBoundary: {
          ...current.projectReadBoundary, admitted: false, generation: generationRef.current,
        } }))
      }
      if (retireChangedSubject() !== admittedSubject || changed) onVisible()
    }
    const onPageHide = (): void => {
      retireReadRecovery()
      documentSuspended = true
      admissionRef.current = { ...admissionRef.current, admitted: false }
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
    window.addEventListener("kokoro:auth-invalidated", onPageHide)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("storage", onStorage)
    const timer = setInterval(onVisible, SESSION_CHECK_INTERVAL_MS)
    return () => {
      live = false
      window.removeEventListener("online", onVisible)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("kokoro:auth-invalidated", onPageHide)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("storage", onStorage)
      clearInterval(timer)
      clearTimeout(recoveryTimer)
    }
  }, [retry, retryGeneration, serverUnavailable, retireReadRecovery])

  return { ...probe, reportReadUnauthorized, readRecoveryBlocked }
}

export function useSessionState(): SessionState {
  return useSessionProbe().state
}
