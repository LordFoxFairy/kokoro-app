import { connectorCommandFailure, connectorCommandMayResume, type ConnectorCommandFailure } from "./connector-command-failure";
import { HubClientError, type HubClient } from "@/hub/client";
import { connectorCreationKeySchema } from "@/hub/connector-creation-key.schema";
import { mcpPrivateServerRegistrationInputSchema, type McpPrivateServerRegistrationInput,
  type McpPrivateServer, type McpConnector } from "@/hub/mcp-connector.schema";
import { canAuthorizePrivateMcp } from "./private-mcp-oauth-binding";
import type { McpPreparationRecord } from "./mcp-preparation-recovery";
import type { McpPreparationView } from "./mcp-preparation-commands";
import type { McpPreparationCommands } from "./mcp-preparation-commands";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

export type McpCreationScope = Readonly<{ boundary: ProjectReadBoundary; window: object }>;
export type McpCreationFacts = Readonly<{ server: McpPrivateServer; connector: McpConnector }>;
/** Navigation carries only the acknowledged binding, never configuration or secrets. */
export type McpServerCreationCompletion = Readonly<{ serverId: string; connectorId: string; providerKey: string }>;
export type McpCreationIntent = "configure" | "connect" | "publish";
export type McpServerCreationState = Readonly<{
  intent: McpCreationIntent | null; registered: boolean; publishRequested: boolean; busy: boolean; unknown: "register" | "prepare" | null;
  facts: McpCreationFacts | null; name: string; error: boolean; failure?: ConnectorCommandFailure;
  preparationView?: McpPreparationView | undefined;
  registrationRejection: "url_conflict" | null;
}>;
type Intent<T> = { body: T; key: string; uncertain: boolean; confirmed: boolean; intent: McpCreationIntent; failure: ConnectorCommandFailure | undefined };
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
  // Only a successful Current read updates this non-secret binding. A failed
  // read cannot erase an observed provider conflict and revive an older ACK locator.
  let observedBinding: McpServerCreationCompletion | null = null;
  let attempt: McpPreparationRecord | null = null;
  let active: Flight | undefined;
  let state: McpServerCreationState = { intent: null, registered: false, publishRequested: false, busy: false, unknown: null, facts: null, name: "", error: false, registrationRejection: null };
  const listeners = new Set<() => void>();
  const preparationState = () => {
    const target = locator;
    return target ? preparation.getSnapshot().find(item => item.serverId === target.serverId && item.connectorId === target.connectorId) : undefined;
  };
  const preparationKind = () => preparationState()?.kind;
  const publish = (patch: Partial<McpServerCreationState> = {}) => {
    const previous = { ...state };
    delete previous.failure;
    if (!attempt && locator && preparationKind() !== undefined) attempt = preparation.getAttempt(locator.serverId, locator.connectorId, boundary);
    const preparationView = attempt ? preparation.getView(attempt, boundary) : undefined;
    const failure = registration?.failure ?? preparationState()?.failure;
    state = Object.freeze({ ...previous, ...patch, preparationView, ...(failure === undefined ? {} : { failure }), registered: locator !== undefined,
      busy: active !== undefined || preparationKind() === "running", unknown: registration?.uncertain ? "register" : preparationKind() === "unknown" ? "prepare" : null });
    listeners.forEach(listener => listener());
  };
  const matches = (scope: McpCreationScope) => !retired && actor !== null && boundary.admitted &&
    boundary.subject === actor && scope.window === window && scope.boundary.admitted &&
    scope.boundary.subject === actor && scope.boundary.generation === boundary.generation;
  const ready = (facts: McpCreationFacts | null) => facts?.server.prepare_status === "ready" &&
    facts.connector.status === "active" && facts.connector.enabled;
  const receiptCompletion = (scope: McpCreationScope, via?: "initial_post" | "receipt_lookup") => matches(scope) && locator && attempt
    ? preparation.getCompletion(locator.serverId, locator.connectorId, scope.boundary, via, attempt) : null;
  const boundPreparationCompletion = (scope: McpCreationScope) => {
    const completed = receiptCompletion(scope), facts = state.facts;
    if (!completed || observedBinding && (observedBinding.serverId !== completed.serverId || observedBinding.connectorId !== completed.connectorId || observedBinding.providerKey !== completed.providerKey) || facts && (facts.server.server_id !== completed.serverId || facts.connector.connector_id !== completed.connectorId ||
      facts.connector.server_id !== completed.serverId || facts.connector.provider_key !== completed.providerKey)) return null;
    return completed;
  };
  const preparationCompletion = (scope: McpCreationScope) => state.preparationView?.retired ? null : receiptCompletion(scope, "initial_post") && state.facts?.server.prepare_status === "needs_oauth"
    ? null : boundPreparationCompletion(scope);
  const canAuthorize = (scope: McpCreationScope) => matches(scope) && !active && !registration && !state.unknown && !state.preparationView?.retired &&
    state.facts?.server.prepare_status === "needs_oauth" && canAuthorizePrivateMcp(state.facts.connector, state.facts.server) &&
    (receiptCompletion(scope, "initial_post") ? boundPreparationCompletion(scope) !== null : preparationKind() === undefined);
  const cancel = () => {
    const previous = active; active = undefined;
    if (previous?.kind === "register" && registration) registration.uncertain = true;
    previous?.controller.abort(); publish({ facts: null });
  };
  const bind = (next: ProjectReadBoundary) => {
    if (retired) return;
    if (next.subject !== actor) {
      retired = true; cancel(); registration = undefined; locator = undefined; observedBinding = null;
      publish({ facts: null, name: "", error: false, registrationRejection: null }); return;
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
        const facts = { server, connector };
        observedBinding = Object.freeze({ serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key });
        publish({ facts }); return facts;
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
        ? attempt ? await preparation.resumeAttempt(attempt, scope.boundary, flight.controller.signal) : false
        : await preparation.prepare({ ...target, version }, scope.boundary, flight.controller.signal, false, captured => {
          if (active === flight && locator === target) attempt = captured;
        });
      const current = active === flight && matches(scope) && locator === target;
      if (active === flight) active = undefined;
      publish();
      if (!current) { reconcileLate(); return false; }
      if (!confirmed) { publish({ error: true }); return false; }
      const facts = await read(scope, true);
      if (version !== undefined && facts?.server.prepare_status === "needs_oauth") {
        return false;
      }
      if (receiptCompletion(scope)) {
        if (!preparationCompletion(scope)) { publish({ error: true }); return false; }
        return true;
      }
      return ready(facts);
    } catch {
      if (active === flight && matches(scope)) publish({ error: true });
      return false;
    } finally { if (active === flight) { active = undefined; publish(); } }
  };
  const prepare = async (scope: McpCreationScope): Promise<boolean> => {
    if (state.preparationView?.retired) return false;
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
    if (!intent || !matches(scope) || active || !client.registerPrivateMcpServer || !connectorCommandMayResume(intent.failure)) return false;
    const flight: Flight = { kind: "register", controller: new AbortController(), scope };
    active = flight; intent.failure = undefined; publish({ error: false, registrationRejection: null, name: intent.body.display_name });
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
      return intent.intent === "connect" ? prepare(scope) : Boolean(await read(scope, true));
    } catch (error) {
      if (!retired && registration === intent && active === flight) {
        // A first verified semantic rejection is not an unknown commit. A
        // later duplicate after a lost ACK can be our original creation, so
        // it must keep the frozen original command just like all uncertainty.
        const rejected = !intent.uncertain && error instanceof HubClientError && error.reason === "http" && !error.retryable;
        const duplicateUrl = rejected && error.status === 409 && error.code === "mcp_personal_server_url_conflict";
        if (duplicateUrl || rejected && error.status === 400 && error.code === "invalid_mcp_personal_request") registration = undefined;
        else { intent.uncertain = true; intent.failure = connectorCommandFailure("mcp", error); }
        publish({ error: true, registrationRejection: duplicateUrl ? "url_conflict" : null });
      }
      return false;
    } finally { if (active === flight) { active = undefined; publish(); } }
  };
  const resetKnown = (scope: McpCreationScope) => {
    if (!matches(scope) || active || registration || preparationKind() === "running" || preparationKind() === "unknown") return false;
    if (locator) {
      if (preparationKind() !== undefined && (!attempt || preparation.getView(attempt, scope.boundary).kind !== preparationKind())) return false;
      if (preparationKind() === "completed" && (!attempt || !preparation.finish(locator.serverId, scope.boundary, attempt))) return false;
      else if (preparationKind() === "rejected") preparation.retireTarget(locator.serverId, locator.connectorId, attempt ?? undefined);
    }
    locator = undefined; observedBinding = null; attempt = null; publish({ name: "", facts: null, error: false, registrationRejection: null, publishRequested: false, intent: null }); return true;
  };
  return {
    instanceId: crypto.randomUUID(), client, preparation,
    stopWaiting: async (scope: McpCreationScope) => {
      if (!matches(scope) || active || !attempt) return false;
      const captured = attempt, controller = new AbortController(), flight: Flight = { kind: "prepare", controller, scope };
      active = flight; publish();
      try { const saved = await preparation.stopWaiting(captured, scope.boundary, controller.signal); return Boolean(saved && matches(scope) && active === flight); }
      finally { if (active === flight) { active = undefined; publish(); } }
    },
    reconnect: async (scope: McpCreationScope): Promise<boolean> => {
      if (!matches(scope) || active || !locator || !state.preparationView?.retired || !observedBinding) return false;
      const target = locator, providerKey = observedBinding.providerKey;
      const flight: Flight = { kind: "prepare", controller: new AbortController(), scope };
      active = flight; publish({ error: false });
      try {
        const result = await preparation.connectFresh(target.serverId, target.connectorId, providerKey, scope.boundary, flight.controller.signal);
        if (active !== flight || !matches(scope) || locator !== target) return false;
        if (result.current) {
          attempt = null; active = undefined;
          observedBinding = Object.freeze({ serverId: target.serverId, connectorId: target.connectorId, providerKey });
          publish({ facts: result.current }); return ready(result.current);
        }
        attempt = result.attempt ?? attempt;
        active = undefined; publish(); await read(scope, true);
        return result.confirmed && preparationCompletion(scope) !== null;
      } catch { if (active === flight && matches(scope)) publish({ error: true }); return false; }
      finally { if (active === flight) { active = undefined; publish(); } }
    },
    authorizationAcknowledged: options.onChanged,
    available: Boolean(client.registerPrivateMcpServer && client.getPrivateMcpServer && client.getMcpConnector),
    getSnapshot: () => state,
    getRegistrationTransport: () => registration?.body.transport,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    matches,
    canResume: (scope: McpCreationScope) => matches(scope) && locator !== undefined && preparation.canResume(locator.serverId),
    getPreparationCompletion: preparationCompletion,
    canAuthorize,
    bind,
    retain: (value: ProjectReadBoundary) => {
      if (retired) return () => {};
      if (leases++ === 0) {
        let previousKind = preparationKind();
        releasePreparation = preparation.subscribe(() => {
          const kind = preparationKind();
          if (previousKind !== undefined && kind === undefined && !window && !active && !(attempt && preparation.getView(attempt, boundary).retired)) {
            locator = undefined;
            publish({ facts: null, name: "", error: false, registrationRejection: null });
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
        queueMicrotask(() => { if (leases !== 0 || retired) return; retired = true; cancel(); registration = undefined; locator = undefined; publish({ facts: null, name: "", error: false, registrationRejection: null }); });
      };
    },
    attach: (value: object) => { if (window !== value) cancel(); window = value; publish(); return () => { if (window === value) { window = null; cancel(); } }; },
    refresh: read,
    pause: (scope: McpCreationScope) => { if (matches(scope)) cancel(); },
    prepare,
    submit: (input: McpPrivateServerRegistrationInput, scope: McpCreationScope, intent: McpCreationIntent) => {
      if (!matches(scope) || active || locator || registration || intent === "connect" && !preparation.available) return Promise.resolve(false);
      const parsed = mcpPrivateServerRegistrationInputSchema.safeParse(input);
      if (!parsed.success) { publish({ error: true }); return Promise.resolve(false); }
      const body = parsed.data;
      body.headers?.forEach(item => Object.freeze(item)); if (body.headers) Object.freeze(body.headers);
      if (body.oauth_client) Object.freeze(body.oauth_client); Object.freeze(body);
      registration = { body, key: connectorCreationKeySchema.parse(crypto.randomUUID()), uncertain: false, confirmed: false, intent, failure: undefined };
      publish({ intent, publishRequested: intent === "publish" });
      return runRegistration(scope);
    },
    retry: (scope: McpCreationScope) => state.preparationView?.retired ? Promise.resolve(false) : registration ? runRegistration(scope)
      : preparationKind() === "unknown" || state.intent !== "configure" && state.intent !== "publish" ? prepare(scope)
      : read(scope, true).then(Boolean),
    finishConfiguration: (scope: McpCreationScope) => state.intent === "configure" && state.facts !== null && !state.unknown ? resetKnown(scope) : false,
    finishRegistration: (scope: McpCreationScope) => state.publishRequested && state.facts !== null && !state.unknown ? resetKnown(scope) : false,
    finish: (scope: McpCreationScope) => !state.preparationView?.retired && !state.unknown && (receiptCompletion(scope)
      ? preparationCompletion(scope) !== null : ready(state.facts)) ? resetKnown(scope) : false,
    dismiss: resetKnown,
    reconcile: async (scope: McpCreationScope) => { if (!matches(scope)) return false; options.onChanged(); return ready(await read(scope, true)); },
  };
}
export type McpServerCreationFlow = ReturnType<typeof createMcpServerCreationFlow>;
