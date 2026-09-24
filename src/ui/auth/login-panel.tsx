"use client"

// The browser begins the fixed Product OIDC flow; credentials and tokens stay
// with the issuer and server-only RP, never with this page.

import { useEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"

import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { DEFAULT_BRAND } from "@/config/brand"
import { MarketingTopBar } from "@/ui/marketing/marketing-top-bar"
import { beginProductSignIn } from "./product-auth-client"

import styles from "./login-panel.module.css"

export function LoginPanel() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const submitLockRef = useRef(false)

  useEffect(() => {
    if (!unavailable) return
    const timer = setTimeout(() => setUnavailable(false), 5000)
    return () => clearTimeout(timer)
  }, [unavailable])

  const submit = async (): Promise<void> => {
    if (busy || submitLockRef.current) return
    submitLockRef.current = true
    setBusy(true)
    setUnavailable(false)
    try {
      await beginProductSignIn()
    } catch {
      setUnavailable(true)
    } finally {
      submitLockRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className={styles.screen}>
      <MarketingTopBar
        brandName={DEFAULT_BRAND.name}
        brandMark={DEFAULT_BRAND.mark}
      />
      {unavailable ? (
        <div className={styles.toast} role="alert" data-testid="login-toast">
          {t("auth.unavailable")}
        </div>
      ) : null}
      <div className={styles.stage}>
        <Card className={styles.card} data-testid="login-panel">
          <h1 className={styles.title}>{t("auth.title")}</h1>
          <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <Button
              variant="default"
              type="submit"
              className={styles.primaryBtn}
              disabled={busy}
              aria-busy={busy}
              data-testid="login-submit"
            >
              {busy ? <Spinner aria-hidden="true" /> : (
                <>
                  <span>{t("auth.title")}</span>
                  <span className={styles.primaryArrow} aria-hidden><ArrowRight /></span>
                </>
              )}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
