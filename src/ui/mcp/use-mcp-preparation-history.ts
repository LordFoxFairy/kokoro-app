"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { McpPreparationCommands } from "./mcp-preparation-commands";
import type { McpPreparationHistoryCursor, McpRetiredPreparationRecord } from "./mcp-preparation-recovery";

type Result = "completed" | "rejected" | "execution_fenced" | "unknown";
type State = { items: readonly McpRetiredPreparationRecord[]; cursor: McpPreparationHistoryCursor | null; error: boolean; loading: boolean; results: Readonly<Record<string, Result>> };
const empty: State = { items: [], cursor: null, error: false, loading: false, results: {} };
export const preparationHistoryKey = (record: McpRetiredPreparationRecord) => JSON.stringify([record.subject, record.target.serverId, record.target.connectorId, record.key, record.target.version]);

/** Window-scoped bounded read projection. Historical GET never enters an active command. */
export function useMcpPreparationHistory(commands: McpPreparationCommands, boundary: ProjectReadBoundary, serverId: string | null, window: object) {
  const revision = useSyncExternalStore(commands.subscribe, commands.getSnapshot, commands.getSnapshot);
  const { subject, admitted, generation } = boundary;
  const lifecycle = useMemo(() => ({ commands, window, serverId, boundary: { subject, admitted, generation } }),
    [commands, window, serverId, subject, admitted, generation]);
  const [saved, setSaved] = useState<{ lifecycle: typeof lifecycle; state: State } | null>(null);
  const state = saved?.lifecycle === lifecycle ? saved.state : empty;
  const scope = useRef<(typeof lifecycle & { lifecycle: typeof lifecycle; controller: AbortController; readSequence: number }) | null>(null);
  useLayoutEffect(() => {
    const current = { ...lifecycle, lifecycle, controller: new AbortController(), readSequence: 0 };
    scope.current = current;
    return () => { if (scope.current === current) scope.current = null; current.controller.abort(); };
  }, [lifecycle]);
  const load = useCallback(async (after?: McpPreparationHistoryCursor) => {
    const current = scope.current;
    if (!current || current.lifecycle !== lifecycle || !current.serverId || !current.boundary.admitted) return;
    const sequence = ++current.readSequence;
    try {
      const page = await commands.listRetired(current.serverId, current.boundary, after);
      if (scope.current !== current || current.controller.signal.aborted || current.readSequence !== sequence) return;
      setSaved(previous => ({ lifecycle: current.lifecycle, state: { ...(previous?.lifecycle === current.lifecycle ? previous.state : empty), items: after && previous?.lifecycle === current.lifecycle ? [...new Map([...previous.state.items, ...page.items].map(record => [preparationHistoryKey(record), record])).values()] : page.items, cursor: page.nextCursor, error: false, loading: false } }));
    } catch { if (scope.current === current && current.readSequence === sequence) setSaved(previous => ({ lifecycle: current.lifecycle, state: { ...(previous?.lifecycle === current.lifecycle ? previous.state : empty), loading: false, error: true } })); }
  }, [commands, lifecycle]);
  useEffect(() => { void load(); }, [load, lifecycle, revision]);
  const inspect = async (record: McpRetiredPreparationRecord) => {
    const current = scope.current;
    if (!current || current.lifecycle !== lifecycle || record.subject !== current.boundary.subject || record.target.serverId !== current.serverId) return;
    try {
      const result = await commands.inspectRetired(record, current.boundary, current.controller.signal);
      if (scope.current === current && !current.controller.signal.aborted)
        setSaved(previous => ({ lifecycle: current.lifecycle, state: { ...(previous?.lifecycle === current.lifecycle ? previous.state : empty), results: { ...(previous?.lifecycle === current.lifecycle ? previous.state.results : {}), [preparationHistoryKey(record)]: result ?? "unknown" } } }));
    } catch { if (scope.current === current) setSaved(previous => ({ lifecycle: current.lifecycle, state: { ...(previous?.lifecycle === current.lifecycle ? previous.state : empty), results: { ...(previous?.lifecycle === current.lifecycle ? previous.state.results : {}), [preparationHistoryKey(record)]: "unknown" } } })); }
  };
  return { ...state, inspect, reload: () => load(), more: () => state.cursor ? load(state.cursor) : Promise.resolve() };
}
export type McpPreparationHistory = ReturnType<typeof useMcpPreparationHistory>;
