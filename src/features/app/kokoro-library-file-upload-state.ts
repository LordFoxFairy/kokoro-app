import { useCallback, useEffect, useRef, useState } from "react"

import { LibraryFileUploadError, uploadLibraryFile } from "./kokoro-library-file-upload-client"

type UploadPhase = "selected" | "uploading" | "recoverable" | "terminal" | "clean"
export type LibraryUploadIntent = { file: File; key: string; phase: UploadPhase; error: string | null }

/** Owned by the Library page, not the unmounted Files tab. */
export function useLibraryFileUpload() {
  const [intent, setIntent] = useState<LibraryUploadIntent | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const intentRef = useRef<LibraryUploadIntent | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    const controller = controllerRef.current
    controllerRef.current = null
    controller?.abort()
  }, [])

  const select = useCallback((file: File) => {
    if (controllerRef.current !== null) return
    const next: LibraryUploadIntent = {
      file,
      key: `library-file:${crypto.randomUUID()}`,
      phase: "selected",
      error: null,
    }
    intentRef.current = next
    setIntent(next)
  }, [])

  const cancel = useCallback(() => {
    const current = intentRef.current
    if (current?.phase === "selected") {
      intentRef.current = null
      setIntent(null)
      return
    }
    const controller = controllerRef.current
    if (current?.phase !== "uploading" || controller === null) return
    // Cancellation stops waiting, not the owner command. Retain the original
    // File/key and retire this request before an abort or late ACK can settle.
    controllerRef.current = null
    const unknown = { ...current, phase: "recoverable" as const, error: "upload_cancelled_unknown" }
    intentRef.current = unknown
    setIntent(unknown)
    controller.abort()
  }, [])

  const submit = useCallback(async () => {
    const current = intentRef.current
    if (controllerRef.current !== null || (current?.phase !== "selected" && current?.phase !== "recoverable")) return
    const controller = new AbortController()
    controllerRef.current = controller
    const uploading = { ...current, phase: "uploading" as const, error: null }
    intentRef.current = uploading
    setIntent(uploading)
    try {
      await uploadLibraryFile(current.file, current.key, controller.signal)
      if (controllerRef.current !== controller) return
      const clean = { ...current, phase: "clean" as const, error: null }
      intentRef.current = clean
      setIntent(clean)
      setRefreshRevision((revision) => revision + 1)
    } catch (error) {
      if (controllerRef.current !== controller) return
      const known = error instanceof LibraryFileUploadError ? error : new LibraryFileUploadError("upload_network_error", true)
      const failed = { ...current, phase: known.retryable ? "recoverable" as const : "terminal" as const, error: known.code }
      intentRef.current = failed
      setIntent(failed)
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])

  return { intent, select, submit, cancel, refreshRevision }
}
