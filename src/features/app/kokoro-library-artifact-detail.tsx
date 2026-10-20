"use client"

import { useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useLocale, useT } from "@/i18n/context"
import { formatBytes } from "@/ui/thread/artifact-card"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"
import { type LibraryArtifact, type getLibraryArtifact } from "./kokoro-library-artifact-client"
import styles from "./kokoro-library-surface.module.css"

/** Exact metadata only: no content buffering, speculative thumbnails or rich preview. */
export function LibraryArtifactDetail({ artifact, read, admitted, generation, onClose, onReturnFocus, onDownload, downloadState, onOpenSession }: {
  artifact: LibraryArtifact
  read: typeof getLibraryArtifact
  admitted: boolean
  generation: number
  onClose: () => void
  onReturnFocus: () => void
  onDownload: (artifact: LibraryArtifact) => Promise<void>
  downloadState: "loading" | "error" | "started" | undefined
  onOpenSession?: (id: string) => void
}) {
  const t = useT(), { locale } = useLocale()
  const [attempt, setAttempt] = useState(0)
  const scope = useMemo(() => ({ admitted, generation, read, attempt }), [admitted, generation, read, attempt])
  const [result, setResult] = useState<{ scope: typeof scope; detail: LibraryArtifact | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!admitted) return
    const controller = new AbortController()
    void read(artifact.conversationId, artifact.artifactId, controller.signal).then(detail => {
      if (controller.signal.aborted) return
      if (detail.conversationId !== artifact.conversationId || detail.artifactId !== artifact.artifactId) throw Error("library_artifacts_invalid_response")
      setResult({ scope, detail, error: null })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ scope, detail: null, error: error instanceof Error ? error.message : "unknown" })
    })
    return () => controller.abort()
  }, [artifact.conversationId, artifact.artifactId, read, scope, admitted])
  const visible = admitted && result?.scope === scope ? result : null
  const detail = visible?.detail
  const errorKey = visible?.error === "library_artifact_not_found" ? "library.fileNotFound"
    : visible?.error === "library_artifact_auth_required" ? "library.fileAuthRequired" : "library.loadError"
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className={styles.artifactDetail} closeLabel={t("canvas.close")} onCloseAutoFocus={event => {
      event.preventDefault(); onReturnFocus()
    }}>
      <DialogTitle>{detail?.title ?? t("library.artifactsTab")}</DialogTitle>
      <DialogDescription>{t("library.detailDescription")}</DialogDescription>
      {!detail && !visible?.error ? <p role="status">{t("library.loading")}</p> : null}
      {visible?.error ? <Alert role="alert" variant="destructive"><AlertDescription>{t(errorKey)}</AlertDescription>
        <Button variant="outline" onClick={() => { setResult(null); setAttempt(value => value + 1) }}>{t("library.retry")}</Button>
      </Alert> : null}
      {detail ? <>
        <dl className={styles.artifactMetadata}>
          <div><dt>{t("library.detailFilename")}</dt><dd>{detail.filename}</dd></div>
          <div><dt>{t("library.detailType")}</dt><dd>{detail.mimeType}</dd></div>
          <div><dt>{t("library.detailSize")}</dt><dd>{formatBytes(Number(detail.sizeBytes))}</dd></div>
          <div><dt>{t("library.detailDelivered")}</dt><dd><time dateTime={detail.deliveredAt}>{formatDeliveryTime(detail.deliveredAt, locale)}</time></dd></div>
        </dl>
        <div className={styles.artifactDetailActions}>
          {onOpenSession ? <Button variant="outline" onClick={() => { onClose(); onOpenSession(detail.conversationId) }}>{t("library.openSource")}</Button> : null}
          <Button disabled={downloadState === "loading"} aria-busy={downloadState === "loading"} onClick={() => void onDownload(detail)}><Download aria-hidden="true" />{t(downloadState === "error" ? "library.fileRetryDownload" : "library.fileDownload")}</Button>
        </div>
        {downloadState ? <p role={downloadState === "error" ? "alert" : "status"}>{t(downloadState === "loading" ? "library.downloading" : downloadState === "error" ? "library.downloadFailed" : "library.downloadStarted")}</p> : null}
      </> : null}
    </DialogContent>
  </Dialog>
}
