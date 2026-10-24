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
export function createBrowserMcpPreparationRecovery(): McpPreparationRecovery {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () => {
    if (opened) return opened;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const request = window.indexedDB.open("kokoro-mcp-preparation", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("intents").createIndex("subject", "subject");
        request.onerror = request.onblocked = () => reject(new Error("MCP recovery storage unavailable"));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opened = undefined; };
          resolve(db);
        };
      } catch { reject(new Error("MCP recovery storage unavailable")); }
    });
    opened = pending;
    void pending.catch(() => { if (opened === pending) opened = undefined; });
    return pending;
  };
  const transaction = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, accept: (value: T) => void) => void): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let result: { value: T } | undefined;
      const tx = db.transaction("intents", mode);
      const fail = () => reject(new Error("MCP recovery transaction unavailable"));
      tx.onabort = tx.onerror = fail;
      tx.oncomplete = () => result ? resolve(result.value) : fail();
      try { action(tx.objectStore("intents"), value => { result = { value }; }); }
      catch { tx.abort(); fail(); }
    });
  };
  const storageKey = (subject: string, serverId: string) => JSON.stringify([subject, serverId]);
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
    reserve: (subject, target, key) => transaction("readwrite", (store, accept) => read(store, subject, target.serverId, existing => {
      if (existing) { accept({ record: existing, created: false }); return; }
      const record = decode({ subject, target, key });
      const write = store.add(record, storageKey(subject, target.serverId));
      write.onsuccess = () => accept({ record, created: true });
    })),
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
  };
}
