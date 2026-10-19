import type { HubClient } from "@/hub/client";
import { mcpConnectorCommandRequestSchemas, type McpConnectorCreateInput } from "@/hub/mcp-connector.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCommand, type ConnectorCommandState } from "./connector-command";

export type ProviderCreationSummary = ConnectorCommandState & Readonly<{ providerKey: string; connectorId?: string; requiresOAuth?: true }>;
type Entry = {
  command: ReturnType<typeof createConnectorCommand<McpConnectorCreateInput>>;
  connectorId?: string;
  requiresOAuth?: true;
  release: () => void;
  unsubscribe: () => void;
};

/** Actor-owned original Create intents; only confirmed locators survive a window. */
export function createProviderCreationCommands(options: {
  client: Pick<HubClient, "createMcpConnector">;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
}) {
  const actor = options.boundary.subject;
  let boundary = { ...options.boundary }, retired = false, leases = 0;
  const entries = new Map<string, Entry>(), listeners = new Set<() => void>();
  let snapshot: readonly ProviderCreationSummary[] = Object.freeze([]);
  const publish = () => {
    snapshot = Object.freeze([...entries].map(([providerKey, entry]) => Object.freeze({
      ...entry.command.getSnapshot(), providerKey,
      ...(entry.connectorId === undefined ? {} : { connectorId: entry.connectorId }),
      ...(entry.requiresOAuth ? { requiresOAuth: true as const } : {}),
    })));
    listeners.forEach(listener => listener());
  };
  const matches = (value: ProjectReadBoundary) => !retired && actor !== null &&
    boundary.subject === actor && boundary.admitted && value.admitted &&
    value.subject === actor && value.generation === boundary.generation;
  const remove = (providerKey: string, entry: Entry) => {
    entries.delete(providerKey); entry.unsubscribe();
    entry.command.bind({ ...boundary, subject: null, admitted: false }); entry.release();
  };
  const retire = () => {
    retired = true;
    for (const [key, entry] of entries) remove(key, entry);
    publish();
  };
  const bind = (value: ProjectReadBoundary) => {
    if (retired) return;
    if (value.subject !== actor) { retire(); return; }
    boundary = { ...value };
    for (const entry of entries.values()) entry.command.bind(boundary);
    publish();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      leases++; bind(value); let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--leases !== 0) return;
        bind({ ...boundary, admitted: false });
        queueMicrotask(() => { if (leases === 0 && !retired) retire(); });
      };
    },
    run: async (input: McpConnectorCreateInput, value: ProjectReadBoundary, signal: AbortSignal): Promise<string | null> => {
      if (!matches(value) || signal.aborted) return null;
      const key = input.provider_key;
      let entry = entries.get(key);
      if (entry?.command.getSnapshot().kind === "rejected") { remove(key, entry); entry = undefined; }
      if (!entry) {
        const record: Entry = { command: createConnectorCommand<McpConnectorCreateInput>({
          boundary, surface: "mcp", invalidRequestCode: "invalid_mcp_personal_request",
          freeze: body => Object.freeze(mcpConnectorCommandRequestSchemas.create.parse(body)),
          name: body => body.display_name,
          execute: async (body, originalKey, requestSignal) => {
            const connector = await options.client.createMcpConnector(body, originalKey, requestSignal);
            // The generic command validates the ACK through HubClient. Keep no
            // stale CAS/status/provider declaration as current owner facts.
            if (!retired && entries.get(key) === record) record.connectorId = connector.connector_id;
          },
          onConfirmed: options.onConfirmed,
        }), release: () => {}, unsubscribe: () => {} };
        entries.set(key, record);
        record.release = record.command.retain(boundary);
        record.unsubscribe = record.command.subscribe(publish);
        entry = record;
      }
      const kind = entry.command.getSnapshot().kind;
      if (kind === "idle") await entry.command.submit(input, value, signal);
      else if (kind === "unknown") await entry.command.retry(value, signal);
      if (!matches(value) || signal.aborted || entries.get(key) !== entry || entry.command.getSnapshot().kind !== "completed") return null;
      return entry.connectorId ?? null;
    },
    requireOAuthPopup: (providerKey: string, value: ProjectReadBoundary) => {
      const entry = entries.get(providerKey);
      if (!matches(value) || !entry || entry.command.getSnapshot().kind !== "completed") return;
      entry.requiresOAuth = true; publish();
    },
    finish: (providerKey: string, value: ProjectReadBoundary) => {
      const entry = entries.get(providerKey);
      if (!entry || !matches(value) || !entry.command.finish(value)) return false;
      remove(providerKey, entry); publish(); return true;
    },
  };
}
export type ProviderCreationCommands = ReturnType<typeof createProviderCreationCommands>;
