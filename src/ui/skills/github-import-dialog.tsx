"use client"

import Image from "next/image"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { ArrowLeftRight, Check, LoaderCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { HubClientError, parseGithubRepository, type HubClient } from "@/hub/client"
import type { GithubImportResult } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"

import styles from "./skills-panel.module.css"

export { parseGithubRepository } from "@/hub/client"

type GithubImportState =
  | { kind: "input" }
  | { kind: "importing" }
  | { kind: "preview"; result: GithubImportResult }
  | { kind: "done"; result: GithubImportResult }
  | { kind: "unavailable" }

type GithubImportDialogProps = {
  client: HubClient
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: (result: GithubImportResult) => void
  /** Return focus to the live Create/Browse trigger after the portal closes. */
  returnFocusRef?: RefObject<HTMLElement | null>
}

type GithubErrorCopy = {
  invalid: string
  failed: string
  repositoryNotFound: string
  repositoryPrivate: string
  skillMissing: string
  packageTooLarge: string
  fileCountExceeded: string
  skillConflict: string
  quotaExceeded: string
  serviceUnavailable: string
}

function githubErrorMessage(error: unknown, copy: GithubErrorCopy): string {
  if (!(error instanceof HubClientError)) return copy.failed

  // Network failures have no HTTP status or backend code. Treat them as a
  // service outage in the UI so the recovery instruction is actionable
  // instead of looking like a malformed repository URL.
  if (error.reason === "network") {
    return copy.serviceUnavailable
  }

  switch (error.code?.toLowerCase()) {
    case "github.invalid_repository":
    case "github.invalid_repo":
    case "github.invalid_url":
    case "github.repository_invalid":
    case "github.repository_invalid_url":
    case "repository.invalid":
      return copy.invalid
    case "github.repository_not_found":
    case "github.repository-not-found":
    case "github_repo_not_found":
    case "github.repository_missing":
    case "github.not_found":
    case "repository.not_found":
      return copy.repositoryNotFound
    case "github.repository_private":
    case "github.private_repo":
    case "github.repository_access_denied":
    case "github_repo_private":
    case "github.private_repository":
    case "repository.private":
      return copy.repositoryPrivate
    case "github.skill_file_missing":
    case "github.skill_missing":
    case "github.missing_skill_md":
    case "github_skill_file_missing":
    case "github.missing_skill_file":
    case "skill.file_missing":
      return copy.skillMissing
    case "github.package_too_large":
    case "github.package-too-large":
    case "github_package_too_large":
    case "skill.package_too_large":
      return copy.packageTooLarge
    case "github.file_count_exceeded":
    case "github.too_many_files":
    case "github_file_count_exceeded":
    case "skill.file_count_exceeded":
      return copy.fileCountExceeded
    case "github.skill_conflict":
    case "github.duplicate_skill":
    case "github_skill_conflict":
    case "skill.conflict":
      return copy.skillConflict
    case "github.quota_exceeded":
    case "github.rate_limited":
    case "github_rate_limited":
    case "quota.exceeded":
      return copy.quotaExceeded
    case "hub_unreachable":
    case "hub.unreachable":
    case "github.timeout":
    case "hub.timeout":
      return copy.serviceUnavailable
    default:
      return error.status !== null && error.status >= 500 ? copy.serviceUnavailable : copy.failed
  }
}

function isAbortLike(error: unknown): boolean {
  return (error instanceof HubClientError && error.reason === "aborted")
    || (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
}

export function GithubImportDialog({ client, open, onOpenChange, onImported, returnFocusRef }: GithubImportDialogProps) {
  const t = useT()
  const copy = {
    description: t("skills.githubDescription"),
    repositoryLabel: t("skills.githubRepositoryLabel"),
    placeholder: t("skills.githubRepositoryPlaceholder"),
    import: t("skills.githubImport"),
    done: t("skills.githubDone"),
    invalid: t("skills.githubInvalid"),
    failed: t("skills.githubImportFailed"),
    imported: t("skills.githubImported"),
    previewOnly: t("skills.githubPreviewOnly"),
    unavailable: t("skills.githubUnavailable"),
    importing: t("skills.githubImporting"),
    repositoryNotFound: t("skills.githubRepositoryNotFound"),
    repositoryPrivate: t("skills.githubRepositoryPrivate"),
    skillMissing: t("skills.githubSkillMissing"),
    packageTooLarge: t("skills.githubPackageTooLarge"),
    fileCountExceeded: t("skills.githubFileCountExceeded"),
    skillConflict: t("skills.githubSkillConflict"),
    quotaExceeded: t("skills.githubQuotaExceeded"),
    serviceUnavailable: t("skills.githubServiceUnavailable"),
  }
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<GithubImportState>({ kind: "input" })
  const importAttemptRef = useRef(0)
  const submittingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  // Keep the latest controlled state available to the async completion path.
  // This closes the small window between a parent setting `open=false` and
  // Radix's effect-driven close lifecycle.
  const openRef = useRef(open)
  useLayoutEffect(() => {
    openRef.current = open
  }, [open])

  const cancelImport = useCallback(() => {
    importAttemptRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    submittingRef.current = false
  }, [])

  const resetDialogState = useCallback(() => {
    cancelImport()
    setValue("")
    setError(null)
    setState({ kind: "input" })
  }, [cancelImport])

  useEffect(() => () => {
    // The parent Settings surface can unmount this portal while an import is
    // in flight. Invalidate the attempt on unmount so a late response cannot
    // mutate a closed surface or trigger a stale pool refresh.
    cancelImport()
  }, [cancelImport])

  useEffect(() => {
    if (open) return

    // `open` can also be controlled by the parent (for example when the
    // surrounding Settings surface closes). Treat that transition exactly
    // like the close button for request cancellation: invalidate the request
    // before a late response can update the closed surface. The normal
    // SkillsContent path remounts this dialog on the next open and clears the
    // form state through handleOpenChange.
    let active = true
    queueMicrotask(() => {
      // Defer the controlled reset until after Radix has finished unmounting
      // its portal. This avoids a synchronous cascading render and also lets
      // a close→reopen in the same turn keep the newly opened form intact.
      if (active && !openRef.current) resetDialogState()
    })
    return () => { active = false }
  }, [open, resetDialogState])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Closing is also cancellation: do not let a late BFF response update a
      // dialog the user has already dismissed or trigger a stale refetch.
      resetDialogState()
    }
    onOpenChange(nextOpen)
  }

  const importSkill = async () => {
    if (submittingRef.current || state.kind !== "input") return
    const repository = parseGithubRepository(value)
    if (repository === null) {
      setError(copy.invalid)
      return
    }
    setError(null)
    if (!client.importGithub && !client.previewGithub) {
      setState({ kind: "unavailable" })
      return
    }
    submittingRef.current = true
    const attempt = ++importAttemptRef.current
    const controller = typeof AbortController === "undefined" ? null : new AbortController()
    abortControllerRef.current = controller
    setState({ kind: "importing" })
    try {
      // Manus keeps this surface as one compact submit flow. A preview-only
      // client is explicitly represented as preview: a read response is not
      // a persisted import and must never claim that the skill was saved.
      const result = client.importGithub
        ? await client.importGithub(repository.canonical, controller?.signal)
        : await client.previewGithub!(repository.canonical, controller?.signal)
      if (!openRef.current || attempt !== importAttemptRef.current) return
      setState({ kind: client.importGithub ? "done" : client.previewGithub ? "preview" : "done", result })
      if (client.importGithub) onImported?.(result)
    } catch (caught) {
      if (!openRef.current || attempt !== importAttemptRef.current) return
      if (isAbortLike(caught)) {
        setState({ kind: "input" })
        return
      }
      setState({ kind: "input" })
      setError(githubErrorMessage(caught, copy))
    } finally {
      if (attempt === importAttemptRef.current) {
        submittingRef.current = false
        abortControllerRef.current = null
      }
    }
  }

  const isImporting = state.kind === "importing"
  // Keep the repository field mounted while the request is running. The
  // loading state should communicate progress without making the dialog jump
  // or hiding the exact input that is being processed.
  const isInput = state.kind === "input" || isImporting

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={styles.githubDialog}
        overlayClassName={styles.dialogOverlay}
        closeLabel={t("skills.githubClose")}
        data-testid="github-import-dialog"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target || !target.isConnected || target.hasAttribute("disabled")) return
          event.preventDefault()
          window.requestAnimationFrame(() => target.focus({ preventScroll: true }))
        }}
      >
        <DialogHeader className={styles.githubHeader}>
          <div className={styles.githubBrandFlow} aria-hidden="true">
            <span className={styles.githubBrandIcon}><Image src="/assets/connectors/github.webp" alt="" width={20} height={20} /></span>
            <ArrowLeftRight className={styles.githubTransferIcon} />
            <span className={styles.githubBrandIcon}><BrandFallback className={styles.githubKokoroIcon} /></span>
          </div>
          <DialogTitle>{t("skills.importGithub")}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className={styles.githubBody}>
          {isInput ? (
            <div className={styles.githubForm} data-invalid={error !== null || undefined}>
              <label className={styles.githubLabel} htmlFor="github-repository-url">{copy.repositoryLabel}</label>
              <Input
                id="github-repository-url"
                data-testid="github-repository-input"
                value={value}
                placeholder={copy.placeholder}
                disabled={isImporting}
                aria-busy={isImporting}
                aria-invalid={error !== null}
                aria-describedby={`github-repository-help${error !== null ? " github-repository-error" : ""}`}
                autoComplete="url"
                onChange={(event) => {
                  setValue(event.target.value)
                  if (error !== null) setError(null)
                }}
                onBlur={() => {
                  if (value.trim() !== "" && parseGithubRepository(value) === null) setError(copy.invalid)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    if (parseGithubRepository(value) === null) {
                      setError(copy.invalid)
                    } else {
                      void importSkill()
                    }
                  }
                }}
              />
              {isImporting ? <span className="sr-only" role="status" aria-live="polite" data-testid="github-import-status">{copy.importing}</span> : null}
              <p id="github-repository-help" className="sr-only">{copy.description}</p>
              {error ? (
                <Alert id="github-repository-error" variant="destructive" className={styles.githubError}>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {state.kind === "unavailable" ? (
            <Alert variant="destructive" className={styles.githubError} data-testid="github-import-unavailable" role="status">
              <AlertDescription>{copy.unavailable}</AlertDescription>
            </Alert>
          ) : null}

          {state.kind === "done" || state.kind === "preview" ? (
            <div className={styles.githubResult} data-testid="github-import-complete" role="status" aria-live="polite">
              <p className={styles.githubSuccess}>
                <Check aria-hidden="true" />
                {state.kind === "preview" ? copy.previewOnly : copy.imported}
              </p>
              <p className={styles.githubResultMeta}>
                <span>{state.result.skill.name}</span>
                <span aria-hidden="true">·</span>
                <span>{state.result.default_branch}</span>
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className={styles.githubFooter}>
          {state.kind === "done" || state.kind === "preview" || state.kind === "unavailable" ? (
            <Button type="button" onClick={() => handleOpenChange(false)} data-testid="github-import-done">
              {copy.done}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={parseGithubRepository(value) === null || isImporting}
              aria-busy={isImporting}
              onClick={() => void importSkill()}
              data-testid="github-import-submit"
            >
              {isImporting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {copy.import}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
