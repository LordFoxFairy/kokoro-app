"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

const EPISODE_MS = 10_000
const RECHECK_MS = 1_000

type Episode = {
  controller: AbortController
  deadline: number
  timeout?: ReturnType<typeof setTimeout>
  retry?: ReturnType<typeof setTimeout>
}

/** A navigation observation only, never a cached identity or product admission. */
function currentSession(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false
  const value = raw as Record<string, unknown>
  return Object.keys(value).sort().join(",") === "authenticated,expires_at,subject" && value.authenticated === true &&
    typeof value.subject === "string" && value.subject.trim() !== "" && value.subject.length <= 256 &&
    typeof value.expires_at === "number" && Number.isFinite(value.expires_at) && value.expires_at > Date.now()
}

/** Observe an existing Session after a native login failure; never renew or start OAuth. */
export function SignInRecovery() {
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const explicitRecovery = useRef<() => void>(() => {})
  useEffect(() => {
    let live = true
    let navigated = false
    let episode: Episode | null = null
    const visible = () => live && !navigated && document.visibilityState !== "hidden"
    const retire = (update = true) => {
      const previous = episode
      episode = null
      if (previous) {
        clearTimeout(previous.timeout)
        clearTimeout(previous.retry)
        previous.controller.abort()
      }
      if (update && live) setChecking(false)
    }
    const start = () => {
      if (!visible() || episode !== null) return
      const observation: Episode = { controller: new AbortController(), deadline: Date.now() + EPISODE_MS }
      episode = observation
      setChecking(true)
      const current = () => visible() && episode === observation && !observation.controller.signal.aborted && Date.now() < observation.deadline
      observation.timeout = setTimeout(() => { if (episode === observation) retire() }, EPISODE_MS)
      const read = async (attempt: number) => {
        if (!current()) return
        try {
          const response = await fetch("/api/auth/session", {
            method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error", signal: observation.controller.signal,
          })
          if (!current()) { void response.body?.cancel().catch(() => undefined); return }
          if (response.status === 200) {
            const raw: unknown = await response.json()
            if (!current()) return
            if (currentSession(raw)) {
              navigated = true
              retire()
              router.replace("/app")
              return
            }
          } else { void response.body?.cancel().catch(() => undefined) }
        } catch { /* Network, body, permission and anonymous outcomes never authorize navigation. */ }
        if (!current()) return
        if (attempt === 1 && observation.deadline - Date.now() > RECHECK_MS) {
          observation.retry = setTimeout(() => { void read(2) }, RECHECK_MS)
        } else retire()
      }
      void read(1)
    }
    explicitRecovery.current = () => {
      if (!visible() || episode !== null) return
      start()
      router.refresh()
    }
    const onVisibility = () => { if (document.visibilityState === "hidden") retire(); else start() }
    const onPageHide = () => retire()
    window.addEventListener("focus", start)
    window.addEventListener("online", start)
    window.addEventListener("pageshow", start)
    window.addEventListener("pagehide", onPageHide)
    document.addEventListener("visibilitychange", onVisibility)
    start()
    return () => {
      live = false
      retire(false)
      explicitRecovery.current = () => {}
      window.removeEventListener("focus", start)
      window.removeEventListener("online", start)
      window.removeEventListener("pageshow", start)
      window.removeEventListener("pagehide", onPageHide)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router])
  return (
    <Card className="w-full max-w-[420px] border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pb-6">
        <h1 id="sign-in-recovery-heading" className="text-3xl font-semibold tracking-tight">恢复工作区</h1>
        <p role="status" aria-live="polite" className="mt-2 text-base leading-relaxed text-muted-foreground">
          {checking ? "正在检查登录状态…" : "登录状态尚未确认。可以重新检查，或重新登录。"}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 px-0">
        <Button type="button" size="lg" className="h-11 w-full" disabled={checking} onClick={() => explicitRecovery.current()}>检查并继续</Button>
        <Button asChild variant="outline" size="lg" className="h-11 w-full"><a href="/login">重新登录</a></Button>
      </CardContent>
    </Card>
  )
}
