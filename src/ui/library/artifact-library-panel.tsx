"use client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

// 作品库面板（ARTIFACT-LIB）：属主 namespace 全部成果跨会话聚合的卡片网格——
// mime 图标 / 标题 / 时间 / 来源会话跳转；点击下载（鉴权 blob）；复合游标滚动翻页；空态。
// 成果不可变、内容寻址：与可变工作区文件面分离，只读展示。

import { useCallback, useEffect, useRef, useState } from "react"
import { Download } from "lucide-react"

import { artifactContentPath, type ArtifactRecord } from "@/contract/http"
import type { SessionClient } from "@/engine/client"
import { sessionBaseUrl } from "@/engine/config"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"
import { useLocale, useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/ui/thread/artifact-card"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"

import styles from "./artifact-library-panel.module.css"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

type LibraryState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; artifacts: ArtifactRecord[]; cursor: string | undefined; loadingMore: boolean; loadMoreError: boolean }

type ArtifactLibraryPanelProps = {
  client: Pick<SessionClient, "listArtifacts">
  onClose: () => void
  // 来源会话跳转：切到该 sessionId 并关闭面板。
  onOpenSession: (sessionId: string) => void
}

// 下载走鉴权 fetch → blob（内容端点鉴权开启后 <a href> 直连 401）。
async function downloadArtifact(url: string, name: string): Promise<boolean> {
  return downloadFetchedFile(await fileFetch(url), name)
}

function artifactUrl(contentHash: string): string {
  return `${sessionBaseUrl()}${artifactContentPath(contentHash)}`
}

type LibraryContentProps = {
  client: Pick<SessionClient, "listArtifacts">
  // 来源会话跳转：切到该 sessionId（关闭责任移交调用方）。
  onOpenSession: (sessionId: string) => void
  embedded?: boolean
}

export function LibraryContent({ client, onOpenSession, embedded = false }: LibraryContentProps) {
  const t = useT()
  const { locale } = useLocale()
  const [state, setState] = useState<LibraryState>({ kind: "loading" })
  const [downloadState, setDownloadState] = useState<Record<string, "loading" | "error">>({})
  const [retrying, setRetrying] = useState(false)
  // A retry or a new client can invalidate an older page request. Sequence
  // every list operation so a slower response can never resurrect stale
  // artifacts or re-enable an obsolete pagination state.
  const requestSeqRef = useRef(0)

  const load = useCallback(async (): Promise<LibraryState> => {
    try {
      const page = await client.listArtifacts()
      return { kind: "ready", artifacts: page.artifacts, cursor: page.next_cursor, loadingMore: false, loadMoreError: false }
    } catch {
      return { kind: "error" }
    }
  }, [client])

  useEffect(() => {
    const requestSeq = ++requestSeqRef.current
    void load().then((next) => {
      if (requestSeq === requestSeqRef.current) {
        setRetrying(false)
        setState(next)
      }
    }).catch(() => {
      if (requestSeq === requestSeqRef.current) setRetrying(false)
    })
    return () => {
      requestSeqRef.current += 1
    }
  }, [load])

  const retry = useCallback(async () => {
    if (retrying) return
    const requestSeq = ++requestSeqRef.current
    setRetrying(true)
    try {
      const next = await load()
      if (requestSeq === requestSeqRef.current) {
        setState(next)
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setRetrying(false)
      }
    }
  }, [load, retrying])

  const loadMore = useCallback(async () => {
    if (retrying || state.kind !== "ready" || state.cursor === undefined || state.loadingMore) {
      return
    }
    const cursor = state.cursor
    const requestSeq = ++requestSeqRef.current
    setState({ ...state, loadingMore: true, loadMoreError: false })
    try {
      const page = await client.listArtifacts(cursor)
      if (requestSeq !== requestSeqRef.current) return
      setState((current) => current.kind === "ready" ? {
        kind: "ready",
        artifacts: [...current.artifacts, ...page.artifacts],
        cursor: page.next_cursor,
        loadingMore: false,
        loadMoreError: false,
      } : current)
    } catch {
      if (requestSeq !== requestSeqRef.current) return
      setState((current) => current.kind === "ready" ? { ...current, loadingMore: false, loadMoreError: true } : current)
    }
  }, [client, retrying, state])

  return (
    <div
      className={cn(styles.body, embedded && styles.embeddedBody)}
      data-embedded={embedded || undefined}
      data-testid="library-scroll-region"
      aria-busy={state.kind === "loading" || retrying || (state.kind === "ready" && state.loadingMore) || undefined}
    >
          {state.kind === "loading" ? (
            <div className={styles.loadingState} role="status" aria-label={t("library.loading")} aria-busy="true">
              <Skeleton className={styles.loadingLine} />
              <Skeleton className={styles.loadingLine} />
              <Skeleton className={styles.loadingLineShort} />
            </div>
          ) : state.kind === "error" ? (
            <Alert variant="destructive" className={styles.errorState}>
              <AlertDescription>
                <span>{t("library.loadError")}</span>
                <Button variant="outline" size="sm" type="button" disabled={retrying} aria-busy={retrying} onClick={() => void retry()}>
                  {retrying ? <Spinner aria-hidden="true" /> : null}
                  {retrying ? t("library.loading") : t("library.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : state.artifacts.length === 0 ? (
            <Empty data-testid="library-empty">
              <EmptyHeader>
                <EmptyTitle>{t("library.title")}</EmptyTitle>
                <EmptyDescription>{t("library.empty")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className={styles.grid} data-testid="library-grid">
                {state.artifacts.map((artifact) => (
                  <div className={styles.card} key={artifact.content_hash}>
                    <Button variant="ghost"
                      type="button"
                      className={styles.open}
                      aria-label={t(
                        downloadState[artifact.content_hash] === "error"
                          ? "library.retryDownloadAria"
                          : "library.downloadAria",
                        { title: artifact.title },
                      )}
                      disabled={downloadState[artifact.content_hash] === "loading"}
                      aria-busy={downloadState[artifact.content_hash] === "loading"}
                      onClick={() => {
                        const key = artifact.content_hash
                        setDownloadState((current) => ({ ...current, [key]: "loading" }))
                        void downloadArtifact(artifactUrl(key), artifact.title)
                          .then((ok) => setDownloadState((current) => {
                            const next = { ...current }
                            if (ok) delete next[key]
                            else next[key] = "error"
                            return next
                          }))
                          .catch(() => setDownloadState((current) => ({ ...current, [key]: "error" })))
                      }}
                    >
                      {downloadState[artifact.content_hash] === "loading" ? <Spinner aria-hidden="true" /> : <Download className={styles.icon} aria-hidden="true" />}
                      <span className={styles.cardBody}>
                        <span className={styles.cardTitle}>{artifact.title}</span>
                        <span className={styles.meta}>
                          {formatBytes(artifact.size)} · {formatDeliveryTime(artifact.created_at, locale)}
                        </span>
                        {downloadState[artifact.content_hash] === "loading" ? (
                          <span className={styles.downloadStatus}>{t("library.downloading")}</span>
                        ) : null}
                        {downloadState[artifact.content_hash] === "error" ? (
                          <span className={styles.downloadError} role="alert">{t("library.downloadFailed")}</span>
                        ) : null}
                      </span>
                    </Button>
                    <Button variant="ghost"
                      type="button"
                      className={styles.source}
                      onClick={() => onOpenSession(artifact.session_id)}
                    >
                      {t("library.openSource")}
                    </Button>
                  </div>
                ))}
              </div>
              {state.cursor !== undefined ? (
                <>
                  {state.loadMoreError ? (
                    <Alert variant="destructive" role="alert">
                      <AlertDescription>{t("library.loadMoreError")}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button variant="outline"
                    type="button"
                    className={styles.more}
                    disabled={state.loadingMore || retrying}
                    aria-busy={state.loadingMore}
                    onClick={loadMore}
                  >
                    {state.loadingMore ? <Spinner aria-hidden="true" /> : null}
                    {state.loadingMore
                      ? t("library.loading")
                      : state.loadMoreError
                        ? t("library.retryLoadMore")
                        : t("library.loadMore")}
                  </Button>
                </>
              ) : null}
            </>
          )}
    </div>
  )
}

export function ArtifactLibraryPanel({ client, onClose, onOpenSession }: ArtifactLibraryPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="library-panel"
        closeLabel={t("library.close")}
        closeButtonTestId="library-close"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="sr-only">{t("library.title")}</DialogTitle>
        <header className={styles.head}>
          <h2 className={styles.title}>{t("library.title")}</h2>
        </header>

        <LibraryContent client={client} onOpenSession={onOpenSession} />
      </DialogContent>
    </Dialog>
  )
}
