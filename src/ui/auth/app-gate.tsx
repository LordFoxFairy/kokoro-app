"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { useT } from "@/i18n/context"
import { usePathname, useRouter } from "next/navigation"

import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { KokoroAppSurface } from "@/features/app/kokoro-app-surface"
import { DEFAULT_BRAND } from "@/config/brand"

import { Button } from "@/components/ui/button"
import { ProductReadRecheckProvider } from "./product-read-recheck-context"

import { useSessionProbe } from "./use-session-state"
import { openProductSignIn } from "./product-auth-client"
import { useScheduledTaskClient } from "./use-scheduled-task-client"
import { bindBrowserMessagePartsReadRecheck } from "@/ui/shell/page-clients"

export function AppGate({ brandName, desktopRailCollapsed, serverAdmitted = false, serverUnavailable = false }: {
  brandName?: string
  desktopRailCollapsed?: boolean
  serverAdmitted?: boolean
  serverUnavailable?: boolean
} = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const probe = useSessionProbe({ serverUnavailable, serverAdmitted })
  const scheduledTaskClient = useScheduledTaskClient(probe.projectReadBoundary)
  const anonymousNavigationStarted = useRef(false)
  // Identity is decided only by the Product Session. System supplies optional
  // presentation after authentication; its outage must not block core Chat or
  // switch the live transport into preview mode.
  const { manifest, source } = useRuntimeManifest({ preview: probe.mode !== "authenticated" })
  const livePresentation = source === "live" && probe.mode === "authenticated"
  const brand = livePresentation ? manifest.brand : DEFAULT_BRAND
  const brandLogoUrl = livePresentation ? manifest.brand.logoUrl : undefined
  const state = probe.state

  useLayoutEffect(() => bindBrowserMessagePartsReadRecheck(subject => {
    const boundary = probe.projectReadBoundary, report = probe.reportReadUnauthorized
    if (serverUnavailable || probe.mode !== "authenticated" || !boundary.admitted || boundary.subject !== subject || !report) return
    // The engine captures this exact epoch before its page GET. Later renders
    // must not reconstruct a failed read's proof from a replacement identity.
    return async signal => await report({ subject, generation: boundary.generation, signal }) === true
  }), [probe.projectReadBoundary, probe.reportReadUnauthorized, probe.mode, serverUnavailable])

  useEffect(() => {
    if (state !== "anonymous" || window.location.pathname === "/login") {
      anonymousNavigationStarted.current = false
      return
    }
    if (anonymousNavigationStarted.current) return
    anonymousNavigationStarted.current = true
    try { openProductSignIn() }
    catch { /* Keep the data-free shell; never restore private Runtime. */ }
  }, [pathname, state])

  const unavailable = serverUnavailable || state === "unavailable" || probe.unavailable
  // Retain the last verified actor's mounted presentation and frozen intents.
  // The existing admission boundary still retires scoped reads and mutation actions.
  const booting = serverUnavailable || probe.mode === "checking" || serverAdmitted && probe.mode !== "authenticated"

  useEffect(() => {
    if (!serverUnavailable) return
    let live = true
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const delays = [1_000, 3_000]
    const schedule = () => {
      if (!live || timer !== undefined || attempt >= delays.length) return
      timer = setTimeout(() => {
        timer = undefined
        if (!live || document.visibilityState !== "visible") return
        attempt++
        // RSC refresh re-runs the authoritative server admission without a
        // document reload, a second login flow or exporting browser tokens.
        router.refresh()
        schedule()
      }, delays[attempt])
    }
    const resume = () => {
      if (document.visibilityState === "visible" && timer === undefined) {
        attempt = 0
        schedule()
      }
    }
    schedule()
    window.addEventListener("online", resume)
    window.addEventListener("focus", resume)
    window.addEventListener("pageshow", resume)
    document.addEventListener("visibilitychange", resume)
    return () => {
      live = false
      clearTimeout(timer)
      window.removeEventListener("online", resume)
      window.removeEventListener("focus", resume)
      window.removeEventListener("pageshow", resume)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [serverUnavailable, router])

  // Product-owned defaults are not preview data. Only a verified live manifest
  // may override visual presentation or feature flags.
  return (<>
    {unavailable && !probe.readRecoveryBlocked ? <p role="status" aria-live="polite" className="sr-only">{t("thread.reconnecting")}</p> : null}
    {probe.readRecoveryBlocked ? (
      <div
        role="status"
        aria-label={t("thread.connectionUnavailable")}
        aria-live="polite"
        className="fixed inset-x-3 top-3 z-50 mx-auto flex max-h-[calc(100dvh-1.5rem)] max-w-md flex-wrap items-center justify-between gap-3 overflow-y-auto rounded-xl border border-border bg-background p-3 text-sm text-foreground shadow-sm"
      >
        <span className="min-w-0 flex-1 break-words">{t("thread.connectionUnavailable")}</span>
        <Button type="button" variant="outline" size="sm" onClick={probe.retry}>{t("firstSite.retry")}</Button>
      </div>
    ) : null}
    <ProductReadRecheckProvider value={probe.reportReadUnauthorized ?? null}>
    <KokoroAppSurface
      booting={booting}
      {...(desktopRailCollapsed === undefined ? {} : { desktopRailCollapsed })}
      brandName={brandName ?? brand.name}
      brandMark={brand.mark}
      {...(brandLogoUrl === undefined ? {} : { brandLogoUrl })}
      {...(livePresentation ? { navigation: manifest.navigation, featureFlags: manifest.featureFlags } : {})}
      preview={!serverUnavailable && probe.mode === "preview"}
      projectReadBoundary={probe.projectReadBoundary}
      {...(!booting && probe.mode === "authenticated" ? { scheduledTaskClient } : {})}
    />
    </ProductReadRecheckProvider>
  </>)
}
