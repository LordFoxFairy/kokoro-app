"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"

import type { LibraryUploadIntent } from "./kokoro-library-file-upload-state"
import styles from "./kokoro-library-surface.module.css"

type UploadControlsProps = {
  intent: LibraryUploadIntent | null
  onSelect: (file: File) => void
  onSubmit: () => void
}

function errorMessage(code: string, t: ReturnType<typeof useT>): string {
  if (code === "request_body_too_large") return t("library.uploadTooLarge")
  if (code === "library_file_infected") return t("library.uploadInfected")
  if (code === "idempotency_conflict") return t("library.uploadConflict")
  if (code === "file_upload_aborted") return t("library.uploadAborted")
  if (code === "library_file_scan_pending" || code === "idempotency_in_progress") return t("library.uploadPending")
  if (code === "upload_invalid_response" || code === "upload_receipt_mismatch" || code === "upload_network_error")
    return t("library.uploadUnknown")
  return t("library.uploadFailed")
}

/** One visible file intent; its state is owned by the Library page across Tabs unmounts. */
export function KokoroLibraryFileUpload({ intent, onSelect, onSubmit }: UploadControlsProps) {
  const t = useT()
  const uploading = intent?.phase === "uploading"
  return <section className={styles.fileUpload}>
    <div className={styles.fileUploadControls}>
      <label className={styles.fileUploadLabel} htmlFor="library-personal-file">{t("library.uploadChoose")}</label>
      <Input
        id="library-personal-file"
        type="file"
        disabled={uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file !== null && file !== undefined) onSelect(file)
          event.currentTarget.value = ""
        }}
      />
      <Button
        type="button"
        disabled={intent === null || uploading || intent.phase === "clean" || intent.phase === "terminal"}
        onClick={onSubmit}
      >
        {intent?.phase === "recoverable" ? t("library.uploadRetry") : uploading ? t("library.uploading") : t("library.uploadSubmit")}
      </Button>
    </div>
    {intent !== null ? <p className={styles.fileUploadSelection}>{intent.file.name}</p> : null}
    <p className={styles.fileUploadHint}>{t("library.uploadHint")}</p>
    {intent?.phase === "clean" ? <p className={styles.fileUploadStatus} role="status">{t("library.uploadComplete")}</p> : null}
    {intent?.error !== null && intent?.error !== undefined ? <Alert variant="destructive" className={styles.fileUploadAlert}>
      <AlertDescription>{errorMessage(intent.error, t)}</AlertDescription>
    </Alert> : null}
  </section>
}
