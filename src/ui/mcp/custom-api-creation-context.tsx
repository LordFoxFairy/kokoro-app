"use client";

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createCustomApiCreateFlow, type CustomApiCreateFlow } from "./custom-api-create-flow";
import { CustomApiForm } from "./custom-api-form";
import { invalidateCustomApiProjection } from "./use-custom-api-projection";

const Creation = createContext<{ flow: CustomApiCreateFlow; boundary: ProjectReadBoundary } | null>(null);

/** The stable app shell owns the command; closing a modal does not abandon it. */
export function CustomApiCreationProvider({ client, boundary, children }: {
  client: HubClient; boundary: ProjectReadBoundary; children: ReactNode;
}) {
  const { subject, admitted, generation } = boundary;
  const flow = useMemo(() => createCustomApiCreateFlow({
    client, boundary: { subject, admitted: false, generation: 0 },
    onConfirmed: () => { if (subject !== null) invalidateCustomApiProjection(client, subject); },
  }), [client, subject]);
  useLayoutEffect(() => flow.retain({ subject, admitted, generation }), [flow, subject, admitted, generation]);
  const value = useMemo(() => ({ flow, boundary: { subject, admitted, generation } }), [flow, subject, admitted, generation]);
  return <Creation.Provider value={value}>{children}</Creation.Provider>;
}

export function CustomApiCreationForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const value = useContext(Creation);
  if (value === null) throw new Error("Custom API creation requires its actor-owned shell provider");
  return <CustomApiForm key={value.flow.instanceId} flow={value.flow} boundary={value.boundary} onCancel={onCancel} onDone={onDone} />;
}
