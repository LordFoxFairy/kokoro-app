import { HubClientError, type HubClient } from "@/hub/client";
import { connectorCreationKeySchema } from "@/hub/connector-creation-key.schema";
import { mcpPrivateServerRegistrationInputSchema, type McpPrivateServerRegistrationInput,
  type McpPrivateServer, type McpConnector } from "@/hub/mcp-connector.schema";
import type { McpPreparationCommands } from "./mcp-preparation-commands";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

export type McpCreationScope = Readonly<{ boundary: ProjectReadBoundary; window: object }>;
export type McpCreationFacts = Readonly<{ server: McpPrivateServer; connector: McpConnector }>;
export type McpServerCreationState = Readonly<{
  registered: boolean; busy: boolean; unknown: "register" | "prepare" | null;
  facts: McpCreationFacts | null; name: string; error: boolean;
}>;
type Intent<T> = { body: T; key: string; uncertain: boolean; confirmed: boolean };
type Flight = { kind: "register" | "prepare" | "read"; controller: AbortController; scope: McpCreationScope; read?: Promise<McpCreationFacts | null> };
type Client = Pick<HubClient, "registerPrivateMcpServer" | "preparePrivateMcpServer" | "getPrivateMcpServer" | "getMcpConnector" | "beginMcpConnectorAuthorization">;

/** One private MCP creation workflow; only locators/unknown commands survive read retirement. */
export function createMcpServerCreationFlow(options: { client: Client; preparation: McpPreparationCommands; boundary: ProjectReadBoundary; onChanged: () => void }) {
  const { client } = options, actor = options.boundary.subject;
  let boundary = { ...options.boundary }, window: object | null = null, leases = 0, retired = false;
  let registration: Intent<McpPrivateServerRegistrationInput> | undefined;
  const preparation = options.preparation;
  let releasePreparation: (() => void) | undefined;
  let locator: { serverId: string; connectorId: string } | undefined;
  let active: Flight | undefined;
  let state: McpServerCreationState = { registered: false, busy: false, unknown: null, facts: null, name: "", error: false };
  const listeners = new Set<() => void>();
  const preparationKind = () => {
    const target = locator;
    return target ? preparation.getSnapshot().find(item => item.serverId === target.serverId && item.connectorId === target.connectorId)?.kind : undefined;
  };
  const publish = (patch: Partial<McpServerCreationState> = {}) => {
    state = Object.freeze({ ...state, ...patch, registered: locator !== undefined,
      busy: active !== undefined || preparationKind() === "running", unknown: registration?.uncertain ? "register" : preparationKind() === "unknown" ? "prepare" : null });
    listeners.forEach(listener => listener());
  };
  const matches = (scope: McpCreationScope) => !retired && actor !== null && boundary.admitted &&
    boundary.subject === actor && scope.window === window && scope.boundary.admitted &&
    scope.boundary.subject === actor && scope.boundary.generation === boundary.generation;
  const ready = (facts: McpCreationFacts | null) => facts?.server.prepare_status === "ready" &&
    facts.connector.status === "active" && facts.connector.enabled;
  const cancel = () => {
    const previous = active; active = undefined;
    if (previous?.kind === "register" && registration) registration.uncertain = true;
    previous?.controller.abort(); publish({ facts: null });
  };
  const bind = (next: ProjectReadBoundary) => {
    if (retired) return;
    if (next.subject !== actor) {
      retired = true; cancel(); registration = undefined; locator = undefined;
      publish({ facts: null, name: "", error: false }); return;
    }
    if (next.admitted === boundary.admitted && next.generation === boundary.generation) return;
    boundary = { ...next }; cancel();
  };
  const read = (scope: McpCreationScope, force = false): Promise<McpCreationFacts | null> => {
    if (!matches(scope) || !locator || !client.getPrivateMcpServer || !client.getMcpConnector) return Promise.resolve(null);
    if (active) {
      if (active.kind !== "read") return Promise.resolve(null);
      if (!force && active.scope.window === scope.window && active.scope.boundary.generation === scope.boundary.generation)
        return active.read ?? Promise.resolve(null);
      cancel();
    }
    const target = locator, flight: Flight = { kind: "read", controller: new AbortController(), scope };
    active = flight; publish({ facts: null, error: false });
    flight.read = (async () => {
      try {
        if (active !== flight || !matches(scope)) return null;
        const [server, connector] = await Promise.all([
          client.getPrivateMcpServer!(target.serverId, flight.controller.signal),
          client.getMcpConnector!(target.connectorId, flight.controller.signal),
        ]);
        if (active !== flight || !matches(scope) || locator !== target) return null;
        if (server.server_id !== target.serverId || connector.connector_id !== target.connectorId ||
          connector.server_id !== server.server_id || connector.connector_type !== "mcp") throw new Error("MCP creation locator mismatch");
        const facts = { server, connector }; publish({ facts }); return facts;
      } catch {
        flight.controller.abort();
        if (active === flight && matches(scope)) publish({ error: true, facts: null });
        return null;
      } finally { if (active === flight) { active = undefined; publish(); } }
    })();
    return flight.read;
  };
  const changed = (intent: { confirmed: boolean }) => {
    if (intent.confirmed) return;
    intent.confirmed = true; options.onChanged();
  };
  const reconcileLate = () => {
    if (window && boundary.admitted && !retired) void read({ window, boundary: { ...boundary } }, true);
  };
  const runPrepare = async (scope: McpCreationScope, version?: string): Promise<boolean> => {
    if (!locator || active || !matches(scope)) return false;
    const target = locator;
    const flight: Flight = { kind: "prepare", controller: new AbortController(), scope };
    active = flight; publish({ error: false });
    try {
      if (active !== flight || !matches(scope)) return false;
      const confirmed = version === undefined
        ? await preparation.resume(target.serverId, target.connectorId, scope.boundary, flight.controller.signal)
        : await preparation.prepare({ ...target, version }, scope.boundary, flight.controller.signal);
      const current = active === flight && matches(scope) && locator === target;
      if (active === flight) active = undefined;
      publish();
      if (!current) { reconcileLate(); return false; }
      if (!confirmed) { publish({ error: true }); return false; }
      return ready(await read(scope, true));
    } catch {
      if (active === flight && matches(scope)) publish({ error: true });
      return false;
    } finally { if (active === flight) { active = undefined; publish(); } }
  };
  const prepare = async (scope: McpCreationScope): Promise<boolean> => {
    if (!matches(scope) || !locator || registration || active?.kind === "register" || active?.kind === "prepare") return false;
    const kind = preparationKind();
    if (kind === "unknown" || kind === "completed") return runPrepare(scope);
    if (kind === "running") return false;
    const facts = await read(scope);
    if (!facts || !matches(scope) || active || !locator) return false;
    if (ready(facts)) return true;
    if (facts.connector.status === "revoked" || facts.server.status === "disabled") { publish({ error: true }); return false; }
    if (facts.server.prepare_status === "needs_oauth") return false;
    return runPrepare(scope, facts.server.state_version);
  };
  const runRegistration = async (scope: McpCreationScope): Promise<boolean> => {
    const intent = registration;
    if (!intent || !matches(scope) || active || !client.registerPrivateMcpServer) return false;
    const flight: Flight = { kind: "register", controller: new AbortController(), scope };
    active = flight; publish({ error: false, name: intent.body.display_name });
    try {
      if (active !== flight || !matches(scope)) return false;
      const result = await client.registerPrivateMcpServer(intent.body, intent.key, flight.controller.signal);
      changed(intent);
      if (retired || registration !== intent) return false;
      locator = { serverId: result.server.server_id, connectorId: result.connector.connector_id };
      registration = undefined;
      const current = active === flight && matches(scope);
      if (active === flight) active = undefined;
      publish({ facts: null });
      if (!current) { reconcileLate(); return false; }
      return prepare(scope);
    } catch (error) {
      if (!retired && registration === intent && active === flight) {
        if (!intent.uncertain && error instanceof HubClientError && error.reason === "http" &&
          error.status === 400 && error.code === "invalid_mcp_personal_request" && !error.retryable) registration = undefined;
        else intent.uncertain = true;
        publish({ error: true });
      }
      return false;
    } finally { if (active === flight) { active = undefined; publish(); } }
  };
  const resetKnown = (scope: McpCreationScope) => {
    if (!matches(scope) || active || registration || preparationKind() === "running" || preparationKind() === "unknown") return false;
    if (locator) {
      if (preparationKind() === "completed") preparation.finish(locator.serverId, scope.boundary);
      else if (preparationKind() === "rejected") preparation.retireTarget(locator.serverId, locator.connectorId);
    }
    locator = undefined; publish({ name: "", facts: null, error: false }); return true;
  };
  return {
    instanceId: crypto.randomUUID(), client,
    authorizationAcknowledged: options.onChanged,
    available: Boolean(client.registerPrivateMcpServer && client.preparePrivateMcpServer && client.getPrivateMcpServer && client.getMcpConnector),
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    matches,
    bind,
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      if (leases++ === 0) {
        let previousKind = preparationKind();
        releasePreparation = preparation.subscribe(() => {
          const kind = preparationKind();
          if (previousKind !== undefined && kind === undefined && !window && !active) {
            locator = undefined;
            publish({ facts: null, name: "", error: false });
          } else publish();
          previousKind = kind;
        });
      }
      bind(value); publish(); let released = false;
      return () => {
        if (released) return; released = true;
        if (--leases !== 0) return;
        releasePreparation?.(); releasePreparation = undefined;
        bind({ ...boundary, admitted: false });
        queueMicrotask(() => { if (leases !== 0 || retired) return; retired = true; cancel(); registration = undefined; locator = undefined; publish({ facts: null, name: "", error: false }); });
      };
    },
    attach: (value: object) => { if (window !== value) cancel(); window = value; publish(); return () => { if (window === value) { window = null; cancel(); } }; },
    refresh: read,
    pause: (scope: McpCreationScope) => { if (matches(scope)) cancel(); },
    prepare,
    submit: (input: McpPrivateServerRegistrationInput, scope: McpCreationScope) => {
      if (!matches(scope) || active || locator || registration) return Promise.resolve(false);
      const parsed = mcpPrivateServerRegistrationInputSchema.safeParse(input);
      if (!parsed.success) { publish({ error: true }); return Promise.resolve(false); }
      const body = parsed.data;
      body.headers?.forEach(item => Object.freeze(item)); if (body.headers) Object.freeze(body.headers);
      if (body.oauth_client) Object.freeze(body.oauth_client); Object.freeze(body);
      registration = { body, key: connectorCreationKeySchema.parse(crypto.randomUUID()), uncertain: false, confirmed: false };
      return runRegistration(scope);
    },
    retry: (scope: McpCreationScope) => registration ? runRegistration(scope) : prepare(scope),
    finish: (scope: McpCreationScope) => ready(state.facts) && !state.unknown ? resetKnown(scope) : false,
    dismiss: resetKnown,
    reconcile: async (scope: McpCreationScope) => { if (!matches(scope)) return false; options.onChanged(); return ready(await read(scope, true)); },
  };
}
export type McpServerCreationFlow = ReturnType<typeof createMcpServerCreationFlow>;
