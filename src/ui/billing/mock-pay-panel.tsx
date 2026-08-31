"use client"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

// DEV 模拟收银台：真网关收银台的 dev 替身。「确认支付」→ POST /api/billing/mock-pay（签 mock webhook
// 驱动 confirmOrder 到账）→ 成功后回工作区，余额随之刷新。仅 dev；生产由真网关托管收银台替代。
import Link from "next/link"
import { useState } from "react"

import { useT } from "@/i18n/context"
import styles from "./mock-pay-panel.module.css"

type PayState = "idle" | "paying" | "paid" | "error"

export function MockPayPanel({ orderId }: { orderId: string }): React.JSX.Element {
  const t = useT()
  const [state, setState] = useState<PayState>("idle")

  async function pay(): Promise<void> {
    setState("paying")
    try {
      const res = await fetch("/api/billing/mock-pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      })
      setState(res.ok ? "paid" : "error")
    } catch {
      setState("error")
    }
  }

  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardHeader className={styles.header}>
          <Badge variant="secondary" className={styles.badge}>{t("mockPay.badge")}</Badge>
          <h1 className={styles.title}>{t("mockPay.title")}</h1>
          <p className={styles.order}>
            {t("mockPay.order")} <code>{orderId}</code>
          </p>
        </CardHeader>

        {state === "paid" ? (
          <CardContent className={styles.content}>
            <Alert className={styles.success} role="status">
              <AlertDescription>{t("mockPay.paid")}</AlertDescription>
            </Alert>
            <Button asChild variant="default" className={styles.primaryLink}>
              <Link href="/">{t("mockPay.back")}</Link>
            </Button>
          </CardContent>
        ) : (
          <CardContent className={styles.content}>
            {state === "error" ? (
              <Alert variant="destructive" className={styles.error} role="alert">
                <AlertDescription>{t("mockPay.error")}</AlertDescription>
              </Alert>
            ) : null}
            <Button variant="default" type="button" className={styles.primaryButton} onClick={pay} disabled={state === "paying"} aria-busy={state === "paying"}>
              {state === "paying" ? <><Spinner aria-hidden="true" />{t("mockPay.paying")}</> : t("mockPay.confirm")}
            </Button>
          </CardContent>
        )}
        {state !== "paid" ? (
          <CardFooter className={styles.footer}>
            <Link href="/" className={styles.cancelLink}>
              {t("mockPay.cancel")}
            </Link>
          </CardFooter>
        ) : null}
      </Card>
    </main>
  )
}
