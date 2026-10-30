"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  McpConnector,
  McpConnectorProvider,
} from "@/hub/mcp-connector.schema";
import type { CustomApiProfile } from "@/hub/custom-api.schema";
import { useT } from "@/i18n/context";

import { McpEmptyConnections } from "./mcp-empty-connections";
import { McpCustomApiCard } from "./mcp-custom-api-card";
import styles from "./mcp-projection-read.module.css";
import { McpConnectorCard } from "./mcp-connector-card";

export function McpConnectionList({
  connectors,
  serverMediaRevisions,
  customApis,
  providers,
  query,
  brandName,
  onBrowse,
  onEdit,
  onSelectCustomApi,
  previousEnabled,
  nextEnabled,
  onPrevious,
  onNext,
}: {
  connectors: McpConnector[];
  /** Exact confirmed icon changes; ordinary connector refreshes retain private media. */
  serverMediaRevisions?: ReadonlyMap<string, number>;
  customApis: CustomApiProfile[];
  providers: McpConnectorProvider[];
  query: string;
  brandName: string;
  onBrowse: () => void;
  onEdit: (connector: McpConnector, trigger: HTMLElement) => void;
  onSelectCustomApi: (profile: CustomApiProfile, trigger: HTMLElement) => void;
  previousEnabled: boolean;
  nextEnabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const t = useT();
  const providersByKey = new Map(
    providers.map((provider) => [provider.provider_key, provider]),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleConnectors = connectors.filter(
    (connector) => connector.status !== "revoked",
  );
  const displayedConnectors = visibleConnectors.filter((connector) => {
    if (!normalizedQuery) return true;
    const provider = providersByKey.get(connector.provider_key);
    return [
      connector.display_name,
      connector.description,
      provider?.display_name,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
  const displayedCustomApis = customApis.filter(
    (profile) =>
      !normalizedQuery ||
      [profile.name, profile.instructions]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
  const hasConnections = visibleConnectors.length > 0 || customApis.length > 0;
  const hasVisibleConnections =
    displayedConnectors.length > 0 || displayedCustomApis.length > 0;

  return (
    <section className={styles.connectionSection} aria-label={t("mcp.title")}>
      {!hasConnections ? (
        <McpEmptyConnections brandName={brandName} onBrowse={onBrowse} />
      ) : !hasVisibleConnections ? (
        <div className={styles.emptyProvider}>
          <Search aria-hidden="true" />
          <p>{t("mcp.noMatch")}</p>
        </div>
      ) : (
        <>
          <p className={styles.connectionLabel}>{t("skills.added")}</p>
          <ul className={styles.connectorGrid}>
            {displayedCustomApis.map((profile) => (
              <McpCustomApiCard key={`custom-api:${profile.profile_id}`} profile={profile} onSelect={onSelectCustomApi} />
            ))}
            {displayedConnectors.map(connector => <McpConnectorCard key={connector.connector_id} connector={connector}
              provider={providersByKey.get(connector.provider_key)} onSelect={onEdit}
              mediaRevision={connector.server_id ? serverMediaRevisions?.get(connector.server_id) ?? 0 : 0} />)}
          </ul>
        </>
      )}
      {previousEnabled || nextEnabled ? (
        <nav className={styles.pagination} aria-label="MCP pages">
          <Button
            type="button"
            variant="outline"
            disabled={!previousEnabled}
            onClick={onPrevious}
          >
            {t("plugins.previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!nextEnabled}
            onClick={onNext}
          >
            {t("plugins.next")}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
