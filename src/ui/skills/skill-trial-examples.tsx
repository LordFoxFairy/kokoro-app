import { useLayoutEffect, useRef, useState } from "react"
import { MessageCircle } from "lucide-react"
import { useT } from "@/i18n/context"
import styles from "./manus-skill-detail-dialog.module.css"

/** A failed handoff leaves the detail open. The keyed lifetime prevents an
 * old example callback from staging a replacement version's execution. */
export function SkillTrialExamples({ examples, ready, onTry }: {
  examples: readonly string[]
  ready: boolean
  onTry: (prompt: string) => boolean
}) {
  const t = useT()
  const live = useRef(false)
  const [failed, setFailed] = useState(false)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  return <>
    {!ready ? <p className={styles.status}>{t("skills.tryRequiresEnabledVersion")}</p> : null}
    {failed ? <p role="alert" className={styles.status}>{t("skills.tryUnavailable")}</p> : null}
    <div className={styles.examples}>{examples.map(example => <button key={example} type="button" disabled={!ready} onClick={() => {
      if (live.current && ready && !onTry(example)) setFailed(true)
    }}><MessageCircle aria-hidden="true" /><span>{example}</span></button>)}</div>
  </>
}
