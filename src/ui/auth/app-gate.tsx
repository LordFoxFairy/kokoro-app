"use client"

import { useEffect } from "react"
import { useT } from "@/i18n/context"
import { useRouter } from "next/navigation"

import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { KokoroAppSurface } from "@/features/app/kokoro-app-surface"
import { DEFAULT_BRAND } from "@/config/brand"

import { useSessionProbe } from "./use-session-state"
import { RuntimeLoading } from "./runtime-loading"
import { browserScheduledTaskClient } from "@/ui/shell/page-clients"

export function AppGate({ brandName }: { brandName?: string } = {}) {
  const router = useRouter()
  const t = useT()
  const probe = useSessionProbe()
  // Identity is decided only by the Product Session. System supplies optional
  // presentation after authentication; its outage must not block core Chat or
  // switch the live transport into preview mode.
  const { manifest, source } = useRuntimeManifest({ preview: probe.mode !== "authenticated" })
  const livePresentation = source === "live" && probe.mode === "authenticated"
  const brand = livePresentation ? manifest.brand : DEFAULT_BRAND
  const brandLogoUrl = livePresentation ? manifest.brand.logoUrl : undefined
  const state = probe.state

  useEffect(() => {
    if (state === "anonymous") router.replace("/login")
  }, [router, state])

  if (state === "checking" || state === "anonymous") {
    return <RuntimeLoading label={t("shell.loadingApp")} />
  }

  // Product-owned defaults are not preview data. Only a verified live manifest
  // may override visual presentation or feature flags.
  return (
    <KokoroAppSurface
      brandName={brandName ?? brand.name}
      brandMark={brand.mark}
      {...(brandLogoUrl === undefined ? {} : { brandLogoUrl })}
      {...(livePresentation ? { navigation: manifest.navigation, featureFlags: manifest.featureFlags } : {})}
      preview={probe.mode === "preview"}
      {...(probe.mode === "authenticated" ? { scheduledTaskClient: browserScheduledTaskClient() } : {})}
    />
  )
}
