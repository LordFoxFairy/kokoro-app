"use client"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Download, FileCheck2 } from "lucide-react"

// 会话流尾部成果区：delivery.created 归约出的冻结结论卡（区别于过程文件卡）。
// 点击在 canvas 打开冻结预览；下载走 deliveries 端点的冻结副本。

import { deliveryUrl, formatDeliveryTime } from "@/ui/canvas/canvas-panel"
import type { SessionDelivery } from "@/core/state"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"
import { useLocale } from "@/i18n/context"
import { useRef, useState } from "react"
import { formatBytes } from "./artifact-card"

import styles from "./delivery-card.module.css"

// 下载走鉴权 fetch → blob（deliveries 端点鉴权开启后 <a href> 直连 401）。
async function downloadDelivery(url: string, name: string): Promise<boolean> {
  return downloadFetchedFile(await fileFetch(url), name)
}

export function DeliverySection({
  sessionId,
  deliveries,
  onOpen,
}: {
  sessionId: string | null
  deliveries: SessionDelivery[]
  onOpen: (delivery: SessionDelivery) => void
}) {
  const { t, locale } = useLocale()
  const [downloadState, setDownloadState] = useState<Record<string, "loading" | "error"> >({})
  // State updates are batched. A double click can therefore arrive before
  // `disabled` is committed; keep an immediate per-delivery gate as well so
  // one gesture can never create two authenticated downloads.
  const activeDownloadsRef = useRef<Set<string>>(new Set())
  if (deliveries.length === 0 || sessionId === null) {
    return null
  }
  return (
    <section className={styles.section} aria-label={t("delivery.heading")}>
      <p className={styles.heading}>{t("delivery.heading")}</p>
      <div className={styles.cards}>
        {deliveries.map((delivery) => {
          const status = downloadState[delivery.contentHash]
          const isLoading = status === "loading"
          const isError = status === "error"
          // Keep the action label aligned with its state so retry is discoverable without relying on the alert.
          const label = isLoading
            ? t("canvas.downloading")
            : isError
              ? t("canvas.retryDownload")
              : t("canvas.download")
          return (
          <div className={styles.card} key={delivery.contentHash}>
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
            {downloadState[delivery.contentHash] === "error" ? (
              <span className={styles.downloadError} role="alert">{t("canvas.downloadFailed")}</span>
            ) : null}
            <Button variant="ghost"
              type="button"
              className={styles.download}
              disabled={isLoading}
              aria-busy={isLoading}
              aria-label={label}
              onClick={() => {
                const key = delivery.contentHash
                if (activeDownloadsRef.current.has(key)) {
                  return
                }
                activeDownloadsRef.current.add(key)
                setDownloadState((current) => ({ ...current, [key]: "loading" }))
                void downloadDelivery(
                  deliveryUrl(sessionId, key),
                  delivery.path.split("/").at(-1) ?? delivery.title,
                )
                  .then((ok) => setDownloadState((current) => {
                    const next = { ...current }
                    if (ok) delete next[key]
                    else next[key] = "error"
                    return next
                  }))
                  .catch(() => setDownloadState((current) => ({ ...current, [key]: "error" })))
                  .finally(() => {
                    activeDownloadsRef.current.delete(key)
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
    </section>
  )
}
