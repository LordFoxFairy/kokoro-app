"use client";
import { useContext, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { McpIconClient } from "@/hub/mcp-icon-client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createMcpIconDraft } from "./mcp-icon-draft";
import { McpCreateDismissContext } from "./mcp-create-dismiss-context";

/** Actor-owned transient draft; closing never cancels an uncertain resource save. */
export function useMcpIconDraft(client: McpIconClient | undefined, boundary: ProjectReadBoundary, saveLocked: boolean, confirmation?: unknown, projection?: unknown) {
  const { subject, admitted, generation } = boundary;
  const draft = useMemo(() => createMcpIconDraft(client, subject), [client, subject]);
  const registerDismiss = useContext(McpCreateDismissContext);
  useLayoutEffect(() => registerDismiss?.(() => draft.cancel()), [draft, registerDismiss]);
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot, draft.getSnapshot);
  useLayoutEffect(() => { draft.setBoundary({ subject, admitted, generation }); return () => draft.suspend(); }, [draft, subject, admitted, generation]);
  useLayoutEffect(() => { draft.setSaveLocked(saveLocked); }, [draft, saveLocked]);
  useLayoutEffect(() => { if (confirmation) draft.confirmed(); }, [draft, confirmation]);
  useLayoutEffect(() => { if (projection) draft.projected(); }, [draft, projection]);
  return { draft, state };
}
