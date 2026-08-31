"use client"

// 公共分享页（SHARE-1，无 auth 公共面）：经同源 /api/shared/{id} 取只读快照并渲染只读线程。
// 无侧栏、无输入框、无控制面。撤销/软删会话/不存在 → 404 友好态。

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

import { parseSessionSnapshot, type SessionSnapshot } from "@/contract/http"
import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { BrandFallback, BrandMark } from "@/components/blocks/brand-mark/brand-mark"
import { useRuntimeManifest } from "@/system/use-runtime-manifest"
import { SharedThread } from "@/ui/shared/shared-thread"

import styles from "./shared.module.css"

type ViewState =
  | { kind: "loading" }
  | { kind: "notFound"; shareId: string }
  | { kind: "ready"; shareId: string; snapshot: SessionSnapshot }

export default function SharedPage() {
  const t = useT()
  const { manifest } = useRuntimeManifest()
  const params = useParams<{ id: string }>()
  const shareId = typeof params.id === "string" ? params.id : ""
  // 空段（防御性，路由 [id] 恒有单段）：初态即 notFound，effect 不再同步 setState。
  const [state, setState] = useState<ViewState>(() =>
    shareId === "" ? { kind: "notFound", shareId } : { kind: "loading" },
  )

  useEffect(() => {
    if (shareId === "") return
    let live = true
    const controller = new AbortController()
    void (async () => {
      try {
        const res = await fetch(`/api/shared/${encodeURIComponent(shareId)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          if (live) setState({ kind: "notFound", shareId })
          return
        }
        const snapshot = parseSessionSnapshot(await res.json())
        if (live) setState({ kind: "ready", shareId, snapshot })
      } catch {
        // 网络/解析失败：与不可达同不透明 404 态（公共面不泄内部细节）。
        if (live && !controller.signal.aborted) setState({ kind: "notFound", shareId })
      }
    })()
    return () => {
      live = false
      // 路由连续切换时取消旧快照请求，避免旧响应覆盖新站点的只读内容。
      // AbortError 不会改变下一次请求已建立的 loading 状态。
      controller.abort()
    }
  }, [shareId])

  // params 变化后 effect 尚未提交 loading 的这一帧也必须保持 loading，
  // 不能把上一个分享链接的消息短暂显示在新 URL 下。
  if (
    state.kind === "loading" ||
    state.shareId !== shareId
  ) {
    return (
      <main className={styles.page} aria-busy="true">
        <p className={styles.hint} role="status" aria-live="polite">{t("shared.loading")}</p>
      </main>
    )
  }

  if (state.kind === "notFound") {
    return (
      <main className={styles.page} data-testid="shared-notfound">
        <Empty className={styles.notFound}>
          <EmptyHeader>
            <EmptyMedia variant="icon" aria-hidden="true">
              <BrandMark
                logoUrl={manifest.brand.logoUrl}
                fallback={<BrandFallback mark={manifest.brand.mark} className={styles.brandFallbackIcon} />}
                imageClassName={styles.emptyLogo}
              />
            </EmptyMedia>
            <p className={styles.emptyBrand}>{manifest.brand.name}</p>
            <EmptyTitle className={styles.notFoundTitle}>{t("shared.notFound")}</EmptyTitle>
            <EmptyDescription className={styles.notFoundHint}>{t("shared.notFoundHint")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" className={styles.homeLink}>
              <Link href="/">{t("shared.backHome")}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  return (
    <main className={styles.page} data-testid="shared-page">
      <header className={styles.header}>
        <div className={styles.brand}>
          <BrandMark
            logoUrl={manifest.brand.logoUrl}
            fallback={<BrandFallback mark={manifest.brand.mark} className={styles.brandFallbackIcon} />}
            imageClassName={styles.brandLogo}
          />
        </div>
        <div className={styles.headText}>
          <p className={styles.brandName}>{manifest.brand.name}</p>
          <h1 className={styles.title}>{state.snapshot.session.title}</h1>
          <Badge variant="secondary" className={styles.badge}>{t("shared.readonlyBadge")}</Badge>
        </div>
      </header>
      <div className={styles.thread}>
        <SharedThread snapshot={state.snapshot} brandName={manifest.brand.name} />
      </div>
    </main>
  )
}
