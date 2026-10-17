"use client"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { PersonalInstallation } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import styles from "./project-skills.module.css"

/** Presentation of one actual Project installation. No installation/default facts are inferred here. */
export function ProjectSkillCard({
  item,
  selected,
  protectedDefault,
  locked,
  limitReached,
  onSelect,
  onEnabled,
  onRemove,
  onUpdate,
}: {
  item: PersonalInstallation
  selected: boolean
  protectedDefault: boolean
  locked: boolean
  limitReached: boolean
  onSelect: (selected: boolean) => void
  onEnabled: (enabled: boolean) => void
  onRemove: (source: HTMLElement) => void
  onUpdate: (source: HTMLElement) => void
}) {
  const t = useT()
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <h3>{item.display_name}</h3>
        <Switch
          checked={item.enabled}
          disabled={locked || protectedDefault}
          aria-label={t("projectSkills.enable", { name: item.display_name })}
          onCheckedChange={onEnabled}
        />
      </div>
      <p className={styles.summary}>{item.summary}</p>
      <div className={styles.cardMeta}>
        <span>{t("projectSkills.version", { revision: item.revision })}</span>
        {item.source_status !== "active" ? <span>{t("projectSkills.unavailable")}</span> : null}
      </div>
      <label className={styles.defaultChoice}>
        <input
          type="checkbox"
          checked={selected}
          disabled={
            locked || (!selected && (!item.enabled || item.source_status !== "active" || limitReached))
          }
          onChange={(event) => onSelect(event.target.checked)}
        />
        {t("projectSkills.defaultFor", { name: item.display_name })}
      </label>
      <div className={styles.cardActions}>
        {item.available_update ? (
          <Button size="sm" variant="outline" disabled={locked} onClick={(event) => onUpdate(event.currentTarget)}>
            {t("projectSkills.update")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={locked || protectedDefault} onClick={(event) => onRemove(event.currentTarget)}>
          {t("projectSkills.remove")}
        </Button>
      </div>
      {protectedDefault ? (
        <small className={styles.hint}>{t("projectSkills.clearBeforeRemove")}</small>
      ) : null}
    </article>
  )
}
