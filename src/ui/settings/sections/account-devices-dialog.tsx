"use client"
import { useLayoutEffect, useRef, useState } from "react"
import { Monitor } from "lucide-react"
import { useT, useLocale } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useAccountSessions } from "../use-account-sessions"
import styles from "./settings-sections.module.css"
export function AccountDevicesDialog({ open, preview = false, readBoundary }: { open: boolean; preview?: boolean; readBoundary?: ProjectReadBoundary }) {
  const t = useT(); const { locale } = useLocale()
  const state = useAccountSessions(open, preview, readBoundary)
  const [confirm, setConfirm] = useState<{ id: string; scope: string } | null>(null)
  const scope = JSON.stringify([readBoundary?.subject, readBoundary?.generation, open, readBoundary?.admitted])
  if (confirm !== null && confirm.scope !== scope) setConfirm(null)
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  const selected = confirm?.scope === scope && state.others.some((item) => item.session_id === confirm.id) ? confirm.id : null
  const cancelButton = useRef<HTMLButtonElement>(null)
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())
  const returnFocus = useRef<{ id: string; scope: string } | null>(null)
  useLayoutEffect(() => {
    const returning = returnFocus.current
    returnFocus.current = null
    if (selected !== null) cancelButton.current?.focus()
    else if (returning?.scope === scope) removeButtons.current.get(returning.id)?.focus()
  }, [selected, scope])
  if (!open) return null
  return <section className={styles.devicesPage} role="region" aria-label={t("settings.devices.title")} aria-busy={state.phase === "loading"}>
    <p className={styles.devicesDescription}>{t("settings.devices.description")}</p>
    {!state.admitted ? <p role="status">{t("settings.devices.unavailable")}</p> : <>
      {state.phase === "loading" ? <p className="sr-only" role="status">{t("settings.devices.loading")}</p> : null}
      {state.phase === "error" ? <p className="sr-only" role="status">{t(state.current ? "settings.devices.partial" : "settings.devices.error")}</p> : null}
      {state.notice ? <p role={state.notice === "unknown" ? "alert" : "status"}>{t(state.notice === "removed" ? "settings.devices.removed" : state.notice === "rejected" ? "settings.devices.rejected" : state.notice === "conflict" ? "settings.devices.conflict" : state.notice === "notFound" ? "settings.devices.notFound" : state.notice === "forbidden" ? "settings.devices.forbidden" : "settings.devices.unknownResult")}</p> : null}
      {state.current ? <section className={styles.deviceGroup} aria-label={t("settings.devices.current")}>
        <h2>{t("settings.devices.current")}</h2>
        <div className={`${styles.deviceRow} ${styles.deviceCurrent}`}>
        <span className={styles.deviceIcon}><Monitor aria-hidden="true" /></span>
        <div className={styles.deviceDetails}><p>{t("settings.devices.unknownDevice")}</p><div className={styles.deviceDates}><span>{t("settings.devices.created")} {date(state.current.created_at)}</span><span>{t("settings.devices.expires")} {date(state.current.expires_at)}</span></div></div>
        </div>
      </section> : null}
      <section className={`${styles.deviceGroup} ${styles.deviceList}`} aria-label={t("settings.devices.other")}>
        <h2>{t("settings.devices.other")}</h2>
        {state.phase === "ready" && state.others.length === 0 ? <p>{t("settings.devices.empty")}</p> : null}
        {state.others.length > 0 ? <div>{state.others.map((item) => <section className={styles.deviceRow} key={item.session_id}>
          <span className={styles.deviceIcon}><Monitor aria-hidden="true" /></span>
          <div className={styles.deviceDetails}><p>{t("settings.devices.unknownDevice")}</p><div className={styles.deviceDates}><span>{t("settings.devices.created")} {date(item.created_at)}</span><span>{t("settings.devices.expires")} {date(item.expires_at)}</span></div></div>
          {selected === item.session_id ? <div className={styles.deviceConfirmation}><p>{t("settings.devices.confirm")}</p><Button disabled={state.pending || state.reconciliationRequired} onClick={() => { setConfirm(null); void state.remove(item.session_id) }}>{t("settings.devices.confirmRemove")}</Button><Button ref={cancelButton} variant="outline" onClick={() => { returnFocus.current = { id: item.session_id, scope }; setConfirm(null) }}>{t("settings.devices.cancel")}</Button></div> : <Button ref={(node) => { if (node) removeButtons.current.set(item.session_id, node); else removeButtons.current.delete(item.session_id) }} className={styles.deviceRemove} variant="outline" disabled={state.pending || state.phase === "loading" || state.reconciliationRequired} onClick={() => setConfirm({ id: item.session_id, scope })}>{t("settings.devices.remove")}</Button>}
        </section>)}</div> : null}
      </section>
      <div className={styles.deviceActions}>{state.cursor ? <Button disabled={state.pending} onClick={state.more}>{t("settings.devices.more")}</Button> : null}
      <Button variant="outline" disabled={state.pending || state.phase === "loading"} onClick={() => { setConfirm(null); state.reload() }}>{t("settings.devices.reload")}</Button></div>
    </>}
  </section>
}
