import type { Metadata } from "next"
import Link from "next/link"
import { AudioLines } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export const metadata: Metadata = { title: "登录 · Kokoro", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** Inert destination: rendering or refreshing never starts another OAuth request. */
export default function SignInFailurePage() {
  return (
    <main className="flex min-h-dvh w-full flex-col bg-background px-5 py-6 text-foreground sm:px-8">
      <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <AudioLines aria-hidden="true" className="size-6 text-primary" /> Kokoro
      </div>
      <section className="flex flex-1 items-center justify-center py-12" aria-labelledby="sign-in-failure-heading">
        <Card className="w-full max-w-[420px] border-0 bg-transparent shadow-none">
          <CardHeader className="px-0 pb-6">
            <h1 id="sign-in-failure-heading" className="text-3xl font-semibold tracking-tight">登录失败</h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">这次登录没有完成，请重新登录。</p>
          </CardHeader>
          <CardContent className="grid gap-3 px-0">
            <Button asChild size="lg" className="h-11 w-full"><a href="/login">登录</a></Button>
            <Button asChild variant="ghost" size="lg" className="h-11 w-full"><Link href="/" prefetch={false}>返回首页</Link></Button>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
