import { ArrowUp, Square, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import styles from "./composer-controls.module.css"

type ComposerSubmitActionProps = {
  isStreaming: boolean
  isAwaitingApproval: boolean
  showSend: boolean
  canSend: boolean
  activeDelivery: "interrupt" | "steer" | undefined
  onStop: () => void
}

export function ComposerSubmitAction({ isStreaming, isAwaitingApproval, showSend, canSend, activeDelivery, onStop }: ComposerSubmitActionProps) {
  const t = useT()
  const sendLabel = t(activeDelivery === "interrupt" ? "settingsServices.interruptAndSend"
    : activeDelivery === "steer" ? "settingsServices.sendWithoutInterrupt"
    : isStreaming ? "settings.taskDeliveryQueue" : "composer.send")
  const stop = isStreaming ? (
    <Button variant="outline" size="icon-sm" className={`${styles.send} ${styles.sendStop}`} data-composer-action="stop" type="button" aria-label={t(isAwaitingApproval ? "hitl.cancelWaiting" : "composer.stop")} title={t(isAwaitingApproval ? "hitl.cancelWaiting" : "composer.stop")} onClick={onStop}>
      {isAwaitingApproval ? <X className={styles.glyph} data-icon="inline-start" aria-hidden="true" /> : <Square className={styles.glyph} data-icon="inline-start" />}
    </Button>
  ) : null
  return (
    <>
      {stop}
      {showSend ? (
        <Button variant="default" size="icon-sm" className={styles.send} data-composer-action="send" type="submit" aria-label={sendLabel} title={isStreaming ? sendLabel : undefined} disabled={!canSend}><ArrowUp className={styles.glyph} data-icon="inline-start" /></Button>
      ) : null}
    </>
  )
}
