import type { Metadata } from "next"
import Link from "next/link"
import { AudioLines } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export const metadata: Metadata = { title: "退出登录 · Kokoro", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** This view is inert: only the explicit native form can ask the issuer to terminate a session. */
export default async function SignOutPage({ searchParams }: { searchParams: Promise<{ failed?: string | string[] }> }) {
  const failed = (await searchParams).failed !== undefined
  return (
    <main className="flex min-h-dvh w-full flex-col bg-background px-5 py-6 text-foreground sm:px-8">
      <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <AudioLines aria-hidden="true" className="size-6 text-primary" /> Kokoro
      </div>
      <section className="flex flex-1 items-center justify-center py-12" aria-labelledby="sign-out-heading">
        <Card className="w-full max-w-[420px] border-0 bg-transparent shadow-none">
          <CardHeader className="px-0 pb-6">
            <h1 id="sign-out-heading" className="text-3xl font-semibold tracking-tight">{failed ? "退出失败" : "退出账号登录"}</h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {failed ? "这次退出没有完成，请重新登录后再试。" : "确认退出当前浏览器的 Kokoro 账号登录。已保存的任务和资料不会被删除。"}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 px-0">
            {failed ? <Button asChild size="lg" className="h-11 w-full"><a href="/login">登录</a></Button>
              : <form method="post" action="/iam/oauth2/end-session/confirm">
                <Button type="submit" name="action" value="confirm" size="lg" className="h-11 w-full">退出登录</Button>
              </form>}
            <Button asChild variant="ghost" size="lg" className="h-11 w-full"><Link href="/" prefetch={false}>返回首页</Link></Button>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
