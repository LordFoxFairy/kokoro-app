import { X } from "lucide-react"

import styles from "./composer.module.css"

export type CreationIntent = "website" | "app"

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

/** Selected creation context shown in the composer toolbar. */
export function CreationIntentPill({ intent, label, onDismiss, dismissLabel = `Dismiss ${label}` }: CreationIntentPillProps) {
  return (
    <div
      className={styles.creationIntent}
      data-slot="creation-intent"
      data-testid="creation-intent-pill"
      data-intent={intent}
      data-dismiss-action="creation-intent"
    >
      <span className={styles.creationIntentIconSlot}>
        <button
          type="button"
          className={styles.creationIntentCloseButton}
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
          <X className={styles.creationIntentCloseIcon} data-testid="creation-intent-close" aria-hidden="true" />
        </button>
      </span>
      <span className={styles.creationIntentLabel}>{label}</span>
    </div>
  )
}
