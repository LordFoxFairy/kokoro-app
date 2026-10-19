"use client";

import Image from "next/image";
import { Cable, Check, KeyRound, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  McpConnector,
  McpConnectorProvider,
} from "@/hub/mcp-connector.schema";
import type { CustomApiProfile } from "@/hub/custom-api.schema";
import { useT } from "@/i18n/context";

import { McpEmptyConnections } from "./mcp-empty-connections";
import { connectorStatusKey, providerArtwork } from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";

export function McpConnectionList({
  connectors,
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
              <li
                key={`custom-api:${profile.profile_id}`}
                className={styles.connectorCard}
                data-testid="custom-api-projection"
              >
                <button
                  type="button"
                  className={styles.connectorTrigger}
                  onClick={(event) =>
                    onSelectCustomApi(profile, event.currentTarget)
                  }
                  aria-label={profile.name}
                >
                  <span className={styles.connectorMark} aria-hidden="true">
                    <KeyRound />
                  </span>
                  <span className={styles.connectorIdentity}>
                    <span>
                      <strong>{profile.name}</strong>
                      <small>{profile.instructions ?? "自定义 API"}</small>
                    </span>
                  </span>
                  <Check
                    className={styles.statusCheck}
                    aria-label={t("skills.added")}
                  />
                </button>
              </li>
            ))}
            {displayedConnectors.map((connector) => {
              const provider = providersByKey.get(connector.provider_key);
              const connectorName =
                connector.display_name ||
                provider?.display_name ||
                t("firstSite.unavailable");
              const providerName = provider?.display_name;
              const connectorDescription =
                connector.description ||
                (providerName !== connectorName ? providerName : undefined);
              return (
                <li
                  key={connector.connector_id}
                  className={styles.connectorCard}
                  data-testid="mcp-projection"
                >
                  <button
                    type="button"
                    className={styles.connectorTrigger}
                    onClick={(event) => onEdit(connector, event.currentTarget)}
                    aria-label={connectorName}
                  >
                    <span className={styles.connectorMark} aria-hidden="true">
                      {provider ? (
                        <Image
                          src={providerArtwork(provider)}
                          alt=""
                          fill
                          sizes="2.5rem"
                          unoptimized
                        />
                      ) : (
                        <Cable />
                      )}
                    </span>
                    <span className={styles.connectorIdentity}>
                      <span>
                        <strong>{connectorName}</strong>
                        {connectorDescription ? (
                          <small>{connectorDescription}</small>
                        ) : null}
                      </span>
                    </span>
                    {connector.status === "active" ? (
                      <Check
                        className={styles.statusCheck}
                        aria-label={t(connectorStatusKey(connector.status))}
                      />
                    ) : (
                      <span
                        className={styles.status}
                        data-status={connector.status}
                      >
                        {t(connectorStatusKey(connector.status))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {visibleConnectors.length > 0 && (previousEnabled || nextEnabled) ? (
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
