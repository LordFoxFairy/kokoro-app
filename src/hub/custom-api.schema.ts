import { mcpIconBindingSchema, mcpIconSelectionSchema } from "./mcp-icon.schema";
import { connectorCommandErrorAllowed } from "./connector-command-error";
import { z } from "zod";

const profileId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u);
const stateVersion = z.string().regex(/^[1-9][0-9]{0,15}(?![\s\S])/u);
const environmentName = z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}(?![\s\S])/u);
const writeOnlySecret = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !/[\0\r\n]/u.test(value));
const profileText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => Boolean(value.trim()));

export const customApiEnvironmentWriteSchema = z
  .object({ name: environmentName, value: writeOnlySecret })
  .strict();
export const customApiEnvironmentDescriptorSchema = z
  .object({
    name: environmentName,
    configured: z.boolean(),
    state_version: stateVersion,
    status: z.literal("active"),
  })
  .strict();
export const customApiProfileSchema = z
  .object({
    icon: mcpIconBindingSchema.optional(),
    profile_id: profileId,
    name: profileText(400),
    instructions: profileText(4000).optional(),
    state_version: stateVersion,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    environment: z.array(customApiEnvironmentDescriptorSchema).max(128),
  })
  .strict();

export const customApiCreateInputSchema = z
  .object({
    icon: mcpIconSelectionSchema.optional(),
    name: profileText(400),
    instructions: profileText(4000).optional(),
    environment: z.array(customApiEnvironmentWriteSchema).max(128),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.environment.map((entry) => entry.name)).size ===
      value.environment.length,
    "Environment names must be unique",
  );
export const customApiCreateSchema = z
  .object({ custom_api: customApiProfileSchema, replayed: z.boolean() })
  .strict();
export const customApiGetSchema = z
  .object({ custom_api: customApiProfileSchema })
  .strict();
export const customApiPageSchema = z
  .object({
    items: z.array(customApiProfileSchema).max(100),
    page: z
      .object({
        next_cursor: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u)
          .nullable(),
      })
      .strict(),
  })
  .strict();
export const customApiUpdateInputSchema = z
  .object({
    icon: mcpIconSelectionSchema.optional(),
    clear_icon: z.literal(true).optional(),
    expected_state_version: stateVersion,
    name: profileText(400).optional(),
    instructions: profileText(4000).optional(),
    clear_instructions: z.boolean().optional(),
    environment_upserts: z
      .array(customApiEnvironmentWriteSchema)
      .max(128)
      .optional(),
    environment_removals: z.array(environmentName).max(128).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const upserts = value.environment_upserts ?? [];
    const removals = value.environment_removals ?? [];
    if (
      (value.icon !== undefined && value.clear_icon === true) ||
      (value.instructions !== undefined && value.clear_instructions) ||
      (value.name === undefined &&
        value.instructions === undefined &&
        !value.clear_instructions &&
        upserts.length === 0 &&
        removals.length === 0 && value.icon === undefined && value.clear_icon !== true) ||
      new Set(upserts.map((entry) => entry.name)).size !== upserts.length ||
      new Set(removals).size !== removals.length ||
      removals.some((name) => upserts.some((entry) => entry.name === name))
    )
      context.addIssue({
        code: "custom",
        message: "Invalid Custom API update",
      });
  });
export const customApiUpdateSchema = customApiCreateSchema;
export const customApiRemoveInputSchema = z
  .object({ expected_state_version: stateVersion })
  .strict();
export const customApiRemoveSchema = z
  .object({
    profile_id: profileId,
    deleted: z.literal(true),
    replayed: z.boolean(),
  })
  .strict();
export const customApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string(),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type CustomApiCreateInput = z.infer<typeof customApiCreateInputSchema>;
export type CustomApiProfile = z.infer<typeof customApiProfileSchema>;
export type CustomApiPage = z.infer<typeof customApiPageSchema>;
export type CustomApiUpdateInput = z.infer<typeof customApiUpdateInputSchema>;
export type CustomApiRemoveInput = z.infer<typeof customApiRemoveInputSchema>;

export type CustomApiOperation =
  | "create"
  | "list"
  | "get"
  | "update"
  | "remove";
const customApiErrors: Record<number, readonly string[]> = {
  400: ["invalid_custom_api_request"],
  401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"],
  404: ["custom_api_not_found"],
  412: ["custom_api_precondition_failed"],
  413: ["custom_api_body_too_large", "invalid_custom_api_request"],
  429: ["session_rate_limited"],
  503: [
    "product_tenant_not_configured",
    "iam_admission_unavailable",
    "custom_api_dependency_unavailable",
  ],
};
export function customApiErrorAllowed(
  operation: CustomApiOperation,
  status: number,
  value: unknown,
): boolean {
  const parsed = customApiErrorSchema.safeParse(value);
  if (
    !parsed.success ||
    (status === 404 && (operation === "create" || operation === "list"))
  )
    return false;
  const published = connectorCommandErrorAllowed(
    "custom_api",
    status,
    parsed.data.error,
    operation !== "list" && operation !== "get",
  );
  if (published !== undefined) return published;
  return (
    (customApiErrors[status]?.includes(parsed.data.error.code) ?? false) &&
    parsed.data.error.retryable === (status === 429 || status === 503)
  );
}
