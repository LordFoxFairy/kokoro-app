import { Puzzle, X } from "lucide-react"
import { useT } from "@/i18n/context"
import styles from "./selected-skill-pill.module.css"

export type SelectedSkill = Readonly<{ name: string; sourceRef: string }>

export function SelectedSkillPill({ skill, onRemove }: { skill: SelectedSkill; onRemove: () => void }) {
  const t = useT()
  const removeLabel = t("composer.removeSelectedSkill", { name: skill.name })
  return <span className={styles.pill}>
    <Puzzle aria-hidden="true" />
    <span className={styles.name}>{skill.name}</span>
    <button type="button" onPointerDown={event => event.preventDefault()} onClick={onRemove} aria-label={removeLabel} title={removeLabel}><X aria-hidden="true" /></button>
  </span>
}
