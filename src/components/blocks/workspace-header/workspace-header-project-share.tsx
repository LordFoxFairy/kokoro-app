"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Forward, Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/context"

import styles from "./workspace-header-project-share.module.css"

export function WorkspaceHeaderProjectShare() {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const resetTimerRef = useRef<number | null>(null)
  const projectUrl = typeof window === "undefined"
    ? ""
    : (() => {
      const url = new URL(window.location.href)
      // A project link is a stable workspace entry point. Do not leak the
      // currently selected conversation, settings tab, or QA hash into it.
      url.search = ""
      url.hash = ""
      return url.toString()
    })()

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
  }, [])

  const copyProjectUrl = async () => {
    if (projectUrl === "") return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(projectUrl)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = projectUrl
        textarea.setAttribute("readonly", "")
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        document.body.append(textarea)
        textarea.select()
        const copiedByFallback = document.execCommand?.("copy") ?? false
        textarea.remove()
        if (!copiedByFallback) throw new Error("clipboard unavailable")
      }
      setCopyFailed(false)
      setCopied(true)
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        resetTimerRef.current = null
      }, 1600)
    } catch {
      setCopied(false)
      setCopyFailed(true)
    }
  }

  return (
    <Popover onOpenChange={(open) => { if (!open) { setCopied(false); setCopyFailed(false) } }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2" data-workspace-share="true" aria-label={t("share.button")}>
          <Forward aria-hidden="true" />
          {t("share.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className={styles.popover} aria-label={t("share.projectTitle")}>
        <div className={styles.header}>
          <strong>{t("share.projectTitle")}</strong>
        </div>
        <div className={styles.linkRow}>
          <Input readOnly value={projectUrl} aria-label={t("share.projectLinkAria")} onFocus={(event) => event.currentTarget.select()} />
        </div>
        <Button type="button" variant="default" size="sm" className={styles.copyButton} onClick={() => void copyProjectUrl()}>
          {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {copied ? t("share.projectCopied") : copyFailed ? t("share.projectCopyFailed") : t("share.projectCopy")}
        </Button>
        {copyFailed ? <span className="sr-only" role="status" aria-live="polite">{t("share.projectCopyFailed")}</span> : null}
        <p className={styles.hint}>{t("share.projectHint")}</p>
      </PopoverContent>
    </Popover>
  )
}
