import type { HubClient } from "@/hub/client";
import { customApiProfileSchema, customApiUpdateInputSchema, customApiRemoveInputSchema, type CustomApiUpdateInput, type CustomApiRemoveInput } from "@/hub/custom-api.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createConnectorCommand, type ConnectorCommandState } from "./connector-command";

export type CustomApiManagementIntent =
  | { operation: "update"; profileId: string; input: CustomApiUpdateInput }
  | { operation: "remove"; profileId: string; input: CustomApiRemoveInput };
export type CustomApiManagementSummary = Readonly<{
  profileId: string; operation: CustomApiManagementIntent["operation"];
  kind: ConnectorCommandState["kind"]; failure?: ConnectorCommandState["failure"];
}>;
type Entry = { profileId: string; operation: CustomApiManagementIntent["operation"]; command: ReturnType<typeof createConnectorCommand<CustomApiManagementIntent>>; release: () => void; unsubscribe: () => void };

function freezeIntent(intent: CustomApiManagementIntent): CustomApiManagementIntent {
  const profileId = customApiProfileSchema.shape.profile_id.parse(intent.profileId);
  if (intent.operation === "remove") return Object.freeze({ operation: "remove", profileId, input: Object.freeze(customApiRemoveInputSchema.parse(intent.input)) });
  const input = customApiUpdateInputSchema.parse(intent.input);
  input.environment_upserts?.forEach(item => Object.freeze(item));
  if (input.environment_upserts) Object.freeze(input.environment_upserts);
  if (input.environment_removals) Object.freeze(input.environment_removals);
  return Object.freeze({ operation: "update", profileId, input: Object.freeze(input) });
}

/** Per-profile commands plus irreversible, ACK-only negative display locators. No secret snapshots. */
export function createCustomApiManagementCommands(options: {
  client: Pick<HubClient, "updateCustomApi" | "removeCustomApi">;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
}) {
  const actor = options.boundary.subject;
  let boundary = { ...options.boundary }, leases = 0, retired = false;
  const entries = new Map<string, Entry>(), listeners = new Set<() => void>();
  let snapshot: readonly CustomApiManagementSummary[] = Object.freeze([]);
  const deleted = new Set<string>();
  let deletedSnapshot: readonly string[] = Object.freeze([]);
  const publish = () => {
    snapshot = Object.freeze([...entries.values()].map(entry => {
      const state = entry.command.getSnapshot();
      return Object.freeze({ profileId: entry.profileId, operation: entry.operation, kind: state.kind, ...(state.failure === undefined ? {} : { failure: state.failure }) });
    }));
    listeners.forEach(listener => listener());
  };
  const matches = (value: ProjectReadBoundary) => !retired && actor !== null && boundary.subject === actor && boundary.admitted && value.admitted && value.subject === actor && value.generation === boundary.generation;
  const remove = (entry: Entry) => {
    entries.delete(entry.profileId); entry.unsubscribe();
    entry.command.bind({ ...boundary, subject: null, admitted: false }); entry.release();
  };
  const retire = () => { retired = true; for (const entry of [...entries.values()]) remove(entry); deleted.clear(); deletedSnapshot = Object.freeze([]); publish(); };
  const bind = (value: ProjectReadBoundary) => {
    if (retired) return;
    if (value.subject !== actor) { retire(); return; }
    boundary = { ...value }; for (const entry of entries.values()) entry.command.bind(boundary); publish();
  };
  const run = async (entry: Entry, value: ProjectReadBoundary, signal: AbortSignal | undefined, input?: CustomApiManagementIntent) => {
    if (!matches(value) || signal?.aborted || entries.get(entry.profileId) !== entry) return false;
    const kind = entry.command.getSnapshot().kind;
    if (kind === "completed") return input === undefined;
    if (kind === "running") return false;
    const pause = () => entry.command.pause(value);
    signal?.addEventListener("abort", pause, { once: true });
    try {
      const confirmed = input ? await entry.command.submit(input, value) : await entry.command.retry(value);
      return confirmed || (matches(value) && !signal?.aborted && entries.get(entry.profileId) === entry && entry.command.getSnapshot().kind === "completed");
    } finally { signal?.removeEventListener("abort", pause); }
  };
  return {
    canUpdate: options.client.updateCustomApi !== undefined,
    canRemove: options.client.removeCustomApi !== undefined,
    getSnapshot: () => snapshot,
    getConfirmedDeletedSnapshot: () => deletedSnapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    matches, bind,
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      leases++; bind(value); let released = false;
      return () => { if (released) return; released = true; if (--leases !== 0) return;
        bind({ ...boundary, admitted: false }); queueMicrotask(() => { if (leases === 0 && !retired) retire(); }); };
    },
    submit: (input: CustomApiManagementIntent, value: ProjectReadBoundary, signal?: AbortSignal) => {
      if (!matches(value) || signal?.aborted || !(input.operation === "update" ? options.client.updateCustomApi : options.client.removeCustomApi)) return Promise.resolve(false);
      let entry = entries.get(input.profileId);
      if (entry?.command.getSnapshot().kind === "rejected") { remove(entry); entry = undefined; }
      if (entry) return Promise.resolve(false);
      let confirmedRemovedProfileId: string | undefined;
      const command = createConnectorCommand<CustomApiManagementIntent>({
        boundary, surface: "custom_api", invalidRequestCode: "invalid_custom_api_request", freeze: freezeIntent,
        execute: async (body, key, requestSignal) => {
          if (body.operation === "update") return options.client.updateCustomApi!(body.profileId, body.input, key, requestSignal);
          // The production client validates deleted:true and the exact profile_id
          // before resolving. Record only the already-frozen original locator.
          await options.client.removeCustomApi!(body.profileId, body.input, key, requestSignal);
          confirmedRemovedProfileId = body.profileId;
          return undefined;
        },
        onConfirmed: () => {
          // A late ACK may outlive its dialog, never its original actor owner.
          if (!retired && confirmedRemovedProfileId !== undefined && !deleted.has(confirmedRemovedProfileId)) {
            deleted.add(confirmedRemovedProfileId);
            deletedSnapshot = Object.freeze([...deleted]);
            publish();
          }
          options.onConfirmed();
        },
      });
      entry = { profileId: input.profileId, operation: input.operation, command, release: command.retain(boundary), unsubscribe: command.subscribe(publish) };
      entries.set(input.profileId, entry);
      return run(entry, value, signal, input);
    },
    resume: (profileId: string, value: ProjectReadBoundary, signal?: AbortSignal) => {
      const entry = entries.get(profileId); return entry ? run(entry, value, signal) : Promise.resolve(false);
    },
    finish: (profileId: string, value: ProjectReadBoundary) => {
      const entry = entries.get(profileId);
      if (!matches(value) || !entry || entry.command.getSnapshot().kind !== "completed") return false;
      remove(entry); publish(); return true;
    },
  };
}
export type CustomApiManagementCommands = ReturnType<typeof createCustomApiManagementCommands>;
