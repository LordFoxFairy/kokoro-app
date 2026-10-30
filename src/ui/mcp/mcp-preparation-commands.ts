import { MCP_PREPARE_OUTCOME_POLICY, MCP_PREPARE_OUTCOME_PROVENANCE, mcpPrepareOutcome } from "@/generated/bff-mcp-prepare-outcomes";
import { HubClientError, type HubClient } from "@/hub/client";
import { mcpPrepareReceiptLookupOnly } from "@/hub/mcp-prepare-receipt.schema";
import { mcpPrivateServerMatches, type McpPrivateServer, type McpConnector } from "@/hub/mcp-connector.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCommand, type ConnectorCommandState } from "./connector-command";
import { connectorCommandFailure, type ConnectorCommandFailure } from "./connector-command-failure";
import { mcpPreparationTargetSchema, samePreparationRecord, retainPreparationFailure, type McpPreparationTarget as Target, type McpPreparationRecord, type McpPreparationRecovery, type McpPreparationJournal, type McpRetiredPreparationRecord } from "./mcp-preparation-recovery";

type Command = ReturnType<typeof createConnectorCommand<Target>>;
type Entry = {
  target: Target; key: string; command: Command; release: () => void; unsubscribe: () => void;
  queryOnly: boolean; blocked: boolean; fenced: boolean; failure: ConnectorCommandFailure | undefined;
  completion?: Readonly<{ serverId: string; connectorId: string; providerKey: string; via: "initial_post" | "receipt_lookup" }>;

};
export type McpPreparationView = Readonly<{
  attempt: McpPreparationRecord; kind: ConnectorCommandState["kind"] | null; fenced: boolean;
  retired: McpRetiredPreparationRecord | null;
}>;
export type McpPreparationSummary = Readonly<{
  serverId: string; connectorId: string; kind: ConnectorCommandState["kind"]; failure?: ConnectorCommandState["failure"];
}>;

/** Actor-owned Prepare intents. Only exact ACKs are completion; restored browser records are always unknown. */
export function createMcpPreparationCommands(options: {
  client: Pick<HubClient, "preparePrivateMcpServer" | "getPrivateMcpServer" | "getMcpConnector" | "getMcpPrepareReceipt">;
  boundary: ProjectReadBoundary; onConfirmed: () => void; canPrepare: (target: Target) => boolean;
  recovery?: McpPreparationRecovery;
}) {
  const actor = options.boundary.subject;
  const candidate = options.recovery as Partial<McpPreparationJournal> | undefined;
  const journal = candidate && typeof candidate.retireWaiting === "function" && typeof candidate.getRetired === "function" && typeof candidate.listRetired === "function"
    ? candidate as McpPreparationJournal : undefined;
  const history = new Map<string, McpRetiredPreparationRecord>();
  const identity = (value: McpPreparationRecord) => JSON.stringify([value.subject, value.target.serverId, value.target.connectorId, value.key, value.target.version]);
  const policy_ref = Object.freeze({ artifact_sha256: MCP_PREPARE_OUTCOME_PROVENANCE.source_sha256, profile: MCP_PREPARE_OUTCOME_POLICY.profile, version: MCP_PREPARE_OUTCOME_POLICY.version });
  let boundary = { ...options.boundary }, leases = 0, retired = false;
  let recovered = !options.recovery, recoveryError = false, loading: Promise<boolean> | undefined;
  const entries = new Map<string, Entry>(), listeners = new Set<() => void>();
  let snapshot: readonly McpPreparationSummary[] = Object.freeze([]);
  const matches = (value: ProjectReadBoundary) => !retired && actor !== null && boundary.subject === actor &&
    boundary.admitted && value.admitted && value.subject === actor && value.generation === boundary.generation;
  const mayResume = (entry: Entry) => !entry.blocked && recovered && (entry.queryOnly
    ? options.client.getMcpPrepareReceipt !== undefined && mcpPrepareReceiptLookupOnly()
    : Boolean(options.client.preparePrivateMcpServer) && options.canPrepare(entry.target));
  const publish = () => {
    snapshot = Object.freeze([...entries.values()].map(entry => {
      const state = entry.command.getSnapshot();
      const failure = entry.failure ?? state.failure;
      return Object.freeze({ serverId: entry.target.serverId, connectorId: entry.target.connectorId, kind: state.kind,
        ...(failure === undefined ? {} : { failure }),
      });
    }));
    listeners.forEach(listener => listener());
  };
  const record = (entry: Entry): McpPreparationRecord => ({ subject: actor!, target: entry.target, key: entry.key, ...(entry.failure === undefined ? {} : { failure: entry.failure }) });
  const reconcileRetired = async (entry: Entry) => {
    const saved = await journal?.getRetired(record(entry));
    if (!saved) return false;
    history.set(identity(saved), saved);
    if (entries.get(entry.target.serverId) === entry) { remove(entry); publish(); }
    return true;
  };
  const currentRecord = async (entry: Entry) => {
    if (!options.recovery) return true;
    try {
      const latest = await options.recovery.current(actor!, entry.target.serverId);
      if (!latest || !samePreparationRecord(latest, record(entry))) {
        if (!await reconcileRetired(entry) && entries.get(entry.target.serverId) === entry) { entry.blocked = true; publish(); }
        return false;
      }
      entry.failure = retainPreparationFailure(entry.failure, latest.failure);
      return true;
    } catch (error) {
      if (entries.get(entry.target.serverId) === entry) { recovered = false; recoveryError = true; publish(); }
      throw error;
    }
  };
  const remove = (entry: Entry) => {
    if (entries.get(entry.target.serverId) !== entry) return;
    entries.delete(entry.target.serverId); entry.unsubscribe();
    entry.command.bind({ ...boundary, subject: null, admitted: false }); entry.release();
  };
  const makeEntry = (saved: McpPreparationRecord, restored: boolean) => {
    const command = createConnectorCommand<Target>({ boundary, surface: "mcp", invalidRequestCode: "invalid_mcp_personal_request",
      freeze: body => Object.freeze(mcpPreparationTargetSchema.parse(body)), key: () => saved.key,
      ...(restored ? { restored: { body: saved.target, key: saved.key, failure: saved.failure } } : {}),
      mayResume: () => entry !== undefined && mayResume(entry),
      execute: async (body, key, requestSignal) => {
        const current = entry!;
        const window = { ...boundary }, lookup = current.queryOnly;
        // Monotonic even if the first execute is cancelled before its I/O.
        // A restored/unknown intent can only query the original key and CAS.
        current.queryOnly = true;
        if (options.recovery && !await currentRecord(current) || !matches(window) || requestSignal.aborted ||
          entries.get(body.serverId) !== current || (!lookup && !options.canPrepare(body)) ||
          lookup && !options.client.getMcpPrepareReceipt) throw new Error("Prepare target retired");
        try {
          const result = lookup
            ? await options.client.getMcpPrepareReceipt!(body.serverId, body.version, key, requestSignal)
            : await options.client.preparePrivateMcpServer!(body.serverId, body.version, key, requestSignal);
          const strictAck = ["ready", "needs_oauth"].includes(result.server.prepare_status) &&
            mcpPrivateServerMatches("prepareServer", { data: result }, body.serverId, { expected_state_version: body.version });
          if (!strictAck || result.connector.connector_id !== body.connectorId || lookup && result.replayed !== true)
            throw new HubClientError("parse", "MCP preparation receipt binding mismatch", null, null);
          if (lookup) {
            if (options.recovery && !await currentRecord(current)) throw new Error("Prepare journal retired");
            if (requestSignal.aborted || !matches(window) || entries.get(body.serverId) !== current) throw new Error("Prepare lookup retired");
          }
          await options.recovery?.complete(record(current));
          current.completion = Object.freeze({ serverId: body.serverId, connectorId: body.connectorId, providerKey: result.connector.provider_key, via: lookup ? "receipt_lookup" : "initial_post" });
          return result;
        } catch (error) {
          // Exact durable history wins over every late callback, not only lookup.
          // Never let a stale K1 failure mark K2 or poison the actor recovery gate.
          let archived = false;
          try { archived = await reconcileRetired(current); } catch { /* genuine storage faults are handled by currentRecord below */ }
          if (archived) throw error;
          if (entries.get(body.serverId) !== current || current.blocked || requestSignal.aborted || !matches(window)) throw error;
          const outcome = error instanceof HubClientError && error.reason === "http"
            ? mcpPrepareOutcome(lookup ? "getMcpPrepareReceipt" : "prepareServer", error.status, error.code, error.retryable) : null;
          if (journal && outcome === "rejected") {
            try {
              const saved = await journal.retireWaiting(record(current), { disposition: "definite_rejected", policy_ref }, requestSignal);
              history.set(identity(saved), saved); remove(current); publish();
            } catch { /* A failed/aborted transaction remains the original unknown. */ }
            throw error;
          }
          if (outcome === "execution_fenced") { current.fenced = true; publish(); }
          const failure = connectorCommandFailure("mcp", error);
          try {
            if (options.recovery) {
              if (!await currentRecord(current) || entries.get(body.serverId) !== current) throw error;
              await options.recovery.failure(record(current), failure);
              await currentRecord(current);
            } else current.failure = retainPreparationFailure(current.failure, failure);
          } catch {
            // A racing tab may archive/replace after the first read. Check the
            // captured tuple again before turning an I/O error into a global lock.
            if (entries.get(body.serverId) === current && !current.blocked) {
              try { if (await currentRecord(current)) { recoveryError = true; recovered = false; publish(); } }
              catch { /* currentRecord already records genuine storage failures. */ }
            }
          }
          throw error;
        }
      }, onConfirmed: options.onConfirmed,
    });
    const entry: Entry = { target: Object.freeze(mcpPreparationTargetSchema.parse(saved.target)), key: saved.key, command,
      release: command.retain(boundary), unsubscribe: command.subscribe(publish), queryOnly: restored, blocked: false, fenced: false,
      failure: saved.failure };
    entries.set(entry.target.serverId, entry);
    return entry;
  };
  const restore = (value: ProjectReadBoundary, force = false): Promise<boolean> => {
    if (!matches(value)) return Promise.resolve(false);
    if (loading) return loading;
    if (recovered && !force) return Promise.resolve(true);
    recoveryError = false;
    const pending = Promise.resolve().then(async () => {
      try {
        const records = await options.recovery!.list(actor!);
        if (!matches(value)) return false;
        for (const saved of records) {
          if (saved.subject !== actor) throw new Error("Prepare recovery actor mismatch");
          const existing = entries.get(saved.target.serverId);
          if (existing) {
            if (!samePreparationRecord(saved, record(existing))) existing.blocked = true;
            else existing.failure = retainPreparationFailure(existing.failure, saved.failure);
          } else makeEntry(saved, true);
        }
        recovered = true; publish(); return true;
      } catch {
        if (matches(value)) { recovered = false; recoveryError = true; publish(); }
        return false;
      } finally {
        if (loading === pending) {
          loading = undefined;
          // A stale initialization must hand off to the currently admitted generation, not leave a permanent loading lock.
          if (!matches(value) && matches(boundary) && !recovered && !recoveryError) void restore({ ...boundary });
        }
      }
    });
    loading = pending;
    return pending;
  };
  const retire = () => { retired = true; for (const entry of [...entries.values()]) remove(entry); publish(); };
  const bind = (value: ProjectReadBoundary) => {
    if (retired) return;
    if (value.subject !== actor) { retire(); return; }
    boundary = { ...value }; for (const entry of entries.values()) entry.command.bind(boundary);
    publish();
    if (value.admitted && options.recovery && !recovered && !loading) void restore(value);
  };
  const run = async (entry: Entry, value: ProjectReadBoundary, signal?: AbortSignal) => {
    if (!matches(value) || signal?.aborted || entry.blocked || entries.get(entry.target.serverId) !== entry) return false;
    const kind = entry.command.getSnapshot().kind;
    // An exact late ACK already retired the journal. Done consumes that fact; it does not replay a command.
    if (kind === "completed") return true;
    if (kind === "running") return false;
    if (kind === "unknown") entry.queryOnly = true;
    if (!mayResume(entry)) return false;
    const pause = () => entry.command.pause(value);
    signal?.addEventListener("abort", pause, { once: true });
    try {
      const confirmed = kind === "unknown" ? await entry.command.retry(value) : await entry.command.submit(entry.target, value);
      // Only the generic command's definite, never-uncertain rejection releases an unexecuted intent.
      // A 400 after an unknown result stays unknown and retains its original key/CAS.
      if (options.recovery && entry.command.getSnapshot().kind === "rejected" && entries.get(entry.target.serverId) === entry) {
        try { await options.recovery.complete(record(entry)); }
        catch {
          if (!await reconcileRetired(entry) && await currentRecord(entry)) { recovered = false; recoveryError = true; publish(); }
          return false;
        }
      }
      return confirmed || (matches(value) && !signal?.aborted && entries.get(entry.target.serverId) === entry && entry.command.getSnapshot().kind === "completed");
    } finally { signal?.removeEventListener("abort", pause); }
  };
  const commands = {
    getAttempt: (serverId: string, connectorId: string, value: ProjectReadBoundary) => {
      const entry = entries.get(serverId);
      return matches(value) && entry?.target.connectorId === connectorId ? Object.freeze(record(entry)) : null;
    },
    getView: (attempt: McpPreparationRecord, value: ProjectReadBoundary): McpPreparationView => {
      const entry = entries.get(attempt.target.serverId), exact = matches(value) && attempt.subject === actor && entry && samePreparationRecord(attempt, record(entry));
      return Object.freeze({ attempt, kind: exact ? entry.command.getSnapshot().kind : null,
        fenced: Boolean(exact && entry.fenced && journal), retired: matches(value) && attempt.subject === actor ? history.get(identity(attempt)) ?? null : null });
    },
    resumeAttempt: (attempt: McpPreparationRecord, value: ProjectReadBoundary, signal?: AbortSignal) => {
      const entry = entries.get(attempt.target.serverId);
      return attempt.subject === actor && entry && samePreparationRecord(attempt, record(entry)) ? run(entry, value, signal) : Promise.resolve(false);
    },
    stopWaiting: async (attempt: McpPreparationRecord, value: ProjectReadBoundary, signal?: AbortSignal) => {
      const entry = entries.get(attempt.target.serverId);
      if (!journal || !matches(value) || signal?.aborted || attempt.subject !== actor || !entry || !entry.fenced ||
        entry.command.getSnapshot().kind !== "unknown" || !samePreparationRecord(attempt, record(entry))) return null;
      try {
        const saved = await journal.retireWaiting(attempt, { disposition: "unknown_fenced", policy_ref }, signal);
        history.set(identity(saved), saved); remove(entry); publish(); return saved;
      } catch { return null; }
    },
    listRetired: (serverId: string, value: ProjectReadBoundary, after?: import("./mcp-preparation-recovery").McpPreparationHistoryCursor) =>
      journal && matches(value) ? journal.listRetired(actor!, serverId, { limit: 10, ...(after ? { after } : {}) }) : Promise.resolve({ items: [], nextCursor: null }),
    inspectRetired: async (attempt: McpRetiredPreparationRecord, value: ProjectReadBoundary, signal?: AbortSignal) => {
      if (!journal || !matches(value) || signal?.aborted || attempt.subject !== actor || !options.client.getMcpPrepareReceipt) return null;
      const original: McpPreparationRecord = { subject: attempt.subject, target: attempt.target, key: attempt.key };
      const saved = await journal.getRetired(original);
      if (!saved || !matches(value) || signal?.aborted) return null;
      try {
        const result = await options.client.getMcpPrepareReceipt(attempt.target.serverId, attempt.target.version, attempt.key, signal);
        const valid = ["ready", "needs_oauth"].includes(result.server.prepare_status) && result.replayed === true && result.connector.connector_id === attempt.target.connectorId &&
          mcpPrivateServerMatches("prepareServer", { data: result }, attempt.target.serverId, { expected_state_version: attempt.target.version });
        return matches(value) && !signal?.aborted && valid ? "completed" as const : null;
      } catch (error) {
        if (!matches(value) || signal?.aborted) return null;
        return error instanceof HubClientError && error.reason === "http"
          ? mcpPrepareOutcome("getMcpPrepareReceipt", error.status, error.code, error.retryable) : null;
      }
    },
    available: Boolean(options.client.preparePrivateMcpServer || options.client.getMcpPrepareReceipt),
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    recoveryReady: () => recovered, recoveryFailed: () => recoveryError,
    restore: (value: ProjectReadBoundary) => options.recovery ? restore(value, true) : Promise.resolve(true),
    canResume: (serverId: string) => { const entry = entries.get(serverId); return entry ? !entry.blocked && (entry.command.getSnapshot().kind === "completed" || mayResume(entry)) : recovered; },
    getCompletion: (serverId: string, connectorId: string, value: ProjectReadBoundary, via?: "initial_post" | "receipt_lookup", original?: McpPreparationRecord) => {
      const entry = entries.get(serverId), completed = entry?.completion;
      return matches(value) && entry?.target.connectorId === connectorId && (!original || samePreparationRecord(original, record(entry))) && !entry.blocked && entry.command.getSnapshot().kind === "completed" &&
        completed && (via === undefined || completed.via === via)
        ? Object.freeze({ serverId: completed.serverId, connectorId: completed.connectorId, providerKey: completed.providerKey }) : null;
    },
    matches, bind,
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      leases++; bind(value); let released = false;
      return () => { if (released) return; released = true; if (--leases !== 0) return;
        bind({ ...boundary, admitted: false }); queueMicrotask(() => { if (leases === 0 && !retired) retire(); }); };
    },
    prepare: async (input: Target, value: ProjectReadBoundary, signal?: AbortSignal, newOnly = false, capture?: (attempt: McpPreparationRecord) => void): Promise<boolean> => {
      if (!matches(value) || signal?.aborted) return false;
      if (options.recovery && !await restore(value) || !matches(value) || signal?.aborted) return false;
      const target = Object.freeze(mcpPreparationTargetSchema.parse(input));
      let entry = entries.get(target.serverId);
      if (entry && entry.target.connectorId !== target.connectorId) return false;
      if (entry?.command.getSnapshot().kind === "rejected") { remove(entry); entry = undefined; }
      if (newOnly && entry) return false;
      if (!entry) {
        if (!options.canPrepare(target) || !options.client.preparePrivateMcpServer) return false;
        try {
          const saved = options.recovery ? await options.recovery.reserve(actor!, target, crypto.randomUUID())
            : { record: { subject: actor!, target, key: crypto.randomUUID() }, created: true };
          if (!matches(value) || signal?.aborted || saved.record.subject !== actor || saved.record.target.connectorId !== target.connectorId) return false;
          entry = entries.get(target.serverId);
          if (entry && !samePreparationRecord(saved.record, record(entry))) { entry.blocked = true; publish(); return false; }
          if (!entry) entry = makeEntry(saved.record, !saved.created);
          if (newOnly && !saved.created) { capture?.(Object.freeze(record(entry))); publish(); return false; }
          publish();
        } catch { recovered = false; recoveryError = true; publish(); return false; }
      }
      capture?.(Object.freeze(record(entry)));
      return run(entry, value, signal);
    },
    connectFresh: async (serverId: string, connectorId: string, providerKey: string, value: ProjectReadBoundary, signal?: AbortSignal): Promise<Readonly<{ confirmed: boolean; current?: Readonly<{ server: McpPrivateServer; connector: McpConnector }>; attempt?: McpPreparationRecord }>> => {
      const previous = entries.get(serverId);
      if (!matches(value) || signal?.aborted || !recovered || previous && (previous.target.connectorId !== connectorId || previous.command.getSnapshot().kind !== "rejected") ||
        !options.client.getPrivateMcpServer || !options.client.getMcpConnector) return { confirmed: false };
      const [server, connector] = await Promise.all([options.client.getPrivateMcpServer(serverId, signal), options.client.getMcpConnector(connectorId, signal)]);
      if (!matches(value) || signal?.aborted || entries.get(serverId) !== previous || server.server_id !== serverId || connector.connector_id !== connectorId ||
        connector.server_id !== serverId || connector.connector_type !== "mcp" || connector.provider_key !== providerKey || server.status === "disabled" || connector.status === "revoked") return { confirmed: false };
      const target = Object.freeze({ serverId, connectorId, version: server.state_version });
      if (!options.canPrepare(target)) return { confirmed: false };
      // A fresh read is not an ACK. Return only Current for the existing
      // ready/OAuth affordance; never reserve or confirm an unnecessary command.
      if (server.prepare_status === "needs_oauth" || server.prepare_status === "ready" && connector.status === "active" && connector.enabled)
        return { confirmed: false, current: Object.freeze({ server, connector }) };
      let attempt: McpPreparationRecord | undefined;
      const confirmed = await commands.prepare(target, value, signal, true, captured => { attempt = captured; });
      return { confirmed, ...(attempt ? { attempt } : {}) };
    },
    resume: (serverId: string, connectorId: string, value: ProjectReadBoundary, signal?: AbortSignal) => {
      const entry = entries.get(serverId); return entry?.target.connectorId === connectorId ? run(entry, value, signal) : Promise.resolve(false);
    },
    finish: (serverId: string, value: ProjectReadBoundary, original?: McpPreparationRecord) => {
      const entry = entries.get(serverId);
      if (!matches(value) || !entry || original && !samePreparationRecord(original, record(entry)) || entry.blocked || entry.command.getSnapshot().kind !== "completed") return false;
      remove(entry); publish(); return true;
    },
    retireTarget: (serverId: string, connectorId: string, original?: McpPreparationRecord) => {
      const entry = entries.get(serverId); if (!entry || entry.target.connectorId !== connectorId || original && !samePreparationRecord(original, record(entry))) return;
      const captured = record(entry);
      // Management cleanup cannot let an old asynchronous failure lock K2.
      if (options.recovery) void options.recovery.complete(captured).catch(async () => {
        try { await reconcileRetired(entry); } catch { /* no active entry is owned by this retired callback */ }
      });
      remove(entry); publish();
    },
  };
  return commands;
}
export type McpPreparationCommands = ReturnType<typeof createMcpPreparationCommands>;
