import type { Segment } from "@/core/projections"
import type { MessagePartsState, SessionMessage } from "@/core/state"

/** No backward scan, inferred last answer, or moving content across a real boundary. */
export function completedTurnSections(args: {
  runId: string | undefined
  succeeded: boolean
  partsComplete: boolean
  finalSegmentId: string | undefined
  segments: readonly Segment[]
  messagesById: Readonly<Record<string, SessionMessage>>
}): { process: readonly Segment[]; final: Segment } | null {
  if (!args.succeeded || !args.partsComplete || !args.runId || !args.finalSegmentId) return null
  const message = args.messagesById[args.finalSegmentId]
  if (!message || message.role !== "assistant" || message.runId !== args.runId || message.textState !== "completed") return null
  const index = args.segments.findIndex(segment => segment.segmentId === args.finalSegmentId)
  if (index < 1 || index !== args.segments.length - 1) return null
  const final = args.segments[index]!
  if (final.activities.length || final.tools.length || final.subagents.length) return null
  return { process: args.segments.slice(0, index), final }
}

/** A terminal identity alone does not prove that its paged body is in the UI. */
export function finalAnswerPartsComplete(reference: { segmentId: string | null; revision: string } | undefined, parts: Readonly<Record<string, MessagePartsState>> | undefined, runId: string): boolean {
  return Boolean(reference?.segmentId && Object.values(parts ?? {}).some(part => part.runId === runId && part.status === "complete" && part.confirmedRevision !== undefined && BigInt(part.confirmedRevision) >= BigInt(reference.revision)))
}
