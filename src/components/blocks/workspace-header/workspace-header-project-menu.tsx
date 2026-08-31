"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"
import { MoreHorizontal } from "lucide-react"

type WorkspaceHeaderProjectMenuProps = {
  onOpenSettings?: (tab: "account" | "subscription") => void
}

export function WorkspaceHeaderProjectMenu({ onOpenSettings }: WorkspaceHeaderProjectMenuProps) {
  const t = useT()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 min-h-8"
          aria-label={t("settings.moreSections")}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpenSettings?.("account")}>
          {t("settings.accountTitle")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenSettings?.("subscription")}>
          {t("firstSite.upgrade")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
