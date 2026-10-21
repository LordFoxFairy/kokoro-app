import { ArchiveX, Ellipsis, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"

export type PersonalSkillOperation = "update" | "withdraw"

/** Opening an action only asks the self-managed API to verify the publisher. */
export function PersonalSkillActions({ disabled, onSelect }: {
  disabled: boolean
  onSelect: (operation: PersonalSkillOperation) => void
}) {
  const t = useT()
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t("skills.detailMore")} disabled={disabled}><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-50">
      <DropdownMenuItem onSelect={() => onSelect("update")}><RefreshCw aria-hidden="true" />{t("skills.lifecycle.update")}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => onSelect("withdraw")}><ArchiveX aria-hidden="true" />{t("skills.lifecycle.withdraw")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
