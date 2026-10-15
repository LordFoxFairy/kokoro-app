import { useCallback } from "react";
import { useT } from "@/i18n/context";
import { useResource } from "@/lib/query";
import type { HubClient } from "@/hub/client";
import type { SkillRevision } from "@/hub/schemas";
import { formatBytes } from "./skills-format";
import { skillResourceKey } from "./skills-resource-cache";
import styles from "./skills-panel.module.css";

export function SkillRevisions({
  client,
  scope,
  name,
}: {
  client: HubClient;
  scope: string;
  name: string;
}) {
  const t = useT();
  const revisions = useResource<SkillRevision[]>(
    skillResourceKey("hub/skill-revisions", client, `${scope}/${name}`),
    useCallback(
      () => client.skillRevisions(name, scope),
      [client, name, scope],
    ),
  );
  if (revisions.data === undefined) {
    return (
      <p className={styles.revHint}>
        {revisions.error !== undefined
          ? t("skills.loadError")
          : t("skills.loading")}
      </p>
    );
  }
  if (revisions.data.length === 0)
    return <p className={styles.revHint}>{t("skills.revEmpty")}</p>;
  return (
    <ul className={styles.revList}>
      {revisions.data.map((revision) => (
        <li key={revision.revision} className={styles.revRow}>
          <span>{t("skills.revLabel", { revision: revision.revision })}</span>
          <span className={styles.revMeta}>
            {revision.source} · {formatBytes(revision.package_size)}
          </span>
        </li>
      ))}
    </ul>
  );
}
