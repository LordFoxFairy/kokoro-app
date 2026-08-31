"use client"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

// 产物预览卡：按 MIME 主类分派的全格式矩阵；文本类懒加载（点开才拉字节），媒体类浏览器原生流式。

import { useEffect, useState } from "react"

import { fileFetch, useFileBlob } from "@/engine/file-fetch"
import { useT } from "@/i18n/context"

import { MarkdownMessage } from "./markdown-message"

import styles from "./artifact-card.module.css"

const TEXT_PREVIEW_MAX_BYTES = 64 * 1024
const CSV_PREVIEW_MAX_ROWS = 200

export function formatBytes(count: number): string {
  if (count < 1024) return `${count} B`
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`
  return `${(count / (1024 * 1024)).toFixed(1)} MB`
}

type TextPreview = { kind: "loading" } | { kind: "text"; text: string; truncated: boolean } | { kind: "failed" }

const LOADING_TEXT_PREVIEW: TextPreview = { kind: "loading" }

function useTextPreview(url: string, enabled: boolean, retryKey: number): TextPreview {
  // 将已落定内容与 URL 一起保存。切换文件后，在新请求返回前必须回到 loading，
  // 不能把上一个文件的正文短暂显示在当前文件标题下。
  const [settled, setSettled] = useState<{ url: string; retryKey: number; preview: TextPreview } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const controller = new AbortController()
    void fileFetch(url, controller.signal)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const buffer = await res.arrayBuffer()
        const truncated = buffer.byteLength > TEXT_PREVIEW_MAX_BYTES
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.slice(0, TEXT_PREVIEW_MAX_BYTES),
        )
        if (!cancelled) setSettled({ url, retryKey, preview: { kind: "text", text, truncated } })
      })
      .catch(() => {
        // 解码失败/拉取失败：降级下载卡，绝不因预览失败丢产物入口。
        if (!cancelled) setSettled({ url, retryKey, preview: { kind: "failed" } })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [url, enabled, retryKey])
  return settled?.url === url && settled.retryKey === retryKey ? settled.preview : LOADING_TEXT_PREVIEW
}

function CsvTable({ text }: { text: string }) {
  const rows = parseCsv(text).slice(0, CSV_PREVIEW_MAX_ROWS)
  return (
    <div className={styles.tableWrap}>
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

// CSV 预览不能直接用 line.split(",")：营销文案、地址和带引号的字段经常包含逗号，
// 还要处理双引号转义与 CRLF。这里保持轻量的 RFC4180 子集解析，预览上限仍由调用方控制。
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  const pushCell = () => {
    row.push(cell)
    cell = ""
  }
  const pushRow = () => {
    if (row.length > 0 && row.some((value) => value.length > 0)) {
      rows.push(row)
    }
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"' && cell.length === 0) {
      quoted = true
    } else if (char === ",") {
      pushCell()
    } else if (char === "\n") {
      pushCell()
      pushRow()
    } else if (char !== "\r") {
      cell += char
    }
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell()
    pushRow()
  }
  return rows
}

function TextualPreview({ url, mime }: { url: string; mime: string }) {
  const t = useT()
  const [retryKey, setRetryKey] = useState(0)
  const preview = useTextPreview(url, true, retryKey)
  if (preview.kind === "loading") return <p className={styles.note}>{t("artifact.loadingPreview")}</p>
  if (preview.kind === "failed") {
    return (
      <Alert variant="destructive" className={styles.previewError}>
        <AlertDescription className={styles.previewErrorContent}>
          <span>{t("artifact.cannotPreview")}</span>
          <Button variant="outline" size="sm" type="button" onClick={() => setRetryKey((value) => value + 1)}>
            {t("artifact.retryPreview")}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  const body =
    mime === "text/markdown" ? (
      <MarkdownMessage content={preview.text} />
    ) : mime === "application/json" ? (
      <pre className={styles.code}>{formatJson(preview.text)}</pre>
    ) : mime === "text/csv" ? (
      <CsvTable text={preview.text} />
    ) : (
      <pre className={styles.code}>{preview.text}</pre>
    )
  return (
    <>
      {body}
      {preview.truncated ? <p className={styles.note}>{t("artifact.truncated")}</p> : null}
    </>
  )
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function isTextual(mime: string): boolean {
  // text/html 排除在外：交 MediaPreview 的 sandbox iframe 真渲染（否则被当纯文本显示源码）。
  return (mime.startsWith("text/") && mime !== "text/html") || mime === "application/json"
}

function isMedia(mime: string): boolean {
  return (
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime.startsWith("image/") ||
    mime === "text/html" ||
    mime === "application/pdf"
  )
}

// 媒体/iframe：src 带不了 Authorization，故鉴权 fetch 成 object URL 再喂 src（鉴权开启后避 401）。
function MediaPreview({ url, mime, name }: { url: string; mime: string; name: string }) {
  const t = useT()
  const [retryKey, setRetryKey] = useState(0)
  const blob = useFileBlob(url, true, retryKey)
  if (blob.kind === "loading") return <p className={styles.note}>{t("artifact.loadingPreview")}</p>
  if (blob.kind === "failed") {
    return (
      <Alert variant="destructive" className={styles.previewError}>
        <AlertDescription className={styles.previewErrorContent}>
          <span>{t("artifact.cannotPreview")}</span>
          <Button variant="outline" size="sm" type="button" onClick={() => setRetryKey((value) => value + 1)}>
            {t("artifact.retryPreview")}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  const src = blob.objectUrl
  if (mime.startsWith("audio/")) return <audio className={styles.media} controls src={src} />
  if (mime.startsWith("video/")) return <video className={styles.media} controls src={src} />
  if (mime.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- 产物字节=本地 session 端点鉴权拉取的 blob，无 next/image 面
    return <img className={styles.media} src={src} alt={name} />
  }
  if (mime === "text/html")
    return <iframe className={styles.frame} sandbox="" src={src} title={name} />
  return <iframe className={styles.frame} src={src} title={name} />
}

export function PreviewBody({ url, mime, name }: { url: string; mime: string; name: string }) {
  const t = useT()
  if (isTextual(mime)) return <TextualPreview url={url} mime={mime} />
  if (isMedia(mime)) return <MediaPreview url={url} mime={mime} name={name} />
  return <p className={styles.note}>{t("artifact.unsupported")}</p>
}

export function FileChip({ path, onOpen }: { path: string; onOpen: () => void }) {
  // 路径即入口（manus/codex 心智）：write_file 等工具行的文件名可点，canvas 打开预览。
  const name = path.split("/").at(-1) ?? path
  return (
    <Button variant="outline" type="button" className={styles.chip} data-canvas-opener="true" onClick={onOpen}>
      <span className={styles.chipName}>{name}</span>
    </Button>
  )
}
