"use client";

import type { McpConnector, McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";
import { McpConnectorCard } from "./mcp-connector-card";
import styles from "./mcp-custom-api-gallery.module.css";

type PersonalGalleryRead = {
  connectors: readonly McpConnector[];
  admitted: boolean;
  confirmed: boolean;
  query: string;
  category: string;
};

/** A positive typed MCP/server locator, never missing Provider metadata, admits a personal entry. */
export function visiblePersonalMcpServers({ connectors, admitted, confirmed, query, category }: PersonalGalleryRead): readonly McpConnector[] {
  if (!admitted || !confirmed || category !== "all") return [];
  const search = query.trim().toLocaleLowerCase();
  return connectors.filter(connector => connector.connector_type === "mcp" && Boolean(connector.server_id) && connector.status !== "revoked" &&
    (!search || [connector.display_name, connector.description].some(value => value?.toLocaleLowerCase().includes(search))));
}

export function McpPersonalServerGallery({ providers, serverMediaRevisions, onSelect, ...read }: PersonalGalleryRead & {
  providers: readonly McpConnectorProvider[];
  serverMediaRevisions?: ReadonlyMap<string, number>;
  onSelect: (connector: McpConnector, trigger: HTMLElement) => void;
}) {
  const t = useT();
  const visible = visiblePersonalMcpServers(read);
  if (visible.length === 0) return null;
  const providersByKey = new Map(providers.map(provider => [provider.provider_key, provider]));
  return <section className={styles.section} aria-label={t("mcp.title")}>
    <ul className={styles.grid}>
      {visible.map(connector => <McpConnectorCard key={connector.connector_id} connector={connector}
        provider={providersByKey.get(connector.provider_key)} presentation="plaza" searchQuery={read.query} onSelect={onSelect}
        mediaRevision={connector.server_id ? serverMediaRevisions?.get(connector.server_id) ?? 0 : 0} />)}
    </ul>
  </section>;
}
