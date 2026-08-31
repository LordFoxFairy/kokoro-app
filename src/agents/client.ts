import { z } from "zod"

export const agentPlatformSchema = z.enum(["telegram", "line", "slack"])
export type AgentPlatform = z.infer<typeof agentPlatformSchema>

export const agentConnectionSetupSchema = z.object({
  platform: agentPlatformSchema,
  status: z.enum(["disconnected", "pending", "connected", "expired"]),
  qr_value: z.string().min(1),
  continue_url: z.string().min(1),
  expires_at: z.string().datetime(),
}).strict()
export type AgentConnectionSetup = z.infer<typeof agentConnectionSetupSchema>

export type AgentClient = {
  connectionSetup: (platform: AgentPlatform) => Promise<AgentConnectionSetup>
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
    connectionSetup: async (platform) => {
      let response: Response
      try {
        response = await fetcher(`/api/agents/connections/setup?platform=${encodeURIComponent(platform)}`, {
          cache: "no-store",
        })
      } catch (error) {
        throw new AgentClientError(error instanceof Error ? error.message : String(error), null)
      }
      if (!response.ok) {
        throw new AgentClientError(`agent connection setup failed with status ${response.status}`, response.status)
      }
      try {
        return agentConnectionSetupSchema.parse(await response.json())
      } catch (error) {
        throw new AgentClientError(error instanceof Error ? error.message : String(error), response.status)
      }
    },
  }
}
