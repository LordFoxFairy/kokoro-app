import { z } from "zod";
import { HubClientError, type HubClient } from "@/hub/client";
import { mcpConnectorIdSchema, mcpConnectorStateVersionSchema } from "@/hub/mcp-connector.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCommand, type ConnectorCommandState } from "./connector-command";

const targetSchema = z.object({
  serverId: mcpConnectorIdSchema,
  connectorId: mcpConnectorIdSchema,
  version: mcpConnectorStateVersionSchema,
}).strict();
type Target = Readonly<z.infer<typeof targetSchema>>;
type Command = ReturnType<typeof createConnectorCommand<Target>>;
type Entry = { target: Target; command: Command; release: () => void; unsubscribe: () => void };
export type McpPreparationSummary = Readonly<{
  serverId: string; connectorId: string; kind: ConnectorCommandState["kind"];
}>;

/** Typed per-server Prepare intents shared by creation and detail, not owner facts. */
export function createMcpPreparationCommands(options: {
  client: Pick<HubClient, "preparePrivateMcpServer">;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
}) {
  const actor = options.boundary.subject;
  let boundary = { ...options.boundary }, leases = 0, retired = false;
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: readonly McpPreparationSummary[] = Object.freeze([]);
  const publish = () => {
    snapshot = Object.freeze([...entries.values()].map(entry => Object.freeze({
      serverId: entry.target.serverId, connectorId: entry.target.connectorId,
      kind: entry.command.getSnapshot().kind,
    })));
    listeners.forEach(listener => listener());
  };
  const matches = (value: ProjectReadBoundary) => !retired && actor !== null &&
    boundary.subject === actor && boundary.admitted && value.admitted &&
    value.subject === actor && value.generation === boundary.generation;
  const remove = (entry: Entry) => {
    entries.delete(entry.target.serverId);
    entry.unsubscribe();
    entry.command.bind({ ...boundary, subject: null, admitted: false });
    entry.release();
  };
  const retire = () => {
    retired = true;
    for (const entry of [...entries.values()]) remove(entry);
    publish();
  };
  const bind = (value: ProjectReadBoundary) => {
    if (retired) return;
    if (value.subject !== actor) { retire(); return; }
    boundary = { ...value };
    for (const entry of entries.values()) entry.command.bind(boundary);
    publish();
  };
  const run = async (entry: Entry, value: ProjectReadBoundary, signal?: AbortSignal) => {
    if (!matches(value) || signal?.aborted || entries.get(entry.target.serverId) !== entry) return false;
    const kind = entry.command.getSnapshot().kind;
    if (kind === "completed") return true;
    if (kind === "running") return false;
    const pause = () => entry.command.pause(value);
    signal?.addEventListener("abort", pause, { once: true });
    try {
      const confirmed = kind === "unknown" ? await entry.command.retry(value)
        : await entry.command.submit(entry.target, value);
      // An earlier attempt may acknowledge this same frozen command while its
      // explicit retry is waiting. Only the current owner can consume that ACK.
      return confirmed || (matches(value) && !signal?.aborted &&
        entries.get(entry.target.serverId) === entry &&
        entry.command.getSnapshot().kind === "completed");
    } finally { signal?.removeEventListener("abort", pause); }
  };
  return {
    available: options.client.preparePrivateMcpServer !== undefined,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    matches,
    bind,
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      leases++; bind(value); let released = false;
      return () => {
        if (released) return; released = true;
        if (--leases !== 0) return;
        bind({ ...boundary, admitted: false });
        queueMicrotask(() => { if (leases === 0 && !retired) retire(); });
      };
    },
    prepare: (input: Target, value: ProjectReadBoundary, signal?: AbortSignal) => {
      if (!matches(value) || signal?.aborted || !options.client.preparePrivateMcpServer) return Promise.resolve(false);
      const target = Object.freeze(targetSchema.parse(input));
      let entry = entries.get(target.serverId);
      if (entry && entry.target.connectorId !== target.connectorId) return Promise.resolve(false);
      if (entry?.command.getSnapshot().kind === "rejected") { remove(entry); entry = undefined; }
      if (!entry) {
        const command = createConnectorCommand<Target>({ boundary, invalidRequestCode: "invalid_mcp_personal_request",
          freeze: body => Object.freeze(targetSchema.parse(body)),
          execute: async (body, key, requestSignal) => {
            const result = await options.client.preparePrivateMcpServer!(body.serverId, body.version, key, requestSignal);
            if (result.connector.connector_id !== body.connectorId)
              throw new HubClientError("parse", "MCP preparation connector binding mismatch", null, null);
            return result;
          },
          onConfirmed: options.onConfirmed,
        });
        entry = { target, command, release: command.retain(boundary), unsubscribe: command.subscribe(publish) };
        entries.set(target.serverId, entry);
      }
      return run(entry, value, signal);
    },
    resume: (serverId: string, connectorId: string, value: ProjectReadBoundary, signal?: AbortSignal) => {
      const entry = entries.get(serverId);
      return entry?.target.connectorId === connectorId ? run(entry, value, signal) : Promise.resolve(false);
    },
    finish: (serverId: string, value: ProjectReadBoundary) => {
      const entry = entries.get(serverId);
      if (!matches(value) || !entry || entry.command.getSnapshot().kind !== "completed") return false;
      remove(entry); publish(); return true;
    },
    retireTarget: (serverId: string, connectorId: string) => {
      const entry = entries.get(serverId);
      if (!entry || entry.target.connectorId !== connectorId) return;
      remove(entry); publish();
    },
  };
}
export type McpPreparationCommands = ReturnType<typeof createMcpPreparationCommands>;
