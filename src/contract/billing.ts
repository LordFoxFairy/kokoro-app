// Narrow data projection of the pinned BFF public personal Credit reads.
import { z } from "zod"

const nonnegativeDecimal = z.string().regex(/^(?:0|[1-9][0-9]*)$/)
const signedDecimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)$/)

export const billingSummarySchema = z.object({
  credit_account_id: z.string().uuid(),
  status: z.enum(["active", "disabled"]),
  available_micros: nonnegativeDecimal,
  held_micros: nonnegativeDecimal,
}).strict()
export type BillingSummary = z.infer<typeof billingSummarySchema>

export const billingLedgerEntrySchema = z.object({
  journal_id: z.string().uuid(),
  sequence: nonnegativeDecimal,
  delta_micros: signedDecimal,
  balance_after_micros: nonnegativeDecimal,
  source_kind: z.string().min(1),
  source_ref: z.string().min(1).max(255),
  created_at: z.string().datetime(),
}).strict()
export type BillingLedgerEntry = z.infer<typeof billingLedgerEntrySchema>

export const billingLedgerSchema = z.object({
  items: z.array(billingLedgerEntrySchema),
  page: z.object({ next_cursor: z.string().max(2048).nullable() }).strict(),
}).strict()
export type BillingLedger = z.infer<typeof billingLedgerSchema>
