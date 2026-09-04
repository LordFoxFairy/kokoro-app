import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import styles from "./composer-pinned-skills.module.css"

type ComposerPinnedSkillsProps = {
  skills: readonly string[]
  onUnpinSkill: (name: string) => void
}

export function ComposerPinnedSkills({ skills, onUnpinSkill }: ComposerPinnedSkillsProps) {
  const t = useT()
  if (skills.length === 0) return null
  return (
    <div className={styles.pinnedRow} aria-label={t("composer.pinnedAria")}>
      {skills.map((name) => (
        <Badge key={name} variant="secondary" className={styles.pinnedChip}>
          <span className={styles.pinnedName} title={name}>{name}</span>
          <Button variant="ghost" type="button" className={styles.pinnedRemove} aria-label={t("composer.pinnedRemove", { name })} onClick={() => onUnpinSkill(name)}>
            <X data-icon="inline-start" aria-hidden="true" />
          </Button>
        </Badge>
      ))}
    </div>
  )
}
