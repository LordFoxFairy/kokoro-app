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
import { createScheduledTaskClient, type ScheduledTaskClient } from "@/features/app/scheduled-task-client"
import {
  createPreviewBillingClient,
  createPreviewHubClient,
  createPreviewPricingClient,
  createPreviewTeamClient,
} from "@/dev/preview-clients"

const STORAGE_KEY = "kokoro.web.conversations"

// 会话清单/成果/分享/模型/agent 读客户端子集（SESS-LIST/MODEL-UX/AGENT-PRESET/SHARE/ARTIFACT-LIB）。
export type ListClient = Pick<
  SessionClient,
  "listSessions" | "listModels" | "listAgents" | "listArtifacts" | "createShare" | "revokeShare" | "renameSession"
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

// 整页共享一个引擎实例（含流句柄与重连计时器），仅浏览器创建，SSR 为 null。
const pageEngines = new Map<string, SessionEngine>()

/**
 * Release an engine when its route scope leaves the mounted AppFrame.
 *
 * The browser cache is useful while a single scope is mounted, but retaining
 * every project engine forever leaves its SSE handle, storage listener, and
 * reattach timer alive. That turns repeated rail navigation into progressively
 * slower work and can make an old scope publish after the user has moved on.
 * The server remains the source of truth; a later visit recreates the engine
 * and hydrates the same scope again.
 */
export function releaseBrowserEngine(engine: SessionEngine | null | undefined): void {
  if (!engine) return
  for (const [key, candidate] of pageEngines) {
    if (candidate !== engine) continue
    pageEngines.delete(key)
    candidate.dispose()
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
  if (existing) return existing
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
    pageEngines.set(engineKey, engine)
    return engine
  }
}
