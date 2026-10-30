import { z } from "zod"
import {
  answerFeedbackSchema,
  answerRegenerationReceiptSchema,
  runDisplaySchema,
  answerActionIdSchema,
  answerActionErrorSchema,
  answerActionStatuses,
  type AnswerFeedback,
} from "@/contract/answer-actions"
import { parseArchivedTasksJson } from "@/lib/archived-tasks-json"
import { SessionClientError } from "./client-error"
type MessageTarget = Readonly<{ sessionId: string; messageId: string }>
const keySchema = z
  .string()
  .regex(/^[\x21-\x7E]{1,128}(?![\s\S])/u)
  .refine((v) => !v.includes(","))
async function json(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") || response.headers.has("content-encoding"))
    throw new SessionClientError("parse", "Answer action requires complete JSON")
  const declared = response.headers.get("content-length")
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(declared) || BigInt(declared) > BigInt(1048576)))
    throw new SessionClientError("parse", "Answer action exceeds response budget")
  if (!response.body) throw new SessionClientError("parse", "Answer action body absent")
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0,
    reject!: (reason: unknown) => void
  const aborted = new Promise<never>((_, no) => (reject = no)),
    stop = () => {
      void reader.cancel().catch(() => undefined)
      reject(new SessionClientError("network", "Answer action retired"))
    }
  signal.addEventListener("abort", stop, { once: true })
  try {
    if (signal.aborted) stop()
    for (;;) {
      const part = await Promise.race([reader.read(), aborted])
      if (part.done) break
      size += part.value.byteLength
      if (size > 1048576) throw Error("limit")
      chunks.push(part.value)
    }
    signal.throwIfAborted()
    if (declared !== null && BigInt(declared) !== BigInt(size)) throw Error("incomplete")
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.length
    }
    return parseArchivedTasksJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
  } catch (error) {
    if (error instanceof SessionClientError) throw error
    throw new SessionClientError("parse", "Invalid complete answer action response")
  } finally {
    signal.removeEventListener("abort", stop)
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
export function createAnswerActionsClient({ baseUrl }: { baseUrl: string }) {
  const base = baseUrl.replace(/\/+$/u, "")
  const path = (target: MessageTarget, suffix: string) =>
    `${base}/sessions/${encodeURIComponent(answerActionIdSchema.parse(target.sessionId))}/messages/${encodeURIComponent(answerActionIdSchema.parse(target.messageId))}/${suffix}`
  async function request<T>(
    url: string,
    operation: keyof typeof answerActionStatuses,
    status: number,
    schema: z.ZodType<T>,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<T> {
    const controller = new AbortController(),
      combined = AbortSignal.any([signal, controller.signal]),
      timer = setTimeout(() => controller.abort(), 10000)
    let response: Response | undefined
    const retired = new Promise<never>((_, no) =>
      combined.addEventListener("abort", () => no(new SessionClientError("network", "Answer action retired or timed out")), { once: true }),
    )
    try {
      combined.throwIfAborted()
      const work = (async () => {
        response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin", redirect: "error", signal: combined })
        const raw = await json(response, combined)
        combined.throwIfAborted()
        if (response.status !== status) {
          if (!answerActionStatuses[operation].some((value) => value === response!.status))
            throw new SessionClientError("parse", "Unexpected answer action status")
          const parsed = answerActionErrorSchema.safeParse(raw)
          if (!parsed.success) throw new SessionClientError("parse", "Invalid answer action error")
          throw new SessionClientError("http", parsed.data.error.message, parsed.data.error.code, response.status)
        }
        return schema.parse(raw)
      })()
      return await Promise.race([work, retired])
    } catch (error) {
      if (error instanceof SessionClientError) throw error
      throw new SessionClientError(combined.aborted ? "network" : "parse", "Answer action was not confirmed")
    } finally {
      clearTimeout(timer)
      controller.abort()
      void response?.body?.cancel().catch(() => undefined)
    }
  }
  return {
    async readFeedback(target: MessageTarget, signal: AbortSignal) {
      const result = await request(path(target, "feedback"), "getMessageFeedback", 200, answerFeedbackSchema, signal)
      if (result.session_id !== target.sessionId || result.message_id !== target.messageId) throw new SessionClientError("parse", "Feedback target mismatch")
      return result
    },
    async setFeedback(target: MessageTarget, value: AnswerFeedback["feedback"], signal: AbortSignal) {
      const body = JSON.stringify({ feedback: value })
      z.enum(["up", "down"]).nullable().parse(value)
      const result = await request(path(target, "feedback"), "setMessageFeedback", 200, answerFeedbackSchema, signal, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
      })
      if (result.session_id !== target.sessionId || result.message_id !== target.messageId || result.feedback !== value)
        throw new SessionClientError("parse", "Feedback target mismatch")
      return result
    },
    async regenerate(target: MessageTarget, key: string, signal: AbortSignal) {
      const result = await request(path(target, "regenerate"), "regenerateLatestAssistantMessage", 202, answerRegenerationReceiptSchema, signal, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": keySchema.parse(key) },
        body: "{}",
      })
      if (result.regenerated_from_message_id !== target.messageId || result.assistant_message_id === target.messageId)
        throw new SessionClientError("parse", "Regeneration target mismatch")
      return result
    },
    async readDisplay(target: Readonly<{ sessionId: string; runId: string }>, signal: AbortSignal) {
      const url = `${base}/sessions/${encodeURIComponent(answerActionIdSchema.parse(target.sessionId))}/runs/${encodeURIComponent(answerActionIdSchema.parse(target.runId))}/display`
      const result = await request(url, "getSessionRunDisplay", 200, runDisplaySchema, signal)
      if (result.run_id !== target.runId) throw new SessionClientError("parse", "Display Run mismatch")
      return result
    },
  }
}
export type AnswerActionsClient = ReturnType<typeof createAnswerActionsClient>
