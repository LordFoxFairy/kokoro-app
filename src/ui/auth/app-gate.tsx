"use client"

import { useEffect } from "react"
import { useT } from "@/i18n/context"
import { useRouter } from "next/navigation"

import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { KokoroAppSurface } from "@/features/app/kokoro-app-surface"

import { useSessionProbe } from "./use-session-state"
import { RuntimeUnavailable } from "./runtime-unavailable"
import { RuntimeLoading } from "./runtime-loading"
import { browserScheduledTaskClient } from "@/ui/shell/page-clients"

export function AppGate({ brandName }: { brandName?: string } = {}) {
  const router = useRouter()
  const t = useT()
  const probe = useSessionProbe()
  // The authenticated workspace must consume the same System skin as the
  // public/login surfaces; otherwise the product silently falls back to
  // the default palette after the redirect to /app.
  // Session probing is asynchronous. Treat the undecided first render as a
  // local preview so it does not fire a live System request that is guaranteed
  // to race the probe and leave a misleading 503 in the browser console. Once
  // the server explicitly confirms authentication, the hook flips to live
  // mode and fetches the deployment-scoped manifest.
  const { manifest, source, retry } = useRuntimeManifest({ preview: probe.mode !== "authenticated" })
  const brandLogoUrl = manifest.brand.logoUrl
  const state = probe.state

  useEffect(() => {
    if (state === "anonymous") router.replace("/login")
  }, [router, state])

  if (state === "checking" || state === "anonymous" || source === "loading") {
    return <RuntimeLoading label={t("shell.loadingApp")} />
  }
  if (source === "error") {
    return (
      <RuntimeUnavailable
        onRetry={retry}
        brandName={brandName ?? manifest.brand.name}
        brandMark={manifest.brand.mark}
        {...(brandLogoUrl === undefined ? {} : { brandLogoUrl })}
      />
    )
  }

  // The route owns only authentication/runtime wiring. Product layout lives in
  // the canonical AppFrame block without introducing a runtime product selector.
  return (
    <KokoroAppSurface
      brandName={brandName ?? manifest.brand.name}
      brandMark={manifest.brand.mark}
      {...(brandLogoUrl === undefined ? {} : { brandLogoUrl })}
      {...(probe.mode === "preview" ? {} : { navigation: manifest.navigation })}
      {...(probe.mode === "preview" ? {} : { featureFlags: manifest.featureFlags })}
      preview={probe.mode === "preview"}
      {...(probe.mode === "authenticated" ? { scheduledTaskClient: browserScheduledTaskClient() } : {})}
    />
  )
}
