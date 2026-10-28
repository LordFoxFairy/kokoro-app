import { useId, useState, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import styles from "./turn-process.module.css"

/** Whole-turn disclosure is distinct from each adjacent action passage. */
export function TurnProcess({ enabled, children, onContentFocusChange, inspected = false }: {
  enabled: boolean
  inspected?: boolean
  children: ReactNode
  onContentFocusChange: (focused: boolean) => void
}) {
  const t = useT(), id = useId()
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const open = !enabled || (expanded ?? inspected)
  return <div className={styles.process} data-whole-turn-process={enabled ? "ready" : "pending"}>
    {enabled ? <Button type="button" variant="ghost" className={styles.summary} aria-controls={id} aria-expanded={open} onClick={() => setExpanded(!open)}>
      <span>{t("thread.processHeading")}</span><ChevronRight aria-hidden className={styles.chevron} data-open={open} />
    </Button> : null}
    <div id={id} className={styles.content} hidden={!open} inert={!open}
      onFocusCapture={() => onContentFocusChange(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onContentFocusChange(false) }}>
      {children}
    </div>
  </div>
}
