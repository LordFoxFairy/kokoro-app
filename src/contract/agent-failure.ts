// Safe Agent failure value shared by public Message snapshots and verified
// AG-UI RUN_ERROR frames. The legal tuples are generated from BFF's pinned
// public OpenAPI; this module adds runtime parsing without copying the code set.

import { z } from "zod"

import {
  BFF_AGENT_FAILURE_TUPLES,
  type BffAgentFailureTuple,
} from "@/generated/bff-agent-failure"

export type AgentFailureProfile = BffAgentFailureTuple
export type AgentFailureCode = AgentFailureProfile["code"]

const failureCodes = [...new Set(BFF_AGENT_FAILURE_TUPLES.map(({ code }) => code))] as [
  AgentFailureCode,
  ...AgentFailureCode[],
]

export const AGENT_FAILURE_CODES: readonly AgentFailureCode[] = failureCodes
export const agentFailureCodeSchema = z.enum(failureCodes)

type AgentFailureCandidate = {
  source: "agent"
  code: AgentFailureCode
  retryable: boolean
}

function isPublishedAgentFailure(profile: AgentFailureCandidate): profile is AgentFailureProfile {
  return BFF_AGENT_FAILURE_TUPLES.some((candidate) =>
    candidate.code === profile.code && candidate.retryable === profile.retryable)
}

export const agentFailureProfileSchema = z
  .object({
    source: z.literal("agent"),
    code: agentFailureCodeSchema,
    retryable: z.boolean(),
  })
  .strict()
  .transform((profile, context): AgentFailureProfile => {
    if (isPublishedAgentFailure(profile)) return profile
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Agent failure code/retryable tuple is not published",
    })
    return z.NEVER
  })
