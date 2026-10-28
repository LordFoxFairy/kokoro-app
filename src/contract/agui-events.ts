import {actionTitleSchema,runDisplaySkillSchema,safeVirtualPathSchema} from "./answer-actions"
// Web ↔ BFF streaming wire contract. This module validates canonical AG-UI
// frames only; reducer/UI projection belongs to the engine adapter.

import { EventSchemas, EventType, RunFinishedOutcomeSchema } from "@ag-ui/core"
import { z } from "zod"
import { BFF_TOOL_DISPLAY_CODES, BFF_TOOL_DISPLAY_DETAIL_PROFILE } from "@/generated/bff-tool-display"

import { interactionStateSchema } from "./control"
import { agentFailureCodeSchema, agentFailureProfileSchema } from "./agent-failure"

export const eventCursorSchema = z.string().regex(/^agui_[0-9a-f]{32}$/u)
export type EventCursor = z.infer<typeof eventCursorSchema>
const unicodeString = (max: number) => z.string().min(1).refine((value) => Array.from(value).length <= max)
export const runTodoSchema = z.object({ content: unicodeString(1024), status: z.enum(["pending", "in_progress", "completed"]) }).strict()
const activityIdSchema = z.string().regex(/^act_[0-9a-f]{64}$/u)
const segmentIdSchema = z.string().regex(/^seg_[0-9a-f]{64}$/u)
const detailProfile = BFF_TOOL_DISPLAY_DETAIL_PROFILE
const forbiddenDetailUnicode = new RegExp(detailProfile.forbiddenUnicodeCategories.map((category) => `\\p{${category}}`).join("|"), "u")
const fileDetailNamePattern = new RegExp(detailProfile.fileNamePattern, "u")
const toolDisplayDetailSchema = z.object({
  kind: z.enum(detailProfile.kinds),
  virtual_path:safeVirtualPathSchema.optional(),
  name: z.string().superRefine((value, context) => {
    const scalars = Array.from(value).length
    if (scalars < detailProfile.nameMinScalars || scalars > detailProfile.nameMaxScalars || new TextEncoder().encode(value).length > detailProfile.nameMaxUtf8Bytes || value.normalize(detailProfile.normalization) !== value || forbiddenDetailUnicode.test(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid safe tool target name" })
    }
  }),
}).strict()
const toolActivitySchema = z.object({ activity: z.literal("tool"), activity_id: activityIdSchema, segment_id: segmentIdSchema, status: z.enum(["running", "completed", "failed"]), display_code: z.enum(BFF_TOOL_DISPLAY_CODES), action_title: actionTitleSchema.optional(), display_detail: toolDisplayDetailSchema.optional() }).strict().superRefine((value, context) => {
  const detail = value.display_detail
  if (!detail) return
  if(detail.virtual_path!==undefined&&(detail.kind!=="file"||detail.virtual_path.split("/").at(-1)!==detail.name)){context.addIssue({code:z.ZodIssueCode.custom,path:["display_detail"],message:"invalid exact file path"})}
  if (!detailProfile.codesByKind[detail.kind].some((code) => code === value.display_code) || (detail.kind === "file" && !fileDetailNamePattern.test(detail.name))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["display_detail"], message: "tool target does not match its owner category" })
  }
})
const subagentActivitySchema = z.object({ activity: z.literal("subagent"), activity_id: activityIdSchema, segment_id: segmentIdSchema, status: z.enum(["running", "completed", "failed"]), display_code: z.literal("subagent.execution") }).strict()
const skillActivitySchema = z.object({ activity: z.literal("skill"), activity_id: activityIdSchema, preflight_id: z.string().regex(/^spf_[0-9a-f]{64}$/u), source_refs: z.array(z.string().regex(/^skill:(?!skill:)[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u)).min(1).max(16).refine((items) => new Set(items).size === items.length), display_skills:z.array(runDisplaySkillSchema).max(16).optional(), phase: z.enum(["resolving", "loading", "ready", "failed"]), error_code: z.enum(["skill_resolve_failed", "skill_load_failed"]).optional() }).strict().superRefine((value, context) => {
  if(value.display_skills!==undefined&&(value.phase!=="ready"||new Set(value.display_skills.map(item=>item.source_ref)).size!==value.display_skills.length||value.display_skills.some(item=>!value.source_refs.includes(item.source_ref))))context.addIssue({code:z.ZodIssueCode.custom,path:["display_skills"],message:"Skill display differs from original refs"})
  if ((value.phase === "failed") !== (value.error_code !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error_code"], message: "invalid conditional error_code" })
})
export const runProcessActivitySchema = z.union([toolActivitySchema, subagentActivitySchema, skillActivitySchema])

const nonblankString = z.string().min(1).refine((value) => value.trim().length > 0, "must not be blank")

export const kokoroAgUiMetadataSchema = z
  .object({
    event_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    public_sequence: z.string().regex(/^[1-9][0-9]{0,18}(?![\s\S])/u).refine((value) => BigInt(value) <= BigInt("9223372036854775807")),
    session_id: z.string().min(1),
    run_id: z.string().min(1).nullable(),
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict()

const agentRunErrorMetadataSchema = kokoroAgUiMetadataSchema
  .extend({
    run_id: nonblankString,
    failure: agentFailureProfileSchema,
  })
  .strict()

const dispatchRunErrorMetadataSchema = z
  .object({
    event_id: z.string().min(1),
    seq: z.string().regex(/^[1-9][0-9]*$/u),
    source_owner: z.literal("kokoro-bff"),
    public_sequence: z.string().regex(/^[1-9][0-9]{0,18}(?![\s\S])/u).refine((value) => BigInt(value) <= BigInt("9223372036854775807")),
    session_id: z.string().min(1),
    run_id: nonblankString,
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict()

const base = z
  .object({
    timestamp: z.number().int().nonnegative(),
    metadata: z.object({ kokoro: kokoroAgUiMetadataSchema }).strict(),
  })
  .strict()

const runStartedSchema = base.extend({
  type: z.literal(EventType.RUN_STARTED),
  threadId: z.string().min(1),
  runId: z.string().min(1),
})

const runFinishedSchema = base.extend({
  type: z.literal(EventType.RUN_FINISHED),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  // BFF's completed/cancelled projection carries an explicit status and
  // canonical AG-UI outcome. Keep both declared rather than accepting
  // arbitrary top-level fields from an untrusted stream.
  status: z.enum(["completed", "cancelled"]).optional(),
  result: z.unknown().optional(),
  outcome: RunFinishedOutcomeSchema.optional(),
  usage: z.array(z.record(z.unknown())).optional(),
})

const agentRunErrorSchema = z
  .object({
    type: z.literal(EventType.RUN_ERROR),
    timestamp: z.number().int().nonnegative(),
    threadId: z.string().min(1),
    runId: nonblankString,
    message: z.literal("Agent run failed"),
    code: agentFailureCodeSchema,
    metadata: z.object({ kokoro: agentRunErrorMetadataSchema }).strict(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.code !== event.metadata.kokoro.failure.code) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["code"], message: "code must match metadata failure" })
    }
  })

const dispatchRunErrorSchema = z
  .object({
    type: z.literal(EventType.RUN_ERROR),
    timestamp: z.number().int().nonnegative(),
    threadId: z.string().min(1),
    runId: nonblankString,
    message: z.literal("Agent launch could not be confirmed"),
    code: nonblankString,
    metadata: z.object({ kokoro: dispatchRunErrorMetadataSchema }).strict(),
  })
  .strict()

const eventSchema = z.union([
  runStartedSchema,
  runFinishedSchema,
  agentRunErrorSchema,
  dispatchRunErrorSchema,
  base.extend({
    type: z.literal(EventType.TEXT_MESSAGE_START),
    messageId: z.string().min(1),
    role: z.literal("assistant"),
  }),
  base.extend({
    type: z.literal(EventType.TEXT_MESSAGE_CONTENT),
    messageId: z.string().min(1),
    delta: z.string(),
  }),
  base.extend({
    type: z.literal(EventType.TEXT_MESSAGE_END),
    messageId: z.string().min(1),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_START),
    toolCallId: z.string().min(1),
    toolCallName: z.string().min(1),
    parentMessageId: z.string().min(1).optional(),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_ARGS),
    toolCallId: z.string().min(1),
    delta: z.string(),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_END),
    toolCallId: z.string().min(1),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_RESULT),
    messageId: z.string().min(1),
    toolCallId: z.string().min(1),
    content: z.string(),
    role: z.literal("tool").optional(),
    isError: z.boolean().optional(),
  }),
  z.object({
    type: z.literal(EventType.CUSTOM), name: z.literal("kokoro.run.queued"),
    value: z.object({ run_id: nonblankString, dispatch_sequence: z.string().regex(/^[1-9][0-9]*$/u) }).strict(),
    timestamp: z.number().int().nonnegative(), metadata: z.object({ kokoro: dispatchRunErrorMetadataSchema }).strict(),
  }).strict().superRefine((event, context) => {
    if (event.value.run_id !== event.metadata.kokoro.run_id || event.value.dispatch_sequence !== event.metadata.kokoro.seq) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Queued source identity mismatch" })
    }
  }),
  base.extend({ type: z.literal(EventType.CUSTOM), name: z.literal("kokoro.interaction.state"), value: interactionStateSchema }),
  base.extend({ type: z.literal(EventType.CUSTOM), name: z.literal("kokoro.activity.updated"), value: runProcessActivitySchema }),
  base.extend({ type: z.literal(EventType.CUSTOM), name: z.literal("kokoro.todo.updated"), value: z.object({ todos: z.array(runTodoSchema).max(100) }).strict() }),
  base.extend({
    type: z.literal(EventType.CUSTOM),
    name: z.enum(["kokoro.delivery.created", "kokoro.session.created", "kokoro.message.user"]),
    value: z.unknown(),
  }),
])

export const agUiEventSchema = eventSchema.superRefine((event, context) => {
  if (event.type !== EventType.RUN_STARTED && event.type !== EventType.RUN_FINISHED && event.type !== EventType.RUN_ERROR) {
    return
  }
  const metadata = event.metadata.kokoro
  if (event.threadId !== metadata.session_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["threadId"],
      message: "threadId must match metadata.kokoro.session_id",
    })
  }
  if (event.runId !== metadata.run_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["runId"],
      message: "runId must match metadata.kokoro.run_id",
    })
  }
})

export type AgUiEvent = z.infer<typeof agUiEventSchema>
export type KokoroAgUiMetadata = z.infer<typeof kokoroAgUiMetadataSchema>

export function parseAgUiEvent(input: unknown): AgUiEvent {
  // The upstream package checks the standard event lifecycle shape first;
  // the local schema then requires Kokoro's replay metadata and supported set.
  EventSchemas.parse(input)
  return agUiEventSchema.parse(input)
}
