import { ArchiveX, Ellipsis, History, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"

export type PersonalSkillOperation = "update" | "withdraw" | "history"

/** Opening an action only asks the self-managed API to verify the publisher. */
export function PersonalSkillActions({ disabled, writable = true, onSelect }: {
  disabled: boolean
  writable?: boolean
  onSelect: (operation: PersonalSkillOperation) => void
}) {
  const t = useT()
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.detailMore")} disabled={disabled}><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-50">
      <DropdownMenuItem onSelect={() => onSelect("history")}><History aria-hidden="true" />{t("skills.history.title")}</DropdownMenuItem>
      {writable ? <DropdownMenuItem onSelect={() => onSelect("update")}><RefreshCw aria-hidden="true" />{t("skills.lifecycle.update")}</DropdownMenuItem> : null}
      {writable ? <DropdownMenuItem variant="destructive" onSelect={() => onSelect("withdraw")}><ArchiveX aria-hidden="true" />{t("skills.lifecycle.withdraw")}</DropdownMenuItem> : null}
    </DropdownMenuContent>
  </DropdownMenu>
}
