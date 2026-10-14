"use client"
import { useState } from "react"
import { useT, useLocale } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useAccountSessions } from "../use-account-sessions"
import styles from "./settings-sections.module.css"
export function AccountDevicesDialog({ open, onOpenChange, preview = false, readBoundary }: { open: boolean; onOpenChange: (open: boolean) => void; preview?: boolean; readBoundary?: ProjectReadBoundary }) {
  const t = useT(); const { locale } = useLocale()
  const state = useAccountSessions(open, preview, readBoundary)
  const [confirm, setConfirm] = useState<{ id: string; scope: string } | null>(null)
  const scope = JSON.stringify([readBoundary?.subject, readBoundary?.generation, open, readBoundary?.admitted])
  if (confirm !== null && confirm.scope !== scope) setConfirm(null)
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  const selected = confirm?.scope === scope && state.others.some((item) => item.session_id === confirm.id) ? confirm.id : null
  return <Dialog open={open} onOpenChange={(value) => { setConfirm(null); onOpenChange(value) }}><DialogContent className={styles.devicesDialog}>
    <DialogTitle>{t("settings.devices.title")}</DialogTitle><DialogDescription>{t("settings.devices.description")}</DialogDescription>
    {!state.admitted ? <p role="status">{t("settings.devices.unavailable")}</p> : <>
      {state.phase === "loading" ? <p role="status">{t("settings.devices.loading")}</p> : null}
      {state.phase === "error" ? <p role="alert">{t(state.current ? "settings.devices.partial" : "settings.devices.error")}</p> : null}
      {state.notice ? <p role={state.notice === "unknown" ? "alert" : "status"}>{t(state.notice === "removed" ? "settings.devices.removed" : state.notice === "rejected" ? "settings.devices.rejected" : state.notice === "conflict" ? "settings.devices.conflict" : state.notice === "notFound" ? "settings.devices.notFound" : state.notice === "forbidden" ? "settings.devices.forbidden" : "settings.devices.unknownResult")}</p> : null}
      {state.current ? <section className={styles.deviceRow}><strong>{t("settings.devices.current")}</strong><span>{t("settings.devices.unknownDevice")}</span><span>{t("settings.devices.created")} {date(state.current.created_at)}</span><span>{t("settings.devices.expires")} {date(state.current.expires_at)}</span></section> : null}
      {state.phase === "ready" && state.others.length === 0 ? <p>{t("settings.devices.empty")}</p> : null}
      {state.others.map((item) => <section className={styles.deviceRow} key={item.session_id}><strong>{t("settings.devices.other")}</strong><span>{t("settings.devices.unknownDevice")}</span><span>{t("settings.devices.created")} {date(item.created_at)}</span><span>{t("settings.devices.expires")} {date(item.expires_at)}</span>
        {selected === item.session_id ? <div><p>{t("settings.devices.confirm")}</p><Button disabled={state.pending || state.reconciliationRequired} onClick={() => { setConfirm(null); void state.remove(item.session_id) }}>{t("settings.devices.confirmRemove")}</Button><Button variant="outline" onClick={() => setConfirm(null)}>{t("settings.devices.cancel")}</Button></div> : <Button variant="outline" disabled={state.pending || state.phase === "loading" || state.reconciliationRequired} onClick={() => setConfirm({ id: item.session_id, scope })}>{t("settings.devices.remove")}</Button>}
      </section>)}
      {state.cursor ? <Button disabled={state.pending} onClick={state.more}>{t("settings.devices.more")}</Button> : null}
      <Button variant="outline" disabled={state.pending || state.phase === "loading"} onClick={() => { setConfirm(null); state.reload() }}>{t("settings.devices.reload")}</Button>
    </>}
  </DialogContent></Dialog>
}
