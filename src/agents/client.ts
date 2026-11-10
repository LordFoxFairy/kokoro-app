import { z } from "zod"

export const agentPlatformSchema = z.enum(["telegram", "line", "slack"])
export type AgentPlatform = z.infer<typeof agentPlatformSchema>

export const agentConnectionSetupSchema = z.object({
  platform: agentPlatformSchema,
  status: z.enum(["disconnected", "pending", "connected", "expired"]),
  qr_value: z.string().min(1),
  continue_url: z.string().min(1),
  expires_at: z.string().datetime({ offset: true }).refine(value => value.endsWith("Z") ||
    /T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-](?:[01]\d|2[0-3]):[0-5]\d(?![\s\S])/u.test(value), "Invalid UTC offset"),
}).strict()
export type AgentConnectionSetup = z.infer<typeof agentConnectionSetupSchema>

export type AgentClient = {
  connectionSetup: (platform: AgentPlatform, signal?: AbortSignal) => Promise<AgentConnectionSetup>
}

export class AgentClientError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = "AgentClientError"
    this.status = status
  }
}

export function createAgentClient(fetcher: typeof fetch = fetch): AgentClient {
  return {
    connectionSetup: async (platform, signal) => {
      signal?.throwIfAborted()
      let response: Response
      try {
        response = await fetcher(`/api/agents/connections/setup?platform=${encodeURIComponent(platform)}`, {
          cache: "no-store",
          ...(signal === undefined ? {} : { signal }),
        })
      } catch (error) {
        signal?.throwIfAborted()
        throw new AgentClientError(error instanceof Error ? error.message : String(error), null)
      }
      if (signal?.aborted) {
        void response.body?.cancel().catch(() => undefined)
        signal.throwIfAborted()
      }
      if (!response.ok) {
        throw new AgentClientError(`agent connection setup failed with status ${response.status}`, response.status)
      }
      try {
        const raw: unknown = await response.json()
        signal?.throwIfAborted()
        return agentConnectionSetupSchema.parse(raw)
      } catch (error) {
        signal?.throwIfAborted()
        throw new AgentClientError(error instanceof Error ? error.message : String(error), response.status)
      }
    },
  }
}
