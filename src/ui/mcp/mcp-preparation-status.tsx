"use client";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useT } from "@/i18n/context";
import type { McpPreparationView } from "./mcp-preparation-commands";
import { preparationHistoryKey, type McpPreparationHistory } from "./use-mcp-preparation-history";
import styles from "./mcp-preparation-status.module.css";

/** Compact feature presentation only: actions retain their original owning scopes. */
export function McpPreparationStatus({ view, history, disabled = false, onCheck, onStop, onReconnect }: {
  view?: McpPreparationView | null | undefined; history?: McpPreparationHistory | undefined; disabled?: boolean;
  onCheck?: (() => void) | undefined; onStop?: (() => void) | undefined; onReconnect?: (() => void) | undefined;
}) {
  const t = useT(), retired = view?.retired;
  if (!retired && view?.kind !== "unknown" && !history?.items.length && !history?.error) return null;
  return <div className={styles.status}>
    {retired || view?.kind === "unknown" ? <>
      <p role={retired ? "status" : "alert"}>{t(retired ? retired.disposition === "definite_rejected" ? "mcp.preparation.rejected" : "mcp.preparation.endedUnknown" : view?.fenced ? "mcp.preparation.fenced" : "mcp.preparation.unknown")}</p>
      <div className={styles.actions}>
        {!retired && onCheck ? <Button type="button" variant="outline" disabled={disabled} onClick={onCheck}>{t("mcp.preparation.check")}</Button> : null}
        {!retired && view?.fenced && onStop ? <Button type="button" variant="outline" disabled={disabled} onClick={onStop}>{t("mcp.preparation.stop")}</Button> : null}
        {retired && onReconnect ? <Button type="button" variant="outline" disabled={disabled} onClick={onReconnect}>{t("mcp.preparation.reconnect")}</Button> : null}
      </div>
    </> : null}
    {history && (history.items.length > 0 || history.error) ? <Collapsible>
      <CollapsibleTrigger className={styles.disclosure}>{t("mcp.preparation.history")}</CollapsibleTrigger>
      <CollapsibleContent className={styles.history}>
        {history.items.map(record => <div className={styles.record} key={preparationHistoryKey(record)}>
          <p>{t(record.disposition === "definite_rejected" ? "mcp.preparation.rejected" : "mcp.preparation.endedUnknown")}</p>
          <small>{t("mcp.preparation.recorded")} <time dateTime={record.retired_at}>{new Date(record.retired_at).toLocaleString()}</time></small>
          <Button type="button" variant="outline" disabled={disabled || history.loading} onClick={() => void history.inspect(record)}>{t("mcp.preparation.check")}</Button>
          {history.results[preparationHistoryKey(record)] ? <p role="status">{t(history.results[preparationHistoryKey(record)] === "completed" ? "mcp.preparation.originalCompleted" : history.results[preparationHistoryKey(record)] === "rejected" ? "mcp.preparation.rejected" : "mcp.preparation.unknown")}</p> : null}
        </div>)}
        {history.error ? <Button type="button" variant="outline" disabled={disabled || history.loading} onClick={() => void history.reload()}>{t("mcp.retry")}</Button> : null}
        {history.cursor ? <Button type="button" variant="outline" disabled={disabled || history.loading} onClick={() => void history.more()}>{t("mcp.preparation.more")}</Button> : null}
      </CollapsibleContent>
    </Collapsible> : null}
  </div>;
}
