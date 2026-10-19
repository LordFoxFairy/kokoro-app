"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { McpConnector } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";
import { McpAvailabilityStatus } from "./mcp-availability-status";
import styles from "./mcp-projection-read.module.css";

export type McpProviderConnectionLookup = {
  connections: readonly McpConnector[];
  complete: boolean;
  error: boolean;
  retry: () => void;
};

/** A relationship is not a selected connection; preserve explicit choice for multiple accounts/types. */
export function McpProviderConnectionPicker({ lookup, onSelect }: {
  lookup: McpProviderConnectionLookup;
  onSelect: (connection: McpConnector) => void;
}) {
  const t = useT();
  if (lookup.error) return <Alert variant="destructive" role="alert">
    <AlertDescription>{t("mcp.loadError")}</AlertDescription>
    <Button type="button" variant="outline" onClick={lookup.retry}>{t("mcp.retry")}</Button>
  </Alert>;
  if (!lookup.complete) return <p className={styles.relationPending} role="status"><Spinner aria-hidden="true" />{t("mcp.loading")}</p>;
  if (lookup.connections.length === 0) return null;
  return <section aria-label={t("mcp.title")} className={styles.relationChoices}>
    <h3>{t("mcp.title")}</h3>
    <ul>{lookup.connections.map(connection => <li key={connection.connector_id}>
      <button type="button" onClick={() => onSelect(connection)}>
        <span>{connection.display_name ?? connection.provider_key}</span>
        <span><McpAvailabilityStatus availability={connection.availability} /> · {t(connection.enabled ? "mcp.enabledBadge" : "mcp.disabledBadge")}</span>
        <code>{connection.connector_id}</code>
      </button>
    </li>)}</ul>
  </section>;
}
