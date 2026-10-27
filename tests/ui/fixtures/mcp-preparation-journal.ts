import type { McpPreparationRecord, McpPreparationJournal, McpRetiredPreparationRecord } from "@/ui/mcp/mcp-preparation-recovery";

type Rules = Pick<typeof import("@/ui/mcp/mcp-preparation-recovery"), "samePreparationRecord" | "retainPreparationFailure">;
/** UI command tests run in jsdom without IndexedDB. This explicit port is not a native-storage integration. */
export function createTestPreparationJournal(rules: Rules): McpPreparationJournal {
  const history = new Map<string, McpRetiredPreparationRecord>();
  const historicalKey = (record: McpPreparationRecord) => JSON.stringify([record.subject, record.target.serverId, record.key, record.target.version]);
  const records = new Map<string, McpPreparationRecord>();
  const storageKey = (subject: string, serverId: string) => JSON.stringify([subject, serverId]);
  return {
    list: async subject => [...records.values()].filter(record => record.subject === subject).map(record => structuredClone(record)),
    current: async (subject, serverId) => {
      const value = records.get(storageKey(subject, serverId)); return value ? structuredClone(value) : undefined;
    },
    reserve: async (subject, target, key) => {
      const index = storageKey(subject, target.serverId), existing = records.get(index);
      if (existing) return { record: structuredClone(existing), created: false };
      const record = structuredClone({ subject, target, key });
      if (history.has(historicalKey(record))) throw new Error("test intent retired");
      records.set(index, record);
      return { record: structuredClone(record), created: true };
    },
    failure: async (record, failure) => {
      const key = storageKey(record.subject, record.target.serverId), existing = records.get(key);
      if (!existing || !rules.samePreparationRecord(existing, record)) throw new Error("test record retired");
      records.set(key, { ...existing, failure: rules.retainPreparationFailure(existing.failure, failure) });
    },
    complete: async record => {
      const key = storageKey(record.subject, record.target.serverId), existing = records.get(key);
      if (history.has(historicalKey(record))) throw new Error("test intent retired");
      if (existing && !rules.samePreparationRecord(existing, record)) throw new Error("test record replaced");
      records.delete(key);
    },
    retireWaiting: async (record, retirement, signal) => {
      signal?.throwIfAborted();
      const key = storageKey(record.subject, record.target.serverId), active = records.get(key), old = history.get(historicalKey(record));
      if (old) {
        if (!rules.samePreparationRecord(old, record) || active && rules.samePreparationRecord(active, record) || old.disposition !== retirement.disposition) throw new Error("test retirement conflict");
        return structuredClone(old);
      }
      if (!active || !rules.samePreparationRecord(active, record)) throw new Error("test intent replaced");
      const saved: McpRetiredPreparationRecord = { schema_version: 2, subject: record.subject, target: record.target, key: record.key, ...retirement, retired_at: new Date().toISOString() };
      history.set(historicalKey(record), saved); records.delete(key); return structuredClone(saved);
    },
    getRetired: async record => {
      const saved = history.get(historicalKey(record));
      if (saved && !rules.samePreparationRecord(saved, record)) throw new Error("test history binding mismatch");
      return saved ? structuredClone(saved) : undefined;
    },
    listRetired: async (subject, serverId) => ({ items: [...history.values()].filter(record => record.subject === subject && record.target.serverId === serverId).map(record => structuredClone(record)), nextCursor: null }),
  };
}
