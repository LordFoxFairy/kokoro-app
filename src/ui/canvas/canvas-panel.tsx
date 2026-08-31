"use client"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Download, FileCheck2, Maximize2, Minimize2, Play, SkipBack, X } from "lucide-react"

// 右侧 canvas 工作区面板：会话在左、内容在右（三栏第三栏）。
// 内容体按来源分派：file=可变直读（重开即最新）、delivery=冻结成果（hash 寻址）、
// tool=参数/结果详情、node=通用 ReactNode 插槽；文本预览复用格式矩阵。

import { type RefObject, useEffect, useRef, useState } from "react"

import { deliveryPath, filePath } from "@/contract/http"
import { sessionBaseUrl } from "@/engine/config"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"
import type { SessionDelivery, SessionTodo, WorkspaceFileEntry } from "@/core/state"
import { useLocale } from "@/i18n/context"
import { PreviewBody, formatBytes } from "@/ui/thread/artifact-card"
import { cn } from "@/lib/utils"

import type { ResolvedCanvasContent } from "./canvas-store"
import styles from "./canvas-panel.module.css"

export function fileUrl(sessionId: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${sessionBaseUrl()}${filePath(sessionId, "__P__")}`.replace("__P__", encoded)
}

export function deliveryUrl(sessionId: string, contentHash: string): string {
  // The preview transport emits a local delivery fixture instead of pretending that the
  // session BFF has a backing object. Keeping this decision in the URL
  // builder makes preview download and preview rendering use the same path;
  // the real app continues to use the authenticated delivery endpoint.
  if (contentHash.startsWith("preview-")) {
    return `/api/dev/preview-files/${encodeURIComponent(contentHash)}`
  }
  return `${sessionBaseUrl()}${deliveryPath(sessionId, encodeURIComponent(contentHash))}`
}

// 下载走鉴权 fetch → blob（<a href> 直连端点鉴权开启后 401）。
async function downloadFile(url: string, name: string): Promise<boolean> {
  return downloadFetchedFile(await fileFetch(url), name)
}

export function formatDeliveryTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const displayLocale = locale === "zh" ? "zh-CN" : locale
  return date.toLocaleString(displayLocale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// 工具参数压成紧凑 JSON；空参数返回 null（不渲染参数块）。
function formatToolArgs(args: Record<string, unknown>): string | null {
  const keys = Object.keys(args)
  if (keys.length === 0) return null
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return keys.join(", ")
  }
}

function contentTitle(content: ResolvedCanvasContent): string {
  switch (content.kind) {
    case "file":
      return content.file.path
    case "delivery":
      return content.delivery.title
    case "tool":
      return content.tool.name
    case "node":
      return content.title
  }
}

export type CanvasPanelProps = {
  sessionId: string
  content: ResolvedCanvasContent
  files: WorkspaceFileEntry[]
  deliveries: SessionDelivery[]
  fullscreen: boolean
  onSelectFile: (file: WorkspaceFileEntry) => void
  onSelectDelivery: (delivery: SessionDelivery) => void
  onToggleFullscreen: () => void
  onClose: () => void
  /** Host scope used to keep focus recovery inside one embedded shell. */
  focusScopeRef?: RefObject<HTMLElement | null>
  /** Task state stays visible in the full-screen desktop canvas, as in Manus. */
  todos?: readonly SessionTodo[]
}

export function CanvasPanel({
  sessionId,
  content,
  files,
  deliveries,
  fullscreen,
  onSelectFile,
  onSelectDelivery,
  onToggleFullscreen,
  onClose,
  todos = [],
}: CanvasPanelProps) {
  const { t, locale } = useLocale()
  const [view, setView] = useState<"preview" | "list">("preview")
  const [downloadState, setDownloadState] = useState<{ key: string; status: "idle" | "loading" | "error" }>({
    key: "",
    status: "idle",
  })
  // `disabled` is committed after the click handler returns. Guard the
  // request synchronously too, otherwise a fast double click can download
  // the same authenticated blob twice.
  const activeDownloadRef = useRef<string | null>(null)
  const previewHeadingRef = useRef<HTMLHeadingElement>(null)
  const previousViewRef = useRef(view)
  const title = contentTitle(content)
  const contentKey =
    content.kind === "file"
      ? `file:${content.file.path}`
      : content.kind === "delivery"
        ? `delivery:${content.delivery.contentHash}`
        : content.kind === "tool"
          ? `tool:${content.tool.id}`
          : `node:${content.title}`

  const currentDownloadState = downloadState.key === contentKey ? downloadState.status : "idle"
  const completedTodoCount = todos.filter((todo) => todo.status === "completed").length
  const activeTodo = todos.find((todo) => todo.status === "in_progress")
    ?? todos.find((todo) => todo.status === "pending")
    ?? todos.at(-1)

  // The list item that opens a preview is removed when the view switches.
  // Move focus to the stable preview heading after that transition instead of
  // leaving keyboard users on document.body.
  useEffect(() => {
    const transitionedToPreview = previousViewRef.current === "list" && view === "preview"
    previousViewRef.current = view
    if (!transitionedToPreview) return
    const frame = window.requestAnimationFrame(() => previewHeadingRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  // 下载入口按来源取 URL：file=可变当前态；delivery=冻结副本。tool/node 无下载面。
  const download =
    content.kind === "file"
      ? {
          url: fileUrl(sessionId, content.file.path),
          name: content.file.path.split("/").at(-1) ?? content.file.path,
        }
      : content.kind === "delivery"
        ? {
            url: deliveryUrl(sessionId, content.delivery.contentHash),
            name: content.delivery.path.split("/").at(-1) ?? content.delivery.title,
          }
        : null

  const meta =
    content.kind === "file"
      ? `${content.file.mime} · ${formatBytes(content.file.bytes)}`
      : content.kind === "delivery"
        ? `${content.delivery.mime} · ${formatBytes(content.delivery.size)} · ${formatDeliveryTime(content.delivery.createdAt, locale)}`
        : null

  return (
    <aside
      className={cn(styles.panel, styles.desktopPanel)}
      data-fullscreen={fullscreen ? "true" : undefined}
      data-desktop-web="true"
      aria-label={t("canvas.detailAria", { title })}
    >
      <header className={styles.head}>
        <div className={styles.heading}>
          <h2 ref={previewHeadingRef} className={styles.name} title={title} tabIndex={-1}>
            {view === "list" ? t("canvas.filesHeading") : title}
          </h2>
          {view === "preview" && meta !== null ? (
            <span className={styles.meta}>{meta}</span>
          ) : null}
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value) setView(value as "preview" | "list")
          }}
          className={styles.viewToggle}
          aria-label={t("canvas.viewAria")}
        >
          <ToggleGroupItem value="preview" size="sm">
            {t("canvas.previewTab")}
          </ToggleGroupItem>
          <ToggleGroupItem value="list" size="sm">
            {t("canvas.filesTab")}
          </ToggleGroupItem>
        </ToggleGroup>
        <span className={styles.actions}>
          {view === "preview" && download !== null ? (
            <Button variant="ghost" size="sm"
              type="button"
              className={styles.action}
              aria-label={
                currentDownloadState === "loading"
                  ? t("canvas.downloading")
                  : currentDownloadState === "error"
                    ? t("canvas.retryDownload")
                  : t("canvas.download")
              }
              title={
                currentDownloadState === "loading"
                  ? t("canvas.downloading")
                  : currentDownloadState === "error"
                    ? t("canvas.retryDownload")
                    : t("canvas.download")
              }
              disabled={currentDownloadState === "loading"}
              aria-busy={currentDownloadState === "loading"}
              onClick={() => {
                if (activeDownloadRef.current === contentKey) {
                  return
                }
                activeDownloadRef.current = contentKey
                setDownloadState({ key: contentKey, status: "loading" })
                void downloadFile(download.url, download.name)
                  .then((ok) => setDownloadState({ key: contentKey, status: ok ? "idle" : "error" }))
                  .catch(() => setDownloadState({ key: contentKey, status: "error" }))
                  .finally(() => {
                    if (activeDownloadRef.current === contentKey) {
                      activeDownloadRef.current = null
                    }
                  })
              }}
            >
              {currentDownloadState === "loading" ? <Spinner aria-hidden="true" /> : <Download data-icon="inline-start" aria-hidden="true" />}
              <span className={styles.actionLabel}>
                {currentDownloadState === "loading"
                  ? t("canvas.downloading")
                  : currentDownloadState === "error"
                    ? t("canvas.retryDownload")
                    : t("canvas.download")}
              </span>
            </Button>
          ) : null}
          {
                <Button variant="ghost" size="sm"
                type="button"
                className={cn(styles.action, styles.fullscreenAction)}
                onClick={onToggleFullscreen}
                aria-pressed={fullscreen}
                aria-label={fullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")}
                title={fullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")}
              >
                {fullscreen ? <Minimize2 data-icon="inline-start" aria-hidden="true" /> : <Maximize2 data-icon="inline-start" aria-hidden="true" />}
                <span className={styles.actionLabel}>
                  {fullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")}
                </span>
              </Button>
          }
          <Button variant="ghost" size="icon-sm"
              type="button"
              className={cn(styles.action, styles.closeAction)}
              onClick={onClose}
              aria-label={t("canvas.closePreview")}
              title={t("canvas.closePreview")}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              <span className={styles.closeLabel}>{t("canvas.close")}</span>
          </Button>
        </span>
      </header>
      {currentDownloadState === "error" ? (
        <Alert variant="destructive" className={styles.downloadError}>
          <AlertDescription>{t("canvas.downloadFailed")}</AlertDescription>
        </Alert>
      ) : null}
      <div className={styles.body}>
        {view === "list" ? (
          <WorkspaceList
            selected={content}
            files={files}
            deliveries={deliveries}
            locale={locale}
            onSelectFile={(file) => {
              onSelectFile(file)
              setView("preview")
            }}
            onSelectDelivery={(delivery) => {
              onSelectDelivery(delivery)
              setView("preview")
            }}
          />
        ) : (
          <ContentBody sessionId={sessionId} content={content} />
        )}
      </div>
      {
        <footer className={styles.taskFooter} data-slot="canvas-task-footer">
          <div className={styles.timeline} aria-hidden="true">
            <span className={styles.timelineControls}>
              <span className={styles.timelineButton}>
                <SkipBack />
              </span>
              <span className={styles.timelineButton}>
                <Play />
              </span>
            </span>
            <span className={styles.timelineTrack}><span className={styles.timelineProgress} /></span>
            <span className={styles.timelineNow} />
            <span className={styles.timelineLabel}>{t("canvas.realtime")}</span>
          </div>
          <div className={styles.taskSummary}>
            <FileCheck2 className={styles.taskIcon} aria-hidden="true" />
            <span className={styles.taskText}>{activeTodo?.content ?? t("todo.progress")}</span>
            {todos.length > 0 ? <span className={styles.taskCount}>{completedTodoCount} / {todos.length}</span> : null}
          </div>
        </footer>
      }
    </aside>
  )
}

function WorkspaceList({
  selected,
  files,
  deliveries,
  locale,
  onSelectFile,
  onSelectDelivery,
}: {
  selected: ResolvedCanvasContent
  files: WorkspaceFileEntry[]
  deliveries: SessionDelivery[]
  locale: string
  onSelectFile: (file: WorkspaceFileEntry) => void
  onSelectDelivery: (delivery: SessionDelivery) => void
}) {
  const { t } = useLocale()
  return (
    <div className={styles.listing}>
      {/* 成果分组：冻结结论置顶——「拿走什么」优先于「过程文件」。 */}
      <p className={styles.groupHeading}>{t("canvas.deliveriesHeading")}</p>
      {deliveries.length === 0 ? (
        <Empty className={styles.inlineEmpty}>
          <EmptyDescription>{t("canvas.deliveriesEmpty")}</EmptyDescription>
        </Empty>
      ) : (
        <ul className={styles.tree}>
          {deliveries.map((delivery) => {
            const selectedDelivery = selected.kind === "delivery" && selected.delivery.contentHash === delivery.contentHash
            return (
              <li key={delivery.contentHash}>
                <Button
                  variant="ghost"
                  type="button"
                  className={cn(styles.treeItem, selectedDelivery && styles.treeItemSelected)}
                  data-selected={selectedDelivery ? "true" : undefined}
                  aria-pressed={selectedDelivery}
                  onClick={() => onSelectDelivery(delivery)}
                >
                  <span className={styles.treeName}>
                    <FileCheck2 className={styles.treeIcon} />
                    {delivery.title}
                  </span>
                  <span className={styles.meta}>
                    {formatBytes(delivery.size)} · {formatDeliveryTime(delivery.createdAt, locale)}
                  </span>
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <p className={styles.groupHeading}>{t("canvas.filesHeading")}</p>
      {files.length === 0 ? (
        <Empty className={styles.inlineEmpty}>
          <EmptyDescription>{t("canvas.empty")}</EmptyDescription>
        </Empty>
      ) : (
        <ul className={styles.tree}>
          {files.map((entry) => {
            const selectedFile = selected.kind === "file" && selected.file.path === entry.path
            return (
              <li key={entry.path}>
                <Button
                  variant="ghost"
                  type="button"
                  className={cn(styles.treeItem, selectedFile && styles.treeItemSelected)}
                  data-selected={selectedFile ? "true" : undefined}
                  aria-pressed={selectedFile}
                  onClick={() => onSelectFile(entry)}
                >
                  <span className={styles.treeName}>{entry.path}</span>
                  <span className={styles.meta}>{formatBytes(entry.bytes)}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ContentBody({
  sessionId,
  content,
}: {
  sessionId: string
  content: ResolvedCanvasContent
}) {
  const { t } = useLocale()
  switch (content.kind) {
    case "file": {
      const name = content.file.path.split("/").at(-1) ?? content.file.path
      return (
        <PreviewBody
          url={fileUrl(sessionId, content.file.path)}
          mime={content.file.mime}
          name={name}
        />
      )
    }
    case "delivery": {
      const { delivery } = content
      // 成果预览：交 PreviewBody 按 mime 分派——文本(markdown/json/csv/code)直显、图片/音视频内嵌媒体，
      // 真不支持的格式才回落 unsupported。冻结字节走 deliveryUrl。
      return (
        <div className={styles.deliveryBody}>
          {delivery.note !== undefined && delivery.note !== "" ? (
            <p className={styles.deliveryNote}>{delivery.note}</p>
          ) : null}
          <PreviewBody
            url={deliveryUrl(sessionId, delivery.contentHash)}
            mime={delivery.mime}
            name={delivery.title}
          />
        </div>
      )
    }
    case "tool": {
      const { tool } = content
      const args = formatToolArgs(tool.args)
      const hasResult = typeof tool.result === "string" && tool.result.length > 0
      return (
        <div className={styles.toolBody} data-status={tool.status}>
          {args !== null ? (
            <>
              <p className={styles.groupHeading}>{t("canvas.toolArgs")}</p>
              <pre className={styles.toolBlock}>{args}</pre>
            </>
          ) : null}
          {hasResult ? (
            <>
              <p className={styles.groupHeading}>{t("canvas.toolResult")}</p>
              <pre className={styles.toolBlock} data-error={tool.status === "error" ? "true" : undefined}>
                {tool.result}
              </pre>
            </>
          ) : null}
          {args === null && !hasResult ? (
            <p className={styles.meta}>{t("canvas.toolNoDetail")}</p>
          ) : null}
        </div>
      )
    }
    case "node":
      return <>{content.node}</>
  }
}
