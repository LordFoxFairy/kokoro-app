// Public ledger positions are the sole shared version coordinate for live and reads.
export type FinalAnswerReference = { segmentId: string | null; revision: string }
export function mergeFinalAnswerReference(
  previous: FinalAnswerReference | undefined,
  next: FinalAnswerReference,
): FinalAnswerReference {
  if (!previous) return next
  if (BigInt(next.revision) < BigInt(previous.revision)) return previous
  if (next.revision === previous.revision && next.segmentId !== previous.segmentId) {
    throw new Error("Conflicting final answer identity at one public revision")
  }
  // An older producer may omit this optional fact; omission never revokes a proven final.
  if (previous.segmentId !== null && next.segmentId === null) return previous
  return next
}
