"use client"

import Image from "next/image"
import { ChevronRight, Download, FileText, GitFork, Menu, Plus, Share, Star } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocale } from "@/i18n/context"
import type { SkillCatalogCard, CatalogPackageData, PersonalInstallation } from "@/hub/schemas"
import { githubRepositoryUrlSchema, githubSelectorSchema } from "@/hub/skill-github-import.schema"
import { downloadManusSkill, getManusSkillDetail, getManusSkillPackage, type ManusSkillDetail } from "@/ui/skills/manus-skill-client"

import { createSkillInstallationClient, HubClientError } from "@/hub/client"
import { inspectProjectInstallationPackage, downloadProjectInstallationPackage, type ProjectInstallationTarget, inspectInstallationPackage, downloadInstallationPackage } from "@/hub/skill-installation-content"
import { createSkillShareClient } from "@/hub/skill-share-client"
import type { ShareAck, ShareSummary } from "@/hub/skill-share.schema"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { ownerCoverPath } from "@/ui/skills/manus-skill-client"

import { skillTrialSourceRef } from "./skills-card-model"
import { SkillTrialExamples } from "./skill-trial-examples"
import { SkillCoverMedia } from "./skill-cover-media"

import styles from "./manus-skill-detail-dialog.module.css"
import { SkillPackageDocument } from "./skill-package-document"
import { SkillPackageFiles } from "./skill-package-files"
import { PersonalSkillActions, type PersonalSkillOperation } from "./personal-skill-actions"

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

type CommonProps = {
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
  returnFocusRef?: RefObject<HTMLElement | null>
  onManagePersonal?: (operation: PersonalSkillOperation, installation: PersonalInstallation) => void
  onRemoveInstallation?: (installation: PersonalInstallation) => void
  personalManagementBusy?: boolean
}

type Props = CommonProps & (
  | { detailSource: "project-installation"; projectTarget: ProjectInstallationTarget; onAdd?: never; onTry?: never; sharedSummary?: never; onAddShared?: never; onManagePersonal?: never; onRemoveInstallation?: never }
  | { detailSource?: "catalog" | "installation"; projectTarget?: never; onAdd: (skill: SkillCatalogCard) => void; onTry: (prompt: string, selection: SkillCatalogCard) => boolean }
)

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
  personalActions?: ReactNode
}

/**
 * The summary and package reader are two views of one selected revision.
 * Keep their utility actions in one typed component so entering the reader
 * cannot make the real share/download capability disappear from the header.
 */
function DetailToolbar({ readerOpen, canShare, canDownload, shareDisabled, downloadDisabled, onShare, onDownload, shareLabel, downloadLabel, personalActions }: DetailToolbarProps) {
  if (!canShare && !canDownload && !personalActions) return null
  return (
    <div className={readerOpen ? styles.readerTopActions : styles.topActions}>
      {canShare ? <Button type="button" variant="ghost" size="icon-sm" aria-label={shareLabel} disabled={shareDisabled} onClick={onShare}><Share aria-hidden="true" /></Button> : null}
      {canDownload ? <Button type="button" variant="ghost" size="icon-sm" className={styles.iconLink} aria-label={downloadLabel} disabled={downloadDisabled} onClick={onDownload}><Download aria-hidden="true" /></Button> : null}
      {personalActions}
    </div>
  )
}

function displayDate(value: string | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date)
}

// Metadata uses the same compact k convention as the directory, but keeps
// decimal owner counters exact even beyond Number.MAX_SAFE_INTEGER.
function displayRepositoryCount(value: string): string {
  const count = BigInt(value)
  if (count < BigInt(1000)) return value
  if (count >= BigInt(100000)) return `${(count + BigInt(500)) / BigInt(1000)}k`
  const tenths = (count + BigInt(50)) / BigInt(100)
  const fraction = tenths % BigInt(10)
  return `${tenths / BigInt(10)}${fraction === BigInt(0) ? "" : `.${fraction}`}k`
}

function repositoryDirectoryHref(repository: { repository_url: string; owner_login: string; commit: string; path: string }): string | undefined {
  const url = githubRepositoryUrlSchema.safeParse(repository.repository_url)
  if (!url.success) return undefined
  const [owner, name] = url.data.slice("https://github.com/".length).split("/")
  if (repository.owner_login !== owner) return undefined
  const selected = githubSelectorSchema.safeParse({ owner, repository: name, commit: repository.commit, path: repository.path })
  if (!selected.success) return undefined
  const path = selected.data.path.split("/").map(encodeURIComponent).join("/")
  return `${url.data}/tree/${selected.data.commit}${path === "" ? "" : `/${path}`}`
}

/** A stable, server-backed catalog detail dialog. It never synthesizes prompts,
 * source state or package identifiers in the browser. Package text comes only
 * from the admitted published-revision inspection boundary. */
export function ManusSkillDetailDialog({ detailSource = "catalog", projectTarget, preview = false, pending = false, pendingFailed = false, pendingBusy = false, onLoadMore, onRetryPending, readBoundary: boundary, skill, open, busy = false, installationState, actionFailed = false, publisherLabel, categoryLabels = [], onOpenChange, onAdd, onTry, returnFocusRef, sharedSummary: sourceSummary, onAddShared, installationNotice, onRetryInstallation, onManagePersonal, onRemoveInstallation, personalManagementBusy = false }: Props) {
  const { locale, t } = useLocale()
  const projectInstalled = detailSource === "project-installation"
  const installedDetail = detailSource === "installation" || projectInstalled
  const sharedSummary = projectInstalled ? undefined : sourceSummary
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
  const resourceIdentity = !open ? null : sharedSummary ? JSON.stringify(["shared", boundary.subject, sharedSummary.share_id, sharedSummary.source_ref]) : skill?.skill_id ? JSON.stringify([detailSource, projectInstalled ? projectTarget : null, skill.skill_id, skill.revision_skill_id, installedDetail ? skill.installation_id : null]) : null
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
  const detailCacheKey = projectInstalled || skill?.skill_id === undefined ? null : JSON.stringify([currentFetchScope(), boundary.subject ?? "anonymous", boundary.generation, skill.skill_id, skill.revision_skill_id ?? null])
  useEffect(() => {
    if (!open || !boundary.admitted || boundary.subject === null || !skill?.skill_id && !sharedSummary) return
    if (sharedSummary || installedDetail || !skill?.skill_id) return
    let active = true
    if (detailCacheKey === null) return
    const subscription = subscribeSkillDetail(detailCacheKey, skill.skill_id)
    void subscription.promise.then((next) => {
      if (active && isLive()) setDetail(next)
    }).catch(() => {
      if (active && isLive()) setFailed(true)
    })
    return () => {
      active = false
      subscription.release()
    }
  }, [open, detailSource, installedDetail, skill?.skill_id, skill?.revision_skill_id, sharedSummary, sharedDownloadAdmitted, sharedDownloadSubject, boundary.subject, boundary.admitted, boundary.generation, detailCacheKey, isLive])

  const installationId = skill?.installation_id
  const installationSeries = skill?.skill_id
  const installationSource = skill?.source_ref
  const installationRevision = skill?.revision_skill_id
  useEffect(() => {
    if (!installedDetail || sharedSummary || !open || !boundary.admitted || boundary.subject === null) return
    const controller = new AbortController()
    const load = async () => {
      if (!installationId || !installationRevision || installationSource !== `skill:${installationRevision}`) throw new Error("skill_response_invalid")
      if (projectInstalled && (!projectTarget || projectTarget.installation_id !== installationId || projectTarget.source_ref !== installationSource)) throw new Error("skill_response_invalid")
      const value = await createSkillInstallationClient(projectInstalled ? { projectId: projectTarget!.project_id } : undefined).get(installationId, controller.signal)
      if (controller.signal.aborted || !isLive()) return
      if (value.source_status === "deleted" || !value.installed || value.series_id !== installationSeries || value.source_ref !== installationSource || value.installation_id !== installationId || projectInstalled && value.revision !== projectTarget!.revision) throw new Error("skill_response_invalid")
      setInstallation(value)
    }
    void load().catch(() => { if (!controller.signal.aborted && isLive()) setFailed(true) })
    return () => controller.abort()
  }, [detailSource, installedDetail, projectInstalled, projectTarget, sharedSummary, open, boundary.admitted, boundary.subject, installationId, installationSeries, installationSource, installationRevision, isLive])

  const boundRevision = !open || !boundary.admitted || boundary.subject === null || failed ? null
    : sharedSummary ? sharedSummary.skill.skill_id
    : installedDetail ? installation?.source_ref.slice(6) ?? null
    : skill?.revision_skill_id !== undefined && detail?.skill.id === skill.skill_id && detail?.skill.version === skill.revision_skill_id ? skill.revision_skill_id : null

  const sharedRevision = sharedSummary?.skill.revision
  const failReader = useCallback((error: unknown) => {
    setReaderFailed(true)
    setReaderLoading(false)
    // Only a typed transport interruption or validated dependency outage may
    // retain this generation's current document. Bad wire is not authority;
    // a confirmed owner denial retires the dependent metadata/actions too.
    if (error instanceof HubClientError && (error.reason === "network" && (error.status === null || error.status === 200)
      || error.reason === "http" && error.status === 503 && error.retryable)) return
    setReaderFile(null)
    setDirectory(null)
    if (error instanceof HubClientError && error.reason === "http" && [401, 403, 404, 412].includes(error.status ?? 0)) {
      if (detailCacheKey !== null) detailCache.delete(detailCacheKey)
      setDetail(null)
      setInstallation(null)
      setFailed(true)
    }
  }, [detailCacheKey])

  useEffect(() => {
    if (!readerOpen || boundRevision === null || directory !== null || readerFailed) return
    const controller = new AbortController()
    void (installation ? projectInstalled ? inspectProjectInstallationPackage(projectTarget!, undefined, controller.signal) : inspectInstallationPackage(installation, undefined, controller.signal) : getManusSkillPackage(boundRevision, undefined, controller.signal)).then((value) => {
      if (controller.signal.aborted || !isLive()) return
      if (sharedRevision !== undefined && value.revision !== sharedRevision) throw new Error("skill_response_invalid")
      setDirectory(value)
      const path = readerCursor.current.path !== null && value.files.some(file => file.path === readerCursor.current.path)
        ? readerCursor.current.path : value.files.some(file => file.path === "SKILL.md") ? "SKILL.md" : null
      if (readerCursor.current.path !== path) readerCursor.current.scrollTop = 0
      readerCursor.current.path = path
      setSelectedPath(path)
      setReaderLoading(path !== null)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && isLive()) failReader(error)
    })
    return () => controller.abort()
  }, [readerOpen, boundRevision, installation, directory, readerFailed, readerAttempt, sharedRevision, isLive, readerCursor, failReader, projectInstalled, projectTarget])

  useEffect(() => {
    if (!readerOpen || boundRevision === null || directory === null || selectedPath === null) return
    const controller = new AbortController()
    void (installation ? projectInstalled ? inspectProjectInstallationPackage(projectTarget!, selectedPath, controller.signal, directory) : inspectInstallationPackage(installation, selectedPath, controller.signal, directory) : getManusSkillPackage(boundRevision, selectedPath, controller.signal, directory)).then((value) => {
      if (controller.signal.aborted || !isLive()) return
      setReaderFile(value.selected_file)
      setReaderLoading(false)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && isLive()) failReader(error)
    })
    return () => controller.abort()
  }, [readerOpen, boundRevision, installation, directory, selectedPath, readerAttempt, isLive, failReader, projectInstalled, projectTarget])

  useLayoutEffect(() => {
    if (!readerLoading && readerFile !== null && readerFile.path === selectedPath && isLive() && readerContentRef.current) {
      readerContentRef.current.scrollTop = readerCursor.current.scrollTop
    }
  }, [readerLoading, readerFile, selectedPath, isLive])

  const restartReader = (resetPosition: boolean) => {
    if (boundRevision === null || !isLive()) return
    setReaderOpen(true)
    const path = resetPosition ? directory?.files.some(file => file.path === "SKILL.md") ? "SKILL.md" : null : selectedPath
    if (resetPosition) { readerCursor.current = { path, scrollTop: 0 }; setExpandedFolders(new Set()) }
    setSelectedPath(path)
    // A normal re-entry re-reads the selected file against the already
    // inspected immutable manifest. Keep only that same path's confirmed text;
    // changing path, resource, actor or admission still clears private facts.
    setReaderFile(current => current?.path === path ? current : null)
    setReaderLoading(true)
    setReaderFailed(false)
    setMobileFilesOpen(false)
    setReaderAttempt((attempt) => attempt + 1)
  }
  const selectFile = (path: string) => {
    if (!isLive()) return
    setMobileFilesOpen(false)
    if (mobileFilesOpen) mobileFilesToggleRef.current?.focus()
    if (path === selectedPath) { if (readerFailed) restartReader(false); return }
    readerCursor.current = { path, scrollTop: 0 }
    setSelectedPath(path)
    setReaderFile(null)
    setReaderFailed(false)
    setReaderLoading(true)
  }

  const download = async () => {
    if (!isLive() || boundRevision === null || (!skill?.skill_id && !sharedSummary) || downloading) return
    const controller = new AbortController()
    downloadRequest.current?.abort()
    downloadRequest.current = controller
    setDownloading(true)
    setDownloadFailure(null)
    try {
      if (sharedSummary) {
        const result = await createSkillShareClient().download(sharedSummary.share_id, sharedSummary.source_ref, sharedSummary.skill.revision, controller.signal)
        if (!controller.signal.aborted && isLive()) window.location.assign(`/api${result.download_info.download_url}`)
      } else if (installedDetail) {
        if (!installation) return
        const result = projectInstalled ? await downloadProjectInstallationPackage(projectTarget!, controller.signal) : await downloadInstallationPackage(installation, controller.signal)
        if (!controller.signal.aborted && isLive()) window.location.assign(`/api${result.download_info.download_url}`)
      } else if (skill?.skill_id) {
        const result = await downloadManusSkill(skill.skill_id, boundRevision, controller.signal)
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
  const shareSource = !projectInstalled && boundary.subject && sourceRef ? JSON.stringify([boundary.subject, sourceRef]) : null
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
  const record = !installedDetail && detail !== null && detail.skill.id === skill?.skill_id ? detail.skill : null
  const loading = !sharedSummary && open && skill?.skill_id !== undefined && record === null && installation === null && !failed
  const title = sharedSummary?.skill.display_name ?? installation?.display_name ?? record?.displayName ?? record?.name ?? skill?.name ?? t("skills.title")
  const description = sharedSummary?.skill.description ?? installation?.summary ?? record?.userDescription ?? record?.description ?? skill?.description ?? ""
  const examples = sharedSummary?.skill.example_prompts ?? installation?.example_prompts ?? record?.exampleQuestions ?? skill?.example_questions ?? []
  const updated = displayDate(sharedSummary?.skill.updated_at ?? installation?.skill_updated_at ?? record?.updatedAt ?? (skill?.updated_at ? new Date(skill.updated_at * 1000).toISOString() : undefined), locale)
  const installationEnabled = installationState?.enabled ?? installation?.enabled ?? false
  // The exact installation was rebound above; actions must not reuse a stale
  // card's source availability after this fresh read.
  const currentSkill = installedDetail && installation && skill ? { ...skill, source_status: installation.source_status, enabled: installationEnabled } : skill
  const sourceUnavailable = installedDetail && installation !== null && installation.source_status !== "active"
  const enableInstallation = !projectInstalled && installedDetail && installation?.installed === true && !installationEnabled
  const installed = installedDetail ? installation !== null && installationEnabled : installationState === undefined ? record?.added ?? skill?.installed ?? false : installationState.installed && installationState.enabled
  const trialReady = !projectInstalled && !sharedSummary && !sourceUnavailable && (preview || boundary.admitted && boundary.subject !== null && installed && boundRevision !== null && currentSkill !== null && skillTrialSourceRef(currentSkill) === `skill:${boundRevision}`)
  const cover = sharedSummary?.skill.cover_image === undefined ? record?.coverImage ?? skill?.cover_image : ownerCoverPath(sharedSummary.skill.cover_image, sharedSummary.skill.skill_id)
  const canShare = !projectInstalled && Boolean(sharedSummary || skill?.revision_skill_id)
  const canDownload = Boolean(boundRevision !== null || sharedSummary || installation)
  const detailReadStatus = failed || loading ? <span className="sr-only" role="status">{t(failed ? "skills.detailUnavailable" : "skills.detailLoading")}</span> : null

  // Installation attribution comes from its admitted, exact-version read.
  // A caller's brand label is only valid for an owner-confirmed official source.
  const installationPublisher = installation?.publisher_profile?.status === "found"
    ? installation.publisher_profile.display_name
    : installation?.product.source_kind === "official" ? publisherLabel : undefined
  const metadataProduct = sharedSummary ? undefined : installedDetail ? installation?.product : skill?.product
  const repository = metadataProduct?.source_kind === "third_party" && metadataProduct.publisher?.kind === "github_repository" ? metadataProduct.publisher.github_repository : undefined
  const repositoryHref = repository === undefined ? undefined : repositoryDirectoryHref(repository)
  const metadata = [
    installedDetail ? installationPublisher : publisherLabel,
    updated ? t("skills.updatedAt", { date: updated }) : undefined,
    !sharedSummary && skill?.usage_count ? t("skills.usedCount", { count: Number(skill.usage_count).toLocaleString(locale) }) : undefined,
  ].filter((value): value is string => Boolean(value))

  const readerHeader = <DialogHeader className={styles.readerHeader}>
          <Button type="button" variant="ghost" onClick={() => { setMobileFilesOpen(false); setReaderOpen(false) }}><ChevronRight className={styles.backIcon} aria-hidden="true" />{t("skills.packageBackToDetails")}</Button>
          <DialogTitle className="sr-only">{pending ? t("skills.packageReader") : title}</DialogTitle>
          <DialogDescription className="sr-only">{t("skills.packageReader")}</DialogDescription>
        </DialogHeader>
  const readerBusy = readerLoading && !failed && !readerFailed
  const currentReaderFile = readerFile?.path === selectedPath ? readerFile : null
  const readerPlaceholder = readerBusy || pending && !pendingFailed
    ? <span className="sr-only" role="status" aria-label={t("skills.packageLoading")}>{t("skills.packageLoading")}</span>
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        aria-busy={pending ? !pendingFailed : loading || readerOpen && readerBusy}
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
          <DialogDescription className="sr-only" role="status">{t(pendingFailed ? "skills.detailUnavailable" : "skills.detailLoading")}</DialogDescription>
          {/* Session recovery is an explicit admission action, not a passive
              metadata retry. Its existing callback and busy guard stay intact. */}
          {!boundary.admitted && pendingFailed && onRetryPending ? <Button type="button" variant="outline" disabled={pendingBusy} onClick={onRetryPending}>{t("skills.retry")}</Button> : null}
          {onLoadMore ? <Button type="button" variant="outline" disabled={pendingBusy} onClick={onLoadMore}>{t("rail.loadMore")}</Button> : null}
          {readerOpen ? readerPlaceholder : <div className={styles.metadataPlaceholder} aria-hidden="true" />}
          </div>
        </> : <>
        <DetailToolbar
          readerOpen={readerOpen}
          canShare={canShare}
          canDownload={canDownload}
          shareDisabled={shareIdentity === null || shareStatus === "pending" || shareStatus === "unknown"}
          downloadDisabled={downloading || failed || Boolean(sharedSummary && !boundary.admitted)}
          onShare={() => void share()}
          onDownload={() => void download()}
          shareLabel={t("skills.detailShare")}
          downloadLabel={t("skills.detailDownloadShort")}
          personalActions={!preview && detailSource === "installation" && installation?.installed && ["active", "disabled", "withdrawn", "quarantined"].includes(installation.source_status) && boundary.admitted && boundary.subject !== null && (onRemoveInstallation || installation.product.source_kind === "personal" && onManagePersonal)
            ? <PersonalSkillActions writable={["active", "disabled"].includes(installation.source_status)} disabled={personalManagementBusy}
              {...(installation.product.source_kind === "personal" && onManagePersonal ? { onSelect: (operation: PersonalSkillOperation) => onManagePersonal(operation, installation) } : {})}
              {...(onRemoveInstallation ? { onRemoveInstallation: () => onRemoveInstallation(installation) } : {})} /> : undefined}
        />
        {readerOpen ? readerHeader : <SkillCoverMedia src={open && boundary.admitted && boundary.subject !== null ? cover : undefined} identity={identity ?? "closed"} sizes="180px">{(media, loaded) => <DialogHeader className={styles.hero} data-has-cover={loaded}>
          <div className={styles.copy}>
            {categoryLabels.length > 0 ? <div className={styles.categories}>{categoryLabels.slice(0, 2).map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}</div> : null}
            <DialogTitle>{title}</DialogTitle>
            {repository === undefined ? <DialogDescription className={styles.meta}>{metadata.map((value, index) => <span key={index}>{index > 0 ? <span className={styles.separator} aria-hidden="true">|</span> : null}{value}</span>)}</DialogDescription> : <DialogDescription asChild>
              <div className={styles.githubMetadata}>
                <p className={styles.githubMetadataRow}>
                  <span className={styles.githubMetadataItem}><Image src="/assets/connectors/github.webp" alt="" width={12} height={12} aria-hidden="true" />{t("skills.githubSource")}{repositoryHref === undefined ? <span>{repository.owner_login}</span> : <a href={repositoryHref} target="_blank" rel="noopener noreferrer">{repository.owner_login}</a>}</span>
                  {updated ? <span><span className={styles.separator} aria-hidden="true">|</span>{t("skills.updatedAt", { date: updated })}</span> : null}
                </p>
                {repository.repo_stats === undefined ? null : <p className={styles.githubMetadataRow}>
                  <span className={styles.githubMetadataItem}><Star aria-hidden="true" />{t("skills.githubStars", { count: displayRepositoryCount(repository.repo_stats.stars) })}</span>
                  <span className={styles.githubMetadataItem}><GitFork aria-hidden="true" />{t("skills.githubForks", { count: displayRepositoryCount(repository.repo_stats.forks) })}</span>
                </p>}
              </div>
            </DialogDescription>}
            <div className={styles.actions}>
              {!projectInstalled ? <Button type="button" onClick={() => sharedSummary ? onAddShared?.() : currentSkill && onAdd?.(currentSkill)} disabled={busy || installed || detailSource === "installation" && (installation === null || sourceUnavailable || !boundary.admitted || boundary.subject === null)}>{enableInstallation ? t("skills.enable") : installed ? t("skills.addedToMine") : <><Plus aria-hidden="true" />{t("skills.addToMine")}</>}</Button> : null}
              <Button type="button" variant="outline" disabled={boundRevision === null} onClick={() => restartReader(true)}><FileText aria-hidden="true" />{t("skills.packageViewDetails")}</Button>
            </div>
          </div>
          {cover ? <div className={styles.cover} style={{ opacity: loaded ? 1 : 0 }}><div className={styles.coverBook}>{media}</div></div> : null}
        </DialogHeader>}</SkillCoverMedia>}
        {shareStatus === "unknown" ? <div className={styles.status} role="alert"><p>{t("skills.shareUnknown")}</p><Button type="button" variant="outline" onClick={() => void share(true)}>{t("skills.shareNew")}</Button></div> : null}
        {shareStatus === "copied" ? <p className={styles.status} role="status">{t("skills.detailLinkCopied")}</p> : null}
        {shareStatus === "copyFailed" || shareStatus === "failed" ? <p className={styles.status} role="alert">{t(shareStatus === "copyFailed" ? "skills.shareCopyFailed" : "skills.shareFailed")}</p> : null}
        {installationNotice ? <div className={styles.status} role="alert"><p>{installationNotice}</p>{onRetryInstallation ? <Button type="button" variant="outline" onClick={onRetryInstallation}>{t("skills.packageRetry")}</Button> : null}</div> : null}
        {actionFailed ? <p className={styles.status} role="alert">{t("skills.addError")}</p> : null}
        {readerOpen ? null : <section className={styles.body}>
          <p className={styles.description}>{description}</p>
          {sourceUnavailable ? <p className={styles.status} role="status">{t("skills.sourceUnavailable")}</p> : null}
          {detailReadStatus}
          {record !== null && skill?.revision_skill_id !== undefined && record.version !== skill.revision_skill_id ? <p className={styles.status}>{t("skills.packageChanged")}</p> : null}
          {!projectInstalled && examples.length > 0 ? <SkillTrialExamples key={JSON.stringify([boundary.subject, boundary.generation, skill?.skill_id, boundRevision, skill?.installed_source_ref, trialReady])} examples={examples} ready={trialReady} onTry={prompt => currentSkill !== null && (onTry?.(prompt, currentSkill) ?? false)} /> : null}
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
            <div ref={readerContentRef} className={styles.fileContent} aria-busy={readerBusy} onScroll={event => {
              if (isLive() && currentReaderFile !== null) readerCursor.current.scrollTop = event.currentTarget.scrollTop
            }}>
              {selectedPath !== null ? <div className={styles.fileHeading}><FileText aria-hidden="true" /><span>{selectedPath}</span></div> : null}
              {detailReadStatus}
              {currentReaderFile === null && (readerLoading || readerFailed || failed) ? readerPlaceholder : null}
              {readerFailed ? <span className="sr-only" role="status">{t("skills.packageUnavailable")}</span> : null}
              {!readerLoading && !readerFailed && directory?.files.length === 0 ? <p>{t("skills.packageEmpty")}</p> : null}
              {!readerLoading && !readerFailed && directory !== null && directory.files.length > 0 && selectedPath === null ? <p>{t("skills.packageNoMarkdown")}</p> : null}
              {currentReaderFile !== null ? <>
                {currentReaderFile.text === "" ? <p>{t("skills.packageEmptyFile")}</p> : null}
                {currentReaderFile.path.toLowerCase().endsWith(".md") ? <SkillPackageDocument text={currentReaderFile.text} /> : <pre>{currentReaderFile.text}</pre>}
              </> : null}
            </div>
          </section> : null}
        </>}
      </DialogContent>
    </Dialog>
  )
}
