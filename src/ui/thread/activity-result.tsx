import type { RunActivityDetail } from "@/contract/answer-actions"
import { useT } from "@/i18n/context"
import { mcpResultText } from "./mcp-result-text"
import { MarkdownMessage } from "./markdown-message"
import styles from "./activity-inspector.module.css"

type Preview = RunActivityDetail["output_preview"]

function PreviewNotes({ preview }: { preview: Preview }) {
  const t = useT()
  return <>
    {preview?.truncated ? <span className={styles.annotation}>{t("thread.activityTruncated")}</span> : null}
    {preview?.redacted ? <span className={styles.annotation}>{t("thread.activityRedacted")}</span> : null}
  </>
}

/** No fetch or status inference: reading and original representation share the same owner fact. */
export function ActivityResult({ detail, mcpCall }: { detail: RunActivityDetail; mcpCall: boolean }) {
  const t = useT()
  const preview = detail.output_preview
  const paragraphs = mcpCall && preview ? mcpResultText(preview.text) : null
  const original = ([ ["thread.activityInput", detail.input_preview], ["thread.activityOutput", preview] ] as const).map(([label, value]) => <section key={label} className={styles.section}>
    <h3 className={styles.heading}>{t(label)}</h3>
    {value ? <><pre className={styles.preview}>{value.text}</pre><PreviewNotes preview={value} /></>
      : <p className={styles.missing}>{t("thread.activityMissing")}</p>}
  </section>)
  if (!mcpCall) return <><p className={styles.operation}>{detail.tool_name}</p>{detail.tool_description ? <section className={styles.section}><h3 className={styles.heading}>{t("thread.activityToolDescription")}</h3><p className={styles.resultText}>{detail.tool_description.text}</p><PreviewNotes preview={detail.tool_description} /></section> : null}{original}</>
  return <>
    <section className={styles.section} aria-label={t("thread.activityResult")}>
      <h3 className={styles.heading}>{t("thread.activityResult")}</h3>
      {paragraphs ? paragraphs.map((text, index) => <div className={styles.resultMarkdown} key={index}><MarkdownMessage content={text} resourcePolicy="text-only" /></div>)
        : <p className={styles.missing}>{t(preview ? "thread.activityRawResult" : "thread.activityMissing")}</p>}
      <PreviewNotes preview={preview} />
    </section>
    <details className={styles.technical}>
      <summary>{t("thread.activityTechnical")}</summary>
      <div className={styles.technicalBody}>
        <p className={styles.operation}>{detail.tool_name}</p>
        {detail.tool_description ? <section className={styles.section}><h3 className={styles.heading}>{t("thread.activityToolDescription")}</h3><p className={styles.resultText}>{detail.tool_description.text}</p><PreviewNotes preview={detail.tool_description} /></section> : null}
        {original}
      </div>
    </details>
  </>
}
