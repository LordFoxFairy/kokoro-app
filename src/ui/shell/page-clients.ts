// 页面级单例客户端 + 引擎：整页共享同源 BFF 客户端（鉴权由 httpOnly 信封 cookie 同源携带，
// 前端不持 token），仅浏览器构造，SSR 为 null/惰性。shell 与各域 controller hook 共用这些单例，
// 稳定引用供取数 effect/查询层依赖不抖动。

import { createPreviewClient, previewClientFromEnv } from "@/dev/preview-transport"
import { createSessionClient, type SessionClient } from "@/engine/client"
import { sessionBaseUrl } from "@/engine/config"
import type { DraftLifecycle } from "@/engine/engine-types"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { removeConversation, type ConversationStore } from "@/core/conversations"
import { storedConversationStoreSchema } from "@/core/persistence"
import { createPersistedStore } from "@/lib/persisted-store"
import type { PersistedStore } from "@/lib/persisted-store"
import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import {
  createConversationMoveCoordinator,
  type ConversationMoveCoordinator,
} from "./conversation-move-coordinator"

import { createBillingClient, type BillingClient } from "@/billing/client"
import { createPricingClient, type PricingClient } from "@/billing/pricing"
import { createHubClient, type HubClient } from "@/hub/client"
import { createTeamClient, type TeamClient } from "@/team/client"
import { createAgentClient, type AgentClient } from "@/agents/client"
import { createPreviewAgentClient } from "@/agents/preview-client"
import {
  createPreviewBillingClient,
  createPreviewHubClient,
  createPreviewPricingClient,
  createPreviewTeamClient,
} from "@/dev/preview-clients"

import { consumeLandingPrompt } from "./use-draft"

const STORAGE_KEY = "kokoro.web.conversations"
export const AUTH_INDEX_SUBJECT_KEY = "kokoro.web.auth-index-subject"

/** Remove only browser-owned conversation indexes before admitting a live identity. */
export function invalidateBrowserAuthSessionIndexes(): void {
  if (typeof window === "undefined") return
  for (const [key, entry] of pageEngines) {
    if (key.startsWith("live:")) {
      entry.invalidated = true
      entry.engine.retireLocalCreationProvenance()
      if (entry.owners.size === 0 && entry.engine.getSnapshot().hasPendingSubmission) releaseBrowserEngine(entry.engine)
    }
  }
  const prefix = `${STORAGE_KEY}.`
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  for (const key of keys) window.localStorage.removeItem(key)
}

/** Cache marker only; Product Session remains the sole authentication proof. */
export function readBrowserAuthIndexSubject(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(AUTH_INDEX_SUBJECT_KEY)
}

/** Invalidate browser-owned indexes only when a verified subject changes. */
export function admitBrowserAuthSessionIndexes(subject: string, subjectAtProbeStart: string | null): boolean {
  const currentSubject = readBrowserAuthIndexSubject()
  if (currentSubject !== subjectAtProbeStart && currentSubject !== subject) return false
  if (currentSubject !== subject) {
    invalidateBrowserAuthSessionIndexes()
    // Never retain unknown/previous-actor data as an anonymous prompt.
    window.localStorage.removeItem("kokoro.web.drafts")
    const projectDraftKeys: string[] = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith("kokoro.web.pending-project-draft:")) projectDraftKeys.push(key)
    }
    for (const key of projectDraftKeys) window.sessionStorage.removeItem(key)
    window.sessionStorage.removeItem("kokoro.web.pending-creation-intent")
  }
  const prompt = consumeLandingPrompt()
  if (prompt !== null) {
    const raw = window.localStorage.getItem("kokoro.web.drafts")
    const drafts: unknown = raw === null ? {} : JSON.parse(raw)
    if (typeof drafts !== "object" || drafts === null || Array.isArray(drafts) ||
      Object.values(drafts).some((value) => typeof value !== "string")) throw new Error("invalid browser draft map")
    // Do not use persisted-store.write: it intentionally swallows storage errors.
    window.localStorage.setItem("kokoro.web.drafts", JSON.stringify({ ...drafts, __pending__: prompt }))
  }
  if (currentSubject !== subject) window.localStorage.setItem(AUTH_INDEX_SUBJECT_KEY, subject)
  return true
}

// 会话清单/成果/分享/模型读客户端子集（SESS-LIST/MODEL-UX/SHARE/ARTIFACT-LIB）。
export type ListClient = Pick<
  SessionClient,
  "listSessions" | "listModels" | "createShare" | "revokeShare" | "renameSession"
>

let pageHubClient: HubClient | null = null
let pagePreviewHubClient: HubClient | null = null
export function browserHubClient(options: { preview?: boolean } = {}): HubClient {
  if (options.preview === true) {
    if (!pagePreviewHubClient) pagePreviewHubClient = createPreviewHubClient()
    return pagePreviewHubClient
  }
  if (!pageHubClient) {
    pageHubClient = createHubClient()
  }
  return pageHubClient
}

let pageBillingClient: BillingClient | null = null
let pagePreviewBillingClient: BillingClient | null = null
export function browserBillingClient(options: { preview?: boolean } = {}): BillingClient {
  if (options.preview === true) {
    if (!pagePreviewBillingClient) pagePreviewBillingClient = createPreviewBillingClient()
    return pagePreviewBillingClient
  }
  if (!pageBillingClient) {
    pageBillingClient = createBillingClient()
  }
  return pageBillingClient
}

let pagePricingClient: PricingClient | null = null
let pagePreviewPricingClient: PricingClient | null = null
export function browserPricingClient(options: { preview?: boolean } = {}): PricingClient {
  if (options.preview === true) {
    if (!pagePreviewPricingClient) pagePreviewPricingClient = createPreviewPricingClient()
    return pagePreviewPricingClient
  }
  if (!pagePricingClient) {
    pagePricingClient = createPricingClient()
  }
  return pagePricingClient
}

let pageTeamClient: TeamClient | null = null
let pagePreviewTeamClient: TeamClient | null = null
export function browserTeamClient(options: { preview?: boolean } = {}): TeamClient {
  if (options.preview === true) {
    if (!pagePreviewTeamClient) pagePreviewTeamClient = createPreviewTeamClient()
    return pagePreviewTeamClient
  }
  if (!pageTeamClient) {
    pageTeamClient = createTeamClient()
  }
  return pageTeamClient
}

let pageAgentClient: AgentClient | null = null
let pagePreviewAgentClient: AgentClient | null = null
export function browserAgentClient(options: { preview?: boolean } = {}): AgentClient {
  if (options.preview === true) {
    if (!pagePreviewAgentClient) pagePreviewAgentClient = createPreviewAgentClient()
    return pagePreviewAgentClient
  }
  if (!pageAgentClient) pageAgentClient = createAgentClient()
  return pageAgentClient
}

// 会话清单读客户端：与引擎同源选择（preview 假流优先，否则 `/api/session` BFF）。listModels/
let pageListClient: SessionClient | null = null
let pagePreviewClient: SessionClient | null = null

function browserPreviewClient(): SessionClient {
  const envClient = previewClientFromEnv()
  if (envClient) {
    return envClient
  }
  if (!pagePreviewClient) {
    pagePreviewClient = createPreviewClient()
  }
  return pagePreviewClient
}

export function browserListClient(options: { preview?: boolean } = {}): SessionClient {
  if (options.preview === true) {
    return browserPreviewClient()
  }
  if (!pageListClient) {
    // `preview` is the route adapter's explicit transport decision. Do not
    // silently re-enter preview here just because a development env happens
    // to contain NEXT_PUBLIC_SESSION_PREVIEW=1; AppGate already passes the
    // correct mode after the auth probe, and live Chat must reach the BFF.
    pageListClient = createSessionClient({ baseUrl: sessionBaseUrl() })
  }
  return pageListClient
}

function browserSessionClient(options: { preview?: boolean } = {}): SessionClient {
  if (options.preview === true) return browserPreviewClient()
  if (!pageListClient) pageListClient = createSessionClient({ baseUrl: sessionBaseUrl() })
  return pageListClient
}

type BrowserEngineEntry = {
  engine: SessionEngine
  owners: Set<symbol>
  pendingRelease: number | null
  invalidated: boolean
  releaseWhenSettled: (() => void) | null
}

// 整页按 scope 共享引擎实例（含流句柄与重连计时器）。production hook 只在
// committed effect 内同步执行 factory + retain；render 不创建零 owner entry。
const pageEngines = new Map<string, BrowserEngineEntry>()
const pageConversationStores = new Map<string, PersistedStore<ConversationStore>>()
let pageMoveCoordinator: ConversationMoveCoordinator | null = null
let pageMovePagehideBound = false

/** Append-only UI retirement keys cannot be undone by a stale whole-index write. */
export function browserDraftLifecycle(scopeKey: string): DraftLifecycle {
  const key = (id: string) => `${STORAGE_KEY}.draft-retired.${encodeURIComponent(scopeKey)}.${encodeURIComponent(id)}`
  return {
    isUnsubmitted: id => {
      try { return window.localStorage.getItem(key(id)) === null }
      catch { return false }
    },
    retire: id => {
      try {
        if (window.localStorage.getItem(key(id)) === "1") return true
        window.localStorage.setItem(key(id), "1")
        return window.localStorage.getItem(key(id)) === "1"
      } catch { return false }
    },
  }
}

function conversationStore(scopeKey: string): PersistedStore<ConversationStore> {
  const existing = pageConversationStores.get(scopeKey)
  if (existing) return existing
  const created = createPersistedStore({
    key: `${STORAGE_KEY}.${scopeKey}`,
    schema: storedConversationStoreSchema,
  })
  pageConversationStores.set(scopeKey, created)
  return created
}

export function evictBrowserConversationIndex(scopeKey: string, sessionId: string): void {
  const liveEngine = pageEngines.get(`live:${scopeKey}`)?.engine
  if (liveEngine) {
    try { liveEngine.reconcileConversationCache(sessionId) }
    catch { /* Confirmed owner state wins over best-effort browser persistence. */ }
    return
  }
  const storage = conversationStore(scopeKey)
  const current = storage.read()
  if (!current?.conversations.some((entry) => entry.id === sessionId)) return
  try { storage.write(removeConversation(current, sessionId, `conv_${crypto.randomUUID()}`, Date.now())) }
  catch { /* Keep the current-document store projection invalidated when persistence observers fail. */ }
}

export function browserConversationMoveCoordinator(): ConversationMoveCoordinator {
  if (!pageMoveCoordinator) {
    pageMoveCoordinator = createConversationMoveCoordinator({
      client: browserSessionClient(),
      evictSourceIndex: evictBrowserConversationIndex,
    })
  }
  if (!pageMovePagehideBound && typeof window !== "undefined") {
    window.addEventListener("pagehide", pageMoveCoordinator.revokeSubject)
    pageMovePagehideBound = true
  }
  return pageMoveCoordinator
}

function browserEngineEntry(engine: SessionEngine): { key: string; entry: BrowserEngineEntry } | null {
  for (const [key, entry] of pageEngines) {
    if (entry.engine === engine) return { key, entry }
  }
  return null
}

function cancelPendingBrowserEngineRelease(entry: BrowserEngineEntry): void {
  entry.releaseWhenSettled?.()
  entry.releaseWhenSettled = null
  if (entry.pendingRelease === null) return
  window.clearTimeout(entry.pendingRelease)
  entry.pendingRelease = null
}

function scheduleBrowserEngineRelease(key: string, entry: BrowserEngineEntry): void {
  if (entry.pendingRelease !== null || entry.releaseWhenSettled !== null || entry.owners.size > 0) return
  const timer = window.setTimeout(() => {
    if (
      pageEngines.get(key) !== entry ||
      entry.pendingRelease !== timer ||
      entry.owners.size > 0
    ) return
    entry.pendingRelease = null
    // A scope switch is not a new intent or cancellation. Keep only the
    // unresolved create's original key/body in this document; never replay it
    // automatically. Settled runs still retire their view resources as before.
    if (!entry.invalidated && entry.engine.getSnapshot().hasPendingSubmission) {
      entry.releaseWhenSettled = entry.engine.subscribe(() => {
        if (entry.engine.getSnapshot().hasPendingSubmission) return
        entry.releaseWhenSettled?.()
        entry.releaseWhenSettled = null
        scheduleBrowserEngineRelease(key, entry)
      })
      return
    }
    pageEngines.delete(key)
    entry.engine.dispose()
  }, 0)
  entry.pendingRelease = timer
}

/**
 * Retain the cached browser engine for one committed consumer.
 *
 * Each call owns an independent token. The returned release is idempotent, so
 * Strict Mode cleanup/setup and late cleanup from replaced trees cannot underflow
 * another AppFrame's ownership.
 */
export function retainBrowserEngine(engine: SessionEngine | null | undefined): () => void {
  if (!engine) return () => undefined
  const located = browserEngineEntry(engine)
  if (!located) return () => undefined
  const { key, entry } = located
  const owner = Symbol("browser-engine-owner")
  cancelPendingBrowserEngineRelease(entry)
  entry.owners.add(owner)
  let released = false

  return () => {
    if (released) return
    released = true
    if (pageEngines.get(key) !== entry || !entry.owners.delete(owner)) return
    scheduleBrowserEngineRelease(key, entry)
  }
}

/** Explicitly dispose an unowned cache entry; live owner leases always win. */
export function releaseBrowserEngine(engine: SessionEngine | null | undefined): void {
  if (!engine) return
  for (const [key, entry] of pageEngines) {
    if (entry.engine !== engine || entry.owners.size > 0) continue
    cancelPendingBrowserEngineRelease(entry)
    pageEngines.delete(key)
    entry.engine.dispose()
  }
}

export function browserEngine(options: { preview?: boolean; scope?: SessionScope } = {}): SessionEngine | null {
  if (typeof window === "undefined") {
    return null
  }
  const mode = options.preview === undefined
    ? "live"
    : options.preview ? "preview" : "live"
  const scope = options.scope ?? DIRECT_SESSION_SCOPE
  const engineKey = `${mode}:${sessionScopeKey(scope)}`
  const existing = pageEngines.get(engineKey)
  if (existing) return existing.engine
  {
    // The route adapter explicitly selects preview; otherwise Chat always
    // uses the same-origin `/api/session` BFF, including in development.
    const client = options.preview === true
      ? browserPreviewClient()
      : createSessionClient({ baseUrl: sessionBaseUrl() })
    const engine = createSessionEngine({
      client,
      storage: conversationStore(sessionScopeKey(scope)),
      draftLifecycle: browserDraftLifecycle(sessionScopeKey(scope)),
      scope,
    })
    pageEngines.set(engineKey, { engine, owners: new Set(), pendingRelease: null, releaseWhenSettled: null, invalidated: false })
    return engine
  }
}
