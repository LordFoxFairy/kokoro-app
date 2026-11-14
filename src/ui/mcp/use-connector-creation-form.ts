"use client";

import { connectorCommandMayResume } from "./connector-command-failure";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { createConnectorCommand } from "./connector-command";

type Lifecycle<Completion> = Pick<ReturnType<typeof createConnectorCommand<unknown, Completion>>, "subscribe" | "getSnapshot" | "matches" | "finish" | "getCompletion">;

/** The shared form lifetime owns close recovery, not network commands or drafts. */
export function useConnectorCreationForm<Completion>(flow: Lifecycle<Completion>, boundary: ProjectReadBoundary,
  onDone: (result: Completion, current: () => boolean) => Promise<void>, onAcknowledged: () => void) {
  const subscribe = useCallback((listener: () => void) => flow.subscribe(() => {
    // Clear the actual draft at the ACK transition, including a late ACK after
    // recheck. Merely masking the DOM would reveal it again when finish resets.
    if (flow.getSnapshot().kind === "completed")
      onAcknowledged();
    listener();
  }), [flow, onAcknowledged]);
  const state = useSyncExternalStore(subscribe, flow.getSnapshot, flow.getSnapshot);
  const [completion, setCompletion] = useState<"idle" | "closing" | "retry">("idle");
  const { admitted: boundaryAdmitted, subject, generation } = boundary;
  const scope = useMemo(() => ({ flow, boundary: { admitted: boundaryAdmitted, subject, generation } }), [flow, boundaryAdmitted, subject, generation]);
  const committed = useRef<typeof scope | null>(null);
  const waiting = useRef<{ scope: typeof scope; controller: AbortController } | null>(null);
  const completed = useRef<{ flow: typeof flow; value: Completion } | null>(null);
  const closing = useRef(false);
  useLayoutEffect(() => {
    committed.current = scope;
    return () => {
      if (committed.current === scope) committed.current = null;
      if (waiting.current?.scope === scope) {
        const previous = waiting.current;
        waiting.current = null;
        previous.controller.abort();
      }
    };
  }, [scope]);
  const admitted = boundary.admitted && flow.matches(boundary);
  const submitting = state.kind === "running";
  const locked = !admitted || submitting || state.kind === "unknown" || state.kind === "completed" || completion !== "idle";
  const editable = () => !locked && committed.current === scope;
  const waitForCommand = async (run: (signal: AbortSignal) => Promise<boolean>) => {
    if (committed.current !== scope || !admitted || waiting.current || completion !== "idle") return false;
    const controller = new AbortController();
    const request = { scope, controller };
    waiting.current = request;
    try {
      const confirmed = await run(controller.signal);
      return confirmed && !controller.signal.aborted && committed.current === scope;
    } finally { if (waiting.current === request) waiting.current = null; }
  };
  const cancel = (onCancel: () => void) => {
    if (committed.current !== scope) return;
    if (waiting.current?.scope === scope) waiting.current.controller.abort();
    committed.current = null;
    onCancel();
  };
  const done = async () => {
    if (committed.current !== scope || !admitted || completion === "closing" || closing.current) return;
    if (completion === "idle" && flow.getSnapshot().kind !== "completed") return;
    if (completion === "idle") {
      const value = flow.getCompletion(boundary);
      if (value === undefined) return;
      completed.current = { flow, value };
    }
    const result = completed.current;
    if (!result || result.flow !== flow) return;
    const current = () => committed.current === scope && boundary.admitted && flow.matches(boundary);
    closing.current = true;
    setCompletion("closing");
    if (completion === "idle" && !flow.finish(boundary)) { closing.current = false; setCompletion("idle"); return; }
    try {
      if (!current()) throw new Error("Connector completion retired");
      await onDone(result.value, current);
      if (!current()) throw new Error("Connector completion retired");
    }
    // Closing state belongs to this mounted form/flow, not a read generation.
    // A recheck must not leave it stuck, while a new form has a different ref.
    catch { if (committed.current?.flow === flow) setCompletion("retry"); }
    finally { closing.current = false; }
  };

  const maySubmit = () => connectorCommandMayResume(state.failure) && admitted && committed.current === scope && !submitting && completion === "idle";
  return { state, completion, admitted, submitting, locked, editable, maySubmit, waitForCommand, cancel, done };
}
