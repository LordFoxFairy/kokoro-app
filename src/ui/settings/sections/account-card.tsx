"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CircleHelp, KeyRound, LogOut, Sparkles } from "lucide-react"

import { useT } from "@/i18n/context"
import { endProductSession } from "@/ui/auth/product-auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useAccountProfileEditor } from "../use-account-profile-editor"
import { useAccountProfile } from "../use-account-profile"
import type { AccountDetail } from "../settings-types"

import { AccountDevicesDialog } from "./account-devices-dialog"
import { AccountCreditSummary } from "./account-credit-summary"
import { AccountServiceDetailsDialog } from "./account-service-details-dialog"

import styles from "./settings-sections.module.css"

type AccountProjection = {
  displayName: string
  email: string
  userId: string
  planLabel: string
  credits: string
  loginMethods: { id: "google" | "microsoft" | "apple"; label: string; account: string | null; connected: boolean }[]
}

function makePreviewAccount(t: ReturnType<typeof useT>): AccountProjection {
  return {
    displayName: "Preview User",
    email: "preview@example.test",
    userId: "preview-user",
    planLabel: t("billing.freeTier"),
    credits: "1,000",
    loginMethods: [
      { id: "google", label: "Google", account: "preview@example.test", connected: true },
      { id: "microsoft", label: "Microsoft", account: null, connected: false },
      { id: "apple", label: "Apple", account: null, connected: false },
    ],
  }
}

function LoginProviderIcon({ provider }: { provider: "google" | "microsoft" | "apple" }) {
  if (provider === "google") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14.673 8.13c0-.573-.047-.992-.147-1.426h-6.55v2.589h3.845c-.078.643-.496 1.612-1.427 2.263l2.202 1.705c1.317-1.216 2.077-3.007 2.077-5.13Z" fill="#4285F4"/><path d="M7.976 14.952c1.883 0 3.465-.62 4.62-1.69l-2.202-1.705c-.589.41-1.38.697-2.418.697-1.845 0-3.41-1.217-3.969-2.899l-2.263 1.752c1.147 2.279 3.503 3.845 6.232 3.845Z" fill="#34A853"/><path d="M4.007 9.356a4.3 4.3 0 0 1-.232-1.38c0-.481.085-.946.225-1.38L1.744 4.844A6.96 6.96 0 0 0 1 7.976c0 1.124.271 2.186.744 3.131l2.263-1.751Z" fill="#FBBC05"/><path d="M7.976 3.697c1.31 0 2.193.566 2.697 1.039l1.969-1.922C11.433 1.69 9.859 1 7.976 1 5.248 1 2.89 2.566 1.744 4.845L4 6.596c.566-1.682 2.131-2.899 3.976-2.899Z" fill="#EB4335"/></svg>
  if (provider === "microsoft") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.67 7.67H1.333V1.333H7.67V7.67Z" fill="#F1511B"/><path d="M14.667 7.67H8.33V1.333h6.337V7.67Z" fill="#80CC28"/><path d="M7.67 14.667H1.333V8.33H7.67v6.337Z" fill="#00ADEF"/><path d="M14.667 14.667H8.33V8.33h6.337v6.337Z" fill="#FBBC09"/></svg>
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14.196 5.454c-.093.072-1.731.995-1.731 3.048 0 2.375 2.085 3.215 2.147 3.236-.01.051-.331 1.15-1.099 2.27-.685.986-1.4 1.97-2.489 1.97-1.088 0-1.368-.632-2.624-.632-1.224 0-1.66.653-2.654.653-.996 0-1.69-.912-2.489-2.032-.925-1.316-1.672-3.359-1.672-5.298 0-3.111 2.023-4.76 4.013-4.76 1.058 0 1.94.694 2.604.694.632 0 1.618-.737 2.821-.737.456 0 2.095.042 3.173 1.588ZM10.452 2.55c.497-.591.849-1.41.849-2.23 0-.113-.01-.228-.03-.321-.81.03-1.773.539-2.354 1.213-.456.518-.882 1.337-.882 2.168 0 .125.021.25.031.29.051.01.134.02.217.02.727 0 1.64-.486 2.169-1.14Z" fill="currentColor"/></svg>
}

function UnavailableLoginMethods() {
  const t = useT()
  const reason = useId()
  return <>
    <p id={reason} className={styles.accountServiceReason}>{t("settingsServices.accountServiceUnavailable")}</p>
    <div className={styles.loginProviderList}>
      {([{ id: "google", label: "Google" }, { id: "microsoft", label: "Microsoft" }, { id: "apple", label: "Apple" }] as const).map((provider) => <div className={styles.loginProvider} key={provider.id} role="group" aria-label={provider.label}>
        <span className={styles.providerMark} data-provider={provider.id}><LoginProviderIcon provider={provider.id} /></span>
        <div><strong>{provider.label}</strong><span>{t("settingsServices.loginConnectionUnknown")}</span></div>
        <Button variant="outline" size="sm" type="button" disabled aria-describedby={reason}>{t("settingsServices.connect")}</Button>
      </div>)}
    </div>
    <div className={styles.passkeyHead}><div><strong>{t("settings.passkey")}</strong><span>{t("settings.passkeyHint")}</span></div><Button variant="outline" size="sm" disabled aria-describedby={reason}>{t("settings.addPasskey")}</Button></div>
    <div className={styles.passkeyUnknown}><KeyRound aria-hidden="true" /><p>{t("settingsServices.loginStatusUnknown")}</p></div>
  </>
}

export function AccountCard({
  brandName,
  preview = false,
  readBoundary,
  detail,
  onDetailChange,
  onOpenSubscription,
}: {
  brandName?: string
  preview?: boolean
  readBoundary?: ProjectReadBoundary
  detail: AccountDetail
  onDetailChange: (detail: AccountDetail) => void
  onOpenSubscription: () => void
}) {
  const t = useT()
  const unavailableActionsId = useId()
  const router = useRouter()
  const previewAccount = makePreviewAccount(t)
  const [previewAccountEdits, setPreviewAccountEdits] = useState<Partial<AccountProjection>>({})
  const live = useAccountProfile(preview, readBoundary);
  const nameEditor = useAccountProfileEditor(preview ? "" : live.scope, live.profile, live.reload);
  const account = preview
    ? { ...previewAccount, ...previewAccountEdits }
    : live.profile
      ? {
          displayName: live.profile.name,
          email: live.profile.email,
          userId: live.profile.subject,
          planLabel: null,
          credits: null,
          loginMethods: [],
        }
      : null;
  const logoutScope = JSON.stringify([preview, readBoundary?.admitted ?? false, readBoundary?.subject ?? null, readBoundary?.generation ?? null])
  const loginTrigger = useRef<HTMLButtonElement>(null)
  const devicesTrigger = useRef<HTMLButtonElement>(null)
  const previousDetail = useRef<AccountDetail>(null)
  useLayoutEffect(() => {
    if (detail === null && previousDetail.current !== null) {
      (previousDetail.current === "devices" ? devicesTrigger : loginTrigger).current?.focus()
    }
    previousDetail.current = detail
  }, [detail])
  useLayoutEffect(() => () => onDetailChange(null), [logoutScope, onDetailChange])
  const [logoutState, setLogoutState] = useState({ scope: logoutScope, busy: false, failed: false })
  if (logoutState.scope !== logoutScope) {
    setLogoutState({ scope: logoutScope, busy: false, failed: false })
  }
  const loggingOut = logoutState.scope === logoutScope && logoutState.busy
  const logoutFailed = logoutState.scope === logoutScope && logoutState.failed
  const logoutOperation = useRef<{ controller: AbortController; clear: () => void } | null>(null)
  const currentLogoutScope = useRef(logoutScope)
  useLayoutEffect(() => {
    currentLogoutScope.current = logoutScope
    return () => {
      const operation = logoutOperation.current
      logoutOperation.current = null
      operation?.controller.abort(new DOMException("Logout retired", "AbortError"))
      operation?.clear()
    }
  }, [logoutScope])
  const [emailOpen, setEmailOpen] = useState(false)
  const previewEmailTrigger = useRef<HTMLButtonElement>(null)
  const [emailStep, setEmailStep] = useState<"verify" | "replace">("verify")
  const [verificationCode, setVerificationCode] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const previewDeleteTrigger = useRef<HTMLButtonElement>(null)
  const [deleteCode, setDeleteCode] = useState("")
  const [verificationBusy, setVerificationBusy] = useState<"email" | "delete" | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [loginMethodBusy, setLoginMethodBusy] = useState<AccountProjection["loginMethods"][number]["id"] | null>(null)
  const [copyState, setCopyState] = useState<{
    scope: string;
    status: "copied" | "failed";
  } | null>(null);
  const copyScope = preview ? "preview" : live.scope;
  const copyRef = useRef({ scope: copyScope, version: 0, retired: false });
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useLayoutEffect(() => {
    copyRef.current = {
      scope: copyScope,
      version: copyRef.current.version + 1,
      retired: false,
    };
    clearTimeout(copyTimer.current);
    return () => {
      copyRef.current.retired = true;
      copyRef.current.version++;
      clearTimeout(copyTimer.current);
    };
  }, [copyScope]);
  useEffect(
    () => () => {
      copyRef.current.retired = true;
      clearTimeout(copyTimer.current);
    },
    [],
  );
  const copied =
    copyState?.scope === copyScope && copyState.status === "copied";
  const copyUserId = async () => {
    if (!account?.userId) return;
    const active = copyRef.current;
    const version = ++active.version;
    clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(account.userId);
      if (
        active !== copyRef.current ||
        active.retired ||
        version !== active.version
      )
        return;
      setCopyState({ scope: copyScope, status: "copied" });
      copyTimer.current = setTimeout(() => {
        if (
          active === copyRef.current &&
          !active.retired &&
          version === active.version
        )
          setCopyState(null);
      }, 1200);
    } catch {
      if (
        active === copyRef.current &&
        !active.retired &&
        version === active.version
      )
        setCopyState({ scope: copyScope, status: "failed" });
    }
  };


  const logout = async (): Promise<void> => {
    if (logoutOperation.current) return
    const controller = new AbortController()
    const deadline = performance.now() + 10_000
    const timer = setTimeout(() => controller.abort(new DOMException("Logout timed out", "TimeoutError")), 10_000)
    let rejectAbort!: (reason: unknown) => void
    const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
    // Preview and synchronous client failures can finish before the race is attached.
    void interrupted.catch(() => undefined)
    const abort = () => rejectAbort(controller.signal.reason)
    controller.signal.addEventListener("abort", abort, { once: true })
    const operation = {
      controller,
      clear: () => {
        clearTimeout(timer)
        controller.signal.removeEventListener("abort", abort)
      },
    }
    logoutOperation.current = operation
    const active = () => logoutOperation.current === operation && currentLogoutScope.current === logoutScope && !controller.signal.aborted
    setLogoutState({ scope: logoutScope, busy: true, failed: false })
    let handedOff = false
    const navigate = (url: string) => {
      if (!active()) return
      if (performance.now() >= deadline) {
        controller.abort(new DOMException("Logout timed out", "TimeoutError"))
        return
      }
      window.location.assign(url)
      handedOff = true
      operation.clear()
    }
    try {
      if (preview) {
        router.push("/")
        handedOff = true
      } else {
        await Promise.race([endProductSession(navigate, controller.signal), interrupted])
      }
    } catch {
      if (!handedOff && logoutOperation.current === operation && currentLogoutScope.current === logoutScope) {
        logoutOperation.current = null
        setLogoutState({ scope: logoutScope, busy: false, failed: true })
      }
    } finally {
      operation.clear()
    }
    // A confirmed handoff stays busy until navigation leaves this component.
  }

  const displayName = account?.displayName ?? "—"
  const initial = (displayName.trim().charAt(0) || "K").toUpperCase()
  const saveName = async (name: string): Promise<void> => {
    if (!preview || !account || !name.trim() || name.trim() === account.displayName) return
    setPreviewAccountEdits((current) => ({ ...current, displayName: name.trim() }))
  }
  const saveEmail = async (): Promise<void> => {
    if (!preview || !account || !newEmail.includes("@")) return
    setPreviewAccountEdits((current) => ({ ...current, email: newEmail.trim() }))
    setEmailOpen(false)
    setEmailStep("verify")
    setVerificationCode("")
    setNewEmail("")
  }

  const toggleLoginMethod = async (method: AccountProjection["loginMethods"][number]): Promise<void> => {
    if (loginMethodBusy) return
    setLoginMethodBusy(method.id)
    try {
      if (!preview) return
      const source = account?.loginMethods ?? previewAccount.loginMethods
      const nextMethods = source.map((entry) => entry.id === method.id
        ? {
            ...entry,
            connected: !entry.connected,
            account: entry.connected ? null : (account?.email ?? previewAccount.email),
          }
        : entry)
      setPreviewAccountEdits((current) => ({ ...current, loginMethods: nextMethods }))
    } finally {
      setLoginMethodBusy(null)
    }
  }

  const requestAccountVerification = async (kind: "email" | "delete"): Promise<void> => {
    if (verificationBusy) return
    setVerificationBusy(kind)
    try {
      if (!preview) return
    } finally {
      setVerificationBusy(null)
    }
  }

  const deleteAccount = async (): Promise<void> => {
    if (!deleteCode.trim() || deletingAccount) return
    setDeletingAccount(true)
    try {
      if (!preview) return
      setDeleteOpen(false)
      setDeleteCode("")
    } finally {
      setDeletingAccount(false)
    }
  }

  if (detail === "devices") {
    return <AccountDevicesDialog open preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} />
  }

  if (detail === "login-methods") {
    return (
      <div className={styles.loginMethods} data-testid="settings-login-methods" data-live={!preview || undefined} role="region" aria-label={t("settings.loginMethod")}>
        {!preview ? <UnavailableLoginMethods /> : <>
        <div className={styles.loginProviderList}>
          {(preview ? account?.loginMethods ?? previewAccount.loginMethods : []).map((method) => (
            <div className={styles.loginProvider} key={method.id}>
              <span className={styles.providerMark} data-provider={method.id}><LoginProviderIcon provider={method.id} /></span>
              <div><strong>{method.label}</strong>{method.account ? <span>{method.account}</span> : null}</div>
              <Button variant="outline" size="sm" type="button" disabled={!preview || loginMethodBusy !== null} onClick={() => void toggleLoginMethod(method)}>
                {loginMethodBusy === method.id ? <Spinner aria-hidden="true" /> : null}
                {method.connected ? t("settings.disconnect") : t("settings.connect")}
              </Button>
            </div>
          ))}
        </div>
        <div className={styles.passkeyHead}><div><strong>{t("settings.passkey")}</strong><span>{t("settings.passkeyHint")}</span></div><Button variant="outline" size="sm" disabled={!preview}>{t("settings.addPasskey")}</Button></div>
        <Empty className={styles.passkeyEmpty}>
          <EmptyMedia><KeyRound aria-hidden="true" /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("settings.noPasskeys")}</EmptyTitle>
            <EmptyDescription>{t("settings.noPasskeysHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
        </>}
      </div>
    )
  }

  return (
    <div className={styles.accountSettings} data-settings-card data-testid="settings-account">
      {!preview && live.scope && live.phase==="loading" ? <p role="status">{t("billing.loading")}</p> : null}
      {!preview && live.phase==="error" ? <div role="alert">{t("billing.loadError")}<Button variant="outline" size="sm" onClick={live.retry}>{t("billing.retry")}</Button></div> : null}
      {copyState?.scope===copyScope && copyState.status==="failed" ? <p role="alert">{t("share.projectCopyFailed")}</p> : null}
      <div className={styles.accountIdentityRow}>
        <div className={styles.identity}>
          <span className={styles.identityAvatar} aria-hidden>{initial}</span>
          <div className={styles.identityText}>
            <span className={styles.identityFieldLabel}>{t("settings.fullName")}</span>
            <Input
              className={styles.identityInput}
              value={
                preview
                  ? displayName
                  : nameEditor.initialized
                    ? nameEditor.draft
                    : "—"
              }
              onChange={(event) => {
                if (preview)
                  setPreviewAccountEdits((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }));
                else nameEditor.change(event.target.value);
              }}
              aria-label={t("settings.fullName")}
              aria-invalid={!preview && nameEditor.phase === "invalid"}
              onBlur={(event) => {
                if (preview) void saveName(event.currentTarget.value);
              }}
              disabled={!preview && !nameEditor.editable}
            />
            {!preview ? (
              <div className={styles.nameActions}>
                <Button
                  size="sm"
                  type="button"
                  disabled={!nameEditor.canSave}
                  onClick={() => void nameEditor.save()}
                >
                  {t("settings.name.save")}
                </Button>
                {nameEditor.phase === "submitting" ? (
                  <p role="status">{t("settings.name.saving")}</p>
                ) : null}
                {nameEditor.phase === "saved" ? (
                  <p role="status">{t("settings.name.saved")}</p>
                ) : null}
                {nameEditor.phase === "invalid" ? (
                  <p role="alert">{t("settings.name.invalid")}</p>
                ) : null}
                {["conflict", "reconciliationRequired", "readFailed"].includes(
                  nameEditor.phase,
                ) ? (
                  <div role="alert">
                    <p>{t("settings.name.readRequired")}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void nameEditor.retryRead()}
                    >
                      {t("billing.retry")}
                    </Button>
                  </div>
                ) : null}
                {nameEditor.phase === "review" ? (
                  <div role="alert">
                    <p>{t("settings.name.review")}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={nameEditor.adoptServer}
                    >
                      {t("settings.name.adopt")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={nameEditor.keepDraft}
                    >
                      {t("settings.name.keep")}
                    </Button>
                  </div>
                ) : null}
                {nameEditor.phase === "rejected" ? (
                  <p role="alert">{t("settings.name.rejected")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="icon-sm" type="button" aria-label={t("settings.logout")} data-testid="settings-logout" onClick={() => void logout()} disabled={loggingOut}>
          {loggingOut ? <Spinner aria-hidden="true" /> : <LogOut aria-hidden="true" />}
        </Button>
      </div>

      {logoutFailed ? <p role="alert">{t("settings.logoutUnconfirmed")}</p> : null}

      <div className={styles.planCard}>
        <div className={styles.planHeader}><strong>{preview ? account?.planLabel ?? "—" : t("settings.creditsMenu")}</strong><Button variant="default" size="sm" type="button" onClick={onOpenSubscription}>{t("firstSite.upgrade")}</Button></div>
        <div className={styles.planBody} data-slot="account-plan-body">
          <div className={styles.creditGroup} data-slot="account-credit-group">
            {preview ? <div className={styles.creditTotal}><span><Sparkles />{t("settings.creditsMenu")}<CircleHelp /></span><strong>{account?.credits ?? "—"}</strong></div> : <AccountCreditSummary readBoundary={readBoundary} />}
          </div>
        </div>
      </div>

      {/* Credits come from their own summary read. Unknown plan details stay
       * unknown; unsupported identity changes remain unavailable below. */}
      <div className={styles.accountDetailRows}>
        <div className={styles.accountDetailRow}>
          <div>
            <strong>{t("settings.email")}</strong>
            <span>{account?.email ?? "—"}</span>
          </div>
          {preview ? <Button ref={previewEmailTrigger} variant="outline" size="sm" type="button" aria-describedby={!preview ? unavailableActionsId : undefined} disabled={!preview || !account?.email} onClick={() => setEmailOpen(true)}>{t("settings.changeEmail")}</Button> : <AccountServiceDetailsDialog key={`email:${logoutScope}`} kind="email" confirmedEmail={live.profile?.email_verified ? live.profile.email : null} identity={live.profile} />}
        </div>
        <div className={styles.accountDetailRow}>
          <div>
            <strong>{t("settings.userId")}</strong>
            <span>{account?.userId ?? "—"}</span>
          </div>
          <Button variant="outline" size="sm" type="button" disabled={!account?.userId} onClick={() => void copyUserId()}>{copied ? t("settings.copied") : t("settings.copyUserId")}</Button>
        </div>
        <div className={styles.accountDetailRow}>
          <div>
            <strong>{t("settings.loginMethod")}</strong>
            <span>{t("settings.loginMethodHint", { brand: brandName ?? "Kokoro" })}</span>
          </div>
          <Button ref={loginTrigger} variant="outline" size="sm" type="button" aria-label={t("settings.loginMethod")} onClick={() => onDetailChange("login-methods")}>{t("settings.manage")}</Button>
        </div>
        <div className={styles.accountDetailRow}>
          <div>
            <strong>{t("settings.devices.title")}</strong>
            <span>{t("settings.devices.description")}</span>
          </div>
          <Button ref={devicesTrigger} variant="outline" size="sm" type="button" aria-label={t("settings.devices.title")} disabled={preview || !readBoundary?.admitted || readBoundary.subject === null} onClick={() => onDetailChange("devices")}>{t("settings.manage")}</Button>
        </div>
        <div className={`${styles.accountDetailRow} ${styles.dangerRow}`}>
          <div>
            <strong>{t("settings.deleteAccount")}</strong>
            <span>{t("settings.deleteAccountHint")}</span>
          </div>
          {preview ? <Button ref={previewDeleteTrigger} variant="outline" size="sm" type="button" aria-describedby={!preview ? unavailableActionsId : undefined} onClick={() => setDeleteOpen(true)} disabled={!preview}>{t("settings.deleteAccount")}</Button> : <AccountServiceDetailsDialog key={`delete:${logoutScope}`} kind="delete" confirmedEmail={live.profile?.email_verified ? live.profile.email : null} identity={live.profile} />}
        </div>
      </div>
      {!preview ? <FieldDescription id={unavailableActionsId}>{t("settings.accountActionsUnavailable")}</FieldDescription> : null}

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className={styles.accountEmailDialog} closeLabel={t("shell.closeDialog")} onCloseAutoFocus={(event) => { event.preventDefault(); previewEmailTrigger.current?.focus() }}>
          <DialogTitle>{t("settings.changeEmailTitle")}</DialogTitle>
          <p className={styles.accountDialogHint}>{t("settings.changeEmailSecurity")}</p>
          {emailStep === "verify" ? <Field><FieldLabel>{t("settings.verifyIdentity")}</FieldLabel><FieldDescription>{t("settings.verifyIdentityHint", { email: account?.email ?? "" })}</FieldDescription><div className={styles.codeField}><Input aria-label={t("settings.verificationCode")} placeholder={t("settings.verificationCode")} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} /><Button variant="ghost" disabled={verificationBusy !== null} onClick={() => void requestAccountVerification("email")}>{verificationBusy === "email" ? <Spinner aria-hidden="true" /> : null}{t("settings.send")}</Button></div></Field> : <Field><FieldLabel htmlFor="new-account-email">{t("settings.newEmail")}</FieldLabel><Input id="new-account-email" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></Field>}
          <DialogFooter><DialogClose asChild><Button variant="outline">{t("firstSite.cancel")}</Button></DialogClose>{emailStep === "verify" ? <Button disabled={!verificationCode.trim()} onClick={() => setEmailStep("replace")}>{t("settings.next")}</Button> : <Button disabled={!newEmail.includes("@")} onClick={() => void saveEmail()}>{t("firstSite.save")}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className={styles.deleteAccountDialog} closeLabel={t("shell.closeDialog")} onCloseAutoFocus={(event) => { event.preventDefault(); previewDeleteTrigger.current?.focus() }}>
          <DialogTitle>{t("settings.confirmDeleteAccount")}</DialogTitle>
          <div className={styles.deleteWarnings}><p>{t("settings.deleteWarningPermanent")}</p><p>{t("settings.deleteWarningRetention")}</p><p>{t("settings.deleteWarningSubscription")}</p></div>
          <Field><FieldLabel>{t("settings.verifyEmail", { email: account?.email ?? "" })}</FieldLabel><div className={styles.codeField}><Input aria-label={t("settings.verificationCode")} placeholder={t("settings.verificationCode")} value={deleteCode} onChange={(event) => setDeleteCode(event.target.value)} /><Button variant="outline" disabled={verificationBusy !== null} onClick={() => void requestAccountVerification("delete")}>{verificationBusy === "delete" ? <Spinner aria-hidden="true" /> : null}{t("settings.sendCode")}</Button></div></Field>
          <DialogFooter><DialogClose asChild><Button variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button variant="destructive" disabled={!deleteCode.trim() || deletingAccount} onClick={() => void deleteAccount()}>{deletingAccount ? <Spinner aria-hidden="true" /> : null}{t("settings.deleteAccount")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
