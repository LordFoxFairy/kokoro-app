import { z } from "zod";
import { mcpConnectorIdSchema, mcpConnectorStateVersionSchema } from "@/hub/mcp-connector.schema";
import { connectorCreationKeySchema } from "@/hub/connector-creation-key.schema";
import { BFF_CONNECTOR_COMMAND_ERROR_POLICY as policy } from "@/generated/bff-connector-command-errors";
import { connectorCommandMayResume, type ConnectorCommandFailure } from "./connector-command-failure";

export const mcpPreparationTargetSchema = z.object({
  serverId: mcpConnectorIdSchema, connectorId: mcpConnectorIdSchema, version: mcpConnectorStateVersionSchema,
}).strict();
export type McpPreparationTarget = Readonly<z.infer<typeof mcpPreparationTargetSchema>>;
const recordSchema = z.object({
  subject: z.string().min(1), target: mcpPreparationTargetSchema, key: connectorCreationKeySchema,
  failure: z.custom<ConnectorCommandFailure>(value => typeof value === "string" && (Object.hasOwn(policy.mcp, value) || Object.hasOwn(policy.mcp_preconditions, value))).optional(),
}).strict();
export type McpPreparationRecord = Readonly<{
  subject: string; target: McpPreparationTarget; key: string; failure?: ConnectorCommandFailure | undefined;
}>;
export interface McpPreparationRecovery {
  list(subject: string): Promise<readonly McpPreparationRecord[]>;
  current(subject: string, serverId: string): Promise<McpPreparationRecord | undefined>;
  reserve(subject: string, target: McpPreparationTarget, key: string): Promise<{ record: McpPreparationRecord; created: boolean }>;
  failure(record: McpPreparationRecord, failure: ConnectorCommandFailure | undefined): Promise<void>;
  complete(record: McpPreparationRecord): Promise<void>;
}
const policyRefSchema = z.object({
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u),
  profile: z.string().regex(/^[\x21-\x7e]{1,128}(?![\s\S])/u),
  version: z.string().regex(/^[\x21-\x7e]{1,128}(?![\s\S])/u),
}).strict();
const retirementSchema = z.object({
  disposition: z.enum(["unknown_fenced", "definite_rejected"]), policy_ref: policyRefSchema,
}).strict();
const retiredSchema = retirementSchema.extend({
  schema_version: z.literal(2), subject: recordSchema.shape.subject,
  target: mcpPreparationTargetSchema, key: connectorCreationKeySchema, retired_at: z.string().datetime(),
}).strict();
const historyCursorSchema = z.object({
  subject: recordSchema.shape.subject, serverId: mcpConnectorIdSchema,
  key: connectorCreationKeySchema, version: mcpConnectorStateVersionSchema,
}).strict();
export type McpPreparationDisposition = z.infer<typeof retirementSchema>["disposition"];
export type McpPreparationPolicyRef = Readonly<z.infer<typeof policyRefSchema>>;
export type McpPreparationRetirement = Readonly<Omit<z.infer<typeof retirementSchema>, "policy_ref"> & { policy_ref: McpPreparationPolicyRef }>;
export type McpRetiredPreparationRecord = Readonly<Omit<z.infer<typeof retiredSchema>, "target" | "policy_ref"> & { target: McpPreparationTarget; policy_ref: McpPreparationPolicyRef }>;
export type McpPreparationHistoryCursor = Readonly<z.infer<typeof historyCursorSchema>>;
export interface McpPreparationJournal extends McpPreparationRecovery {
  retireWaiting(record: McpPreparationRecord, retirement: McpPreparationRetirement, signal?: AbortSignal): Promise<McpRetiredPreparationRecord>;
  getRetired(record: McpPreparationRecord): Promise<McpRetiredPreparationRecord | undefined>;
  listRetired(subject: string, serverId: string, options?: Readonly<{ limit?: number; after?: McpPreparationHistoryCursor }>):
    Promise<Readonly<{ items: readonly McpRetiredPreparationRecord[]; nextCursor: McpPreparationHistoryCursor | null }>>;
}
function decodeRetired(value: unknown, key: IDBValidKey): McpRetiredPreparationRecord {
  const parsed = retiredSchema.parse(value);
  if (key !== JSON.stringify([parsed.subject, parsed.target.serverId, parsed.key, parsed.target.version])) throw new Error("retired record binding mismatch");
  return Object.freeze({ ...parsed, target: Object.freeze(parsed.target), policy_ref: Object.freeze(parsed.policy_ref) });
}
function decode(value: unknown): McpPreparationRecord {
  const parsed = recordSchema.parse(value);
  return Object.freeze({ ...parsed, target: Object.freeze(parsed.target) });
}
export function samePreparationRecord(left: McpPreparationRecord, right: McpPreparationRecord): boolean {
  return left.subject === right.subject && left.key === right.key && left.target.serverId === right.target.serverId &&
    left.target.connectorId === right.target.connectorId && left.target.version === right.target.version;
}
/** Late attempts may tighten a failure, never turn inspection/terminal faults back into a direct replay. */
export function retainPreparationFailure(previous: ConnectorCommandFailure | undefined, next: ConnectorCommandFailure | undefined): ConnectorCommandFailure | undefined {
  if (previous !== undefined && !connectorCommandMayResume(previous)) {
    return previous === "invalid" && next !== undefined && !connectorCommandMayResume(next) ? next : previous;
  }
  return next ?? previous;
}

/** Non-secret browser intents, not owner facts or an authentication store. Each reserve is one cross-tab transaction. */
export function createBrowserMcpPreparationRecovery(): McpPreparationJournal {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () => {
    if (opened) return opened;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let failed = false;
      const fail = () => { failed = true; reject(new Error("MCP recovery storage unavailable")); };
      try {
        const request = window.indexedDB.open("kokoro-mcp-preparation", 2);
        request.onupgradeneeded = event => {
          try {
            const db = request.result, tx = request.transaction!;
            if (event.oldVersion === 0) db.createObjectStore("intents").createIndex("subject", "subject");
            else if ([...db.objectStoreNames].join() !== "intents" ||
              tx.objectStore("intents").keyPath !== null || tx.objectStore("intents").autoIncrement ||
              [...tx.objectStore("intents").indexNames].join() !== "subject" ||
              tx.objectStore("intents").index("subject").keyPath !== "subject" ||
              tx.objectStore("intents").index("subject").unique || tx.objectStore("intents").index("subject").multiEntry)
              throw new Error("MCP recovery schema drift");
            db.createObjectStore("retired_intents").createIndex("subject_server", ["subject", "target.serverId"]);
          } catch { request.transaction?.abort(); fail(); }
        };
        request.onerror = request.onblocked = fail;
        request.onsuccess = () => {
          const db = request.result;
          // A blocked/rejected request can still succeed after another tab closes.
          // Never leak that connection or resurrect its already-failed operation.
          if (failed) { db.close(); return; }
          try {
            if ([...db.objectStoreNames].join() !== "intents,retired_intents") throw new Error("MCP recovery schema drift");
            const tx = db.transaction(["intents", "retired_intents"], "readonly");
            const active = tx.objectStore("intents"), history = tx.objectStore("retired_intents");
            if (active.keyPath !== null || active.autoIncrement || [...active.indexNames].join() !== "subject" ||
              active.index("subject").keyPath !== "subject" || active.index("subject").unique || active.index("subject").multiEntry ||
              history.keyPath !== null || history.autoIncrement || [...history.indexNames].join() !== "subject_server" ||
              JSON.stringify(history.index("subject_server").keyPath) !== '["subject","target.serverId"]' ||
              history.index("subject_server").unique || history.index("subject_server").multiEntry) throw new Error("MCP recovery schema drift");
          } catch { db.close(); fail(); return; }
          db.onversionchange = () => { db.close(); if (opened === pending) opened = undefined; };
          resolve(db);
        };
      } catch { fail(); }
    });
    opened = pending;
    void pending.catch(() => { if (opened === pending) opened = undefined; });
    return pending;
  };
  const transaction = async <T>(mode: IDBTransactionMode,
    action: (store: IDBObjectStore, accept: (value: T) => void, tx: IDBTransaction) => void,
    stores = ["intents"], signal?: AbortSignal): Promise<T> => {
    signal?.throwIfAborted();
    const db = await open();
    signal?.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      let result: { value: T } | undefined;
      const tx = db.transaction(stores, mode);
      const cleanup = () => signal?.removeEventListener("abort", abort);
      const fail = () => { cleanup(); reject(new Error("MCP recovery transaction unavailable")); };
      const abort = () => { try { tx.abort(); } catch { /* Commit may already have completed. */ } };
      tx.onabort = tx.onerror = fail;
      tx.oncomplete = () => { cleanup(); if (result) resolve(result.value); else fail(); };
      signal?.addEventListener("abort", abort, { once: true });
      try {
        signal?.throwIfAborted();
        action(tx.objectStore(stores[0]!), value => { signal?.throwIfAborted(); result = { value }; }, tx);
      } catch { abort(); fail(); }
    });
  };
  const storageKey = (subject: string, serverId: string) => JSON.stringify([subject, serverId]);
  const retiredKey = (record: McpPreparationRecord) => JSON.stringify([record.subject, record.target.serverId, record.key, record.target.version]);
  const read = (store: IDBObjectStore, subject: string, serverId: string, apply: (record: McpPreparationRecord | undefined) => void) => {
    const request = store.get(storageKey(subject, serverId));
    request.onsuccess = () => {
      try {
        const record = request.result === undefined ? undefined : decode(request.result);
        if (record && (record.subject !== subject || record.target.serverId !== serverId)) throw new Error("record binding mismatch");
        apply(record);
      } catch { store.transaction.abort(); }
    };
  };
  return {
    list: subject => transaction("readonly", (store, accept) => {
      const request = store.index("subject").getAll(IDBKeyRange.only(subject));
      request.onsuccess = () => {
        try {
          const records = (request.result as unknown[]).map(decode);
          if (records.some(record => record.subject !== subject)) throw new Error("record actor mismatch");
          accept(records);
        } catch { store.transaction.abort(); }
      };
    }),
    current: (subject, serverId) => transaction("readonly", (store, accept) => read(store, subject, serverId, accept)),
    reserve: (subject, target, key) => transaction("readwrite", (store, accept, tx) => read(store, subject, target.serverId, existing => {
      if (existing) { accept({ record: existing, created: false }); return; }
      const record = decode({ subject, target, key });
      // Coalesce active first. Only an empty active slot needs the exact
      // historical-key fence; connector substitution never changes that key.
      const retired = tx.objectStore("retired_intents").getKey(retiredKey(record));
      retired.onsuccess = () => {
        try {
          if (retired.result !== undefined) throw new Error("retired intent cannot be reserved again");
          const write = store.add(record, storageKey(subject, target.serverId));
          write.onsuccess = () => accept({ record, created: true });
        } catch { tx.abort(); }
      };
    }), ["intents", "retired_intents"]),
    failure: (record, failure) => transaction<void>("readwrite", (store, accept) => read(store, record.subject, record.target.serverId, current => {
      if (!current || !samePreparationRecord(current, record)) throw new Error("record retired");
      const next = retainPreparationFailure(current.failure, failure);
      const write = store.put(decode({ subject: current.subject, target: current.target, key: current.key, ...(next === undefined ? {} : { failure: next }) }), storageKey(record.subject, record.target.serverId));
      write.onsuccess = () => accept(undefined);
    })),
    complete: record => transaction<void>("readwrite", (store, accept) => read(store, record.subject, record.target.serverId, current => {
      // Missing may mean another window already retired this exact acknowledged intent.
      if (!current) { accept(undefined); return; }
      if (!samePreparationRecord(current, record)) throw new Error("record replaced");
      const deletion = store.delete(storageKey(record.subject, record.target.serverId));
      deletion.onsuccess = () => accept(undefined);
    })),
    retireWaiting: async (input, retirement, signal) => {
      const record = decode(input), disposition = retirementSchema.parse(retirement), key = retiredKey(record);
      signal?.throwIfAborted();
      return transaction("readwrite", (active, accept, tx) => read(active, record.subject, record.target.serverId, current => {
        const history = tx.objectStore("retired_intents"), previous = history.get(key);
        previous.onsuccess = () => {
          try {
            signal?.throwIfAborted();
            if (previous.result !== undefined) {
              const saved = decodeRetired(previous.result, key);
              if (!samePreparationRecord(saved, record) || saved.disposition !== disposition.disposition ||
                JSON.stringify(saved.policy_ref) !== JSON.stringify(disposition.policy_ref) || current && samePreparationRecord(current, record))
                throw new Error("retirement conflict");
              accept(saved); return;
            }
            if (!current || !samePreparationRecord(current, record)) throw new Error("record retired or replaced");
            const saved = decodeRetired({ schema_version: 2, subject: record.subject, target: record.target, key: record.key,
              ...disposition, retired_at: new Date().toISOString() }, key);
            // Both stores are write-locked until commit: the exact active read
            // cannot be replaced by K2 between this check and the delete.
            const insertion = history.add(saved, key);
            insertion.onsuccess = () => {
              try {
                signal?.throwIfAborted();
                const deletion = active.delete(storageKey(record.subject, record.target.serverId));
                deletion.onsuccess = () => { try { accept(saved); } catch { tx.abort(); } };
              } catch { tx.abort(); }
            };
          } catch { tx.abort(); }
        };
      }), ["intents", "retired_intents"], signal);
    },
    getRetired: async input => {
      const record = decode(input), key = retiredKey(record);
      return transaction("readonly", (history, accept) => {
        const request = history.get(key);
        request.onsuccess = () => {
          try {
            const saved = request.result === undefined ? undefined : decodeRetired(request.result, key);
            if (saved && !samePreparationRecord(saved, record)) throw new Error("retired record identity mismatch");
            accept(saved);
          }
          catch { history.transaction.abort(); }
        };
      }, ["retired_intents"]);
    },
    listRetired: async (subject, serverId, options) => {
      recordSchema.shape.subject.parse(subject); mcpConnectorIdSchema.parse(serverId);
      const { limit, after } = z.object({ limit: z.number().int().min(1).max(50).default(20), after: historyCursorSchema.optional() }).strict().parse(options ?? {});
      if (after && (after.subject !== subject || after.serverId !== serverId)) throw new Error("history cursor scope mismatch");
      const afterKey = after && JSON.stringify([subject, serverId, after.key, after.version]);
      return transaction("readonly", (history, accept) => {
        const items: McpRetiredPreparationRecord[] = [], indexKey = [subject, serverId];
        const request = history.index("subject_server").openCursor(IDBKeyRange.only(indexKey));
        request.onsuccess = () => {
          try {
            const cursor = request.result;
            if (cursor && afterKey) {
              const comparison = indexedDB.cmp(cursor.primaryKey, afterKey);
              if (comparison < 0) { cursor.continuePrimaryKey(indexKey, afterKey); return; }
              if (comparison === 0) { cursor.continue(); return; }
            }
            if (cursor) {
              const saved = decodeRetired(cursor.value, cursor.primaryKey);
              if (saved.subject !== subject || saved.target.serverId !== serverId) throw new Error("history actor mismatch");
              items.push(saved);
              if (items.length <= limit) { cursor.continue(); return; }
            }
            const hasMore = items.length > limit, page = Object.freeze(items.slice(0, limit)), last = page.at(-1);
            accept(Object.freeze({ items: page, nextCursor: hasMore && last ? Object.freeze({ subject, serverId, key: last.key, version: last.target.version }) : null }));
          } catch { history.transaction.abort(); }
        };
      }, ["retired_intents"]);
    },
  };
}
