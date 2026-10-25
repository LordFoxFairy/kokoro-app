"use client";

import type { CustomApiProfile } from "@/hub/custom-api.schema";
import { useT } from "@/i18n/context";
import { McpCustomApiCard } from "./mcp-custom-api-card";
import styles from "./mcp-custom-api-gallery.module.css";

/** Custom API is an owner-defined kind; missing Provider metadata never classifies an MCP as custom. */
export function visibleCustomApiGalleryProfiles({ profiles, admitted, confirmed, query, category }: {
  profiles: readonly CustomApiProfile[];
  admitted: boolean;
  confirmed: boolean;
  query: string;
  category: string;
}): readonly CustomApiProfile[] {
  if (!admitted || !confirmed || category !== "all") return [];
  const search = query.trim().toLocaleLowerCase();
  return profiles.filter(profile => !search || [profile.name, profile.instructions]
    .some(value => value?.toLocaleLowerCase().includes(search)));
}

export function McpCustomApiGallery({ profiles, admitted, confirmed, query, category, onSelect }: {
  profiles: readonly CustomApiProfile[];
  admitted: boolean;
  confirmed: boolean;
  query: string;
  category: string;
  onSelect: (profile: CustomApiProfile, trigger: HTMLElement) => void;
}) {
  const t = useT();
  const visible = visibleCustomApiGalleryProfiles({ profiles, admitted, confirmed, query, category });
  // The coordinator owns aggregate loading/error/empty states; an empty section is not an all-empty claim.
  if (visible.length === 0) return null;
  return <section className={styles.section} aria-label={t("connectorCatalog.customApi")}>
    <ul className={styles.grid}>
      {visible.map(profile => <McpCustomApiCard key={profile.profile_id} profile={profile} presentation="plaza" onSelect={onSelect} />)}
    </ul>
  </section>;
}
