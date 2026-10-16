"use client";

import { connectorCommandMayResume } from "./connector-command-failure";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { createConnectorCommand } from "./connector-command";

type Lifecycle = Pick<ReturnType<typeof createConnectorCommand>, "subscribe" | "getSnapshot" | "matches" | "finish">;

/** The shared form lifetime owns close recovery, not network commands or drafts. */
export function useConnectorCreationForm(flow: Lifecycle, boundary: ProjectReadBoundary,
  onDone: () => Promise<void>, onAcknowledged: () => void) {
  const subscribe = useCallback((listener: () => void) => flow.subscribe(() => {
    // Clear the actual draft at the ACK transition, including a late ACK after
    // recheck. Merely masking the DOM would reveal it again when finish resets.
    if (flow.getSnapshot().kind === "completed")
      onAcknowledged();
    listener();
  }), [flow, onAcknowledged]);
  const state = useSyncExternalStore(subscribe, flow.getSnapshot, flow.getSnapshot);
  const [completion, setCompletion] = useState<"idle" | "closing" | "retry">("idle");
  const scope = useMemo(() => ({ flow, boundary }), [flow, boundary]);
  const committed = useRef<typeof scope | null>(null);
  useLayoutEffect(() => {
    committed.current = scope;
    return () => { if (committed.current === scope) committed.current = null; };
  }, [scope]);
  const admitted = boundary.admitted && flow.matches(boundary);
  const submitting = state.kind === "running";
  const locked = !admitted || submitting || state.kind === "unknown" || state.kind === "completed" || completion !== "idle";
  const editable = () => !locked && committed.current === scope;
  const done = async () => {
    if (committed.current !== scope || !admitted || completion === "closing") return;
    if (completion === "idle" && flow.getSnapshot().kind !== "completed") return;
    setCompletion("closing");
    if (completion === "idle" && !flow.finish(boundary)) { setCompletion("idle"); return; }
    try { await onDone(); }
    // Closing state belongs to this mounted form/flow, not a read generation.
    // A recheck must not leave it stuck, while a new form has a different ref.
    catch { if (committed.current?.flow === flow) setCompletion("retry"); }
  };

  const maySubmit = () => connectorCommandMayResume(state.failure) && admitted && committed.current === scope && !submitting && completion === "idle";
  return { state, completion, admitted, submitting, locked, editable, maySubmit, done };
}
