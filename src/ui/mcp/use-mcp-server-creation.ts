"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpPrivateServerRegistrationInput } from "@/hub/mcp-connector.schema";
import type { McpServerCreationFlow } from "./mcp-server-creation-flow";
import { useMcpOAuthPopup } from "./use-mcp-oauth-popup";

/** One mounted window consumes the actor-owned workflow; it owns no command key. */
export function useMcpServerCreation(flow: McpServerCreationFlow, boundary: ProjectReadBoundary,
  onCancel: () => void, onDone: () => Promise<void>, clearSecrets: () => void,
  onAuthorizationNavigate?: (url: string) => void) {
  const token = useMemo(() => ({ flow }), [flow]);
  const scope = useMemo(() => ({ window: token, boundary: { ...boundary } }), [token, boundary]);
  const committed = useRef<typeof scope | null>(null);
  useLayoutEffect(() => flow.attach(token), [flow, token]);
  useLayoutEffect(() => { committed.current = scope; return () => { if (committed.current === scope) committed.current = null; }; }, [scope]);
  const subscribe = useCallback((listener: () => void) => flow.subscribe(() => {
    if (flow.getSnapshot().registered) clearSecrets(); listener();
  }), [flow, clearSecrets]);
  const state = useSyncExternalStore(subscribe, flow.getSnapshot, flow.getSnapshot);
  const [completion, setCompletion] = useState<"idle" | "closing" | "retry">("idle");
  const [popupError, setPopupError] = useState<typeof scope | null>(null);
  const admitted = boundary.admitted && flow.matches(scope);
  const current = () => committed.current === scope && flow.matches(scope);
  useEffect(() => { if (admitted && state.registered) void flow.refresh(scope); }, [admitted, flow, scope, state.registered]);
  const done = async () => {
    if (!current() || completion === "closing") return;
    setCompletion("closing");
    if (completion === "idle" && !flow.finish(scope)) { setCompletion("idle"); return; }
    try { await onDone(); }
    catch { if (committed.current?.window === token) setCompletion("retry"); }
  };
  const lifecycle = useMemo(() => ({ admitted, scope }), [admitted, scope]);
  const startPopup = useMcpOAuthPopup({ lifecycle,
    ...(onAuthorizationNavigate ? { onAuthorizationNavigate } : {}),
    onReload: () => { if (current()) void flow.reconcile(scope).then(connected => { if (connected && current()) void done(); }); },
  });
  const authorize = async () => {
    if (!current() || flow.getSnapshot().busy || flow.getSnapshot().unknown || completion !== "idle") return;
    setPopupError(null);
    try {
      await startPopup(async signal => {
        const facts = await flow.refresh(scope, true);
        if (!current() || flow.getSnapshot().unknown || !facts || facts.connector.status === "revoked" || facts.server.prepare_status !== "needs_oauth" || !flow.client.beginMcpConnectorAuthorization)
          throw new Error("MCP authorization target retired");
        const started = await flow.client.beginMcpConnectorAuthorization(facts.connector.connector_id,
          { server_id: facts.server.server_id, expected_state_version: facts.connector.state_version }, signal);
        flow.authorizationAcknowledged();
        if (!current()) throw new Error("MCP authorization retired");
        return { connectorId: facts.connector.connector_id, authorizationUrl: started.authorization.authorization_url, expiresAt: started.authorization.expires_at };
      });
    } catch { if (current()) setPopupError(scope); }
  };
  const save = async (input?: McpPrivateServerRegistrationInput, oauth = false) => {
    if (!current() || state.busy || completion !== "idle") return;
    setPopupError(null);
    const connected = state.unknown ? await flow.retry(scope)
      : state.registered ? await flow.prepare(scope) : input ? await flow.submit(input, scope) : false;
    if (!current()) return;
    if (connected) await done();
    else if (oauth && flow.getSnapshot().facts?.server.prepare_status === "needs_oauth") await authorize();
  };
  const locked = !admitted || state.busy || state.unknown !== null || state.registered || completion !== "idle";
  return { state, completion, admitted, submitting: state.busy || completion === "closing", locked,
    editable: () => !locked && current(), save, authorize, done,
    cancel: () => { if (committed.current === scope) { flow.dismiss(scope); onCancel(); } },
    error: state.error || popupError === scope || completion === "retry",
    ready: state.facts?.server.prepare_status === "ready" && state.facts.connector.status === "active" && state.facts.connector.enabled,
    needsOAuth: state.facts?.server.prepare_status === "needs_oauth",
  };
}
