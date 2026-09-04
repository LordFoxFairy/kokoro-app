"use client"

import { ChevronRight, UserRoundPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import { accountStyles } from "./workspace-rail-styles"

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
      className={accountStyles.inviteCard}
      onClick={onOpen}
      aria-label={t("rail.inviteFriendsTitle", { brand: brandName })}
    >
      <UserRoundPlus className={accountStyles.inviteIcon} aria-hidden="true" />
      <span className={accountStyles.inviteCopy}>
        <strong>{t("rail.inviteFriendsTitle", { brand: brandName })}</strong>
        <small>{t("rail.inviteFriendsHint")}</small>
      </span>
      <ChevronRight className={accountStyles.inviteChevron} aria-hidden="true" />
    </Button>
  )
}
