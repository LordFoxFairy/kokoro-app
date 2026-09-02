"use client"

// 设置分区内容（账户 / 外观与语言 / 对话偏好 / 订阅与余额 / 能力入口）：从设置分区层抽出，
// 供设置中心各 tab 复用，单一真源。每卡就地保存或即时生效。
// 账户资料和登录方式来自同源 settings projection；不从 session 信封或团队名推断个人资料。

import { useEffect, useRef, useState, type SVGProps } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowUpRight, CalendarSync, ChevronRight, CircleHelp, Contrast, Copy, Ellipsis, FileText, FolderPlus, Gift, Globe, Globe2, KeyRound, LayoutGrid, LogOut, Mail, Moon, Pencil, Plus, RefreshCw, Search, Server, Sparkles, Sun, Wifi, X } from "lucide-react"

import type { AgentCandidate, ModelCandidate } from "@/contract/http"
import { useLocale, useT } from "@/i18n/context"
import { useTheme, type ThemeMode } from "@/ui/theme/theme-context"
import { mutationHeaders } from "@/lib/client/mutation"
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/messages"
import { browserListClient } from "@/ui/shell/page-clients"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { readChatAgent, readChatModel, writeChatAgent, writeChatModel } from "./chat-prefs"
import styles from "./settings-sections.module.css"

// 缺省选择占位：跟随空间缺省（不上 wire）。以哨兵值区分于具体候选。
const FOLLOW_PROFILE = ""
const FOLLOW_PROFILE_VALUE = "__follow_profile__"

function modelSelector(model: ModelCandidate): string {
  return `${model.provider}:${model.name}`
}

type AccountProjection = {
  displayName: string
  email: string
  userId: string
  planLabel: string
  credits: string
  freeCredits: string
  dailyCredits: string
  dailyRefreshText: string
  loginMethods: { id: "google" | "microsoft" | "apple"; label: string; account: string | null; connected: boolean }[]
}

function makePreviewAccount(t: ReturnType<typeof useT>): AccountProjection {
  return {
    displayName: "Preview User",
    email: "preview@example.test",
    userId: "preview-user",
    planLabel: t("billing.freeTier"),
    credits: "1,000",
    freeCredits: "1,000",
    dailyCredits: "300",
    dailyRefreshText: t("billing.dailyRefreshHint", { time: "00:00", credits: "300" }),
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

export function AccountCard({
  brandName,
  preview = false,
  loginMethodsOpen,
  onLoginMethodsChange,
}: {
  brandName?: string
  preview?: boolean
  loginMethodsOpen: boolean
  onLoginMethodsChange: (open: boolean) => void
}) {
  const t = useT()
  const router = useRouter()
  const previewAccount = makePreviewAccount(t)
  const [loadedAccount, setLoadedAccount] = useState<AccountProjection | null>(null)
  const [previewAccountEdits, setPreviewAccountEdits] = useState<Partial<AccountProjection>>({})
  const account = preview ? { ...previewAccount, ...previewAccountEdits } : loadedAccount
  const [loggingOut, setLoggingOut] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailStep, setEmailStep] = useState<"verify" | "replace">("verify")
  const [verificationCode, setVerificationCode] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteCode, setDeleteCode] = useState("")
  const [verificationBusy, setVerificationBusy] = useState<"email" | "delete" | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [loginMethodBusy, setLoginMethodBusy] = useState<AccountProjection["loginMethods"][number]["id"] | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (preview) return
    let live = true
    void fetch("/api/settings/account", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`account_load_failed:${response.status}`)
        const payload = await response.json() as { data?: AccountProjection } | AccountProjection
        return "data" in payload && payload.data ? payload.data : payload as AccountProjection
      })
      .then((value) => live && setLoadedAccount(value))
      .catch(() => live && setLoadedAccount(null))
    return () => {
      live = false
    }
  }, [preview])

  const logout = async (): Promise<void> => {
    setLoggingOut(true)
    if (preview) {
      router.push("/")
      return
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // 登出失败也回首页：信封若仍在，首页闸会重新裁决。
    }
    router.push("/")
  }

  const displayName = account?.displayName ?? "—"
  const initial = (displayName.trim().charAt(0) || "K").toUpperCase()
  const saveName = async (name: string): Promise<void> => {
    if (!account || !name.trim() || name.trim() === account.displayName) return
    if (preview) setPreviewAccountEdits((current) => ({ ...current, displayName: name.trim() }))
    else setLoadedAccount({ ...account, displayName: name.trim() })
    if (!preview) await fetch("/api/settings/account", { method: "PATCH", headers: mutationHeaders({ "content-type": "application/json" }), body: JSON.stringify({ display_name: name.trim() }) })
  }
  const saveEmail = async (): Promise<void> => {
    if (!account || !newEmail.includes("@")) return
    if (!preview) await fetch("/api/settings/account/email", { method: "PATCH", headers: mutationHeaders({ "content-type": "application/json" }), body: JSON.stringify({ verification_code: verificationCode, email: newEmail.trim() }) })
    if (preview) setPreviewAccountEdits((current) => ({ ...current, email: newEmail.trim() }))
    else setLoadedAccount({ ...account, email: newEmail.trim() })
    setEmailOpen(false)
    setEmailStep("verify")
    setVerificationCode("")
    setNewEmail("")
  }

  const toggleLoginMethod = async (method: AccountProjection["loginMethods"][number]): Promise<void> => {
    if (loginMethodBusy) return
    setLoginMethodBusy(method.id)
    try {
      if (!preview) {
        const suffix = method.connected ? "" : "/connect"
        const response = await fetch(`/api/settings/account/login-methods/${method.id}${suffix}`, {
          method: method.connected ? "DELETE" : "POST",
          headers: mutationHeaders(),
        })
        if (!response.ok) return
      }
      const source = account?.loginMethods ?? previewAccount.loginMethods
      const nextMethods = source.map((entry) => entry.id === method.id
        ? {
            ...entry,
            connected: !entry.connected,
            account: entry.connected ? null : (account?.email ?? previewAccount.email),
          }
        : entry)
      if (preview) setPreviewAccountEdits((current) => ({ ...current, loginMethods: nextMethods }))
      else if (account) setLoadedAccount({ ...account, loginMethods: nextMethods })
    } finally {
      setLoginMethodBusy(null)
    }
  }

  const requestAccountVerification = async (kind: "email" | "delete"): Promise<void> => {
    if (verificationBusy) return
    setVerificationBusy(kind)
    try {
      if (!preview) {
        const endpoint = kind === "email" ? "email-verifications" : "deletion-verifications"
        await fetch(`/api/settings/account/${endpoint}`, { method: "POST", headers: mutationHeaders() })
      }
    } finally {
      setVerificationBusy(null)
    }
  }

  const deleteAccount = async (): Promise<void> => {
    if (!deleteCode.trim() || deletingAccount) return
    setDeletingAccount(true)
    try {
      if (!preview) {
        const response = await fetch("/api/settings/account", {
          method: "DELETE",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ verification_code: deleteCode.trim() }),
        })
        if (!response.ok) return
        router.replace("/login")
      } else {
        setDeleteOpen(false)
        setDeleteCode("")
      }
    } finally {
      setDeletingAccount(false)
    }
  }

  if (loginMethodsOpen) {
    return (
      <div className={styles.loginMethods} data-testid="settings-login-methods">
        <div className={styles.loginProviderList}>
          {(account?.loginMethods ?? previewAccount.loginMethods).map((method) => (
            <div className={styles.loginProvider} key={method.id}>
              <span className={styles.providerMark} data-provider={method.id}><LoginProviderIcon provider={method.id} /></span>
              <div><strong>{method.label}</strong>{method.account ? <span>{method.account}</span> : null}</div>
              <Button variant="outline" size="sm" type="button" disabled={loginMethodBusy !== null} onClick={() => void toggleLoginMethod(method)}>
                {loginMethodBusy === method.id ? <Spinner aria-hidden="true" /> : null}
                {method.connected ? t("settings.disconnect") : t("settings.connect")}
              </Button>
            </div>
          ))}
        </div>
        <div className={styles.passkeyHead}><div><strong>{t("settings.passkey")}</strong><span>{t("settings.passkeyHint")}</span></div><Button variant="outline" size="sm">{t("settings.addPasskey")}</Button></div>
        <Empty className={styles.passkeyEmpty}>
          <EmptyMedia><KeyRound aria-hidden="true" /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("settings.noPasskeys")}</EmptyTitle>
            <EmptyDescription>{t("settings.noPasskeysHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className={styles.accountSettings} data-settings-card data-testid="settings-account">
      <div className={styles.accountIdentityRow}>
        <div className={styles.identity}>
          <span className={styles.identityAvatar} aria-hidden>{initial}</span>
          <div className={styles.identityText}>
            <span className={styles.identityFieldLabel}>{t("settings.fullName")}</span>
            <Input className={styles.identityInput} defaultValue={displayName} aria-label={t("settings.fullName")} onBlur={(event) => void saveName(event.currentTarget.value)} />
          </div>
        </div>
        <Button variant="outline" size="icon-sm" type="button" aria-label={t("settings.logout")} data-testid="settings-logout" onClick={() => void logout()} disabled={loggingOut}>
          {loggingOut ? <Spinner aria-hidden="true" /> : <LogOut aria-hidden="true" />}
        </Button>
      </div>

      <div className={styles.planCard}>
        <div className={styles.planHeader}><strong>{account?.planLabel ?? t("billing.freeTier")}</strong><Button variant="default" size="sm" type="button" onClick={() => router.push("/app?settings=subscription")}>{t("firstSite.upgrade")}</Button></div>
        <div className={styles.planBody} data-slot="account-plan-body">
          <div className={styles.creditGroup} data-slot="account-credit-group">
            <div className={styles.creditTotal}><span><Sparkles />{t("settings.creditsMenu")}<CircleHelp /></span><strong>{account?.credits ?? "—"}</strong></div>
            <div className={styles.creditBreakdown}><span>{t("settings.freeCredits")}</span><span>{account?.freeCredits ?? "—"}</span></div>
          </div>
          <div className={styles.dailyCredits} data-slot="account-daily-credit-group"><div><strong><CalendarSync />{t("settings.dailyCredits")}</strong><span>{account?.dailyRefreshText ?? "—"}</span></div><strong>{account?.dailyCredits ?? "—"}</strong></div>
        </div>
      </div>

      {/* Keep the account sheet's information architecture intact without
       * inventing identity data that the current Web contract does not
       * provide. The unavailable values intentionally remain em dashes. */}
      <div className={styles.accountDetailRows}>
        <div className={styles.accountDetailRow}>
          <div>
            <strong>{t("settings.email")}</strong>
            <span>{account?.email ?? "—"}</span>
          </div>
          <Button variant="outline" size="sm" type="button" disabled={!account?.email} onClick={() => setEmailOpen(true)}>{t("settings.changeEmail")}</Button>
        </div>
        <div className={styles.accountDetailRow}>
          <div>
            <strong>{t("settings.userId")}</strong>
            <span>{account?.userId ?? "—"}</span>
          </div>
          <Button variant="outline" size="sm" type="button" disabled={!account?.userId} onClick={() => { if (account?.userId) void navigator.clipboard.writeText(account.userId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }) }}>{copied ? t("settings.copied") : t("settings.copyUserId")}</Button>
        </div>
        <div className={styles.accountDetailRow}>
          <div>
            <strong>{t("settings.loginMethod")}</strong>
            <span>{t("settings.loginMethodHint", { brand: brandName ?? "Kokoro" })}</span>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={() => onLoginMethodsChange(true)}>{t("settings.manage")}</Button>
        </div>
        <div className={`${styles.accountDetailRow} ${styles.dangerRow}`}>
          <div>
            <strong>{t("settings.deleteAccount")}</strong>
            <span>{t("settings.deleteAccountHint")}</span>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={() => setDeleteOpen(true)}>{t("settings.deleteAccount")}</Button>
        </div>
      </div>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className={styles.accountEmailDialog} closeLabel={t("shell.closeDialog")}>
          <DialogTitle>{t("settings.changeEmailTitle")}</DialogTitle>
          <p className={styles.accountDialogHint}>{t("settings.changeEmailSecurity")}</p>
          {emailStep === "verify" ? <Field><FieldLabel>{t("settings.verifyIdentity")}</FieldLabel><FieldDescription>{t("settings.verifyIdentityHint", { email: account?.email ?? "" })}</FieldDescription><div className={styles.codeField}><Input aria-label={t("settings.verificationCode")} placeholder={t("settings.verificationCode")} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} /><Button variant="ghost" disabled={verificationBusy !== null} onClick={() => void requestAccountVerification("email")}>{verificationBusy === "email" ? <Spinner aria-hidden="true" /> : null}{t("settings.send")}</Button></div></Field> : <Field><FieldLabel htmlFor="new-account-email">{t("settings.newEmail")}</FieldLabel><Input id="new-account-email" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></Field>}
          <DialogFooter><DialogClose asChild><Button variant="outline">{t("firstSite.cancel")}</Button></DialogClose>{emailStep === "verify" ? <Button disabled={!verificationCode.trim()} onClick={() => setEmailStep("replace")}>{t("settings.next")}</Button> : <Button disabled={!newEmail.includes("@")} onClick={() => void saveEmail()}>{t("firstSite.save")}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className={styles.deleteAccountDialog} closeLabel={t("shell.closeDialog")}>
          <DialogTitle>{t("settings.confirmDeleteAccount")}</DialogTitle>
          <div className={styles.deleteWarnings}><p>{t("settings.deleteWarningPermanent")}</p><p>{t("settings.deleteWarningRetention")}</p><p>{t("settings.deleteWarningSubscription")}</p></div>
          <Field><FieldLabel>{t("settings.verifyEmail", { email: account?.email ?? "" })}</FieldLabel><div className={styles.codeField}><Input aria-label={t("settings.verificationCode")} placeholder={t("settings.verificationCode")} value={deleteCode} onChange={(event) => setDeleteCode(event.target.value)} /><Button variant="outline" disabled={verificationBusy !== null} onClick={() => void requestAccountVerification("delete")}>{verificationBusy === "delete" ? <Spinner aria-hidden="true" /> : null}{t("settings.sendCode")}</Button></div></Field>
          <DialogFooter><DialogClose asChild><Button variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button variant="destructive" disabled={!deleteCode.trim() || deletingAccount} onClick={() => void deleteAccount()}>{deletingAccount ? <Spinner aria-hidden="true" /> : null}{t("settings.deleteAccount")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type PreferenceProjection = {
  browser_notifications: boolean
  sound_notifications: boolean
  product_updates: boolean
  brand_ads: boolean
}

const previewPreferences: PreferenceProjection = {
  browser_notifications: false,
  sound_notifications: false,
  product_updates: true,
  brand_ads: true,
}

function readPreferenceProjection(payload: unknown): PreferenceProjection | null {
  if (typeof payload !== "object" || payload === null) return null
  const candidate = "data" in payload && typeof payload.data === "object" && payload.data !== null
    ? payload.data
    : payload
  if (
    !("browser_notifications" in candidate) || typeof candidate.browser_notifications !== "boolean" ||
    !("sound_notifications" in candidate) || typeof candidate.sound_notifications !== "boolean" ||
    !("product_updates" in candidate) || typeof candidate.product_updates !== "boolean" ||
    !("brand_ads" in candidate) || typeof candidate.brand_ads !== "boolean"
  ) return null
  return {
    browser_notifications: candidate.browser_notifications,
    sound_notifications: candidate.sound_notifications,
    product_updates: candidate.product_updates,
    brand_ads: candidate.brand_ads,
  }
}

// —— 卡二：外观与语言 —— 主题三档（WEB-THEME）/ 语言（i18n）即时生效。
export function AppearanceCard({ brandName = "Kokoro", preview = false }: { brandName?: string; preview?: boolean }) {
  const t = useT()
  const { mode, setMode } = useTheme()
  const { locale, setLocale } = useLocale()
  const [preferences, setPreferences] = useState<PreferenceProjection>(previewPreferences)

  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    void fetch("/api/settings/preferences", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`preferences_load_failed:${response.status}`)
        const projection = readPreferenceProjection(await response.json())
        if (projection === null) throw new Error("preferences_payload_invalid")
        setPreferences(projection)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setPreferences(previewPreferences)
      })
    return () => controller.abort()
  }, [preview])

  const updatePreference = async (key: keyof PreferenceProjection, checked: boolean): Promise<void> => {
    const previous = preferences
    setPreferences((current) => ({ ...current, [key]: checked }))
    if (preview) return
    try {
      const response = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ [key]: checked }),
      })
      if (!response.ok) throw new Error(`preferences_save_failed:${response.status}`)
    } catch {
      setPreferences(previous)
    }
  }

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: t("theme.light") },
    { value: "dark", label: t("theme.dark") },
    // Manus presents automatic/system last, after the explicit light/dark
    // choices. The value remains the shared ThemeMode contract.
    { value: "system", label: t("theme.system") },
  ]
  const themeIcons = { system: Contrast, light: Sun, dark: Moon } as const
  return (
    <div className={styles.generalSettings} data-testid="settings-appearance">
      <section className={styles.generalSection} aria-labelledby="settings-appearance-heading">
        <h3 id="settings-appearance-heading">{t("settings.appearanceSection")}</h3>
        <div className={styles.generalRowStackCompact}>
          <span className={styles.rowLabel}>{t("settings.language")}</span>
          <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
            <SelectTrigger className={styles.select} aria-label={t("lang.switchAria")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" sideOffset={0} className={styles.languageSelectContent}>
              <SelectGroup>
                {LOCALES.map((code) => <SelectItem key={code} value={code}>{LOCALE_NAMES[code]}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className={styles.generalRowStack}>
          <span className={styles.rowLabel}>{t("settings.theme")}</span>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => { if (value) setMode(value as ThemeMode) }}
            className={styles.themeChoices}
            aria-label={t("theme.switchAria")}
          >
            {themeOptions.map((option) => {
              const Icon = themeIcons[option.value]
              return <ToggleGroupItem key={option.value} value={option.value} variant="default" className={styles.themeChoice}><Icon aria-hidden="true" /><span>{option.label}</span></ToggleGroupItem>
            })}
          </ToggleGroup>
        </div>
      </section>
      <section className={styles.notificationSection} aria-labelledby="settings-notifications-heading">
        <h3 id="settings-notifications-heading">{t("settings.notificationsGroup")}</h3>
        {([
          ["settings.browserNotifications", "settings.browserNotificationsHint", "browser_notifications"],
          ["settings.soundNotifications", "settings.soundNotificationsHint", "sound_notifications"],
          ["settings.productUpdates", "settings.productUpdatesHint", "product_updates"],
          ["settings.brandAds", "settings.brandAdsHint", "brand_ads"],
        ] as const).map(([label, description, key]) => (
          <div className={styles.notificationRow} key={label}>
            <div><strong>{t(label).replaceAll("Kokoro", brandName)}</strong><span>{t(description).replaceAll("Kokoro", brandName)}</span></div>
            <Switch
              size="sm"
              checked={preferences[key]}
              onCheckedChange={(checked) => void updatePreference(key, checked)}
              aria-label={t(label).replaceAll("Kokoro", brandName)}
            />
          </div>
        ))}
      </section>
    </div>
  )
}

function readPreviewPersonalizationField(key: "nickname" | "occupation" | "about" | "instructions"): string {
  if (typeof window === "undefined") return ""
  const raw = window.localStorage.getItem("kokoro.personalization.preview")
  if (!raw) return ""
  try {
    const saved = JSON.parse(raw) as Partial<Record<typeof key, string>>
    return saved[key] ?? ""
  } catch {
    return ""
  }
}

export function PersonalizationCard({ preview = false }: { preview?: boolean }) {
  const t = useT()
  const [section, setSection] = useState<"profile" | "knowledge">("profile")
  const [nickname, setNickname] = useState(() => preview ? readPreviewPersonalizationField("nickname") : "")
  const [occupation, setOccupation] = useState(() => preview ? readPreviewPersonalizationField("occupation") : "")
  const [about, setAbout] = useState(() => preview ? readPreviewPersonalizationField("about") : "")
  const [instructions, setInstructions] = useState(() => preview ? readPreviewPersonalizationField("instructions") : "")
  const [knowledgeQuery, setKnowledgeQuery] = useState("")
  const [knowledgeOpen, setKnowledgeOpen] = useState(false)
  const [knowledgeName, setKnowledgeName] = useState("")
  const [knowledgeWhen, setKnowledgeWhen] = useState("")
  const [knowledgeContent, setKnowledgeContent] = useState("")
  const [knowledgeSaving, setKnowledgeSaving] = useState(false)
  const [knowledgeEntries, setKnowledgeEntries] = useState<Array<{ id: string; name: string; when: string; content: string }>>([])
  const knowledgeReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importCopied, setImportCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const importReturnFocusRef = useRef<HTMLButtonElement | null>(null)

  const persist = async (): Promise<void> => {
    const payload = { nickname, occupation, about, instructions }
    if (preview) {
      window.localStorage.setItem("kokoro.personalization.preview", JSON.stringify(payload))
      return
    }
    try {
      await fetch("/api/hub/preferences/personalization", {
        method: "PATCH",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(payload),
      })
    } catch {
      // Inputs remain editable; the next blur retries with the complete draft.
    }
  }

  const saveKnowledge = async (): Promise<void> => {
    if (!knowledgeName.trim() || !knowledgeWhen.trim() || !knowledgeContent.trim() || knowledgeSaving) return
    const entry = {
      id: `knowledge-${Date.now()}`,
      name: knowledgeName.trim(),
      when: knowledgeWhen.trim(),
      content: knowledgeContent.trim(),
    }
    setKnowledgeSaving(true)
    try {
      if (!preview) {
        const response = await fetch("/api/hub/preferences/knowledge", {
          method: "POST",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ name: entry.name, usage_context: entry.when, content: entry.content }),
        })
        if (!response.ok) return
      }
      setKnowledgeEntries((entries) => [...entries, entry])
      setKnowledgeOpen(false)
      setKnowledgeName("")
      setKnowledgeWhen("")
      setKnowledgeContent("")
    } finally {
      setKnowledgeSaving(false)
    }
  }

  const importMemory = async (): Promise<void> => {
    if (!importText.trim() || importing) return
    setImporting(true)
    try {
      if (!preview) {
        const response = await fetch("/api/hub/preferences/personalization/imports", {
          method: "POST",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ content: importText.trim() }),
        })
        if (!response.ok) return
      }
      setImportOpen(false)
      setImportText("")
    } finally {
      setImporting(false)
    }
  }

  const visibleKnowledge = knowledgeEntries.filter((entry) => {
    const query = knowledgeQuery.trim().toLocaleLowerCase()
    return !query || `${entry.name} ${entry.when} ${entry.content}`.toLocaleLowerCase().includes(query)
  })

  return (
    <div className={styles.personalization} data-testid="settings-personalization">
      <div className={styles.personalizationTabs} role="tablist" aria-label={t("settings.personalizationTitle")}>
        <Button type="button" variant="ghost" role="tab" aria-selected={section === "profile"} data-active={section === "profile"} onClick={() => setSection("profile")}>{t("settings.personalProfile")}</Button>
        <Button type="button" variant="ghost" role="tab" aria-selected={section === "knowledge"} data-active={section === "knowledge"} onClick={() => setSection("knowledge")}>{t("settings.knowledge")}<CircleHelp aria-hidden="true" /></Button>
      </div>
      {section === "profile" ? (
        <div className={styles.personalizationProfile}>
          <button type="button" className={styles.memoryImportCard} onClick={(event) => {
            importReturnFocusRef.current = event.currentTarget
            setImportOpen(true)
          }}>
            <span className={styles.memoryImportIcon}><LayoutGrid aria-hidden="true" /></span>
            <span><strong>{t("settings.importFromAi")}</strong><small>{t("settings.importFromAiHint")}</small></span>
            <ChevronRight aria-hidden="true" />
          </button>
          <div className={styles.profileColumns}>
            <label><span>{t("settings.nickname")}</span><Input aria-label={t("settings.nickname")} placeholder={t("settings.nicknamePlaceholder")} value={nickname} onChange={(event) => setNickname(event.target.value)} onBlur={() => void persist()} /></label>
            <label><span>{t("settings.occupation")}</span><Input aria-label={t("settings.occupation")} placeholder={t("settings.occupationPlaceholder")} value={occupation} onChange={(event) => setOccupation(event.target.value)} onBlur={() => void persist()} /></label>
          </div>
          <label className={styles.profileTextarea}><span>{t("settings.aboutYou")}</span><Textarea aria-label={t("settings.aboutYou")} placeholder={t("settings.aboutYouPlaceholder")} value={about} onChange={(event) => setAbout(event.target.value)} onBlur={() => void persist()} /></label>
          <p className={styles.profileHint}>{t("settings.aboutYouHint")}</p>
          <label className={styles.profileTextarea}><span>{t("settings.customInstructions")}</span><Textarea aria-label={t("settings.customInstructions")} placeholder={t("settings.customInstructionsPlaceholder")} value={instructions} onChange={(event) => setInstructions(event.target.value)} onBlur={() => void persist()} /></label>
          <Button type="button" variant="outline" className={styles.importMemoryButton} onClick={(event) => {
            importReturnFocusRef.current = event.currentTarget
            setImportOpen(true)
          }}>{t("settings.importMemory")}</Button>
        </div>
      ) : (
        <div className={styles.personalizationKnowledge}>
          <div className={styles.knowledgeToolbar}>
            <label className={styles.knowledgeSearch}>
              <Search aria-hidden="true" />
              <Input value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} aria-label={t("settings.searchKnowledge")} placeholder={t("settings.searchKnowledge")} />
            </label>
            <Button type="button" variant="outline" size="sm" onClick={(event) => {
              knowledgeReturnFocusRef.current = event.currentTarget
              setKnowledgeOpen(true)
            }}><Plus aria-hidden="true" />{t("settings.addKnowledge")}</Button>
          </div>
          {visibleKnowledge.length === 0 ? (
            <Empty className={styles.knowledgeEmpty}>
              <EmptyMedia><Search aria-hidden="true" /></EmptyMedia>
              <EmptyDescription>{t("settings.noKnowledge")}</EmptyDescription>
            </Empty>
          ) : (
            <div className={styles.knowledgeList}>
              {visibleKnowledge.map((entry) => <article key={entry.id}><strong>{entry.name}</strong><span>{entry.when}</span></article>)}
          </div>
          )}
        </div>
      )}
      <Dialog open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
        <DialogContent
          className={styles.knowledgeDialog}
          closeLabel={t("shell.closeDialog")}
          onCloseAutoFocus={(event) => {
            const target = knowledgeReturnFocusRef.current
            if (!target?.isConnected) return
            event.preventDefault()
            window.requestAnimationFrame(() => {
              if (target.isConnected) target.focus({ preventScroll: true })
            })
          }}
        >
          <DialogTitle>{t("settings.addKnowledgeTitle")}</DialogTitle>
          <FieldGroup className={styles.knowledgeForm}>
            <Field><FieldLabel htmlFor="knowledge-name">{t("settings.knowledgeNameLabel")}</FieldLabel><Input id="knowledge-name" autoFocus value={knowledgeName} onChange={(event) => setKnowledgeName(event.target.value)} placeholder={t("settings.knowledgeNamePlaceholder")} /></Field>
            <Field><FieldLabel htmlFor="knowledge-when">{t("settings.knowledgeWhenLabel")}</FieldLabel><Input id="knowledge-when" value={knowledgeWhen} onChange={(event) => setKnowledgeWhen(event.target.value)} placeholder={t("settings.knowledgeWhenPlaceholder")} /></Field>
            <Field><FieldLabel htmlFor="knowledge-content">{t("settings.knowledgeContentLabel")}</FieldLabel><Textarea id="knowledge-content" maxLength={2000} value={knowledgeContent} onChange={(event) => setKnowledgeContent(event.target.value)} placeholder={t("settings.knowledgeContentPlaceholder")} /><span className={styles.knowledgeCount}>{knowledgeContent.length} / 2000</span></Field>
          </FieldGroup>
          <DialogFooter className={styles.knowledgeFooter}>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button type="button" disabled={!knowledgeName.trim() || !knowledgeWhen.trim() || !knowledgeContent.trim() || knowledgeSaving} onClick={() => void saveKnowledge()}>{knowledgeSaving ? <Spinner aria-hidden="true" /> : null}{t("firstSite.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent
          className={styles.importMemoryDialog}
          closeLabel={t("shell.closeDialog")}
          onCloseAutoFocus={(event) => {
            const target = importReturnFocusRef.current
            if (!target?.isConnected) return
            event.preventDefault()
            window.requestAnimationFrame(() => {
              if (target.isConnected) target.focus({ preventScroll: true })
            })
          }}
        >
          <DialogTitle>{t("settings.importMemory")}</DialogTitle>
          <p className={styles.importMemoryDescription}>{t("settings.importMemoryDescription")}</p>
          <div className={styles.importMemorySteps}>
            <section className={styles.importMemoryStep}>
              <span className={styles.importStepNumber}>1</span>
              <div className={styles.importStepContent}>
                <div className={styles.importStepHead}><div><strong>{t("settings.copyPrompt")}</strong><p>{t("settings.copyPromptHint")}</p></div><Button type="button" size="sm" onClick={() => void navigator.clipboard.writeText(t("settings.memoryTransferPrompt")).then(() => setImportCopied(true))}><Copy aria-hidden="true" />{importCopied ? t("settings.copied") : t("settings.copyUserId")}</Button></div>
                <div className={styles.importPrompt}>
                  <div className={styles.importPromptScroller} tabIndex={0} aria-label={t("settings.copyPrompt")}>
                    <p>{t("settings.memoryTransferPrompt")}</p>
                  </div>
                  <span className={styles.importPromptFade} aria-hidden="true" />
                </div>
              </div>
            </section>
            <section className={styles.importMemoryStep}>
              <span className={styles.importStepNumber}>2</span>
              <div className={styles.importStepContent}>
                <div className={styles.importStepHead}><div><strong>{t("settings.pasteResponse")}</strong><p>{t("settings.pasteResponseHint")}</p></div></div>
                <Textarea value={importText} onChange={(event) => setImportText(event.target.value)} aria-label={t("settings.pasteResponse")} placeholder={t("settings.pasteResponsePlaceholder")} />
              </div>
            </section>
          </div>
          <DialogFooter className={styles.importMemoryFooter}><DialogClose asChild><Button variant="outline" type="button">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={!importText.trim() || importing} onClick={() => void importMemory()}>{importing ? <Spinner aria-hidden="true" /> : null}{t("settings.importMemoryAction")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const computerPlans = [
  { id: "basic", name: "Basic", price: 10, summaryKey: "settings.computerPlanBasic", hintKey: "settings.computerPlanBasicHint", performance: "0.5×", cpu: "2", memory: "1 GB", traffic: "200 GB", storage: "35 GB", recommended: false },
  { id: "standard", name: "Standard", price: 30, summaryKey: "settings.computerPlanStandard", hintKey: "settings.computerPlanStandardHint", performance: "1×", cpu: "2", memory: "4 GB", traffic: "500 GB", storage: "70 GB", recommended: true },
  { id: "advanced", name: "Advanced", price: 50, summaryKey: "settings.computerPlanAdvanced", hintKey: "settings.computerPlanAdvancedHint", performance: "4×", cpu: "2", memory: "8 GB", traffic: "1000 GB", storage: "120 GB", recommended: false },
] as const

const storagePresets = [35, 70, 120, 250, 500, 750, 1000] as const

function CloudComputerGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="4.5" width="25" height="18" rx="2.5" fill="#454545" />
      <rect x="6" y="7" width="20" height="13" rx="1" fill="#666" />
      <path d="M12 27.5h8M16 22.5v5" stroke="#454545" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function MyComputerCard({ brandName, preview = false }: { brandName?: string; preview?: boolean }) {
  const t = useT()
  const brand = brandName ?? "Kokoro"
  const [computerMode, setComputerMode] = useState<"cloud" | "local">("cloud")
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<(typeof computerPlans)[number]["id"]>("standard")
  const [storageGb, setStorageGb] = useState(70)
  const [creating, setCreating] = useState(false)
  const plan = computerPlans.find((entry) => entry.id === selectedPlan) ?? computerPlans[1]
  const includedStorageGb = Number.parseInt(plan.storage, 10)
  const extraStorageGb = Math.max(0, storageGb - includedStorageGb)
  const storageMonthlyPrice = extraStorageGb * 0.1
  const monthlyTotal = plan.price + storageMonthlyPrice
  const formatPrice = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1)

  const createComputer = async (): Promise<void> => {
    setCreating(true)
    try {
      if (!preview) {
        const response = await fetch("/api/hub/cloud-computers", {
          method: "POST",
          headers: mutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ plan: plan.id, name: `${brandName ?? "Kokoro"} Computer`, region: "us-east", storage_gb: storageGb }),
        })
        if (!response.ok) throw new Error(`cloud_computer_create_failed:${response.status}`)
      }
      setConfirmOpen(false)
      setCreateOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={styles.computerSettings} data-testid="settings-computer">
      <div className={styles.computerTabs} role="tablist" aria-label={t("settings.computerTitle")}>
        <Button type="button" variant="ghost" role="tab" aria-selected={computerMode === "cloud"} data-active={computerMode === "cloud"} onClick={() => setComputerMode("cloud")}>{t("settings.cloudComputer")}</Button>
        <Button type="button" variant="ghost" role="tab" aria-selected={computerMode === "local"} data-active={computerMode === "local"} onClick={() => setComputerMode("local")}>{t("settings.localComputer")}</Button>
      </div>
      {computerMode === "cloud" ? (
        <section className={styles.computerEmptyCard}>
          <span className={styles.computerVisual}><CloudComputerGlyph /></span>
          <div><strong>{t("settings.computerAlwaysAvailable")}</strong><p>{t("settings.computerAlwaysAvailableHint")}</p></div>
          <Button type="button" onClick={() => setCreateOpen(true)}><Plus />{t("settings.createNow")}</Button>
        </section>
      ) : (
        <section className={styles.localComputerEmpty} data-testid="settings-local-computer">
          <FolderPlus aria-hidden="true" />
          <strong>{t("settings.folderAccessRequired")}</strong>
          <p>{t("settings.folderAccessPrefix")}<a href="kokoro://app">{t("settings.desktopApp", { brand })}</a>{t("settings.folderAccessSuffix", { brand })}</p>
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={styles.computerCreateDialog} closeLabel={t("shell.closeDialog")} data-testid="computer-create-dialog">
          <DialogTitle className={styles.computerCreateTitle}>{t("settings.createCloudComputer")}</DialogTitle>
          <div className={styles.computerCreateBody}>
              <div className={styles.computerUpgradeBanner}><Gift aria-hidden="true" /><span>{t("settings.computerUpgradeHint")}</span><Button type="button" size="sm">{t("firstSite.upgrade")}</Button></div>
              <div className={styles.computerPlans}>
                {computerPlans.map((entry) => (
                  <button key={entry.id} type="button" className={styles.computerPlan} data-selected={entry.id === selectedPlan} onClick={() => { setSelectedPlan(entry.id); setStorageGb(Number.parseInt(entry.storage, 10)) }}>
                    <header><strong>{entry.name}</strong>{entry.recommended ? <span>{t("settings.recommended")}</span> : null}</header>
                    <div className={styles.computerPrice}><strong>${entry.price}</strong><span>{t("settings.perMonth")}</span></div>
                    <h4>{t(entry.summaryKey)}</h4>
                    <p>{t(entry.hintKey)}</p>
                    <dl><div><dt>{t("settings.compute")}</dt><dd>{entry.performance}</dd></div><div><dt>{t("settings.virtualCpu")}</dt><dd>{entry.cpu}</dd></div><div><dt>{t("settings.memory")}</dt><dd>{entry.memory}</dd></div><div><dt>{t("settings.outboundTraffic")}</dt><dd>{entry.traffic}</dd></div><div><dt>{t("settings.storage")}</dt><dd>{entry.storage}</dd></div></dl>
                  </button>
                ))}
              </div>
              <div className={styles.computerIncluded}><span>{t("settings.everyPlanIncludes")}</span><div><span><Server />Ubuntu Server 24.04 LTS 64-bit</span><span><Globe2 />{t("settings.publicIp")}</span><span><Wifi />1000 Mbps {t("settings.inboundBandwidth")}</span></div></div>
              <div className={styles.computerConfiguration}>
                <div className={styles.computerLocation}><span>{t("settings.location")}</span><strong>{t("settings.usEast")}</strong></div>
                <div className={styles.computerStorageHead}>
                  <span>{t("settings.storage")}</span>
                  <div className={styles.computerStorageValue}>
                    <Input
                      type="number"
                      min={35}
                      max={1000}
                      value={storageGb}
                      aria-label={t("settings.storageSizeGb")}
                      onChange={(event) => setStorageGb(Math.min(1000, Math.max(35, Number(event.target.value) || 35)))}
                    />
                    <span>GB</span><span>=</span><strong>${formatPrice(storageMonthlyPrice)}</strong><span>{t("settings.perMonth")}</span>
                  </div>
                </div>
                <Slider
                  className={styles.computerStorageSlider}
                  min={35}
                  max={1000}
                  step={1}
                  value={[storageGb]}
                  aria-label={t("settings.storageSizeGb")}
                  onValueChange={(value) => setStorageGb(value[0] ?? includedStorageGb)}
                />
                <div className={styles.computerStoragePresets}>
                  {storagePresets.map((value) => (
                    <Button key={value} type="button" variant="ghost" size="sm" data-active={storageGb === value || undefined} onClick={() => setStorageGb(value)}>{value} GB</Button>
                  ))}
                </div>
              </div>
            </div>
          <DialogFooter className={styles.computerCreateFooter}>
            <div><strong>{t("settings.monthlyTotal")}</strong><span>${formatPrice(monthlyTotal)} {t("settings.perMonth")}</span><small>{t("settings.overageHint")}</small></div>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button type="button" onClick={() => setConfirmOpen(true)}>{t("settings.nextStep")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className={styles.computerOrderDialog} closeLabel={t("shell.closeDialog")}>
          <DialogTitle>{t("settings.confirmOrder")}</DialogTitle>
          <p className={styles.computerOrderDescription}>{t("settings.reviewComputerOrder")}</p>
          <div className={styles.computerOrderLines}>
            <div><strong>{plan.name}</strong><span>${plan.price} {t("settings.perMonth")}</span></div>
            <div><span>{t("settings.includedOutboundTraffic", { amount: plan.traffic })}</span><em>{t("settings.free")}</em></div>
            {extraStorageGb > 0 ? <div><span>{t("settings.extraStorage", { amount: extraStorageGb })}</span><span>${formatPrice(storageMonthlyPrice)} {t("settings.perMonth")}</span></div> : null}
          </div>
          <div className={styles.computerOrderTotal}><strong>{t("settings.estimatedMonthlyCost")}</strong><div><span>${formatPrice(monthlyTotal)} {t("settings.perMonthFull")}</span><small>{t("settings.taxNotIncluded")}</small></div></div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={creating} onClick={() => void createComputer()}>{t("settings.pay")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function MailSettingsCard({ brandName, preview = false }: { brandName?: string; preview?: boolean }) {
  const t = useT()
  const mailboxPrefix = (brandName ?? "kokoro").toLocaleLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "kokoro"
  const [mailMode, setMailMode] = useState<"setup" | "inbox">("setup")
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxItems, setInboxItems] = useState<{ id: string; sender: string; subject: string; receivedAt: string }[]>([])
  const [workflowStage, setWorkflowStage] = useState<"closed" | "intro" | "form">("closed")
  const [workflowSlug, setWorkflowSlug] = useState("")
  const [workflowInstruction, setWorkflowInstruction] = useState("")
  const [workflowEmails, setWorkflowEmails] = useState<string[]>([])
  const [senderOpen, setSenderOpen] = useState(false)
  const [sender, setSender] = useState("")
  const [authorizedSenders, setAuthorizedSenders] = useState<string[]>([])

  const loadInbox = async (): Promise<void> => {
    setInboxLoading(true)
    try {
      if (preview) {
        // Preview data is local and deterministic. Do not add network-shaped
        // latency here: switching to Inbox should paint its empty state on the
        // next microtask, while a live deployment still shows the real fetch
        // and loading state below.
        await Promise.resolve()
        setInboxItems([])
        return
      }
      const response = await fetch("/api/mail/inbox", { cache: "no-store" })
      if (!response.ok) throw new Error(`mail_inbox_load_failed:${response.status}`)
      const payload = await response.json() as { data?: { id: string; sender: string; subject: string; received_at: string }[] }
      setInboxItems((payload.data ?? []).map((item) => ({ ...item, receivedAt: item.received_at })))
    } finally {
      setInboxLoading(false)
    }
  }

  const selectMailMode = (mode: "setup" | "inbox") => {
    setMailMode(mode)
    if (mode === "inbox") void loadInbox()
  }

  const saveWorkflow = async (): Promise<void> => {
    const address = `${mailboxPrefix}-${workflowSlug.trim()}@kokoro.bot`
    if (!preview) {
      const response = await fetch("/api/mail/workflows", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ slug: workflowSlug.trim(), instruction: workflowInstruction.trim() }) })
      if (!response.ok) throw new Error(`mail_workflow_create_failed:${response.status}`)
    }
    setWorkflowEmails((items) => [...items, address])
    setWorkflowStage("closed")
  }
  const saveSender = async (): Promise<void> => {
    if (!preview) {
      const response = await fetch("/api/mail/senders", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ email: sender.trim() }) })
      if (!response.ok) throw new Error(`mail_sender_create_failed:${response.status}`)
    }
    setAuthorizedSenders((items) => [...items, sender.trim()])
    setSenderOpen(false)
  }

  return (
    <div className={styles.mailSettings} data-testid="settings-mail">
      <div className={styles.mailTabs} role="tablist" aria-label={t("settings.mailTitle")}>
        <Button type="button" variant="ghost" role="tab" aria-selected={mailMode === "setup"} data-active={mailMode === "setup"} onClick={() => selectMailMode("setup")}>{t("settings.setup")}</Button>
        <Button type="button" variant="ghost" role="tab" aria-selected={mailMode === "inbox"} data-active={mailMode === "inbox"} onClick={() => selectMailMode("inbox")}>{t("settings.inbox")}</Button>
      </div>
      {mailMode === "setup" ? (
        <div role="tabpanel" aria-label={t("settings.setup")}>
          <section className={styles.mailMailboxRow}><div><strong>{t("settings.kokoroMailbox", { brand: brandName ?? "Kokoro" })}</strong><small>{t("settings.mailboxHint")}</small></div><button type="button" aria-label={`${mailboxPrefix}@kokoro.bot`}><span>{mailboxPrefix}@kokoro.bot</span><Pencil aria-hidden="true" /></button></section>
          <section className={styles.mailActionRow}><div><strong>{t("settings.workflowEmail")}<CircleHelp aria-hidden="true" /></strong><small>{t("settings.workflowEmailHint")}</small></div><Button type="button" variant="outline" onClick={() => setWorkflowStage("intro")}><Plus />{t("settings.addWorkflowEmail")}</Button></section>
          {workflowEmails.map((email) => <div className={styles.mailListRow} key={email}><Mail /><span>{email}</span><Button variant="ghost" size="icon-sm"><Ellipsis /></Button></div>)}
          <section className={styles.mailActionRow}><div><strong>{t("settings.authorizedSenders")}</strong><small>{t("settings.authorizedSendersHint")}</small></div><Button type="button" variant="outline" onClick={() => setSenderOpen(true)}><Plus />{t("settings.addAuthorizedSender")}</Button></section>
          {authorizedSenders.map((email) => <div className={styles.mailListRow} key={email}><Mail /><span>{email}</span><Button variant="ghost" size="icon-sm"><Ellipsis /></Button></div>)}
        </div>
      ) : (
        <div className={styles.mailInbox} role="tabpanel" aria-label={t("settings.inbox")} aria-busy={inboxLoading}>
          <div className={styles.mailInboxHeader} role="row">
            <span role="columnheader">{t("settings.mailSender")}</span>
            <span role="columnheader">{t("settings.mailContent")}</span>
            <span role="columnheader">{t("settings.mailDate")}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("settings.refreshInbox")} disabled={inboxLoading} onClick={() => void loadInbox()}><RefreshCw aria-hidden="true" /></Button>
          </div>
          {inboxLoading ? <div className={styles.mailInboxState}><Spinner aria-label={t("settings.loadingInbox")} /></div> : inboxItems.length === 0 ? <div className={styles.mailInboxState}><p>{t("settings.noMailData")}</p></div> : (
            <div className={styles.mailInboxRows} role="rowgroup">{inboxItems.map((item) => <div key={item.id} role="row"><span role="cell">{item.sender}</span><span role="cell">{item.subject}</span><time role="cell">{item.receivedAt}</time></div>)}</div>
          )}
        </div>
      )}

      <Dialog open={workflowStage !== "closed"} onOpenChange={(open) => { if (!open) setWorkflowStage("closed") }}>
        {workflowStage === "intro" ? <DialogContent className={styles.mailIntroDialog} closeLabel={t("shell.closeDialog")}><DialogTitle>{t("settings.workflowIntroTitle")}</DialogTitle><ol><li><strong>{t("settings.workflowIntroOne")}</strong><p>{t("settings.workflowIntroOneHint")}</p></li><li><strong>{t("settings.workflowIntroTwo")}</strong><p>{t("settings.workflowIntroTwoHint")}</p></li><li><strong>{t("settings.workflowIntroThree")}</strong><p>{t("settings.workflowIntroThreeHint")}</p></li></ol><DialogFooter><Button type="button" onClick={() => setWorkflowStage("form")}>{t("settings.addNow")}</Button></DialogFooter></DialogContent> : null}
        {workflowStage === "form" ? (
          <DialogContent className={styles.mailFormDialog} closeLabel={t("shell.closeDialog")}>
            <header className={styles.mailFormHeader}>
              <DialogTitle>{t("settings.addWorkflowEmail")}</DialogTitle>
            </header>
            <div className={styles.mailFormBody}>
              <p className={styles.mailFormLead}>{t("settings.workflowFormHint")}</p>
              <FieldGroup className={styles.mailFormFields}>
                <Field className={styles.mailEmailField}>
                  <FieldLabel htmlFor="mail-workflow-slug">{t("settings.emailAddress")}</FieldLabel>
                  <span className={styles.mailAddressInput}>
                    <b>{mailboxPrefix}-</b>
                    <Input id="mail-workflow-slug" aria-label={t("settings.emailAddress")} placeholder="newsletter" value={workflowSlug} onChange={(event) => setWorkflowSlug(event.target.value)} />
                    <b>@kokoro.bot</b>
                  </span>
                  <span className={styles.mailFieldError} aria-live="polite" />
                </Field>
                <Field className={styles.mailInstructionField}>
                  <FieldLabel htmlFor="mail-workflow-instruction">{t("firstSite.instructions")}</FieldLabel>
                  <FieldDescription>{t("settings.workflowInstructionHint", { address: `${mailboxPrefix}-${workflowSlug}@kokoro.bot` })}</FieldDescription>
                  <Textarea id="mail-workflow-instruction" aria-label={t("firstSite.instructions")} placeholder={t("settings.workflowInstructionPlaceholder")} value={workflowInstruction} onChange={(event) => setWorkflowInstruction(event.target.value)} />
                </Field>
              </FieldGroup>
            </div>
            <DialogFooter className={styles.mailFormFooter}>
              <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
              <Button type="button" disabled={!workflowSlug.trim() || !workflowInstruction.trim()} onClick={() => void saveWorkflow()}>{t("firstSite.save")}</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={senderOpen} onOpenChange={setSenderOpen}><DialogContent className={styles.mailSenderDialog} closeLabel={t("shell.closeDialog")}><DialogTitle>{t("settings.addAuthorizedSender")}</DialogTitle><label><span>{t("settings.emailAddress")}</span><Input type="email" value={sender} placeholder="name@example.com" onChange={(event) => setSender(event.target.value)} /></label><DialogFooter><DialogClose asChild><Button variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button disabled={!sender.includes("@") || !sender.includes(".")} onClick={() => void saveSender()}>{t("firstSite.save")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}

function DeploymentWebsiteIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M12.208 2.625c0-.598-.365-.833-.541-.833H2.333c-.176 0-.541.235-.541.833v8.75c0 .598.365.833.541.833h9.334c.176 0 .541-.235.541-.833v-8.75Zm1.25 8.75c0 1.013-.679 2.083-1.791 2.083H2.333c-1.112 0-1.791-1.07-1.791-2.083v-8.75C.542 1.612 1.221.542 2.333.542h9.334c1.112 0 1.791 1.07 1.791 2.083v8.75Z" />
      <path d="M12.444 3.306a.583.583 0 1 1 0 1.166H1.556a.583.583 0 1 1 0-1.166h10.888ZM5.032 6.588a.583.583 0 0 1 .825.824l-.754.755.754.754a.583.583 0 0 1-.825.825L3.865 8.579a.583.583 0 0 1 0-.825l1.167-1.166ZM8.968 6.588a.583.583 0 0 0-.825.824l.754.755-.754.754a.583.583 0 0 0 .825.825l1.167-1.167a.583.583 0 0 0 0-.825L8.968 6.588Z" />
    </svg>
  )
}

function DeploymentAppIcon() {
  return (
    <svg viewBox="0 0 21.068 29.068" fill="currentColor" aria-hidden="true">
      <path d="M10.547 21.333a1.2 1.2 0 1 1-.013 2.401 1.2 1.2 0 0 1 .013-2.401ZM17.201 0a3.867 3.867 0 0 1 3.867 3.867v21.334a3.867 3.867 0 0 1-3.867 3.867H3.867A3.867 3.867 0 0 1 0 25.201V3.867A3.867 3.867 0 0 1 3.867 0h13.334ZM3.867 2.401c-.81 0-1.466.656-1.466 1.466v21.334c0 .81.656 1.466 1.466 1.466h13.334c.81 0 1.466-.656 1.466-1.466V3.867c0-.81-.656-1.466-1.466-1.466H3.867Z" />
    </svg>
  )
}

export function DeploymentSettingsCard({
  onStart,
  onBuyDomain,
}: {
  onStart?: (kind: "website" | "app") => void
  onBuyDomain?: () => void
}) {
  const t = useT()
  const sections = [
    { key: "website", title: t("settings.deploymentWebsites"), empty: t("settings.deploymentNoWebsites"), action: t("settings.createNow"), icon: DeploymentWebsiteIcon },
    { key: "app", title: t("settings.deploymentApps"), empty: t("settings.deploymentNoApps"), action: t("settings.createNow"), icon: DeploymentAppIcon },
    { key: "domain", title: t("settings.deploymentDomains"), empty: t("settings.deploymentNoDomains"), action: t("settings.buyNow"), icon: Globe },
  ] as const

  return (
    <div className={styles.deploymentSettings} data-testid="settings-deployment">
      {sections.map(({ key, title, empty, action, icon: Icon }) => (
        <section key={key} className={styles.deploymentSection} data-deployment-kind={key}>
          <h2>{title}</h2>
          <div className={styles.deploymentEmpty}>
            <Icon aria-hidden="true" />
            <span>{empty}</span>
            <Button type="button" variant="ghost" onClick={() => key === "domain" ? onBuyDomain?.() : onStart?.(key)}>
              <Plus aria-hidden="true" />
              {action}
            </Button>
          </div>
        </section>
      ))}
    </div>
  )
}

type IntegrationId = "zapier" | "slack" | "telegram" | "line"
type ZapTemplateId = "calendly" | "googleForms" | "teams" | "outlook" | "salesforce" | "shopify" | "zendesk" | "zoom"

function TelegramLogo() {
  return <span className={styles.telegramLogo} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21.4 3.6 18.2 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.8 12.8 1 11.3c-1-.3-1-1 .2-1.5L20 2.6c.9-.3 1.7.2 1.4 1Z" /></svg></span>
}

function LineLogo() {
  return (
    <span className={styles.lineLogo} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#45c654" />
        <path d="M18.3 11.1c0-3-2.8-5.4-6.3-5.4s-6.3 2.4-6.3 5.4c0 2.7 2.3 5 5.4 5.4.2 0 .5.2.5.5l-.1 1.4c0 .2.2.4.4.3 2.6-1.1 4.2-2.4 5.2-3.6.8-1 1.2-2.2 1.2-4Z" fill="#fff" />
        <path d="M8.1 9.3v3.6h2M11 9.3v3.6M12.1 12.9V9.3l2.4 3.6V9.3M17 9.3h-1.7v3.6H17" stroke="#45c654" strokeWidth=".72" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const integrationCatalog: readonly { id: IntegrationId; image?: string; logo?: () => React.ReactNode }[] = [
  { id: "zapier", image: "/integrations/zapier.webp" },
  { id: "slack", image: "/integrations/slack.svg" },
  { id: "telegram", logo: TelegramLogo },
  { id: "line", logo: LineLogo },
]

const zapTemplates: readonly { id: ZapTemplateId; templateId: string }[] = [
  { id: "calendly", templateId: "255666880" },
  { id: "googleForms", templateId: "255666874" },
  { id: "teams", templateId: "255666876" },
  { id: "outlook", templateId: "255666782" },
  { id: "salesforce", templateId: "255666873" },
  { id: "shopify", templateId: "255666875" },
  { id: "zendesk", templateId: "255666877" },
  { id: "zoom", templateId: "255666878" },
]

function ZapAppLogo({ id }: { id: ZapTemplateId }) {
  if (id === "outlook") {
    return <Image src="/assets/connectors/outlook.svg" alt="" width={20} height={20} />
  }
  if (id === "calendly") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#0b67e3" /><path d="M13.7 6.4a5 5 0 1 0 .1 7.1" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /><path d="M12.6 8a2.8 2.8 0 1 0 0 4" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
  }
  if (id === "googleForms") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 2h8l4 4v12H4V2Z" fill="#7248b9" /><path d="M12 2v4h4" fill="#a78bd4" /><circle cx="7" cy="9" r="1" fill="#fff" /><circle cx="7" cy="13" r="1" fill="#fff" /><path d="M9.5 9h4M9.5 13h4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" /></svg>
  }
  if (id === "teams") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="14.5" cy="5.5" r="2.2" fill="#7b83eb" /><rect x="10.5" y="8" width="7.5" height="7.5" rx="2" fill="#7b83eb" /><rect x="2" y="5" width="11" height="11" rx="2" fill="#6264a7" /><path d="M5 8h5M7.5 8v5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
  }
  if (id === "salesforce") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.1 15.7a4 4 0 0 1-2-7.5A4.7 4.7 0 0 1 12.7 5a3.6 3.6 0 0 1 3.2 6.8 3.8 3.8 0 0 1-3.6 3.9H6.1Z" fill="#00a1e0" /></svg>
  }
  if (id === "shopify") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 6 2-1 .7-2.2 2.2-.8 1.5 2.2L16 5.4 15 18 5.2 16.4 4 6Z" fill="#72a845" /><path d="M7 6.5c.5-2.4 1.2-3.5 2.2-3.5 1.1 0 1.8 1.2 2 2.8" fill="none" stroke="#fff" strokeWidth="1.1" /><path d="M11.7 8.5c-.6-.4-1.3-.6-2-.5-1.5.1-2 1.8-.5 2.5 1.7.8 1.2 2.5-.5 2.7-.8.1-1.5-.1-2.1-.5" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" /></svg>
  }
  if (id === "zendesk") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h7L3 10V3Zm7 14H3l7-7v7ZM11 3h6v7l-6-7Zm0 7 6 7h-6v-7Z" fill="#17494d" /></svg>
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="4" width="16" height="12" rx="3" fill="#2d8cff" /><path d="m11.5 8 3-1.5v7l-3-1.5V8ZM5 8h6.5v4H5V8Z" fill="#fff" /></svg>
}

function ZapTemplateApps({ brand, id }: { brand: string; id: ZapTemplateId }) {
  return (
    <span className={styles.zapTemplateApps} aria-label={`${id} + ${brand}`}>
      <span data-app={id}><ZapAppLogo id={id} /></span>
      <span><Sparkles aria-hidden="true" /></span>
    </span>
  )
}

export function IntegrationSettingsCard({
  brandName,
  preview = false,
  selected,
  onSelect,
}: {
  brandName?: string
  preview?: boolean
  selected: IntegrationId | null
  onSelect: (id: IntegrationId | null) => void
}) {
  const t = useT()
  const brand = brandName ?? "Kokoro"
  const [connecting, setConnecting] = useState<IntegrationId | null>(null)
  const [connected, setConnected] = useState<IntegrationId[]>([])
  const entry = selected ? integrationCatalog.find((item) => item.id === selected) : null
  const connect = async (id: IntegrationId): Promise<void> => {
    setConnecting(id)
    try {
      if (!preview) {
        const response = await fetch(`/api/hub/integrations/${id}/connect`, { method: "POST", headers: mutationHeaders() })
        if (!response.ok) throw new Error(`integration_connect_failed:${response.status}`)
        const result = await response.json() as { authorization_url?: string }
        if (result.authorization_url) {
          window.location.assign(result.authorization_url)
          return
        }
      }
      setConnected((items) => items.includes(id) ? items : [...items, id])
    } finally {
      setConnecting(null)
    }
  }

  if (selected && entry) {
    const Logo = entry.logo
    return (
      <div className={styles.integrationDetail} data-testid="settings-integration-detail" data-integration={selected}>
        <div className={styles.integrationDetailHero}>
          <span className={styles.integrationDetailLogo}>
            {entry.image ? <Image src={entry.image} alt={t(`settings.integration.${selected}.name`)} width={64} height={64} /> : Logo ? <Logo /> : null}
          </span>
          <div>
            <p>{selected === "line" ? "LINE" : t(`settings.integration.${selected}.title`, { brand })}</p>
            <span>{t(`settings.integration.${selected}.description`, { brand })}</span>
          </div>
          <Button type="button" disabled={connecting === selected || connected.includes(selected)} onClick={selected === "zapier" ? undefined : () => void connect(selected)} asChild={selected === "zapier"}>
            {selected === "zapier" ? (
              <a href="https://zapier.com/apps/manus/integrations" target="_blank" rel="noreferrer">{t("settings.tryNow")}<ArrowUpRight /></a>
            ) : connected.includes(selected) ? (
              t("settings.connected")
            ) : connecting === selected ? (
              t("settings.connecting")
            ) : (
              <>{t("settings.connect")}<ArrowUpRight /></>
            )}
          </Button>
        </div>
        {selected === "zapier" || selected === "slack" ? (
          <section className={styles.integrationOverview}>
            <h3>{t("settings.overview")}</h3>
            <div className={styles.integrationOverviewCard}>
              <p>{t(`settings.integration.${selected}.overview`, { brand })}</p>
              {selected === "slack" ? (
                <div className={styles.slackTips}>
                  <strong>{t("settings.integration.slack.tips")}</strong>
                  <ul>
                    <li><code>mute</code><span>{t("settings.integration.slack.muteHint", { brand })}</span></li>
                    <li><code>unmute</code><span>{t("settings.integration.slack.unmuteHint")}</span></li>
                    <li><code>!skip</code><span>{t("settings.integration.slack.skipHint")}</span></li>
                  </ul>
                </div>
              ) : null}
              {selected === "zapier" ? <a href="https://zapier.com/blog/get-started-with-zapier/" target="_blank" rel="noreferrer">{t("settings.documentation")} <ArrowUpRight /></a> : null}
              {selected === "slack" ? <a href="https://api.slack.com/docs" target="_blank" rel="noreferrer">{t("settings.documentation")} <ArrowUpRight /></a> : null}
            </div>
          </section>
        ) : null}
        {selected === "zapier" ? (
          <section className={styles.zapTemplates}>
            <h3>{t("settings.exploreZapTemplates")}</h3>
            <div>
              {zapTemplates.map(({ id, templateId }) => (
                <article key={id}>
                  <div className={styles.zapTemplateCopy}>
                    <strong>{t(`settings.integration.zapier.template.${id}`, { brand })}</strong>
                    <span>{t(`settings.integration.zapier.template.${id}.pair`, { brand })}</span>
                  </div>
                  <div className={styles.zapTemplateFooter}>
                    <ZapTemplateApps brand={brand} id={id} />
                    <Button asChild variant="outline" size="sm"><a href={`https://zapier.com/webintent/create-zap?template=${templateId}`} target="_blank" rel="noreferrer">{t("settings.tryNow")}</a></Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.integrationGrid} data-testid="settings-integration">
      {integrationCatalog.map((item) => {
        const Logo = item.logo
        return (
          <button key={item.id} type="button" className={styles.integrationCard} onClick={() => onSelect(item.id)}>
            <span className={styles.integrationLogo}>
              {item.image ? <Image src={item.image} alt={t(`settings.integration.${item.id}.name`)} width={40} height={40} /> : Logo ? <Logo /> : null}
            </span>
            <span className={styles.integrationCopy}>
              <strong>{t(`settings.integration.${item.id}.title`, { brand })}</strong>
              <small>{t(`settings.integration.${item.id}.description`, { brand })}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

export function DeveloperSettingsCard({ brandName, preview = false }: { brandName?: string; preview?: boolean }) {
  const t = useT()
  const brand = brandName ?? "Kokoro"
  const [section, setSection] = useState<"keys" | "webhooks">("keys")
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState("")
  const [expiresIn, setExpiresIn] = useState("never")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; prefix: string }[]>([])
  const [webhooks, setWebhooks] = useState<{ id: string; url: string }[]>([])
  const [createdSecret, setCreatedSecret] = useState<{ name: string; secret: string } | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  const createApiKey = async (): Promise<void> => {
    setCreating(true)
    try {
      let item: { id: string; name: string; prefix: string; secret?: string } = {
        id: `preview-key-${Date.now()}`,
        name: keyName.trim(),
        prefix: "kk_preview…",
        secret: `kk_preview_${Date.now().toString(36)}_demo_secret`,
      }
      if (!preview) {
        const response = await fetch("/api/settings/developer/api-keys", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ name: keyName.trim(), expires_in: expiresIn }) })
        if (!response.ok) throw new Error(`api_key_create_failed:${response.status}`)
        item = await response.json() as typeof item
      }
      setApiKeys((items) => [...items, { id: item.id, name: item.name, prefix: item.prefix }])
      setCreateOpen(false)
      if (item.secret) {
        setSecretCopied(false)
        setCreatedSecret({ name: item.name, secret: item.secret })
      }
      setKeyName("")
    } finally {
      setCreating(false)
    }
  }
  const createWebhook = async (): Promise<void> => {
    setCreating(true)
    try {
      let item = { id: `preview-webhook-${Date.now()}`, url: webhookUrl.trim() }
      if (!preview) {
        const response = await fetch("/api/settings/developer/webhooks", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ url: webhookUrl.trim() }) })
        if (!response.ok) throw new Error(`webhook_create_failed:${response.status}`)
        item = await response.json() as typeof item
      }
      setWebhooks((items) => [...items, item])
      setCreateOpen(false)
      setWebhookUrl("")
    } finally {
      setCreating(false)
    }
  }

  const items = section === "keys" ? apiKeys : webhooks
  return (
    <div className={styles.developerSettings} data-testid="settings-developer">
      <div className={styles.developerTabs} role="tablist" aria-label={t("settings.developerTitle")}>
        <Button type="button" variant="ghost" role="tab" aria-selected={section === "keys"} data-active={section === "keys"} onClick={() => setSection("keys")}>{t("settings.apiKeys")}</Button>
        <Button type="button" variant="ghost" role="tab" aria-selected={section === "webhooks"} data-active={section === "webhooks"} onClick={() => setSection("webhooks")}>{t("settings.webhooks")}</Button>
      </div>
      <div className={styles.developerInfo}>
        <FileText aria-hidden="true" />
        <span>{section === "keys" ? t("settings.apiKeysDescription", { brand }) : t("settings.webhooksDescription")}</span>
        <a href={section === "keys" ? "/docs/api" : "/docs/webhooks"}>{t("settings.documentation")}<ArrowUpRight /></a>
      </div>
      {items.length === 0 ? (
        <div className={styles.developerEmpty} data-testid="settings-developer-empty">
          <FileText aria-hidden="true" />
          <div className={styles.developerEmptyCopy} data-testid="settings-developer-empty-copy">
            <strong>{section === "keys" ? t("settings.noApiKeys") : t("settings.noWebhooks")}</strong>
            <span>{section === "keys" ? t("settings.noApiKeysHint") : t("settings.noWebhooksHint", { brand })}</span>
          </div>
          <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}><Plus />{t("settings.createNewItem")}</Button>
        </div>
      ) : (
        <div className={styles.developerList}>
          <div className={styles.developerListActions}>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />{t("settings.createNewItem")}</Button>
          </div>
          {items.map((item) => <div className={styles.developerListRow} key={item.id}><strong>{"name" in item ? item.name : item.url}</strong><span>{"prefix" in item ? item.prefix : t("settings.webhookActive")}</span><Button variant="ghost" size="icon-sm"><Ellipsis /></Button></div>)}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {section === "keys" ? (
          <DialogContent className={styles.apiKeyDialog} overlayClassName={styles.developerDialogOverlay} closeLabel={t("shell.closeDialog")}>
            <DialogTitle>{t("settings.createApiKey")}</DialogTitle>
            <FieldGroup>
              <Field><FieldLabel htmlFor="api-key-name">{t("settings.apiKeyName")}</FieldLabel><Input id="api-key-name" aria-label={t("settings.apiKeyName")} placeholder={t("settings.apiKeyPlaceholder")} value={keyName} onChange={(event) => setKeyName(event.target.value)} /></Field>
              <Field><FieldLabel>{t("settings.expiresAt")}</FieldLabel><Select value={expiresIn} onValueChange={setExpiresIn}><SelectTrigger aria-label={t("settings.expiresAt")}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{(["never", "30d", "90d", "1y"] as const).map((value) => <SelectItem key={value} value={value}>{t(`settings.expiry.${value}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            </FieldGroup>
            <DialogFooter><DialogClose asChild><Button variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button disabled={!keyName.trim() || creating} onClick={() => void createApiKey()}>{t("settings.create")}</Button></DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent className={styles.webhookDialog} overlayClassName={styles.developerDialogOverlay} closeLabel={t("shell.closeDialog")}>
            <DialogTitle>{t("settings.configureWebhook")}</DialogTitle>
            <Field><FieldLabel htmlFor="webhook-url">URL</FieldLabel><Input id="webhook-url" aria-label="URL" placeholder={t("settings.webhookPlaceholder")} value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} /></Field>
            <DialogFooter><DialogClose asChild><Button variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button disabled={!/^https:\/\//.test(webhookUrl) || creating} onClick={() => void createWebhook()}>{t("firstSite.save")}</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={createdSecret !== null} onOpenChange={(open) => { if (!open) { setCreatedSecret(null); setSecretCopied(false) } }}>
        <DialogContent className={styles.apiSecretDialog} overlayClassName={styles.developerDialogOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogTitle>{t("settings.apiKeyCreatedTitle")}</DialogTitle>
          <div className={styles.apiSecretBody}>
            <p>{t("settings.apiKeyCreatedHint")}</p>
            <span>{t("settings.apiKeySecretLabel")}</span>
            <div className={styles.apiSecretValue}>
              <code>{createdSecret?.secret}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(createdSecret?.secret ?? "").then(() => setSecretCopied(true))}>
                <Copy data-icon="inline-start" aria-hidden="true" />{secretCopied ? t("settings.copied") : t("settings.copyUserId")}
              </Button>
            </div>
          </div>
          <DialogFooter><Button type="button" onClick={() => { setCreatedSecret(null); setSecretCopied(false) }}>{t("share.done")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// —— 卡三：对话偏好 —— 缺省模型（/models）/缺省 agent（/agents）；就地存 localStorage，
// 工作台新对话首帧预填（会话级锁语义不变）。
export function ChatPrefsCard({ preview = false }: { preview?: boolean }) {
  const t = useT()
  const [models, setModels] = useState<readonly ModelCandidate[]>([])
  const [agents, setAgents] = useState<readonly AgentCandidate[]>([])
  const [model, setModel] = useState<string>(() => readChatModel() ?? FOLLOW_PROFILE)
  const [agent, setAgent] = useState<string>(() => readChatAgent() ?? FOLLOW_PROFILE)
  // 就地保存反馈：改动后闪一枚「已保存」徽标，约 1.6s 后自动消（setState 在 timeout 内，非 effect 体内直接调）。
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let live = true
    void browserListClient({ preview })
      .listModels()
      .then((list) => live && setModels(list.models))
      .catch(() => live && setModels([]))
    void browserListClient({ preview })
      .listAgents()
      .then((list) => live && setAgents(list.agents))
      .catch(() => live && setAgents([]))
    return () => {
      live = false
    }
  }, [preview])

  useEffect(() => {
    if (!saved) {
      return
    }
    const id = setTimeout(() => setSaved(false), 1600)
    return () => clearTimeout(id)
  }, [saved])

  const onModelChange = (value: string): void => {
    setModel(value)
    writeChatModel(value === FOLLOW_PROFILE ? null : value)
    setSaved(true)
  }
  const onAgentChange = (value: string): void => {
    setAgent(value)
    writeChatAgent(value === FOLLOW_PROFILE ? null : value)
    setSaved(true)
  }

  return (
    <Card className={styles.card} data-settings-card data-testid="settings-chat">
      <CardContent className={styles.cardContent}>
      {saved ? (
        <div className={styles.cardHead}>
          <span className={styles.savedBadge} role="status" data-testid="settings-saved">
            {t("settings.saved")}
          </span>
        </div>
      ) : null}
      <Field orientation="horizontal" className={styles.row}>
        <FieldLabel className={styles.rowLabel} htmlFor="settings-default-model">
          {t("settings.defaultModel")}
        </FieldLabel>
        <Select
          value={model === FOLLOW_PROFILE ? FOLLOW_PROFILE_VALUE : model}
          onValueChange={(value) => onModelChange(value === FOLLOW_PROFILE_VALUE ? FOLLOW_PROFILE : value)}
        >
          <SelectTrigger id="settings-default-model" className={styles.select} data-testid="settings-default-model">
            <SelectValue placeholder={t("settings.followProfile")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={FOLLOW_PROFILE_VALUE}>{t("settings.followProfile")}</SelectItem>
              {models.map((candidate) => (
                <SelectItem key={modelSelector(candidate)} value={modelSelector(candidate)}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal" className={styles.row}>
        <FieldLabel className={styles.rowLabel} htmlFor="settings-default-agent">
          {t("settings.defaultAgent")}
        </FieldLabel>
        <Select
          value={agent === FOLLOW_PROFILE ? FOLLOW_PROFILE_VALUE : agent}
          onValueChange={(value) => onAgentChange(value === FOLLOW_PROFILE_VALUE ? FOLLOW_PROFILE : value)}
        >
          <SelectTrigger id="settings-default-agent" className={styles.select} data-testid="settings-default-agent">
            <SelectValue placeholder={t("settings.followProfile")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={FOLLOW_PROFILE_VALUE}>{t("settings.followProfile")}</SelectItem>
              {agents.map((candidate) => (
                <SelectItem key={candidate.name} value={candidate.name}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <p className={styles.cardHint}>{t("settings.chatHint")}</p>
      </CardContent>
    </Card>
  )
}

// —— 快捷键：独立于对话偏好，保持 Manus 的设置分区与信息密度。
export function ShortcutsCard() {
  const t = useT()
  const [reset, setReset] = useState(false)
  const [recording, setRecording] = useState<string | null>(null)
  const defaultKeys: Record<string, string[]> = {
    newTask: ["⌘", "⇧", "O"],
    plan: ["⌘", "/"],
    voice: ["⌃", "D"],
    search: ["⌘", "K"],
    sidebar: ["⌘", "."],
  }
  const [shortcutKeys, setShortcutKeys] = useState<Record<string, string[]>>(defaultKeys)
  const shortcuts = [
    { id: "newTask", label: t("settings.shortcutNewTask") },
    { id: "plan", label: t("settings.shortcutPlan") },
    { id: "voice", label: t("settings.shortcutVoice") },
    { id: "search", label: t("settings.shortcutSearch") },
    { id: "sidebar", label: t("settings.shortcutSidebar") },
  ]

  useEffect(() => {
    if (!recording) return
    const captureShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setRecording(null)
        return
      }
      if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      const nextKeys = [
        event.metaKey ? "⌘" : "",
        event.ctrlKey ? "⌃" : "",
        event.altKey ? "⌥" : "",
        event.shiftKey ? "⇧" : "",
        event.key.length === 1 ? event.key.toUpperCase() : event.key,
      ].filter(Boolean)
      setShortcutKeys((current) => ({ ...current, [recording]: nextKeys }))
      setRecording(null)
      setReset(false)
    }
    window.addEventListener("keydown", captureShortcut, true)
    return () => window.removeEventListener("keydown", captureShortcut, true)
  }, [recording])

  return (
    <Card className={`${styles.card} ${styles.shortcutsCard}`} data-settings-card data-testid="settings-shortcuts">
      <CardContent className={styles.cardContent}>
        <div className={styles.shortcutList}>
          {shortcuts.map((shortcut) => (
            <div className={styles.shortcutRow} key={shortcut.label}>
              <div className={styles.shortcutLabel}>{shortcut.label}</div>
              <div className={styles.shortcutActions} data-recording={recording === shortcut.id || undefined}>
                <Button
                  className={styles.shortcutKeys}
                  variant="ghost"
                  type="button"
                  aria-label={t("settings.shortcutEditLabel", { name: shortcut.label })}
                  onClick={() => setRecording(shortcut.id)}
                >
                  <span className={styles.shortcutKeySet} data-recording={recording === shortcut.id || undefined}>
                    {recording === shortcut.id
                      ? t("settings.shortcutRecording")
                      : shortcutKeys[shortcut.id]?.length
                        ? shortcutKeys[shortcut.id].map((key) => <kbd className={styles.shortcutKey} key={key}>{key}</kbd>)
                        : t("settings.shortcutUnset")}
                  </span>
                  <span className={styles.shortcutEditHint}>{t("settings.shortcutClickEdit")}</span>
                </Button>
                {recording === shortcut.id ? null : (
                  <Button
                    className={styles.shortcutRemove}
                    variant="ghost"
                    size="icon-xs"
                    type="button"
                    aria-label={t("settings.shortcutClearLabel", { name: shortcut.label })}
                    onClick={() => {
                      setShortcutKeys((current) => ({ ...current, [shortcut.id]: [] }))
                      setRecording(null)
                      setReset(false)
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.shortcutResetRow}>
          {reset ? <span className={styles.savedBadge} role="status" aria-label={t("settings.saved")}>{t("settings.saved")}</span> : null}
          <Button className={styles.shortcutReset} variant="outline" type="button" onClick={() => {
            setShortcutKeys(defaultKeys)
            setRecording(null)
            setReset(true)
          }}>{t("settings.shortcutReset")}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
