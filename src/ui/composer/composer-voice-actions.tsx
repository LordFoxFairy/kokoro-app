import { AudioWaveform, Mic } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import type { VoiceInputError, VoiceInputState } from "./use-voice-input"
import styles from "./composer-controls.module.css"

type ComposerVoiceActionsProps = {
  emptyWorkspace: boolean
  projectWorkspace: boolean
  creationIntent: string | undefined
  state: VoiceInputState
  error: VoiceInputError | null
  onToggle: () => void
}

export function ComposerVoiceActions({ emptyWorkspace, projectWorkspace, creationIntent, state, error, onToggle }: ComposerVoiceActionsProps) {
  const t = useT()
  const active = state === "listening" || state === "transcribing"
  const status = state === "listening" ? t("composer.voiceListening")
    : state === "transcribing" ? t("composer.voiceTranscribing")
    : error === "permission" ? t("composer.voicePermissionDenied")
    : error === "recognizer" ? t("composer.voiceServiceUnavailable")
    : error === "unsupported" ? t("composer.voiceUnavailable") : ""
  return (
    <div className={styles.trailingActions} data-slot="composer-voice-actions" aria-label={t("composer.voiceInput")}>
      {emptyWorkspace && !projectWorkspace && creationIntent === "website" ? null : <Button type="button" variant="ghost" size="icon-sm" disabled aria-label={t("composer.voiceMode")}><AudioWaveform aria-hidden="true" /></Button>}
      <Button type="button" variant="ghost" size="icon-sm" className={styles.voiceInput} data-state={state} aria-label={t(active ? "composer.voiceStop" : "composer.voiceInput")} aria-pressed={active} title={error === null ? undefined : status} onPointerDown={(event) => {
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
