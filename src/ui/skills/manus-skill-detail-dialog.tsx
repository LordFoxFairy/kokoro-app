"use client"

import Image from "next/image"
import { ChevronRight, Download, FileText, Menu, Plus, Share } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocale } from "@/i18n/context"
import type { SkillCatalogCard, CatalogPackageData, PersonalInstallation } from "@/hub/schemas"
import { downloadManusSkill, getManusSkillDetail, getManusSkillPackage, type ManusSkillDetail } from "@/ui/skills/manus-skill-client"

import { createSkillInstallationClient, HubClientError } from "@/hub/client"
import { inspectInstallationPackage, downloadInstallationPackage } from "@/hub/skill-installation-content"
import { createSkillShareClient } from "@/hub/skill-share-client"
import type { ShareAck, ShareSummary } from "@/hub/skill-share.schema"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { ownerCoverPath } from "@/ui/skills/manus-skill-client"

import { skillTrialSourceRef } from "./skills-card-model"
import { SkillTrialExamples } from "./skill-trial-examples"

import styles from "./manus-skill-detail-dialog.module.css"
import { SkillPackageDocument } from "./skill-package-document"
import { SkillPackageFiles } from "./skill-package-files"

type DetailFlight = {
  controller: AbortController
  promise: Promise<ManusSkillDetail>
  subscribers: number
}

type DetailSubscription = {
  promise: Promise<ManusSkillDetail>
  release: () => void
}

// React StrictMode replays the dialog effect during local development. Detail
// reads are immutable for a selected series, so both mounts share one owner
// request; the last release aborts only after the replay window has elapsed.
const detailInflight = new Map<string, DetailFlight>()
const detailCache = new Map<string, ManusSkillDetail>()
const fetchScopeIds = new WeakMap<typeof globalThis.fetch, number>()
let nextFetchScopeId = 1

function currentFetchScope(): number {
  const fetcher = globalThis.fetch
  let id = fetchScopeIds.get(fetcher)
  if (id === undefined) {
    id = nextFetchScopeId
    nextFetchScopeId += 1
    fetchScopeIds.set(fetcher, id)
  }
  return id
}

function rememberDetail(key: string, detail: ManusSkillDetail): void {
  // The directory revision is part of the key. A later publication therefore
  // naturally reads a fresh detail record, while closing and reopening the
  // same card keeps the already-confirmed panel in place instead of flashing
  // a second loading state.
  detailCache.delete(key)
  detailCache.set(key, detail)
  if (detailCache.size > 48) detailCache.delete(detailCache.keys().next().value!)
}

function subscribeSkillDetail(cacheKey: string, skillId: string): DetailSubscription {
  const cached = detailCache.get(cacheKey)
  if (cached !== undefined) return { promise: Promise.resolve(cached), release: () => undefined }

  let flight = detailInflight.get(cacheKey)
  if (flight === undefined) {
    const controller = new AbortController()
    const promise = getManusSkillDetail(skillId, controller.signal).then((detail) => {
      rememberDetail(cacheKey, detail)
      return detail
    })
    flight = { controller, promise, subscribers: 0 }
    detailInflight.set(cacheKey, flight)
    const clear = (): void => {
      if (detailInflight.get(cacheKey) === flight) detailInflight.delete(cacheKey)
    }
    void promise.then(clear, clear)
  }

  flight.subscribers += 1
  let released = false
  return {
    promise: flight.promise,
    release: () => {
      if (released) return
      released = true
      flight.subscribers -= 1
      if (flight.subscribers !== 0) return
      queueMicrotask(() => {
        if (flight?.subscribers !== 0 || detailInflight.get(cacheKey) !== flight) return
        detailInflight.delete(cacheKey)
        flight.controller.abort()
      })
    },
  }
}

type Props = {
  detailSource?: "catalog" | "installation"
  readBoundary: ProjectReadBoundary
  preview?: boolean
  pending?: boolean
  pendingFailed?: boolean
  pendingBusy?: boolean
  onLoadMore?: () => void
  onRetryPending?: (() => void) | undefined
  sharedSummary?: ShareSummary
  onAddShared?: () => void
  installationNotice?: string | undefined
  onRetryInstallation?: (() => void) | undefined
  skill: SkillCatalogCard | null
  open: boolean
  busy?: boolean
  installationState?: Readonly<{ installed: boolean; enabled: boolean }>
  actionFailed?: boolean
  publisherLabel?: string
  categoryLabels?: readonly string[]
  onOpenChange: (open: boolean) => void
  onAdd: (skill: SkillCatalogCard) => void
  onTry: (prompt: string, selection: SkillCatalogCard) => boolean
  returnFocusRef?: RefObject<HTMLElement | null>
}

type DetailToolbarProps = {
  readerOpen: boolean
  canShare: boolean
  canDownload: boolean
  shareDisabled: boolean
  downloadDisabled: boolean
  onShare: () => void
  onDownload: () => void
  shareLabel: string
  downloadLabel: string
}

/**
 * The summary and package reader are two views of one selected revision.
 * Keep their utility actions in one typed component so entering the reader
 * cannot make the real share/download capability disappear from the header.
 */
function DetailToolbar({ readerOpen, canShare, canDownload, shareDisabled, downloadDisabled, onShare, onDownload, shareLabel, downloadLabel }: DetailToolbarProps) {
  if (!canShare && !canDownload) return null
  return (
    <div className={readerOpen ? styles.readerTopActions : styles.topActions}>
      {canShare ? <Button type="button" variant="ghost" size="icon-sm" aria-label={shareLabel} disabled={shareDisabled} onClick={onShare}><Share aria-hidden="true" /></Button> : null}
      {canDownload ? <Button type="button" variant="ghost" size="icon-sm" className={styles.iconLink} aria-label={downloadLabel} disabled={downloadDisabled} onClick={onDownload}><Download aria-hidden="true" /></Button> : null}
    </div>
  )
}

function displayDate(value: string | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date)
}

/** A stable, server-backed catalog detail dialog. It never synthesizes prompts,
 * source state or package identifiers in the browser. Package text comes only
 * from the admitted published-revision inspection boundary. */
export function ManusSkillDetailDialog({ detailSource = "catalog", preview = false, pending = false, pendingFailed = false, pendingBusy = false, onLoadMore, onRetryPending, readBoundary: boundary, skill, open, busy = false, installationState, actionFailed = false, publisherLabel, categoryLabels = [], onOpenChange, onAdd, onTry, returnFocusRef, sharedSummary, onAddShared, installationNotice, onRetryInstallation }: Props) {
  const { locale, t } = useLocale()
  const shareIntents = useRef(new Map<string, { identity: string; ack: ShareAck | null; unknown: boolean; pending: boolean; controller: AbortController | null }>())
  type ShareState = "pending" | "copied" | "copyFailed" | "failed" | "unknown"
  const [shareStates, setShareStates] = useState<Record<string, ShareState>>({})
  const [unknownShares, setUnknownShares] = useState<Record<string, boolean>>({})
  const [shareSubject, setShareSubject] = useState(boundary.subject)
  if (shareSubject !== boundary.subject) { setShareSubject(boundary.subject); setShareStates({}); setUnknownShares({}) }
  useLayoutEffect(() => {
    const intents = shareIntents.current
    return () => { for (const intent of intents.values()) intent.controller?.abort(); intents.clear() }
  }, [boundary.subject])

  const [installation, setInstallation] = useState<PersonalInstallation | null>(null)
  const [detail, setDetail] = useState<ManusSkillDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadFailure, setDownloadFailure] = useState<"unavailable" | "incomplete" | null>(null)
  const downloadRequest = useRef<AbortController | null>(null)
  const [readerOpen, setReaderOpen] = useState(false)
  const [directory, setDirectory] = useState<CatalogPackageData | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [readerFile, setReaderFile] = useState<CatalogPackageData["selected_file"]>(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerFailed, setReaderFailed] = useState(false)
  const [readerAttempt, setReaderAttempt] = useState(0)
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set())
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false)
  const mobileFilesToggleRef = useRef<HTMLButtonElement | null>(null)
  const resourceIdentity = !open ? null : sharedSummary ? JSON.stringify(["shared", boundary.subject, sharedSummary.share_id, sharedSummary.source_ref]) : skill?.skill_id ? JSON.stringify([detailSource, skill.skill_id, skill.revision_skill_id, detailSource === "installation" ? skill.installation_id : null]) : null
  // The mounted parent is keyed by its exact selected locator. A pending
  // projection may remove all private facts without changing that selection.
  const [viewTarget, setViewTarget] = useState({ subject: boundary.subject, resource: resourceIdentity })
  const nextViewTarget = !open || boundary.subject === null
    ? { subject: null, resource: null }
    : { subject: boundary.subject, resource: resourceIdentity ?? (pending && viewTarget.subject === boundary.subject ? viewTarget.resource : null) }
  const readerCursor = useRef<{ path: string | null; scrollTop: number }>({ path: null, scrollTop: 0 })
  const readerContentRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => { readerCursor.current = { path: null, scrollTop: 0 } }, [viewTarget])
  if (viewTarget.subject !== nextViewTarget.subject || viewTarget.resource !== nextViewTarget.resource) {
    setViewTarget(nextViewTarget)
    setReaderOpen(false)
    setExpandedFolders(new Set())
    setMobileFilesOpen(false)
  }
  const identity = resourceIdentity === null ? null : JSON.stringify([resourceIdentity, boundary.admitted, boundary.subject, boundary.generation])
  const token = useMemo(() => ({ identity }), [identity])
  const liveToken = useRef<object | null>(null)
  useLayoutEffect(() => { liveToken.current = token; return () => { if (liveToken.current === token) liveToken.current = null } }, [token])
  const isLive = useCallback(() => identity !== null && boundary.admitted && boundary.subject !== null && liveToken.current === token, [boundary.admitted, boundary.subject, identity, token])
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [detailHeight, setDetailHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!pending) { const height = dialogRef.current?.getBoundingClientRect().height; if (height) setDetailHeight(height) }
  }, [pending, identity, detail, readerOpen, directory, readerFile])
  const [currentIdentity, setCurrentIdentity] = useState(identity)
  const downloadIdentity = sharedSummary ? JSON.stringify([identity, boundary.admitted]) : identity
  const [currentDownloadIdentity, setCurrentDownloadIdentity] = useState(downloadIdentity)
  if (currentDownloadIdentity !== downloadIdentity) {
    setCurrentDownloadIdentity(downloadIdentity)
    setDownloading(false)
  }

  // A download is private to the open resource and its current admission. Do
  // not allow a close, skill switch, or lost admission to leave it in flight.
  useEffect(() => () => {
    downloadRequest.current?.abort()
    downloadRequest.current = null
  }, [downloadIdentity])

  // Every admission generation retires private facts and in-flight reads.
  // Reader location is presentation intent, owned by viewTarget above.
  if (currentIdentity !== identity) {
    setCurrentIdentity(identity)
    setDetail(null)
    setInstallation(null)
    setFailed(false)
    setDownloading(false)
    setDownloadFailure(null)
    setDirectory(null)
    setSelectedPath(null)
    setReaderFile(null)
    setReaderLoading(readerOpen)
    setReaderFailed(false)
    setMobileFilesOpen(false)
  }

  const sharedDownloadAdmitted = sharedSummary ? boundary.admitted : true
  const sharedDownloadSubject = sharedSummary ? boundary.subject : null
  useEffect(() => {
    if (!open || !boundary.admitted || boundary.subject === null || !skill?.skill_id && !sharedSummary) return
    if (sharedSummary || detailSource === "installation" || !skill?.skill_id) return
    let active = true
    const cacheKey = JSON.stringify([currentFetchScope(), boundary.subject ?? "anonymous", boundary.generation, skill.skill_id, skill.revision_skill_id ?? null])
    const subscription = subscribeSkillDetail(cacheKey, skill.skill_id)
    void subscription.promise.then((next) => {
      if (active && isLive()) setDetail(next)
    }).catch(() => {
      if (active && isLive()) setFailed(true)
    })
    return () => {
      active = false
      subscription.release()
    }
  }, [open, detailSource, skill?.skill_id, skill?.revision_skill_id, sharedSummary, sharedDownloadAdmitted, sharedDownloadSubject, boundary.subject, boundary.admitted, boundary.generation, isLive])

  const installationId = skill?.installation_id
  const installationSeries = skill?.skill_id
  const installationSource = skill?.source_ref
  const installationRevision = skill?.revision_skill_id
  useEffect(() => {
    if (detailSource !== "installation" || sharedSummary || !open || !boundary.admitted || boundary.subject === null) return
    const controller = new AbortController()
    const load = async () => {
      if (!installationId || !installationRevision || installationSource !== `skill:${installationRevision}`) throw new Error("skill_response_invalid")
      const value = await createSkillInstallationClient().get(installationId, controller.signal)
      if (controller.signal.aborted || !isLive()) return
      if (!value.installed || value.series_id !== installationSeries || value.source_ref !== installationSource) throw new Error("skill_response_invalid")
      setInstallation(value)
    }
    void load().catch(() => { if (!controller.signal.aborted && isLive()) setFailed(true) })
    return () => controller.abort()
  }, [detailSource, sharedSummary, open, boundary.admitted, boundary.subject, installationId, installationSeries, installationSource, installationRevision, isLive])

  const boundRevision = !open || !boundary.admitted || boundary.subject === null ? null
    : sharedSummary ? sharedSummary.skill.skill_id
    : detailSource === "installation" ? installation?.source_ref.slice(6) ?? null
    : skill?.revision_skill_id !== undefined && detail?.skill.id === skill.skill_id && detail?.skill.version === skill.revision_skill_id ? skill.revision_skill_id : null

  const sharedRevision = sharedSummary?.skill.revision

  useEffect(() => {
    if (!readerOpen || boundRevision === null) return
    const controller = new AbortController()
    void (installation ? inspectInstallationPackage(installation, undefined, controller.signal) : getManusSkillPackage(boundRevision, undefined, controller.signal)).then((value) => {
      if (controller.signal.aborted || !isLive()) return
      if (sharedRevision !== undefined && value.revision !== sharedRevision) throw new Error("skill_response_invalid")
      setDirectory(value)
      const path = readerCursor.current.path !== null && value.files.some(file => file.path === readerCursor.current.path)
        ? readerCursor.current.path : value.files.some(file => file.path === "SKILL.md") ? "SKILL.md" : null
      if (readerCursor.current.path !== path) readerCursor.current.scrollTop = 0
      readerCursor.current.path = path
      setSelectedPath(path)
      setReaderLoading(path !== null)
    }).catch(() => {
      if (!controller.signal.aborted && isLive()) { setReaderFailed(true); setReaderLoading(false) }
    })
    return () => controller.abort()
  }, [readerOpen, boundRevision, installation, readerAttempt, sharedRevision, isLive, readerCursor])

  useEffect(() => {
    if (!readerOpen || boundRevision === null || directory === null || selectedPath === null) return
    const controller = new AbortController()
    void (installation ? inspectInstallationPackage(installation, selectedPath, controller.signal, directory) : getManusSkillPackage(boundRevision, selectedPath, controller.signal, directory)).then((value) => {
      if (controller.signal.aborted || !isLive()) return
      setReaderFile(value.selected_file)
      setReaderLoading(false)
    }).catch(() => {
      if (!controller.signal.aborted && isLive()) { setReaderFailed(true); setReaderLoading(false) }
    })
    return () => controller.abort()
  }, [readerOpen, boundRevision, installation, directory, selectedPath, isLive])

  useLayoutEffect(() => {
    if (!readerLoading && readerFile !== null && readerFile.path === selectedPath && isLive() && readerContentRef.current) {
      readerContentRef.current.scrollTop = readerCursor.current.scrollTop
    }
  }, [readerLoading, readerFile, selectedPath, isLive])

  const restartReader = (resetPosition: boolean) => {
    if (boundRevision === null || !isLive()) return
    setReaderOpen(true)
    if (resetPosition) { readerCursor.current = { path: null, scrollTop: 0 }; setExpandedFolders(new Set()) }
    setDirectory(null)
    setSelectedPath(null)
    setReaderFile(null)
    setReaderLoading(true)
    setReaderFailed(false)
    setMobileFilesOpen(false)
    setReaderAttempt((attempt) => attempt + 1)
  }
  const selectFile = (path: string) => {
    if (!isLive()) return
    setMobileFilesOpen(false)
    if (mobileFilesOpen) mobileFilesToggleRef.current?.focus()
    if (path === selectedPath) return
    readerCursor.current = { path, scrollTop: 0 }
    setSelectedPath(path)
    setReaderFile(null)
    setReaderFailed(false)
    setReaderLoading(true)
  }

  const download = async () => {
    if (!isLive() || (!skill?.skill_id && !sharedSummary) || downloading) return
    const controller = new AbortController()
    downloadRequest.current?.abort()
    downloadRequest.current = controller
    setDownloading(true)
    setDownloadFailure(null)
    try {
      if (sharedSummary) {
        const result = await createSkillShareClient().download(sharedSummary.share_id, sharedSummary.source_ref, sharedSummary.skill.revision, controller.signal)
        if (!controller.signal.aborted && isLive()) window.location.assign(`/api${result.download_info.download_url}`)
      } else if (detailSource === "installation") {
        if (!installation) return
        const result = await downloadInstallationPackage(installation, controller.signal)
        if (!controller.signal.aborted && isLive()) window.location.assign(`/api${result.download_info.download_url}`)
      } else if (skill?.skill_id) {
        const result = await downloadManusSkill(skill.skill_id, controller.signal)
        if (!controller.signal.aborted && isLive()) window.location.assign(result.downloadInfo.downloadUrl)
      }
    } catch (error) {
      if (!controller.signal.aborted && isLive()) {
        const unavailable = error instanceof HubClientError && error.reason === "http" && error.retryable === false
          && (error.status === 403 && error.code === "skill_download_forbidden" || error.status === 404 && error.code === "skill_not_found")
        setDownloadFailure(unavailable ? "unavailable" : "incomplete")
      }
    } finally {
      if (downloadRequest.current === controller) downloadRequest.current = null
      if (!controller.signal.aborted && isLive()) setDownloading(false)
    }
  }

  const sourceRef = boundRevision === null ? null : `skill:${boundRevision}`
  // The command's unknown-result tombstone belongs to actor/source, while
  // ACK and clipboard presentation belong only to this admitted read lifetime.
  const shareSource = boundary.subject && sourceRef ? JSON.stringify([boundary.subject, sourceRef]) : null
  const shareIdentity = boundary.admitted && identity && shareSource ? JSON.stringify([identity, shareSource]) : null
  const liveShareIdentity = useRef(shareIdentity)
  useLayoutEffect(() => {
    liveShareIdentity.current = shareIdentity
    const intents = shareIntents.current
    return () => {
      if (shareSource === null) return
      const intent = intents.get(shareSource)
      if (intent?.identity !== shareIdentity) return
      if (intent.pending && intent.ack === null) {
        intent.unknown = true
        setUnknownShares(current => ({ ...current, [shareSource]: true }))
      }
      intent.controller?.abort()
    }
  }, [shareIdentity, shareSource])
  const share = async (newIntent = false) => {
    if (!isLive() || !shareIdentity || !shareSource || !sourceRef) return
    let intent = shareIntents.current.get(shareSource)
    if (intent?.pending || intent?.unknown && !newIntent) return
    if (!intent || newIntent || intent.identity !== shareIdentity) {
      intent = { identity: shareIdentity, ack: null, unknown: false, pending: false, controller: null }
      shareIntents.current.set(shareSource, intent)
      setUnknownShares(current => ({ ...current, [shareSource]: false }))
    }
    intent.pending = true
    const controller = new AbortController()
    intent.controller = controller
    setShareStates(current => ({ ...current, [shareIdentity]: "pending" }))
    try {
      if (intent.ack === null) {
        try { intent.ack = await createSkillShareClient().create({ source_ref: sourceRef }, controller.signal) }
        catch (error) {
          const known = error instanceof Error && "reason" in error && error.reason === "http" && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500 && error.status !== 409
          intent.unknown = !known
          if (shareIntents.current.get(shareSource) === intent) setUnknownShares(current => ({ ...current, [shareSource]: !known }))
          if (isLive() && shareIntents.current.get(shareSource) === intent) setShareStates(current => ({ ...current, [shareIdentity]: known ? "failed" : "unknown" }))
          return
        }
      }
      if (controller.signal.aborted || !isLive() || liveShareIdentity.current !== shareIdentity) return
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable")
        await navigator.clipboard.writeText(intent.ack.url)
        if (!controller.signal.aborted && isLive() && liveShareIdentity.current === shareIdentity) setShareStates(current => ({ ...current, [shareIdentity]: "copied" }))
      } catch {
        if (!controller.signal.aborted && isLive() && liveShareIdentity.current === shareIdentity) setShareStates(current => ({ ...current, [shareIdentity]: "copyFailed" }))
      }
    } finally {
      if (isLive() && controller.signal.aborted && shareIntents.current.get(shareSource) === intent) setShareStates(current => ({ ...current, [shareIdentity]: intent.ack === null ? "unknown" : "copyFailed" }))
      intent.pending = false
      if (intent.controller === controller) intent.controller = null
    }
  }
  const shareStatus = shareIdentity === null ? null : shareSource !== null && unknownShares[shareSource] ? "unknown" : shareStates[shareIdentity] ?? null

  if (!skill && !sharedSummary && !pending) return null
  const record = detailSource !== "installation" && detail !== null && detail.skill.id === skill?.skill_id ? detail.skill : null
  const downloadInfo = detail !== null && detail.skill.id === skill?.skill_id && !sharedSummary ? detail.downloadInfo : null
  const loading = !sharedSummary && open && skill?.skill_id !== undefined && record === null && installation === null && !failed
  const title = sharedSummary?.skill.display_name ?? installation?.display_name ?? record?.displayName ?? record?.name ?? skill?.name ?? t("skills.title")
  const description = sharedSummary?.skill.description ?? installation?.summary ?? record?.userDescription ?? record?.description ?? skill?.description ?? ""
  const examples = sharedSummary?.skill.example_prompts ?? installation?.example_prompts ?? record?.exampleQuestions ?? skill?.example_questions ?? []
  const updated = displayDate(sharedSummary?.skill.updated_at ?? installation?.skill_updated_at ?? record?.updatedAt ?? (skill?.updated_at ? new Date(skill.updated_at * 1000).toISOString() : undefined), locale)
  const installationEnabled = installationState?.enabled ?? installation?.enabled ?? false
  // The exact installation was rebound above; actions must not reuse a stale
  // card's source availability after this fresh read.
  const currentSkill = detailSource === "installation" && installation && skill ? { ...skill, source_status: installation.source_status, enabled: installationEnabled } : skill
  const sourceUnavailable = detailSource === "installation" && installation !== null && installation.source_status !== "active"
  const enableInstallation = detailSource === "installation" && installation?.installed === true && !installationEnabled
  const installed = detailSource === "installation" ? installation !== null && installationEnabled : installationState === undefined ? record?.added ?? skill?.installed ?? false : installationState.installed && installationState.enabled
  const trialReady = !sharedSummary && !sourceUnavailable && (preview || boundary.admitted && boundary.subject !== null && installed && boundRevision !== null && currentSkill !== null && skillTrialSourceRef(currentSkill) === `skill:${boundRevision}`)
  const cover = sharedSummary?.skill.cover_image === undefined ? record?.coverImage ?? skill?.cover_image : ownerCoverPath(sharedSummary.skill.cover_image, sharedSummary.skill.skill_id)
  const canShare = Boolean(sharedSummary || skill?.revision_skill_id)
  const canDownload = Boolean(downloadInfo || sharedSummary || installation)

  const metadata = [
    publisherLabel,
    updated ? t("skills.updatedAt", { date: updated }) : undefined,
    !sharedSummary && skill?.usage_count ? t("skills.usedCount", { count: Number(skill.usage_count).toLocaleString(locale) }) : undefined,
  ].filter((value): value is string => Boolean(value))

  const readerHeader = <DialogHeader className={styles.readerHeader}>
          <Button type="button" variant="ghost" onClick={() => { setMobileFilesOpen(false); setReaderOpen(false) }}><ChevronRight className={styles.backIcon} aria-hidden="true" />{t("skills.packageBackToDetails")}</Button>
          <DialogTitle className="sr-only">{pending ? t("skills.packageReader") : title}</DialogTitle>
          <DialogDescription className="sr-only">{t("skills.packageReader")}</DialogDescription>
        </DialogHeader>
  const readerPlaceholder = <div className={styles.readerLoading} role="status" aria-label={t("skills.packageLoading")}>
                <span className={styles.readerLoadingYaml} aria-hidden="true"><i /><i /><i /></span>
                <span className={styles.readerLoadingTitle} aria-hidden="true" />
                <span className={styles.readerLoadingLine} aria-hidden="true" />
                <span className={`${styles.readerLoadingLine} ${styles.readerLoadingLineShort}`} aria-hidden="true" />
              </div>

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        style={pending && detailHeight ? { minHeight: `min(${detailHeight}px, calc(100dvh - 2rem))` } : undefined}
        className={readerOpen ? `${styles.dialog} ${styles.readerDialog}` : styles.dialog}
        overlayClassName={styles.overlay!}
        data-testid="manus-skill-detail-dialog"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target || !target.isConnected) return
          event.preventDefault()
          target.focus({ preventScroll: true })
        }}
      >
        {pending ? <>
          {readerOpen ? readerHeader : null}
          <div className={styles.body}>
          {readerOpen ? null : <DialogTitle>{t("skills.title")}</DialogTitle>}
          {readerOpen ? <p role={pendingFailed ? "alert" : "status"}>{t(pendingFailed ? "skills.detailUnavailable" : "skills.detailLoading")}</p>
            : <DialogDescription role={pendingFailed ? "alert" : "status"}>{t(pendingFailed ? "skills.detailUnavailable" : "skills.detailLoading")}</DialogDescription>}
          {pendingFailed && onRetryPending ? <Button type="button" variant="outline" disabled={pendingBusy} onClick={onRetryPending}>{t("skills.retry")}</Button> : null}
          {onLoadMore ? <Button type="button" variant="outline" disabled={pendingBusy} onClick={onLoadMore}>{t("rail.loadMore")}</Button> : null}
          {readerOpen && !pendingFailed ? readerPlaceholder : null}
          </div>
        </> : <>
        <DetailToolbar
          readerOpen={readerOpen}
          canShare={canShare}
          canDownload={canDownload}
          shareDisabled={shareIdentity === null || shareStatus === "pending" || shareStatus === "unknown"}
          downloadDisabled={downloading || Boolean(sharedSummary && !boundary.admitted)}
          onShare={() => void share()}
          onDownload={() => void download()}
          shareLabel={t("skills.detailShare")}
          downloadLabel={t("skills.detailDownloadShort")}
        />
        {readerOpen ? readerHeader : <DialogHeader className={styles.hero} data-has-cover={Boolean(cover)}>
          <div className={styles.copy}>
            {categoryLabels.length > 0 ? <div className={styles.categories}>{categoryLabels.slice(0, 2).map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}</div> : null}
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={styles.meta}>{metadata.map((value, index) => <span key={index}>{index > 0 ? <span className={styles.separator} aria-hidden="true">|</span> : null}{value}</span>)}</DialogDescription>
            <div className={styles.actions}>
              <Button type="button" onClick={() => sharedSummary ? onAddShared?.() : currentSkill && onAdd(currentSkill)} disabled={busy || installed || detailSource === "installation" && (installation === null || sourceUnavailable || !boundary.admitted || boundary.subject === null)}>{enableInstallation ? t("skills.enable") : installed ? t("skills.addedToMine") : <><Plus aria-hidden="true" />{t("skills.addToMine")}</>}</Button>
              <Button type="button" variant="outline" disabled={boundRevision === null} onClick={() => restartReader(true)}><FileText aria-hidden="true" />{t("skills.packageViewDetails")}</Button>
            </div>
          </div>
          {cover ? <div className={styles.cover}><Image src={cover} alt="" fill sizes="180px" unoptimized /></div> : null}
        </DialogHeader>}
        {shareStatus === "unknown" ? <div className={styles.status} role="alert"><p>{t("skills.shareUnknown")}</p><Button type="button" variant="outline" onClick={() => void share(true)}>{t("skills.shareNew")}</Button></div> : null}
        {shareStatus === "copied" ? <p className={styles.status} role="status">{t("skills.detailLinkCopied")}</p> : null}
        {shareStatus === "copyFailed" || shareStatus === "failed" ? <p className={styles.status} role="alert">{t(shareStatus === "copyFailed" ? "skills.shareCopyFailed" : "skills.shareFailed")}</p> : null}
        {installationNotice ? <div className={styles.status} role="alert"><p>{installationNotice}</p>{onRetryInstallation ? <Button type="button" variant="outline" onClick={onRetryInstallation}>{t("skills.packageRetry")}</Button> : null}</div> : null}
        {actionFailed ? <p className={styles.status} role="alert">{t("skills.addError")}</p> : null}
        {readerOpen ? null : <section className={styles.body}>
          <p className={styles.description}>{description}</p>
          {sourceUnavailable ? <p className={styles.status} role="status">{t("skills.sourceUnavailable")}</p> : null}
          {loading ? <p className={styles.status}>{t("skills.detailLoading")}</p> : null}
          {failed ? <p className={styles.status}>{t("skills.detailUnavailable")}</p> : null}
          {record !== null && skill?.revision_skill_id !== undefined && record.version !== skill.revision_skill_id ? <p className={styles.status}>{t("skills.packageChanged")}</p> : null}
          {examples.length > 0 ? <SkillTrialExamples key={JSON.stringify([boundary.subject, boundary.generation, skill?.skill_id, boundRevision, skill?.installed_source_ref, trialReady])} examples={examples} ready={trialReady} onTry={prompt => currentSkill !== null && onTry(prompt, currentSkill)} /> : null}
        </section>}
        {downloadFailure ? <p className={styles.status} role="alert">{t(downloadFailure === "unavailable" ? "skills.downloadUnavailable" : "skills.downloadIncomplete")}</p> : null}
        {readerOpen ? <section className={styles.reader} aria-label={t("skills.packageReader")}>
            <button
              type="button"
              className={styles.mobileFileToggle}
              ref={mobileFilesToggleRef}
              aria-label={t("skills.detailFiles")}
              aria-controls="manus-skill-package-files"
              aria-expanded={mobileFilesOpen}
              onClick={() => setMobileFilesOpen((value) => !value)}
            ><Menu aria-hidden="true" /></button>
            <nav id="manus-skill-package-files" className={`${styles.fileList} ${mobileFilesOpen ? styles.mobileFileListOpen : ""}`} aria-label={t("skills.detailFiles")}>
              <p className={styles.fileNavHeading}>{t("skills.detailFiles")}</p>
              <ul><SkillPackageFiles files={directory?.files ?? []} selectedPath={selectedPath} expandedFolders={expandedFolders} onSelect={selectFile} onToggle={path => setExpandedFolders(current => {
                const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next
              })} /></ul>
            </nav>
            <div ref={readerContentRef} className={styles.fileContent} aria-busy={readerLoading} onScroll={event => {
              if (isLive() && !readerLoading && readerFile !== null) readerCursor.current.scrollTop = event.currentTarget.scrollTop
            }}>
              {selectedPath !== null ? <div className={styles.fileHeading}><FileText aria-hidden="true" /><span>{selectedPath}</span></div> : null}
              {readerLoading ? readerPlaceholder : null}
              {readerFailed ? <div role="alert"><p>{t("skills.packageUnavailable")}</p><Button type="button" variant="outline" onClick={() => restartReader(false)}>{t("skills.packageRetry")}</Button></div> : null}
              {!readerLoading && !readerFailed && directory?.files.length === 0 ? <p>{t("skills.packageEmpty")}</p> : null}
              {!readerLoading && !readerFailed && directory !== null && directory.files.length > 0 && selectedPath === null ? <p>{t("skills.packageNoMarkdown")}</p> : null}
              {!readerLoading && !readerFailed && readerFile !== null ? <>
                {readerFile.text === "" ? <p>{t("skills.packageEmptyFile")}</p> : null}
                {readerFile.path.toLowerCase().endsWith(".md") ? <SkillPackageDocument text={readerFile.text} /> : <pre>{readerFile.text}</pre>}
              </> : null}
            </div>
          </section> : null}
        </>}
      </DialogContent>
    </Dialog>
  )
}
