import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AudioLines } from "lucide-react"

import { oidcRpConfig } from "@/lib/server/oidc-provider"
import { activeProductSession } from "@/lib/server/product-session"
import { SignInRecovery } from "@/ui/auth/sign-in-recovery"

export const metadata: Metadata = { title: "登录 · Kokoro", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** Read-only navigation recovery; /app still owns fresh product admission. */
export default async function SignInFailurePage() {
  let current = false
  try {
    const config = oidcRpConfig(process.env)
    const incoming = await headers()
    if (config && incoming.get("host") === new URL(config.relay.webOrigin).host) {
      const requestHeaders = new Headers()
      const cookie = incoming.get("cookie")
      if (cookie !== null) requestHeaders.set("cookie", cookie)
      const session = await activeProductSession(new Request(`${config.relay.webOrigin}/app`, { headers: requestHeaders }), {
        redisUrl: config.redisUrl, webOrigin: config.relay.webOrigin, secret: config.authSecret,
      })
      current = session !== null
    }
  } catch { /* Keep explicit recovery; never start or replay authentication here. */ }
  // Next redirect throws its navigation signal; keep it outside the inspection catch.
  if (current) redirect("/app")
  return (
    <main className="flex min-h-dvh w-full flex-col bg-background px-5 py-6 text-foreground sm:px-8">
      <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <AudioLines aria-hidden="true" className="size-6 text-primary" /> Kokoro
      </div>
      <section className="flex flex-1 items-center justify-center py-12" aria-labelledby="sign-in-recovery-heading">
        <SignInRecovery />
      </section>
    </main>
  )
}
