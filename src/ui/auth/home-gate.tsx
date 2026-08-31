"use client"

// 首页闸（WEB-FACE 面一）：从 System runtime manifest 得到品牌后按会话态分流——
// 有效信封/预览档 → 会话工作台（现行为）；匿名 → 营销落地页。探针未回前渲染空白（不闪登录/落地）。
// 登录卡已迁出到 `/login`（面二），首页不再内联登录表单。

import { LandingPage } from "@/ui/marketing/landing-page"
import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useT } from "@/i18n/context"

import { useSessionState } from "./use-session-state"
import { RuntimeUnavailable } from "./runtime-unavailable"
import { RuntimeLoading } from "./runtime-loading"

export function HomeGate({ brandName }: { brandName?: string }) {
  const router = useRouter()
  const t = useT()
  const state = useSessionState()
  const { manifest, source, retry, retrying = false } = useRuntimeManifest()

  useEffect(() => {
    if (state === "pass") router.replace("/app")
  }, [router, state])

  if (state === "checking" || source === "loading") {
    return <RuntimeLoading label={t("shell.loadingWorkspace")} />
  }
  if (source === "error" || retrying) {
    return (
      <RuntimeUnavailable
        onRetry={retry}
        retrying={retrying}
        brandName={brandName ?? manifest.brand.name}
        brandMark={manifest.brand.mark}
        brandLogoUrl={manifest.brand.logoUrl}
      />
    )
  }
  if (state === "anonymous") {
    return (
      <LandingPage
        brandName={brandName ?? manifest.brand.name}
        brandMark={manifest.brand.mark}
        brandLogoUrl={manifest.brand.logoUrl}
      />
    )
  }
  return <RuntimeLoading label={t("shell.loadingWorkspace")} />
}
