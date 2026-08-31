"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/context"
import { MarketingTopBar } from "@/ui/marketing/marketing-top-bar"

import styles from "./runtime-unavailable.module.css"
import { DEFAULT_BRAND } from "@/config/brand"

export function RuntimeUnavailable({
  onRetry,
  retrying = false,
  brandName,
  brandMark,
  brandLogoUrl,
}: {
  onRetry: () => void
  retrying?: boolean
  brandName?: string
  brandMark?: string
  brandLogoUrl?: string
}) {
  const t = useT()

  return (
    <main className={styles.screen} aria-labelledby="runtime-unavailable-title">
      <MarketingTopBar brandName={brandName} brandMark={brandMark} brandLogoUrl={brandLogoUrl} />
      <div className={styles.stage}>
        <Card className={styles.card}>
          <CardContent className={styles.content}>
            <div className={styles.intro}>
              <p className={styles.eyebrow}>{brandName ?? DEFAULT_BRAND.name}</p>
              <h1 id="runtime-unavailable-title" className={styles.title}>{t("firstSite.statusError")}</h1>
            </div>
            <Alert variant="destructive">
              <AlertDescription>{t("firstSite.runtimeUnavailableDetail")}</AlertDescription>
            </Alert>
            <Button type="button" variant="outline" disabled={retrying} aria-busy={retrying} onClick={onRetry}>
              {retrying ? <Spinner aria-hidden="true" /> : null}
              {t("firstSite.reload")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
