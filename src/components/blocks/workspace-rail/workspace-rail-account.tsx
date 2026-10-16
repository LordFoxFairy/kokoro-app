"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import Link from "next/link"
import { ArrowUpRight, Bell, ChevronRight, ChevronsUpDown, CircleHelp, FileText, Grid2X2, Home, LogOut, Monitor, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react"

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
import { endProductSession } from "@/ui/auth/product-auth-client"
import { browserBillingClient } from "@/ui/shell/page-clients"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import { NotificationPanel } from "@/ui/notifications/notification-panel"
import notificationStyles from "@/ui/notifications/notification-panel.module.css"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

import { accountStyles, railStyles } from "./workspace-rail-styles"

// The local marker is only an additional consistency guard; it grants no access.
function readCreditActor(): string | null | undefined {
  try { return window.localStorage.getItem("kokoro.web.auth-index-subject") } catch { return undefined }
}

export type WorkspaceRailAccountProps = {
  brandName?: string
  preview?: boolean
  readBoundary?: ProjectReadBoundary
  compactDesktop: boolean
  onOpenSettings: (tab: SettingsTab) => void
  onOpenNotifications?: (returnTarget?: HTMLElement | null) => void
  accountTriggerRef?: RefObject<HTMLButtonElement | null>
}

/** Bottom identity, account menu, and utility actions for the rail footer. */
export function WorkspaceRailAccount({
  brandName,
  preview = false,
  readBoundary,
  compactDesktop,
  onOpenSettings,
  onOpenNotifications,
  accountTriggerRef,
}: WorkspaceRailAccountProps) {
  const t = useT()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [adminAccess, setAdminAccess] = useState<{ manageUrl: string } | null>(null)
  const actor = readCreditActor()
  const admitted = readBoundary?.admitted === true
  const subject = readBoundary?.subject ?? null
  const generation = readBoundary?.generation ?? null
  // A new object retires the prior attempt even if an old A tuple returns after B.
  const creditScope = useMemo(() => ({ preview, admitted, subject, generation, actor }), [preview, admitted, subject, generation, actor])
  const creditEligible = preview || (admitted && typeof subject === "string" && subject.trim().length > 0
    && generation !== null && Number.isSafeInteger(generation) && generation >= 0 && actor === subject)
  const [credit, setCredit] = useState<{ scope: typeof creditScope; balance: string }>({ scope: creditScope, balance: "—" })
  if (credit.scope !== creditScope) {
    // Permanently retire, rather than cache, the old private display projection.
    setCredit({ scope: creditScope, balance: "—" })
  }
  const creditAttempt = useRef<AbortController | null>(null)
  const creditBalance = creditEligible && credit.scope === creditScope ? credit.balance : "—"
  const accountSettingsFrameRef = useRef<number | null>(null)
  const previousCompactDesktopRef = useRef(compactDesktop)
  // The deployment tenant is fixed; the rail shows product identity, not an IAM namespace switcher.
  const display = brandName ?? "Kokoro"
  const initial = (display.trim().charAt(0) || "K").toUpperCase()
  const accountCard = (
    <>
      <div className={railStyles.userAvatar} aria-hidden>{initial}</div>
      {!compactDesktop ? <div className={railStyles.userText}>
        <p className={railStyles.userName}>{display}</p>
      </div> : null}
    </>
  )

  useEffect(() => () => {
    if (accountSettingsFrameRef.current !== null) {
      window.cancelAnimationFrame(accountSettingsFrameRef.current)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/admin-access", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as unknown : null)
      .then((value) => {
        if (controller.signal.aborted || typeof value !== "object" || value === null) return
        const access = value as { platform_admin?: unknown; manage_url?: unknown }
        setAdminAccess(access.platform_admin === true && typeof access.manage_url === "string" ? { manageUrl: access.manage_url } : null)
      })
      .catch(() => undefined)
    return () => controller.abort()
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

  useLayoutEffect(() => {
    if (!creditEligible) return
    const controller = new AbortController()
    creditAttempt.current = controller
    const current = () => creditAttempt.current === controller && !controller.signal.aborted && readCreditActor() === creditScope.actor
    void browserBillingClient({ preview: creditScope.preview }).summary(controller.signal)
      .then((summary) => { if (current()) setCredit({ scope: creditScope, balance: formatCredits(summary.available_micros) }) })
      .catch(() => { if (current()) setCredit({ scope: creditScope, balance: "—" }) })
    return () => { controller.abort(); if (creditAttempt.current === controller) creditAttempt.current = null }
  }, [creditEligible, creditScope])

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
              <span><strong>—</strong></span>
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
          {adminAccess ? <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><a href={adminAccess.manageUrl}><ShieldCheck aria-hidden="true" />后台管理<ArrowUpRight className={accountStyles.accountLinkArrow} aria-hidden="true" /></a></DropdownMenuItem>
          </> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link
            href="/app"
            prefetch={false}
            onClickCapture={(event) => interceptMountedSurfaceNavigation(event, "/app")}
          ><Home aria-hidden="true" />{t("rail.accountHome")}<ArrowUpRight className={accountStyles.accountLinkArrow} aria-hidden="true" /></Link></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/docs"><CircleHelp aria-hidden="true" />{t("rail.accountHelp")}<ArrowUpRight className={accountStyles.accountLinkArrow} aria-hidden="true" /></a></DropdownMenuItem>
          <DropdownMenuItem asChild><Link
            href="/app/library"
            prefetch={false}
            onClickCapture={(event) => interceptMountedSurfaceNavigation(event, "/app/library")}
          ><FileText aria-hidden="true" />{t("rail.accountDocs")}<ArrowUpRight className={accountStyles.accountLinkArrow} aria-hidden="true" /></Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void endProductSession()}>
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
          disabled
          aria-disabled="true"
          aria-label={t("rail.computer")}
          title={`${t("rail.computer")} · ${t("firstSite.unavailable")}`}
        >
          <Monitor className={railStyles.icon} aria-hidden="true" />
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
