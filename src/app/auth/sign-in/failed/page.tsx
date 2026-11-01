import type { Metadata } from "next"
import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AudioLines } from "lucide-react"

import { admittedNativeSession, nativeProductBffConfig, nativeSessionBffHeaders } from "@/lib/server/product-bff"
import { SignInRecovery } from "@/ui/auth/sign-in-recovery"

export const metadata: Metadata = { title: "登录 · Kokoro", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** Read-only navigation recovery; /app still owns fresh product admission. */
export default async function SignInFailurePage() {
  let current = false
  try {
    const config = nativeProductBffConfig(process.env)
    const incoming = await headers()
    if (config && incoming.get("host") === new URL(config.session.webOrigin).host) {
      const requestHeaders = new Headers()
      const cookie = incoming.get("cookie")
      if (cookie !== null) requestHeaders.set("cookie", cookie)
      const request = new Request(`${config.session.webOrigin}/app`, { headers: requestHeaders })
      if (nativeSessionBffHeaders(request, config, randomUUID()).state === "valid") current = await admittedNativeSession(request, config) !== null
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
