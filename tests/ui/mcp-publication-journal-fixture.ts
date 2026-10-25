import type { PublicationRecoveryJournal, PublicationRecoveryRecord } from "@/ui/mcp/mcp-project-publication-recovery";
import { mcpPublicationErrorPolicy } from "@/hub/mcp-project-publication-error";
/** Explicit in-memory test port, not a production fallback or IndexedDB integration. */
export function createTestPublicationJournal(): PublicationRecoveryJournal {
  let pending: PublicationRecoveryRecord | null = null, failureRecorded = false;
  const exact = (value: PublicationRecoveryRecord) => pending?.subject === value.subject && pending.key === value.key && JSON.stringify(pending.original) === JSON.stringify(value.original);
  return {
    read: async subject => pending?.subject === subject ? structuredClone(pending) : null,
    reserve: async value => { if (!pending) { pending = structuredClone(value); failureRecorded = false; } return structuredClone(pending); },
    markFailure: async (value, failure) => {
      if (!exact(value) || !pending) return null;
      const previous = pending.failure ? mcpPublicationErrorPolicy(pending.failure.status, pending.failure) : null;
      const next = failureRecorded && previous?.recovery !== "same_command" ? previous?.recovery === "revise_command" ? undefined : pending.failure : failure;
      pending = { ...pending, failure: next }; failureRecorded = true; return structuredClone(pending);
    },
    compareClear: async (value, options) => {
      if (!exact(value)) return false;
      if (options?.firstRejectionOnly && (!pending?.failure || !mcpPublicationErrorPolicy(pending.failure.status, pending.failure)?.first_rejection_allows_revised_command)) return false;
      pending = null; failureRecorded = false; return true;
    },
  };
}
