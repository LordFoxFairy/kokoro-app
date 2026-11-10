"use client"
import { useT } from "@/i18n/context"

import { MarkdownMessage } from "./markdown-message"

import styles from "./artifact-card.module.css"

const CSV_PREVIEW_MAX_ROWS = 200
const CSV_PREVIEW_MAX_COLUMNS = 64
const CSV_PREVIEW_MAX_CELLS = 2_000

export function formatBytes(count: number): string {
  if (count < 1024) return `${count} B`
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`
  return `${(count / (1024 * 1024)).toFixed(1)} MB`
}

function CsvTable({ text }: { text: string }) {
  const t = useT()
  const rows = parseCsv(text)
  if (rows === null) return <p className={styles.note}>{t("artifact.cannotPreview")}</p>
  return (
    <div className={styles.tableWrap} role="group" aria-label={t("canvas.previewTab")} tabIndex={0}>
      <table className={styles.table}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Preserve quotes, CRLF, embedded newlines and empty cells. Reject malformed
// or over-complex input rather than rendering a deceptively partial table.
function parseCsv(text: string): string[][] | null {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  let closedQuote = false
  let cells = 0

  const pushCell = () => {
    row.push(cell)
    cell = ""
    closedQuote = false
    cells += 1
    return row.length <= CSV_PREVIEW_MAX_COLUMNS && cells <= CSV_PREVIEW_MAX_CELLS
  }
  const pushRow = () => {
    rows.push(row)
    row = []
    return rows.length <= CSV_PREVIEW_MAX_ROWS
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char !== '"') cell += char
      else if (text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = false
        closedQuote = true
      }
    } else if (char === ",") {
      if (!pushCell()) return null
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      if (!pushCell() || !pushRow()) return null
    } else if (closedQuote) return null
    else if (char === '"') {
      if (cell.length !== 0) return null
      quoted = true
    } else cell += char
  }

  if (quoted) return null
  if ((cell.length > 0 || row.length > 0 || closedQuote) && (!pushCell() || !pushRow())) return null
  return rows
}

/** Pure presentation shared by Workspace and verified, bounded Library previews. */
export function TextPreviewBody({ text, mime }: { text: string; mime: string }) {
  if (mime === "text/markdown") return <MarkdownMessage content={text} resourcePolicy="text-only" />
  if (mime === "text/csv") return <CsvTable text={text} />
  return <pre className={styles.code}>{mime === "application/json" ? formatJson(text) : text}</pre>
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
