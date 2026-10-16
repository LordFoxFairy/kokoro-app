import { z } from "zod";

const profileId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u);
const stateVersion = z.string().regex(/^[1-9][0-9]{0,15}(?![\s\S])/u);
const environmentName = z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}(?![\s\S])/u);
export const customApiCommandKeySchema = z.string().regex(/^[\x21-\x7e]{1,191}(?![\s\S])/u);
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
      (value.instructions !== undefined && value.clear_instructions) ||
      (value.name === undefined &&
        value.instructions === undefined &&
        !value.clear_instructions &&
        upserts.length === 0 &&
        removals.length === 0) ||
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
