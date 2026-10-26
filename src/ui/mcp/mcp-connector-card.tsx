"use client";

import Image from "next/image";
import type { McpConnector, McpConnectorProvider } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";
import { McpAvailabilityStatus } from "./mcp-availability-status";
import { McpServerIcon } from "./mcp-server-icon";
import { McpSearchHighlight } from "./mcp-search-highlight";
import { providerArtwork } from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";
import galleryStyles from "./mcp-custom-api-gallery.module.css";

/** One exact Connector/detail action and media lifetime, shared by management and the plaza. */
export function McpConnectorCard({ connector, provider, mediaRevision = 0, presentation = "management", searchQuery = "", onSelect }: {
  connector: McpConnector;
  provider?: McpConnectorProvider | undefined;
  mediaRevision?: number;
  presentation?: "management" | "plaza";
  searchQuery?: string;
  onSelect: (connector: McpConnector, trigger: HTMLElement) => void;
}) {
  const t = useT();
  const plaza = presentation === "plaza";
  const name = connector.display_name || provider?.display_name || t("firstSite.unavailable");
  const description = connector.description || (provider?.display_name !== name ? provider?.display_name : undefined);
  const initial = <span className={galleryStyles.initial}>{Array.from(name.trim())[0] ?? ""}</span>;
  return <li className={plaza ? styles.providerCard : styles.connectorCard} data-testid="mcp-projection">
    <button type="button" className={plaza ? `${styles.providerDetailTrigger} ${galleryStyles.trigger}` : styles.connectorTrigger}
      onClick={event => onSelect(connector, event.currentTarget)} aria-label={name}>
      <span className={plaza ? styles.providerLogo : styles.connectorMark} aria-hidden="true">
        {provider ? <Image src={providerArtwork(provider)} alt="" fill sizes="2.5rem" unoptimized />
          : connector.server_id ? <McpServerIcon serverId={connector.server_id} mediaRevision={mediaRevision} fallback={initial} />
            : initial}
      </span>
      <span className={plaza ? galleryStyles.copy : styles.connectorIdentity}>
        <span>
          <strong className={plaza ? styles.providerName : undefined}><McpSearchHighlight text={name} query={plaza ? searchQuery : ""} /></strong>
          {description ? <small className={plaza ? styles.providerDescription : undefined}>{description}</small> : null}
        </span>
      </span>
      <McpAvailabilityStatus availability={connector.availability} className={styles.status} availableIconClassName={styles.statusCheck} />
    </button>
  </li>;
}
