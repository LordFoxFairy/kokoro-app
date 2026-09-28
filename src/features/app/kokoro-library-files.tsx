"use client"

import { FileText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useLocale, useT } from "@/i18n/context"
import { formatDeliveryTime } from "@/ui/canvas/canvas-panel"

import { useLibraryFiles } from "./kokoro-library-file-state"
import { KokoroLibraryFileUpload } from "./kokoro-library-file-upload"
import type { LibraryUploadIntent } from "./kokoro-library-file-upload-state"
import styles from "./kokoro-library-surface.module.css"

type UploadProps = {
  intent: LibraryUploadIntent | null
  select: (file: File) => void
  submit: () => void
  refreshRevision: number
}

function FileEmpty() {
  const t = useT()
  return <section className={styles.stateRegion} data-testid="library-files-empty"><Empty className={styles.empty}><EmptyHeader><EmptyMedia variant="default" className={styles.emptyMedia}><FileText aria-hidden="true" /></EmptyMedia><EmptyTitle className={styles.emptyTitle}>{t("library.filesEmpty")}</EmptyTitle><EmptyDescription className={styles.emptyDescription}>{t("library.filesEmptyDescription")}</EmptyDescription></EmptyHeader></Empty></section>
}

function LiveFiles({ upload }: { upload: UploadProps }) {
  const t = useT()
  const { locale } = useLocale()
  const { items, nextCursor, phase, reload, loadMore } = useLibraryFiles(upload.refreshRevision)

  return <>
    <KokoroLibraryFileUpload intent={upload.intent} onSelect={upload.select} onSubmit={upload.submit} />
    {phase === "loading" ? <div className={styles.stateRegion} role="status">{t("library.filesLoading")}</div> : null}
    {phase === "error" ? <div className={styles.stateRegion}><Alert variant="destructive" className={styles.errorState}><AlertDescription><span>{t("library.filesLoadError")}</span><Button type="button" variant="outline" size="sm" onClick={reload}>{t("library.filesRetry")}</Button></AlertDescription></Alert></div> : null}
    {phase === "ready" && items.length === 0 ? <FileEmpty /> : null}
    {phase !== "loading" && phase !== "error" && items.length > 0 ? <div className={styles.list} data-testid="library-files" role="list" aria-label={t("library.filesTab")}>{items.map((file) => <Card key={file.assetId} role="listitem" className={styles.artifactCard} data-asset-id={file.assetId}><CardContent className={styles.artifactMain}><span className={styles.typeIcon}><FileText aria-hidden="true" /></span><span className={styles.cardBody}><span className={styles.cardTitle}>{file.filename}</span><span className={styles.meta}>{file.mimeType} · {new Intl.NumberFormat(locale).format(BigInt(file.sizeBytes))} B · {formatDeliveryTime(file.createdAt, locale)}</span></span></CardContent></Card>)}</div> : null}
    {phase !== "loading" && phase !== "error" && nextCursor !== null ? <div className={styles.pagination}>{phase === "moreError" ? <Alert variant="destructive" className={styles.loadMoreError}><AlertDescription><span>{t("library.filesLoadMoreError")}</span><Button type="button" variant="outline" size="sm" onClick={loadMore}>{t("library.filesRetryMore")}</Button></AlertDescription></Alert> : <Button type="button" variant="outline" size="sm" disabled={phase === "loadingMore"} onClick={loadMore}>{phase === "loadingMore" ? t("library.filesLoading") : t("library.filesLoadMore")}</Button>}</div> : null}
  </>
}

/** Explicit preview stays local; live file pages never silently become an empty fixture. */
export function KokoroLibraryFiles({ preview, upload }: { preview: boolean; upload: UploadProps }) {
  return preview ? <FileEmpty /> : <LiveFiles upload={upload} />
}
