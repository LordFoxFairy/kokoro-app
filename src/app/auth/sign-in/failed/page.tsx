import type { Metadata } from "next"
import { AudioLines } from "lucide-react"

import { SignInRecovery } from "@/ui/auth/sign-in-recovery"

export const metadata: Metadata = { title: "登录 · Kokoro", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** The GET-only client preserves this tab's navigation intent; /app still owns admission. */
export default function SignInFailurePage() {
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
