"use client"

import Image from "next/image"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChevronDown, ChevronRight, Download, FileText, Folder, MessageCircle, Plus, Share } from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocale } from "@/i18n/context"
import type { SkillCatalogCard, CatalogPackageData } from "@/hub/schemas"
import { downloadManusSkill, getManusSkillDetail, getManusSkillPackage, type ManusSkillDetail } from "@/ui/skills/manus-skill-client"

import { createSkillShareClient } from "@/hub/skill-share-client"
import type { ShareAck, ShareSummary } from "@/hub/skill-share.schema"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { ownerCoverPath } from "@/ui/skills/manus-skill-client"

import styles from "./manus-skill-detail-dialog.module.css"

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
  readBoundary: ProjectReadBoundary
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
  onTry: (prompt: string) => void
  returnFocusRef?: RefObject<HTMLElement | null>
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
export function ManusSkillDetailDialog({ readBoundary: boundary, skill, open, busy = false, installationState, actionFailed = false, publisherLabel, categoryLabels = [], onOpenChange, onAdd, onTry, returnFocusRef, sharedSummary, onAddShared, installationNotice, onRetryInstallation }: Props) {
  const { locale, t } = useLocale()
  const shareIntents = useRef(new Map<string, { ack: ShareAck | null; unknown: boolean; pending: boolean; controller: AbortController | null }>())
  type ShareState = "pending" | "copied" | "copyFailed" | "failed" | "unknown"
  const [shareStates, setShareStates] = useState<Record<string, ShareState>>({})
  const [shareSubject, setShareSubject] = useState(boundary.subject)
  if (shareSubject !== boundary.subject) { setShareSubject(boundary.subject); setShareStates({}) }
  useEffect(() => {
    const intents = shareIntents.current
    return () => { for (const intent of intents.values()) intent.controller?.abort(); intents.clear() }
  }, [boundary.subject])

  const [detail, setDetail] = useState<ManusSkillDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const downloadRequest = useRef<AbortController | null>(null)
  const [readerOpen, setReaderOpen] = useState(false)
  const [directory, setDirectory] = useState<CatalogPackageData | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [readerFile, setReaderFile] = useState<CatalogPackageData["selected_file"]>(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerFailed, setReaderFailed] = useState(false)
  const [readerAttempt, setReaderAttempt] = useState(0)
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())
  const identity = !open ? null : sharedSummary ? JSON.stringify(["shared", boundary.subject, sharedSummary.share_id, sharedSummary.source_ref]) : skill?.skill_id ? JSON.stringify([skill.skill_id, skill.revision_skill_id]) : null
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

  // Reset browser presentation state by the selected resource identity, not
  // synchronously inside the external request effect.
  if (currentIdentity !== identity) {
    setCurrentIdentity(identity)
    setDetail(null)
    setFailed(false)
    setDownloading(false)
    setReaderOpen(false)
    setDirectory(null)
    setSelectedPath(null)
    setReaderFile(null)
    setReaderLoading(false)
    setReaderFailed(false)
    setCollapsedFolders(new Set())
  }

  const sharedDownloadAdmitted = sharedSummary ? boundary.admitted : true
  const sharedDownloadSubject = sharedSummary ? boundary.subject : null
  useEffect(() => {
    if (!open || sharedSummary && !sharedDownloadAdmitted || !skill?.skill_id && !sharedSummary) return
    if (sharedSummary || !skill?.skill_id) return
    let active = true
    const cacheKey = JSON.stringify([currentFetchScope(), boundary.subject ?? "anonymous", skill.skill_id, skill.revision_skill_id ?? null])
    const subscription = subscribeSkillDetail(cacheKey, skill.skill_id)
    void subscription.promise.then((next) => {
      if (active) setDetail(next)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => {
      active = false
      subscription.release()
    }
  }, [open, skill?.skill_id, skill?.revision_skill_id, sharedSummary, sharedDownloadAdmitted, sharedDownloadSubject, boundary.subject])

  const boundRevision = open && sharedSummary ? boundary.admitted ? sharedSummary.skill.skill_id : null : open && skill?.revision_skill_id !== undefined && detail !== null && detail.skill.id === skill.skill_id
    && detail.skill.version === skill.revision_skill_id ? skill.revision_skill_id : null

  const sharedRevision = sharedSummary?.skill.revision

  useEffect(() => {
    if (!readerOpen || boundRevision === null) return
    const controller = new AbortController()
    void getManusSkillPackage(boundRevision, undefined, controller.signal).then((value) => {
      if (controller.signal.aborted) return
      if (sharedRevision !== undefined && value.revision !== sharedRevision) throw new Error("skill_response_invalid")
      setDirectory(value)
      const path = value.files.some((file) => file.path === "SKILL.md") ? "SKILL.md" : null
      setSelectedPath(path)
      setReaderLoading(path !== null)
    }).catch(() => {
      if (!controller.signal.aborted) { setReaderFailed(true); setReaderLoading(false) }
    })
    return () => controller.abort()
  }, [readerOpen, boundRevision, readerAttempt, sharedRevision])

  useEffect(() => {
    if (!readerOpen || boundRevision === null || directory === null || selectedPath === null) return
    const controller = new AbortController()
    void getManusSkillPackage(boundRevision, selectedPath, controller.signal, directory).then((value) => {
      if (controller.signal.aborted) return
      setReaderFile(value.selected_file)
      setReaderLoading(false)
    }).catch(() => {
      if (!controller.signal.aborted) { setReaderFailed(true); setReaderLoading(false) }
    })
    return () => controller.abort()
  }, [readerOpen, boundRevision, directory, selectedPath])

  const restartReader = () => {
    if (boundRevision === null) return
    setReaderOpen(true)
    setCollapsedFolders(new Set())
    setDirectory(null)
    setSelectedPath(null)
    setReaderFile(null)
    setReaderLoading(true)
    setReaderFailed(false)
    setReaderAttempt((attempt) => attempt + 1)
  }
  const selectFile = (path: string) => {
    if (path === selectedPath) return
    setSelectedPath(path)
    setReaderFile(null)
    setReaderFailed(false)
    setReaderLoading(true)
  }

  const download = async () => {
    if ((!skill?.skill_id && !sharedSummary) || downloading) return
    const controller = new AbortController()
    downloadRequest.current?.abort()
    downloadRequest.current = controller
    setDownloading(true)
    try {
      if (sharedSummary) {
        const result = await createSkillShareClient().download(sharedSummary.share_id, sharedSummary.source_ref, sharedSummary.skill.revision, controller.signal)
        if (!controller.signal.aborted) window.location.assign(`/api${result.download_info.download_url}`)
      } else if (skill?.skill_id) {
        const result = await downloadManusSkill(skill.skill_id, controller.signal)
        if (!controller.signal.aborted) window.location.assign(result.downloadInfo.downloadUrl)
      }
    } catch { if (!controller.signal.aborted) setFailed(true) }
    finally {
      if (downloadRequest.current === controller) downloadRequest.current = null
      if (!controller.signal.aborted) setDownloading(false)
    }
  }

  const sourceRef = boundRevision === null ? null : `skill:${boundRevision}`
  const shareIdentity = boundary.admitted && boundary.subject && identity && sourceRef ? JSON.stringify([boundary.subject, sourceRef]) : null
  const liveShareIdentity = useRef(shareIdentity)
  useEffect(() => {
    liveShareIdentity.current = shareIdentity
    const intents = shareIntents.current
    if (shareIdentity === null) for (const intent of intents.values()) {
      if (intent.pending && intent.ack === null) intent.unknown = true
      intent.controller?.abort()
    }
    return () => {
      if (shareIdentity !== null) {
        const intent = intents.get(shareIdentity)
        if (intent?.pending && intent.ack === null) intent.unknown = true
        intent?.controller?.abort()
      }
    }
  }, [shareIdentity])
  const share = async (newIntent = false) => {
    if (!shareIdentity || !sourceRef) return
    let intent = shareIntents.current.get(shareIdentity)
    if (intent?.pending || intent?.unknown && !newIntent) return
    if (!intent || newIntent) {
      intent = { ack: null, unknown: false, pending: false, controller: null }
      shareIntents.current.set(shareIdentity, intent)
    }
    intent.pending = true
    const controller = new AbortController()
    intent.controller = controller
    setShareStates(current => ({ ...current, [shareIdentity]: "pending" }))
    try {
      if (intent.ack === null) {
        try { intent.ack = await createSkillShareClient().create({ source_ref: sourceRef }, controller.signal) }
        catch (error) {
          const known = error instanceof Error && "reason" in error && error.reason === "http" && "status" in error && typeof error.status === "number" && error.status < 500
          intent.unknown = !known
          if (shareIntents.current.get(shareIdentity) === intent) setShareStates(current => ({ ...current, [shareIdentity]: known ? "failed" : "unknown" }))
          return
        }
      }
      if (controller.signal.aborted || liveShareIdentity.current !== shareIdentity) return
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable")
        await navigator.clipboard.writeText(intent.ack.url)
        if (!controller.signal.aborted && liveShareIdentity.current === shareIdentity) setShareStates(current => ({ ...current, [shareIdentity]: "copied" }))
      } catch {
        if (!controller.signal.aborted && liveShareIdentity.current === shareIdentity) setShareStates(current => ({ ...current, [shareIdentity]: "copyFailed" }))
      }
    } finally {
      if (controller.signal.aborted && shareIntents.current.get(shareIdentity) === intent) setShareStates(current => ({ ...current, [shareIdentity]: intent.ack === null ? "unknown" : "copyFailed" }))
      intent.pending = false
      if (intent.controller === controller) intent.controller = null
    }
  }
  const shareStatus = shareIdentity === null ? null : shareStates[shareIdentity] ?? null

  if (!skill && !sharedSummary) return null
  const record = detail !== null && detail.skill.id === skill?.skill_id ? detail.skill : null
  const downloadInfo = detail !== null && detail.skill.id === skill?.skill_id && !sharedSummary ? detail.downloadInfo : null
  const loading = !sharedSummary && open && skill?.skill_id !== undefined && record === null && !failed
  const title = sharedSummary?.skill.display_name ?? record?.displayName ?? record?.name ?? skill!.name
  const description = sharedSummary?.skill.description ?? record?.userDescription ?? record?.description ?? skill!.description
  const examples = sharedSummary?.skill.example_prompts ?? record?.exampleQuestions ?? skill?.example_questions ?? []
  const updated = displayDate(sharedSummary?.skill.updated_at ?? record?.updatedAt ?? (skill?.updated_at ? new Date(skill.updated_at * 1000).toISOString() : undefined), locale)
  const installed = installationState === undefined ? record?.added ?? skill?.installed ?? false : installationState.installed && installationState.enabled
  const cover = sharedSummary?.skill.cover_image === undefined ? record?.coverImage ?? skill?.cover_image : ownerCoverPath(sharedSummary.skill.cover_image, sharedSummary.skill.skill_id)

  // Folder nodes are presentation-only prefixes of the owner-approved paths.
  // No archive member or generated content is added to the inventory.
  const renderFiles = (prefix: string): React.ReactNode => {
    const entries = new Map<string, { path: string; folder: boolean }>()
    for (const file of directory?.files ?? []) {
      if (!file.path.startsWith(prefix)) continue
      const remainder = file.path.slice(prefix.length)
      const name = remainder.split("/")[0]!
      entries.set(name, { path: `${prefix}${name}`, folder: remainder.includes("/") })
    }
    return [...entries].map(([name, entry]) => {
      if (!entry.folder) return <li key={entry.path}>
        <button type="button" aria-label={entry.path} aria-pressed={entry.path === selectedPath} onClick={() => selectFile(entry.path)}><FileText aria-hidden="true" /><span>{name}</span></button>
      </li>
      const expanded = !collapsedFolders.has(entry.path)
      return <li key={entry.path}>
        <button type="button" aria-expanded={expanded} onClick={() => setCollapsedFolders((current) => {
          const next = new Set(current)
          if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path)
          return next
        })}>{expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<Folder aria-hidden="true" /><span>{name}</span></button>
        {expanded ? <ul>{renderFiles(`${entry.path}/`)}</ul> : null}
      </li>
    })
  }

  const metadata = [
    publisherLabel,
    updated ? t("skills.updatedAt", { date: updated }) : undefined,
    !sharedSummary && skill?.usage_count ? t("skills.usedCount", { count: Number(skill.usage_count).toLocaleString(locale) }) : undefined,
  ].filter((value): value is string => Boolean(value))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
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
        {readerOpen ? null : <div className={styles.topActions}>
          {sharedSummary || skill?.revision_skill_id ? <Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.detailShare")} disabled={shareIdentity === null || shareStatus === "pending" || shareStatus === "unknown"} onClick={() => void share()}><Share aria-hidden="true" /></Button> : null}
          {downloadInfo || sharedSummary ? <Button type="button" variant="ghost" size="icon-sm" className={styles.iconLink} aria-label={t("skills.detailDownloadShort")} disabled={downloading || Boolean(sharedSummary && !boundary.admitted)} onClick={() => void download()}><Download aria-hidden="true" /></Button> : null}
        </div>}
        {readerOpen ? <DialogHeader className={styles.readerHeader}>
          <Button type="button" variant="ghost" onClick={() => setReaderOpen(false)}><ChevronRight className={styles.backIcon} aria-hidden="true" />{t("skills.packageBack")}</Button>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{t("skills.packageReader")}</DialogDescription>
        </DialogHeader> : <DialogHeader className={styles.hero} data-has-cover={Boolean(cover)}>
          <div className={styles.copy}>
            {categoryLabels.length > 0 ? <div className={styles.categories}>{categoryLabels.slice(0, 2).map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}</div> : null}
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={styles.meta}>{metadata.map((value, index) => <span key={index}>{index > 0 ? <span className={styles.separator} aria-hidden="true">|</span> : null}{value}</span>)}</DialogDescription>
            <div className={styles.actions}>
              <Button type="button" onClick={() => sharedSummary ? onAddShared?.() : skill && onAdd(skill)} disabled={busy || installed}>{installed ? t("skills.addedToMine") : <><Plus aria-hidden="true" />{t("skills.addToMine")}</>}</Button>
              <Button type="button" variant="outline" disabled={boundRevision === null} onClick={restartReader}><FileText aria-hidden="true" />{t("skills.packageViewDetails")}</Button>
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
          {loading ? <p className={styles.status}>{t("skills.detailLoading")}</p> : null}
          {failed ? <p className={styles.status}>{t("skills.detailUnavailable")}</p> : null}
          {record !== null && skill?.revision_skill_id !== undefined && record.version !== skill.revision_skill_id ? <p className={styles.status}>{t("skills.packageChanged")}</p> : null}
          {examples.length > 0 ? <div className={styles.examples}>{examples.map((example) => <button key={example} type="button" disabled={Boolean(sharedSummary)} onClick={() => onTry(example)}><MessageCircle aria-hidden="true" /><span>{example}</span></button>)}</div> : null}
        </section>}
        {readerOpen ? <section className={styles.reader} aria-label={t("skills.packageReader")}>
            <nav className={styles.fileList} aria-label={t("skills.detailFiles")}>
              <ul>{renderFiles("")}</ul>
            </nav>
            <div className={styles.fileContent} aria-busy={readerLoading}>
              {selectedPath !== null ? <div className={styles.fileHeading}><FileText aria-hidden="true" /><span>{selectedPath}</span></div> : null}
              {readerLoading ? <p role="status">{t("skills.packageLoading")}</p> : null}
              {readerFailed ? <div role="alert"><p>{t("skills.packageUnavailable")}</p><Button type="button" variant="outline" onClick={restartReader}>{t("skills.packageRetry")}</Button></div> : null}
              {!readerLoading && !readerFailed && directory?.files.length === 0 ? <p>{t("skills.packageEmpty")}</p> : null}
              {!readerLoading && !readerFailed && directory !== null && directory.files.length > 0 && selectedPath === null ? <p>{t("skills.packageNoMarkdown")}</p> : null}
              {!readerLoading && !readerFailed && readerFile !== null ? <>
                {readerFile.text === "" ? <p>{t("skills.packageEmptyFile")}</p> : null}
                {readerFile.path.toLowerCase().endsWith(".md") ? <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ children }) => <span>{children}</span> }}>{readerFile.text}</ReactMarkdown> : <pre>{readerFile.text}</pre>}
              </> : null}
            </div>
          </section> : null}
      </DialogContent>
    </Dialog>
  )
}
