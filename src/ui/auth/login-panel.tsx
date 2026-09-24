"use client"

// The browser begins the fixed Product OIDC flow; credentials and tokens stay
// with the issuer and server-only RP, never with this page.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { DEFAULT_BRAND } from "@/config/brand"
import { useT } from "@/i18n/context"
import { beginProductSignIn } from "./product-auth-client"

import styles from "./login-panel.module.css"

type LoginState = "idle" | "connecting" | "failed"

export function LoginPanel({ initialFailure = false }: { initialFailure?: boolean }) {
  const t = useT()
  const [state, setState] = useState<LoginState>(initialFailure ? "failed" : "idle")
  const attemptRef = useRef<AbortController | null>(null)

  const startSignIn = useCallback(async (): Promise<void> => {
    if (attemptRef.current) return
    const controller = new AbortController()
    attemptRef.current = controller
    setState("connecting")
    try {
      await beginProductSignIn(controller.signal)
      // A successful form submission navigates away. Keep the transition UI
      // stable instead of flashing a second action before navigation commits.
    } catch {
      if (controller.signal.aborted) return
      attemptRef.current = null
      setState("failed")
    }
  }, [])

  useEffect(() => {
    return () => {
      attemptRef.current?.abort()
      attemptRef.current = null
    }
  }, [])

  const retry = (): void => {
    void startSignIn()
  }

  return (
    <main className={styles.screen}>
      <Link className={styles.brand} href="/" aria-label={DEFAULT_BRAND.name}>
        <BrandFallback mark={DEFAULT_BRAND.mark} className={styles.brandMark ?? ""} />
        <span>{DEFAULT_BRAND.name}</span>
      </Link>
      <div className={styles.stage}>
        <Card className={styles.card} data-testid="login-panel">
          <h1 className={styles.title}>{t(state === "connecting" ? "auth.connectingTitle" : "auth.title")}</h1>
          {state === "connecting" ? (
            <div className={styles.status} role="status" aria-live="polite">
              <Spinner aria-hidden="true" />
              <span>{t("auth.connectingBody")}</span>
            </div>
          ) : state === "failed" ? (
            <div className={styles.failure} role="alert">
              <p>{t("auth.unavailable")}</p>
              <Button type="button" className={styles.retryBtn} onClick={retry}>
                {t("auth.retry")}
              </Button>
            </div>
          ) : (
            <div className={styles.handoff}>
              <p>{t("auth.handoffBody")}</p>
              <Button type="button" className={styles.primaryBtn} onClick={retry}>
                {t("auth.continue")}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}
