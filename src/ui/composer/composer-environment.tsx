import { Monitor } from "lucide-react"

import { cn } from "@/lib/utils"

import styles from "./composer-controls.module.css"

export function ComposerEnvironment({ label, floating = false }: { label: string; floating?: boolean }) {
  return (
    <span className={cn(styles.mode, styles.environmentSelector, floating ? styles.floatingEnvironment : undefined)} role="status" aria-label={label} title={label} data-slot={floating ? "floating-environment" : undefined} data-environment-state="static">
      <Monitor className={styles.modeGlyph} data-icon="inline-start" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
