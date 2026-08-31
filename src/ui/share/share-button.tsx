"use client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Link2 } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

// 会话头部分享控件（SHARE-1）：创建可撤销只读分享 → 复制公共链接 / 撤销。
// 创建幂等（活跃分享返同 id）；撤销后公共链接随即 404。公共链接=同源 /shared/{share_id}。

import { useCallback, useEffect, useRef, useState } from "react"

import type { SessionClient } from "@/engine/client"
import { useT } from "@/i18n/context"

import styles from "./share-button.module.css"

type ShareState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "shared"; url: string; copied: boolean; revokeError?: boolean }
  | { kind: "error" }

type ShareButtonProps = {
  client: Pick<SessionClient, "createShare" | "revokeShare">
  sessionId: string
}

function shareUrl(shareId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}/shared/${shareId}`
}

export function ShareButton({ client, sessionId }: ShareButtonProps) {
  const t = useT()
  const [state, setState] = useState<ShareState>({ kind: "idle" })
  const [busy, setBusy] = useState<"copy" | "revoke" | null>(null)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const copyButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmRevokeRef = useRef<HTMLButtonElement | null>(null)
  const revokeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const createLockRef = useRef(false)

  useEffect(() => {
    if (!confirmingRevoke) return
    const frame = window.requestAnimationFrame(() => confirmRevokeRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [confirmingRevoke])

  // Copy changes the button label and therefore replaces its DOM node. Focus
  // after that commit, not only in the clipboard promise's finally block;
  // otherwise Radix can leave focus on the readonly URL input during the
  // state transition.
  useEffect(() => {
    if (state.kind !== "shared" || !state.copied) return
    const frame = window.requestAnimationFrame(() => copyButtonRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [state])

  const focusTrigger = useCallback(() => {
    // A controlled Popover can remove its content in the same React commit as
    // `open=false`. Radix's focus handoff then runs on the following frame and
    // may otherwise put focus on body after this callback. Use two frames so
    // the trigger wins only after the portal has completed its close commit.
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        // The trigger remains mounted while the controlled Popover is open.
        // Do not fall back to a document-wide selector: embedded previews can
        // host more than one share control and focus must return to this
        // instance.
        const trigger = triggerRef.current
        if (!trigger?.isConnected || trigger.disabled) return
        const style = window.getComputedStyle(trigger)
        if (style.display !== "none" && style.visibility !== "hidden") {
          trigger.focus()
        }
      })
    })
    return () => window.cancelAnimationFrame(firstFrame)
  }, [])

  const closeShared = useCallback(() => {
    setState({ kind: "idle" })
    setConfirmingRevoke(false)
    // The controlled Popover can unmount before Radix's default focus return
    // runs. Keep the share action keyboard-reopenable after Escape, Done, and
    // a successful revoke instead of leaving focus on document.body.
    focusTrigger()
  }, [focusTrigger])

  const create = useCallback(async () => {
    // `disabled` is applied after the click event commits. Keep an immediate
    // lock so a rapid double click cannot create two share records.
    if (createLockRef.current) return
    createLockRef.current = true
    setState({ kind: "creating" })
    try {
      const receipt = await client.createShare(sessionId)
      setState({ kind: "shared", url: shareUrl(receipt.share_id), copied: false })
    } catch {
      setState({ kind: "error" })
    } finally {
      createLockRef.current = false
    }
  }, [client, sessionId])

  const copy = useCallback(async () => {
    if (state.kind !== "shared" || busy !== null) return
    setBusy("copy")
    try {
      await navigator.clipboard.writeText(state.url)
      setState({ ...state, copied: true })
    } catch {
      // 剪贴板不可用（无 https/权限）：链接仍可见可手动复制，不阻断。
    } finally {
      setBusy(null)
      // Clipboard implementations can move focus to body after a successful
      // write. Keep the user in the popover's action loop so the next Tab or
      // Space continues from the copy control rather than restarting at the
      // page shell.
      window.requestAnimationFrame(() => copyButtonRef.current?.focus())
    }
  }, [busy, state])

  const revoke = useCallback(async () => {
    if (state.kind !== "shared" || busy !== null) return
    setBusy("revoke")
    try {
      await client.revokeShare(sessionId)
    } catch {
      // 撤销失败保持已分享态：不误导用户以为已撤销。
      if (state.kind === "shared") setState({ ...state, revokeError: true })
      setBusy(null)
      return
    }
    setBusy(null)
    closeShared()
  }, [busy, client, closeShared, sessionId, state])

  return (
    <div className={styles.wrap} data-testid="share-control">
      <Popover
        open={state.kind === "shared"}
        onOpenChange={(open) => {
          if (!open && state.kind === "shared") closeShared()
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
          <div className="sr-only">{t("share.title")}</div>
          {state.kind === "shared" ? (
            <>
              <p className={styles.hint}>{t("share.readonlyHint")}</p>
              <div className={styles.linkRow}>
                <Input className={styles.link} readOnly value={state.url} aria-label={t("share.linkAria")} />
                <Button ref={copyButtonRef} variant="outline" type="button" className={styles.copy} disabled={busy !== null} aria-busy={busy === "copy"} onClick={() => void copy()}>
                  {busy === "copy" ? <Spinner aria-hidden="true" /> : null}
                  {state.copied ? t("share.copied") : t("share.copy")}
                </Button>
              </div>
              {state.revokeError ? (
                <Alert variant="destructive" className={styles.err}>
                  <AlertDescription>{t("share.error")}</AlertDescription>
                </Alert>
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
                      disabled={busy !== null}
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
                      disabled={busy !== null}
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
                    variant="destructive"
                    type="button"
                    className={styles.revoke}
                    ref={revokeTriggerRef}
                    disabled={busy !== null}
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
          ) : null}
        </PopoverContent>
        <PopoverTrigger asChild>
          <Button variant="outline"
            type="button"
            className={styles.trigger}
            ref={triggerRef}
            data-testid="share-button"
            disabled={state.kind === "creating"}
            aria-busy={state.kind === "creating"}
            onClick={() => {
              if (state.kind !== "shared") void create()
            }}
          >
            {state.kind === "creating" ? <Spinner aria-hidden="true" /> : <Link2 data-icon="inline-start" aria-hidden="true" />}
            {state.kind === "creating" ? t("share.creating") : t("share.button")}
          </Button>
        </PopoverTrigger>
      </Popover>
      {state.kind === "error" ? (
        <Alert variant="destructive" className={styles.err}>
          <AlertDescription>{t("share.error")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
