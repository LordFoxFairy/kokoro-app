// Runtime-validated engine projection. This is an internal reducer input, not
// the Web ↔ BFF wire DTO; canonical AG-UI frames are validated before mapping.

import { z } from "zod"

import { interactionStateSchema } from "@/contract/control"
import { agentFailureProfileSchema } from "@/contract/agent-failure"
import { runProcessActivitySchema } from "@/contract/agui-events"

const todoSchema = z
  .object({
    content: z.string().min(1),
    status: z.enum(["pending", "in_progress", "completed"]),
  })
  .strict()

const tokenUsageSchema = z
  .object({
    input_tokens: z.number().int(),
    output_tokens: z.number().int(),
  })
  .strict()

const sessionCreatedPayload = z
  .object({
    title: z.string().min(1),
    owner_id: z.string().min(1),
  })
  .strict()

const runCreatedPayload = z
  .object({
    run_id: z.string().min(1),
  })
  .strict()

const messageUserPayload = z
  .object({
    message_id: z.string().min(1),
    content: z.string(),
  })
  .strict()

const messageDeltaPayload = z
  .object({
    segment_id: z.string().min(1),
    // 流上文本恒为 assistant，无 role 字段；角色由 segment 归属决定。
    delta: z.string(),
    // Internal provenance only; omitted on ordinary text deltas.
    text_boundary: z.enum(["start", "end"]).optional(),
  })
  .strict()

const messageCompletedPayload = z
  .object({
    segment_id: z.string().min(1),
    content: z.string(),
  })
  .strict()

const thinkingDeltaPayload = z
  .object({
    segment_id: z.string().min(1),
    delta: z.string(),
  })
  .strict()

const toolInvokedPayload = z
  .object({
    segment_id: z.string().min(1),
    tool_id: z.string().min(1),
    name: z.string().min(1),
    args: z.record(z.unknown()),
  })
  .strict()

const toolOutputDeltaPayload = z
  .object({
    segment_id: z.string().min(1),
    tool_id: z.string().min(1),
    name: z.string().min(1),
    // 长执行工具的增量输出（如 execute）；每工具累计上限同 result 护栏，超限静默停发（终值仍走 tool.returned）。
    delta: z.string(),
  })
  .strict()

const toolReturnedPayload = z
  .object({
    segment_id: z.string().min(1),
    tool_id: z.string().min(1),
    name: z.string().min(1),
    result: z.string(),
    // 严格必填 fail-loud：生产端始终发送；缺失即报错，绝不用默认 false 掩盖真失败。
    is_error: z.boolean(),
    // wire 展示层截断标记：缺席=结果完整，true=已截断（完整结果在工作区文件，预览经 files 端点取）。
    truncated: z.boolean().optional(),
    rejected: z.boolean().optional(),
    reject_reason: z.string().optional(),
    responded: z.boolean().optional(),
    summary: z.record(z.unknown()).optional(),
  })
  .strict()

const deliveryCreatedPayload = z
  .object({
    artifact_id: z.string().min(1),
    asset_id: z.string().min(1),
    artifact_kind: z.enum(["document", "code", "image", "audio", "video", "data", "archive", "other"]),
    tool_call_id: z.string().min(1),
    path: z.string().min(1),
    title: z.string().min(1),
    mime: z.string().min(1),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/u),
    note: z.string().optional(),
  })
  .strict()

const todoUpdatedPayload = z
  .object({
    todos: z.array(todoSchema),
  })
  .strict()

const subagentStartedPayload = z
  .object({
    segment_id: z.string().min(1),
    subagent_id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    subagent_type: z.string().min(1),
    source: z.enum(["built-in", "config-custom", "runtime-custom"]),
  })
  .strict()

const subagentFinishedPayload = z
  .object({
    segment_id: z.string().min(1),
    subagent_id: z.string().min(1),
    name: z.string().min(1),
    subagent_type: z.string().min(1),
    source: z.enum(["built-in", "config-custom", "runtime-custom"]),
    failed: z.boolean().optional(),
    error: z.string().optional(),
  })
  .strict()

const subagentThinkingDeltaPayload = z
  .object({
    segment_id: z.string().min(1),
    subagent_id: z.string().min(1),
    delta: z.string(),
  })
  .strict()

const subagentTextDeltaPayload = z
  .object({
    segment_id: z.string().min(1),
    subagent_id: z.string().min(1),
    text: z.string(),
  })
  .strict()

const subagentTextCompletedPayload = z
  .object({
    segment_id: z.string().min(1),
    subagent_id: z.string().min(1),
    text: z.string(),
  })
  .strict()

const subagentToolInvokedPayload = z
  .object({
    segment_id: z.string().min(1),
    subagent_id: z.string().min(1),
    tool_id: z.string().min(1),
    name: z.string().min(1),
    // 子代理内工具过程可见性通道；HITL 审批仍走主通道嵌套帧，无输出增量通道（终值走 returned）。
    args: z.record(z.unknown()),
  })
  .strict()

const subagentToolReturnedPayload = z
  .object({
    segment_id: z.string().min(1),
    subagent_id: z.string().min(1),
    tool_id: z.string().min(1),
    name: z.string().min(1),
    result: z.string(),
    is_error: z.boolean(),
    // 同 tool.returned.truncated：缺席=结果完整。
    truncated: z.boolean().optional(),
  })
  .strict()

const runCompletedPayload = z
  .object({
    status: z.enum(["completed", "cancelled"]),
    // agent 认真算的用量全链路贯通；无用量时为 null。
    token_usage: tokenUsageSchema.nullable().optional(),
  })
  .strict()

const runFailedPayload = z
  .object({
    profile: agentFailureProfileSchema,
  })
  .strict()

const dispatchRunFailedPayload = z.object({}).strict()

const envelope = z
  .object({
    event_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    session_id: z.string().min(1),
    run_id: z.string().min(1),
    timestamp: z.string().min(1),
  })
  .strict()

export const chatProjectionEventSchema = z.discriminatedUnion("kind", [
  envelope.extend({ kind: z.literal("session.created"), payload: sessionCreatedPayload }),
  envelope.extend({ kind: z.literal("run.created"), payload: runCreatedPayload }),
  envelope.extend({ kind: z.literal("interaction.state"), payload: interactionStateSchema }),
  envelope.extend({ kind: z.literal("message.user"), payload: messageUserPayload }),
  envelope.extend({ kind: z.literal("message.delta"), payload: messageDeltaPayload }),
  envelope.extend({ kind: z.literal("message.completed"), payload: messageCompletedPayload }),
  envelope.extend({ kind: z.literal("thinking.delta"), payload: thinkingDeltaPayload }),
  envelope.extend({ kind: z.literal("tool.invoked"), payload: toolInvokedPayload }),
  envelope.extend({ kind: z.literal("tool.output.delta"), payload: toolOutputDeltaPayload }),
  envelope.extend({ kind: z.literal("tool.returned"), payload: toolReturnedPayload }),
  envelope.extend({ kind: z.literal("delivery.created"), payload: deliveryCreatedPayload }),
  envelope.extend({ kind: z.literal("todo.updated"), payload: todoUpdatedPayload }),
  envelope.extend({ kind: z.literal("activity.updated"), payload: runProcessActivitySchema }),
  envelope.extend({ kind: z.literal("subagent.started"), payload: subagentStartedPayload }),
  envelope.extend({ kind: z.literal("subagent.finished"), payload: subagentFinishedPayload }),
  envelope.extend({ kind: z.literal("subagent.thinking.delta"), payload: subagentThinkingDeltaPayload }),
  envelope.extend({ kind: z.literal("subagent.text.delta"), payload: subagentTextDeltaPayload }),
  envelope.extend({ kind: z.literal("subagent.text.completed"), payload: subagentTextCompletedPayload }),
  envelope.extend({ kind: z.literal("subagent.tool.invoked"), payload: subagentToolInvokedPayload }),
  envelope.extend({ kind: z.literal("subagent.tool.returned"), payload: subagentToolReturnedPayload }),
  envelope.extend({ kind: z.literal("run.completed"), payload: runCompletedPayload }),
  envelope.extend({ kind: z.literal("run.failed"), payload: runFailedPayload }),
  z.object({
    event_id: z.string().min(1), sourceSequence: z.string().regex(/^[1-9][0-9]*$/u),
    session_id: z.string().min(1), run_id: z.string().min(1), timestamp: z.string().min(1),
    kind: z.literal("run.queued"), payload: z.object({ run_id: z.string().min(1), dispatch_sequence: z.string().regex(/^[1-9][0-9]*$/u) }).strict(),
  }).strict(),
  z.object({
    event_id: z.string().min(1),
    sourceSequence: z.string().regex(/^[1-9][0-9]*$/u),
    session_id: z.string().min(1),
    run_id: z.string().min(1),
    timestamp: z.string().min(1),
    kind: z.literal("run.dispatch_failed"),
    payload: dispatchRunFailedPayload,
  }).strict(),
])

export type ChatProjectionEvent = z.infer<typeof chatProjectionEventSchema>
export type ChatProjectionEventKind = ChatProjectionEvent["kind"]

export function parseChatProjectionEvent(input: unknown): ChatProjectionEvent {
  return chatProjectionEventSchema.parse(input)
}
