import { HubClientError } from "@/hub/client";
import { connectorCreationKeySchema } from "@/hub/connector-creation-key.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

export type ConnectorCommandState = Readonly<{
  kind: "idle" | "running" | "unknown" | "rejected" | "completed";
  name?: string;
}>;
type Command<T> = { readonly body: T; readonly key: string; readonly name: string | undefined; uncertain: boolean };

/** One actor-owned command, not a second profile projection. Secrets stay in RAM. */
export function createConnectorCommand<T>(options: {
  execute: ((body: T, key: string, signal: AbortSignal) => Promise<unknown>) | undefined;
  freeze: (input: T) => T;
  name?: (input: T) => string;
  invalidRequestCode: string;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
  key?: () => string;
}) {
  const actor = options.boundary.subject;
  let boundary = { ...options.boundary };
  let retired = false, leases = 0;
  let command: Command<T> | undefined;
  let active: { controller: AbortController } | undefined;
  let state: ConnectorCommandState = { kind: "idle" };
  const listeners = new Set<() => void>();
  const update = (next: ConnectorCommandState) => {
    state = Object.freeze(next);
    listeners.forEach(listener => listener());
  };
  const publish = (kind: ConnectorCommandState["kind"], name: string | undefined) =>
    update(name === undefined ? { kind } : { kind, name });
  const admitted = () => !retired && actor !== null && boundary.subject === actor && boundary.admitted;
  const matches = (value: ProjectReadBoundary) => !retired && value.subject === boundary.subject &&
    value.admitted === boundary.admitted && value.generation === boundary.generation;
  const cancel = () => {
    const previous = active;
    active = undefined;
    if (previous && command) {
      command.uncertain = true;
      publish("unknown", command.name);
    }
    previous?.controller.abort();
  };
  const bind = (value: ProjectReadBoundary) => {
    if (retired) return;
    if (value.subject !== actor) {
      retired = true;
      cancel(); command = undefined;
      update({ kind: "idle" });
      return;
    }
    if (matches(value)) return;
    boundary = { ...value };
    cancel();
    update({ ...state });
  };
  const run = async (value: ProjectReadBoundary): Promise<boolean> => {
    const intent = command;
    const execute = options.execute;
    if (!matches(value) || !admitted() || active || !intent || !execute) return false;
    const running = { controller: new AbortController() };
    active = running;
    publish("running", intent.name);
    try {
      // Store notifications may synchronously commit a new admission boundary.
      if (active !== running || !matches(value) || !admitted()) return false;
      await execute(intent.body, intent.key, running.controller.signal);
      // The original actor's confirmed write must invalidate even after its
      // window/lease retires. It grants no admission or owner facts to a new actor.
      if (retired || command !== intent) { options.onConfirmed(); return false; }
      const current = active === running && matches(value) && admitted();
      command = undefined;
      if (active !== running) active?.controller.abort();
      active = undefined;
      publish("completed", intent.name);
      options.onConfirmed();
      return current;
    } catch (error) {
      if (retired || command !== intent || active !== running) return false;
      const rejected = !intent.uncertain && error instanceof HubClientError &&
        error.reason === "http" && error.status === 400 &&
        error.code === options.invalidRequestCode && !error.retryable;
      if (rejected) command = undefined;
      else intent.uncertain = true;
      publish(rejected ? "rejected" : "unknown", intent.name);
      return false;
    } finally {
      if (active === running) active = undefined;
    }
  };
  return {
    instanceId: crypto.randomUUID(),
    available: options.execute !== undefined,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    matches,
    bind,
    pause: (value: ProjectReadBoundary) => { if (matches(value) && admitted()) cancel(); },
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      leases++; bind(value);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--leases !== 0) return;
        bind({ ...boundary, admitted: false });
        queueMicrotask(() => {
          if (leases !== 0 || retired) return;
          retired = true; cancel(); command = undefined; update({ kind: "idle" });
        });
      };
    },
    submit: (input: T, value: ProjectReadBoundary) => {
      if (!matches(value) || !admitted() || active || command || !options.execute ||
        (state.kind !== "idle" && state.kind !== "rejected")) return Promise.resolve(false);
      let body: T;
      try { body = options.freeze(input); }
      catch { update({ kind: "rejected" }); return Promise.resolve(false); }
      command = { body, name: options.name?.(body), key: connectorCreationKeySchema.parse((options.key ?? (() => crypto.randomUUID()))()), uncertain: false };
      return run(value);
    },
    retry: (value: ProjectReadBoundary) => state.kind === "unknown" ? run(value) : Promise.resolve(false),
    finish: (value: ProjectReadBoundary) => {
      if (!matches(value) || !admitted() || active || state.kind !== "completed") return false;
      update({ kind: "idle" }); return true;
    },
  };
}
