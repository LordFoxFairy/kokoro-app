import { HubClientError, type HubClient } from "@/hub/client";
import { customApiCommandKeySchema, customApiCreateInputSchema, type CustomApiCreateInput } from "@/hub/custom-api.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

export type CustomApiCreateState = Readonly<{
  kind: "idle" | "running" | "unknown" | "rejected" | "completed";
  name?: string;
}>;
type Command = { readonly body: CustomApiCreateInput; readonly key: string; uncertain: boolean };

/** One actor-owned command, not a second profile projection. Secrets stay in RAM. */
export function createCustomApiCreateFlow(options: {
  client: Pick<HubClient, "createCustomApi">;
  boundary: ProjectReadBoundary;
  onConfirmed: () => void;
  key?: () => string;
}) {
  const actor = options.boundary.subject;
  let boundary = { ...options.boundary };
  let retired = false, leases = 0;
  let command: Command | undefined;
  let active: { controller: AbortController } | undefined;
  let state: CustomApiCreateState = { kind: "idle" };
  const listeners = new Set<() => void>();
  const update = (next: CustomApiCreateState) => {
    state = Object.freeze(next);
    listeners.forEach(listener => listener());
  };
  const admitted = () => !retired && actor !== null && boundary.subject === actor && boundary.admitted;
  const matches = (value: ProjectReadBoundary) => !retired && value.subject === boundary.subject &&
    value.admitted === boundary.admitted && value.generation === boundary.generation;
  const cancel = () => {
    const previous = active;
    active = undefined;
    if (previous && command) {
      command.uncertain = true;
      update({ kind: "unknown", name: command.body.name });
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
    const create = options.client.createCustomApi;
    if (!matches(value) || !admitted() || active || !intent || !create) return false;
    const running = { controller: new AbortController() };
    active = running;
    update({ kind: "running", name: intent.body.name });
    try {
      await create(intent.body, intent.key, running.controller.signal);
      // The original actor's confirmed write must invalidate even after its
      // window/lease retires. It grants no admission or owner facts to a new actor.
      if (retired || command !== intent) { options.onConfirmed(); return false; }
      const current = active === running && matches(value) && admitted();
      command = undefined;
      if (active !== running) active?.controller.abort();
      active = undefined;
      update({ kind: "completed", name: intent.body.name });
      options.onConfirmed();
      return current;
    } catch (error) {
      if (retired || command !== intent || active !== running) return false;
      const rejected = !intent.uncertain && error instanceof HubClientError &&
        error.reason === "http" && error.status === 400 &&
        error.code === "invalid_custom_api_request" && !error.retryable;
      if (rejected) command = undefined;
      else intent.uncertain = true;
      update({ kind: rejected ? "rejected" : "unknown", name: intent.body.name });
      return false;
    } finally {
      if (active === running) active = undefined;
    }
  };
  return {
    instanceId: crypto.randomUUID(),
    available: options.client.createCustomApi !== undefined,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    matches,
    bind,
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
    submit: (input: CustomApiCreateInput, value: ProjectReadBoundary) => {
      if (!matches(value) || !admitted() || active || command || !options.client.createCustomApi ||
        (state.kind !== "idle" && state.kind !== "rejected")) return Promise.resolve(false);
      const parsed = customApiCreateInputSchema.safeParse(input);
      if (!parsed.success) { update({ kind: "rejected" }); return Promise.resolve(false); }
      parsed.data.environment.forEach(item => Object.freeze(item));
      Object.freeze(parsed.data.environment); Object.freeze(parsed.data);
      command = { body: parsed.data, key: customApiCommandKeySchema.parse((options.key ?? (() => crypto.randomUUID()))()), uncertain: false };
      return run(value);
    },
    retry: (value: ProjectReadBoundary) => state.kind === "unknown" ? run(value) : Promise.resolve(false),
    finish: (value: ProjectReadBoundary) => {
      if (!matches(value) || !admitted() || active || state.kind !== "completed") return false;
      update({ kind: "idle" }); return true;
    },
  };
}
export type CustomApiCreateFlow = ReturnType<typeof createCustomApiCreateFlow>;
