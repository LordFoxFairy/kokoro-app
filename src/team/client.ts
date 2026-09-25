// Browser-only Team Product client. Generated BFF SDK operations are transport-bound to Web's
// same-origin /api/team adapter; the browser never contacts the BFF/IAM origin directly.

import { z, type ZodType } from "zod"

import { createClient } from "@/generated/bff-team/client/client.gen"
import {
  cancelTeamInvitation, createTeamInvitation, leaveTeam, listTeamInvitations, listTeamMembers,
  listTeamRoles, removeTeamMember, replaceTeamMemberRoles, resendTeamInvitation,
} from "@/generated/bff-team/sdk.gen"
import type { TeamInvitation, TeamMember, TeamRole } from "@/generated/bff-team/types.gen"

import {
  teamCanceledInvitationResponseSchema, teamCreateInvitationRequestSchema, teamErrorResponseSchema,
  teamInvitationsResponseSchema, teamLeftMemberResponseSchema, teamMembersResponseSchema,
  teamPendingInvitationResponseSchema, teamRemovedMemberResponseSchema, teamReplaceRolesRequestSchema,
  teamRolesChangedResponseSchema, teamRolesResponseSchema,
} from "./schema"

export type { TeamInvitation, TeamMember, TeamRole } from "@/generated/bff-team/types.gen"

export type TeamPage<T> = Readonly<{ items: T[]; nextCursor: string | null; requestId: string }>
export type TeamReadOptions = Readonly<{ limit?: number; cursor?: string }>

export class TeamClientError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = "TeamClientError"
  }
}

type GeneratedResult = Readonly<{ data?: unknown; error?: unknown; response?: Response }>

function teamTransport(origin: string): typeof fetch {
  return async (input, init) => {
    const generated = input instanceof Request ? input : new Request(input, init)
    const url = new URL(generated.url)
    if (url.origin !== origin || !url.pathname.startsWith("/v1/team/")) {
      throw new TeamClientError("Unexpected Team endpoint", "unexpected_team_endpoint", null, null)
    }
    const browserUrl = new URL(`/api/team/${url.pathname.slice("/v1/team/".length)}`, origin)
    browserUrl.search = url.search
    const body = generated.body === null ? undefined : await generated.arrayBuffer()
    return fetch(new Request(browserUrl, {
      method: generated.method,
      headers: generated.headers,
      ...(body === undefined ? {} : { body }),
      signal: generated.signal,
      credentials: "same-origin",
    }))
  }
}

async function checked<T>(result: Promise<unknown>, schema: ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  let outcome: GeneratedResult
  try { outcome = await result as GeneratedResult }
  catch (error) {
    throw new TeamClientError(error instanceof Error ? error.message : "Team network failure", null, null, null)
  }
  const status = outcome.response?.status ?? null
  if (outcome.error !== undefined || status === null || status >= 400) {
    const parsed = teamErrorResponseSchema.safeParse(outcome.error)
    if (parsed.success) {
      throw new TeamClientError(parsed.data.error.message, parsed.data.error.code, status, parsed.data.meta.request_id)
    }
    throw new TeamClientError("Team request failed", status === null ? "team_network_error" : "bff_bad_response", status, null)
  }
  const parsed = schema.safeParse(outcome.data)
  if (!parsed.success) throw new TeamClientError("Malformed Team response", "bff_bad_response", status, null)
  return parsed.data
}

function page<T>(value: { data: T[]; meta: { next_cursor: string | null; request_id: string } }): TeamPage<T> {
  return { items: value.data, nextCursor: value.meta.next_cursor, requestId: value.meta.request_id }
}

export type TeamClient = Readonly<{
  currentUserId: () => Promise<string>
  listMembers: (options?: TeamReadOptions) => Promise<TeamPage<TeamMember>>
  listInvitations: (options?: TeamReadOptions) => Promise<TeamPage<TeamInvitation>>
  listRoles: (options?: TeamReadOptions) => Promise<TeamPage<TeamRole>>
  createInvitation: (email: string, roles: string[]) => Promise<void>
  resendInvitation: (invitationId: string) => Promise<void>
  cancelInvitation: (invitationId: string) => Promise<void>
  replaceMemberRoles: (memberId: string, roles: string[]) => Promise<void>
  removeMember: (memberId: string) => Promise<void>
  leave: () => Promise<void>
}>

export function createTeamClient(): TeamClient {
  const origin = window.location.origin
  const client = createClient({ baseUrl: origin, fetch: teamTransport(origin), responseStyle: "fields", throwOnError: false })
  const query = (options?: TeamReadOptions) => options === undefined ? undefined : {
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
  }
  return {
    currentUserId: async () => {
      let response: Response
      try { response = await fetch("/api/auth/session", { cache: "no-store" }) }
      catch { throw new TeamClientError("Product Session unavailable", "session_unavailable", null, null) }
      const raw: unknown = await response.json().catch(() => null)
      const parsed = z.object({ authenticated: z.literal(true), subject: z.string().min(1) }).safeParse(raw)
      if (!response.ok || !parsed.success) throw new TeamClientError("Product Session unavailable", "unauthenticated", response.status, null)
      return parsed.data.subject
    },
    listMembers: async (options) => {
      const params = query(options)
      return page(await checked(listTeamMembers({ client, ...(params === undefined ? {} : { query: params }) }), teamMembersResponseSchema))
    },
    listInvitations: async (options) => {
      const params = query(options)
      return page(await checked(listTeamInvitations({ client, ...(params === undefined ? {} : { query: params }) }), teamInvitationsResponseSchema))
    },
    listRoles: async (options) => {
      const params = query(options)
      return page(await checked(listTeamRoles({ client, ...(params === undefined ? {} : { query: params }) }), teamRolesResponseSchema))
    },
    createInvitation: async (email, roles) => {
      const body = teamCreateInvitationRequestSchema.parse({ email, roles })
      await checked(createTeamInvitation({ client, body }), teamPendingInvitationResponseSchema)
    },
    resendInvitation: async (invitationId) => {
      await checked(resendTeamInvitation({ client, path: { invitation_id: invitationId } }), teamPendingInvitationResponseSchema)
    },
    cancelInvitation: async (invitationId) => {
      await checked(cancelTeamInvitation({ client, path: { invitation_id: invitationId } }), teamCanceledInvitationResponseSchema)
    },
    replaceMemberRoles: async (memberId, roles) => {
      const body = teamReplaceRolesRequestSchema.parse({ roles })
      await checked(replaceTeamMemberRoles({ client, path: { member_id: memberId }, body }), teamRolesChangedResponseSchema)
    },
    removeMember: async (memberId) => {
      await checked(removeTeamMember({ client, path: { member_id: memberId } }), teamRemovedMemberResponseSchema)
    },
    leave: async () => { await checked(leaveTeam({ client }), teamLeftMemberResponseSchema) },
  }
}
