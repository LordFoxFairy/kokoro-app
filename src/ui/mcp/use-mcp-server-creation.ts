"use client";

import { useMcpPreparationHistory } from "./use-mcp-preparation-history";
import { connectorCommandFailure, connectorCommandMayResume, type ConnectorCommandFailure } from "./connector-command-failure";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpPrivateServerRegistrationInput } from "@/hub/mcp-connector.schema";
import type { McpServerCreationFlow, McpServerCreationCompletion } from "./mcp-server-creation-flow";
import { rememberCreatedMcpDetail, retireCreatedMcpDetail } from "./mcp-created-detail-handoff";
import { useMcpOAuthPopup } from "./use-mcp-oauth-popup";

/** One mounted window consumes the actor-owned workflow; it owns no command key. */
export function useMcpServerCreation(flow: McpServerCreationFlow, boundary: ProjectReadBoundary,
  onCancel: () => void, onDone: (result: McpServerCreationCompletion, current: () => boolean) => Promise<void>, clearSecrets: () => void,
  onAuthorizationNavigate?: (url: string) => void,
  onPublish?: (result: McpServerCreationCompletion, current: () => boolean) => Promise<void>) {
  const token = useMemo(() => ({ flow }), [flow]);
  const scope = useMemo(() => ({ window: token, boundary: { ...boundary } }), [token, boundary]);
  const committed = useRef<typeof scope | null>(null);
  useLayoutEffect(() => flow.attach(token), [flow, token]);
  useLayoutEffect(() => { committed.current = scope; return () => { if (committed.current === scope) committed.current = null; }; }, [scope]);
  const subscribe = useCallback((listener: () => void) => flow.subscribe(() => {
    if (flow.getSnapshot().registered) clearSecrets(); listener();
  }), [flow, clearSecrets]);
  const state = useSyncExternalStore(subscribe, flow.getSnapshot, flow.getSnapshot);
  const history = useMcpPreparationHistory(flow.preparation, boundary, state.preparationView?.attempt.target.serverId ?? state.facts?.server.server_id ?? null, token);
  const [completion, setCompletion] = useState<"idle" | "closing" | "retry">("idle");
  const completionTarget = useRef<McpServerCreationCompletion | null>(null);
  const completing = useRef(false);
  const publishing = useRef(false);
  const [popupError, setPopupError] = useState<{ scope: typeof scope; failure: ConnectorCommandFailure | undefined } | null>(null);
  const admitted = boundary.admitted && flow.matches(scope);
  const current = () => committed.current === scope && flow.matches(scope);
  useEffect(() => { if (admitted && state.registered) void flow.refresh(scope); }, [admitted, flow, scope, state.registered]);
  const done = async () => {
    if (!current() || completing.current || completion === "closing" || publishing.current && !onPublish) return;
    if (completionTarget.current === null) {
      const snapshot = flow.getSnapshot(), facts = snapshot.facts;
      const publish = snapshot.publishRequested;
      if (publish && !onPublish) return;
      const recovered = flow.getPreparationCompletion(scope);
      if (!facts && !recovered) return;
      const target = Object.freeze(recovered ?? { serverId: facts!.server.server_id, connectorId: facts!.connector.connector_id, providerKey: facts!.connector.provider_key });
      // A historical completed ACK grants only a locator. Only fresh Current facts
      // may seed the existing detail handoff; failed reads never borrow the receipt.
      if (facts) rememberCreatedMcpDetail(target, flow.client, boundary, facts);
      if (!(snapshot.intent === "configure" ? flow.finishConfiguration(scope) : publish ? flow.finishRegistration(scope) : flow.finish(scope))) { retireCreatedMcpDetail(target); return; }
      publishing.current = publish;
      completionTarget.current = target;
    }
    completing.current = true;
    setCompletion("closing");
    try { await (publishing.current ? onPublish! : onDone)(completionTarget.current, current); }
    catch { if (committed.current?.window === token) setCompletion("retry"); }
    finally { completing.current = false; }
  };
  const lifecycle = useMemo(() => ({ admitted, scope }), [admitted, scope]);
  const startPopup = useMcpOAuthPopup({ lifecycle,
    ...(onAuthorizationNavigate ? { onAuthorizationNavigate } : {}),
    onReload: () => { if (current()) void flow.reconcile(scope).then(connected => { if (connected && current()) void done(); }); },
  });
  const requestAuthorization = async (signal: AbortSignal) => {
    const facts = await flow.refresh(scope, true);
    if (signal.aborted || !current() || !flow.canAuthorize(scope) || !facts ||
      facts.connector.status === "revoked" || facts.server.prepare_status !== "needs_oauth" ||
      !flow.client.beginMcpConnectorAuthorization)
      throw new Error("MCP authorization target retired");
    const started = await flow.client.beginMcpConnectorAuthorization(
      facts.connector.connector_id,
      { server_id: facts.server.server_id, expected_state_version: facts.connector.state_version },
      signal,
    );
    flow.authorizationAcknowledged();
    if (signal.aborted || !current()) throw new Error("MCP authorization retired");
    return { connectorId: facts.connector.connector_id,
      authorizationUrl: started.authorization.authorization_url,
      expiresAt: started.authorization.expires_at };
  };
  const authorize = async () => {
    if (!current() || !flow.canAuthorize(scope) || completion !== "idle") return;
    setPopupError(null);
    try {
      await startPopup(requestAuthorization);
    } catch (error) { if (current()) setPopupError({ scope, failure: connectorCommandFailure("mcp", error) }); }
  };
  const mayResume = state.unknown === "prepare" ? flow.canResume(scope) : connectorCommandMayResume(state.failure);
  const recoveredPreparation = flow.getPreparationCompletion(scope);
  const saveConfiguration = async (input?: McpPrivateServerRegistrationInput) => {
    if (!current() || state.busy || completion !== "idle" || !mayResume) return;
    if (flow.getSnapshot().publishRequested && !onPublish) return;
    setPopupError(null);
    // A retained command keeps its original intent, including an old unknown Prepare.
    const confirmed = state.unknown ? await flow.retry(scope)
      : state.registered ? state.intent === "connect" ? await flow.prepare(scope) : Boolean(await flow.refresh(scope, true))
      : input ? await flow.submit(input, scope, "configure") : false;
    if (confirmed && current()) await done();
  };
  const saveForPublication = async (input?: McpPrivateServerRegistrationInput) => {
    if (!onPublish || !current() || state.busy || completion !== "idle" || !mayResume) return;
    setPopupError(null);
    const confirmed = state.unknown ? await flow.retry(scope)
      : state.registered ? Boolean(await flow.refresh(scope, true))
      : input ? await flow.submit(input, scope, "publish") : false;
    if (confirmed && current()) await done();
  };
  const locked = !admitted || state.busy || state.unknown !== null || state.registered || completion !== "idle";
  return { state, completion, history, preparationView: state.preparationView,
    checkPreparation: async () => { if (current() && await flow.retry(scope) && current()) await done(); },
    stopWaiting: () => current() ? flow.stopWaiting(scope) : Promise.resolve(false),
    reconnect: async () => { if (current() && await flow.reconnect(scope) && current()) await done(); }, admitted, submitting: state.busy || completion === "closing", locked,
    editable: () => !locked && current(), saveConfiguration, saveForPublication, authorize, done,
    cancel: () => { if (committed.current === scope) { flow.dismiss(scope); committed.current = null; onCancel(); } },
    error: state.error || state.preparationView?.kind === "rejected" || popupError?.scope === scope || completion === "retry",
    failure: state.failure ?? (popupError?.scope === scope ? popupError.failure : undefined),
    mayResume,
    // This ready flag is the form's Done affordance, not runtime/Connection authority.
    ready: !state.preparationView?.retired && (Boolean(recoveredPreparation) || state.facts?.server.prepare_status === "ready" && state.facts.connector.status === "active" && state.facts.connector.enabled),
    needsOAuth: !recoveredPreparation && flow.canAuthorize(scope),
  };
}
