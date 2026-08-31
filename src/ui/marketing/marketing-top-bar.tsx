"use client"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

// 营销/登录共用顶栏（WEB-FACE）：品牌（SITE-REAL 注入）左，导航 + 强调 CTA 右；桌面横排、
// 移动收汉堡下拉。落地页与登录页共用同一顶栏骨架，保证结构一致。只挂真实存在的页内锚点与 /login，
// 不展示尚未提供公开数据的定价入口，也不造不存在的产品下拉。

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Menu } from "lucide-react"
import Link from "next/link"

import { useT } from "@/i18n/context"
import { BrandFallback, BrandMark } from "@/components/blocks/brand-mark/brand-mark"
import { DEFAULT_BRAND } from "@/config/brand"

import styles from "./marketing-top-bar.module.css"

const MARKETING_MOBILE_BREAKPOINT = 768

function useMarketingMobile() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQuery = window.matchMedia(`(max-width: ${MARKETING_MOBILE_BREAKPOINT}px)`)
      mediaQuery.addEventListener("change", onStoreChange)
      return () => mediaQuery.removeEventListener("change", onStoreChange)
    },
    () => window.innerWidth <= MARKETING_MOBILE_BREAKPOINT,
    () => false,
  )
}

export function MarketingTopBar({
  brandName,
  brandMark,
  brandLogoUrl,
  marketingHref = "/",
}: {
  brandName?: string
  brandMark?: string
  brandLogoUrl?: string
  marketingHref?: string
}) {
  const t = useT()
  const brand = brandName ?? DEFAULT_BRAND.name
  const [navOpen, setNavOpen] = useState(false)
  const isMobile = useMarketingMobile()
  const brandRef = useRef<HTMLAnchorElement>(null)
  const navToggleRef = useRef<HTMLButtonElement>(null)

  // CSS switches at 768px, independently from the app shell's 960px boundary.
  // Close the mobile Sheet at the same boundary so a resize cannot leave an
  // invisible focus trap and the desktop nav mounted together.
  useEffect(() => {
    if (isMobile || !navOpen) return
    const frame = window.requestAnimationFrame(() => {
      setNavOpen(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isMobile, navOpen])

  // 功能导航：均为页内真实目的地锚点 + 真实路由，不放不存在的产品下拉。
  const links = (
    <>
      <Link className={styles.navLink} href={`${marketingHref}#capabilities`} onClick={() => setNavOpen(false)}>
        {t("marketing.navCaps")}
      </Link>
      <Link className={styles.navLink} href={`${marketingHref}#faq`} onClick={() => setNavOpen(false)}>
        {t("marketing.navFaq")}
      </Link>
      <Link className={styles.navLink} href="/login" onClick={() => setNavOpen(false)}>
        {t("marketing.navLogin")}
      </Link>
      <Button asChild className={styles.navCta} variant="default">
        <Link href="/login" onClick={() => setNavOpen(false)}>
          {t("marketing.navCta")}
        </Link>
      </Button>
    </>
  )

  return (
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <header className={styles.topbar}>
        <Link ref={brandRef} className={styles.brand} href={marketingHref} aria-label={brand}>
          <span className={styles.brandMark} aria-hidden>
            <BrandMark
              logoUrl={brandLogoUrl}
              imageClassName={styles.brandLogo}
              fallback={<BrandFallback mark={brandMark} className={styles.brandFallbackIcon} />}
            />
          </span>
          <span className={styles.brandName}>{brand}</span>
        </Link>
        <nav className={styles.navDesktop} aria-label={brand}>
          {links}
        </nav>
        <SheetTrigger asChild>
          <Button
            ref={navToggleRef}
            variant="outline"
            type="button"
            className={styles.navToggle}
            aria-label={t("marketing.navOpen")}
          >
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
      </header>
      <SheetContent
        side="right"
        className={styles.mobileSheet}
        closeLabel={t("shell.closeDialog")}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // Return to the actual menu trigger after a normal mobile close.
          // The brand is only the fallback when the viewport crossed the
          // mobile breakpoint and the trigger has become display:none.
          const toggle = navToggleRef.current
          const toggleStyle = toggle ? window.getComputedStyle(toggle) : null
          const toggleVisible = Boolean(
            isMobile && toggle && toggleStyle
            && toggleStyle.display !== "none"
            && toggleStyle.visibility !== "hidden",
          )
          const target = toggleVisible ? toggle : brandRef.current
          target?.focus()
        }}
      >
        <SheetHeader className={styles.mobileHeader}>
          <SheetTitle>{brand}</SheetTitle>
          <SheetDescription>{t("marketing.navOpen")}</SheetDescription>
        </SheetHeader>
        <nav className={styles.navMobile} aria-label={brand}>
          {links}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
