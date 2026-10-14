import { z } from "zod";

const text = (limit: number, minimum = 0) =>
  z
    .string()
    .min(minimum)
    .max(limit)
    .refine((value) => !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value));
/** Consumer projection only; IAM owns the userinfo contract. */
export const accountUserinfoSchema = z.object({
  sub: text(256, 1),
  name: z
    .string()
    .refine((value) => value.length <= 16384)
    .nullable()
    .optional(),
  email: text(1024).nullable().optional(),
  email_verified: z.boolean().nullable().optional(),
});
export const accountProfileSchema = z
  .object({
    subject: text(256, 1),
    name: z
      .string()
      .refine((value) => value.length <= 16384)
      .nullable(),
    email: text(1024).nullable(),
    email_verified: z.boolean().nullable(),
  })
  .strict();
export const accountProfileResponseSchema = z
  .object({ data: accountProfileSchema })
  .strict();
export type AccountProfile = z.infer<typeof accountProfileSchema>;
