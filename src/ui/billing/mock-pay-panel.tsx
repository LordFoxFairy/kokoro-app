"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { useT } from "@/i18n/context"
import styles from "./mock-pay-panel.module.css"

// Keep the published direct URL honest: no order lookup or payment is provided.
export function MockPayPanel(): React.JSX.Element {
  const t = useT()
  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardHeader className={styles.header}>
          <h1 className={styles.title}>{t("pricing.buyUnavailable")}</h1>
        </CardHeader>
        <CardContent className={styles.content}>
          <Alert className={styles.error}>
            <AlertDescription>{t("pricing.unavailable")}</AlertDescription>
          </Alert>
          <Button variant="default" type="button" className={styles.primaryButton} disabled>
            {t("pricing.buyUnavailable")}
          </Button>
        </CardContent>
        <CardFooter className={styles.footer}>
          <Link href="/app" className={styles.cancelLink}>{t("mockPay.back")}</Link>
        </CardFooter>
      </Card>
    </main>
  )
}
