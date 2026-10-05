"use client"

import { useEffect, useRef } from "react"
import { useT } from "@/i18n/context"
import { usePathname } from "next/navigation"

import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { KokoroAppSurface } from "@/features/app/kokoro-app-surface"
import { DEFAULT_BRAND } from "@/config/brand"

import { useSessionProbe } from "./use-session-state"
import { openProductSignIn } from "./product-auth-client"
import { RuntimeLoading, RuntimeSessionUnavailable } from "./runtime-loading"
import { browserScheduledTaskClient } from "@/ui/shell/page-clients"

export function AppGate({ brandName, serverAdmitted = false, serverUnavailable = false }: {
  brandName?: string
  serverAdmitted?: boolean
  serverUnavailable?: boolean
} = {}) {
  const pathname = usePathname()
  const t = useT()
  const probe = useSessionProbe({ serverUnavailable })
  const anonymousNavigationStarted = useRef(false)
  // Identity is decided only by the Product Session. System supplies optional
  // presentation after authentication; its outage must not block core Chat or
  // switch the live transport into preview mode.
  const { manifest, source } = useRuntimeManifest({ preview: probe.mode !== "authenticated" })
  const livePresentation = source === "live" && probe.mode === "authenticated"
  const brand = livePresentation ? manifest.brand : DEFAULT_BRAND
  const brandLogoUrl = livePresentation ? manifest.brand.logoUrl : undefined
  const state = probe.state
  const retryServerAdmission = () => window.location.reload()

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

  if (serverUnavailable) {
    return <RuntimeSessionUnavailable label={t("shell.sessionUnavailable")} retryLabel={t("shell.sessionRetry")}
      pendingLabel={t("shell.loadingApp")} onRetry={retryServerAdmission} pending={false} />
  }

  if (state === "unavailable") {
    return <RuntimeSessionUnavailable label={t("shell.sessionUnavailable")} retryLabel={t("shell.sessionRetry")}
      pendingLabel={t("shell.loadingApp")} onRetry={probe.retry} pending={probe.requestPending} />
  }
  if ((state === "checking" || state === "anonymous") && !serverAdmitted) {
    return <RuntimeLoading label={t("shell.loadingApp")} />
  }

  // Product-owned defaults are not preview data. Only a verified live manifest
  // may override visual presentation or feature flags.
  return (<>
    {probe.unavailable ? <RuntimeSessionUnavailable compact label={t("shell.sessionUnavailable")} retryLabel={t("shell.sessionRetry")}
      pendingLabel={t("shell.loadingApp")} onRetry={probe.retry} pending={probe.requestPending} /> : null}
    <KokoroAppSurface
      booting={serverAdmitted && probe.mode !== "authenticated"}
      brandName={brandName ?? brand.name}
      brandMark={brand.mark}
      {...(brandLogoUrl === undefined ? {} : { brandLogoUrl })}
      {...(livePresentation ? { navigation: manifest.navigation, featureFlags: manifest.featureFlags } : {})}
      preview={probe.mode === "preview"}
      projectReadBoundary={probe.projectReadBoundary}
      {...(probe.mode === "authenticated" ? { scheduledTaskClient: browserScheduledTaskClient() } : {})}
    />
  </>)
}
