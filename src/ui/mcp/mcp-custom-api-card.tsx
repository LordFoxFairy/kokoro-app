"use client";

import { Check } from "lucide-react";
import type { CustomApiProfile } from "@/hub/custom-api.schema";
import { useT } from "@/i18n/context";
import { McpBoundIcon } from "./mcp-bound-icon";
import styles from "./mcp-projection-read.module.css";
import galleryStyles from "./mcp-custom-api-gallery.module.css";

/** One confirmed API identity and detail action, shared by management and discovery. */
export function McpCustomApiCard({ profile, onSelect, presentation = "management" }: {
  profile: CustomApiProfile;
  onSelect: (profile: CustomApiProfile, trigger: HTMLElement) => void;
  presentation?: "management" | "plaza";
}) {
  const t = useT();
  const plaza = presentation === "plaza";
  const initial = Array.from(profile.name.trim())[0] ?? "";
  return (
    <li className={plaza ? styles.providerCard : styles.connectorCard} data-testid="custom-api-projection">
      <button type="button" className={plaza ? `${styles.providerDetailTrigger} ${galleryStyles.trigger}` : styles.connectorTrigger}
        onClick={event => onSelect(profile, event.currentTarget)} aria-label={profile.name}>
        <span className={plaza ? styles.providerLogo : styles.connectorMark} aria-hidden="true">
          <McpBoundIcon icon={profile.icon} alt="" fallback={<span className={galleryStyles.initial}>{initial}</span>} />
        </span>
        <span className={plaza ? galleryStyles.copy : styles.connectorIdentity}>
          <span>
            <strong className={plaza ? styles.providerName : undefined}>{profile.name}</strong>
            <small className={plaza ? styles.providerDescription : undefined}>{profile.instructions ?? t("connectorCatalog.customApi")}</small>
          </span>
        </span>
        {plaza ? <span className={styles.providerAction}><Check aria-label={t("skills.added")} /></span>
          : <Check className={styles.statusCheck} aria-label={t("skills.added")} />}
      </button>
    </li>
  );
}
