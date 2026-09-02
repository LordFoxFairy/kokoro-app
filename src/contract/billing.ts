// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"

export const billingSummarySchema = z
  .object({
    balance_micros: z.string().min(1),
    held_micros: z.string().min(1),
    quota_micros: z.string().min(1).nullable(),
    quota_period: z.string().min(1).nullable(),
    plan_label: z.string().min(1).optional(),
    free_credit_micros: z.string().min(1).optional(),
    daily_refresh_micros: z.string().min(1).nullable().optional(),
    daily_refresh_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  })
  .strict()
export type BillingSummary = z.infer<typeof billingSummarySchema>

export const billingLedgerEntrySchema = z
  .object({
    entry_id: z.string().min(1),
    delta_micros: z.string().min(1),
    reason: z.string().min(1),
    created_at: z.number().int(),
    balance_after_micros: z.string().min(1),
    run_id: z.string().min(1).nullable().optional(),
    conversation_id: z.string().min(1).nullable().optional(),
    title: z.string().min(1).nullable().optional(),
  })
  .strict()
export type BillingLedgerEntry = z.infer<typeof billingLedgerEntrySchema>

export const billingLedgerSchema = z
  .object({
    entries: z.array(billingLedgerEntrySchema),
    next_cursor: z.string().min(1).optional(),
  })
  .strict()
export type BillingLedger = z.infer<typeof billingLedgerSchema>

export const billingByModelItemSchema = z
  .object({
    model_binding_id: z.string().min(1).nullable(),
    model_name: z.string().min(1),
    spent_micros: z.string().min(1),
    run_count: z.number().int(),
  })
  .strict()
export type BillingByModelItem = z.infer<typeof billingByModelItemSchema>

export const billingByModelSchema = z
  .object({
    period_start: z.string().min(1),
    items: z.array(billingByModelItemSchema),
  })
  .strict()
export type BillingByModel = z.infer<typeof billingByModelSchema>
