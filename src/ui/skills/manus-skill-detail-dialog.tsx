"use client"

import Image from "next/image"
import { Download, MessageCircle, Plus, Share2 } from "lucide-react"
import { useEffect, useState, type RefObject } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocale } from "@/i18n/context"
import type { SkillCatalogCard } from "@/hub/schemas"
import { downloadManusSkill, getManusSkillDetail, type ManusSkillDetail } from "@/ui/skills/manus-skill-client"

import styles from "./manus-skill-detail-dialog.module.css"

type Props = {
  skill: SkillCatalogCard | null
  open: boolean
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (skill: SkillCatalogCard) => void
  onTry: (prompt: string) => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

function coverPath(skillId: string): string {
  return `/api/hub/self/skills/${encodeURIComponent(skillId)}/cover`
}

function displayDate(value: string | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date)
}

/** A stable, server-backed catalog detail dialog. It never synthesizes prompts,
 * source state, SKILL.md readers, or package identifiers in the browser. */
export function ManusSkillDetailDialog({ skill, open, busy = false, onOpenChange, onAdd, onTry, returnFocusRef }: Props) {
  const { locale, t } = useLocale()
  const [detail, setDetail] = useState<ManusSkillDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open || !skill?.skill_id) return
    const controller = new AbortController()
    void getManusSkillDetail(skill.skill_id).then((next) => {
      if (!controller.signal.aborted) setDetail(next)
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => controller.abort()
  }, [open, skill?.skill_id])

  const download = async () => {
    if (!skill?.skill_id || downloading) return
    setDownloading(true)
    try {
      const result = await downloadManusSkill(skill.skill_id)
      window.location.assign(result.downloadInfo.downloadUrl)
    } finally { setDownloading(false) }
  }

  if (!skill) return null
  const record = detail?.skill.id === skill.skill_id ? detail?.skill : null
  const downloadInfo = detail !== null && detail.skill.id === skill.skill_id ? detail.downloadInfo : null
  const loading = open && skill.skill_id !== undefined && record === null && !failed
  const title = record?.displayName ?? record?.name ?? skill.name
  const description = record?.userDescription ?? record?.description ?? skill.description
  const examples = record?.exampleQuestions ?? skill.example_questions ?? []
  const tags = record?.tags?.values ?? []
  const updated = displayDate(record?.updatedAt ?? (skill.updated_at ? new Date(skill.updated_at * 1000).toISOString() : undefined), locale)
  const installed = record?.added ?? skill.installed

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={styles.dialog}
        overlayClassName={styles.overlay!}
        data-testid="manus-skill-detail-dialog"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target || !target.isConnected) return
          event.preventDefault()
          target.focus({ preventScroll: true })
        }}
      >
        <div className={styles.topActions}>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.detailShare")} onClick={() => void navigator.clipboard?.writeText(window.location.href)}><Share2 aria-hidden="true" /></Button>
          {downloadInfo ? <Button type="button" variant="ghost" size="icon-sm" className={styles.iconLink} aria-label={t("skills.detailDownloadShort")} disabled={downloading} onClick={() => void download()}><Download aria-hidden="true" /></Button> : null}
        </div>
        <DialogHeader className={styles.hero}>
          <div className={styles.copy}>
            {tags.slice(0, 2).map((tag) => <Badge key={tag} variant="secondary">{tag.replace(/^SKILL_HUB_TAG_/u, "")}</Badge>)}
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={styles.meta}>Manus <span aria-hidden="true">|</span>{updated ? <>{t("skills.updatedAt", { date: updated })}<span aria-hidden="true">|</span></> : null}{skill.usage_count ? <>{t("skills.usedCount", { count: Number(skill.usage_count).toLocaleString(locale) })}</> : null}</DialogDescription>
            <div className={styles.actions}>
              <Button type="button" onClick={() => onAdd(skill)} disabled={busy || installed}>{installed ? t("skills.addedToMine") : <><Plus aria-hidden="true" />{t("skills.addToMine")}</>}</Button>
            </div>
          </div>
          {skill.skill_id ? <div className={styles.cover}><Image src={coverPath(skill.skill_id)} alt="" fill sizes="180px" unoptimized /></div> : null}
        </DialogHeader>
        <section className={styles.body}>
          <p className={styles.description}>{description}</p>
          {loading ? <p className={styles.status}>{t("skills.detailLoading")}</p> : null}
          {failed ? <p className={styles.status}>{t("skills.detailUnavailable")}</p> : null}
          {examples.length > 0 ? <div className={styles.examples}>{examples.map((example) => <button key={example} type="button" onClick={() => onTry(example)}><MessageCircle aria-hidden="true" /><span>{example}</span></button>)}</div> : null}
        </section>
      </DialogContent>
    </Dialog>
  )
}
