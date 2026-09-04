"use client"

import { useEffect, useRef, useState, type RefObject, type SVGProps } from "react"
import Link from "next/link"
import { ArrowUpRight, Bell, ChevronRight, ChevronsUpDown, CircleHelp, FileText, Grid2X2, Home, LogOut, SlidersHorizontal, Sparkles, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatCredits } from "@/billing/format"
import { useT } from "@/i18n/context"
import { browserBillingClient, browserTeamClient } from "@/ui/shell/page-clients"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import { NotificationPanel } from "@/ui/notifications/notification-panel"
import notificationStyles from "@/ui/notifications/notification-panel.module.css"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

import { accountStyles, railStyles } from "./workspace-rail-styles"

export function ComputerStatusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg data-slot="computer-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="4" width="16" height="12" rx="2" />
      <path d="M7 20h7.5M10.5 16v4" />
      <circle cx="19" cy="16" r="2.5" fill="var(--sidebar)" />
    </svg>
  )
}

function useTeamName(preview: boolean): string | null | undefined {
  // undefined=未取，null=预览/无信封，string=已解析团队名（与 settings AccountCard 同源逻辑）。
  const [name, setName] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const namespace = await browserTeamClient({ preview }).currentNamespace()
        if (namespace === null) {
          if (live) setName(null)
          return
        }
        const teams = await browserTeamClient({ preview }).listMyTeams()
        if (live) setName(teams.find((entry) => entry.team.id === namespace)?.team.name ?? null)
      } catch {
        if (live) setName(null)
      }
    })()
    return () => {
      live = false
    }
  }, [preview])
  return name
}

export type WorkspaceRailAccountProps = {
  brandName?: string
  preview?: boolean
  compactDesktop: boolean
  onOpenSettings: (tab: SettingsTab) => void
  onOpenNotifications?: (returnTarget?: HTMLElement | null) => void
  accountTriggerRef?: RefObject<HTMLButtonElement | null>
}

/** Bottom identity, account menu, and utility actions for the rail footer. */
export function WorkspaceRailAccount({
  brandName,
  preview = false,
  compactDesktop,
  onOpenSettings,
  onOpenNotifications,
  accountTriggerRef,
}: WorkspaceRailAccountProps) {
  const t = useT()
  const teamName = useTeamName(preview)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [creditBalance, setCreditBalance] = useState("—")
  const accountSettingsFrameRef = useRef<number | null>(null)
  const previousCompactDesktopRef = useRef(compactDesktop)
  // Preview TeamClient data must not replace the site's product brand.
  const display = preview
    ? brandName ?? "Workspace"
    : teamName === undefined
      ? brandName ?? "Workspace"
      : teamName ?? brandName ?? "Workspace"
  const initial = (display.trim().charAt(0) || "K").toUpperCase()
  const accountCard = (
    <>
      <div className={railStyles.userAvatar} aria-hidden>{initial}</div>
      {!compactDesktop ? <div className={railStyles.userText}>
        <p className={railStyles.userName}>{display}</p>
        <p className={railStyles.userMeta}>{t("rail.userScope")}</p>
      </div> : null}
    </>
  )

  useEffect(() => () => {
    if (accountSettingsFrameRef.current !== null) {
      window.cancelAnimationFrame(accountSettingsFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (previousCompactDesktopRef.current === compactDesktop) return
    previousCompactDesktopRef.current = compactDesktop
    let live = true
    queueMicrotask(() => {
      if (live) setAccountMenuOpen(false)
    })
    return () => {
      live = false
    }
  }, [compactDesktop])

  useEffect(() => {
    let live = true
    void browserBillingClient({ preview }).summary()
      .then((summary) => { if (live) setCreditBalance(formatCredits(summary.balance_micros)) })
      .catch(() => { if (live) setCreditBalance("—") })
    return () => { live = false }
  }, [preview])

  const openSettingsFromAccount = (tab: SettingsTab) => {
    if (accountSettingsFrameRef.current !== null) {
      window.cancelAnimationFrame(accountSettingsFrameRef.current)
    }
    // Close the DropdownMenu before mounting Settings. One animation frame
    // lets Radix release its focus scope before the host opens the modal.
    setAccountMenuOpen(false)
    accountSettingsFrameRef.current = window.requestAnimationFrame(() => {
      accountSettingsFrameRef.current = null
      onOpenSettings(tab)
    })
  }

  const handleAccountMenuOpenChange = (open: boolean) => {
    if (open && accountSettingsFrameRef.current !== null) {
      window.cancelAnimationFrame(accountSettingsFrameRef.current)
      accountSettingsFrameRef.current = null
    }
    setAccountMenuOpen(open)
  }

  return (
    <div className={railStyles.userCard}>
      <DropdownMenu open={accountMenuOpen} onOpenChange={handleAccountMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={accountTriggerRef}
            variant="ghost"
            size="sm"
            type="button"
            className={railStyles.userTrigger}
            data-testid="rail-utility-account"
            data-rail-anchor="account"
            aria-label={`${display}, ${t("rail.userScope")}`}
            data-settings-return-target="account"
          >
            {accountCard}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className={accountStyles.accountMenu}>
          <DropdownMenuLabel className={accountStyles.accountSummary}>
            <span className={accountStyles.accountLargeAvatar} aria-hidden>{initial}</span>
            <span><strong>{display}</strong><small>{t("rail.userMenuScope")}</small></span>
            <ChevronsUpDown className={accountStyles.accountSwitcher} aria-hidden="true" />
          </DropdownMenuLabel>
          <div className={accountStyles.accountPlanGroup}>
            <div className={accountStyles.accountPlan}>
              <span><strong>{t("billing.freeTier")}</strong></span>
              <Button
                variant="default"
                size="sm"
                type="button"
                className={accountStyles.accountUpgrade}
                onClick={() => openSettingsFromAccount("subscription")}
              >
                {t("firstSite.upgrade")}
              </Button>
            </div>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("credits")}>
              <Sparkles aria-hidden="true" />
              <span className={accountStyles.accountCreditLabel}>{t("settings.creditsMenu")}<CircleHelp aria-hidden="true" /></span>
              <DropdownMenuShortcut className={accountStyles.accountCreditValue}>{creditBalance}<ChevronRight aria-hidden="true" /></DropdownMenuShortcut>
            </DropdownMenuItem>
          </div>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("account")}><UserRound aria-hidden="true" />{t("settings.accountTitle")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("personalization")}><Grid2X2 aria-hidden="true" />{t("settings.personalizationTitle")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openSettingsFromAccount("appearance")}><SlidersHorizontal aria-hidden="true" />{t("settings.title")}<DropdownMenuShortcut>⌘⇧,</DropdownMenuShortcut></DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link
            href="/app"
            prefetch={false}
            onClickCapture={(event) => interceptMountedSurfaceNavigation(event, "/app")}
          ><Home aria-hidden="true" />{t("rail.accountHome")}<ArrowUpRight className={accountStyles.accountLinkArrow} aria-hidden="true" /></Link></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/docs"><CircleHelp aria-hidden="true" />{t("rail.accountHelp")}<ArrowUpRight className={accountStyles.accountLinkArrow} aria-hidden="true" /></a></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/docs"><FileText aria-hidden="true" />{t("rail.accountDocs")}<ArrowUpRight className={accountStyles.accountLinkArrow} aria-hidden="true" /></a></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.assign("/") })}>
            <LogOut aria-hidden="true" />{t("settings.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className={railStyles.accountStatus}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={railStyles.utilityAction}
          data-testid="rail-utility-device"
          data-rail-anchor="utility"
          aria-label={t("settings.computerTitle")}
          onClick={() => onOpenSettings("computer")}
        >
          <ComputerStatusIcon className={railStyles.icon} aria-hidden="true" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={railStyles.utilityAction}
              data-testid="rail-utility-notifications"
              data-rail-anchor="utility"
              aria-label={t("notifications.open")}
              onClick={(event) => onOpenNotifications?.(event.currentTarget)}
            >
              <Bell className={railStyles.icon} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="end"
            sideOffset={8}
            className={notificationStyles.notificationsPopover}
            aria-label={t("notifications.title")}
          >
            <NotificationPanel />
          </PopoverContent>
        </Popover>
      </span>
    </div>
  )
}
