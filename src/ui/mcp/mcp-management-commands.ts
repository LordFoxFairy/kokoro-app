import { HubClientError, type HubClient } from "@/hub/client";
import {
  mcpConnectorIdSchema, mcpConnectorCommandRequestSchemas, mcpPrivateServerPrepareInputSchema, mcpPrivateServerUpdateInputSchema,
  type McpConnector, type McpPrivateServerUpdateInput, type McpConnectorUpdateInput, type McpConnectorEnabledInput, type McpConnectorRemoveInput,
} from "@/hub/mcp-connector.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCommand, type ConnectorCommandState } from "./connector-command";
import { createMcpPreparationCommands, type McpPreparationCommands } from "./mcp-preparation-commands";

type Locator = { connectorId: string; serverId?: string };
export type McpManagementIntent =
  | { operation: "update_server"; connectorId: string; serverId: string; input: McpPrivateServerUpdateInput }
  | { operation: "delete_server"; connectorId: string; serverId: string; input: McpConnectorRemoveInput }
  | ({ operation: "update_connector"; input: McpConnectorUpdateInput } & Locator)
  | ({ operation: "set_enabled"; input: McpConnectorEnabledInput } & Locator)
  | ({ operation: "disconnect"; input: McpConnectorRemoveInput } & Locator);
export type McpManagementSummary = Readonly<Locator & {
  operation: McpManagementIntent["operation"]; kind: ConnectorCommandState["kind"]; failure?: ConnectorCommandState["failure"];
}>;
type Entry = { locator: Locator; operation: McpManagementIntent["operation"]; command: ReturnType<typeof createConnectorCommand<McpManagementIntent>>; release: () => void; unsubscribe: () => void };
type Client = Pick<HubClient, "updatePrivateMcpServer" | "deletePrivateMcpServer" | "updateMcpConnector" | "setMcpConnectorEnabled" | "removeMcpConnector" | "preparePrivateMcpServer">;
const cleanup = (operation: McpManagementIntent["operation"]) => operation === "disconnect" || operation === "delete_server";

function freezeIntent(intent: McpManagementIntent): McpManagementIntent {
  const connectorId = mcpConnectorIdSchema.parse(intent.connectorId);
  const serverId = intent.serverId === undefined ? undefined : mcpConnectorIdSchema.parse(intent.serverId);
  const locator = { connectorId, ...(serverId === undefined ? {} : { serverId }) };
  switch (intent.operation) {
    case "update_server": {
      const input = mcpPrivateServerUpdateInputSchema.parse(intent.input);
      input.header_upserts?.forEach(item => Object.freeze(item));
      if (input.header_upserts) Object.freeze(input.header_upserts);
      if (input.header_removals) Object.freeze(input.header_removals);
      if (input.oauth_client) Object.freeze(input.oauth_client);
      return Object.freeze({ operation: intent.operation, connectorId, serverId: mcpConnectorIdSchema.parse(serverId), input: Object.freeze(input) });
    }
    case "delete_server": return Object.freeze({ operation: intent.operation, connectorId, serverId: mcpConnectorIdSchema.parse(serverId), input: Object.freeze(mcpPrivateServerPrepareInputSchema.parse(intent.input)) });
    case "update_connector": return Object.freeze({ ...locator, operation: intent.operation, input: Object.freeze(mcpConnectorCommandRequestSchemas.update.parse(intent.input)) });
    case "set_enabled": return Object.freeze({ ...locator, operation: intent.operation, input: Object.freeze(mcpConnectorCommandRequestSchemas.enabled.parse(intent.input)) });
    case "disconnect": return Object.freeze({ ...locator, operation: intent.operation, input: Object.freeze(mcpConnectorCommandRequestSchemas.remove.parse(intent.input)) });
  }
}

function createManagement(options: { client: Client; preparation: McpPreparationCommands; boundary: ProjectReadBoundary; onConfirmed: () => void }) {
  const actor = options.boundary.subject;
  let boundary = { ...options.boundary }, leases = 0, retired = false;
  const entries = new Map<string, Entry>(), listeners = new Set<() => void>();
  let snapshot: readonly McpManagementSummary[] = Object.freeze([]);
  const publish = () => {
    snapshot = Object.freeze([...entries.values()].map(entry => {
      const state = entry.command.getSnapshot();
      return Object.freeze({ ...entry.locator, operation: entry.operation, kind: state.kind, ...(state.failure === undefined ? {} : { failure: state.failure }) });
    }));
    listeners.forEach(listener => listener());
  };
  const matches = (value: ProjectReadBoundary) => !retired && actor !== null && boundary.subject === actor && boundary.admitted && value.admitted && value.subject === actor && value.generation === boundary.generation;
  const remove = (entry: Entry) => {
    entries.delete(entry.locator.connectorId); entry.unsubscribe();
    entry.command.bind({ ...boundary, subject: null, admitted: false }); entry.release();
  };
  const retire = () => { retired = true; for (const entry of [...entries.values()]) remove(entry); publish(); };
  const bind = (value: ProjectReadBoundary) => {
    if (retired) return;
    if (value.subject !== actor) { retire(); return; }
    boundary = { ...value }; for (const entry of entries.values()) entry.command.bind(boundary); publish();
  };
  const preparationBlocks = (entry: Pick<Entry, "operation" | "locator">) => !cleanup(entry.operation) && options.preparation.getSnapshot().some(item => item.connectorId === entry.locator.connectorId && item.kind !== "rejected");
  const run = async (entry: Entry, value: ProjectReadBoundary, signal: AbortSignal | undefined, input?: McpManagementIntent) => {
    if (!matches(value) || signal?.aborted || entries.get(entry.locator.connectorId) !== entry || preparationBlocks(entry)) return false;
    const kind = entry.command.getSnapshot().kind;
    if (kind === "completed") return input === undefined;
    if (kind === "running") return false;
    const pause = () => entry.command.pause(value);
    signal?.addEventListener("abort", pause, { once: true });
    try {
      const confirmed = input ? await entry.command.submit(input, value) : await entry.command.retry(value);
      return confirmed || (matches(value) && !signal?.aborted && entries.get(entry.locator.connectorId) === entry && entry.command.getSnapshot().kind === "completed");
    } finally { signal?.removeEventListener("abort", pause); }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    matches, bind,
    isBlocked: (connectorId: string) => { const entry = entries.get(connectorId); return entry !== undefined && entry.command.getSnapshot().kind !== "rejected"; },
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      leases++; bind(value); let released = false;
      return () => { if (released) return; released = true; if (--leases !== 0) return;
        bind({ ...boundary, admitted: false }); queueMicrotask(() => { if (leases === 0 && !retired) retire(); }); };
    },
    submit: (input: McpManagementIntent, value: ProjectReadBoundary, signal?: AbortSignal) => {
      if (!matches(value) || signal?.aborted) return Promise.resolve(false);
      const locator = { connectorId: input.connectorId, ...(input.serverId === undefined ? {} : { serverId: input.serverId }) };
      if (preparationBlocks({ operation: input.operation, locator })) return Promise.resolve(false);
      let entry = entries.get(input.connectorId);
      if (entry?.command.getSnapshot().kind === "rejected") { remove(entry); entry = undefined; }
      if (entry) return Promise.resolve(false);
      const execute = async (body: McpManagementIntent, key: string, requestSignal: AbortSignal) => {
        const client = options.client;
        const bound = (connector: McpConnector) => {
          if (connector.connector_id !== body.connectorId || (body.serverId !== undefined && connector.server_id !== body.serverId))
            throw new HubClientError("parse", "MCP management target binding mismatch", null, null);
          return connector;
        };
        switch (body.operation) {
          case "delete_server": return client.deletePrivateMcpServer!(body.serverId, body.input.expected_state_version, key, requestSignal);
          case "update_server": {
            const result = await client.updatePrivateMcpServer!(body.serverId, body.input, key, requestSignal);
            bound(result.connector); return result;
          }
          case "update_connector": return bound(await client.updateMcpConnector(body.connectorId, body.input, key, requestSignal));
          case "set_enabled": return bound(await client.setMcpConnectorEnabled(body.connectorId, body.input, key, requestSignal));
          case "disconnect": return bound(await client.removeMcpConnector(body.connectorId, body.input, key, requestSignal));
        }
      };
      const available = input.operation === "update_server" ? options.client.updatePrivateMcpServer !== undefined : input.operation === "delete_server" ? options.client.deletePrivateMcpServer !== undefined : true;
      if (!available) return Promise.resolve(false);
      const operation = input.operation;
      const command = createConnectorCommand<McpManagementIntent>({ boundary, surface: "mcp", invalidRequestCode: "invalid_mcp_personal_request", freeze: freezeIntent, execute,
        onConfirmed: () => { if (cleanup(operation) && locator.serverId) options.preparation.retireTarget(locator.serverId, locator.connectorId); options.onConfirmed(); },
      });
      entry = { locator, operation: input.operation, command, release: command.retain(boundary), unsubscribe: command.subscribe(publish) };
      entries.set(input.connectorId, entry);
      return run(entry, value, signal, input);
    },
    resume: (connectorId: string, value: ProjectReadBoundary, signal?: AbortSignal) => { const entry = entries.get(connectorId); return entry ? run(entry, value, signal) : Promise.resolve(false); },
    finish: (connectorId: string, value: ProjectReadBoundary) => {
      const entry = entries.get(connectorId);
      if (!matches(value) || !entry || entry.command.getSnapshot().kind !== "completed") return false;
      remove(entry); publish(); return true;
    },
  };
}

/** Fixed MCP lifecycle wiring: management and Prepare remain typed, separate intents. */
export function createMcpLifecycleCommands(options: { client: Client; boundary: ProjectReadBoundary; onConfirmed: () => void }) {
  const preparation = createMcpPreparationCommands({ ...options, canPrepare: target => !management.isBlocked(target.connectorId) });
  const management = createManagement({ ...options, preparation });
  return { preparation, management };
}
export type McpManagementCommands = ReturnType<typeof createMcpLifecycleCommands>["management"];
