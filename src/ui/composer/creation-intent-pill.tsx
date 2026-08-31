import { Gamepad2, Presentation, Sparkles, X } from "lucide-react"

import { CodeWindowIcon } from "@/components/icons/code-window-icon"

import styles from "./creation-intent-pill.module.css"

export type CreationIntent = "presentation" | "website" | "design" | "game" | "app"

type CreationIntentPillProps = {
  intent: CreationIntent
  label: string
  /**
   * The shell owns whether the creation intent is present. Keeping dismissal
   * controlled prevents this presentational pill from changing parent state or
   * silently changing the composer layout on its own.
  */
  onDismiss: () => void
  dismissLabel?: string
}

function IntentGlyph({ intent, className }: { intent: CreationIntent; className?: string }) {
  if (intent === "presentation") return <Presentation className={className} data-testid="creation-intent-glyph" aria-hidden="true" />
  if (intent === "design") return <Sparkles className={className} data-testid="creation-intent-glyph" aria-hidden="true" />
  if (intent === "game") return <Gamepad2 className={className} data-testid="creation-intent-glyph" aria-hidden="true" />
  return <CodeWindowIcon className={className} data-testid="creation-intent-glyph" />
}

/** Selected creation context shown in the composer toolbar. */
export function CreationIntentPill({ intent, label, onDismiss, dismissLabel = `Dismiss ${label}` }: CreationIntentPillProps) {
  return (
    <div
      className={styles.root}
      data-slot="creation-intent"
      data-testid="creation-intent-pill"
      data-intent={intent}
      data-dismiss-action="creation-intent"
    >
      <span className={styles.iconSlot} data-slot="creation-intent-icon-slot">
        <IntentGlyph intent={intent} className={styles.glyph} />
        <button
          type="button"
          className={styles.closeButton}
          aria-label={dismissLabel}
          title={dismissLabel}
          data-testid="creation-intent-close-button"
          onPointerDown={(event) => {
            // Keep the editor focused while dismissing the overlaid close
            // affordance, matching the reference's inline composer behavior.
            if (event.button === 0) event.preventDefault()
          }}
          onMouseDown={(event) => {
            if (event.button === 0) event.preventDefault()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDismiss()
          }}
        >
          <X className={styles.closeIcon} data-testid="creation-intent-close" aria-hidden="true" />
        </button>
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  )
}
