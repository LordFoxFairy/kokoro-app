"use client"

import { ChevronRight, HandHeart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import styles from "./workspace-rail.module.css"

type WorkspaceInviteCardProps = {
  brandName: string
  onOpen: () => void
}

/** The compact footer promotion shown by the desktop workspace rail. */
export function WorkspaceInviteCard({ brandName, onOpen }: WorkspaceInviteCardProps) {
  const t = useT()

  return (
    <Button
      type="button"
      variant="ghost"
      className={styles.inviteCard}
      onClick={onOpen}
      aria-label={t("rail.inviteFriendsTitle", { brand: brandName })}
    >
      <HandHeart className={styles.inviteIcon} aria-hidden="true" />
      <span className={styles.inviteCopy}>
        <strong>{t("rail.inviteFriendsTitle", { brand: brandName })}</strong>
        <small>{t("rail.inviteFriendsHint")}</small>
      </span>
      <ChevronRight className={styles.inviteChevron} aria-hidden="true" />
    </Button>
  )
}
