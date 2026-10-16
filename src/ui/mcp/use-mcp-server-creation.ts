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
  const requestAuthorization = async (signal: AbortSignal) => {
    const facts = await flow.refresh(scope, true);
    if (signal.aborted || !current() || flow.getSnapshot().unknown || !facts ||
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
    if (!current() || flow.getSnapshot().busy || flow.getSnapshot().unknown || completion !== "idle") return;
    setPopupError(null);
    try {
      await startPopup(requestAuthorization);
    } catch { if (current()) setPopupError(scope); }
  };
  const save = async (input?: McpPrivateServerRegistrationInput, oauth = false) => {
    if (!current() || state.busy || completion !== "idle") return;
    setPopupError(null);
    const run = () => state.unknown ? flow.retry(scope)
      : state.registered ? flow.prepare(scope) : input ? flow.submit(input, scope) : Promise.resolve(false);
    if (!oauth) {
      if (await run() && current()) await done();
      return;
    }
    // Reserve the popup in the click stack, before registration or discovery
    // consumes the browser's transient user activation.
    let connected = false;
    try {
      await startPopup(async signal => {
        const pause = () => flow.pause(scope);
        signal.addEventListener("abort", pause, { once: true });
        try {
          if (signal.aborted || !current()) throw new Error("MCP creation popup retired");
          connected = await run();
          if (signal.aborted || !current()) throw new Error("MCP creation popup retired");
          return connected ? null : await requestAuthorization(signal);
        } finally { signal.removeEventListener("abort", pause); }
      });
      if (connected && current()) await done();
    } catch { if (current()) setPopupError(scope); }
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
