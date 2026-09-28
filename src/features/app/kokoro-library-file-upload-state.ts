import { useCallback, useEffect, useRef, useState } from "react"

import { LibraryFileUploadError, uploadLibraryFile } from "./kokoro-library-file-upload-client"

type UploadPhase = "selected" | "uploading" | "recoverable" | "terminal" | "clean"
export type LibraryUploadIntent = { file: File; key: string; phase: UploadPhase; error: string | null }

/** Owned by the Library page, not the unmounted Files tab. */
export function useLibraryFileUpload() {
  const [intent, setIntent] = useState<LibraryUploadIntent | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const intentRef = useRef<LibraryUploadIntent | null>(null)
  const running = useRef(false)
  const epoch = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    epoch.current++
    controllerRef.current?.abort()
  }, [])

  const select = useCallback((file: File) => {
    if (running.current) return
    const next: LibraryUploadIntent = {
      file,
      key: `library-file:${crypto.randomUUID()}`,
      phase: "selected",
      error: null,
    }
    intentRef.current = next
    setIntent(next)
  }, [])

  const submit = useCallback(async () => {
    const current = intentRef.current
    if (current === null || running.current || current.phase === "terminal" || current.phase === "clean") return
    running.current = true
    const id = ++epoch.current
    const controller = new AbortController()
    controllerRef.current = controller
    const uploading = { ...current, phase: "uploading" as const, error: null }
    intentRef.current = uploading
    setIntent(uploading)
    try {
      await uploadLibraryFile(current.file, current.key, controller.signal)
      if (id !== epoch.current || controller.signal.aborted) return
      const clean = { ...current, phase: "clean" as const, error: null }
      intentRef.current = clean
      setIntent(clean)
      setRefreshRevision((revision) => revision + 1)
    } catch (error) {
      if (id !== epoch.current || controller.signal.aborted) return
      const known = error instanceof LibraryFileUploadError ? error : new LibraryFileUploadError("upload_network_error", true)
      const failed = { ...current, phase: known.retryable ? "recoverable" as const : "terminal" as const, error: known.code }
      intentRef.current = failed
      setIntent(failed)
    } finally {
      running.current = false
      if (id === epoch.current) controllerRef.current = null
    }
  }, [])

  return { intent, select, submit, refreshRevision }
}
