// 页面级单例客户端 + 引擎：整页共享同源 BFF 客户端（鉴权由 httpOnly 信封 cookie 同源携带，
// 前端不持 token），仅浏览器构造，SSR 为 null/惰性。shell 与各域 controller hook 共用这些单例，
// 稳定引用供取数 effect/查询层依赖不抖动。

import { createPreviewClient, previewClientFromEnv } from "@/dev/preview-transport"
import { createSessionClient, type SessionClient } from "@/engine/client"
import { sessionBaseUrl } from "@/engine/config"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { storedConversationStoreSchema } from "@/core/persistence"
import { createPersistedStore } from "@/lib/persisted-store"
import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"

import { createBillingClient, type BillingClient } from "@/billing/client"
import { createPricingClient, type PricingClient } from "@/billing/pricing"
import { createHubClient, type HubClient } from "@/hub/client"
import { createTeamClient, type TeamClient } from "@/team/client"
import { createAgentClient, type AgentClient } from "@/agents/client"
import { createPreviewAgentClient } from "@/agents/preview-client"
import { createScheduledTaskClient, type ScheduledTaskClient } from "@/features/scheduled-tasks"
import {
  createPreviewBillingClient,
  createPreviewHubClient,
  createPreviewPricingClient,
  createPreviewTeamClient,
} from "@/dev/preview-clients"

const STORAGE_KEY = "kokoro.web.conversations"
const AUTH_INDEX_SUBJECT_KEY = "kokoro.web.auth-index-subject"

/** Remove only browser-owned conversation indexes before admitting a live identity. */
export function invalidateBrowserAuthSessionIndexes(): void {
  if (typeof window === "undefined") return
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
  if (currentSubject === subject) return true
  invalidateBrowserAuthSessionIndexes()
  window.localStorage.setItem(AUTH_INDEX_SUBJECT_KEY, subject)
  return true
}

// 会话清单/成果/分享/模型/agent 读客户端子集（SESS-LIST/MODEL-UX/AGENT-PRESET/SHARE/ARTIFACT-LIB）。
export type ListClient = Pick<
  SessionClient,
  "listSessions" | "listModels" | "listAgents" | "createShare" | "revokeShare" | "renameSession"
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
// listAgents 复用同客户端。
let pageListClient: ListClient | null = null
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

export function browserListClient(options: { preview?: boolean } = {}): ListClient {
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

let pageScheduledTaskClient: ScheduledTaskClient | null = null

/** Live Scheduled transport is explicit at the AppGate boundary; preview never creates it. */
export function browserScheduledTaskClient(): ScheduledTaskClient {
  if (!pageScheduledTaskClient) pageScheduledTaskClient = createScheduledTaskClient()
  return pageScheduledTaskClient
}

type BrowserEngineEntry = {
  engine: SessionEngine
  owners: Set<symbol>
  pendingRelease: number | null
}

// 整页按 scope 共享引擎实例（含流句柄与重连计时器）。production hook 只在
// committed effect 内同步执行 factory + retain；render 不创建零 owner entry。
const pageEngines = new Map<string, BrowserEngineEntry>()

function browserEngineEntry(engine: SessionEngine): { key: string; entry: BrowserEngineEntry } | null {
  for (const [key, entry] of pageEngines) {
    if (entry.engine === engine) return { key, entry }
  }
  return null
}

function cancelPendingBrowserEngineRelease(entry: BrowserEngineEntry): void {
  if (entry.pendingRelease === null) return
  window.clearTimeout(entry.pendingRelease)
  entry.pendingRelease = null
}

function scheduleBrowserEngineRelease(key: string, entry: BrowserEngineEntry): void {
  if (entry.pendingRelease !== null || entry.owners.size > 0) return
  const timer = window.setTimeout(() => {
    if (
      pageEngines.get(key) !== entry ||
      entry.pendingRelease !== timer ||
      entry.owners.size > 0
    ) return
    entry.pendingRelease = null
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
      storage: createPersistedStore({
        key: `${STORAGE_KEY}.${sessionScopeKey(scope)}`,
        schema: storedConversationStoreSchema,
      }),
      scope,
    })
    pageEngines.set(engineKey, { engine, owners: new Set(), pendingRelease: null })
    return engine
  }
}
