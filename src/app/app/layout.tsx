import { headers } from "next/headers"
import { randomUUID } from "node:crypto"

import { parseProductReturnTarget } from "@/lib/product-return-target"
import { parseRailCollapsedCookie } from "@/lib/sidebar-preference"

import { admittedNativeSession, nativeProductBffConfig, nativeSessionBffHeaders } from "@/lib/server/product-bff"
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

  const config = nativeProductBffConfig(process.env)
  if (config === null) return <AppGate {...presentation} serverUnavailable />
  const host = incoming.get("host")
  let trustedOrigin: URL
  try {
    trustedOrigin = new URL(config.session.webOrigin)
  } catch {
    return <AppGate {...presentation} serverUnavailable />
  }
  if (host !== trustedOrigin.host) return <AppGate {...presentation} serverUnavailable />

  const nativeRequest = new Request(`${trustedOrigin.origin}/app`, { headers: incoming })
  const native = nativeSessionBffHeaders(nativeRequest, config, randomUUID())
  if (native.state === "invalid") return <AppGate {...presentation} serverUnavailable />
  if (native.state === "missing") {
    const target = parseProductReturnTarget(incoming.get("x-kokoro-product-return-target") ?? "")
    return <ProductSignInRedirect fallbackTarget={target} />
  }
  let admitted = false
  try { admitted = await admittedNativeSession(nativeRequest, config) !== null }
  catch { return <AppGate {...presentation} serverUnavailable /> }
  if (!admitted) {
    const target = parseProductReturnTarget(incoming.get("x-kokoro-product-return-target") ?? "")
    return <ProductSignInRedirect fallbackTarget={target} />
  }
  return <AppGate {...presentation} serverAdmitted />
}
