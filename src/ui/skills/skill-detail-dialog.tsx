"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Check, ChevronDown, ChevronRight, Clipboard, Download, Ellipsis, FileText, Folder, Forward, Maximize2, MessageCircle, Minimize2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { SkillCard } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"

import styles from "./skill-detail-dialog.module.css"

type SkillDetailDialogProps = {
  skill: SkillCard | null
  brandName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The primary Try action keeps its one-argument contract. Prompt cards may
   * provide their visible prompt as the optional second argument.
   */
  onTry: (skill: SkillCard, prompt?: string) => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

/**
 * The skill detail surface is intentionally composed from the shared Dialog,
 * Button and Badge primitives. Skill pool cards only carry the compact list
 * projection, so the detail view renders a deterministic local SKILL.md
 * outline until Hub exposes a richer read projection.
 */
export function SkillDetailDialog({ skill, brandName = "Kokoro", open, onOpenChange, onTry, returnFocusRef }: SkillDetailDialogProps) {
  const t = useT()
  const [copiedSkillName, setCopiedSkillName] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const copyResetTimerRef = useRef<number | null>(null)
  const linkResetTimerRef = useRef<number | null>(null)
  const actionBarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = null
    }
    if (linkResetTimerRef.current !== null) {
      window.clearTimeout(linkResetTimerRef.current)
      linkResetTimerRef.current = null
    }
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
        copyResetTimerRef.current = null
      }
      if (linkResetTimerRef.current !== null) {
        window.clearTimeout(linkResetTimerRef.current)
        linkResetTimerRef.current = null
      }
    }
  }, [open, skill?.name])

  if (skill === null) return null

  const scopeLabel = skill.scope === "official"
    ? t("skills.official")
    : skill.scope === "third_party" || skill.scope === "third-party"
      ? t("skills.thirdParty")
      : t("skills.own")
  const description = skill.description.trim() || t("skills.detailDescriptionFallback")
  const yaml = `name: ${skill.name}\ndescription: "${description.replaceAll('"', '\\"')}"`

  const copySkill = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopiedSkillName(null)
      return
    }
    try {
      await navigator.clipboard.writeText(yaml)
      setCopiedSkillName(skill.name)
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null
        setCopiedSkillName((current) => current === skill.name ? null : current)
      }, 1_200)
    } catch {
      setCopiedSkillName(null)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCopiedSkillName(null)
      setLinkCopied(false)
      setExpanded(false)
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
        copyResetTimerRef.current = null
      }
      if (linkResetTimerRef.current !== null) {
        window.clearTimeout(linkResetTimerRef.current)
        linkResetTimerRef.current = null
      }
    }
    onOpenChange(nextOpen)
  }

  const copySkillLink = async () => {
    if (!navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      if (linkResetTimerRef.current !== null) window.clearTimeout(linkResetTimerRef.current)
      linkResetTimerRef.current = window.setTimeout(() => {
        linkResetTimerRef.current = null
        setLinkCopied(false)
      }, 1_200)
    } catch {
      setLinkCopied(false)
    }
  }

  const downloadSkill = () => {
    const blobUrl = URL.createObjectURL(new Blob([yaml], { type: "text/plain;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = blobUrl
    anchor.download = `${skill.name.replace(/[^\p{L}\p{N}._-]+/gu, "-") || "skill"}.SKILL.md`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={expanded ? `${styles.dialog} ${styles.dialogExpanded}` : styles.dialog}
        overlayClassName={styles.dialogOverlay}
        data-testid="skill-detail-dialog"
        closeLabel={t("skills.detailClose")}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          window.requestAnimationFrame(() => actionBarRef.current?.focus({ preventScroll: true }))
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target || !target.isConnected || target.hasAttribute("disabled")) return
          event.preventDefault()
          window.requestAnimationFrame(() => target.focus({ preventScroll: true }))
        }}
      >
        {expanded ? <div className={styles.expandedTitlebar}>{skill.name}</div> : null}
        <div ref={actionBarRef} className={styles.actionBar} tabIndex={-1} aria-label={t("skills.detailMore")}>
          <Button type="button" variant="ghost" size="icon-sm" className={styles.actionButton} aria-label={linkCopied ? t("skills.detailLinkCopied") : t("skills.detailShare")} onClick={() => void copySkillLink()}>
            <Forward aria-hidden="true" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" className={styles.actionButton} aria-label={t("skills.detailMore")}>
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={styles.actionMenu}>
              <DropdownMenuItem onSelect={downloadSkill}>
                <Download aria-hidden="true" />
                {t("skills.detailDownload")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className={styles.actionDivider} aria-hidden="true" />
          <Button type="button" variant="ghost" size="icon-sm" className={styles.actionButton} aria-label={t(expanded ? "skills.detailCollapse" : "skills.detailExpand")} aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </Button>
        </div>
        <DialogHeader className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.tags}>
              <Badge variant="secondary">{scopeLabel}</Badge>
              <Badge variant="secondary">SKILL.md</Badge>
            </div>
            <DialogTitle className={styles.title}>{skill.name}</DialogTitle>
            <DialogDescription className={styles.meta}>
              <span className={styles.owner}><BrandFallback aria-hidden="true" /><span>{brandName}</span></span>
              <span aria-hidden="true">|</span>
              {skill.updated_at ? <span>{t("skills.updatedAt", { date: formatSkillDate(skill.updated_at) })}</span> : <span>{scopeLabel}</span>}
            </DialogDescription>
            <Button type="button" variant="default" className={styles.tryButton} onClick={() => onTry(skill)}>
              {t("skills.detailTry")}
            </Button>
          </div>
          <div className={styles.cover} aria-hidden="true">
            <span>{skill.name.slice(0, 1).toUpperCase()}</span>
            <small>{skill.name}</small>
          </div>
        </DialogHeader>

        <section className={styles.summary} aria-label={t("skills.detailDescription")}>
          <p className={styles.description}>{description}</p>
          <div className={styles.promptGrid}>
            <button type="button" className={styles.promptCard} onClick={() => onTry(skill, t("skills.detailPromptOne"))}>
              <MessageCircle aria-hidden="true" />
              <span>{t("skills.detailPromptOne")}</span>
            </button>
            <button type="button" className={styles.promptCard} onClick={() => onTry(skill, t("skills.detailPromptTwo"))}>
              <MessageCircle aria-hidden="true" />
              <span>{t("skills.detailPromptTwo")}</span>
            </button>
            <button type="button" className={styles.promptCard} onClick={() => onTry(skill, t("skills.detailPromptThree"))}>
              <MessageCircle aria-hidden="true" />
              <span>{t("skills.detailPromptThree")}</span>
            </button>
          </div>
        </section>

        <div className={styles.body}>
          <aside className={styles.tree} aria-label={t("skills.detailFiles")}>
            <div className={styles.treeRoot}>
              <ChevronDown aria-hidden="true" />
              <Folder aria-hidden="true" />
              <span>{skill.name}</span>
            </div>
            <div className={styles.treeFolder}>
              <ChevronRight aria-hidden="true" />
              <Folder aria-hidden="true" />
              <span>references</span>
            </div>
            <div className={styles.treeFile} data-active="true">
              <FileText aria-hidden="true" />
              <span>SKILL.md</span>
            </div>
          </aside>

          <section className={styles.content} aria-label={t("skills.detailDescription")}>
            <div className={styles.codeCard}>
              <div className={styles.codeHeader}>
                <span>YAML</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={copiedSkillName === skill.name ? t("skills.detailCopied") : t("skills.detailCopy")} onClick={() => void copySkill()}>
                  {copiedSkillName === skill.name ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                </Button>
              </div>
              <pre><code>{yaml}</code></pre>
            </div>
            <h3 className={styles.detailHeading}>{skill.name} Skill</h3>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatSkillDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(timestamp)
}
