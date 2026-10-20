"use client"
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { readCommunicationPreferences, serverCommunicationPreferences, subscribeCommunicationPreferences, writeCommunicationPreferences, type CommunicationPreference } from "@/ui/notifications/communication-preferences"
import { browserNotificationsSupported, enableBrowserNotifications } from "@/ui/notifications/task-browser-notification"
import { completionSoundState, completionSoundSupported, retireCompletionSound, subscribeCompletionSound, unlockCompletionSound } from "@/ui/notifications/task-completion-sound"
import styles from "./settings-sections.module.css"

type Props = { preview?: boolean; readBoundary?: ProjectReadBoundary }
const subscribeCapabilities = () => () => {}
export function CommunicationPreferencesSection({ preview = false, readBoundary }: Props) {
  const subject = !preview && readBoundary?.admitted ? readBoundary.subject : null
  const identity = JSON.stringify([subject, readBoundary?.generation ?? 0])
  return <IdentityPreferences key={identity} subject={subject} soundIdentity={JSON.stringify([!preview ? readBoundary?.subject ?? null : null])} />
}
function IdentityPreferences({ subject, soundIdentity }: { subject: string | null; soundIdentity: string }) {
  const t = useT()
  const live = useRef(true)
  const pending = useRef(false)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const preferences = useSyncExternalStore((listener) => subscribeCommunicationPreferences(subject, listener), () => readCommunicationPreferences(subject), serverCommunicationPreferences)
  const capabilities = useSyncExternalStore(subscribeCapabilities, () => (browserNotificationsSupported() ? 1 : 0) + (completionSoundSupported() ? 2 : 0), () => 0)
  const soundState = useSyncExternalStore(subscribeCompletionSound, () => completionSoundState(soundIdentity), () => "locked")
  const [feedback, setFeedback] = useState<"saved" | "saveFailed" | "permissionFailed" | "soundFailed" | null>(null)
  const [busy, setBusy] = useState(false)
  async function setPreference(preference: CommunicationPreference, checked: boolean) {
    if (!subject || pending.current || preference === "product_updates" || preference === "brand_ads") return
    pending.current = true; setBusy(true); setFeedback(null)
    let allowed = true
    if (checked && preference === "browser_notifications") allowed = await enableBrowserNotifications()
    if (checked && preference === "sound_notifications") allowed = await unlockCompletionSound(soundIdentity, () => live.current)
    if (!live.current) return
    pending.current = false; setBusy(false)
    if (!allowed) { setFeedback(preference === "browser_notifications" ? "permissionFailed" : "soundFailed"); return }
    const saved = writeCommunicationPreferences({ ...readCommunicationPreferences(subject), [preference]: checked }, subject)
    if (preference === "sound_notifications" && (!saved || !checked)) retireCompletionSound(soundIdentity)
    setFeedback(saved ? "saved" : "saveFailed")
  }
  async function unlockSound() {
    if (!subject || pending.current) return
    pending.current = true; setBusy(true)
    const unlocked = await unlockCompletionSound(soundIdentity, () => live.current)
    if (!live.current) return
    pending.current = false; setBusy(false); setFeedback(unlocked ? null : "soundFailed")
  }
  const rows = [
    { id: "browser_notifications", title: "settings.browserNotifications", hint: capabilities & 1 ? "settings.communicationPageOnly" : "settings.communicationUnsupported", disabled: !subject || !(capabilities & 1) },
    { id: "sound_notifications", title: "settings.soundNotifications", hint: capabilities & 2 ? "settings.soundNotificationsHint" : "settings.communicationUnsupported", disabled: !subject || !(capabilities & 2) },
    { id: "product_updates", title: "settings.productUpdates", hint: "settings.communicationUnavailable", disabled: true },
    { id: "brand_ads", title: "settings.brandAds", hint: "settings.communicationUnavailable", disabled: true },
  ] as const
  return <section className={styles.notificationSection} aria-labelledby="settings-notifications-heading">
    <h3 id="settings-notifications-heading">{t("settings.notificationsGroup")}</h3>
    {!subject && <p>{t("settings.communicationRequiresIdentity")}</p>}
    {rows.map((row) => <div className={`${styles.notificationRow}${row.id === "brand_ads" ? ` ${styles.notificationAdvertising}` : ""}`} key={row.id}>
      <div><strong>{t(row.title)}</strong><span>{t(row.hint)}</span></div>
      <Switch id={`settings-${row.id}`} aria-label={t(row.title)} checked={preferences[row.id]} disabled={busy || row.disabled} onCheckedChange={(checked) => { void setPreference(row.id, checked) }} />
    </div>)}
    {subject && preferences.sound_notifications && soundState === "locked" && <div className={styles.communicationFeedback}>
      <p>{t("settings.communicationSoundLocked")}</p>
      <Button type="button" variant="outline" size="sm" disabled={busy || !(capabilities & 2)} onClick={() => { void unlockSound() }}>{t("settings.communicationUnlockSound")}</Button>
    </div>}
    {feedback && <p className={styles.communicationFeedback} role={feedback === "saved" ? "status" : "alert"}>{t(`settings.communication.${feedback}`)}</p>}
  </section>
}
