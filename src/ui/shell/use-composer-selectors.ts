"use client"

// Model selection belongs to the engine; its read-only catalog belongs to the
// current verified browser identity, not to every engine or standalone surface.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { ModelCandidate } from "@/contract/http"
import { ModelCatalogReadError, SessionClientError } from "@/engine/client"
import type { SessionEngine } from "@/engine/machine"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { readChatModel } from "@/ui/settings/chat-prefs"

import { AUTH_INDEX_SUBJECT_KEY, browserListClient, readBrowserAuthIndexSubject } from "./page-clients"

export type ComposerSelectors = {
  models: readonly ModelCandidate[]
  modelCatalogStatus: "loading" | "ready" | "error"
  retryModels: () => void
  selectedModel: string | null
  setSelectedModel: (value: string | null) => void
}

type Options = { preview?: boolean; applyModelToEngine?: boolean; active?: boolean; readBoundary?: ProjectReadBoundary }
const RECOVERY_COOLDOWN_MS = 30_000

function currentSubject(preview: boolean, subject: string | null): boolean {
  if (preview) return true
  try { return subject !== null && readBrowserAuthIndexSubject() === subject } catch { return false }
}

export function useComposerSelectors(engine: SessionEngine | null, options: Options = {}): ComposerSelectors {
  const reportRead401 = useProductReadRecheck()
  const preview = options.preview ?? false
  const active = options.active ?? true
  const applyModelToEngine = options.applyModelToEngine ?? true
  const boundary = options.readBoundary
  const admitted = preview || boundary?.admitted === true && Boolean(boundary.subject)
  const subject = preview ? "preview" : boundary?.subject ?? null
  const generation = preview ? 0 : boundary?.generation ?? 0
  const scope = useMemo(() => ({ preview, admitted, subject, generation }), [preview, admitted, subject, generation])
  const lifecycle = useMemo(() => ({
    scope, phase: "uninitialized" as "uninitialized" | "loading" | "ready" | "error",
    retryAt: 0, limited: false, retired: false,
  }), [scope])
  const [catalog, setCatalog] = useState<{
    scope: typeof scope; retired?: boolean; models: readonly ModelCandidate[]; status: ComposerSelectors["modelCatalogStatus"]
  }>({ scope, models: [], status: "loading" })
  const sameScope = admitted && catalog.scope === scope && !catalog.retired && currentSubject(preview, subject)
  const models = sameScope ? catalog.models : []
  const modelCatalogStatus = sameScope ? catalog.status : "loading"
  const selectionScope = useMemo(() => ({ engine, preview, subject }), [engine, preview, subject])
  const [selection, setSelection] = useState(() => ({ scope: selectionScope, value: readChatModel() }))
  const selectedModel = admitted && !(catalog.scope === scope && catalog.retired) && currentSubject(preview, subject) && selection.scope === selectionScope ? selection.value : null
  const selectionAuthority = useRef<{ scope: typeof scope; selectionScope: typeof selectionScope } | null>(null)
  useLayoutEffect(() => {
    const authority = admitted && active ? { scope, selectionScope } : null
    selectionAuthority.current = authority
    return () => { if (selectionAuthority.current === authority) selectionAuthority.current = null }
  }, [scope, selectionScope, admitted, active])
  const setSelectedModel = (value: string | null) => {
    // Preserve the existing same-subject choice across renewal, but reject a
    // menu callback captured before admission/engine retirement.
    if (!admitted || lifecycle.retired || selectionAuthority.current?.scope !== scope ||
      selectionAuthority.current.selectionScope !== selectionScope) return
    if (!currentSubject(preview, subject)) { retireRef.current(); return }
    setSelection({ scope: selectionScope, value })
  }
  const ownerCooldown = useRef<{ subject: string | null; preview: boolean; until: number } | null>(null)
  const retryRef = useRef<() => void>(() => undefined)
  const retireRef = useRef<() => void>(() => undefined)

  useLayoutEffect(() => {
    let live = true
    let flight: AbortController | null = null
    let wakeTimer: ReturnType<typeof setTimeout> | undefined
    const clearWake = () => { clearTimeout(wakeTimer); wakeTimer = undefined }
    const retire = () => {
      if (!live || lifecycle.retired) return
      lifecycle.retired = true
      clearWake()
      flight?.abort()
      flight = null
      setCatalog({ scope, models: [], status: "loading", retired: true })
      setSelection(previous => ({ ...previous, value: null }))
    }
    retireRef.current = retire
    const read = (explicit = false): void => {
      if (!live || lifecycle.retired || !active || !admitted || document.visibilityState !== "visible" || flight !== null) return
      if (!currentSubject(preview, subject)) { retire(); return }
      if (lifecycle.phase === "ready" && !explicit) return
      // Wakeups request at most one future GET; failure never schedules another.
      // Explicit reads also respect an owner 429, including invalid/missing hints.
      const ownerWait = ownerCooldown.current?.subject === subject && ownerCooldown.current.preview === preview
        ? ownerCooldown.current.until - performance.now() : 0
      const wait = Math.max(ownerWait, !explicit || lifecycle.limited ? lifecycle.retryAt - performance.now() : 0)
      if (wait > 0) {
        if (wakeTimer === undefined) wakeTimer = setTimeout(() => { wakeTimer = undefined; read(explicit) }, wait)
        return
      }
      clearWake()
      const controller = new AbortController()
      flight = controller
      lifecycle.phase = "loading"
      setCatalog(previous => ({ scope, models: previous.scope === scope ? previous.models : [], status: "loading" }))
      void browserListClient({ preview }).listModels({ signal: controller.signal }).then(list => {
        if (!live || lifecycle.retired || controller.signal.aborted || flight !== controller) return
        if (!currentSubject(preview, subject)) { retire(); return }
        flight = null
        lifecycle.phase = "ready"
        lifecycle.retryAt = 0
        lifecycle.limited = false
        ownerCooldown.current = null
        setCatalog({ scope, models: list.models, status: "ready" })
      }).catch((error: unknown) => {
        if (!live || lifecycle.retired || controller.signal.aborted || flight !== controller) return
        if (!currentSubject(preview, subject)) { retire(); return }
        flight = null
        if (!preview && error instanceof SessionClientError && error.reason === "http" && error.status === 401) {
          reportRead401?.({ subject, generation, signal: controller.signal })
        }
        lifecycle.phase = "error"
        lifecycle.limited = error instanceof ModelCatalogReadError && error.status === 429
        lifecycle.retryAt = performance.now() + (lifecycle.limited && error instanceof ModelCatalogReadError ? error.retryAfterMs : RECOVERY_COOLDOWN_MS)
        if (lifecycle.limited) ownerCooldown.current = { subject, preview, until: lifecycle.retryAt }
        setCatalog(previous => ({ scope, models: previous.scope === scope ? previous.models : [], status: "error" }))
      })
    }
    const retry = () => read(true)
    retryRef.current = retry
    const wake = () => {
      if (document.visibilityState !== "visible") { clearWake(); return }
      read()
    }
    const onStorage = (event: StorageEvent) => {
      if (!preview && event.storageArea === window.localStorage && (event.key === null || event.key === AUTH_INDEX_SUBJECT_KEY) &&
        (event.key === null || event.oldValue !== event.newValue)) retire()
    }
    window.addEventListener("storage", onStorage)
    // A committed active surface is a wakeup, not an invalidation of good data.
    queueMicrotask(wake)
    window.addEventListener("focus", wake)
    document.addEventListener("visibilitychange", wake)
    return () => {
      live = false
      clearWake()
      flight?.abort()
      if (flight !== null) lifecycle.phase = "uninitialized"
      if (retireRef.current === retire) retireRef.current = () => undefined
      window.removeEventListener("storage", onStorage)
      if (retryRef.current === retry) retryRef.current = () => undefined
      window.removeEventListener("focus", wake)
      document.removeEventListener("visibilitychange", wake)
    }
  }, [scope, lifecycle, preview, admitted, active, subject, generation, reportRead401])

  useEffect(() => {
    if (applyModelToEngine && admitted) engine?.setModel(selectedModel)
  }, [applyModelToEngine, admitted, engine, selectedModel])

  return { models, modelCatalogStatus, retryModels: () => retryRef.current(), selectedModel, setSelectedModel }
}
