"use client"

import type { WorkspaceHeaderIdentityProps } from "./workspace-header.types"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/context"
import { Check, ChevronDown } from "lucide-react"
import { DEFAULT_BRAND } from "@/config/brand"
import { useState } from "react"

import styles from "./workspace-header-popovers.module.css"

type AgentTier = "max" | "balanced" | "lite"

export function WorkspaceHeaderIdentity({
  brandName = DEFAULT_BRAND.name,
}: WorkspaceHeaderIdentityProps) {
  const t = useT()
  const [tier, setTier] = useState<AgentTier>("lite")
  const [open, setOpen] = useState(false)

  const options: ReadonlyArray<{
    key: AgentTier
    label: string
    description: "firstSite.modelMax" | "firstSite.modelBalanced" | "firstSite.modelFast"
    pro?: boolean
  }> = [
    { key: "max", label: `${brandName} 1.6 Max`, description: "firstSite.modelMax", pro: true },
    { key: "balanced", label: `${brandName} 1.6`, description: "firstSite.modelBalanced", pro: true },
    { key: "lite", label: `${brandName} 1.6 Lite`, description: "firstSite.modelFast" },
  ]

  const selected = options.find((option) => option.key === tier) ?? options[2]

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={styles.agentTrigger}
            aria-label={`${brandName} ${t("settings.accountSpaceLabel")}`}
          >
            <span>{selected.label}</span>
            <ChevronDown data-icon="inline-end" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className={styles.agentPopover}
          aria-label={t("firstSite.chooseModel")}
        >
          <div className={styles.agentOptions} role="radiogroup" aria-label={t("firstSite.chooseModel")}>
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={tier === option.key}
                className={styles.agentOption}
                onClick={() => {
                  setTier(option.key)
                  setOpen(false)
                }}
              >
                <span className={styles.agentOptionTitle}>
                  <span>{option.label}</span>
                  {option.pro ? <span className={styles.agentPro}>{t("firstSite.modelBadgePro")}</span> : null}
                </span>
                <span className={styles.agentDescription}>{t(option.description)}</span>
                {tier === option.key ? <Check aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
