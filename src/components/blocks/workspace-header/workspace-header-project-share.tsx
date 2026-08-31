"use client"

import { useState } from "react"
import { Check, ChevronDown, Forward, HelpCircle, Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/context"

import styles from "./workspace-header-project-share.module.css"

export function WorkspaceHeaderProjectShare() {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const projectUrl = typeof window === "undefined" ? "" : window.location.href

  const copyProjectUrl = async () => {
    await navigator.clipboard?.writeText(projectUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Popover onOpenChange={(open) => { if (!open) setCopied(false) }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2" data-workspace-share="true" aria-label={t("share.button")}>
          <Forward aria-hidden="true" />
          {t("share.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className={styles.popover} aria-label={t("share.projectTitle")}>
        <div className={styles.header}>
          <strong>{t("share.projectTitle")}</strong>
          <span>{t("share.projectWhatIsShared")}</span>
          <HelpCircle aria-hidden="true" />
        </div>
        <div className={styles.inviteRow}>
          <Input placeholder={t("share.projectInvitePlaceholder")} aria-label={t("share.projectInvitePlaceholder")} />
          <Button type="button" variant="secondary" size="sm" className={styles.permissionButton} disabled>
            {t("share.projectEditable")} <ChevronDown aria-hidden="true" />
          </Button>
          <Button type="button" variant="secondary" size="sm" className={styles.inviteButton} disabled>{t("share.projectInvite")}</Button>
        </div>
        <div className={styles.ownerRow}>
          <span className={styles.ownerAvatar} aria-hidden="true">K</span>
          <span className={styles.ownerCopy}><strong>{t("rail.userScope")}</strong><small>{t("share.projectOwnerEmail")}</small></span>
          <span className={styles.ownerLabel}>{t("share.projectOwner")}</span>
        </div>
        <Button type="button" variant="default" size="sm" className={styles.copyButton} onClick={() => void copyProjectUrl()}>
          {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {copied ? t("share.projectCopied") : t("share.projectCopy")}
        </Button>
        <div className={styles.upgradeRow}><span>{t("share.projectHint")}</span><ChevronDown aria-hidden="true" /></div>
      </PopoverContent>
    </Popover>
  )
}
