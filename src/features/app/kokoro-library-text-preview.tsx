"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { AUTH_INDEX_SUBJECT_KEY, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"
import { TextPreviewBody } from "@/ui/thread/artifact-card"

import type { LibraryTextPreviewResult } from "./kokoro-library-preview-content"

export function LibraryTextPreview({ boundary, read, quietFailure = false }: {
  boundary: ProjectReadBoundary | undefined
  quietFailure?: boolean
  read: (signal: AbortSignal) => Promise<LibraryTextPreviewResult>
}) {
  const t = useT()
  const subject = boundary?.subject ?? null
  const generation = boundary?.generation
  const admitted = boundary?.admitted === true && subject !== null && subject.trim().length > 0 &&
    generation !== undefined && Number.isSafeInteger(generation) && generation >= 0
  const actor = JSON.stringify([subject, boundary?.tenant, generation, boundary?.authInvalidationHint])
  const [attempt, setAttempt] = useState(0)
  const scope = useMemo(() => ({ actor, admitted, read, attempt }), [actor, admitted, read, attempt])
  const [result, setResult] = useState<{
    scope: typeof scope
    value: LibraryTextPreviewResult | { kind: "failed" | "retired" }
  } | null>(null)
  const live = useRef<typeof scope | null>(null)
  const retiredActor = useRef<string | null>(null)

  useLayoutEffect(() => {
    live.current = scope
    return () => { if (live.current === scope) live.current = null }
  }, [scope])
  useEffect(() => {
    if (!admitted || subject === null) return
    const controller = new AbortController()
    const current = () => live.current === scope && !controller.signal.aborted
    const markerMatches = () => {
      try { return readBrowserAuthIndexSubject() === subject }
      catch { return false }
    }
    const retire = () => {
      retiredActor.current = actor
      controller.abort()
      if (live.current === scope) setResult({ scope, value: { kind: "retired" } })
    }
    const storage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== AUTH_INDEX_SUBJECT_KEY) return
      // Queued A→B→A events must retire A even when the marker already says A.
      if (event.key === null || event.oldValue !== event.newValue || !markerMatches()) retire()
    }
    window.addEventListener("storage", storage)
    window.addEventListener("pagehide", retire)
    window.addEventListener("kokoro:auth-invalidated", retire)
    void Promise.resolve().then(async () => {
      if (!current()) return
      if (retiredActor.current === actor || !markerMatches()) { retire(); return }
      const value = await read(controller.signal)
      if (!current()) return
      if (!markerMatches()) { retire(); return }
      setResult({ scope, value })
    }).catch(() => {
      if (!current()) return
      if (!markerMatches()) { retire(); return }
      setResult({ scope, value: { kind: "failed" } })
    })
    return () => {
      controller.abort()
      window.removeEventListener("storage", storage)
      window.removeEventListener("pagehide", retire)
      window.removeEventListener("kokoro:auth-invalidated", retire)
    }
  }, [scope, admitted, subject, actor, read])

  const visible = result?.scope === scope ? result.value : null
  if (!admitted) return <p className="sr-only" role="status">{t("artifact.cannotPreview")}</p>
  if (visible?.kind === "retired" || visible?.kind === "failed" && quietFailure)
    return <p className="sr-only" role="alert">{t("artifact.cannotPreview")}</p>
  if (visible?.kind === "unsupported") return <p>{t("artifact.cannotPreview")}</p>
  if (visible?.kind === "failed") return <div className="flex flex-wrap items-center gap-2">
    <p role="alert">{t("artifact.cannotPreview")}</p>
    <Button variant="outline" size="sm" type="button" onClick={() => setAttempt(value => value + 1)}>{t("artifact.retryPreview")}</Button>
  </div>
  if (visible?.kind === "text") return <section className="min-w-0 max-w-full overflow-x-auto" aria-label={t("canvas.previewTab")}>
    <TextPreviewBody text={visible.text} mime={visible.mimeType} resourcePolicy="text-only" />
  </section>
  return <div aria-busy="true"><p className="sr-only" role="status">{t("artifact.loadingPreview")}</p></div>
}
