"use client"

import { ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"
import styles from "./project-skills.module.css"

type Props = {
  disabled: boolean
  primary?: boolean
  onPick: (source: "personal" | "official") => void
  onManage?: () => void
}

/** Toolbar and empty-state actions use the same supported source choices. */
export function ProjectSkillAddMenu({
  disabled,
  primary = false,
  onPick,
  onManage,
}: Props) {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={styles.addButton}
          variant={primary ? "default" : "outline"}
          disabled={disabled}
        >
          <Plus aria-hidden="true" />
          {t(primary ? "skills.create" : "firstSite.add")}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onPick("personal")}>
          {t("projectSkills.fromMine")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPick("official")}>
          {t("projectSkills.fromOfficial")}
        </DropdownMenuItem>
        {onManage ? (
          <DropdownMenuItem onSelect={onManage}>
            {t("firstSite.manageSkills")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
