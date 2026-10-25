import { z } from "zod";
import { connectorCreationKeySchema } from "@/hub/connector-creation-key.schema";
import { mcpConnectorSchema } from "@/hub/mcp-connector.schema";
import { mcpPublicationErrorPolicy } from "@/hub/mcp-project-publication-error";
import { mcpPublicationInputSchema, publicationIdSchema, type McpPublicationIdentity } from "@/hub/mcp-project-publication.schema";
import type { McpServerCreationCompletion } from "./mcp-server-creation-flow";

export type PublicationRecoveryRecord = Readonly<{
  subject: string;
  target: McpServerCreationCompletion;
  original: McpPublicationIdentity;
  key: string;
  failure?: Readonly<{ status: number; code: string; retryable: boolean }> | undefined;
}>;
export interface PublicationRecoveryJournal {
  read(subject: string): Promise<PublicationRecoveryRecord | null>;
  reserve(record: PublicationRecoveryRecord): Promise<PublicationRecoveryRecord>;
  markFailure(record: PublicationRecoveryRecord, failure?: PublicationRecoveryRecord["failure"]): Promise<PublicationRecoveryRecord | null>;
  compareClear(record: PublicationRecoveryRecord, options?: { firstRejectionOnly: true }): Promise<boolean>;
}

const subjectSchema = z.string().min(1);
const failureSchema = z.object({ status: z.number().int(), code: z.string(), retryable: z.boolean() }).strict()
  .refine(value => mcpPublicationErrorPolicy(value.status, value) !== null);
const recordSchema = z.object({
  subject: subjectSchema,
  target: z.object({ serverId: publicationIdSchema, connectorId: publicationIdSchema, providerKey: mcpConnectorSchema.shape.provider_key }).strict(),
  original: z.unknown(), key: connectorCreationKeySchema, failure: failureSchema.optional(),
}).strict();
const envelopeSchema = z.object({ version: z.literal(1), record: z.unknown(), failureRecorded: z.boolean() }).strict();
type Envelope = { version: 1; record: PublicationRecoveryRecord; failureRecorded: boolean };

function decodeRecord(value: unknown): PublicationRecoveryRecord {
  const parsed = recordSchema.parse(value);
  if (parsed.original === null || typeof parsed.original !== "object" || Array.isArray(parsed.original)) throw new Error("Invalid publication original");
  const { server_id: serverId, ...input } = parsed.original as { server_id?: unknown };
  const original = { server_id: publicationIdSchema.parse(serverId), ...mcpPublicationInputSchema.parse(input) };
  if (original.server_id !== parsed.target.serverId || original.connector_id !== parsed.target.connectorId) throw new Error("Publication target binding mismatch");
  for (const target of original.targets) {
    if ("current" in target.expected_pin) Object.freeze(target.expected_pin.current);
    Object.freeze(target.expected_pin); Object.freeze(target);
  }
  Object.freeze(original.targets); Object.freeze(original);
  return Object.freeze({ subject: parsed.subject, target: Object.freeze(parsed.target), original, key: parsed.key,
    ...(parsed.failure === undefined ? {} : { failure: Object.freeze(parsed.failure) }) });
}
function decodeEnvelope(value: unknown, subject: string): Envelope {
  const parsed = envelopeSchema.parse(value), record = decodeRecord(parsed.record);
  if (record.subject !== subject || !parsed.failureRecorded && record.failure !== undefined) throw new Error("Publication journal binding mismatch");
  return { version: 1, record, failureRecorded: parsed.failureRecorded };
}
function sameRecord(left: PublicationRecoveryRecord, right: PublicationRecoveryRecord): boolean {
  // Both inputs have passed the same closed decoder, fixing object field order but preserving target array order.
  return left.subject === right.subject && left.key === right.key && JSON.stringify(left.target) === JSON.stringify(right.target) &&
    JSON.stringify(left.original) === JSON.stringify(right.original);
}
function sameFailure(left: PublicationRecoveryRecord["failure"], right: PublicationRecoveryRecord["failure"]): boolean {
  return left !== undefined && right !== undefined && left.status === right.status && left.code === right.code && left.retryable === right.retryable;
}
function nextFailure(current: Envelope, proposed: PublicationRecoveryRecord["failure"]): PublicationRecoveryRecord["failure"] {
  if (!current.failureRecorded) return proposed;
  const previous = current.record.failure;
  // Missing after any recorded failure is a durable inspection lock, not an unattempted reservation.
  if (previous === undefined) return undefined;
  const previousPolicy = mcpPublicationErrorPolicy(previous.status, previous);
  const proposedPolicy = proposed === undefined ? null : mcpPublicationErrorPolicy(proposed.status, proposed);
  if (previousPolicy?.recovery === "inspect_owner") return previous;
  if (previousPolicy?.first_rejection_allows_revised_command) {
    // Only the unchanged first-known rejection keeps its qualification. A later uncertainty
    // (including a same-command response) must prevent another tab from clearing its stale rejection.
    if (sameFailure(previous, proposed)) return previous;
    return proposedPolicy?.recovery === "inspect_owner" ? proposed : undefined;
  }
  // A retryable/admission outcome is already historical uncertainty: a late 400/412 is not first-known.
  return proposedPolicy?.first_rejection_allows_revised_command ? undefined : proposed;
}

/** Browser intents only. This journal neither authenticates actors nor sends requests; callers require fresh admission. */
export function createBrowserMcpProjectPublicationRecovery(): PublicationRecoveryJournal {
  let opened: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    if (opened) return opened;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let failed = false;
      const fail = () => { failed = true; reject(new Error("MCP publication recovery storage unavailable")); };
      try {
        const request = window.indexedDB.open("kokoro-mcp-project-publication", 1);
        request.onupgradeneeded = () => {
          try { request.result.createObjectStore("intents"); }
          catch { request.transaction?.abort(); fail(); }
        };
        request.onerror = request.onblocked = fail;
        request.onsuccess = () => {
          const db = request.result;
          if (failed) { db.close(); return; }
          db.onversionchange = () => { db.close(); if (opened === pending) opened = undefined; };
          resolve(db);
        };
      } catch { fail(); }
    });
    opened = pending;
    void pending.catch(() => { if (opened === pending) opened = undefined; });
    return pending;
  };
  const transaction = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, accept: (value: T) => void) => void): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let result: { value: T } | undefined;
      const tx = db.transaction("intents", mode, { durability: "strict" });
      const fail = () => reject(new Error("MCP publication recovery transaction unavailable"));
      tx.onabort = tx.onerror = fail;
      // A successful request is not a committed journal: network dispatch must await this result.
      tx.oncomplete = () => result ? resolve(result.value) : fail();
      try { action(tx.objectStore("intents"), value => { result = { value }; }); }
      catch { tx.abort(); fail(); }
    });
  };
  const storageKey = (subject: string) => JSON.stringify([subject]);
  const read = (store: IDBObjectStore, subject: string, apply: (value: Envelope | null) => void) => {
    const request = store.get(storageKey(subject));
    request.onsuccess = () => {
      try { apply(request.result === undefined ? null : decodeEnvelope(request.result, subject)); }
      catch { store.transaction.abort(); }
    };
  };
  return {
    read: async subject => {
      subjectSchema.parse(subject);
      return transaction("readonly", (store, accept) => read(store, subject, current => accept(current?.record ?? null)));
    },
    reserve: async value => {
      const record = decodeRecord(value);
      return transaction("readwrite", (store, accept) => read(store, record.subject, current => {
        if (current) { accept(current.record); return; }
        const envelope: Envelope = { version: 1, record, failureRecorded: record.failure !== undefined };
        const write = store.add(envelope, storageKey(record.subject));
        write.onsuccess = () => accept(record);
      }));
    },
    markFailure: async (value, failure) => {
      const record = decodeRecord(value), proposed = failure === undefined ? undefined : failureSchema.parse(failure);
      return transaction("readwrite", (store, accept) => read(store, record.subject, current => {
        if (!current || !sameRecord(current.record, record)) { accept(null); return; }
        const next = decodeRecord({ ...current.record, failure: nextFailure(current, proposed) });
        const write = store.put({ version: 1, record: next, failureRecorded: true } satisfies Envelope, storageKey(record.subject));
        write.onsuccess = () => accept(next);
      }));
    },
    compareClear: async (value, options) => {
      const record = decodeRecord(value);
      return transaction("readwrite", (store, accept) => read(store, record.subject, current => {
        if (!current || !sameRecord(current.record, record)) { accept(false); return; }
        if (options?.firstRejectionOnly) {
          const failure = current.record.failure;
          if (!current.failureRecorded || !sameFailure(failure, record.failure) || failure === undefined ||
            !mcpPublicationErrorPolicy(failure.status, failure)?.first_rejection_allows_revised_command) { accept(false); return; }
        }
        const deletion = store.delete(storageKey(record.subject));
        deletion.onsuccess = () => accept(true);
      }));
    },
  };
}
