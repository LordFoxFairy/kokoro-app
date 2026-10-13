import { z } from "zod";

export const PERSONALIZATION_FIELD_LIMITS = {
  nickname: 128,
  occupation: 256,
  about: 2000,
  instructions: 8000,
} as const;

const codePointString = (limit: number) =>
  z.string().refine((value) => [...value].length <= limit);
const fieldsSchema = z.strictObject({
  nickname: codePointString(PERSONALIZATION_FIELD_LIMITS.nickname),
  occupation: codePointString(PERSONALIZATION_FIELD_LIMITS.occupation),
  about: codePointString(PERSONALIZATION_FIELD_LIMITS.about),
  instructions: codePointString(PERSONALIZATION_FIELD_LIMITS.instructions),
});

const snapshotSchema = z
  .strictObject({
    personalization: fieldsSchema.nullable(),
    revision: z
      .number()
      .refine(Number.isSafeInteger)
      .refine((revision) => revision >= 0),
  })
  .refine(
    (snapshot) =>
      (snapshot.personalization === null) === (snapshot.revision === 0),
  );

export const personalizationResponseSchema = z.strictObject({
  data: snapshotSchema,
});
export const personalizationSaveResponseSchema = z.strictObject({
  data: snapshotSchema.refine((snapshot) => snapshot.personalization !== null),
});
export const personalizationErrorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }).passthrough(),
  })
  .passthrough();

export type PersonalizationFields = z.infer<typeof fieldsSchema>;
export type PersonalizationSnapshot = z.infer<typeof snapshotSchema>;
