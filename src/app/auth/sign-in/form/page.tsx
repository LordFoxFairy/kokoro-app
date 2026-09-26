import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { AudioLines } from "lucide-react"

import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SignInFeedback } from "@/lib/server/iam-sign-in-feedback"
import { IAM_SIGN_IN_PATH, rawIamSignInQuery } from "@/lib/server/iam-sign-in-target"

export const metadata: Metadata = { title: "登录 · Kokoro", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

function readFeedback(raw: string | null): SignInFeedback | null {
  if (raw === null || !/^[A-Za-z0-9_-]{1,1024}$/u.test(raw)) return null
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null
    const fields = value as Record<string, unknown>
    if (![401, 429, 503].includes(fields.status as number) || typeof fields.email !== "string" ||
      !/^[^\s@]{1,64}@[^\s@]{1,189}$/u.test(fields.email)) return null
    return { status: fields.status as SignInFeedback["status"], email: fields.email }
  } catch {
    return null
  }
}

export default async function IamSignInPage() {
  const incoming = await headers()
  const query = incoming.get("x-kokoro-sign-in-query")
  const token = incoming.get("x-kokoro-sign-in-csrf")
  if (query === null || rawIamSignInQuery(`https://internal.invalid${IAM_SIGN_IN_PATH}${query}`) !== query ||
    token === null || !/^[A-Za-z0-9_-]{43}$/u.test(token)) notFound()

  const feedback = readFeedback(incoming.get("x-kokoro-sign-in-feedback"))
  const message = feedback?.status === 401 ? "邮箱或密码不正确。" : feedback?.status === 429
    ? "登录尝试次数过多，请稍后再试。" : feedback?.status === 503 ? "登录未完成，请重新提交。" : null

  return (
    <main className="grid min-h-dvh w-full bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16" aria-label="Kokoro">
        <div className="flex items-center gap-3 text-xl font-semibold tracking-tight">
          <AudioLines aria-hidden="true" className="size-7" /> Kokoro
        </div>
        <div className="max-w-lg pb-8">
          <p className="mb-5 text-sm font-medium tracking-[0.18em] text-primary-foreground/75">CREATE WITH CLARITY</p>
          <p className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">让想法，<br />继续生长。</p>
          <p className="mt-6 max-w-md text-base leading-7 text-primary-foreground/80">从一个问题开始，和 Kokoro 一起把思考变成作品。</p>
        </div>
        <p className="text-sm text-primary-foreground/65">Kokoro</p>
      </aside>

      <section className="flex min-w-0 flex-col px-5 py-6 sm:px-8 lg:px-12" aria-labelledby="sign-in-heading">
        <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight lg:invisible">
          <AudioLines aria-hidden="true" className="size-6 text-primary" /> Kokoro
        </div>
        <div className="flex flex-1 items-start justify-center pb-8 pt-14 sm:items-center sm:py-8 lg:py-12">
          <Card className="w-full max-w-[420px] border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 pb-6">
              <h1 id="sign-in-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">欢迎回来</h1>
              <p className="mt-2 text-base leading-relaxed text-foreground">使用你的 Kokoro 账号登录</p>
            </CardHeader>
            <CardContent className="px-0">
              <form method="post" action={`${IAM_SIGN_IN_PATH}${query}`} className="grid gap-5">
                <input type="hidden" name="csrf_token" value={token} />
                {message !== null ? <Alert className="border-[var(--error-border)] text-[var(--error-strong)]" id="sign-in-error">
                  <p className="col-start-2 text-sm font-medium text-[var(--error-strong)]">{message}</p>
                </Alert> : null}
                <div className="grid gap-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input id="email" name="email" type="email" inputMode="email" autoComplete="username"
                    defaultValue={feedback?.email ?? ""} aria-describedby={message !== null ? "sign-in-error" : undefined}
                    required className="h-11 bg-card text-base md:text-sm" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <Input id="password" name="password" type="password" autoComplete="current-password"
                    aria-describedby={message !== null ? "sign-in-error" : undefined}
                    required className="h-11 bg-card text-base md:text-sm" />
                </div>
                <Button type="submit" size="lg" className="mt-2 h-11 w-full text-sm">登录</Button>
              </form>
            </CardContent>
          </Card>
        </div>
        <p className="text-center text-xs text-foreground/70">© Kokoro</p>
      </section>
    </main>
  )
}
