import type { RefObject } from "react"
import { ArchiveX, Trash2, Ellipsis, History, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"

export type PersonalSkillOperation = "update" | "withdraw" | "history" | "delete"

/** Publisher management and removing one's installation have distinct authority. */
export function PersonalSkillActions({ disabled, writable = true, onSelect, onRemoveInstallation, triggerRef }: {
  disabled: boolean
  writable?: boolean
  onSelect?: (operation: PersonalSkillOperation) => void
  onRemoveInstallation?: () => void
  triggerRef?: RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button ref={triggerRef} type="button" variant="ghost" size="icon-sm" aria-label={t("skills.detailMore")} disabled={disabled}><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-50 rounded-xl border-0 p-1">
      {onSelect ? <>
      <DropdownMenuItem onSelect={() => onSelect("history")}><History aria-hidden="true" />{t("skills.history.title")}</DropdownMenuItem>
      {writable ? <DropdownMenuItem onSelect={() => onSelect("update")}><RefreshCw aria-hidden="true" />{t("skills.lifecycle.update")}</DropdownMenuItem> : null}
      {writable ? <DropdownMenuItem variant="destructive" onSelect={() => onSelect("withdraw")}><ArchiveX aria-hidden="true" />{t("skills.lifecycle.withdraw")}</DropdownMenuItem> : null}
      <DropdownMenuItem variant="destructive" onSelect={() => onSelect("delete")}><Trash2 aria-hidden="true" />{t("skills.delete.action")}</DropdownMenuItem>
      </> : null}
      {onSelect && onRemoveInstallation ? <DropdownMenuSeparator /> : null}
      {onRemoveInstallation ? <DropdownMenuItem variant="destructive" className="h-9 rounded-lg p-2 text-sm font-normal" onSelect={onRemoveInstallation}><Trash2 aria-hidden="true" />{t("skills.personal.remove")}</DropdownMenuItem> : null}
    </DropdownMenuContent>
  </DropdownMenu>
}
