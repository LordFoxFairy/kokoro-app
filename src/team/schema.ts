import { z } from "zod"

import type {
  TeamCreateInvitationRequest,
  TeamInvitation,
  TeamInvitationsResponse,
  TeamMember,
  TeamMembersResponse,
  TeamReplaceRolesRequest,
  TeamRole,
} from "@/generated/bff-team/types.gen"

const id = z.string().min(1)
const roleName = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u)
const roles = z.array(roleName).min(1)
const requestMeta = z.object({ request_id: id }).strict()
const pageMeta = requestMeta.extend({ next_cursor: z.string().max(2048).nullable() }).strict()

export const teamCreateInvitationRequestSchema: z.ZodType<TeamCreateInvitationRequest> = z.object({
  email: z.string().email(),
  roles: roles.max(20),
}).strict()

export const teamReplaceRolesRequestSchema: z.ZodType<TeamReplaceRolesRequest> = z.object({
  roles: roles.max(20),
}).strict()

export const teamMemberSchema: z.ZodType<TeamMember> = z.object({
  member_id: id,
  user_id: id,
  display_name: z.string(),
  image_url: z.string().nullable(),
  roles,
  joined_at: z.string().datetime({ offset: true }),
}).strict()

export const teamInvitationSchema: z.ZodType<TeamInvitation> = z.object({
  invitation_id: id,
  email: z.string().email(),
  roles,
  status: z.literal("pending"),
  created_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
}).strict()

export const teamRoleSchema = z.object({
  role_id: id.nullable(),
  name: roleName,
  kind: z.enum(["builtin", "custom"]),
  permissions: z.object({
    organization: z.array(z.literal("update")).min(1).optional(),
    member: z.array(z.enum(["create", "read", "update", "delete"])).min(1).optional(),
    invitation: z.array(z.enum(["create", "read", "cancel"])).min(1).optional(),
    ac: z.array(z.enum(["create", "read", "update"])).min(1).optional(),
    tenant: z.array(z.literal("read")).min(1).optional(),
    audit: z.array(z.literal("read")).min(1).optional(),
  }).strict(),
}).strict().transform((value): TeamRole => value as TeamRole)

export const teamMembersResponseSchema: z.ZodType<TeamMembersResponse> = z.object({
  data: z.array(teamMemberSchema), meta: pageMeta,
}).strict()
export const teamInvitationsResponseSchema: z.ZodType<TeamInvitationsResponse> = z.object({
  data: z.array(teamInvitationSchema), meta: pageMeta,
}).strict()
export const teamRolesResponseSchema = z.object({
  data: z.array(teamRoleSchema), meta: pageMeta,
}).strict()

export const teamMutationResponseSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data, meta: requestMeta }).strict()
export const teamErrorResponseSchema = z.object({ error: z.object({ code: id, message: id }).strict(), meta: requestMeta }).strict()

export const teamPendingInvitationResponseSchema = teamMutationResponseSchema(z.object({ invitation_id: id, status: z.literal("pending") }).strict())
export const teamCanceledInvitationResponseSchema = teamMutationResponseSchema(z.object({ invitation_id: id, status: z.literal("canceled") }).strict())
export const teamRolesChangedResponseSchema = teamMutationResponseSchema(z.object({ member_id: id, roles }).strict())
export const teamRemovedMemberResponseSchema = teamMutationResponseSchema(z.object({ member_id: id, status: z.literal("removed") }).strict())
export const teamLeftMemberResponseSchema = teamMutationResponseSchema(z.object({ member_id: id, status: z.literal("left") }).strict())
