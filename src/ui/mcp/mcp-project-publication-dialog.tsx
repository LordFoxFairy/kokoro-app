"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/i18n/context";
import { Folder } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { HubClient } from "@/hub/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { listProjects } from "@/features/app/project-list";
import type { Project } from "@/contract/project";
import type { McpProjectPin } from "@/hub/mcp-project-publication.schema";
import type { McpServerCreationCompletion } from "./mcp-server-creation-flow";
import type { McpProjectPublicationCommands } from "./mcp-project-publication-commands";
import styles from "./mcp-project-publication-dialog.module.css";
type Row = { project: Project; pin?: McpProjectPin | null };
const READ_BUDGET_MS = 10_000;
/** Observed Manus picker; unobserved owner failure/recovery states remain explicit Kokoro states. */
export function McpProjectPublicationDialog({ client, commands, boundary, target, onClose, onSourceRead }: { client: HubClient; commands: McpProjectPublicationCommands; boundary: ProjectReadBoundary; target: McpServerCreationCompletion; onClose: () => void; onSourceRead?: () => void }) {
  const t = useT();
  const command = useSyncExternalStore(commands.subscribe, commands.getSnapshot, commands.getSnapshot);
  const [attempt, setAttempt] = useState(0), [selected, setSelected] = useState<string[]>([]);
  const [validating, setValidating] = useState(false), [validationError, setValidationError] = useState(false);
  const key = useMemo(() => ({ target, subject: boundary.subject, generation: boundary.generation, admitted: boundary.admitted, attempt }), [target, boundary.subject, boundary.generation, boundary.admitted, attempt]);
  const committed = useRef<typeof key | null>(null), confirmation = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    committed.current = key;
    return () => { if (committed.current === key) committed.current = null; confirmation.current?.abort(); confirmation.current = null; };
  }, [key]);
  const [result, setResult] = useState<{ key: typeof key; rows: Row[] | null; error: boolean } | null>(null);
  const close = useCallback(() => { confirmation.current?.abort(); confirmation.current = null; commands.dismiss(); onClose(); }, [commands, onClose]);
  useEffect(() => {
    if (!boundary.admitted || boundary.subject === null || command.phase !== "idle" || command.recovery !== "ready") return;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), READ_BUDGET_MS);
    let mounted = true;
    void listProjects(controller.signal).then(projects => {
      if (controller.signal.aborted || new Set(projects.map(project => project.id)).size !== projects.length) throw Error("publication_projects_invalid");
      if (mounted && committed.current === key) setResult({ key, rows: projects.map(project => ({ project })), error: false });
    }).catch(() => { if (mounted && committed.current === key) setResult({ key, rows: null, error: true }); }).finally(() => clearTimeout(timeout));
    return () => { mounted = false; controller.abort(); clearTimeout(timeout); };
  }, [key, boundary.admitted, boundary.subject, command.phase, command.recovery]);
  const reading = result?.key === key ? result : null;
  const busy = command.phase === "busy" || validating, locked = command.phase !== "idle" || !boundary.admitted || command.recovery !== "ready" || validating;
  const confirm = async () => {
    if (committed.current !== key || !boundary.admitted || !reading?.rows || locked || confirmation.current || selected.length < 1 || selected.length > 32) return;
    const selectedRows = reading.rows.filter(row => selected.includes(row.project.id));
    if (selectedRows.length !== selected.length) return;
    onSourceRead?.();
    const controller = new AbortController(); confirmation.current = controller; setValidating(true); setValidationError(false);
    const timeout = setTimeout(() => controller.abort(), READ_BUDGET_MS);
    const current = () => committed.current === key && confirmation.current === controller && !controller.signal.aborted;
    try {
      if (!client.mcpProjectPublication || !client.getPrivateMcpServer || !client.getMcpConnector) throw Error("publication_unavailable");
      const [server, connector] = await Promise.all([client.getPrivateMcpServer(target.serverId, controller.signal), client.getMcpConnector(target.connectorId, controller.signal)]);
      if (!current()) throw Error("publication_read_retired");
      if (server.server_id !== target.serverId || connector.connector_id !== target.connectorId || connector.server_id !== target.serverId || connector.provider_key !== target.providerKey || connector.connector_type !== "mcp" || server.status === "disabled" || connector.status === "revoked") throw Error("publication_source_invalid");
      // Only selected projects need a CAS. At most four read lanes, 128 total pages and one wall-clock budget.
      const rows: Row[] = [], queue = [...selectedRows]; let totalPages = 0;
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          let cursor: string | undefined, pin: McpProjectPin | null = null;
          const seen = new Set<string>(), pins = new Set<string>();
          for (;;) {
            if (!current() || ++totalPages > 128) throw Error("publication_read_budget");
            const page = await client.mcpProjectPublication!.list(next.project.id, cursor, controller.signal);
            for (const item of page.pins) {
              if (pins.has(item.pin_id)) throw Error("publication_duplicate_pin"); pins.add(item.pin_id);
              if (item.revision.server_id === target.serverId && item.revision.connector_id === target.connectorId) {
                if (pin) throw Error("publication_duplicate_source"); pin = item;
              }
            }
            if (page.next_cursor === null) break;
            if (seen.has(page.next_cursor)) throw Error("publication_cursor_cycle"); seen.add(page.next_cursor); cursor = page.next_cursor;
          }
          rows.push({ project: next.project, pin });
        }
      }));
      if (!current()) throw Error("publication_read_retired");
      clearTimeout(timeout);
      // Freeze input in displayed selection order, independent of read completion order.
      const targets = selectedRows.map(row => {
        const pin = rows.find(resultRow => resultRow.project.id === row.project.id)!.pin;
        return { project_id: row.project.id, expected_pin: pin ? { current: { pin_id: pin.pin_id, state_version: pin.state_version } } : { absent: true as const } };
      });
      setResult({ key, rows: reading.rows.map(row => rows.find(resultRow => resultRow.project.id === row.project.id) ?? row), error: false });
      await commands.publish({ server_id: target.serverId, connector_id: target.connectorId, expected_source_state_version: server.state_version, targets }, boundary);
    } catch { if (committed.current === key && confirmation.current === controller) { controller.abort(); setValidationError(true); } }
    finally { clearTimeout(timeout); if (confirmation.current === controller) confirmation.current = null; if (committed.current === key) setValidating(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className={styles.dialog} closeLabel={t("mcp.publishClose")} aria-busy={busy}>
    <DialogTitle className={styles.title}>{t("mcp.publishTitle")}</DialogTitle>
    <DialogDescription className={styles.description}>{t("mcp.publishDescription")}</DialogDescription>
    {!boundary.admitted ? <p className={styles.notice} role="status">{t("mcp.creationSession")}</p> : command.recovery === "error" ? <p className={styles.notice} role="alert">{t("mcp.publishRecoveryError")}</p> : command.phase === "completed" ? <p className={styles.notice} role="status">{t("mcp.publishDefinitionOnly")}</p> : command.phase === "unknown" ? <p className={styles.notice} role="alert">{t("mcp.publishUnknown")}</p> : command.phase === "rejected" ? <p className={styles.notice} role="alert">{t("mcp.publishRejected")}</p> : reading?.error || validationError ? <p className={styles.notice} role="alert">{t("mcp.publishReadError")}</p> : reading?.rows ? <div className={styles.list}>
      {reading.rows.length ? reading.rows.map(({ project, pin }) => <label key={project.id} className={styles.row}><span className={styles.icon}><Folder aria-hidden="true" /></span><span className={styles.text}><span className={styles.name}>{project.name}</span><span className={styles.status}>{pin === undefined ? null : pin && !pin.removed ? t("mcp.publishPinned") : t("mcp.publishUnpinned")}</span></span><input type="checkbox" aria-label={project.name} checked={selected.includes(project.id)} disabled={locked || selected.length >= 32 && !selected.includes(project.id)} onChange={event => setSelected(values => event.target.checked ? [...values, project.id] : values.filter(id => id !== project.id))} /></label>) : <p className={styles.notice}>{t("mcp.publishEmpty")}</p>}
    </div> : <p className={styles.notice} role="status">{t("mcp.publishReading")}</p>}
    {validating ? <p className={styles.notice} role="status">{t("mcp.publishValidating")}</p> : null}
    <div className={styles.actions}><Button variant="outline" onClick={close}>{command.phase === "completed" ? t("mcp.creationDone") : t("mcp.cancel")}</Button>
      {command.recovery === "error" ? <Button disabled={!boundary.admitted} onClick={() => void commands.restore(boundary)}>{t("mcp.publishRetryRead")}</Button> : command.phase === "unknown" ? <><Button variant="outline" disabled={!boundary.admitted || busy} onClick={() => void commands.inspect(boundary)}>{t("mcp.publishReceipt")}</Button>{command.mayRetry ? <Button disabled={!boundary.admitted || busy} onClick={() => void commands.retry(boundary)}>{t("mcp.retryOriginal")}</Button> : null}</> : command.phase === "completed" ? null : command.phase === "rejected" ? <Button disabled={!boundary.admitted} onClick={() => { void commands.revise(boundary).then(revised => { if (revised && committed.current === key) { setAttempt(value => value + 1); setSelected([]); setValidationError(false); } }); }}>{t("mcp.publishRevise")}</Button> : reading?.error || validationError ? <Button onClick={() => { setAttempt(value => value + 1); setValidationError(false); }} disabled={!boundary.admitted || busy}>{t("mcp.publishRetryRead")}</Button> : <Button onClick={() => void confirm()} disabled={locked || !reading?.rows || !selected.length}>{t("mcp.publishConfirm")}</Button>}
    </div>
  </DialogContent></Dialog>;
}
