import type { McpPreparationRecord, McpPreparationRecovery } from "@/ui/mcp/mcp-preparation-recovery";

type Rules = Pick<typeof import("@/ui/mcp/mcp-preparation-recovery"), "samePreparationRecord" | "retainPreparationFailure">;
/** UI command tests run in jsdom without IndexedDB. This explicit port is not a native-storage integration. */
export function createTestPreparationJournal(rules: Rules): McpPreparationRecovery {
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
      const record = structuredClone({ subject, target, key }); records.set(index, record);
      return { record: structuredClone(record), created: true };
    },
    failure: async (record, failure) => {
      const key = storageKey(record.subject, record.target.serverId), existing = records.get(key);
      if (!existing || !rules.samePreparationRecord(existing, record)) throw new Error("test record retired");
      records.set(key, { ...existing, failure: rules.retainPreparationFailure(existing.failure, failure) });
    },
    complete: async record => {
      const key = storageKey(record.subject, record.target.serverId), existing = records.get(key);
      if (existing && !rules.samePreparationRecord(existing, record)) throw new Error("test record replaced");
      records.delete(key);
    },
  };
}
