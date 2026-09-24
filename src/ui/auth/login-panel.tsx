"use client"

// The browser begins the fixed Product OIDC flow; credentials and tokens stay
// with the issuer and server-only RP, never with this page.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

import { BrandFallback } from "@/components/blocks/brand-mark/brand-mark"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { DEFAULT_BRAND } from "@/config/brand"
import { useT } from "@/i18n/context"
import { beginProductSignIn } from "./product-auth-client"

import styles from "./login-panel.module.css"

type LoginState = "connecting" | "failed"

export function LoginPanel({ initialFailure = false }: { initialFailure?: boolean }) {
  const t = useT()
  const [state, setState] = useState<LoginState>(initialFailure ? "failed" : "connecting")
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
    if (initialFailure) return
    // Deferring the first attempt to the next task keeps StrictMode's initial
    // setup/cleanup replay from submitting the same RP form twice.
    const timer = window.setTimeout(() => void startSignIn(), 0)
    return () => window.clearTimeout(timer)
  }, [initialFailure, startSignIn])

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
    <main className={styles.screen} data-testid="login-panel">
      <section className={styles.identity} aria-label={DEFAULT_BRAND.name}>
        <Link className={styles.brand} href="/" aria-label={DEFAULT_BRAND.name}>
          <BrandFallback mark={DEFAULT_BRAND.mark} className={styles.brandMark ?? ""} />
          <span>{DEFAULT_BRAND.name}</span>
        </Link>
        <div className={styles.identityArt} aria-hidden="true">
          <BrandFallback mark={DEFAULT_BRAND.mark} className={styles.heroMark ?? ""} />
        </div>
      </section>
      <section className={styles.stage} aria-labelledby="login-title">
        <div className={styles.content}>
          <h1 id="login-title" className={styles.title}>{t(state === "connecting" ? "auth.connectingTitle" : "auth.title")}</h1>
          <p className={styles.description}>{t("auth.handoffBody")}</p>
          {state === "connecting" ? (
            <div className={styles.status} role="status" aria-live="polite">
              <Spinner aria-hidden="true" />
              <span>{t("auth.connectingBody")}</span>
            </div>
          ) : (
            <div className={styles.failure}>
              <p role="alert">{t("auth.unavailable")}</p>
              <Button type="button" size="lg" className={styles.retryBtn} onClick={retry}>
                {t("auth.retry")}
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
