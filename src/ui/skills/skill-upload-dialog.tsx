"use client"

import { useCallback, useEffect, useRef, useState, type DragEvent, type RefObject } from "react"
import { ExternalLink, FileArchive, LoaderCircle, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { HubClient } from "@/hub/client"
import type { UploadCandidate } from "@/hub/schemas"
import { useT } from "@/i18n/context"

import styles from "./skill-upload-dialog.module.css"

type UploadState =
  | { kind: "idle" }
  | { kind: "previewing" }
  | { kind: "error" }
  | { kind: "preview"; namespace: string; candidates: UploadCandidate[]; selected: Set<string> }
  | { kind: "confirming"; namespace: string; candidates: UploadCandidate[]; selected: Set<string> }
  | { kind: "done"; results: { name: string; status: string; error: string | null }[] }

type SkillUploadDialogProps = {
  client: HubClient
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublished?: () => void
  /** Return focus to the Create trigger after this portal closes. */
  returnFocusRef?: RefObject<HTMLElement | null>
}

const ARCHIVE_ACCEPT = ".zip,.skill,application/zip,application/octet-stream"

function isArchive(file: File): boolean {
  // The browser's MIME value is optional and `application/octet-stream` is
  // intentionally broad: accepting it on its own would let arbitrary binary
  // files enter the preview endpoint. The extension is the stable user-facing
  // contract for both drag/drop and the file picker.
  return /\.(zip|skill)$/i.test(file.name)
}

/**
 * Manus-style skill upload surface: the first step is a calm dropzone dialog,
 * while validation and publication remain in the same portal after a file is
 * selected. Keeping the whole flow here prevents the Settings page from
 * turning into a second inline navigation system.
 */
export function SkillUploadDialog({ client, open, onOpenChange, onPublished, returnFocusRef }: SkillUploadDialogProps) {
  const t = useT()
  const [state, setState] = useState<UploadState>({ kind: "idle" })
  const [dragging, setDragging] = useState(false)
  const zipRef = useRef<Blob | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const attemptRef = useRef(0)
  const confirmingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancelRequest = useCallback(() => {
    attemptRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    confirmingRef.current = false
  }, [])

  const reset = useCallback(() => {
    cancelRequest()
    zipRef.current = null
    setDragging(false)
    setState({ kind: "idle" })
  }, [cancelRequest])

  useEffect(() => () => cancelRequest(), [cancelRequest])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const pickFile = useCallback(async (file: File) => {
    if (!isArchive(file)) {
      setState({ kind: "error" })
      return
    }
    const attempt = ++attemptRef.current
    const controller = typeof AbortController === "undefined" ? null : new AbortController()
    abortControllerRef.current = controller
    zipRef.current = file
    setState({ kind: "previewing" })
    try {
      const preview = await client.previewUpload(file, controller?.signal)
      if (attempt !== attemptRef.current) return
      const selected = new Set(preview.candidates.filter((candidate) => candidate.valid).map((candidate) => candidate.name))
      setState({ kind: "preview", namespace: preview.namespace, candidates: preview.candidates, selected })
    } catch {
      if (attempt === attemptRef.current) setState({ kind: "error" })
    } finally {
      if (attempt === attemptRef.current) abortControllerRef.current = null
    }
  }, [client])

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void pickFile(file)
  }

  const confirm = useCallback(async () => {
    if (confirmingRef.current || state.kind !== "preview" || zipRef.current === null || state.selected.size === 0) return
    confirmingRef.current = true
    const attempt = ++attemptRef.current
    const controller = typeof AbortController === "undefined" ? null : new AbortController()
    abortControllerRef.current = controller
    const names = [...state.selected]
    setState({ ...state, kind: "confirming" })
    try {
      const result = await client.confirmUpload(zipRef.current, names, controller?.signal)
      if (attempt !== attemptRef.current) return
      setState({ kind: "done", results: result.results.map((item) => ({ name: item.name, status: item.status, error: item.error })) })
      onPublished?.()
    } catch {
      if (attempt === attemptRef.current) setState({ kind: "error" })
    } finally {
      if (attempt === attemptRef.current) {
        confirmingRef.current = false
        abortControllerRef.current = null
      }
    }
  }, [client, onPublished, state])

  const isInitial = state.kind === "idle" || state.kind === "error"
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={styles.dialog}
        overlayClassName={styles.dialogOverlay}
        closeLabel={t("skills.uploadClose")}
        data-testid="skill-upload-dialog"
        data-state-kind={state.kind}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target || !target.isConnected || target.hasAttribute("disabled")) return
          event.preventDefault()
          window.requestAnimationFrame(() => target.focus({ preventScroll: true }))
        }}
      >
        <DialogHeader className={styles.header}>
          <DialogTitle>{t("skills.uploadTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("skills.uploadHint")}</DialogDescription>
        </DialogHeader>

        {isInitial ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ARCHIVE_ACCEPT}
              className={styles.input}
              data-testid="skill-upload-input"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.currentTarget.value = ""
                if (file) void pickFile(file)
              }}
            />
            <Button
              type="button"
              variant="ghost"
              className={styles.dropzone}
              data-dragging={dragging || undefined}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={(event) => {
                event.preventDefault()
                if (event.currentTarget === event.target) setDragging(false)
              }}
              onDrop={onDrop}
            >
              <FileArchive aria-hidden="true" />
              <span>{t("skills.uploadDrop")}</span>
            </Button>
            {state.kind === "error" ? (
              <Alert variant="destructive" className={styles.error} role="alert">
                <AlertDescription>{t("skills.uploadError")}</AlertDescription>
              </Alert>
            ) : null}
            <section className={styles.requirements} aria-labelledby="skill-upload-requirements">
              <h3 id="skill-upload-requirements">{t("skills.uploadRequirements")}</h3>
              <ul>
                <li>{t("skills.uploadRequirementZip")}</li>
                <li>{t("skills.uploadRequirementYaml")}</li>
              </ul>
              <p className={styles.learn}>
                <ExternalLink aria-hidden="true" />
                <a href="https://agentskills.io/what-are-skills" target="_blank" rel="noreferrer">{t("skills.uploadLearn")}</a>
                <span aria-hidden="true">{t("skills.uploadOr")}</span>
                <a href="https://agentskills.io/" target="_blank" rel="noreferrer">{t("skills.uploadExample")}</a>
              </p>
            </section>
          </>
        ) : null}

        {state.kind === "previewing" ? (
          <div className={styles.progress} role="status" aria-live="polite">
            <Spinner aria-hidden="true" />
            <span>{t("skills.uploadPreviewing")}</span>
          </div>
        ) : null}

        {state.kind === "preview" || state.kind === "confirming" ? (
          <div className={styles.preview}>
            <p className={styles.previewHint}>{t("skills.uploadChooseCandidates", { namespace: state.namespace })}</p>
            {state.candidates.length === 0 ? (
              <Empty className={styles.emptyState} data-testid="skill-upload-empty">
                <EmptyHeader>
                  <EmptyTitle>{t("skills.noMatch")}</EmptyTitle>
                  <EmptyDescription>{t("skills.uploadChooseCandidates", { namespace: state.namespace })}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className={styles.candidates} role="group" aria-label={t("skills.uploadChoose")}>
                {state.candidates.map((candidate) => {
                  const errors = candidate.errors ?? []
                  const candidateId = encodeURIComponent(candidate.name)
                  return (
                    <Field
                      key={candidate.name}
                      orientation="horizontal"
                      className={styles.candidate}
                      data-valid={candidate.valid}
                      data-invalid={!candidate.valid ? "true" : undefined}
                    >
                      <Checkbox
                        id={`skill-upload-dialog-${candidateId}`}
                        checked={state.selected.has(candidate.name)}
                        disabled={!candidate.valid || state.kind === "confirming"}
                        aria-invalid={!candidate.valid}
                        onCheckedChange={(checked) => {
                          setState((current) => {
                            if (current.kind !== "preview") return current
                            const selected = new Set(current.selected)
                            if (checked === true) selected.add(candidate.name)
                            else selected.delete(candidate.name)
                            return { ...current, selected }
                          })
                        }}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`skill-upload-dialog-${candidateId}`}>{candidate.name}</FieldLabel>
                        <FieldDescription>
                          {candidate.valid ? t("skills.candidateValid") : t("skills.candidateInvalid")}
                          {candidate.conflicts.namespace ? ` · ${t("skills.conflictNamespace")}` : ""}
                          {candidate.conflicts.official ? ` · ${t("skills.conflictOfficial")}` : ""}
                        </FieldDescription>
                        {errors.length > 0 ? <ul className={styles.candidateErrors}>{errors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul> : null}
                      </FieldContent>
                    </Field>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}

        {state.kind === "done" ? (
          <div className={styles.done} role="status" aria-live="polite">
            <Upload aria-hidden="true" />
            <strong>{t("skills.uploadComplete")}</strong>
            <ul>
              {state.results.map((result) => <li key={result.name}>{result.name} · {t(statusKey(result.status))}{result.error ? ` · ${result.error}` : ""}</li>)}
            </ul>
          </div>
        ) : null}

        {state.kind === "preview" || state.kind === "confirming" ? (
          <DialogFooter className={styles.footer}>
            <Button type="button" disabled={state.kind === "confirming" || state.selected.size === 0} aria-busy={state.kind === "confirming"} onClick={() => void confirm()}>
              {state.kind === "confirming" ? <><LoaderCircle className="animate-spin" aria-hidden="true" />{t("skills.publishing")}</> : t("skills.publish")}
            </Button>
          </DialogFooter>
        ) : state.kind === "done" ? (
          <DialogFooter className={styles.footer}>
            <Button type="button" onClick={() => handleOpenChange(false)}>{t("skills.uploadDone")}</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function statusKey(status: string): "skills.statusPublished" | "skills.statusUnchanged" | "skills.statusFailed" {
  if (status === "published") return "skills.statusPublished"
  if (status === "unchanged") return "skills.statusUnchanged"
  return "skills.statusFailed"
}
