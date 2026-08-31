import { Gamepad2, Presentation, Sparkles, X } from "lucide-react"

import { CodeWindowIcon } from "@/components/icons/code-window-icon"

import styles from "./composer.module.css"

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
  const Glyph = intent === "presentation"
    ? Presentation
    : intent === "design"
      ? Sparkles
      : intent === "game"
        ? Gamepad2
        : CodeWindowIcon

  return <Glyph className={className} data-testid="creation-intent-glyph" aria-hidden="true" />
}

/** Selected creation context shown in the composer toolbar. */
export function CreationIntentPill({ intent, label, onDismiss, dismissLabel = `Dismiss ${label}` }: CreationIntentPillProps) {
  return (
    <div
      className={styles.creationIntentPill}
      data-slot="creation-intent"
      data-testid="creation-intent-pill"
      data-intent={intent}
      data-state="selected"
      data-dismiss-action="creation-intent"
    >
      <span className={styles.creationIntentIconSlot} data-slot="creation-intent-icon-slot">
        <IntentGlyph intent={intent} className={styles.creationIntentGlyph} />
        <button
          type="button"
          className={styles.creationIntentCloseButton}
          aria-label={dismissLabel}
          title={dismissLabel}
          aria-keyshortcuts="Enter Space"
          data-testid="creation-intent-close-button"
          data-slot="creation-intent-close"
          data-hit-area="24"
          data-dismiss-action="creation-intent"
          onPointerDown={(event) => {
            // Keep the editor focused while dismissing the overlaid close
            // affordance, matching the reference's inline composer behavior.
            if (event.button === 0 || event.button === undefined) event.preventDefault()
          }}
          onMouseDown={(event) => {
            if (event.button === 0 || event.button === undefined) event.preventDefault()
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
