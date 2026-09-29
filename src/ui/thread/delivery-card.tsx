"use client"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Download, FileCheck2 } from "lucide-react"

// 会话流尾部成果区：delivery.created 归约出的冻结结论卡（区别于过程文件卡）。
// Chat owns only metadata and the binary owner selector; BFF re-authorizes every detail/content GET.

import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"
import type { SessionDelivery } from "@/core/state"
import { beginLibraryArtifactDownload } from "@/features/app/kokoro-library-artifact-client"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"
import { useLocale } from "@/i18n/context"
import { useEffect, useRef, useState } from "react"
import { formatBytes } from "./artifact-card"

import styles from "./delivery-card.module.css"

function deliveryKey(delivery: SessionDelivery): string {
  return JSON.stringify([delivery.conversationId, delivery.artifactId])
}

export function DeliverySection({
  sessionId,
  deliveries,
  onOpen,
  preview = false,
  hasMore = false,
}: {
  sessionId: string | null
  deliveries: SessionDelivery[]
  onOpen: (delivery: SessionDelivery) => void
  preview?: boolean
  hasMore?: boolean
}) {
  const { t, locale } = useLocale()
  const [downloadState, setDownloadState] = useState<Record<string, "loading" | "error">>({})
  // State updates are batched. A double click can therefore arrive before
  // `disabled` is committed; keep an immediate per-delivery gate as well so
  // one gesture can never create two authenticated downloads.
  const activeDownloadsRef = useRef<Set<string>>(new Set())
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  useEffect(() => {
    const controllers = controllersRef.current
    const activeDownloads = activeDownloadsRef.current
    return () => {
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
      activeDownloads.clear()
    }
  }, [sessionId])
  if ((deliveries.length === 0 && !hasMore) || sessionId === null) {
    return null
  }
  return (
    <section className={styles.section} aria-label={t("delivery.heading")}>
      <p className={styles.heading}>{t("delivery.heading")}</p>
      <div className={styles.cards}>
        {deliveries.map((delivery) => {
          const key = deliveryKey(delivery)
          const status = downloadState[key]
          const isLoading = status === "loading"
          const isError = status === "error"
          // Keep the action label aligned with its state so retry is discoverable without relying on the alert.
          const label = isLoading && !preview
            ? t("library.cancelDownload")
            : isLoading
              ? t("canvas.downloading")
              : isError
                ? t("canvas.retryDownload")
                : t("canvas.download")
          return (
          <div className={styles.card} key={key}>
            <Button variant="link"
              type="button"
              className={styles.open}
              data-canvas-opener="true"
              aria-label={t("delivery.openAria", { title: delivery.title })}
              onClick={() => onOpen(delivery)}
            >
              <FileCheck2 className={styles.icon} />
              <span className={styles.body}>
                <span className={styles.title}>{delivery.title}</span>
                <span className={styles.meta}>
                  {formatBytes(delivery.size)} · {formatDeliveryTime(delivery.createdAt, locale)}
                </span>
              </span>
            </Button>
            {downloadState[key] === "error" ? (
              <span className={styles.downloadError} role="alert">{t("canvas.downloadFailed")}</span>
            ) : null}
            <Button variant="ghost"
              type="button"
              className={styles.download}
              disabled={isLoading && preview}
              aria-busy={isLoading}
              aria-label={label}
              onClick={() => {
                if (isLoading && !preview) {
                  controllersRef.current.get(key)?.abort()
                  return
                }
                if (activeDownloadsRef.current.has(key)) {
                  return
                }
                activeDownloadsRef.current.add(key)
                setDownloadState((current) => ({ ...current, [key]: "loading" }))
                const controller = new AbortController()
                if (!preview) controllersRef.current.set(key, controller)
                const action = preview
                  ? fileFetch(`/api/dev/preview-files/${encodeURIComponent(delivery.artifactId)}`)
                      .then((response) => downloadFetchedFile(response, delivery.title))
                      .then((ok) => { if (!ok) throw new Error("preview_download_failed") })
                  : beginLibraryArtifactDownload(delivery, controller.signal)
                void action
                  .then(() => setDownloadState((current) => {
                    const next = { ...current }
                    delete next[key]
                    return next
                  }))
                  .catch(() => setDownloadState((current) => {
                    if (controller.signal.aborted) {
                      const next = { ...current }
                      delete next[key]
                      return next
                    }
                    return { ...current, [key]: "error" }
                  }))
                  .finally(() => {
                    activeDownloadsRef.current.delete(key)
                    controllersRef.current.delete(key)
                  })
              }}
            >
              {isLoading ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Download data-icon="inline-start" aria-hidden="true" />
              )}
              {label}
            </Button>
          </div>
          )
        })}
      </div>
      {hasMore ? <Button variant="link" asChild><a href="/app/library?tab=artifacts">{t("delivery.viewAll")}</a></Button> : null}
    </section>
  )
}
