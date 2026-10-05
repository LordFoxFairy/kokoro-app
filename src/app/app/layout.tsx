import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { oidcRpConfig } from "@/lib/server/oidc-provider"
import { activeProductSession } from "@/lib/server/product-session"
import { AppGate } from "@/ui/auth/app-gate"

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
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SESSION_PREVIEW === "1") {
    return <AppGate />
  }

  const incoming = await headers()
  const config = oidcRpConfig(process.env)
  if (config === null) return <AppGate serverUnavailable />
  const host = incoming.get("host")
  let trustedOrigin: URL
  try {
    trustedOrigin = new URL(config.relay.webOrigin)
  } catch {
    return <AppGate serverUnavailable />
  }
  if (host !== trustedOrigin.host) return <AppGate serverUnavailable />

  let session: Awaited<ReturnType<typeof activeProductSession>>
  try {
    const requestHeaders = new Headers()
    const cookie = incoming.get("cookie")
    if (cookie !== null) requestHeaders.set("cookie", cookie)
    session = await activeProductSession(
      new Request(`${trustedOrigin.origin}/app`, { headers: requestHeaders }),
      {
        redisUrl: config.redisUrl,
        webOrigin: config.relay.webOrigin,
        secret: config.authSecret,
      },
    )
  } catch {
    return <AppGate serverUnavailable />
  }
  if (session === null) redirect("/login")
  return <AppGate serverAdmitted />
}
