import { AudioWaveform, Mic } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import type { VoiceInputState } from "./use-voice-input"
import styles from "./composer-controls.module.css"

type ComposerVoiceActionsProps = {
  emptyWorkspace: boolean
  projectWorkspace: boolean
  creationIntent: string | undefined
  state: VoiceInputState
  onToggle: () => void
}

export function ComposerVoiceActions({ emptyWorkspace, projectWorkspace, creationIntent, state, onToggle }: ComposerVoiceActionsProps) {
  const t = useT()
  const active = state === "listening" || state === "transcribing"
  const status = state === "listening" ? t("composer.voiceListening") : state === "transcribing" ? t("composer.voiceTranscribing") : state === "error" ? t("composer.voiceUnavailable") : ""
  return (
    <div className={styles.trailingActions} aria-label={t("composer.voiceInput")}>
      {emptyWorkspace && !projectWorkspace && creationIntent === "website" ? null : <Button type="button" variant="ghost" size="icon-sm" disabled aria-label={t("composer.voiceMode")}><AudioWaveform aria-hidden="true" /></Button>}
      <Button type="button" variant="ghost" size="icon-sm" className={styles.voiceInput} data-state={state} aria-label={t(active ? "composer.voiceStop" : "composer.voiceInput")} aria-pressed={active} onPointerDown={(event) => {
        const pointerType = event.pointerType
        if (pointerType !== "mouse" && pointerType !== "pen") return
        const target = event.currentTarget
        target.dataset.pointerFocus = "true"
        target.addEventListener("blur", () => { delete target.dataset.pointerFocus }, { once: true })
      }} onClick={onToggle}><Mic aria-hidden="true" /></Button>
      {status ? <span className="sr-only" data-slot="voice-input-status" role="status" aria-live="polite">{status}</span> : null}
    </div>
  )
}
