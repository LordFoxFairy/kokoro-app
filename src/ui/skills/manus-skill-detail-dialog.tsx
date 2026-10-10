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

import styles from "./manus-skill-detail-dialog.module.css"

type Props = {
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
export function ManusSkillDetailDialog({ skill, open, busy = false, installationState, actionFailed = false, publisherLabel, categoryLabels = [], onOpenChange, onAdd, onTry, returnFocusRef }: Props) {
  const { locale, t } = useLocale()
  const [detail, setDetail] = useState<ManusSkillDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)
  const [readerOpen, setReaderOpen] = useState(false)
  const [directory, setDirectory] = useState<CatalogPackageData | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [readerFile, setReaderFile] = useState<CatalogPackageData["selected_file"]>(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerFailed, setReaderFailed] = useState(false)
  const [readerAttempt, setReaderAttempt] = useState(0)
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())
  const identity = open && skill?.skill_id ? JSON.stringify([skill.skill_id, skill.revision_skill_id]) : null
  const [currentIdentity, setCurrentIdentity] = useState(identity)

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

  useEffect(() => {
    if (!open || !skill?.skill_id) return
    const controller = new AbortController()
    activeRequest.current = controller
    void getManusSkillDetail(skill.skill_id, controller.signal).then((next) => {
      if (!controller.signal.aborted) setDetail(next)
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => { controller.abort(); if (activeRequest.current === controller) activeRequest.current = null }
  }, [open, skill?.skill_id, skill?.revision_skill_id])

  const boundRevision = open && skill?.revision_skill_id !== undefined && detail !== null && detail.skill.id === skill.skill_id
    && detail.skill.version === skill.revision_skill_id ? skill.revision_skill_id : null

  useEffect(() => {
    if (!readerOpen || boundRevision === null) return
    const controller = new AbortController()
    void getManusSkillPackage(boundRevision, undefined, controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setDirectory(value)
      const path = value.files.some((file) => file.path === "SKILL.md") ? "SKILL.md" : null
      setSelectedPath(path)
      setReaderLoading(path !== null)
    }).catch(() => {
      if (!controller.signal.aborted) { setReaderFailed(true); setReaderLoading(false) }
    })
    return () => controller.abort()
  }, [readerOpen, boundRevision, readerAttempt])

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
    const controller = activeRequest.current
    if (!skill?.skill_id || downloading || controller === null || controller.signal.aborted) return
    setDownloading(true)
    try {
      const result = await downloadManusSkill(skill.skill_id, controller.signal)
      if (!controller.signal.aborted) window.location.assign(result.downloadInfo.downloadUrl)
    } catch { if (!controller.signal.aborted) setFailed(true) }
    finally { if (!controller.signal.aborted) setDownloading(false) }
  }

  if (!skill) return null
  const record = detail !== null && detail.skill.id === skill.skill_id ? detail.skill : null
  const downloadInfo = detail !== null && detail.skill.id === skill.skill_id ? detail.downloadInfo : null
  const loading = open && skill.skill_id !== undefined && record === null && !failed
  const title = record?.displayName ?? record?.name ?? skill.name
  const description = record?.userDescription ?? record?.description ?? skill.description
  const examples = record?.exampleQuestions ?? skill.example_questions ?? []
  const updated = displayDate(record?.updatedAt ?? (skill.updated_at ? new Date(skill.updated_at * 1000).toISOString() : undefined), locale)
  const installed = installationState === undefined ? record?.added ?? skill.installed : installationState.installed && installationState.enabled
  const cover = record?.coverImage ?? skill.cover_image

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
    skill.usage_count ? t("skills.usedCount", { count: Number(skill.usage_count).toLocaleString(locale) }) : undefined,
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
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.detailShare")} onClick={() => void navigator.clipboard?.writeText(window.location.href)}><Share aria-hidden="true" /></Button>
          {downloadInfo ? <Button type="button" variant="ghost" size="icon-sm" className={styles.iconLink} aria-label={t("skills.detailDownloadShort")} disabled={downloading} onClick={() => void download()}><Download aria-hidden="true" /></Button> : null}
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
              <Button type="button" onClick={() => onAdd(skill)} disabled={busy || installed}>{installed ? t("skills.addedToMine") : <><Plus aria-hidden="true" />{t("skills.addToMine")}</>}</Button>
              <Button type="button" variant="outline" disabled={boundRevision === null} onClick={restartReader}><FileText aria-hidden="true" />{t("skills.packageViewDetails")}</Button>
            </div>
          </div>
          {cover ? <div className={styles.cover}><Image src={cover} alt="" fill sizes="180px" unoptimized /></div> : null}
        </DialogHeader>}
        {actionFailed ? <p className={styles.status} role="alert">{t("skills.addError")}</p> : null}
        {readerOpen ? null : <section className={styles.body}>
          <p className={styles.description}>{description}</p>
          {loading ? <p className={styles.status}>{t("skills.detailLoading")}</p> : null}
          {failed ? <p className={styles.status}>{t("skills.detailUnavailable")}</p> : null}
          {record !== null && skill.revision_skill_id !== undefined && record.version !== skill.revision_skill_id ? <p className={styles.status}>{t("skills.packageChanged")}</p> : null}
          {examples.length > 0 ? <div className={styles.examples}>{examples.map((example) => <button key={example} type="button" onClick={() => onTry(example)}><MessageCircle aria-hidden="true" /><span>{example}</span></button>)}</div> : null}
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
