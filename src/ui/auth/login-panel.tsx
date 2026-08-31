"use client"

// 登录页面板（WEB-FACE 面二，/login）：magic-link 签发链 web 端。机制与旧登录闸零改动——
// 提交邮箱只 POST `/api/auth/magic-link/request`（BFF 设 nonce cookie + 交 user），真正换取会话在
// 邮件链接的 `/api/auth/callback` 完成（密封 cookie + 303 回 `/`）。前端不持 token。
// 形态对标参考:浅底全屏 + 共用顶栏 + 居中宽白卡；标题→email→**大主按钮(发送登录链接)**→分隔→
// 仅呈现当前可用的 magic-link 流程，不放无效 OAuth/密码入口。
// 错误走 toast 归一(不内联);发送后态给检查邮箱卡 + 重发倒计时 + 改邮箱。dev response 档保留可点链。

import { useEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"

import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { MessageKey } from "@/i18n/messages"
import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { MarketingTopBar } from "@/ui/marketing/marketing-top-bar"
import { RuntimeUnavailable } from "./runtime-unavailable"

import styles from "./login-panel.module.css"

type Phase = "idle" | "sent"

const RESEND_SECONDS = 30

// 首帧就知道回调是否失败（?auth=link_unavailable），据此弹一次错误 toast。
function initialLinkError(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  return new URLSearchParams(window.location.search).get("auth") === "link_unavailable"
}

export function LoginPanel({ brandName }: { brandName?: string }) {
  const t = useT()
  const { manifest, source, retry, retrying = false } = useRuntimeManifest()
  const brand = brandName ?? manifest.brand.name
  const [phase, setPhase] = useState<Phase>("idle")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  // 回调失败落点（callback 303 到 `/?auth=…`，落地页转投 `/login?auth=…`）：懒初始化即弹一次重发提示。
  const [toast, setToast] = useState<MessageKey | null>(() =>
    initialLinkError() ? "auth.linkUnavailable" : null,
  )
  const [resendIn, setResendIn] = useState(0)
  const submitLockRef = useRef(false)
  const emailInputRef = useRef<HTMLInputElement | null>(null)
  const sentTitleRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    if (phase !== "sent") {
      return
    }
    // The form is replaced by a different surface after the request. Move
    // focus to its heading so keyboard users do not land on a detached submit
    // button or lose the context change at document.body.
    const frame = window.requestAnimationFrame(() => sentTitleRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [phase])

  // toast 归一自动消：toast 一变即排 5s 后清；新错误重置计时。
  useEffect(() => {
    if (toast === null) {
      return
    }
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  // 发送后态重发倒计时：每秒递减到 0 才允许再次发送。
  useEffect(() => {
    if (resendIn <= 0) {
      return
    }
    const id = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const showToast = (key: MessageKey): void => {
    setToast(key)
  }

  const submit = async (): Promise<void> => {
    // The button is disabled after React commits `busy`; the ref closes the
    // smaller window between two native submit events as well.
    if (busy || submitLockRef.current) return
    setAttempted(true)
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!emailValid) {
      showToast("auth.invalidEmail")
      // Keep the correction loop inside the field instead of leaving focus on
      // the submit button after validation fails.
      window.requestAnimationFrame(() => emailInputRef.current?.focus())
      return
    }
    submitLockRef.current = true
    setBusy(true)
    try {
      const res = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        if (res.status === 400) {
          showToast("auth.invalidEmail")
        } else if (res.status === 429) {
          showToast("auth.rateLimited")
        } else {
          showToast("auth.unavailable")
        }
        return
      }
      const body = (await res.json()) as { dev_link?: string }
      setDevLink(typeof body.dev_link === "string" ? body.dev_link : null)
      setPhase("sent")
      setResendIn(RESEND_SECONDS)
    } catch {
      showToast("auth.unavailable")
    } finally {
      submitLockRef.current = false
      setBusy(false)
    }
  }

  const backToIdle = (): void => {
    setPhase("idle")
    setDevLink(null)
    setResendIn(0)
    window.requestAnimationFrame(() => emailInputRef.current?.focus())
  }

  const emailInvalid = attempted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  if (source === "error" || retrying) {
    return (
      <RuntimeUnavailable
        onRetry={retry}
        retrying={retrying}
        brandName={brand}
        brandMark={manifest.brand.mark}
        brandLogoUrl={manifest.brand.logoUrl}
      />
    )
  }

  return (
    <div className={styles.screen}>
      <MarketingTopBar
        brandName={brand}
        brandMark={manifest.brand.mark}
        brandLogoUrl={manifest.brand.logoUrl}
      />

      {/* toast 归一（限频 429 / 签发失败 / 链接失效）：卡外浮层，不在表单内联报错。 */}
      {toast !== null ? (
        <div className={styles.toast} role="alert" data-testid="login-toast">
          {t(toast)}
        </div>
      ) : null}

      <div className={styles.stage}>
        {phase === "sent" ? (
          <Card className={styles.card} data-testid="login-sent">
            <h1 ref={sentTitleRef} tabIndex={-1} className={styles.title}>{t("auth.sentTitle")}</h1>
            <p className={styles.subtitle}>{t("auth.sentBody")}</p>
            {devLink !== null ? (
              <Button variant="default" asChild className={styles.primaryBtn} data-testid="dev-link">
                <a href={devLink}>{t("auth.devLink")}</a>
              </Button>
            ) : null}
            <Button
              variant="outline"
              type="button"
              className={styles.secondaryBtn}
              disabled={resendIn > 0 || busy}
              aria-busy={busy}
              onClick={() => void submit()}
              data-testid="login-resend"
            >
              {busy ? <Spinner aria-hidden="true" /> : null}
              {resendIn > 0 ? t("auth.sentResendIn", { seconds: resendIn }) : t("auth.sentResendNow")}
            </Button>
            <p className={styles.switchLine}>
              <Button
                variant="link"
                type="button"
                className={styles.switchLink}
                onClick={backToIdle}
                data-testid="login-change-email"
              >
                {t("auth.sentChangeEmail")}
              </Button>
            </p>
          </Card>
        ) : (
          <Card className={styles.card} data-testid="login-panel">
            <h1 className={styles.title}>{t("auth.title")}</h1>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <Field className={styles.field} data-invalid={emailInvalid || undefined}>
                <FieldLabel className={styles.fieldLabel} htmlFor="login-email">
                  {t("auth.emailLabel")}
                </FieldLabel>
                <Input
                  ref={emailInputRef}
                  id="login-email"
                  className={styles.input}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  aria-invalid={emailInvalid || undefined}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                  data-testid="login-email"
                />
                {emailInvalid ? <FieldError>{t("auth.invalidEmail")}</FieldError> : null}
              </Field>

              <Button
                variant="default"
                type="submit"
                className={styles.primaryBtn}
                disabled={busy}
                aria-busy={busy}
                data-testid="login-submit"
              >
                {busy ? <Spinner aria-hidden="true" /> : <><span>{t("auth.submit")}</span><span className={styles.primaryArrow} aria-hidden><ArrowRight /></span></>}
              </Button>
            </form>

            <p className={styles.switchLine}>{t("auth.noAccount")}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
