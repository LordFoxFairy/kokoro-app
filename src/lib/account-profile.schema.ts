import { z } from "zod"

const text = (limit: number, minimum = 0) =>
  z
    .string()
    .min(minimum)
    .max(limit)
    .refine((value) => !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value))

/** Consumer projection of the IAM-owned account profile contract. */
export const accountProfileSchema = z
  .strictObject({
    subject: text(256, 1),
    name: text(16384),
    email: text(1024),
    email_verified: z.boolean(),
  })
export const accountProfileResponseSchema = z.strictObject({ data: accountProfileSchema })
/** UI snapshots retain the historical nullable display shape while live reads are strict strings. */
export type AccountProfile = {
  subject: string
  name: string
  email: string | null
  email_verified: boolean | null
}
