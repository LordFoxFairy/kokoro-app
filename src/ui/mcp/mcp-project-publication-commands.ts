import type { McpProjectPublicationClient } from "@/hub/mcp-project-publication-client";
import { mcpPublicationInputSchema, type McpPublicationIdentity, type McpPublicationAck } from "@/hub/mcp-project-publication.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpServerCreationCompletion } from "./mcp-server-creation-flow";
import { mcpPublicationErrorPolicy } from "@/hub/mcp-project-publication-error";
import { HubClientError } from "@/hub/client";
import type { PublicationRecoveryJournal, PublicationRecoveryRecord } from "./mcp-project-publication-recovery";

export type PublicationState = Readonly<{
  target: McpServerCreationCompletion | null;
  phase: "idle" | "busy" | "unknown" | "rejected" | "completed";
  recovery: "loading" | "ready" | "error";
  ack: McpPublicationAck | null;
  mayRetry: boolean;
}>;
const canonical = (value: McpPublicationIdentity) => JSON.stringify({
  server_id: value.server_id, connector_id: value.connector_id, expected_source_state_version: value.expected_source_state_version,
  targets: [...value.targets].sort((a, b) => a.project_id < b.project_id ? -1 : a.project_id > b.project_id ? 1 : 0),
});
const same = (a: PublicationRecoveryRecord, b: PublicationRecoveryRecord) => a.subject === b.subject && a.key === b.key &&
  a.target.serverId === b.target.serverId && a.target.connectorId === b.target.connectorId && a.target.providerKey === b.target.providerKey && JSON.stringify(a.original.targets) === JSON.stringify(b.original.targets) && canonical(a.original) === canonical(b.original);
const policyFor = (record: PublicationRecoveryRecord) => record.failure ? mcpPublicationErrorPolicy(record.failure.status, record.failure) : null;

/** Persist before dispatch. Restoring or reopening a picker never executes a command. */
export function createMcpProjectPublicationCommands(client: McpProjectPublicationClient | undefined, initial: ProjectReadBoundary, journal: PublicationRecoveryJournal) {
  const actor = initial.subject;
  let boundary = { ...initial }, retired = false, recoveryEpoch = 0;
  let intent: PublicationRecoveryRecord | null = null;
  let flight: AbortController | null = null;
  let priorUnknown = false;
  let revisedFrom: string | null = null;
  let state: PublicationState = { target: null, phase: "idle", recovery: client ? "loading" : "ready", ack: null, mayRetry: false };
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<PublicationState>) => { state = Object.freeze({ ...state, ...patch }); listeners.forEach(listener => listener()); };
  const matches = (scope: ProjectReadBoundary) => !retired && actor !== null && scope.admitted && boundary.admitted && scope.subject === actor && boundary.subject === actor && scope.generation === boundary.generation;
  const adopt = (record: PublicationRecoveryRecord) => {
    intent = record; priorUnknown = true; revisedFrom = null;
    emit({ target: record.target, phase: "unknown", recovery: "ready", ack: null, mayRetry: policyFor(record)?.recovery === "same_command" });
  };
  const storageFailed = () => emit({ recovery: "error", phase: intent ? "unknown" : "idle", ack: null, mayRetry: false });
  const pause = () => {
    recoveryEpoch++;
    const old = flight; flight = null; old?.abort();
    if (old && intent) {
      priorUnknown = true;
      const paused = intent;
      // A suspended command is no longer a first-known rejection, even if its late response arrives.
      void journal.markFailure(paused).catch(() => { if (intent === paused && !retired) storageFailed(); });
      emit({ phase: "unknown", ack: null, mayRetry: false });
    }
  };
  const restore = async (scope: ProjectReadBoundary) => {
    if (!client || !matches(scope) || flight || actor === null) return false;
    const epoch = ++recoveryEpoch; emit({ recovery: "loading", mayRetry: false });
    try {
      const stored = await journal.read(actor);
      if (epoch !== recoveryEpoch || !matches(scope)) return false;
      if (stored) adopt(stored);
      else if (intent && state.phase !== "completed") { storageFailed(); return false; }
      else emit({ recovery: "ready" });
      return true;
    } catch { if (epoch === recoveryEpoch && matches(scope)) storageFailed(); return false; }
  };
  const run = async (scope: ProjectReadBoundary, receipt: boolean, reserve = false) => {
    if (!client || !matches(scope) || flight || !intent || state.recovery !== "ready") return false;
    const current = intent, controller = new AbortController(); flight = controller; emit({ phase: "busy", mayRetry: false });
    let stage: "journal" | "network" = "journal";
    const active = () => flight === controller && intent === current && matches(scope);
    try {
      const stored = await (reserve ? journal.reserve(current) : journal.read(current.subject));
      if (!active()) return false;
      if (!stored) { storageFailed(); return false; }
      if (!same(stored, current)) { adopt(stored); return false; }
      // Another tab may have narrowed the policy since this view was rendered.
      if (!reserve && !receipt && policyFor(stored)?.recovery !== "same_command") { adopt(stored); return false; }
      stage = "network";
      const result = await (receipt ? client.receipt : client.publish)(current.original, current.key, controller.signal);
      if (!active()) return false;
      stage = "journal";
      const cleared = await journal.compareClear(current);
      if (!active()) return false;
      if (!cleared) { storageFailed(); return false; }
      emit({ phase: "completed", ack: result, recovery: "ready", mayRetry: false }); return true;
    } catch (error) {
      if (!active()) return false;
      if (stage === "journal") { priorUnknown = true; storageFailed(); return false; }
      const failure = error instanceof HubClientError && error.reason === "http" && error.status !== null && error.code !== null
        ? { status: error.status, code: error.code, retryable: error.retryable } : undefined;
      const policy = failure ? mcpPublicationErrorPolicy(failure.status, failure) : null;
      try {
        // Receipt failures never assert noncommit. Keep a known command retry policy only when receipt read failed.
        const persisted = await journal.markFailure(current, receipt ? policyFor(current)?.recovery === "same_command" ? current.failure : undefined : priorUnknown && policy?.first_rejection_allows_revised_command ? undefined : policy ? failure : undefined);
        if (!active()) return false;
        if (!persisted) { storageFailed(); return false; }
        intent = persisted;
        const storedPolicy = policyFor(persisted);
        if (!receipt && !priorUnknown && policy?.first_rejection_allows_revised_command &&
          persisted.failure?.status === failure?.status && persisted.failure?.code === failure?.code && persisted.failure?.retryable === failure?.retryable) {
          emit({ phase: "rejected", ack: null, mayRetry: false });
        } else {
          priorUnknown = true;
          emit({ phase: "unknown", ack: null, mayRetry: storedPolicy?.recovery === "same_command" });
        }
      } catch { if (active()) { priorUnknown = true; storageFailed(); } }
      return false;
    } finally { if (flight === controller) flight = null; }
  };
  return {
    available: client !== undefined,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    bind: (next: ProjectReadBoundary) => {
      if (next.subject !== actor) { retired = true; pause(); intent = null; emit({ target: null, phase: "idle", ack: null, mayRetry: false }); return; }
      if (next.admitted !== boundary.admitted || next.generation !== boundary.generation) pause();
      boundary = { ...next };
      if (next.admitted && state.recovery !== "ready") void restore(next);
    },
    restore,
    open: (target: McpServerCreationCompletion, scope: ProjectReadBoundary) => {
      if (!matches(scope) || state.recovery !== "ready" || intent && (state.target?.serverId !== target.serverId || state.target.connectorId !== target.connectorId)) return false;
      if (!intent) emit({ target: Object.freeze({ ...target }), phase: "idle", ack: null, mayRetry: false });
      return true;
    },
    publish: (original: McpPublicationIdentity, scope: ProjectReadBoundary) => {
      if (!matches(scope) || !client || intent || !state.target || actor === null || state.recovery !== "ready" || original.server_id !== state.target.serverId || original.connector_id !== state.target.connectorId) return Promise.resolve(false);
      const { server_id, ...input } = original;
      const parsed = mcpPublicationInputSchema.parse(input);
      if (revisedFrom !== null && revisedFrom === canonical({ ...parsed, server_id })) { emit({ phase: "rejected" }); return Promise.resolve(false); }
      revisedFrom = null; priorUnknown = false;
      intent = { subject: actor, target: state.target, original: structuredClone({ ...parsed, server_id }), key: crypto.randomUUID() };
      return run(scope, false, true);
    },
    inspect: (scope: ProjectReadBoundary) => state.phase === "unknown" ? run(scope, true) : Promise.resolve(false),
    retry: (scope: ProjectReadBoundary) => state.phase === "unknown" && state.mayRetry ? run(scope, false) : Promise.resolve(false),
    revise: async (scope: ProjectReadBoundary) => {
      if (!matches(scope) || state.phase !== "rejected" || state.recovery !== "ready" || priorUnknown || flight) return false;
      const current = intent;
      if (!current) { emit({ phase: "idle" }); return true; }
      const controller = new AbortController(); flight = controller; emit({ phase: "busy" });
      try {
        const cleared = await journal.compareClear(current, { firstRejectionOnly: true });
        if (flight !== controller || !matches(scope)) return false;
        if (!cleared) { storageFailed(); return false; }
        revisedFrom = canonical(current.original); intent = null; emit({ phase: "idle", ack: null, mayRetry: false }); return true;
      } catch { if (flight === controller && matches(scope)) storageFailed(); return false; }
      finally { if (flight === controller) flight = null; }
    },
    dismiss: () => { pause(); if (!intent || state.phase === "completed") { intent = null; revisedFrom = null; emit({ target: null, phase: "idle", ack: null, mayRetry: false }); } },
    pause,
  };
}
export type McpProjectPublicationCommands = ReturnType<typeof createMcpProjectPublicationCommands>;
