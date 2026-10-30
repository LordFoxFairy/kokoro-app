import { useEffect, useRef, useState, type ReactNode, type Ref } from "react"
import { Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/context"
import styles from "./answer-actions.module.css"

type AnswerActionsProps = {
  text: string
  rootRef?: Ref<HTMLDivElement>
  disabled?: boolean
  regenerate?: { label: string; onClick: () => void; disabled?: boolean }
  feedback?: {
    positiveLabel: string
    negativeLabel: string
    onChange: (value: "up" | "down" | null) => void
  } & ({ value: "up" | "down" | null; disabled?: boolean } | { value: undefined; disabled: true })
}

function Action({ label, icon, onClick, disabled, pressed }: {
  label: string; icon: ReactNode; onClick: () => void; disabled: boolean; pressed?: boolean
}) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" className={styles.action} aria-label={label} disabled={disabled}
        {...(pressed === undefined ? {} : { "aria-pressed": pressed })} onClick={onClick}>{icon}</button>
    </TooltipTrigger>
    <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
  </Tooltip>
}

// Optional actions are rendered only when a real owner-backed callback exists.
// Votes are controlled facts; this component never persists or invents feedback.
export function AnswerActions({ text, rootRef, disabled = false, regenerate, feedback }: AnswerActionsProps) {
  const t = useT()
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const attempt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { attempt.current += 1; if (timer.current !== null) clearTimeout(timer.current) }, [])
  const copy = async () => {
    if (disabled || !text) return
    const current = ++attempt.current
    try {
      await navigator.clipboard.writeText(text)
      if (attempt.current !== current) return
      setCopiedText(text)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => { setCopiedText(null); timer.current = null }, 1400)
    } catch {
      // Clipboard denial is not a Run failure; never claim copied on rejection.
    }
  }
  const copied = copiedText === text && text.length > 0
  return <TooltipProvider>
    <div ref={rootRef} className={styles.actions} data-slot="assistant-actions">
      {regenerate ? <Action label={regenerate.label} icon={<RotateCcw aria-hidden="true" />} onClick={regenerate.onClick} disabled={disabled || regenerate.disabled === true} /> : null}
      <Action label={t(copied ? "thread.copiedAnswer" : "thread.copyAnswer")} icon={<Copy aria-hidden="true" />} onClick={() => void copy()} disabled={disabled || !text} />
      {feedback ? <>
        <Action label={feedback.positiveLabel} icon={<ThumbsUp aria-hidden="true" />} {...(feedback.value === undefined ? {} : { pressed: feedback.value === "up" })}
          onClick={() => { if (feedback.value !== undefined) feedback.onChange(feedback.value === "up" ? null : "up") }} disabled={disabled || feedback.disabled === true || feedback.value === undefined} />
        <Action label={feedback.negativeLabel} icon={<ThumbsDown aria-hidden="true" />} {...(feedback.value === undefined ? {} : { pressed: feedback.value === "down" })}
          onClick={() => { if (feedback.value !== undefined) feedback.onChange(feedback.value === "down" ? null : "down") }} disabled={disabled || feedback.disabled === true || feedback.value === undefined} />
      </> : null}
    </div>
  </TooltipProvider>
}
