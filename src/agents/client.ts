import { hasHubNoStoreDirective } from "@/hub/client"
import {
  agentConnectionCommandSchema,
  agentConnectionErrorSchema,
  agentConnectionResponseSchema,
  agentPlatformSchema,
  lineConnectionContinueRequestSchema,
  lineConnectionContinueResponseSchema,
  type AgentConnectionCommand,
  type AgentConnectionSetup,
  type AgentPlatform,
  type LineConnectionContinueRequest,
  type LineConnectionContinueResponse,
} from "@/generated/bff-agent-connections"

export type { AgentConnectionCommand, AgentConnectionSetup, AgentPlatform, LineConnectionContinueRequest } from "@/generated/bff-agent-connections"

export type AgentClient = {
  connectionSetup: (platform: AgentPlatform, signal?: AbortSignal) => Promise<AgentConnectionSetup>
  continueLineConnection: (command: LineConnectionContinueRequest, signal?: AbortSignal) => Promise<LineConnectionContinueResponse["data"]>
  changeConnection: (platform: AgentPlatform, command: AgentConnectionCommand, signal?: AbortSignal) => Promise<AgentConnectionSetup>
}

export class AgentClientError extends Error {
  constructor(readonly status: number | null, readonly code: string | null = null) {
    super("Agent connection request did not complete")
    this.name = "AgentClientError"
  }
}

export const AGENT_CONNECTION_BODY_LIMIT = 1_024
export const AGENT_CONNECTION_RESPONSE_LIMIT = 8_192
export const AGENT_CONNECTION_DEADLINE_MS = 10_000
export const AGENT_CONNECTION_JSON = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu

/** Check exact owner state/receipt; don't turn a different setup into navigation. */
export function parseAgentConnectionResponse(raw: unknown, requestId: string, platform: AgentPlatform, command?: AgentConnectionCommand) {
  const parsed = agentConnectionResponseSchema.safeParse(raw)
  if (!parsed.success || parsed.data.meta.request_id !== requestId || parsed.data.data.platform !== platform) return null
  const state = parsed.data.data
  if (state.status === "awaiting_telegram") {
    const url = new URL(state.continue_url)
    if (url.origin !== "https://t.me" || url.username || url.password || url.hash ||
      !/^\/[A-Za-z][A-Za-z0-9_]{1,28}bot$/iu.test(url.pathname) ||
      url.search !== `?start=${state.setup_id}` || url.href !== state.continue_url) return null
  }
  if (state.status === "awaiting_line") {
    const url = new URL(state.continue_url)
    if (url.origin !== "https://line.me" || url.username || url.password || url.hash ||
      !/^\/R\/oaMessage\/%40[A-Za-z0-9_.-]{1,64}\/$/u.test(url.pathname) ||
      url.search !== `?${encodeURIComponent(`Kokoro connect ${state.setup_id}`)}` || url.href !== state.continue_url) return null
  }
  if (command) {
    const delta = Number(state.state_version) - Number(command.expected_state_version)
    const matches = command.action === "start" ? state.status === (platform === "line" ? "awaiting_line" : "awaiting_telegram") && delta === 1
      : command.action === "confirm" ? platform === "telegram" && state.status === "connected" && delta === 1
      : state.status === "disconnected" && (command.action === "cancel" ? delta === 1 || platform === "telegram" && delta === 2 : delta === 0 || delta === 1)
    if (!matches) return null
  }
  return parsed.data
}

/** The exact provider URL exists only in this one accepted continuation receipt. */
export function parseLineConnectionContinuation(raw: unknown, requestId: string, command: LineConnectionContinueRequest) {
  const parsed = lineConnectionContinueResponseSchema.safeParse(raw)
  if (!parsed.success || parsed.data.meta.request_id !== requestId) return null
  const { data } = parsed.data
  if (data.setup_id !== command.setup_id || Number(data.state_version) !== Number(command.expected_state_version) + 1) return null
  const url = new URL(data.continue_url)
  const nonce = url.searchParams.get("nonce")
  if (url.origin !== "https://access.line.me" || url.pathname !== "/dialog/bot/accountLink" ||
    url.username || url.password || url.hash || url.href !== data.continue_url ||
    !nonce || !/^[A-Za-z0-9_-]{64}$/u.test(nonce) || !nonce.startsWith(data.setup_id) ||
    url.search !== `?${new URLSearchParams({ linkToken: command.link_token, nonce })}`) return null
  return parsed.data
}

export function createAgentClient(fetcher: typeof fetch = fetch): AgentClient {
  const exchange = async <T>(path: string, command: object | undefined, caller: AbortSignal | undefined,
    parse: (raw: unknown, requestId: string) => { data: T } | null, lineContinue = false): Promise<T> => {
    caller?.throwIfAborted()
    const deadline = AbortSignal.timeout(AGENT_CONNECTION_DEADLINE_MS)
    const signal = caller ? AbortSignal.any([caller, deadline]) : deadline
    let response: Response | undefined
    try {
      response = await fetcher(path, {
        method: command ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
        headers: { accept: "application/json", ...(command ? { "content-type": "application/json" } : {}) },
        ...(command ? { body: JSON.stringify(command) } : {}),
      })
      signal.throwIfAborted()
      const requestId = response.headers.get("x-request-id")
      const length = response.headers.get("content-length")
      if (!requestId || !hasHubNoStoreDirective(response.headers) ||
        !AGENT_CONNECTION_JSON.test(response.headers.get("content-type") ?? "") ||
        (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > AGENT_CONNECTION_RESPONSE_LIMIT)))
        throw new AgentClientError(502, "agent_connection_response_invalid")
      const raw: unknown = await response.json()
      signal.throwIfAborted()
      if (response.status !== 200) {
        const error = agentConnectionErrorSchema.safeParse(raw)
        if (!error.success || error.data.meta.request_id !== requestId) throw new AgentClientError(502, "agent_connection_response_invalid")
        throw new AgentClientError(response.status, error.data.error.code)
      }
      if (lineContinue && response.headers.get("referrer-policy")?.trim().toLowerCase() !== "no-referrer")
        throw new AgentClientError(502, "agent_connection_response_invalid")
      const receipt = parse(raw, requestId)
      if (receipt === null) throw new AgentClientError(502, "agent_connection_response_invalid")
      return receipt.data
    } catch (error) {
      caller?.throwIfAborted()
      if (error instanceof AgentClientError) throw error
      throw new AgentClientError(null)
    } finally { void response?.body?.cancel().catch(() => undefined) }
  }
  const setup = async (platform: AgentPlatform, caller?: AbortSignal, command?: AgentConnectionCommand) => {
    caller?.throwIfAborted()
    if (!agentPlatformSchema.safeParse(platform).success || (command !== undefined && !agentConnectionCommandSchema.safeParse(command).success))
      throw new AgentClientError(400, "invalid_agent_connection_request")
    return exchange(`/api/agents/connections/setup?platform=${platform}`, command, caller,
      (raw, requestId) => parseAgentConnectionResponse(raw, requestId, platform, command))
  }
  return {
    connectionSetup: (platform, signal) => setup(platform, signal),
    changeConnection: (platform, command, signal) => setup(platform, signal, command),
    continueLineConnection: async (command, signal) => {
      signal?.throwIfAborted()
      if (!lineConnectionContinueRequestSchema.safeParse(command).success)
        throw new AgentClientError(400, "invalid_agent_connection_request")
      return exchange("/api/agents/connections/line/continue", command, signal,
        (raw, requestId) => parseLineConnectionContinuation(raw, requestId, command), true)
    },
  }
}
