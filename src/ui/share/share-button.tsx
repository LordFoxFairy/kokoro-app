"use client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, Globe, Link2, Share2, X } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

// 会话头部分享控件（SHARE-1）：创建可撤销只读分享 → 复制公共链接 / 撤销。
// 创建幂等（活跃分享返同 id）；撤销后公共链接随即 404。公共链接=同源 /shared/{share_id}。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { DIRECT_SESSION_SCOPE, type SessionScope } from "@/engine/session-scope"
import { useSessionShare, type SessionShareClient } from "./use-session-share"
import { useT } from "@/i18n/context"

import styles from "./share-button.module.css"

type CopyIntent = { token: object; window: object; shareId: string }

type ShareButtonProps = {
  client: SessionShareClient
  sessionId: string
  readBoundary?: ProjectReadBoundary
  scope?: SessionScope
  preview?: boolean
}

function shareUrl(shareId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}/shared/${encodeURIComponent(shareId)}`
}

export function ShareButton({ client, sessionId, readBoundary, scope = DIRECT_SESSION_SCOPE, preview = false }: ShareButtonProps) {
  const t = useT()
  const projection = useSessionShare({ client, sessionId, scope, preview, ...(readBoundary === undefined ? {} : { boundary: readBoundary }) })
  const { open, setOpen, isCurrent } = projection
  const currentProjection = useRef(isCurrent)
  useLayoutEffect(() => { currentProjection.current = isCurrent }, [isCurrent])
  // A new open window or retired exact share cannot inherit a clipboard intent.
  const copyWindow = useMemo(() => ({ token: projection.scopeToken, open, shareId: projection.share?.share_id }), [projection.scopeToken, open, projection.share?.share_id])
  const liveCopyWindow = useRef<object | null>(copyWindow)
  const currentCopy = useRef<CopyIntent | null>(null)
  useLayoutEffect(() => { liveCopyWindow.current = copyWindow }, [copyWindow])
  const [copiedShare, setCopiedShare] = useState<CopyIntent | null>(null)
  const [copyBusy, setCopyBusy] = useState<CopyIntent | null>(null)
  const [revokeConfirmation, setRevokeConfirmation] = useState<{ token: object; shareId: string } | null>(null)
  const confirmingRevoke = revokeConfirmation?.token === projection.scopeToken && revokeConfirmation.shareId === projection.share?.share_id
  const setConfirmingRevoke = (confirming: boolean) => setRevokeConfirmation(confirming && projection.share ? { token: projection.scopeToken, shareId: projection.share.share_id } : null)
  const busy = projection.command === "revoke" ? "revoke" : copyBusy?.token === projection.scopeToken && copyBusy.window === copyWindow && copyBusy.shareId === projection.share?.share_id ? "copy" : null
  const state = projection.status === "ready" && projection.share !== null
    ? { kind: "shared" as const, url: shareUrl(projection.share.share_id), copied: copiedShare?.token === projection.scopeToken && copiedShare.window === copyWindow && copiedShare.shareId === projection.share.share_id, revokeError: projection.commandError }
    : { kind: projection.command === "create" ? "creating" as const : projection.status === "ready" ? "idle" as const : projection.status === "error" ? "error" as const : "loading" as const }
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const copyButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmRevokeRef = useRef<HTMLButtonElement | null>(null)
  const revokeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const retryButton = useRef<HTMLButtonElement | null>(null)
  const retryFocus = useRef<{ token: object; owned: boolean } | null>(null)
  const focusScope = useRef(projection.scopeToken)
  useLayoutEffect(() => { focusScope.current = projection.scopeToken }, [projection.scopeToken])

  useEffect(() => {
    if (!confirmingRevoke) return
    const token = projection.scopeToken
    const frame = window.requestAnimationFrame(() => { if (focusScope.current === token) confirmRevokeRef.current?.focus() })
    return () => window.cancelAnimationFrame(frame)
  }, [confirmingRevoke, projection.scopeToken])

  // Copy changes the button label and therefore replaces its DOM node. Focus
  // after that commit, not only in the clipboard promise's finally block;
  // otherwise Radix can leave focus on the readonly URL input during the
  // state transition.
  useEffect(() => {
    if (!projection.reading) return
    const moved = (event: FocusEvent | PointerEvent) => { if (retryFocus.current && event.target !== retryButton.current && (event.type === "pointerdown" || event.target !== document.body)) retryFocus.current.owned = false }
    const tabbed = (event: KeyboardEvent) => { if (event.key === "Tab" && retryFocus.current) retryFocus.current.owned = false }
    const blurred = () => { if (retryFocus.current) retryFocus.current.owned = false }
    document.addEventListener("focusin", moved); document.addEventListener("pointerdown", moved); document.addEventListener("keydown", tabbed); window.addEventListener("blur", blurred)
    return () => { document.removeEventListener("focusin", moved); document.removeEventListener("pointerdown", moved); document.removeEventListener("keydown", tabbed); window.removeEventListener("blur", blurred) }
  }, [projection.reading])
  useLayoutEffect(() => {
    if (projection.reading) return
    const intent = retryFocus.current
    retryFocus.current = null
    if (intent?.owned && isCurrent(intent.token) && document.activeElement === document.body) retryButton.current?.focus({ preventScroll: true })
  }, [projection.reading, projection.scopeToken, isCurrent])
  const copied = state.kind === "shared" && state.copied
  useEffect(() => {
    if (!copied) return
    const intent = copiedShare
    const frame = window.requestAnimationFrame(() => {
      if (intent && currentCopy.current === intent && liveCopyWindow.current === intent.window && currentProjection.current(intent.token, intent.shareId)) copyButtonRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [copied, copiedShare])

  const focusTrigger = useCallback(() => {
    // A controlled Popover can remove its content in the same React commit as
    // `open=false`. Radix's focus handoff then runs on the following frame and
    // may otherwise put focus on body after this callback. Use two frames so
    // the trigger wins only after the portal has completed its close commit.
    const token = projection.scopeToken
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        // The trigger remains mounted while the controlled Popover is open.
        // Do not fall back to a document-wide selector: embedded previews can
        // host more than one share control and focus must return to this
        // instance.
        const trigger = triggerRef.current
        if (focusScope.current !== token || !trigger?.isConnected || trigger.disabled) return
        const style = window.getComputedStyle(trigger)
        if (style.display !== "none" && style.visibility !== "hidden") {
          trigger.focus()
        }
      })
    })
    return () => window.cancelAnimationFrame(firstFrame)
  }, [projection.scopeToken])

  const closeShared = useCallback(() => {
    liveCopyWindow.current = null
    currentCopy.current = null
    setCopiedShare(null)
    setCopyBusy(null)
    setOpen(false)
    setRevokeConfirmation(null)
    // The controlled Popover can unmount before Radix's default focus return
    // runs. Keep the share action keyboard-reopenable after Escape, Done, and
    // a successful revoke instead of leaving focus on document.body.
    focusTrigger()
  }, [focusTrigger, setOpen])

  const create = () => projection.create()
  const copy = async () => {
    if (state.kind !== "shared" || busy !== null || projection.command !== null || projection.pendingCommand !== null || !projection.share) return
    const token = projection.scopeToken, shareId = projection.share.share_id
    if (!isCurrent(token, shareId)) return
    const intent: CopyIntent = { token, window: copyWindow, shareId }
    const live = () => currentCopy.current === intent && liveCopyWindow.current === intent.window && isCurrent(token, shareId)
    currentCopy.current = intent
    setCopyBusy(intent)
    try {
      await navigator.clipboard.writeText(state.url)
      if (live()) setCopiedShare(intent)
    } catch { /* The verified URL remains available for manual copying. */ }
    finally {
      setCopyBusy(current => current === intent ? null : current)
      window.requestAnimationFrame(() => { if (live()) copyButtonRef.current?.focus() })
    }
  }
  const revoke = async () => {
    if (busy !== null || !confirmingRevoke || !projection.share) return
    const token = projection.scopeToken
    if (await projection.revoke(projection.share.share_id) && isCurrent(token)) closeShared()
  }

  return (
    <div className={styles.wrap} data-testid="share-control">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true)
          else closeShared()
        }}
      >
        <PopoverContent
          className={styles.popover}
          align="end"
          sideOffset={8}
          aria-label={t("share.title")}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            focusTrigger()
          }}
        >
          <div className={styles.header}>
            <h2 className={styles.title}>{t("share.button")}</h2>
            <Button variant="ghost" type="button" className={styles.close} aria-label={t("share.close")} onClick={closeShared}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className={styles.body}>
            {projection.pendingCommand !== null ? <div role="status">
              <p>{t("share.error")}</p>
              <Button type="button" disabled={projection.command !== null || projection.reading} onClick={() => void projection.retryCommand()}>{t("thread.retryOriginal")}</Button>
            </div> : null}
            <div className={styles.accessRow}>
              <span className={styles.accessIcon}><Globe aria-hidden="true" /></span>
              <div className={styles.accessText}>
                <span className={styles.accessTitle}>{t("share.publicAccess")}</span>
                <p className={styles.hint}>{state.kind === "shared" ? t("share.readonlyHint") : t("share.publishHint")}</p>
              </div>
              {state.kind === "shared" ? <Check className={styles.check} aria-hidden="true" /> : null}
            </div>
            {state.kind === "shared" ? (
              <>
                <div className={styles.linkRow}>
                  <Input className={styles.link} readOnly value={state.url} aria-label={t("share.linkAria")} />
                  <Button ref={copyButtonRef} variant="outline" type="button" className={styles.copy} disabled={busy !== null || projection.command !== null || projection.pendingCommand !== null} aria-busy={busy === "copy"} onClick={() => void copy()}>
                    {busy === "copy" ? <Spinner aria-hidden="true" /> : null}
                    {state.copied ? t("share.copied") : t("share.copy")}
                  </Button>
                </div>
                {state.revokeError ? (
                  <p role="status" className={styles.err}>{t("share.error")}</p>
                ) : null}
                {confirmingRevoke ? (
                  <div className={styles.confirmation} role="group" aria-label={t("share.revokeConfirmHint")}>
                    <p className={styles.confirmationHint}>{t("share.revokeConfirmHint")}</p>
                    <div className={styles.actions}>
                      <Button
                        ref={confirmRevokeRef}
                        variant="destructive"
                        type="button"
                        className={styles.revoke}
                        disabled={busy !== null || projection.command !== null || projection.pendingCommand !== null}
                        aria-busy={busy === "revoke"}
                        onClick={() => void revoke()}
                      >
                        {busy === "revoke" ? <Spinner aria-hidden="true" /> : null}
                        {t("share.revokeConfirm")}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        className={styles.dismiss}
                        disabled={busy !== null || projection.command !== null || projection.pendingCommand !== null}
                        onClick={() => {
                          setConfirmingRevoke(false)
                          window.requestAnimationFrame(() => revokeTriggerRef.current?.focus())
                        }}
                      >
                        {t("share.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      type="button"
                      className={styles.revoke}
                      ref={revokeTriggerRef}
                      disabled={busy !== null || projection.command !== null || projection.pendingCommand !== null}
                      aria-busy={busy === "revoke"}
                      onClick={() => setConfirmingRevoke(true)}
                    >
                      {t("share.revoke")}
                    </Button>
                    <Button variant="outline" type="button" className={styles.dismiss} onClick={closeShared}>
                      {t("share.done")}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                {state.kind === "error" ? <><p role="alert" className={styles.err}>{t("data.error")}</p><Button ref={retryButton} type="button" disabled={projection.reading} aria-busy={projection.reading} onClick={() => { retryFocus.current = { token: projection.scopeToken, owned: document.activeElement === retryButton.current }; void projection.reload() }}>{t("data.reload")}</Button></> : null}
                {state.kind === "loading" ? <p role="status"><Spinner aria-hidden="true" />{t("data.loading")}</p> : null}
                {projection.commandError && state.kind !== "error" ? <p role="status" className={styles.err}>{t("share.error")}</p> : null}
                {state.kind === "idle" || state.kind === "creating" ? <Button type="button" className={styles.publish} disabled={state.kind === "creating"} aria-busy={state.kind === "creating"} onClick={() => void create()}>
                  <Link2 aria-hidden="true" />{t("share.publish")}
                </Button> : null}
              </>
            )}
          </div>
        </PopoverContent>
        <PopoverTrigger asChild>
          <Button variant="outline"
            type="button"
            className={styles.trigger}
            ref={triggerRef}
            data-testid="share-button"
            disabled={!projection.available}
          >
            <Share2 data-icon="inline-start" aria-hidden="true" />
            {t("share.button")}
          </Button>
        </PopoverTrigger>
      </Popover>
    </div>
  )
}
