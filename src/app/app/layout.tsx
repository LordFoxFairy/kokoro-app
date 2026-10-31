import { headers } from "next/headers"
import { randomUUID } from "node:crypto"

import { parseProductReturnTarget } from "@/lib/product-return-target"
import { parseRailCollapsedCookie } from "@/lib/sidebar-preference"

import { oidcRpConfig } from "@/lib/server/oidc-provider"
import { productSessionState } from "@/lib/server/product-session"
import { admittedProductSession, nativeSessionBffHeaders, productBffConfig } from "@/lib/server/product-bff"
import { AppGate } from "@/ui/auth/app-gate"
import { ProductSignInRedirect } from "@/ui/auth/product-sign-in-redirect"

export const dynamic = "force-dynamic"

/**
 * Keep the authenticated workbench mounted while the primary rail moves
 * between direct chat and its catalog surfaces. A page-level AppGate remounts
 * the session probe on every Link navigation, which briefly paints the loading
 * surface and makes the rail flash. The app segment is the stable route shell;
 * `usePathname()` inside KokoroAppSurface still selects the active surface.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  void children
  const incoming = await headers()
  const collapsed = parseRailCollapsedCookie(incoming.get("cookie") ?? "")
  const presentation = collapsed === null ? {} : { desktopRailCollapsed: collapsed }
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SESSION_PREVIEW === "1") {
    return <AppGate {...presentation} />
  }

  const config = oidcRpConfig(process.env)
  if (config === null) return <AppGate {...presentation} serverUnavailable />
  const host = incoming.get("host")
  let trustedOrigin: URL
  try {
    trustedOrigin = new URL(config.relay.webOrigin)
  } catch {
    return <AppGate {...presentation} serverUnavailable />
  }
  if (host !== trustedOrigin.host) return <AppGate {...presentation} serverUnavailable />

  const bffConfig = productBffConfig()
  if (bffConfig !== null) {
    const nativeRequest = new Request(`${trustedOrigin.origin}/app`, { headers: incoming })
    const native = nativeSessionBffHeaders(nativeRequest, bffConfig, randomUUID())
    if (native.state === "invalid") return <AppGate {...presentation} serverUnavailable />
    if (native.state === "valid") {
      let nativeAdmitted = false
      let nativeUnavailable = false
      try {
        const session = await admittedProductSession(nativeRequest, bffConfig)
        nativeAdmitted = session !== null
      } catch { nativeUnavailable = true }
      if (nativeUnavailable) return <AppGate {...presentation} serverUnavailable />
      if (!nativeAdmitted) {
        const target = parseProductReturnTarget(incoming.get("x-kokoro-product-return-target") ?? "")
        return <ProductSignInRedirect fallbackTarget={target} />
      }
      return <AppGate {...presentation} serverAdmitted />
    }
  }

  let session: Awaited<ReturnType<typeof productSessionState>>
  try {
    const requestHeaders = new Headers()
    const cookie = incoming.get("cookie")
    if (cookie !== null) requestHeaders.set("cookie", cookie)
    session = await productSessionState(
      new Request(`${trustedOrigin.origin}/app`, { headers: requestHeaders }),
      {
        redisUrl: config.redisUrl,
        webOrigin: config.relay.webOrigin,
        secret: config.authSecret,
      },
    )
  } catch {
    return <AppGate {...presentation} serverUnavailable />
  }
  if (session.state === "refreshing" || session.state === "stale" || session.state === "unconfirmed") return <AppGate {...presentation} serverUnavailable />
  if (session.state === "absent") {
    const target = parseProductReturnTarget(incoming.get("x-kokoro-product-return-target") ?? "")
    // Fragments never reach SSR. Hand off only navigation to the browser; do
    // not mount the workbench or start private reads for an absent session.
    return <ProductSignInRedirect fallbackTarget={target} />
  }
  return <AppGate {...presentation} serverAdmitted />
}
