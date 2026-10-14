import { z } from "zod";

import type {
  TeamCreateInvitationRequest,
  TeamInvitation,
  TeamInvitationsResponse,
  TeamMember,
  TeamMembersResponse,
  TeamReplaceRolesRequest,
  TeamRole,
} from "@/generated/bff-team/types.gen";

const id = z.string().min(1);
const roleName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/u);
const roles = z.array(roleName).min(1);
const requestMeta = z.object({ request_id: id.max(256) }).strict();
const pageMeta = requestMeta
  .extend({ next_cursor: z.string().max(2048).nullable() })
  .strict();

export const teamCreateInvitationRequestSchema: z.ZodType<TeamCreateInvitationRequest> =
  z
    .object({
      email: z.string().email(),
      roles: roles.max(20),
    })
    .strict();

export const teamReplaceRolesRequestSchema: z.ZodType<TeamReplaceRolesRequest> =
  z
    .object({
      roles: roles.max(20),
    })
    .strict();

export const teamMemberSchema: z.ZodType<TeamMember> = z
  .object({
    member_id: id,
    user_id: id,
    display_name: z.string(),
    image_url: z.string().nullable(),
    roles,
    joined_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const teamInvitationSchema: z.ZodType<TeamInvitation> = z
  .object({
    invitation_id: id,
    email: z.string().email(),
    roles,
    status: z.literal("pending"),
    created_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const teamRoleSchema = z
  .object({
    role_id: id.nullable(),
    name: roleName,
    kind: z.enum(["builtin", "custom"]),
    permissions: z
      .object({
        organization: z.array(z.literal("update")).min(1).optional(),
        member: z
          .array(z.enum(["create", "read", "update", "delete"]))
          .min(1)
          .optional(),
        invitation: z
          .array(z.enum(["create", "read", "cancel"]))
          .min(1)
          .optional(),
        ac: z
          .array(z.enum(["create", "read", "update"]))
          .min(1)
          .optional(),
        tenant: z.array(z.literal("read")).min(1).optional(),
        audit: z.array(z.literal("read")).min(1).optional(),
        platform: z.array(z.literal("execute")).min(1).optional(),
        skill: z
          .array(
            z.enum([
              "create_draft",
              "create_version",
              "begin_upload",
              "complete_upload",
              "abort_upload",
              "validate_draft",
              "publish",
              "withdraw",
              "set_status",
              "install",
              "set_installation_enabled",
              "remove_installation",
              "update_draft",
              "discard_draft",
              "set_publication_audience",
            ]),
          )
          .min(1)
          .optional(),
      })
      .strict(),
  })
  .strict()
  .transform((value): TeamRole => value as TeamRole);

export const teamMembersResponseSchema: z.ZodType<TeamMembersResponse> = z
  .object({
    data: z.array(teamMemberSchema),
    meta: pageMeta,
  })
  .strict();
export const teamInvitationsResponseSchema: z.ZodType<TeamInvitationsResponse> =
  z
    .object({
      data: z.array(teamInvitationSchema),
      meta: pageMeta,
    })
    .strict();
export const teamRolesResponseSchema = z
  .object({
    data: z.array(teamRoleSchema),
    meta: pageMeta,
  })
  .strict();

export const teamMutationResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, meta: requestMeta }).strict();
export const teamErrorResponseSchema = z
  .object({
    error: z.object({ code: id, message: id }).strict(),
    meta: requestMeta,
  })
  .strict();

export const teamPendingInvitationResponseSchema = teamMutationResponseSchema(
  z.object({ invitation_id: id, status: z.literal("pending") }).strict(),
);
export const teamCanceledInvitationResponseSchema = teamMutationResponseSchema(
  z.object({ invitation_id: id, status: z.literal("canceled") }).strict(),
);
export const teamRolesChangedResponseSchema = teamMutationResponseSchema(
  z.object({ member_id: id, roles }).strict(),
);
export const teamRemovedMemberResponseSchema = teamMutationResponseSchema(
  z.object({ member_id: id, status: z.literal("removed") }).strict(),
);
export const teamLeftMemberResponseSchema = teamMutationResponseSchema(
  z.object({ member_id: id, status: z.literal("left") }).strict(),
);

/** Public Team status graph; route-local failures share the closed envelope, never an owner receipt. */
export const teamErrorStatuses = new Set([
  400, 401, 403, 404, 409, 413, 429, 502, 503,
]);
export const teamSessionProjectionSchema = z
  .object({
    authenticated: z.literal(true),
    subject: z.string().min(1),
    expires_at: z.number().finite(),
  })
  .strict();

export function teamResponseSchema(method: string, path: string) {
  if (method === "GET") {
    if (path === "members") return teamMembersResponseSchema;
    if (path === "roles") return teamRolesResponseSchema;
    if (path === "invitations") return teamInvitationsResponseSchema;
  }
  if (
    method === "POST" &&
    (path === "invitations" || /^invitations\/[^/]+\/resend$/u.test(path))
  )
    return teamPendingInvitationResponseSchema;
  if (method === "DELETE" && /^invitations\/[^/]+$/u.test(path))
    return teamCanceledInvitationResponseSchema;
  if (method === "PUT" && /^members\/[^/]+\/roles$/u.test(path))
    return teamRolesChangedResponseSchema;
  if (method === "DELETE" && path === "members/me")
    return teamLeftMemberResponseSchema;
  if (method === "DELETE" && /^members\/[^/]+$/u.test(path))
    return teamRemovedMemberResponseSchema;
  throw new Error("Unpublished Team response");
}
